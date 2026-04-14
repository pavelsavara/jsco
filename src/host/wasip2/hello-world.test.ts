// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * Hello-world integration test — minimal wasm32-wasip2 WASI command
 *
 * Covers scenarios from old wasi-hello.test.ts:
 * - Parser can read the component binary
 * - createComponent succeeds
 * - Instantiation with stdout capture
 * - noJspi option
 * - validateTypes option
 */

import { parse } from '../../parser';
import { createComponent } from '../../resolver';
import { createWasiP2Host } from './index';
import { WasiExit } from './types';
import { instantiateWasiComponent } from './instantiate';
import { initializeAsserts } from '../../utils/assert';
import { useVerboseOnFailure, verboseOptions, runWithVerbose } from '../../test-utils/verbose-logger';

initializeAsserts();

const helloWasm = './integration-tests/target/wasm32-wasip1/release/hello_world.wasm';

describe('hello-world component', () => {
    const verbose = useVerboseOnFailure();

    describe('parsing', () => {
        test('parser can read hello-world.wasm', async () => {
            const model = await parse(helloWasm);
            expect(model).toBeDefined();
            expect(model.length).toBeGreaterThan(0);
        });

        test('model contains multiple sections', async () => {
            const model = await parse(helloWasm);
            expect(model.length).toBeGreaterThan(5);
        });
    });

    describe('createComponent', () => {
        test('component can be created', async () => {
            const component = await createComponent(helloWasm);
            expect(component).toBeDefined();
            expect(component.instantiate).toBeDefined();
        });
    });

    describe('instantiation', () => {
        test('stdout captures println output', () => runWithVerbose(verbose, async () => {
            const chunks: Uint8Array[] = [];
            const wasiExports = createWasiP2Host({
                stdout: (bytes) => { chunks.push(new Uint8Array(bytes)); },
            });

            const component = await createComponent(helloWasm, verboseOptions(verbose));

            let exitCode: number | undefined;
            try {
                const instance = await component.instantiate(wasiExports);
                const runNs = (instance.exports['wasi:cli/run@0.2.11']
                    ?? instance.exports['wasi:cli/run']) as any;
                expect(runNs).toBeDefined();
                const result = await runNs.run();
                exitCode = (result?.tag === 'ok') ? 0 : 1;
            } catch (e) {
                if (e instanceof WasiExit) {
                    exitCode = e.status;
                } else {
                    throw e;
                }
            }

            const output = chunks.map(c => new TextDecoder().decode(c)).join('');
            expect(output).toContain('hello from jsco');
            expect(exitCode).toBe(0);
        }));
    });

    describe('instantiateWasiComponent', () => {
        test('end-to-end with stdout capture', () => runWithVerbose(verbose, async () => {
            const chunks: Uint8Array[] = [];

            let exitCode: number | undefined;
            try {
                const instance = await instantiateWasiComponent(
                    helloWasm,
                    { stdout: (bytes) => chunks.push(new Uint8Array(bytes)) },
                    undefined,
                    verboseOptions(verbose),
                );

                const run = (instance.exports as any)['wasi:cli/run@0.2.11']?.run;
                if (run) {
                    await run();
                    exitCode = 0;
                }
            } catch (e) {
                if (e instanceof WasiExit) {
                    exitCode = e.status;
                } else {
                    throw e;
                }
            }

            const output = chunks.map(c => new TextDecoder().decode(c)).join('');
            expect(output).toContain('hello from jsco');
            expect(exitCode).toBe(0);
        }));

        test('noJspi option works', () => runWithVerbose(verbose, async () => {
            const chunks: Uint8Array[] = [];

            let exitCode: number | undefined;
            try {
                const instance = await instantiateWasiComponent(
                    helloWasm,
                    { stdout: (bytes) => chunks.push(new Uint8Array(bytes)) },
                    undefined,
                    { noJspi: true, ...verboseOptions(verbose) },
                );

                const run = (instance.exports as any)['wasi:cli/run@0.2.11']?.run;
                if (run) {
                    run();
                    exitCode = 0;
                }
            } catch (e) {
                if (e instanceof WasiExit) {
                    exitCode = e.status;
                } else {
                    throw e;
                }
            }

            const output = chunks.map(c => new TextDecoder().decode(c)).join('');
            expect(output).toContain('hello from jsco');
            expect(exitCode).toBe(0);
        }));

        test('validateTypes option works', () => runWithVerbose(verbose, async () => {
            const chunks: Uint8Array[] = [];

            let exitCode: number | undefined;
            try {
                const instance = await instantiateWasiComponent(
                    helloWasm,
                    { stdout: (bytes) => chunks.push(new Uint8Array(bytes)) },
                    undefined,
                    { noJspi: true, validateTypes: true, ...verboseOptions(verbose) },
                );

                const run = (instance.exports as any)['wasi:cli/run@0.2.11']?.run;
                if (run) {
                    run();
                    exitCode = 0;
                }
            } catch (e) {
                if (e instanceof WasiExit) {
                    exitCode = e.status;
                } else {
                    throw e;
                }
            }

            const output = chunks.map(c => new TextDecoder().decode(c)).join('');
            expect(output).toContain('hello from jsco');
            expect(exitCode).toBe(0);
        }));
    });
});
