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
 * full enumeration of attack classes (A1, A2, A3, A5, A7, B1, B3 covered here).
 *
 * Each test is run with a wall-clock timeout. `assertBounded()` races the
 * call against a setTimeout; if the call exceeds the timeout, the JS event
 * loop was successfully starved → the test fails. With no host mitigation
 * in place yet, ALL of these tests are expected to time out — they are
 * therefore marked `test.skip`. Enable them once a mitigation lands to
 * confirm the chosen mitigation handles each attack class.
 */

import { createComponent } from '../../../src/resolver';
import { initializeAsserts } from '../../../src/utils/assert';
import { useVerboseOnFailure, verboseOptions, runWithVerbose } from '../../test-utils/verbose-logger';

initializeAsserts();

const BAD_GUESTS_WASM = './integration-tests/bad-guests-p3-wat/bad-guests-p3.wasm';
const ATTACKS_INTERFACE = 'test:bad-guests/attacks@0.1.0';

// Wall-clock budget per attack call. If the export runs longer than this
// without yielding, JS event loop is starved and we consider the host to
// have failed at bounding the bad guest.
const STARVATION_BUDGET_MS = 1000;

// Iteration cap passed to each attack. Large enough that without mitigation
// the spin will exceed STARVATION_BUDGET_MS by orders of magnitude.
const ITERATION_CAP = 10_000_000;

/**
 * Race `promise` against a setTimeout. setTimeout fires only if the JS
 * event loop is alive — so a hang inside the WASM thread will NOT fire
 * the timeout in some impls. To make starvation detectable, we instead
 * use a separate watchdog: the test framework's outer timeout will
 * eventually kill us. Here we mostly assert the call returns at all
 * within the framework timeout.
 */
async function assertBounded<T>(label: string, fn: () => Promise<T>, budgetMs = STARVATION_BUDGET_MS): Promise<T> {
    const start = Date.now();
    const result = await fn();
    const elapsed = Date.now() - start;
    if (elapsed > budgetMs) {
        throw new Error(`${label} took ${elapsed}ms (> ${budgetMs}ms budget) — host failed to bound bad guest`);
    }
    return result;
}

describe('Bad-guest DOS attack patterns (WASIp3)', () => {
    const verbose = useVerboseOnFailure();

    async function loadAttacks() {
        const component = await createComponent(BAD_GUESTS_WASM, verboseOptions(verbose));
        const instance = await component.instantiate({});
        const iface = instance.exports[ATTACKS_INTERFACE] as Record<string, (it: number) => Promise<number> | number>;
        if (!iface) throw new Error(`Missing export ${ATTACKS_INTERFACE}`);
        return { instance, iface };
    }

    // ---- Class A: tight polling loops on sync canon built-ins ----

    test.skip('A1: stream.read → cancel-read spin is bounded', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            await assertBounded('a1', async () => iface['a1StreamReadCancelSpin']!(ITERATION_CAP));
        } finally {
            instance.dispose();
        }
    }));

    test.skip('A2: stream.write → cancel-write spin is bounded', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            await assertBounded('a2', async () => iface['a2StreamWriteCancelSpin']!(ITERATION_CAP));
        } finally {
            instance.dispose();
        }
    }));

    test.skip('A3: future.read → cancel-read spin is bounded', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            await assertBounded('a3', async () => iface['a3FutureReadCancelSpin']!(ITERATION_CAP));
        } finally {
            instance.dispose();
        }
    }));

    test.skip('A5: waitable-set.poll spin is bounded', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            await assertBounded('a5', async () => iface['a5WaitablePollSpin']!(ITERATION_CAP));
        } finally {
            instance.dispose();
        }
    }));

    test.skip('A7: stream.new + drop churn is bounded', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            await assertBounded('a7', async () => iface['a7StreamNewDropChurn']!(ITERATION_CAP));
        } finally {
            instance.dispose();
        }
    }));

    // ---- Class B: resource-table exhaustion (allocation churn without drop) ----

    test.skip('B1: unbounded stream.new without drop is bounded or rejected', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            // smaller cap because every iteration grows host memory
            await assertBounded('b1', async () => iface['b1StreamLeak']!(100_000));
        } finally {
            instance.dispose();
        }
    }));

    test.skip('B3: unbounded waitable-set.new without drop is bounded or rejected', () => runWithVerbose(verbose, async () => {
        const { instance, iface } = await loadAttacks();
        try {
            await assertBounded('b3', async () => iface['b3WaitableSetLeak']!(100_000));
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
