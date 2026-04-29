// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { initializeAsserts } from '../../src/utils/assert';
initializeAsserts();

import { createComponent } from '../../src/index';
import { useVerboseOnFailure, verboseOptions, runWithVerbose } from '../test-utils/verbose-logger';

const trapSyncWasm = './integration-tests/trap-sync-wat/trap-sync.wasm';
const trapImportWasm = './integration-tests/trap-import-wat/trap-import.wasm';
const disposeAsyncP3Wasm = './integration-tests/dispose-async-p3-wat/dispose-async-p3.wasm';

type SyncNs = {
    doTrap: () => void;
    doOk: () => number;
};

type CallerNs = {
    callHost: () => number;
    doOk: () => number;
};

type AsyncRunnerNs = {
    run: () => Promise<void>;
    doOk: () => number;
};

const syncOptions = (verbose: ReturnType<typeof useVerboseOnFailure>) => ({ noJspi: true as const, ...verboseOptions(verbose) });

describe('abort and dispose integration', () => {
    const verbose = useVerboseOnFailure();

    describe('trap during sync export', () => {
        test('sync WASM unreachable traps and poisons the instance', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(trapSyncWasm, syncOptions(verbose));
            const instance = await component.instantiate();
            const ns = instance.exports['test:trap/sync@0.1.0'] as SyncNs;

            expect(() => ns.doTrap()).toThrow();
        }));

        test('after trap, subsequent export call throws poisoned error', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(trapSyncWasm, syncOptions(verbose));
            const instance = await component.instantiate();
            const ns = instance.exports['test:trap/sync@0.1.0'] as SyncNs;

            expect(() => ns.doTrap()).toThrow();
            expect(() => ns.doOk()).toThrow('component instance is poisoned');
        }));

        test('abort() poisons the instance', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(trapSyncWasm, syncOptions(verbose));
            const instance = await component.instantiate();
            const ns = instance.exports['test:trap/sync@0.1.0'] as SyncNs;

            // Verify it works first
            expect(ns.doOk()).toBe(42);

            // Abort explicitly
            instance.abort();

            // Now all exports should throw poisoned
            expect(() => ns.doOk()).toThrow('component instance is poisoned');
        }));
    });

    describe('trap during lowered import call', () => {
        test('host import throws TypeError → instance poisoned', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(trapImportWasm, syncOptions(verbose));
            const imports = {
                'test:trap/host@0.1.0': {
                    callMe: () => { throw new TypeError('Cannot read properties of null'); },
                },
            };
            const instance = await component.instantiate(imports);
            const ns = instance.exports['test:trap/caller@0.1.0'] as CallerNs;

            expect(() => ns.callHost()).toThrow('Cannot read properties of null');
            expect(() => ns.doOk()).toThrow('component instance is poisoned');
        }));

        test('host import throws RangeError → instance poisoned', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(trapImportWasm, syncOptions(verbose));
            const imports = {
                'test:trap/host@0.1.0': {
                    callMe: () => { throw new RangeError('Invalid array length'); },
                },
            };
            const instance = await component.instantiate(imports);
            const ns = instance.exports['test:trap/caller@0.1.0'] as CallerNs;

            expect(() => ns.callHost()).toThrow('Invalid array length');
            expect(() => ns.doOk()).toThrow('component instance is poisoned');
        }));

        test('host import throws Error with no message → instance poisoned', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(trapImportWasm, syncOptions(verbose));
            const imports = {
                'test:trap/host@0.1.0': {
                    callMe: () => { throw new Error(); },
                },
            };
            const instance = await component.instantiate(imports);
            const ns = instance.exports['test:trap/caller@0.1.0'] as CallerNs;

            expect(() => ns.callHost()).toThrow();
            expect(() => ns.doOk()).toThrow('component instance is poisoned');
        }));

        test('host import succeeds → instance not poisoned', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(trapImportWasm, syncOptions(verbose));
            const imports = {
                'test:trap/host@0.1.0': {
                    callMe: () => 99,
                },
            };
            const instance = await component.instantiate(imports);
            const ns = instance.exports['test:trap/caller@0.1.0'] as CallerNs;

            expect(ns.callHost()).toBe(99);
            expect(ns.doOk()).toBe(42);
        }));
    });

    describe('explicit dispose', () => {
        test('dispose() makes all exports throw poisoned error', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(trapSyncWasm, syncOptions(verbose));
            const instance = await component.instantiate();
            const ns = instance.exports['test:trap/sync@0.1.0'] as SyncNs;

            // Works before dispose
            expect(ns.doOk()).toBe(42);

            instance.dispose();

            expect(() => ns.doOk()).toThrow('component instance is poisoned');
        }));

        test('dispose() is idempotent — calling twice does not throw', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(trapSyncWasm, syncOptions(verbose));
            const instance = await component.instantiate();

            instance.dispose();
            expect(() => instance.dispose()).not.toThrow();
        }));

        test('dispose() is callable even if no async operations are pending', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(trapSyncWasm, syncOptions(verbose));
            const instance = await component.instantiate();
            const ns = instance.exports['test:trap/sync@0.1.0'] as SyncNs;

            expect(ns.doOk()).toBe(42);
            expect(() => instance.dispose()).not.toThrow();
        }));
    });

    describe('concurrent exports after trap', () => {
        test('first trap poisons, second export sees poisoned immediately', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(trapSyncWasm, syncOptions(verbose));
            const instance = await component.instantiate();
            const ns = instance.exports['test:trap/sync@0.1.0'] as SyncNs;

            // First call traps
            expect(() => ns.doTrap()).toThrow();

            // Second call to different function sees poisoned
            expect(() => ns.doOk()).toThrow('component instance is poisoned');

            // Third call also poisoned
            expect(() => ns.doOk()).toThrow('component instance is poisoned');
        }));
    });

    describe('P3 async export — trap and dispose', () => {
        test('async host import throws synchronously → exported promise rejects, instance not poisoned', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(disposeAsyncP3Wasm, syncOptions(verbose));
            const imports = {
                'test:trap/host@0.1.0': {
                    blockMe: () => { throw new TypeError('host import failed'); },
                },
            };
            const instance = await component.instantiate(imports);
            const ns = instance.exports['test:trap/async-runner@0.1.0'] as AsyncRunnerNs;

            await expect(ns.run()).rejects.toThrow();
            // Sync throw through async lower does not poison — instance still usable
            expect(ns.doOk()).toBe(42);
        }));

        test('async host import rejects → subtask completes, instance not poisoned', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(disposeAsyncP3Wasm, syncOptions(verbose));
            const imports = {
                'test:trap/host@0.1.0': {
                    blockMe: (): Promise<void> => Promise.reject(new Error('network error')),
                },
            };
            const instance = await component.instantiate(imports);
            const ns = instance.exports['test:trap/async-runner@0.1.0'] as AsyncRunnerNs;

            // A rejected host-import Promise is consumed by the subtask
            // table (state → RETURNED, see src/runtime/subtask-table.ts).
            // The guest's async lower path observes a normal completion —
            // it does NOT poison the whole instance, and a follow-up
            // export call must succeed.
            await ns.run();
            expect(ns.doOk()).toBe(42);
        }));

        test('async host import completes normally → run resolves', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(disposeAsyncP3Wasm, syncOptions(verbose));
            const imports = {
                'test:trap/host@0.1.0': {
                    blockMe: () => { /* void — completes synchronously */ },
                },
            };
            const instance = await component.instantiate(imports);
            const ns = instance.exports['test:trap/async-runner@0.1.0'] as AsyncRunnerNs;

            await ns.run();
            // If we get here without timeout, the async export completed
            expect(ns.doOk()).toBe(42);
        }));

        test('dispose() mid-wait rejects async export, poisons instance', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(disposeAsyncP3Wasm, syncOptions(verbose));
            const { promise: blockPromise, resolve: unblock } = Promise.withResolvers<void>();
            const imports = {
                'test:trap/host@0.1.0': {
                    blockMe: () => blockPromise,
                },
            };
            const instance = await component.instantiate(imports);
            const ns = instance.exports['test:trap/async-runner@0.1.0'] as AsyncRunnerNs;

            // Start async export — it will wait on the host promise
            const runPromise = ns.run();

            // Give the event loop a tick to enter the wait
            await new Promise(r => setTimeout(r, 10));

            // Dispose mid-wait
            instance.dispose();

            // The run promise should reject
            await expect(runPromise).rejects.toThrow();

            // Instance is poisoned
            expect(() => ns.doOk()).toThrow('component instance is poisoned');

            // Resolve the blocked promise after dispose — should not crash
            unblock();
            await new Promise(r => setTimeout(r, 10));
        }));

        test('late resolution after dispose does not crash', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(disposeAsyncP3Wasm, syncOptions(verbose));
            const { promise: blockPromise, resolve: unblock } = Promise.withResolvers<void>();
            const imports = {
                'test:trap/host@0.1.0': {
                    blockMe: () => blockPromise,
                },
            };
            const instance = await component.instantiate(imports);
            const ns = instance.exports['test:trap/async-runner@0.1.0'] as AsyncRunnerNs;

            const runPromise = ns.run();
            await new Promise(r => setTimeout(r, 10));

            instance.dispose();
            await expect(runPromise).rejects.toThrow();

            // Late resolution should not cause unhandled rejection
            unblock();
            await new Promise(r => setTimeout(r, 50));
        }));
    });
});
