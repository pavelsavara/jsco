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
import { useVerboseOnFailure, verboseOptions, runWithVerbose, type VerboseCapture } from '../../test-utils/verbose-logger';

initializeAsserts();

const BAD_GUESTS_WASM = './integration-tests/bad-guests-p3-wat/bad-guests-p3.wasm';
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

describe('Bad-guest DOS attack patterns (WASIp3)', () => {
    const verbose = useVerboseOnFailure();

    async function loadAttacks(extraConfig?: { limits?: { maxHandles?: number; maxMemoryBytes?: number } }) {
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

    // ---- Class C \u2014 re-entrant / nested call abuse ----

    // C1: Reentrant export call from inside an import handler.
    // Guest calls JS, JS calls a guest export that calls JS again \u2014 unbounded JS stack.
    // Mitigation: depth counter on the binding context, trap above N.
    test.skip('C1: reentrant export-from-import recursion traps before stack overflow', () => runWithVerbose(verbose, async () => {
        // Fixture must wire a JS import that calls back into a guest export.
        // Skipped \u2014 fixture not yet written.
        expect(true).toBe(false);
    }));

    // C2: task.return called while a subtask is still pending.
    test.skip('C2: task.return on still-pending subtask traps', () => runWithVerbose(verbose, async () => {
        expect(true).toBe(false);
    }));

    // C3: resource.drop on a borrowed handle that the host still references,
    // triggering host-side [dtor] reentrancy.
    test.skip('C3: resource.drop reentrancy on borrowed handle traps', () => runWithVerbose(verbose, async () => {
        expect(true).toBe(false);
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
    // The `cli_hello_stdout` deadlock reproduced during the original Proposal-1
    // attempt. Mitigation: never suspend a single Rust future from the host;
    // only yield a microtask. Test would assert that a JSPI-suspending built-in
    // does NOT block sibling futures inside the same task.
    test.skip('E1: JSPI suspend in join! arm does not starve sibling arms', () => runWithVerbose(verbose, async () => {
        expect(true).toBe(false);
    }));

    // E2: Forcing the host to allocate one Promise per call with no upper bound.
    // Mitigation: cap microtask queue depth or use a shared resolver.
    test.skip('E2: Promise-per-call attack does not exhaust JS heap', () => runWithVerbose(verbose, async () => {
        expect(true).toBe(false);
    }));

    // E3: A cancel-read/cancel-write Promise that resolves but never lets the
    // suspending guest continue.
    test.skip('E3: cancel Promise resolution lets suspending guest continue', () => runWithVerbose(verbose, async () => {
        expect(true).toBe(false);
    }));

    // E4: Mixing JSPI-yielding built-ins with non-JSPI hosts.
    // Same bytecode behaves differently on JSPI vs non-JSPI; security audit
    // must cover both. Test: run identical attack under both modes, assert
    // both terminate within the same iteration budget.
    test.skip('E4: JSPI vs non-JSPI parity for yielding built-ins', () => runWithVerbose(verbose, async () => {
        expect(true).toBe(false);
    }));

    // ---- Class F \u2014 host-implementation-specific (jsco today) ----
    // F1 and F5 (chunk pile-up, pumpIterable bound) are covered by tests in
    // tests/runtime/stream-table.test.ts.

    // F2: signalReady callbacks queued in entry.onReady[] accumulating without drain.
    // Test: register many callbacks, signal once, verify the array is emptied
    // (not just that callbacks fire). Mitigation already in stream-table:
    // checkWriteReady clears entry.onWriteReady before firing.
    test.skip('F2: signalReady callback list is cleared after dispatch', () => runWithVerbose(verbose, async () => {
        expect(true).toBe(false);
    }));

    // F3: AbortSignal listeners accumulating on a stream that is read/cancel-read spun.
    // Test: spin A1 for N iterations, assert the stream entry's signal listener
    // count stays bounded.
    test.skip('F3: AbortSignal listeners do not accumulate during read/cancel spin', () => runWithVerbose(verbose, async () => {
        expect(true).toBe(false);
    }));

    // F4: Verbose logger accumulating messages in the test buffer under a long spin.
    // Not a runtime DOS \u2014 a test-infrastructure concern. Mitigation: cap
    // capture.messages length when isDebug is false in CI.
    test.skip('F4: verbose logger does not accumulate unbounded messages under spin', () => runWithVerbose(verbose, async () => {
        expect(true).toBe(false);
    }));
});
