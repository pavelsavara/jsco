// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

/**
 * JSPI + Parallel scenarios — interleaved JSPI-suspending host calls with
 * multiple concurrent guest tasks on a single component instance.
 *
 * Per proposals.md "JSPI + Parallel" matrix (P1–P12). This file covers the
 * highest-priority three:
 *
 *  - **P1** — One JSPI-suspending host call, N concurrent JS-side invocations
 *    queued behind it. All N proceed after the suspend resolves.
 *  - **P2** — N concurrent handlers each making one JSPI-suspending host
 *    call (fan-out). Suspends interleave; per-task ctx + waitable-set
 *    isolation across suspend boundaries.
 *  - **P10** — Re-invocation during a still-suspended call. Per-task ctx slot,
 *    per-task waitable-set, partitioned subtask handles.
 *
 * Acceptance criteria asserted for each scenario (per proposals.md):
 *   1. Functional assertion (all completions resolve).
 *   2. No `unhandledRejection` / `uncaughtException`.
 *   3. JS event-loop liveness: `setImmediate` ticks > 0 during every suspend.
 *
 * Resource handle leak verification (criterion #2 in proposals) is implicit:
 * `instance.dispose()` must not throw, and re-using the same instance across
 * multiple rounds (covered by P10) implicitly verifies tables drain.
 *
 * Why JSPI applies here without explicit setup: jsco's `createJspiWrappers`
 * (in `src/resolver/context.ts`) automatically wraps every host import in
 * `WebAssembly.Suspending` when JSPI is available. The slow-fn host import
 * in `multi-async-p3-wat` returns deferred Promises — the canonical
 * controllable JSPI-suspending host import the proposal calls for.
 */

import { createComponent } from '../../../src/resolver';
import { initializeAsserts } from '../../../src/utils/assert';
import { useVerboseOnFailure, verboseOptions, runWithVerbose } from '../../test-utils/verbose-logger';

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

/** Captures process-level unhandled rejections + uncaught exceptions. */
interface ErrorWatch {
    rejections: unknown[];
    exceptions: unknown[];
    stop(): void;
}
function watchProcessErrors(): ErrorWatch {
    const rejections: unknown[] = [];
    const exceptions: unknown[] = [];
    const onRejection = (reason: unknown): void => { rejections.push(reason); };
    const onException = (err: unknown): void => { exceptions.push(err); };
    process.on('unhandledRejection', onRejection);
    process.on('uncaughtException', onException);
    return {
        rejections,
        exceptions,
        stop(): void {
            process.off('unhandledRejection', onRejection);
            process.off('uncaughtException', onException);
        },
    };
}

/**
 * Runs a `setImmediate` watchdog that increments a counter on every JS
 * event-loop tick. Returns a stop function that yields the final tick count.
 *
 * If the WASM thread were monopolized (no JSPI suspends, no microtask yields),
 * the watchdog would tick 0 or 1 times. A healthy multi-task suspend should
 * yield many ticks.
 */
function startWatchdog(): { stop: () => number } {
    let ticks = 0;
    let stopped = false;
    const tick = (): void => {
        if (stopped) return;
        ticks++;
        setImmediate(tick);
    };
    setImmediate(tick);
    return {
        stop(): number {
            stopped = true;
            return ticks;
        },
    };
}

/** Drains the microtask queue + a fresh setImmediate tick a few times. */
async function drain(iters = 10): Promise<void> {
    for (let i = 0; i < iters; i++) {
        await new Promise<void>(r => setImmediate(r));
    }
}

describe('JSPI + Parallel scenarios (P1, P2, P10)', () => {
    const verbose = useVerboseOnFailure();

    /**
     * P1 — One JSPI-suspending host call, N concurrent JS-side invocations
     * queued behind it. The first invocation's `slow-fn` is held suspended
     * while N more invocations are kicked off; only after the first resolves
     * do the rest get serviced.
     *
     * Tests: trampoline accepts new invocations even while a prior one is
     * suspended, and the JS event loop remains responsive throughout.
     */
    test('P1: sequential invocations during suspended call stay responsive', () => runWithVerbose(verbose, async () => {
        const errs = watchProcessErrors();
        const watchdog = startWatchdog();

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
            const runner = instance.exports[RUNNER_INTERFACE] as Record<string, () => Promise<void>>;
            expect(runner).toBeDefined();

            // Step 1: kick off first invocation; wait for its slow-fn to be in flight.
            const c1 = runner['waitOnce']!();
            await drain();
            expect(pending.length).toBe(1);

            // Step 2: kick off N=4 more BEFORE resolving #1. They must each
            // enter the guest and create their own slow-fn subtask.
            const N = 4;
            const queued: Promise<void>[] = [];
            for (let i = 0; i < N; i++) queued.push(runner['waitOnce']!());
            await drain(20);
            expect(pending.length).toBe(1 + N);

            // Step 3: resolve all in arrival order. Each completion must fire.
            for (const d of pending) d.resolve();
            await c1;
            await Promise.all(queued);
        } finally {
            instance.dispose();
            const ticks = watchdog.stop();
            errs.stop();

            // Acceptance criteria
            expect(errs.rejections).toEqual([]);
            expect(errs.exceptions).toEqual([]);
            expect(ticks).toBeGreaterThan(0);
        }
    }));

    /**
     * P2 — N concurrent handlers each making one JSPI-suspending host call.
     * Fan-out: all N enter the guest in parallel, each suspends on its own
     * `slow-fn`. Verifies per-task ctx slots and per-task waitable-sets do
     * not bleed across suspend boundaries.
     */
    test('P2: N=8 parallel suspending handlers complete out-of-order', () => runWithVerbose(verbose, async () => {
        const errs = watchProcessErrors();
        const watchdog = startWatchdog();

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
            const runner = instance.exports[RUNNER_INTERFACE] as Record<string, () => Promise<void>>;

            const N = 8;
            const handlers: Promise<void>[] = [];
            for (let i = 0; i < N; i++) handlers.push(runner['waitOnce']!());

            // All N must each spawn one slow-fn before any resolves.
            for (let i = 0; i < 50 && pending.length < N; i++) await drain(1);
            expect(pending.length).toBe(N);

            // Resolve in shuffled order to verify per-task isolation.
            const order = [3, 7, 0, 5, 1, 6, 2, 4];
            for (const i of order) pending[i]!.resolve();

            await Promise.all(handlers);
        } finally {
            instance.dispose();
            const ticks = watchdog.stop();
            errs.stop();

            expect(errs.rejections).toEqual([]);
            expect(errs.exceptions).toEqual([]);
            expect(ticks).toBeGreaterThan(0);
        }
    }));

    /**
     * P10 — Re-invocation during a still-suspended call. Three rounds of
     * staggered invocation interleave with resolutions. The same instance
     * must keep tables clean across rounds (no growing handle counts).
     *
     * This is the regression guard for per-task ctx slot, per-task
     * waitable-set, partitioned subtask handles, and per-task throttle
     * counters (`mctx.opsSinceYield`).
     */
    test('P10: staggered rounds of suspended + new invocations on one instance', () => runWithVerbose(verbose, async () => {
        const errs = watchProcessErrors();
        const watchdog = startWatchdog();

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
            const runner = instance.exports[RUNNER_INTERFACE] as Record<string, () => Promise<void>>;

            // Round 1: one in flight.
            const c1 = runner['waitOnce']!();
            await drain();
            expect(pending.length).toBe(1);

            // Round 2: two more enter while #1 is suspended.
            const c2 = runner['waitOnce']!();
            const c3 = runner['waitOnce']!();
            await drain();
            expect(pending.length).toBe(3);

            // Resolve middle one first.
            pending[1]!.resolve();
            await c2;

            // Round 3: two MORE enter while #1, #3 still suspended.
            const c4 = runner['waitOnce']!();
            const c5 = runner['waitOnce']!();
            await drain();
            expect(pending.length).toBe(5);

            // Resolve remaining in reverse-of-arrival to maximize interleaving.
            pending[4]!.resolve();
            pending[2]!.resolve();
            pending[3]!.resolve();
            pending[0]!.resolve();

            await Promise.all([c1, c3, c4, c5]);

            // Round 4 — verify the instance is still healthy after the
            // interleaved rounds: another invocation succeeds.
            const c6 = runner['waitOnce']!();
            await drain();
            expect(pending.length).toBe(6);
            pending[5]!.resolve();
            await c6;
        } finally {
            instance.dispose();
            const ticks = watchdog.stop();
            errs.stop();

            expect(errs.rejections).toEqual([]);
            expect(errs.exceptions).toEqual([]);
            expect(ticks).toBeGreaterThan(0);
        }
    }));

    /**
     * P2-variant — wait-two-parallel under JSPI: a single guest task issues
     * two suspending host calls joined to one waitable-set. The host
     * resolves them out-of-order. Tests that per-instance waitable.join +
     * waitable-set callback delivery work across two JSPI suspend boundaries
     * within a single guest task.
     */
    test('P2b: two-subtask waitable-set with out-of-order JSPI resolution', () => runWithVerbose(verbose, async () => {
        const errs = watchProcessErrors();
        const watchdog = startWatchdog();

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
            const runner = instance.exports[RUNNER_INTERFACE] as Record<string, () => Promise<void>>;

            const completion = runner['waitTwoParallel']!();
            await drain();
            expect(pending.length).toBe(2);

            pending[1]!.resolve();
            await drain();
            pending[0]!.resolve();

            await completion;
        } finally {
            instance.dispose();
            const ticks = watchdog.stop();
            errs.stop();

            expect(errs.rejections).toEqual([]);
            expect(errs.exceptions).toEqual([]);
            expect(ticks).toBeGreaterThan(0);
        }
    }));

    /**
     * P11 — host-import Promise rejection is recoverable, not catastrophic.
     *
     * jsco's lowering trampoline (`handleLowerResult` in
     * `src/marshal/trampoline-lower.ts`) used to call `ctx.abort()` on a
     * rejected host Promise, permanently poisoning the whole component
     * instance for any rejection — even from a void-return import.
     *
     * The rejection is now propagated without aborting:
     *   - Async-lower path: the subtask table transitions to RETURNED (per
     *     `src/runtime/subtask-table.ts`); the rejection is consumed there
     *     and the guest sees a normal subtask completion.
     *   - Sync-lower JSPI path: the rejection surfaces as a regular wasm
     *     trap to the suspended caller, recoverable at the task level.
     *
     * This test exercises the async-lower path: a slow-fn() invocation
     * rejects, the guest task completes cleanly, and the instance stays
     * usable for further calls. None of the rejections may escape as a
     * Node.js process-level unhandledRejection.
     */
    test('P11: rejected host-import Promise does not poison the instance', () => runWithVerbose(verbose, async () => {
        const errs = watchProcessErrors();
        const watchdog = startWatchdog();

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
            const runner = instance.exports[RUNNER_INTERFACE] as Record<string, () => Promise<void>>;

            // Round 1: invoke and reject the host call.
            const c1 = runner['waitOnce']!();
            await drain();
            expect(pending.length).toBe(1);
            pending[0]!.reject(new Error('simulated host I/O failure'));
            await c1; // resolves cleanly: subtask transitions to RETURNED on rejection

            // Round 2: instance must still be usable after a rejected subtask.
            const c2 = runner['waitOnce']!();
            await drain();
            expect(pending.length).toBe(2);
            pending[1]!.resolve();
            await c2;

            // Round 3: mixed — one rejects, one resolves, both delivered.
            const c3 = runner['waitOnce']!();
            const c4 = runner['waitOnce']!();
            await drain();
            expect(pending.length).toBe(4);
            pending[2]!.reject(new Error('another simulated failure'));
            pending[3]!.resolve();
            await Promise.all([c3, c4]);

            // Drain microtasks so any unhandled-rejection detector has a
            // chance to fire before we assert below.
            await drain(20);
        } finally {
            instance.dispose();
            const ticks = watchdog.stop();
            errs.stop();

            expect(errs.rejections).toEqual([]);
            expect(errs.exceptions).toEqual([]);
            expect(ticks).toBeGreaterThan(0);
        }
    }));

    /**
     * P9-lite — table stability under burst load.
     * Fires N=32 concurrent invocations, settles them, then verifies the
     * instance handles another burst of the same size without degradation.
     * This is the externally-observable proxy for "tables drain after
     * every round" since `instance.dispose()` is the only public lifecycle
     * hook — handle-table sizes are not exposed. If subtask/waitable-set
     * tables leaked entries, the second burst would either grow unbounded
     * memory or run into the `maxHandles` cap.
     */
    test('P9-lite: two N=32 bursts on one instance complete cleanly', () => runWithVerbose(verbose, async () => {
        const errs = watchProcessErrors();
        const watchdog = startWatchdog();

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
            const runner = instance.exports[RUNNER_INTERFACE] as Record<string, () => Promise<void>>;

            const N = 32;

            for (let burst = 0; burst < 2; burst++) {
                pending.length = 0;
                const handlers: Promise<void>[] = [];
                for (let i = 0; i < N; i++) handlers.push(runner['waitOnce']!());

                for (let i = 0; i < 100 && pending.length < N; i++) await drain(1);
                expect(pending.length).toBe(N);

                // Resolve in arrival order.
                for (const d of pending) d.resolve();
                await Promise.all(handlers);
            }
        } finally {
            instance.dispose();
            const ticks = watchdog.stop();
            errs.stop();

            expect(errs.rejections).toEqual([]);
            expect(errs.exceptions).toEqual([]);
            expect(ticks).toBeGreaterThan(0);
        }
    }));

    /**
     * P7 — cancellation across suspend via AbortController.
     *
     * Real-world idiom: an HTTP client's `fetch()` is bound to an
     * `AbortController.signal`; calling `controller.abort()` rejects the
     * pending Promise. This test models that for a JSPI-suspending host
     * import: we wire the deferred Promise to an `AbortSignal`, kick off
     * many concurrent suspended guest tasks, then abort a SUBSET of them
     * mid-flight while resolving the rest.
     *
     * Asserts:
     *   - aborted invocations end (the guest task completes — current jsco
     *     semantics treat host rejection as subtask RETURNED, see P11).
     *   - non-aborted invocations resolve normally.
     *   - the instance handles a follow-up burst after the cancellation
     *     storm (no table corruption, no poisoned state).
     *   - no process-level unhandledRejection or uncaughtException.
     */
    test('P7: AbortController-driven cancellation across JSPI suspend', () => runWithVerbose(verbose, async () => {
        const errs = watchProcessErrors();
        const watchdog = startWatchdog();

        interface PendingCall {
            deferred: Deferred<void>;
            controller: AbortController;
        }
        const pending: PendingCall[] = [];

        const imports = {
            [HOST_INTERFACE]: {
                'slow-fn': (): Promise<void> => {
                    const d = deferred<void>();
                    const controller = new AbortController();
                    controller.signal.addEventListener('abort', () => {
                        d.reject(controller.signal.reason ?? new Error('aborted'));
                    });
                    pending.push({ deferred: d, controller });
                    return d.promise;
                },
            },
        };

        const component = await createComponent(MULTI_ASYNC_WASM, verboseOptions(verbose));
        const instance = await component.instantiate(imports);
        try {
            const runner = instance.exports[RUNNER_INTERFACE] as Record<string, () => Promise<void>>;

            const N = 8;

            // First burst: kick off N concurrent suspending invocations.
            const burst1: Promise<void>[] = [];
            for (let i = 0; i < N; i++) burst1.push(runner['waitOnce']!());
            for (let i = 0; i < 50 && pending.length < N; i++) await drain(1);
            expect(pending.length).toBe(N);

            // Cancel half (even-indexed), resolve the other half (odd-indexed).
            // Interleave aborts and resolves to stress the scheduler.
            for (let i = 0; i < N; i++) {
                if (i % 2 === 0) {
                    pending[i]!.controller.abort(new Error(`cancel-${i}`));
                } else {
                    pending[i]!.deferred.resolve();
                }
            }

            // Every guest task must complete — aborted ones via subtask
            // RETURNED (jsco's current semantics), resolved ones normally.
            await Promise.all(burst1);

            // Second burst proves the instance survived the cancellation
            // storm: handle table, subtask table, waitable-set table all
            // drained cleanly.
            pending.length = 0;
            const burst2: Promise<void>[] = [];
            for (let i = 0; i < N; i++) burst2.push(runner['waitOnce']!());
            for (let i = 0; i < 50 && pending.length < N; i++) await drain(1);
            expect(pending.length).toBe(N);
            for (const p of pending) p.deferred.resolve();
            await Promise.all(burst2);

            // Drain microtasks so any deferred unhandled-rejection detector
            // has a chance to fire before the assertions below.
            await drain(20);
        } finally {
            instance.dispose();
            const ticks = watchdog.stop();
            errs.stop();

            expect(errs.rejections).toEqual([]);
            expect(errs.exceptions).toEqual([]);
            expect(ticks).toBeGreaterThan(0);
        }
    }));

    /**
     * P-chaos — randomized interleaving of resolve / reject / abort outcomes
     * on a single batch of N=24 concurrent suspended invocations.
     *
     * Combines the codepaths exercised in isolation by P2 (parallel resolve),
     * P7 (AbortController cancellation), and P11 (Promise rejection) within
     * one batch on one instance. A deterministic PRNG (xorshift32) drives
     * the outcome assignment so failures are reproducible from the seed.
     *
     * The instance must:
     *  - complete all 24 guest tasks (jsco's subtask table treats reject /
     *    abort as RETURNED; see `src/runtime/subtask-table.ts`).
     *  - survive a follow-up clean batch (proves table drain).
     *  - emit no process-level unhandledRejection / uncaughtException.
     */
    test('P-chaos: random resolve/reject/abort interleave on one batch survives', () => runWithVerbose(verbose, async () => {
        const errs = watchProcessErrors();
        const watchdog = startWatchdog();

        interface PendingCall {
            deferred: Deferred<void>;
            controller: AbortController;
        }
        const pending: PendingCall[] = [];
        const imports = {
            [HOST_INTERFACE]: {
                'slow-fn': (): Promise<void> => {
                    const d = deferred<void>();
                    const controller = new AbortController();
                    controller.signal.addEventListener('abort', () => {
                        d.reject(controller.signal.reason ?? new Error('aborted'));
                    });
                    pending.push({ deferred: d, controller });
                    return d.promise;
                },
            },
        };

        const component = await createComponent(MULTI_ASYNC_WASM, verboseOptions(verbose));
        const instance = await component.instantiate(imports);
        try {
            const runner = instance.exports[RUNNER_INTERFACE] as Record<string, () => Promise<void>>;

            const N = 24;

            // xorshift32 PRNG with fixed seed for reproducibility.
            let seed = 0x12345678;
            const rand = (): number => {
                seed ^= seed << 13;
                seed ^= seed >>> 17;
                seed ^= seed << 5;
                return (seed >>> 0) / 0x1_0000_0000;
            };

            // Burst 1: chaos.
            const burst1: Promise<void>[] = [];
            for (let i = 0; i < N; i++) burst1.push(runner['waitOnce']!());
            for (let i = 0; i < 50 && pending.length < N; i++) await drain(1);
            expect(pending.length).toBe(N);

            // Build a randomized index permutation.
            const order: number[] = [];
            for (let i = 0; i < N; i++) order.push(i);
            for (let i = N - 1; i > 0; i--) {
                const j = Math.floor(rand() * (i + 1));
                const tmp = order[i]!;
                order[i] = order[j]!;
                order[j] = tmp;
            }

            let resolves = 0, rejects = 0, aborts = 0;
            for (const idx of order) {
                const r = rand();
                if (r < 0.40) {
                    pending[idx]!.deferred.resolve();
                    resolves++;
                } else if (r < 0.70) {
                    pending[idx]!.deferred.reject(new Error(`reject-${idx}`));
                    rejects++;
                } else {
                    pending[idx]!.controller.abort(new Error(`abort-${idx}`));
                    aborts++;
                }
                // Occasional drain to interleave settlement with the
                // remaining settles — stresses the scheduler.
                if (rand() < 0.25) await drain(1);
            }

            // Sanity: at least one of each outcome with this seed.
            expect(resolves).toBeGreaterThan(0);
            expect(rejects).toBeGreaterThan(0);
            expect(aborts).toBeGreaterThan(0);

            await Promise.all(burst1);

            // Burst 2: clean batch confirms instance is healthy.
            pending.length = 0;
            const burst2: Promise<void>[] = [];
            for (let i = 0; i < N; i++) burst2.push(runner['waitOnce']!());
            for (let i = 0; i < 50 && pending.length < N; i++) await drain(1);
            expect(pending.length).toBe(N);
            for (const p of pending) p.deferred.resolve();
            await Promise.all(burst2);

            await drain(20);
        } finally {
            instance.dispose();
            const ticks = watchdog.stop();
            errs.stop();

            expect(errs.rejections).toEqual([]);
            expect(errs.exceptions).toEqual([]);
            expect(ticks).toBeGreaterThan(0);
        }
    }));

    /**
     * P3 — spawn-from-handler: handler delivers result via `task.return`
     * BEFORE its in-flight subtask completes. The JS-side Promise must
     * resolve at task.return time; the orphaned subtask continues in the
     * background and is drained when the host import finally resolves.
     *
     * Exercises the `createAsyncLiftWrapper` G3 fix directly: without it,
     * the JS Promise would only resolve at EXIT time (after the subtask
     * resolves), defeating the early-return semantics.
     *
     * Asserts: (1) JS Promise resolves while the host import is still
     * pending, (2) instance handles a follow-up call after the trailing
     * subtask drains, (3) no process-level errors.
     */
    test('P3: task.return early — JS Promise resolves before subtask completes', () => runWithVerbose(verbose, async () => {
        const errs = watchProcessErrors();
        const watchdog = startWatchdog();

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
            const runner = instance.exports[RUNNER_INTERFACE] as Record<string, () => Promise<void>>;

            const completion = runner['returnEarly']!();

            // Track whether the JS-side Promise already settled.
            let settled = false;
            completion.then(() => { settled = true; });

            // Drain microtasks; the slow-fn host import must register a
            // pending deferred AND the JS Promise must already be settled
            // (task.return came before the subtask resolved).
            await drain();
            expect(pending.length).toBe(1);
            expect(settled).toBe(true);

            // The trailing subtask is still pending in the background.
            // Resolving it lets the guest task EXIT cleanly.
            pending[0]!.resolve();
            await completion; // already settled, but await for symmetry

            // Follow-up invocation proves the instance and its background
            // event-loop pump are healthy after a returnEarly cycle.
            const c2 = runner['waitOnce']!();
            await drain();
            expect(pending.length).toBe(2);
            pending[1]!.resolve();
            await c2;
        } finally {
            instance.dispose();
            const ticks = watchdog.stop();
            errs.stop();

            expect(errs.rejections).toEqual([]);
            expect(errs.exceptions).toEqual([]);
            expect(ticks).toBeGreaterThan(0);
        }
    }));

    /**
     * P6 — backpressure interaction during JSPI suspend.
     *
     * One guest task suspends on `waitOnce` while another task running on
     * the same instance toggles `backpressure.inc`/`backpressure.dec`
     * (net delta zero across its lifetime). The suspended task must not
     * be perturbed by the backpressure ops, and both tasks must complete.
     *
     * jsco's current `mctx.backpressure` is a no-op counter (incremented
     * but never enforced); this test guards against regressions that would
     * connect the counter to scheduling in a way that strands suspended
     * tasks.
     */
    test('P6: backpressure inc/dec on a parallel task does not poison a suspended task', () => runWithVerbose(verbose, async () => {
        const errs = watchProcessErrors();
        const watchdog = startWatchdog();

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
            const runner = instance.exports[RUNNER_INTERFACE] as Record<string, () => Promise<void>>;

            // Suspended task A.
            const cA = runner['waitOnce']!();
            await drain();
            expect(pending.length).toBe(1);

            // Concurrent task B that touches backpressure during its wait.
            const cB = runner['bpBump']!();
            await drain();
            expect(pending.length).toBe(2);

            // Resolve B first — verifies the backpressure-touching task
            // EXITs cleanly while A is still suspended.
            pending[1]!.resolve();
            await cB;

            // A must still be unaffected.
            pending[0]!.resolve();
            await cA;

            // Follow-up call confirms the instance is healthy after
            // the backpressure inc/dec dance.
            const cC = runner['waitOnce']!();
            await drain();
            expect(pending.length).toBe(3);
            pending[2]!.resolve();
            await cC;
        } finally {
            instance.dispose();
            const ticks = watchdog.stop();
            errs.stop();

            expect(errs.rejections).toEqual([]);
            expect(errs.exceptions).toEqual([]);
            expect(ticks).toBeGreaterThan(0);
        }
    }));

    /**
     * P4 — mixed async-lower (subtask path) + sync-lower-with-JSPI on one
     * instance. The same `slow-fn` component import is canon-lowered twice
     * in the WAT: once async (subtask creation) and once sync (JSPI
     * `WebAssembly.Suspending` wrap). Two concurrent guest invocations —
     * `waitOnce` (async-lower) and `waitOnceSync` (sync-lower) — must both
     * complete cleanly without interfering, proving the two lowering
     * pathways coexist on a single instance.
     */
    test('P4: mixed async-lower + sync-lower-JSPI on one instance', () => runWithVerbose(verbose, async () => {
        const errs = watchProcessErrors();
        const watchdog = startWatchdog();

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
            const runner = instance.exports[RUNNER_INTERFACE] as Record<string, () => Promise<void>>;
            expect(runner['waitOnceSync']).toBeDefined();

            // Kick off the async-lower path first.
            const cAsync = runner['waitOnce']!();
            await drain();
            expect(pending.length).toBe(1);

            // Now kick off the sync-lower-JSPI path on the same instance.
            const cSync = runner['waitOnceSync']!();
            await drain();
            expect(pending.length).toBe(2);

            // Resolve sync-lower side first — its JSPI continuation must
            // wake up cleanly while the async-lower subtask is still pending.
            pending[1]!.resolve();
            await cSync;

            // Async-lower path still in flight: resolve and complete.
            pending[0]!.resolve();
            await cAsync;

            // Follow-up burst: one of each, interleaved.
            const cA2 = runner['waitOnce']!();
            const cS2 = runner['waitOnceSync']!();
            await drain();
            expect(pending.length).toBe(4);
            pending[2]!.resolve();
            pending[3]!.resolve();
            await Promise.all([cA2, cS2]);
        } finally {
            instance.dispose();
            const ticks = watchdog.stop();
            errs.stop();

            expect(errs.rejections).toEqual([]);
            expect(errs.exceptions).toEqual([]);
            expect(ticks).toBeGreaterThan(0);
        }
    }));

    /**
     * P5 — resource-handle survival across a JSPI suspend.
     *
     * The WAT `survive-resource` export creates a component-defined
     * resource (rep marker `0x42`), holds the handle in a wasm LOCAL,
     * suspends via JSPI on the sync-canon-lower `sync-fn`, and after
     * resume re-reads `resource.rep` — trapping with `unreachable` if
     * the marker changed. Sync-lift + sync-canon-lower means the wasm
     * continuation is paused (locals preserved) instead of unwound, so
     * the resource handle naturally survives. Successful completion
     * proves the per-instance resource handle table is intact across
     * the suspend even with N concurrent in-flight tasks each owning
     * their own handle.
     */
    test('P5: resource handle survives JSPI suspend (N=4 concurrent)', () => runWithVerbose(verbose, async () => {
        const errs = watchProcessErrors();
        const watchdog = startWatchdog();

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
            const runner = instance.exports[RUNNER_INTERFACE] as Record<string, () => Promise<void>>;
            expect(runner['surviveResource']).toBeDefined();

            const N = 4;
            const handlers: Promise<void>[] = [];
            for (let i = 0; i < N; i++) handlers.push(runner['surviveResource']!());

            for (let i = 0; i < 50 && pending.length < N; i++) await drain(1);
            expect(pending.length).toBe(N);

            // Resolve out-of-order so each task wakes its OWN suspended
            // continuation. Any cross-task corruption surfaces as a wasm
            // trap from the `unreachable` rep-mismatch guard.
            const order = [2, 0, 3, 1];
            for (const i of order) pending[i]!.resolve();

            await Promise.all(handlers);

            // Follow-up call confirms the resource table is healthy after
            // four resources were created and dropped across suspends.
            const cAfter = runner['surviveResource']!();
            await drain();
            expect(pending.length).toBe(N + 1);
            pending[N]!.resolve();
            await cAfter;
        } finally {
            instance.dispose();
            const ticks = watchdog.stop();
            errs.stop();

            expect(errs.rejections).toEqual([]);
            expect(errs.exceptions).toEqual([]);
            expect(ticks).toBeGreaterThan(0);
        }
    }));

    /**
     * P8 — N concurrent JSPI sync-lower suspends on a single instance
     * (positive deadlock-freedom control). Each `waitOnceSync` invocation
     * suspends its own JSPI continuation on a deferred `slow-fn` Promise.
     * Resolving in shuffled order verifies that independent JSPI suspends
     * do not block each other.
     *
     * NOTE: the well-known JSPI deadlock case (interdependent suspends
     * inside a Rust `futures::join!` over a stream pipe — see the
     * `cli_hello_stdout` discussion in proposals.md) is a JSPI structural
     * limitation, not a jsco bug, and is intentionally NOT covered here.
     * This test guards against accidentally breaking the *independent*
     * concurrent-suspend case.
     */
    test('P8: N=8 parallel JSPI sync-lower suspends complete out-of-order', () => runWithVerbose(verbose, async () => {
        const errs = watchProcessErrors();
        const watchdog = startWatchdog();

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
            const runner = instance.exports[RUNNER_INTERFACE] as Record<string, () => Promise<void>>;

            const N = 8;
            const handlers: Promise<void>[] = [];
            for (let i = 0; i < N; i++) handlers.push(runner['waitOnceSync']!());

            for (let i = 0; i < 50 && pending.length < N; i++) await drain(1);
            expect(pending.length).toBe(N);

            // Healthy event-loop liveness while all N JSPI continuations
            // are suspended — proves the suspends are independent.
            expect(watchdog.stop()).toBeGreaterThan(0);

            const order = [4, 1, 7, 3, 0, 6, 2, 5];
            for (const i of order) pending[i]!.resolve();

            await Promise.all(handlers);
        } finally {
            instance.dispose();
            errs.stop();

            expect(errs.rejections).toEqual([]);
            expect(errs.exceptions).toEqual([]);
        }
    }));

    /**
     * P12 is implemented in `tests/host/wasip3/node/http-reactor-concurrent.test.ts`
     * because it requires a real HTTP body-stream + mid-stream client TCP
     * disconnect — out of scope for the WAT-only `multi-async-p3` fixture.
     */
});
