// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * "Bad-guest" integration tests — DOS / event-loop-starvation attack patterns.
 *
 * Each test loads the hand-written `bad-guests-p3.wat` component and invokes
 * one of its attack exports. These exports run tight loops on canonical-ABI
 * built-ins WITHOUT ever calling `waitable-set.wait` — so the WASM thread
 * never yields to JS unless the host injects a yield point.
 *
 * See `proposals.md` → "DOS / Event-Loop-Starvation Attack Surface" for the
 * full enumeration of attack classes (A1–A4, A5, A7, A8, B1–B3 covered here).
 *
 * What the test actually measures
 * -------------------------------
 * We do NOT measure wall-clock time — a fast spin (10M cheap sync ops in
 * 300 ms) would pass a wall-clock budget while still completely starving
 * the JS event loop for those 300 ms. The real DOS property is: **did the
 * JS event loop get to run any task during the call?**
 *
 * We schedule N `setTimeout(0)` ticks BEFORE invoking the attack. Each
 * timer increments a counter. If the WASM yields control to JS at any
 * point during the call, the timer queue drains and the counter advances.
 * If the WASM spins without yielding, the timers stay parked and the
 * counter stays at 0.
 *
 * `tickedDuringCall === 0` ⇒ WASM monopolized the thread for the whole
 * call ⇒ DOS confirmed. Tests that stay `test.skip` document attack
 * classes for which no host mitigation is yet implemented; un-skip when
 * adding the corresponding mitigation.
 */

import { createComponent } from '../../../src/resolver';
import { initializeAsserts } from '../../../src/utils/assert';
import { useVerboseOnFailure, verboseOptions, runWithVerbose, MAX_BUFFERED_MESSAGES, type VerboseCapture } from '../../test-utils/verbose-logger';

initializeAsserts();

const BAD_GUESTS_WASM = './integration-tests/bad-guests-p3-wat/bad-guests-p3.wasm';
const TRAP_IMPORT_WASM = './integration-tests/trap-import-wat/trap-import.wasm';
const ATTACKS_INTERFACE = 'test:bad-guests/attacks@0.1.0';

// Iteration cap passed to each attack. Large enough that any *yielding*
// implementation should let dozens of timer ticks fire during the call.
const ITERATION_CAP = 10_000_000;
const ITERATION_CAP_ALLOC = 100_000; // smaller for allocation-heavy attacks

// Number of setTimeout(0) ticks pre-scheduled before each attack call.
const PRE_SCHEDULED_TICKS = 1000;

// Yield throttle interval enabled for these tests. With yieldThrottle=1000,
// a 10M-iteration spin should produce ~10K macrotask yields.
const YIELD_THROTTLE = 1000;

interface AttackProbe {
    tickedDuringCall: number;
    iterations: number;
    elapsedMs: number;
}

async function probeAttack(capture: VerboseCapture, label: string, fn: () => Promise<unknown> | unknown): Promise<AttackProbe> {
    let tickCount = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < PRE_SCHEDULED_TICKS; i++) {
        timers.push(setTimeout(() => { tickCount++; }, 0));
    }

    await new Promise<void>((resolve) => setImmediate(resolve));
    const ticksBefore = tickCount;

    const t0 = Date.now();
    const iterations = await fn() as number;
    const elapsedMs = Date.now() - t0;

    const tickedDuringCall = tickCount - ticksBefore;

    for (const t of timers) clearTimeout(t);

    // Recorded into the per-test verbose capture; only printed when the
    // test fails. Keeps passing-suite output quiet while preserving the
    // diagnostic trail for failures.
    capture.messages.push(`[probe] ${label}: ticked=${tickedDuringCall}/${PRE_SCHEDULED_TICKS} iterations=${iterations} elapsed=${elapsedMs}ms`);

    return { tickedDuringCall, iterations, elapsedMs };
}

function expectYielded(probe: AttackProbe, expectedIterations: number): void {
    expect(probe.iterations).toBe(expectedIterations);
    expect(probe.tickedDuringCall).toBeGreaterThan(0);
}

async function* makeF2Gen(first: Promise<Uint8Array>, second: Promise<Uint8Array>): AsyncGenerator<Uint8Array> {
    yield await first;
    yield await second;
}

describe('Bad-guest DOS attack patterns (WASIp3)', () => {
    const verbose = useVerboseOnFailure();

    async function loadAttacks(extraConfig?: { limits?: { maxHandles?: number; maxMemoryBytes?: number; maxCanonOpsWithoutYield?: number } }) {
        const component = await createComponent(BAD_GUESTS_WASM, { ...verboseOptions(verbose), yieldThrottle: YIELD_THROTTLE });
        // The async-host import is consumed by `canon lower (... async)` for
        // the A6/B4 attacks. Returning a never-resolving Promise keeps each
        // subtask in STARTED state so cancel/leak paths exercise the host.
        const imports = {
            'test:bad-guests/async-host@0.1.0': {
                'async-fn': () => new Promise<number>(() => { /* never resolves */ }),
            },
        };
        const instance = await component.instantiate(imports, extraConfig);
        const iface = instance.exports[ATTACKS_INTERFACE] as Record<string, (it: number) => Promise<number> | number>;
        if (!iface) throw new Error(`Missing export ${ATTACKS_INTERFACE}`);
        return { instance, iface };
    }

    // Bad-actor harness: NO yieldThrottle (so the per-N throttle cannot
    // mask the canon-op budget). With `maxCanonOpsWithoutYield` set, the
    // attack must trap the instance instead of starving the event loop.
    async function loadAttacksNoThrottle(maxCanonOpsWithoutYield: number) {
        const component = await createComponent(BAD_GUESTS_WASM, { ...verboseOptions(verbose) });
        const imports = {
            'test:bad-guests/async-host@0.1.0': {
                'async-fn': () => new Promise<number>(() => { /* never resolves */ }),
            },
        };
        const instance = await component.instantiate(imports, { limits: { maxCanonOpsWithoutYield } });
        const iface = instance.exports[ATTACKS_INTERFACE] as Record<string, (it: number) => Promise<number> | number>;
        if (!iface) throw new Error(`Missing export ${ATTACKS_INTERFACE}`);
        return { instance, iface };
    }

    // ---- Class A: tight polling loops on sync canon built-ins ----

    test('A1: stream.read → cancel-read yields to event loop', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            const probe = await probeAttack(verbose, 'a1', () => iface['a1StreamReadCancelSpin']!(ITERATION_CAP));
            expectYielded(probe, ITERATION_CAP);
        } finally {
            instance.dispose();
        }
    }));

    test('A2: stream.write → cancel-write yields to event loop', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            const probe = await probeAttack(verbose, 'a2', () => iface['a2StreamWriteCancelSpin']!(ITERATION_CAP));
            expectYielded(probe, ITERATION_CAP);
        } finally {
            instance.dispose();
        }
    }));

    test('A3: future.read → cancel-read yields to event loop', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            const probe = await probeAttack(verbose, 'a3', () => iface['a3FutureReadCancelSpin']!(ITERATION_CAP));
            expectYielded(probe, ITERATION_CAP);
        } finally {
            instance.dispose();
        }
    }));

    test('A4: future.write → cancel-write yields to event loop', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            const probe = await probeAttack(verbose, 'a4', () => iface['a4FutureWriteCancelSpin']!(ITERATION_CAP));
            expectYielded(probe, ITERATION_CAP);
        } finally {
            instance.dispose();
        }
    }));

    test('A5: waitable-set.poll yields to event loop', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            const probe = await probeAttack(verbose, 'a5', () => iface['a5WaitablePollSpin']!(ITERATION_CAP));
            expectYielded(probe, ITERATION_CAP);
        } finally {
            instance.dispose();
        }
    }));

    test('A7: stream.new + drop churn yields to event loop', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            const probe = await probeAttack(verbose, 'a7', () => iface['a7StreamNewDropChurn']!(ITERATION_CAP));
            expectYielded(probe, ITERATION_CAP);
        } finally {
            instance.dispose();
        }
    }));

    test('A8: waitable-set.new + drop churn yields to event loop', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            const probe = await probeAttack(verbose, 'a8', () => iface['a8WaitableSetNewDropChurn']!(ITERATION_CAP));
            expectYielded(probe, ITERATION_CAP);
        } finally {
            instance.dispose();
        }
    }));

    // ---- Class B: resource-table exhaustion (allocation churn without drop) ----

    test('B1: unbounded stream.new without drop yields to event loop', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            const probe = await probeAttack(verbose, 'b1', () => iface['b1StreamLeak']!(ITERATION_CAP_ALLOC));
            expectYielded(probe, ITERATION_CAP_ALLOC);
        } finally {
            instance.dispose();
        }
    }));

    test('B2: unbounded future.new without drop yields to event loop', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            const probe = await probeAttack(verbose, 'b2', () => iface['b2FutureLeak']!(ITERATION_CAP_ALLOC));
            expectYielded(probe, ITERATION_CAP_ALLOC);
        } finally {
            instance.dispose();
        }
    }));

    test('B3: unbounded waitable-set.new without drop yields to event loop', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            const probe = await probeAttack(verbose, 'b3', () => iface['b3WaitableSetLeak']!(ITERATION_CAP_ALLOC));
            expectYielded(probe, ITERATION_CAP_ALLOC);
        } finally {
            instance.dispose();
        }
    }));

    // ---- Sanity: small iteration counts always succeed ----

    test('sanity: A1 with iterations=10 returns 10', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            const completed = await iface['a1StreamReadCancelSpin']!(10);
            expect(completed).toBe(10);
        } finally {
            instance.dispose();
        }
    }));

    test('sanity: A5 with iterations=10 returns 10', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            const completed = await iface['a5WaitablePollSpin']!(10);
            expect(completed).toBe(10);
        } finally {
            instance.dispose();
        }
    }));

    test('sanity: A7 with iterations=10 returns 10', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            const completed = await iface['a7StreamNewDropChurn']!(10);
            expect(completed).toBe(10);
        } finally {
            instance.dispose();
        }
    }));

    // ====================================================================
    // Group 3 — canon-op budget abort (default-on, no throttle).
    //
    // These tests prove that even WITHOUT `yieldThrottle`, a guest that
    // spins on canon built-ins is forcibly aborted once the per-instance
    // canon-op budget is exhausted. The budget is reset on every JSPI
    // yield (host-import resume, `waitable-set.wait` resume, throttle
    // setImmediate), so an honest guest never trips it.
    //
    // We override `maxCanonOpsWithoutYield` to a small value (50_000) so
    // the abort fires fast in tests. Production default is 1_000_000.
    // ====================================================================
    const G3_OPS_CAP = 50_000;
    const G3_ITERATIONS = 10_000_000; // far exceeds the cap — forces abort

    function expectCanonBudgetAbort(err: unknown): void {
        expect(err).toBeDefined();
        const msg = (err as Error).message ?? String(err);
        expect(msg).toMatch(/canon-op budget exceeded/);
    }

    test('Group 3 / A1: stream.cancel-read spin aborts on canon-op cap (no throttle)', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacksNoThrottle(G3_OPS_CAP);
        try {
            let caught: unknown;
            try {
                await iface['a1StreamReadCancelSpin']!(G3_ITERATIONS);
            } catch (e) {
                caught = e;
            }
            expectCanonBudgetAbort(caught);
        } finally {
            instance.dispose();
        }
    }));

    test('Group 3 / A2: stream.cancel-write spin aborts on canon-op cap (no throttle)', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacksNoThrottle(G3_OPS_CAP);
        try {
            let caught: unknown;
            try {
                await iface['a2StreamWriteCancelSpin']!(G3_ITERATIONS);
            } catch (e) {
                caught = e;
            }
            expectCanonBudgetAbort(caught);
        } finally {
            instance.dispose();
        }
    }));

    test('Group 3 / A3: future.cancel-read spin aborts on canon-op cap (no throttle)', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacksNoThrottle(G3_OPS_CAP);
        try {
            let caught: unknown;
            try {
                await iface['a3FutureReadCancelSpin']!(G3_ITERATIONS);
            } catch (e) {
                caught = e;
            }
            expectCanonBudgetAbort(caught);
        } finally {
            instance.dispose();
        }
    }));

    test('Group 3 / A4: future.cancel-write spin aborts on canon-op cap (no throttle)', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacksNoThrottle(G3_OPS_CAP);
        try {
            let caught: unknown;
            try {
                await iface['a4FutureWriteCancelSpin']!(G3_ITERATIONS);
            } catch (e) {
                caught = e;
            }
            expectCanonBudgetAbort(caught);
        } finally {
            instance.dispose();
        }
    }));

    test('Group 3 / A5: waitable-set.poll spin aborts on canon-op cap (no throttle)', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacksNoThrottle(G3_OPS_CAP);
        try {
            let caught: unknown;
            try {
                await iface['a5WaitablePollSpin']!(G3_ITERATIONS);
            } catch (e) {
                caught = e;
            }
            expectCanonBudgetAbort(caught);
        } finally {
            instance.dispose();
        }
    }));

    test('Group 3 / A7: stream.new+drop churn aborts on canon-op cap (no throttle)', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacksNoThrottle(G3_OPS_CAP);
        try {
            let caught: unknown;
            try {
                await iface['a7StreamNewDropChurn']!(G3_ITERATIONS);
            } catch (e) {
                caught = e;
            }
            expectCanonBudgetAbort(caught);
        } finally {
            instance.dispose();
        }
    }));

    test('Group 3 / A8: waitable-set.new+drop churn aborts on canon-op cap (no throttle)', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacksNoThrottle(G3_OPS_CAP);
        try {
            let caught: unknown;
            try {
                await iface['a8WaitableSetNewDropChurn']!(G3_ITERATIONS);
            } catch (e) {
                caught = e;
            }
            expectCanonBudgetAbort(caught);
        } finally {
            instance.dispose();
        }
    }));

    test('Group 3 / A9: task.backpressure flip-flop aborts on canon-op cap (no throttle)', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacksNoThrottle(G3_OPS_CAP);
        try {
            let caught: unknown;
            try {
                await iface['a9BackpressureFlip']!(G3_ITERATIONS);
            } catch (e) {
                caught = e;
            }
            expectCanonBudgetAbort(caught);
        } finally {
            instance.dispose();
        }
    }));

    test('Group 3 / B1: stream.new leak aborts on canon-op cap (no throttle)', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacksNoThrottle(G3_OPS_CAP);
        try {
            let caught: unknown;
            try {
                await iface['b1StreamLeak']!(G3_ITERATIONS);
            } catch (e) {
                caught = e;
            }
            expectCanonBudgetAbort(caught);
        } finally {
            instance.dispose();
        }
    }));

    test('Group 3 / B2: future.new leak aborts on canon-op cap (no throttle)', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacksNoThrottle(G3_OPS_CAP);
        try {
            let caught: unknown;
            try {
                await iface['b2FutureLeak']!(G3_ITERATIONS);
            } catch (e) {
                caught = e;
            }
            expectCanonBudgetAbort(caught);
        } finally {
            instance.dispose();
        }
    }));

    test('Group 3 / B3: waitable-set.new leak aborts on canon-op cap (no throttle)', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacksNoThrottle(G3_OPS_CAP);
        try {
            let caught: unknown;
            try {
                await iface['b3WaitableSetLeak']!(G3_ITERATIONS);
            } catch (e) {
                caught = e;
            }
            expectCanonBudgetAbort(caught);
        } finally {
            instance.dispose();
        }
    }));

    test('Group 3 / D1: read-from-dropped-stream spin aborts on canon-op cap (no throttle)', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacksNoThrottle(G3_OPS_CAP);
        try {
            let caught: unknown;
            try {
                await iface['d1ReadDroppedStreamSpin']!(G3_ITERATIONS);
            } catch (e) {
                caught = e;
            }
            expectCanonBudgetAbort(caught);
        } finally {
            instance.dispose();
        }
    }));

    test('Group 3 / D3: waitable-set.poll on empty set aborts on canon-op cap (no throttle)', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacksNoThrottle(G3_OPS_CAP);
        try {
            let caught: unknown;
            try {
                await iface['d3PollEmptyWaitableSet']!(G3_ITERATIONS);
            } catch (e) {
                caught = e;
            }
            expectCanonBudgetAbort(caught);
        } finally {
            instance.dispose();
        }
    }));

    test('Group 3: cap=0 disables the check (legacy behavior)', () => runWithVerbose(verbose, async () => {
        // With cap=0 the budget is disabled. Without yieldThrottle either,
        // there is no mitigation — the spin runs to completion. We use a
        // small iteration count so the test still finishes promptly.
        const { instance, iface } = await loadAttacksNoThrottle(0);
        try {
            const result = await iface['a1StreamReadCancelSpin']!(1_000);
            expect(result).toBe(1_000);
        } finally {
            instance.dispose();
        }
    }));

    // ====================================================================
    // PLACEHOLDERS — un-skip and implement as each mitigation lands.
    // See proposals.md "DOS / Event-Loop-Starvation Attack Surface" for the
    // full taxonomy. Each `test.skip` below references a single attack class.
    //
    // Implementing one of these requires three things:
    //   1. A new export in `bad-guests-p3.wat` that performs the spin
    //      (or a host-level fixture for the F-class tests).
    //   2. A host-side mitigation in `src/runtime/` that breaks the spin.
    //   3. Flipping `test.skip` to `test` and asserting `expectYielded(...)`.
    //
    // Until then, the placeholder documents the contract.
    // ====================================================================

    // ---- Class A continued ----

    // A6: Repeatedly call an async-lower JS import that returns a Promise,
    // then `subtask.cancel` + `subtask.drop` on each resulting subtask.
    // Mitigation: subtask.cancel + subtask.drop + the async-lower trampoline
    // are all wrapped with `wrapWithThrottle`, so the WASM thread yields
    // every `yieldThrottle` ops.
    test('A6: subtask.cancel churn yields to event loop', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            const probe = await probeAttack(verbose, 'a6', () => iface['a6SubtaskCancelSpin']!(ITERATION_CAP_ALLOC));
            expectYielded(probe, ITERATION_CAP_ALLOC);
        } finally {
            instance.dispose();
        }
    }));

    // A9: Toggle task.backpressure on/off in a tight loop.
    test('A9: task.backpressure flip-flop yields to event loop', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            const probe = await probeAttack(verbose, 'a9', () => iface['a9BackpressureFlip']!(ITERATION_CAP));
            expectYielded(probe, ITERATION_CAP);
        } finally {
            instance.dispose();
        }
    }));

    // ---- Class B continued ----

    // B4: Async-lower a Promise-returning JS import and never call subtask.drop \u2014
    // subtask handle table grows unboundedly. Mitigation: the async-lower
    // trampoline is throttle-wrapped so the spin yields.
    test('B4: unbounded subtask creation without drop yields to event loop', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            const probe = await probeAttack(verbose, 'b4', () => iface['b4SubtaskLeak']!(ITERATION_CAP_ALLOC));
            expectYielded(probe, ITERATION_CAP_ALLOC);
        } finally {
            instance.dispose();
        }
    }));

    // B6: resource.new on a component-defined resource, never disposed.
    // Per-component resource table grows. Mitigation: maxHandles cap on
    // ResourceTable traps before the table grows unboundedly.
    test('B6: resource.new past maxHandles cap traps', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks({ limits: { maxHandles: 64 } });
        try {
            await expect(Promise.resolve(iface['b6ResourceLeak']!(ITERATION_CAP_ALLOC))).rejects.toThrow(/handle limit \(64\) exceeded/);
        } finally {
            instance.dispose();
        }
    }));

    // B7: Linear-memory growth via memory.grow until the host traps.
    // Mitigation: maxMemoryBytes cap enforced at every canon-op transition.
    test('B7: memory.grow loop traps before exhausting JS heap', () => runWithVerbose(verbose, async () => {
        // Cap the instance to ~4 MB. The B7 attack grows 16 pages (1 MB) per
        // iteration AND issues stream.new each cycle, so the cap-check fires
        // within ~4 iterations and aborts the instance with a RuntimeError.
        const { instance, iface } = await loadAttacks({ limits: { maxMemoryBytes: 4_194_304 } });
        try {
            await expect(Promise.resolve(iface['b7MemoryGrowSpin']!(ITERATION_CAP_ALLOC))).rejects.toThrow(/memory cap exceeded/);
        } finally {
            instance.dispose();
        }
    }));

    // ---- Class C — re-entrant / nested call abuse ----

    // C1: Reentrant export call from inside an import handler.
    // Guest exports E, imports H. E calls H, H synchronously calls E again
    // on the same instance — without a guard the JS stack grows unboundedly
    // (one frame per reentry) until V8 throws "Maximum call stack size
    // exceeded" or the wasm thread runs out of shadow stack.
    //
    // Mitigation under test: `checkNotReentrant(ctx)` (src/marshal/validation.ts)
    // is invoked at every lifted export entry. When a host import calls back
    // into ANY export on the same instance while `ctx.inExport === true`, the
    // call traps with "cannot reenter component". The lift trampoline then
    // poisons the context (via `ctx.abort()` on the catch path) so subsequent
    // export calls also fail.
    //
    // Fixture: `trap-import` (sync export → sync host import). The host
    // implementation of `call-me` synchronously invokes `ns.callHost()` again.
    test('C1: reentrant export-from-import recursion traps before stack overflow', () => runWithVerbose(verbose, async () => {
        const component = await createComponent(TRAP_IMPORT_WASM, verboseOptions(verbose));
        let nsRef: { callHost: () => number | Promise<number>; doOk: () => number } | undefined;
        let reentryAttempts = 0;
        let reentryError: unknown;
        const imports = {
            'test:trap/host@0.1.0': {
                callMe: (): number => {
                    // Reentrant call: host (still inside the outer callHost()
                    // export) calls the same export again.
                    reentryAttempts++;
                    try {
                        const r = nsRef!.callHost();
                        // If the runtime forgot to guard, callHost would
                        // recurse and we'd never get here (stack overflow).
                        // Returning here means the guard let the call through
                        // — that is the bug the C1 guard prevents.
                        return r as number;
                    } catch (e) {
                        reentryError = e;
                        // Re-throw so the outer call sees the failure too.
                        throw e;
                    }
                },
            },
        };
        const instance = await component.instantiate(imports);
        try {
            const ns = instance.exports['test:trap/caller@0.1.0'] as {
                callHost: () => number | Promise<number>;
                doOk: () => number;
            };
            nsRef = ns;

            let outerError: unknown;
            try {
                await ns.callHost();
            } catch (e) {
                outerError = e;
            }

            // Exactly one reentry attempt — the guard fired on the first
            // re-entry, preventing unbounded recursion.
            expect(reentryAttempts).toBe(1);
            expect(reentryError).toBeDefined();
            expect((reentryError as Error).message).toMatch(/cannot reenter component|already executing an export/);
            expect(outerError).toBeDefined();

            // The instance must be poisoned for any subsequent export call —
            // the lift trampoline aborts the context on the catch path.
            expect(() => ns.doOk()).toThrow(/poisoned|trapped|aborted|reenter/);
        } finally {
            instance.dispose();
        }
    }));

    // C2: task.return called twice in the same async-lift task.
    //
    // Spec invariant (Component Model canonical ABI; Wasmtime
    // `Trap::TaskCancelOrReturnTwice`): a task may resolve at most once.
    // The first `task.return` delivers the value; any second call from the
    // same task must trap.
    //
    // Mitigation under test: `createAsyncLiftWrapper` in
    // `src/resolver/component-functions.ts` installs `mctx.currentTaskReturn`
    // with a one-shot guard. The first call fills the settle slot; the
    // second call calls `mctx.abort(...)` (poisons the instance) and throws
    // a `WebAssembly.RuntimeError`. The trap propagates back into wasm
    // through the canon-built-in import binding for `task.return`.
    //
    // Observable: the JS caller of the FIRST call has already received its
    // value (undefined for void result), so it does NOT see the trap. But
    // the instance is poisoned: any subsequent export call rejects.
    //
    // Fixture: `multi-async-p3` provides the `c2-double-return` async-lift
    // export which calls `task.return` twice in its start function.
    test('C2: second task.return on the same task aborts the instance', () => runWithVerbose(verbose, async () => {
        const MULTI_ASYNC_WASM = './integration-tests/multi-async-p3-wat/multi-async-p3.wasm';
        const RUNNER_INTERFACE = 'test:multi/runner@0.1.0';
        const HOST_INTERFACE = 'test:multi/host@0.1.0';

        const imports = {
            [HOST_INTERFACE]: {
                // Required by the component; never invoked by c2-double-return.
                'slow-fn': (): Promise<void> => new Promise<void>(() => { /* never */ }),
            },
        };
        const component = await createComponent(MULTI_ASYNC_WASM, verboseOptions(verbose));
        const instance = await component.instantiate(imports);
        try {
            const runner = instance.exports[RUNNER_INTERFACE] as Record<string, () => Promise<void>>;
            expect(runner['c2DoubleReturn']).toBeDefined();

            // First call: the start function calls task.return twice.
            // (1) First task.return → JS caller receives undefined.
            // (2) Second task.return → wasm trap; eventLoop rejects but
            //     the JS caller has already settled (one-shot Promise),
            //     so the error is consumed by the trampoline. The
            //     side-effect we observe is that `mctx.abort()` poisoned
            //     the instance.
            await runner['c2DoubleReturn']!();

            // Now the instance must be poisoned for any subsequent call.
            // Any of multi-async-p3's exports will be sufficient to
            // observe the poisoning; we use `c2-double-return` again so
            // the test stays self-contained.
            let caught: unknown;
            try {
                await runner['c2DoubleReturn']!();
            } catch (e) {
                caught = e;
            }
            expect(caught).toBeDefined();
            expect((caught as Error).message).toMatch(/poisoned|trapped|aborted|task\.return called more than once/);
        } finally {
            instance.dispose();
        }
    }));

    // C3: resource.drop on a borrowed handle that the host still references.
    //
    // Host calls a guest export that returns `borrow<R>`. While the host
    // still holds the borrow (i.e. `numLends > 0` in the resource table),
    // the guest tries to call `resource.drop` on the underlying owned
    // handle. Without accounting, the [dtor] would re-enter the host while
    // the host is still mid-use of the handle.
    //
    // Mitigation under test: `numLends` accounting in
    // `src/runtime/resources.ts`. `remove()` traps with "Cannot drop
    // resource handle N: K outstanding borrow(s)" when `numLends ≠ 0`.
    //
    // We exercise the runtime contract directly (no WAT fixture needed —
    // there is no component-level resource fixture in `integration-tests/`
    // yet, and the F2/F3 tests in this file follow the same direct-import
    // pattern when verifying runtime invariants).
    test('C3: resource.drop on borrowed handle traps with outstanding-borrow error', () => runWithVerbose(verbose, async () => {
        const { createResourceTable } = await import('../../../src/runtime/resources');
        const rt = createResourceTable();
        try {
            const typeIdx = 1;
            const obj = { tag: 'host-state' };
            // Guest creates the resource (resource.new) → host receives owned handle.
            const handle = rt.add(typeIdx, obj);
            expect(rt.get(typeIdx, handle)).toBe(obj);

            // Guest passes `borrow<R>` to the host: lend bumps numLends.
            rt.lend(typeIdx, handle);
            expect(rt.lendCount(typeIdx, handle)).toBe(1);

            // Guest attempts `resource.drop` while the borrow is outstanding.
            // Without the C3 mitigation this would invoke the [dtor] and
            // tear down host-side state still in use.
            expect(() => rt.remove(typeIdx, handle)).toThrow(/outstanding borrow/);

            // Even multiple concurrent lenders accumulate correctly.
            rt.lend(typeIdx, handle);
            expect(rt.lendCount(typeIdx, handle)).toBe(2);
            expect(() => rt.remove(typeIdx, handle))
                .toThrow(/2 outstanding borrow/);

            // Once the host returns all borrows, drop succeeds.
            rt.unlend(typeIdx, handle);
            rt.unlend(typeIdx, handle);
            expect(rt.lendCount(typeIdx, handle)).toBe(0);
            expect(() => rt.remove(typeIdx, handle)).not.toThrow();
        } finally {
            // ResourceTable has no explicit dispose — drop the reference.
        }
    }));

    // ---- Class D \u2014 trap-flooding / error-path spin ----

    // D1: Drop the readable end then call stream.read on the dead handle in a loop.
    // Each call returns DROPPED sync — the throttle still has to yield.
    test('D1: read-from-dropped-stream loop yields to event loop', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            const probe = await probeAttack(verbose, 'd1', () => iface['d1ReadDroppedStreamSpin']!(ITERATION_CAP));
            expectYielded(probe, ITERATION_CAP);
        } finally {
            instance.dispose();
        }
    }));

    // D2: Call stream.drop-readable twice on the same handle in a loop.
    // Spec: trap on double-drop. Mitigation: stream-table tracks per-side
    // dropped flags and throws a RuntimeError on the second call.
    test('D2: double-drop-readable loop traps consistently', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            await expect(Promise.resolve(iface['d2DoubleDropSpin']!(ITERATION_CAP))).rejects.toThrow(/already dropped/);
        } finally {
            instance.dispose();
        }
    }));

    // D3: waitable-set.poll on an empty set in a loop. Sibling of A5 (populated set).
    test('D3: waitable-set.poll on empty set yields to event loop', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            const probe = await probeAttack(verbose, 'd3', () => iface['d3PollEmptyWaitableSet']!(ITERATION_CAP));
            expectYielded(probe, ITERATION_CAP);
        } finally {
            instance.dispose();
        }
    }));

    // ---- Class E \u2014 JSPI-specific (post-Proposal-1 redesign) ----

    // E1: Suspending in a `futures::join!` arm starves the other arm.
    // The structural JSPI limitation cannot be fixed (WebAssembly.Suspending
    // freezes the whole wasm thread), but as of revised-plan.md §4 the
    // runtime now DETECTS it: an opt-in `maxBlockingTimeMs` cap is wired into
    // both `waitable-set.wait` resume (src/resolver/core-functions.ts) and
    // host-import Promise resume (src/marshal/trampoline-lower.ts). When a
    // single suspension exceeds the cap the instance aborts with a
    // `WebAssembly.RuntimeError("JSPI suspension stalled >Nms ...")` instead
    // of hanging.
    //
    // Mechanism under test: the host-import resume path. We use the existing
    // `trap-import` fixture (sync-lift export → sync-lower host import) with
    // JSPI enabled and a host import that returns a never-resolving Promise.
    // Without the watchdog, the Jest timeout (5000 ms) would fire; with
    // `maxBlockingTimeMs: 50` the watchdog races the suspension, aborts the
    // instance, and surfaces a RuntimeError back into wasm — exactly the
    // diagnostic the user asked for in place of the silent E1 hang.
    test('E1: maxBlockingTimeMs aborts indefinitely-suspended host imports', () => runWithVerbose(verbose, async () => {
        const component = await createComponent(TRAP_IMPORT_WASM, verboseOptions(verbose));
        const imports = {
            'test:trap/host@0.1.0': {
                // Never-resolving Promise — simulates an E1-style starvation
                // (the join! arm whose progress depends on a counterparty
                // that never makes progress).
                callMe: () => new Promise<number>(() => { /* never */ }),
            },
        };
        const instance = await component.instantiate(imports, {
            limits: { maxBlockingTimeMs: 50 },
        });
        try {
            const ns = instance.exports['test:trap/caller@0.1.0'] as {
                callHost: () => number | Promise<number>;
                doOk: () => number;
            };
            const t0 = Date.now();
            let caught: unknown;
            try {
                await ns.callHost();
            } catch (e) {
                caught = e;
            }
            const elapsedMs = Date.now() - t0;

            // The watchdog must fire well before any test-runner timeout.
            expect(caught).toBeInstanceOf(WebAssembly.RuntimeError);
            expect((caught as Error).message).toMatch(/JSPI suspension stalled >50ms at host-import\.resume/);
            expect((caught as Error).message).toMatch(/plan\.md E1/);
            expect(elapsedMs).toBeLessThan(2000);

            // After the abort the instance must be poisoned for any
            // subsequent export call.
            expect(() => ns.doOk()).toThrow(/poisoned|trapped|aborted/);
        } finally {
            instance.dispose();
        }
    }));

    // E5: maxHeapGrowthPerYield aborts host-side heap creep.
    // Complements `maxMemoryBytes` (which only sees wasm linear memory).
    // Mechanism: a host import that retains a large in-V8-heap allocation
    // (Array of numbers — Buffer external memory is NOT counted by
    // `process.memoryUsage().heapUsed`) per call, simulating the
    // cancel-spin variant where each yield window legitimately grows
    // host-side state until the JS process OOMs. With
    // `maxHeapGrowthPerYield: 5_000_000` and the 3-consecutive-samples
    // filter, the watchdog must abort after a small bounded number of
    // suspensions (well before any real OOM).
    test('E5: maxHeapGrowthPerYield aborts host-side heap creep across JSPI yields', () => runWithVerbose(verbose, async () => {
        const component = await createComponent(TRAP_IMPORT_WASM, verboseOptions(verbose));
        const retained: number[][] = [];
        const imports = {
            'test:trap/host@0.1.0': {
                callMe: async (): Promise<number> => {
                    // 1 million numbers ≈ 8 MB of V8-heap memory (vs. the
                    // 5 MB cap below). Buffer.alloc would NOT trip this
                    // because Node Buffer memory is external, not heapUsed.
                    const arr = new Array<number>(1_000_000);
                    for (let i = 0; i < arr.length; i++) arr[i] = i;
                    retained.push(arr);
                    // Force at least one event-loop tick so the resume site
                    // actually runs and samples the heap.
                    await new Promise<void>((r) => setImmediate(r));
                    return retained.length;
                },
            },
        };
        const instance = await component.instantiate(imports, {
            limits: { maxHeapGrowthPerYield: 5_000_000 },
        });
        try {
            const ns = instance.exports['test:trap/caller@0.1.0'] as {
                callHost: () => number | Promise<number>;
            };
            let caught: unknown;
            // Force a few resumes to trip the 3-consecutive-samples filter.
            for (let i = 0; i < 20 && !caught; i++) {
                try {
                    await ns.callHost();
                } catch (e) {
                    caught = e;
                }
            }
            expect(caught).toBeInstanceOf(WebAssembly.RuntimeError);
            expect((caught as Error).message).toMatch(/heap-growth budget exceeded:/);
            expect((caught as Error).message).toMatch(/consecutive over-cap/);
        } finally {
            instance.dispose();
            // Drop the retained arrays so subsequent tests start clean.
            retained.length = 0;
        }
    }));


    // setImmediate per N canon ops). With the default `maxCanonOpsWithoutYield`
    // budget, an unbounded spin aborts long before heap pressure becomes a
    // problem. This test runs an A1 spin under aggressive throttle (yield
    // every 10 ops) plus a tight canon-op cap and asserts:
    //   1. The instance terminates cleanly (no OOM, no hang).
    //   2. The Node.js heap delta over the spin stays bounded (well below
    //      iterations \u2014 i.e. Promises don't accumulate).
    test('E2: throttle Promise allocation does not exhaust JS heap', () => runWithVerbose(verbose, async () => {
        const aggressiveThrottle = 10;
        const opsCap = 100_000; // forces abort before heap can blow
        const component = await createComponent(BAD_GUESTS_WASM, { ...verboseOptions(verbose), yieldThrottle: aggressiveThrottle });
        const imports = {
            'test:bad-guests/async-host@0.1.0': {
                'async-fn': () => new Promise<number>(() => { /* never resolves */ }),
            },
        };
        const instance = await component.instantiate(imports, { limits: { maxCanonOpsWithoutYield: opsCap } });
        try {
            const iface = instance.exports[ATTACKS_INTERFACE] as Record<string, (it: number) => Promise<number> | number>;
            if (global.gc) global.gc();
            const heapBefore = process.memoryUsage().heapUsed;

            let caught: unknown;
            try {
                await iface['a1StreamReadCancelSpin']!(ITERATION_CAP);
            } catch (e) {
                caught = e;
            }
            // Either the canon-op cap aborted the instance OR the spin completed
            // (in which case the throttle yielded ~ITERATION_CAP/10 Promises).
            // Both outcomes count as "not an OOM".
            if (caught) {
                expect((caught as Error).message ?? String(caught)).toMatch(/canon-op budget exceeded/);
            }

            if (global.gc) global.gc();
            const heapAfter = process.memoryUsage().heapUsed;
            const heapDeltaMb = (heapAfter - heapBefore) / 1024 / 1024;
            // Heap growth must be bounded \u2014 a Promise-per-call leak at
            // 10M iterations would be hundreds of MB. Allow generous slack
            // (50 MB) for unrelated allocator noise.
            verbose.messages.push(`[E2] heap delta: ${heapDeltaMb.toFixed(2)} MB`);
            expect(heapDeltaMb).toBeLessThan(50);
        } finally {
            instance.dispose();
        }
    }));

    // E4: Mixing JSPI-yielding built-ins with non-JSPI hosts.
    // Same bytecode behaves differently on JSPI vs non-JSPI; security audit
    // must cover both. This test runs identical A1 attacks under both modes
    // and asserts both terminate within bounded iterations \u2014 verifying that
    // the security boundary (`maxCanonOpsWithoutYield`) holds regardless of
    // JSPI presence.
    test('E4: JSPI-throttle and non-JSPI canon-budget both terminate the same attack', () => runWithVerbose(verbose, async () => {
        // Mode A: JSPI throttle (yields every YIELD_THROTTLE ops). Spin
        // completes the full iteration count via cooperative microtask yields.
        const a = await loadAttacks();
        try {
            const probe = await probeAttack(verbose, 'e4-jspi', () => a.iface['a1StreamReadCancelSpin']!(ITERATION_CAP));
            expect(probe.iterations).toBe(ITERATION_CAP);
            expect(probe.tickedDuringCall).toBeGreaterThan(0);
        } finally {
            a.instance.dispose();
        }

        // Mode B: no throttle, only `maxCanonOpsWithoutYield` budget. Spin
        // aborts forcibly within the budget.
        const b = await loadAttacksNoThrottle(50_000);
        try {
            let caught: unknown;
            try {
                await b.iface['a1StreamReadCancelSpin']!(ITERATION_CAP);
            } catch (e) {
                caught = e;
            }
            expect(caught).toBeDefined();
            expect((caught as Error).message ?? String(caught)).toMatch(/canon-op budget exceeded/);
        } finally {
            b.instance.dispose();
        }
        // Parity: the same bytecode is bounded by EITHER mechanism. The host
        // never lets a guest spin unboundedly regardless of JSPI presence.
    }));

    // ---- Class F \u2014 host-implementation-specific (jsco today) ----
    // F1 and F5 (chunk pile-up, pumpIterable bound) are covered by tests in
    // tests/runtime/stream-table.test.ts.

    // F2: signalReady callbacks queued in entry.onReady[] accumulating without drain.
    // signalReady now mirrors checkWriteReady's "fire-and-clear" pattern: it
    // clears entry.onReady before invoking callbacks. Listeners that want to
    // keep watching must re-register via onReady().
    test('F2: signalReady callback list is cleared after dispatch', () => runWithVerbose(verbose, async () => {
        const { createStreamTable } = await import('../../../src/runtime/stream-table');
        const { createMemoryView } = await import('../../../src/runtime/memory');
        const mv = createMemoryView();
        const mem = new WebAssembly.Memory({ initial: 1 });
        mv.initialize(mem);
        let next = 2;
        const allocHandle = (): number => { const h = next; next += 2; return h; };
        const ctrl = new AbortController();
        const st = createStreamTable(mv, allocHandle, undefined, ctrl.signal);
        try {
            // Register N callbacks BEFORE the first chunk arrives. Use an
            // async iterable so pumpIterable triggers signalReady when each
            // chunk lands. Withholds the first chunk via a Deferred so we
            // can observe the queued callbacks pre-fire.
            const d1 = (): { promise: Promise<Uint8Array>, resolve: (v: Uint8Array) => void } => {
                let r!: (v: Uint8Array) => void;
                const promise = new Promise<Uint8Array>((res) => { r = res; });
                return { promise, resolve: r };
            };
            const first = d1();
            const second = d1();
            const gen = makeF2Gen(first.promise, second.promise);
            const handle = st.addReadable(0, gen);

            let fireCount = 0;
            const N = 50;
            for (let i = 0; i < N; i++) {
                st.onReady(handle, () => { fireCount++; });
            }
            expect(fireCount).toBe(0);

            // First chunk \u2192 signalReady fires all N once and clears the list.
            first.resolve(new Uint8Array([1]));
            await new Promise(r => setTimeout(r, 30));
            expect(fireCount).toBe(N);

            // Second chunk \u2192 signalReady on the (now-cleared) list must NOT
            // re-fire the same N callbacks. Without the fix, fireCount would
            // jump to 2N (and grow unboundedly per chunk).
            second.resolve(new Uint8Array([2]));
            await new Promise(r => setTimeout(r, 30));
            expect(fireCount).toBe(N);
        } finally {
            ctrl.abort();
            st.dispose();
        }
    }));

    // F3: AbortSignal listeners accumulating during a stream read/cancel-read spin.
    // The A1 spin (stream.read \u2192 stream.cancel-read) is purely synchronous: no
    // AbortSignal listeners are added per iteration. Stream-side waiters that
    // do add abort listeners use `{ once: true }` (browser/Node built-in
    // auto-removal) and explicit removeEventListener pairing on resolve.
    // This test verifies the heap delta during a long A1 spin stays bounded \u2014
    // a per-iteration listener leak would manifest as MB-scale heap growth.
    test('F3: AbortSignal listeners do not accumulate during read/cancel spin', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            if (global.gc) global.gc();
            const heapBefore = process.memoryUsage().heapUsed;
            await iface['a1StreamReadCancelSpin']!(ITERATION_CAP);
            if (global.gc) global.gc();
            const heapAfter = process.memoryUsage().heapUsed;
            const heapDeltaMb = (heapAfter - heapBefore) / 1024 / 1024;
            verbose.messages.push(`[F3] heap delta after ${ITERATION_CAP} iterations: ${heapDeltaMb.toFixed(2)} MB`);
            // A leaked listener-per-iteration at 10M iterations would
            // produce hundreds of MB. Allow generous slack (50 MB).
            expect(heapDeltaMb).toBeLessThan(50);
        } finally {
            instance.dispose();
        }
    }));

    // F4: Verbose logger accumulating messages in the test buffer under a long spin.
    //
    // STATUS: MITIGATED by bounded ring buffer in `createVerboseCapture()`.
    // Under a long spin in debug mode with `verbose: { executor: LogLevel.Detailed }`,
    // the per-test `messages` array would historically grow unboundedly,
    // accumulating hundreds of MB of diagnostic data in process memory.
    // The buffer now caps at `MAX_BUFFERED_MESSAGES` and reports the dropped
    // count on dump. This test exercises the cap directly via the logger
    // entrypoint and verifies (a) the buffer never exceeds the cap,
    // (b) the dropped counter advances, and (c) heap stays bounded.
    test('F4: verbose logger buffer is bounded under high-volume logging', () => runWithVerbose(verbose, async () => {
        const local = (await import('../../test-utils/verbose-logger')).createVerboseCapture();
        const N = 1_000_000;
        if (global.gc) global.gc();
        const heapBefore = process.memoryUsage().heapUsed;
        // Emit N log calls through the same entrypoint the runtime uses.
        for (let i = 0; i < N; i++) {
            local.logger('executor', 1, 'spin-iter', i, { handle: i & 0xffff });
        }
        if (global.gc) global.gc();
        const heapAfter = process.memoryUsage().heapUsed;
        const heapDeltaMb = (heapAfter - heapBefore) / 1024 / 1024;
        verbose.messages.push(`[F4] heap delta after ${N} log calls: ${heapDeltaMb.toFixed(2)} MB, dropped=${local.droppedCount}, retained=${local.messages.length}`);
        // (a) buffer is bounded
        expect(local.messages.length).toBeLessThanOrEqual(MAX_BUFFERED_MESSAGES);
        // (b) dropped counter accounts for everything beyond the cap
        expect(local.droppedCount).toBe(N - local.messages.length);
        // (c) heap stays bounded — 5000 short strings should be a few MB,
        // never the hundreds of MB the unbounded version produced.
        // Threshold is generous (80 MB) to absorb GC-timing variability
        // on CI runners; the unbounded version produced hundreds of MB.
        expect(heapDeltaMb).toBeLessThan(80);
        // sanity: most-recent messages preserved (ring buffer keeps the tail)
        expect(local.messages[local.messages.length - 1]).toContain(`spin-iter ${N - 1}`);
    }));
});
