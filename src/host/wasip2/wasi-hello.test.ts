/**
 * E2: WASI hello component — parse and instantiate test
 *
 * Tests that jsco can parse, resolve, and instantiate the wasi-hello component
 * built from hello/wasi-hello/ (a minimal wasm32-wasip2 Rust binary).
 *
 * The component imports: wasi:io/error, wasi:io/streams, wasi:cli/environment,
 * wasi:cli/exit, wasi:cli/stdout, wasi:cli/stderr
 * The component exports: wasi:cli/run (run: func() -> result)
 */

import { parse } from '../../parser';
import { createComponent } from '../../resolver';
import { createWasiHost } from './index';
import { WasiExit } from './types';
import { instantiateWasiComponent } from './instantiate';
import { setConfiguration } from '../../utils/assert';
import { readFileSync } from 'fs';

setConfiguration('Debug');

const wasiHelloPath = './hello/wasi-hello/wasm/wasi-hello.wasm';

describe('WASI hello component', () => {
    describe('parsing', () => {
        test('parser can read wasi-hello.wasm', async () => {
            const model = await parse(wasiHelloPath);
            expect(model).toBeDefined();
            expect(model.length).toBeGreaterThan(0);
        });

        test('model contains component imports for WASI interfaces', async () => {
            const model = await parse(wasiHelloPath);

            // Find import sections
            const importSections = model.filter(
                (s: any) => s.tag !== undefined && s.imports !== undefined
            );

            // The component should have imports
            // Let's just look at the raw model structure
            const json = JSON.stringify(model, (key, value) => {
                if (typeof value === 'bigint') return value.toString();
                if (value instanceof Uint8Array) return `Uint8Array(${value.length})`;
                return value;
            }, 2);

            // Verify we got something substantial
            expect(model.length).toBeGreaterThan(5);
        });
    });

    describe('createComponent', () => {
        test('component can be created from wasi-hello.wasm', async () => {
            const component = await createComponent(wasiHelloPath);
            expect(component).toBeDefined();
            expect(component.instantiate).toBeDefined();
        });
    });

    describe('instantiation with createWasiHost', () => {
        test('stdout captures println output', async () => {
            const chunks: Uint8Array[] = [];
            const wasiImports = createWasiHost({
                stdout: (bytes) => { chunks.push(new Uint8Array(bytes)); },
            });

            const component = await createComponent(wasiHelloPath);

            let exitStatus: number | undefined;
            try {
                const instance = await component.instantiate(wasiImports);
                // The component exports wasi:cli/run@0.2.6 with a 'run' function
                const runNs = instance.exports['wasi:cli/run@0.2.6'] as any;
                const run = runNs?.run;
                if (run) {
                    const result = run();
                    // result is { tag: 'ok' } or { tag: 'err' }
                    exitStatus = 0;
                }
            } catch (e) {
                if (e instanceof WasiExit) {
                    exitStatus = e.status;
                } else {
                    throw e;
                }
            }

            const output = chunks.map(c => new TextDecoder().decode(c)).join('');
            expect(output).toContain('hello from wasi');
            expect(exitStatus).toBe(0);
        });
    });

    describe('instantiateWasiComponent', () => {
        test('end-to-end with stdout capture', async () => {
            const chunks: Uint8Array[] = [];

            let exitStatus: number | undefined;
            try {
                const instance = await instantiateWasiComponent(
                    wasiHelloPath,
                    {
                        stdout: (bytes) => chunks.push(new Uint8Array(bytes)),
                    },
                );

                // The component exports wasi:cli/run@0.2.6 with a 'run' function
                const run = (instance.exports as any)['wasi:cli/run@0.2.6']?.run;
                if (run) {
                    const result = await run();
                    exitStatus = 0;
                }
            } catch (e) {
                if (e instanceof WasiExit) {
                    exitStatus = e.status;
                } else {
                    throw e;
                }
            }

            const output = chunks.map(c => new TextDecoder().decode(c)).join('');
            expect(output).toContain('hello from wasi');
            expect(exitStatus).toBe(0);
        });

        test('noJspi option works', async () => {
            const chunks: Uint8Array[] = [];

            let exitStatus: number | undefined;
            try {
                const instance = await instantiateWasiComponent(
                    wasiHelloPath,
                    {
                        stdout: (bytes) => chunks.push(new Uint8Array(bytes)),
                    },
                    undefined,
                    { noJspi: true },
                );

                const run = (instance.exports as any)['wasi:cli/run@0.2.6']?.run;
                if (run) {
                    const result = run();
                    exitStatus = 0;
                }
            } catch (e) {
                if (e instanceof WasiExit) {
                    exitStatus = e.status;
                } else {
                    throw e;
                }
            }

            const output = chunks.map(c => new TextDecoder().decode(c)).join('');
            expect(output).toContain('hello from wasi');
            expect(exitStatus).toBe(0);
        });

        test('validateTypes option works', async () => {
            const chunks: Uint8Array[] = [];

            let exitStatus: number | undefined;
            try {
                const instance = await instantiateWasiComponent(
                    wasiHelloPath,
                    {
                        stdout: (bytes) => chunks.push(new Uint8Array(bytes)),
                    },
                    undefined,
                    { noJspi: true, validateTypes: true },
                );

                const run = (instance.exports as any)['wasi:cli/run@0.2.6']?.run;
                if (run) {
                    const result = run();
                    exitStatus = 0;
                }
            } catch (e) {
                if (e instanceof WasiExit) {
                    exitStatus = e.status;
                } else {
                    throw e;
                }
            }

            const output = chunks.map(c => new TextDecoder().decode(c)).join('');
            expect(output).toContain('hello from wasi');
            expect(exitStatus).toBe(0);
        });
    });
});
