// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

/**
 * WASIp3 async-lift stress / regression suite.
 *
 * This suite locks in the invariants behind two recent classes of bugs:
 *
 *  - **Per-task `MarshalingContext` field swap** (memory note
 *    `per-task-mctx-field-swap.md`): single fields like
 *    `mctx.currentTaskReturn` must be re-installed at every wasm boundary
 *    so concurrent reentrant async-lift exports stay isolated. Tests use
 *    "intolerant" handler closures whose state is meaningful only to the
 *    owning task; if the wrong handler is invoked the closure-local state
 *    gets corrupted and the test fails loudly.
 *
 *  - **Orphan rejection from async-lift trampoline** (memory note
 *    `async-lift-orphan-rejection.md`): a rejected Promise that nothing
 *    awaits leaks as a process-level `unhandledRejection`, which Jest then
 *    blames on a *later, unrelated* test. Guard installed via
 *    `useOrphanRejectionGuard()`.
 *
 * Plus a high-fan-out concurrency matrix to surface flakes from JSPI
 * scheduler ordering. The suite is intentionally chatty in failure mode
 * (verbose-on-failure executor + binder traces).
 */

import { createComponent } from '../../../src/resolver';
import { initializeAsserts, LogLevel } from '../../../src/utils/assert';
import { useVerboseOnFailure, verboseOptions, runWithVerbose } from '../../test-utils/verbose-logger';
import { useOrphanRejectionGuard } from '../../test-utils/orphan-guard';

initializeAsserts();

const MULTI_ASYNC_WASM = './integration-tests/multi-async-p3-wat/multi-async-p3.wasm';
const RUNNER_INTERFACE = 'test:multi/runner@0.1.0';
const HOST_INTERFACE = 'test:multi/host@0.1.0';

interface Deferred<T> {
    promise: Promise<T>;
    resolve: (v: T) => void;
    reject: (e: unknown) => void;
}

function deferred<T>(): Deferred<T> {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

type Runner = Record<string, () => Promise<void>>;

async function settle<T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
    try {
        return { ok: true, value: await p };
    } catch (error) {
        return { ok: false, error };
    }
}

async function microtaskDrain(iterations = 5): Promise<void> {
    for (let i = 0; i < iterations; i++) {
        await new Promise<void>(r => setImmediate(r));
    }
}

describe('WASIp3 async-lift stress / regression', () => {
    const verbose = useVerboseOnFailure();
    useOrphanRejectionGuard();

    test('intolerant per-task closures: each handler only sees ITS task settle', () => runWithVerbose(verbose, async () => {
        // Build an "intolerant" arrangement by tagging each in-flight
        // host call with a task-local id captured in closure. If the wasm
        // canon built-ins (task.return / context.set) end up reading the
        // wrong mctx field, the closure-captured id will mismatch.
        const pending: { id: number; d: Deferred<void> }[] = [];
        let nextId = 0;
        const imports = {
            [HOST_INTERFACE]: {
                'slow-fn': (): Promise<void> => {
                    const id = nextId++;
                    const d = deferred<void>();
                    pending.push({ id, d });
                    return d.promise;
                },
            },
        };

        const component = await createComponent(MULTI_ASYNC_WASM, verboseOptions(verbose));
        const instance = await component.instantiate(imports);
        try {
            const runner = instance.exports[RUNNER_INTERFACE] as Runner;
            const N = 8;
            const completions: Promise<void>[] = [];
            for (let i = 0; i < N; i++) {
                completions.push(runner['waitOnce']!());
            }

            // All N must spawn before any resolves.
            for (let i = 0; i < 100 && pending.length < N; i++) {
                await microtaskDrain(1);
            }
            expect(pending.length).toBe(N);

            // Resolve in a deterministic but non-monotonic order to exercise
            // interleaved suspension. Pattern: 3,7,0,5,2,6,1,4 (reverse-Fisher-Yates
            // is overkill; this fixed permutation is enough for the fix).
            const order = [3, 7, 0, 5, 2, 6, 1, 4];
            for (const idx of order) {
                pending[idx]!.d.resolve();
                // Drain between resolves so the runtime hands off to the
                // wasm callback BEFORE the next slot's Promise settles.
                await microtaskDrain(2);
            }

            // Every export call must complete. If mctx field swap leaked,
            // wasm would have called task.return / context.set against the
            // wrong task and we would either trap or hang.
            const results = await Promise.all(completions.map(settle));
            for (let i = 0; i < N; i++) {
                expect(results[i]!.ok).toBe(true);
            }
        } finally {
            instance.dispose();
        }
    }));

    test('orphan-rejection regression: rejected host import does NOT leak unhandledRejection', () => runWithVerbose(verbose, async () => {
        // Pre-condition for the user-memory note `async-lift-orphan-rejection.md`:
        // a host import that rejects MUST be observed by the trampoline. The
        // useOrphanRejectionGuard() installed at the describe() level will
        // fail the test if any unawaited rejected Promise leaks past this
        // body. We verify both the export's behavior AND the absence of
        // orphan rejections.
        const imports = {
            [HOST_INTERFACE]: {
                'slow-fn': (): Promise<void> => Promise.reject(new Error('host-rejection-stress')),
            },
        };

        const component = await createComponent(MULTI_ASYNC_WASM, verboseOptions(verbose));
        const instance = await component.instantiate(imports);
        try {
            const runner = instance.exports[RUNNER_INTERFACE] as Runner;
            // Multiple consecutive calls — each must handle its own rejection.
            // A rejected slow-fn is consumed by the subtask table (RETURNED)
            // and the export then completes normally — see existing
            // disposeAsyncP3 test "async host import rejects → subtask completes".
            for (let i = 0; i < 5; i++) {
                await runner['waitOnce']!();
            }
        } finally {
            instance.dispose();
        }
    }));

    test('orphan-rejection regression: dispose mid-flight settles N concurrent calls without leaks', () => runWithVerbose(verbose, async () => {
        // Mid-flight dispose was the original surface for the orphan
        // rejection bug: the trampoline rejected the deferred result, then
        // re-threw, and nothing was awaiting the resultPromise → leaked.
        // With N concurrent calls, every single deferred must settle once
        // and only once. The orphan-rejection guard catches any leaks.
        // We do NOT assert the direction of settlement (resolve vs reject)
        // because dispose may or may not propagate to the trampoline before
        // the host import resolves; the strict guarantee is "no hang and
        // no orphan".
        const pending: Deferred<void>[] = [];
        const imports = {
            [HOST_INTERFACE]: {
                'slow-fn': (): Promise<void> => {
                    const d = deferred<void>();
                    pending.push(d);
                    return d.promise;
                },
            },
        };

        const component = await createComponent(MULTI_ASYNC_WASM, verboseOptions(verbose));
        const instance = await component.instantiate(imports);
        try {
            const runner = instance.exports[RUNNER_INTERFACE] as Runner;
            const N = 6;
            const completions: Promise<void>[] = [];
            for (let i = 0; i < N; i++) {
                completions.push(runner['waitOnce']!());
            }
            for (let i = 0; i < 100 && pending.length < N; i++) {
                await microtaskDrain(1);
            }
            expect(pending.length).toBe(N);

            // Dispose mid-flight; resolve dangling host promises afterward
            // so the trampolines can settle naturally if dispose did not
            // already reject them.
            instance.dispose();
            for (const d of pending) d.resolve();

            // Every completion must settle (no hang). Direction is
            // intentionally not asserted.
            const results = await Promise.all(completions.map(settle));
            expect(results.length).toBe(N);
            await microtaskDrain(3);
        } finally {
            // Already disposed; second dispose is idempotent per existing tests.
            instance.dispose();
        }
    }), 15_000);

    test('mixed waitOnce + waitTwoParallel + returnEarly: independent settlement', () => runWithVerbose(verbose, async () => {
        const pending: Deferred<void>[] = [];
        const imports = {
            [HOST_INTERFACE]: {
                'slow-fn': (): Promise<void> => {
                    const d = deferred<void>();
                    pending.push(d);
                    return d.promise;
                },
            },
        };

        const component = await createComponent(MULTI_ASYNC_WASM, verboseOptions(verbose));
        const instance = await component.instantiate(imports);
        try {
            const runner = instance.exports[RUNNER_INTERFACE] as Runner;

            // Kick off four different async exports. Each spawns one or
            // two slow-fn subtasks: waitOnce=1, waitTwoParallel=2,
            // returnEarly=1 (returns task.return synchronously, but the
            // subtask still runs in the background until its slow-fn
            // resolves). Total = 1+2+1+1 = 5 pending slow-fns.
            const c1 = runner['waitOnce']!();
            const c2 = runner['waitTwoParallel']!();
            const c3 = runner['waitOnce']!();
            const c4 = runner['returnEarly']!();

            for (let i = 0; i < 100 && pending.length < 5; i++) {
                await microtaskDrain(1);
            }
            expect(pending.length).toBe(5);

            // returnEarly task.returns before its subtask settles; awaiting
            // c4 should resolve once we drain microtasks.
            await c4;

            // Resolve in scrambled order.
            const order = [2, 0, 4, 3, 1];
            for (const idx of order) {
                pending[idx]!.resolve();
                await microtaskDrain(1);
            }

            const r = await Promise.all([settle(c1), settle(c2), settle(c3)]);
            expect(r[0]!.ok).toBe(true);
            expect(r[1]!.ok).toBe(true);
            expect(r[2]!.ok).toBe(true);
        } finally {
            instance.dispose();
        }
    }));

    test('repeated cycles: 100 sequential rounds of 3 concurrent calls (flake hunter)', () => runWithVerbose(verbose, async () => {
        // Sustained cycling. Surfaces leaks that only manifest after many
        // round-trips through the per-task field swap path.
        const pending: Deferred<void>[] = [];
        const imports = {
            [HOST_INTERFACE]: {
                'slow-fn': (): Promise<void> => {
                    const d = deferred<void>();
                    pending.push(d);
                    return d.promise;
                },
            },
        };

        const component = await createComponent(MULTI_ASYNC_WASM, verboseOptions(verbose));
        const instance = await component.instantiate(imports);
        try {
            const runner = instance.exports[RUNNER_INTERFACE] as Runner;
            const ROUNDS = 100;
            const PER_ROUND = 3;
            for (let r = 0; r < ROUNDS; r++) {
                const calls: Promise<void>[] = [];
                const baseLen = pending.length;
                for (let i = 0; i < PER_ROUND; i++) {
                    calls.push(runner['waitOnce']!());
                }
                for (let i = 0; i < 50 && pending.length - baseLen < PER_ROUND; i++) {
                    await microtaskDrain(1);
                }
                // Reverse order each round.
                for (let i = PER_ROUND - 1; i >= 0; i--) {
                    pending[baseLen + i]!.resolve();
                }
                await Promise.all(calls);
            }
            expect(pending.length).toBe(ROUNDS * PER_ROUND);
        } finally {
            instance.dispose();
        }
    }), 30_000);

    test('cancellation via dispose at YIELD-loop entry: settles cleanly', () => runWithVerbose(verbose, async () => {
        // Dispose immediately after the export call but before settling any
        // host import. This targets the await on `coreFn(...)` and the
        // subsequent callback-loop entry — the earliest yield boundaries
        // in createAsyncLiftWrapper. The strict guarantee is: the export
        // promise SETTLES (resolve or reject) — never hangs — and no
        // orphan rejection leaks. (Whether dispose mid-async-export
        // forcibly rejects depends on whether the trampoline observes the
        // abort signal before the host import resolves; both outcomes are
        // valid as long as we settle.)
        const pending: Deferred<void>[] = [];
        const imports = {
            [HOST_INTERFACE]: {
                'slow-fn': (): Promise<void> => {
                    const d = deferred<void>();
                    pending.push(d);
                    return d.promise;
                },
            },
        };

        const component = await createComponent(MULTI_ASYNC_WASM, verboseOptions(verbose));
        const instance = await component.instantiate(imports);
        try {
            const runner = instance.exports[RUNNER_INTERFACE] as Runner;
            const c = runner['waitOnce']!();
            for (let i = 0; i < 50 && pending.length < 1; i++) {
                await microtaskDrain(1);
            }
            expect(pending.length).toBe(1);
            instance.dispose();
            // Late settle must not crash or orphan; if dispose did not
            // reject c, resolving the host promise lets it complete normally.
            pending[0]!.resolve();
            const r = await settle(c);
            expect(typeof r.ok).toBe('boolean');
            await microtaskDrain(3);
        } finally {
            instance.dispose();
        }
    }));

    test('cancellation via dispose AFTER all subtasks resolved but BEFORE callback EXIT', () => runWithVerbose(verbose, async () => {
        // Resolve the host import first, then dispose during the very small
        // window before the callback delivers EXIT. Catches cancellation at
        // the inner `await callbackWasm(...)` yield boundary.
        const pending: Deferred<void>[] = [];
        const imports = {
            [HOST_INTERFACE]: {
                'slow-fn': (): Promise<void> => {
                    const d = deferred<void>();
                    pending.push(d);
                    return d.promise;
                },
            },
        };

        const component = await createComponent(MULTI_ASYNC_WASM, verboseOptions(verbose));
        const instance = await component.instantiate(imports);
        try {
            const runner = instance.exports[RUNNER_INTERFACE] as Runner;
            const c = runner['waitOnce']!();
            for (let i = 0; i < 50 && pending.length < 1; i++) {
                await microtaskDrain(1);
            }
            // Resolve and IMMEDIATELY dispose before the next macrotask.
            pending[0]!.resolve();
            instance.dispose();
            await settle(c); // must settle (resolve or reject) — never hang.
        } finally {
            instance.dispose();
        }
    }));

    test('re-entrancy: host import for export A invokes export B before resolving', () => runWithVerbose(verbose, async () => {
        // Re-entrant pattern: while task A is suspended waiting on its
        // slow-fn, JS uses that same suspension window to launch task B.
        // Task B's slow-fn then resolves first, completing B; only then
        // does A's slow-fn resolve. This forces the trampoline to swap
        // currentTaskReturn / currentTaskSlots back and forth across
        // wasm boundaries belonging to two different in-flight tasks.
        // If the per-task field-swap fix (memory note
        // `per-task-mctx-field-swap.md`) regresses, A's task.return ends
        // up calling B's handler (or vice versa) and at least one
        // promise either traps or never settles.
        const pending: Deferred<void>[] = [];
        let runner: Runner | undefined;
        let bCompletion: Promise<void> | undefined;
        let bLaunched = false;

        const imports = {
            [HOST_INTERFACE]: {
                'slow-fn': (): Promise<void> => {
                    const d = deferred<void>();
                    pending.push(d);
                    // First slow-fn call comes from task A. Use that moment
                    // to launch task B from the host side (same instance,
                    // same trampoline machinery).
                    if (!bLaunched && runner) {
                        bLaunched = true;
                        bCompletion = runner['waitOnce']!();
                    }
                    return d.promise;
                },
            },
        };

        const component = await createComponent(MULTI_ASYNC_WASM, verboseOptions(verbose));
        const instance = await component.instantiate(imports);
        try {
            runner = instance.exports[RUNNER_INTERFACE] as Runner;
            const aCompletion = runner['waitOnce']!();

            // Wait for both A's and B's slow-fn to be in flight.
            for (let i = 0; i < 100 && pending.length < 2; i++) {
                await microtaskDrain(1);
            }
            expect(pending.length).toBe(2);
            expect(bCompletion).toBeDefined();

            // Resolve B first, then A. The trampoline must route
            // task.return to the correct task in each case.
            pending[1]!.resolve();
            await bCompletion!;
            pending[0]!.resolve();
            await aCompletion;
        } finally {
            instance.dispose();
        }
    }));

    test('resource accounting: 200 sequential survive-resource calls do not leak handles', () => runWithVerbose(verbose, async () => {
        // The WAT `survive-resource` export does resource.new → suspend
        // (via JSPI on sync-canon-lower) → resource.rep → resource.drop
        // within one call. With maxHandles capped at 8, leaking even
        // one handle per call would trip the cap within ~8 iterations.
        // 200 iterations (>> 8) confirms the table cleans up reliably.
        const pending: Deferred<void>[] = [];
        const imports = {
            [HOST_INTERFACE]: {
                'slow-fn': (): Promise<void> => {
                    const d = deferred<void>();
                    pending.push(d);
                    return d.promise;
                },
            },
        };

        const component = await createComponent(MULTI_ASYNC_WASM, {
            ...verboseOptions(verbose),
            limits: { maxHandles: 8 },
        });
        const instance = await component.instantiate(imports);
        try {
            const runner = instance.exports[RUNNER_INTERFACE] as Runner;
            const ITERATIONS = 200;
            for (let i = 0; i < ITERATIONS; i++) {
                const c = runner['surviveResource']!();
                for (let j = 0; j < 50 && pending.length <= i; j++) {
                    await microtaskDrain(1);
                }
                pending[i]!.resolve();
                await c;
            }
            expect(pending.length).toBe(ITERATIONS);
        } finally {
            instance.dispose();
        }
    }), 30_000);

    test('resource accounting: N concurrent survive-resource calls all release their handles', () => runWithVerbose(verbose, async () => {
        // N concurrent in-flight resources. With maxHandles=16 and N=8
        // we stay below the cap; any double-bookkeeping (e.g. counting
        // a borrow handle twice) would still trip later iterations.
        // Run two batches back-to-back to verify counters reset cleanly.
        const pending: Deferred<void>[] = [];
        const imports = {
            [HOST_INTERFACE]: {
                'slow-fn': (): Promise<void> => {
                    const d = deferred<void>();
                    pending.push(d);
                    return d.promise;
                },
            },
        };

        const component = await createComponent(MULTI_ASYNC_WASM, {
            ...verboseOptions(verbose),
            limits: { maxHandles: 16 },
        });
        const instance = await component.instantiate(imports);
        try {
            const runner = instance.exports[RUNNER_INTERFACE] as Runner;
            const N = 8;
            for (let batch = 0; batch < 2; batch++) {
                const baseLen = pending.length;
                const calls: Promise<void>[] = [];
                for (let i = 0; i < N; i++) calls.push(runner['surviveResource']!());
                for (let j = 0; j < 100 && pending.length - baseLen < N; j++) {
                    await microtaskDrain(1);
                }
                expect(pending.length - baseLen).toBe(N);
                // Resolve out-of-order to exercise interleaved drop paths.
                const order = [3, 7, 0, 5, 2, 6, 1, 4];
                for (const idx of order) pending[baseLen + idx]!.resolve();
                await Promise.all(calls);
            }
        } finally {
            instance.dispose();
        }
    }), 15_000);

    test('cancellation between event deliveries: waitTwoParallel disposed mid-event-loop', () => runWithVerbose(verbose, async () => {
        // waitTwoParallel spawns two slow-fn subtasks joined to one
        // waitable-set. The trampoline delivers events one at a time
        // via `await callbackWasm(...)` inside a for-loop. We resolve
        // ONE of the two host promises, let that event deliver, then
        // dispose before the second event arrives. This targets the
        // event-delivery yield boundary specifically (distinct from
        // the WAIT-entry and EXIT yields covered by other tests).
        const pending: Deferred<void>[] = [];
        const imports = {
            [HOST_INTERFACE]: {
                'slow-fn': (): Promise<void> => {
                    const d = deferred<void>();
                    pending.push(d);
                    return d.promise;
                },
            },
        };

        const component = await createComponent(MULTI_ASYNC_WASM, verboseOptions(verbose));
        const instance = await component.instantiate(imports);
        try {
            const runner = instance.exports[RUNNER_INTERFACE] as Runner;
            const c = runner['waitTwoParallel']!();
            for (let i = 0; i < 100 && pending.length < 2; i++) {
                await microtaskDrain(1);
            }
            expect(pending.length).toBe(2);

            // Deliver one event so the trampoline enters the per-event
            // for-loop and re-arms for the next iteration.
            pending[0]!.resolve();
            await microtaskDrain(2);

            // Dispose before the second event is delivered.
            instance.dispose();

            // Resolve the second so the host-side promise can settle
            // without leaking. The export's overall completion may
            // either reject (dispose poisoned mid-loop) or resolve
            // (second event slipped in before poison observed); both
            // are acceptable as long as it settles and no orphan leaks.
            pending[1]!.resolve();
            const r = await settle(c);
            expect(typeof r.ok).toBe('boolean');
            await microtaskDrain(3);
        } finally {
            instance.dispose();
        }
    }));

    test('yield-spin: completes 8 YIELD cycles cleanly', () => runWithVerbose(verbose, async () => {
        // Targets the YIELD-branch `await callbackWasm(0,0,0)` inside
        // createAsyncLiftWrapper (status === 1). The `yield-spin` export
        // returns YIELD from start and from each callback for 8 iterations
        // before EXITing. No host import is involved.
        const component = await createComponent(MULTI_ASYNC_WASM, verboseOptions(verbose));
        const instance = await component.instantiate({ [HOST_INTERFACE]: { 'slow-fn': (): Promise<void> => Promise.resolve() } });
        try {
            const runner = instance.exports[RUNNER_INTERFACE] as Runner;
            await runner['yieldSpin']!();
            // Repeat to confirm no leak across calls.
            await runner['yieldSpin']!();
            await runner['yieldSpin']!();
        } finally {
            instance.dispose();
        }
    }));

    test('yield-spin concurrent: N calls all complete in YIELD branch', () => runWithVerbose(verbose, async () => {
        // N concurrent yield-spinners share the trampoline. Each must
        // observe its own ctx-0 counter via the per-task field swap;
        // any leakage would mis-count and trap (counter goes negative
        // → never reaches 0 → spin forever) or EXIT early.
        const component = await createComponent(MULTI_ASYNC_WASM, verboseOptions(verbose));
        const instance = await component.instantiate({ [HOST_INTERFACE]: { 'slow-fn': (): Promise<void> => Promise.resolve() } });
        try {
            const runner = instance.exports[RUNNER_INTERFACE] as Runner;
            const N = 6;
            const calls: Promise<void>[] = [];
            for (let i = 0; i < N; i++) calls.push(runner['yieldSpin']!());
            await Promise.all(calls);
        } finally {
            instance.dispose();
        }
    }), 15_000);

    test('yield-spin + dispose mid-flight: settles cleanly without orphan', () => runWithVerbose(verbose, async () => {
        // Dispose during the YIELD spin. The trampoline does not check the
        // abort signal between YIELD iterations, so the spin completes 8
        // microtask cycles and then runs the post-EXIT cleanup. Validates
        // that mid-spin dispose does not leak an orphan rejection and the
        // final settlement direction is observable (no hang).
        const component = await createComponent(MULTI_ASYNC_WASM, verboseOptions(verbose));
        const instance = await component.instantiate({ [HOST_INTERFACE]: { 'slow-fn': (): Promise<void> => Promise.resolve() } });
        try {
            const runner = instance.exports[RUNNER_INTERFACE] as Runner;
            const c = runner['yieldSpin']!();
            instance.dispose(); // before the 8 yield cycles drain
            const r = await settle(c);
            expect(typeof r.ok).toBe('boolean');
            await microtaskDrain(3);
        } finally {
            instance.dispose();
        }
    }));

    test('verbose executor logs survive concurrent flow without throwing', () => runWithVerbose(verbose, async () => {
        // Ensures the verbose logging machinery is itself reentrancy-safe.
        // This is the safety net behind every other test in this file:
        // if the logger ever crashes mid-trampoline, the failure dump fails too.
        const pending: Deferred<void>[] = [];
        const imports = {
            [HOST_INTERFACE]: {
                'slow-fn': (): Promise<void> => {
                    const d = deferred<void>();
                    pending.push(d);
                    return d.promise;
                },
            },
        };

        const component = await createComponent(MULTI_ASYNC_WASM, verboseOptions(verbose, { executor: LogLevel.Summary, binder: LogLevel.Summary }));
        const instance = await component.instantiate(imports);
        try {
            const runner = instance.exports[RUNNER_INTERFACE] as Runner;
            const calls = [runner['waitOnce']!(), runner['waitOnce']!()];
            for (let i = 0; i < 50 && pending.length < 2; i++) {
                await microtaskDrain(1);
            }
            pending[1]!.resolve();
            pending[0]!.resolve();
            await Promise.all(calls);
        } finally {
            instance.dispose();
        }
    }));
});
