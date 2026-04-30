// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

/**
 * WASIp3 multi-async / concurrent host-call integration tests.
 *
 * Two scenarios:
 *
 *  1. **Multiple subtasks joined to one waitable-set** — the guest's `start`
 *     fires two `canon lower (... async)` host calls and joins the resulting
 *     subtasks to a single waitable-set. The callback fires once per resolved
 *     subtask and only EXITs after both have been delivered.
 *
 *  2. **Concurrent JS-side invocations of the same export** — JS invokes the
 *     same async export N times before any has resolved, then settles the
 *     host-side Promises in arbitrary order. Each guest task must run
 *     independently (independent waitable-sets, independent ctx slots,
 *     independent subtask handles) and complete in the order JS resolves.
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

describe('Multi-async / concurrent host-call patterns (WASIp3)', () => {
    const verbose = useVerboseOnFailure();

    test('wait-two-parallel: two subtasks on one waitable-set both complete', () => runWithVerbose(verbose, async () => {
        // Each `slow-fn` call returns a fresh deferred Promise so the test
        // can resolve them independently and verify the guest sees both events.
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

            // Kick off the export — it issues two slow-fn calls before suspending.
            const completion = runner['waitTwoParallel']!();

            // Yield until both subtasks have been spawned (microtask drain).
            for (let i = 0; i < 10 && pending.length < 2; i++) {
                await new Promise<void>(r => setImmediate(r));
            }
            expect(pending.length).toBe(2);

            // Resolve out of order — second one first — to check that the
            // callback handles either delivery order.
            pending[1]!.resolve();
            await new Promise<void>(r => setImmediate(r));
            pending[0]!.resolve();

            await completion;
        } finally {
            instance.dispose();
        }
    }));

    test('wait-once: 5 concurrent JS invocations all run independently', () => runWithVerbose(verbose, async () => {
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

            const N = 5;
            const completions: Promise<void>[] = [];
            for (let i = 0; i < N; i++) {
                completions.push(runner['waitOnce']!());
            }

            // All N export calls must each spawn one slow-fn subtask before
            // any resolves — verifies the host can keep N guest tasks in flight.
            for (let i = 0; i < 50 && pending.length < N; i++) {
                await new Promise<void>(r => setImmediate(r));
            }
            expect(pending.length).toBe(N);

            // Resolve in reverse order; each completion must still fire.
            for (let i = N - 1; i >= 0; i--) {
                pending[i]!.resolve();
            }

            await Promise.all(completions);
        } finally {
            instance.dispose();
        }
    }));

    test('wait-once: re-invocation while previous call is still suspended', () => runWithVerbose(verbose, async () => {
        // Variant of the concurrent-invocation test that interleaves resolves
        // and new invocations, mimicking a real reactor receiving requests
        // while still processing earlier ones.
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

            // Round 1: one call in flight.
            const c1 = runner['waitOnce']!();
            for (let i = 0; i < 10 && pending.length < 1; i++) {
                await new Promise<void>(r => setImmediate(r));
            }
            expect(pending.length).toBe(1);

            // Round 2: kick off two more BEFORE resolving c1's slow-fn.
            const c2 = runner['waitOnce']!();
            const c3 = runner['waitOnce']!();
            for (let i = 0; i < 20 && pending.length < 3; i++) {
                await new Promise<void>(r => setImmediate(r));
            }
            expect(pending.length).toBe(3);

            // Resolve middle one first — c2 should complete while c1, c3 wait.
            pending[1]!.resolve();
            await c2;

            // Now resolve the rest.
            pending[0]!.resolve();
            pending[2]!.resolve();
            await Promise.all([c1, c3]);
        } finally {
            instance.dispose();
        }
    }));
});
