// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * hello-p2-world integration test through the P2-via-P3 adapter.
 * Mirrors wasip2/hello-p2-world.test.ts — same WASM binary, same assertions,
 * but uses createWasiP3Host → createWasiP2ViaP3Adapter instead of createWasiP2Host.
 */

import { parse } from '../../parser';
import { createComponent } from '../../resolver';
import { createWasiP3Host } from '../wasip3/index';
import { createWasiP2ViaP3Adapter } from './index';
import { WasiExit } from '../wasip3/cli';
import { initializeAsserts } from '../../utils/assert';
import { useVerboseOnFailure, verboseOptions, runWithVerbose } from '../../test-utils/verbose-logger';

initializeAsserts();

const helloWasm = './integration-tests/target/wasm32-wasip1/release/hello_p2_world.wasm';

/** Create P2 exports via the adapter */
function createAdapterHost(options?: { stdout?: (bytes: Uint8Array) => void }) {
    const chunks: Uint8Array[] = [];
    const p3 = createWasiP3Host({
        stdout: new WritableStream({
            write(chunk) {
                if (options?.stdout) options.stdout(chunk);
                else chunks.push(new Uint8Array(chunk));
            },
        }),
    });
    return createWasiP2ViaP3Adapter(p3);
}

describe('hello-p2-world component (via P3 adapter)', () => {
    const verbose = useVerboseOnFailure();

    describe('parsing', () => {
        test('parser can read hello-p2-world.wasm', async () => {
            const model = await parse(helloWasm);
            expect(model).toBeDefined();
            expect(model.length).toBeGreaterThan(0);
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
            const wasiExports = createAdapterHost({
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
                    exitCode = e.exitCode;
                } else {
                    throw e;
                }
            }

            const output = chunks.map(c => new TextDecoder().decode(c)).join('');
            expect(output).toContain('hello from jsco');
            expect(exitCode).toBe(0);
        }));
    });

    describe('custom stdout fully replaces console', () => {
        test('custom stdout callback captures all output', () => runWithVerbose(verbose, async () => {
            const lines: string[] = [];

            const wasiExports = createAdapterHost({
                stdout: (bytes) => {
                    const text = new TextDecoder().decode(bytes);
                    lines.push(...text.split('\n').filter(l => l.length > 0));
                },
            });

            const component = await createComponent(helloWasm, verboseOptions(verbose));

            try {
                const instance = await component.instantiate(wasiExports);
                const runNs = (instance.exports['wasi:cli/run@0.2.11']
                    ?? instance.exports['wasi:cli/run']) as any;
                await runNs.run();
            } catch (e) {
                if (!(e instanceof WasiExit)) throw e;
            }

            expect(lines.length).toBeGreaterThan(0);
            expect(lines.some(l => l.includes('hello from jsco'))).toBe(true);
        }));
    });
});
