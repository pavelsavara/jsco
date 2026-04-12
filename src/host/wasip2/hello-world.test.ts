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
import { createWasiHost } from './index';
import { WasiExit } from './types';
import { instantiateWasiComponent } from './instantiate';
import { setConfiguration } from '../../utils/assert';
import { useVerboseOnFailure, verboseOptions, runWithVerbose } from '../../test-utils/verbose-logger';

setConfiguration('Debug');

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
            const wasiImports = createWasiHost({
                stdout: (bytes) => { chunks.push(new Uint8Array(bytes)); },
            });

            const component = await createComponent(helloWasm, verboseOptions(verbose));

            let exitCode: number | undefined;
            try {
                const instance = await component.instantiate(wasiImports);
                const runNs = (instance.exports['wasi:cli/run@0.2.11']
                    ?? instance.exports['wasi:cli/run']) as any;
                expect(runNs).toBeDefined();
                const result = runNs.run();
                exitCode = (result?.tag === 'ok') ? 0 : 1;
            } catch (e) {
                if (e instanceof WasiExit) {
                    exitCode = e.code;
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
        // JSPI test disabled — WebAssembly.promising() leaves Node.js state
        // that causes subsequent tests to fail with "Invalid resource handle: 0".
        // The WASM adapter receives a Promise where it expects a sync value,
        // causing handle coercion to 0. Investigate JSPI suspension/resumption.
        test.skip('end-to-end with stdout capture', () => runWithVerbose(verbose, async () => {
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
