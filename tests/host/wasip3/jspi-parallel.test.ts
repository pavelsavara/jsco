// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

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
});
