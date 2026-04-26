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
import { useVerboseOnFailure, verboseOptions, runWithVerbose } from '../../test-utils/verbose-logger';

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

async function probeAttack(label: string, fn: () => Promise<unknown> | unknown): Promise<AttackProbe> {
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

    // eslint-disable-next-line no-console
    console.log(`[probe] ${label}: ticked=${tickedDuringCall}/${PRE_SCHEDULED_TICKS} iterations=${iterations} elapsed=${elapsedMs}ms`);

    return { tickedDuringCall, iterations, elapsedMs };
}

function expectYielded(probe: AttackProbe, expectedIterations: number): void {
    expect(probe.iterations).toBe(expectedIterations);
    expect(probe.tickedDuringCall).toBeGreaterThan(0);
}

describe('Bad-guest DOS attack patterns (WASIp3)', () => {
    const verbose = useVerboseOnFailure();

    async function loadAttacks() {
        const component = await createComponent(BAD_GUESTS_WASM, { ...verboseOptions(verbose), yieldThrottle: YIELD_THROTTLE });
        const instance = await component.instantiate({});
        const iface = instance.exports[ATTACKS_INTERFACE] as Record<string, (it: number) => Promise<number> | number>;
        if (!iface) throw new Error(`Missing export ${ATTACKS_INTERFACE}`);
        return { instance, iface };
    }

    // ---- Class A: tight polling loops on sync canon built-ins ----

    test('A1: stream.read → cancel-read yields to event loop', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            const probe = await probeAttack('a1', () => iface['a1StreamReadCancelSpin']!(ITERATION_CAP));
            expectYielded(probe, ITERATION_CAP);
        } finally {
            instance.dispose();
        }
    }));

    test('A2: stream.write → cancel-write yields to event loop', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            const probe = await probeAttack('a2', () => iface['a2StreamWriteCancelSpin']!(ITERATION_CAP));
            expectYielded(probe, ITERATION_CAP);
        } finally {
            instance.dispose();
        }
    }));

    test('A3: future.read → cancel-read yields to event loop', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            const probe = await probeAttack('a3', () => iface['a3FutureReadCancelSpin']!(ITERATION_CAP));
            expectYielded(probe, ITERATION_CAP);
        } finally {
            instance.dispose();
        }
    }));

    test('A4: future.write → cancel-write yields to event loop', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            const probe = await probeAttack('a4', () => iface['a4FutureWriteCancelSpin']!(ITERATION_CAP));
            expectYielded(probe, ITERATION_CAP);
        } finally {
            instance.dispose();
        }
    }));

    test('A5: waitable-set.poll yields to event loop', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            const probe = await probeAttack('a5', () => iface['a5WaitablePollSpin']!(ITERATION_CAP));
            expectYielded(probe, ITERATION_CAP);
        } finally {
            instance.dispose();
        }
    }));

    test('A7: stream.new + drop churn yields to event loop', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            const probe = await probeAttack('a7', () => iface['a7StreamNewDropChurn']!(ITERATION_CAP));
            expectYielded(probe, ITERATION_CAP);
        } finally {
            instance.dispose();
        }
    }));

    test('A8: waitable-set.new + drop churn yields to event loop', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            const probe = await probeAttack('a8', () => iface['a8WaitableSetNewDropChurn']!(ITERATION_CAP));
            expectYielded(probe, ITERATION_CAP);
        } finally {
            instance.dispose();
        }
    }));

    // ---- Class B: resource-table exhaustion (allocation churn without drop) ----

    test('B1: unbounded stream.new without drop yields to event loop', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            const probe = await probeAttack('b1', () => iface['b1StreamLeak']!(ITERATION_CAP_ALLOC));
            expectYielded(probe, ITERATION_CAP_ALLOC);
        } finally {
            instance.dispose();
        }
    }));

    test('B2: unbounded future.new without drop yields to event loop', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            const probe = await probeAttack('b2', () => iface['b2FutureLeak']!(ITERATION_CAP_ALLOC));
            expectYielded(probe, ITERATION_CAP_ALLOC);
        } finally {
            instance.dispose();
        }
    }));

    test('B3: unbounded waitable-set.new without drop yields to event loop', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            const probe = await probeAttack('b3', () => iface['b3WaitableSetLeak']!(ITERATION_CAP_ALLOC));
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
});
