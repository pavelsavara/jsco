/**
 * Integration tests — consumer, forwarder, implementer composition scenarios
 *
 * Scenario A: consumer ← JS host (direct)
 * Scenario B: consumer ← forwarder ← JS host (2-level composition)
 * Scenario C: consumer ← forwarder ← implementer (3-level, no JS WASI)
 */

import { createComponent } from '../../resolver';
import { createWasiHost } from './index';
import { WasiExit } from './types';
import { setConfiguration } from '../../utils/assert';
import { useVerboseOnFailure, verboseOptions, runWithVerbose } from '../../test-utils/verbose-logger';

setConfiguration('Debug');

const consumerWasm = './integration-tests/target/wasm32-wasip1/release/consumer.wasm';
const forwarderWasm = './integration-tests/target/wasm32-wasip1/release/forwarder.wasm';
const implementerWasm = './integration-tests/target/wasm32-wasip1/release/implementer.wasm';

interface CounterState {
    value: number;
}

function createTestImports(logMessages: string[], stderrChunks: string[]) {
    const counters = new Map<number, CounterState>();
    let nextCounterId = 1;

    const loggerImport = {
        log: (level: number, message: string) => {
            const levels = ['trace', 'debug', 'info', 'warn', 'error'];
            logMessages.push(`[${levels[level] ?? level}] ${message}`);
        },
        'structured-log': (level: number, message: string, properties: Array<[string, string]>) => {
            const levels = ['trace', 'debug', 'info', 'warn', 'error'];
            const props = properties.map(([k, v]) => `${k}=${v}`).join(', ');
            logMessages.push(`[${levels[level] ?? level}] ${message} {${props}}`);
        },
    };

    const counterImport = {
        '[constructor]counter': (name: string): number => {
            const id = nextCounterId++;
            counters.set(id, { value: 0 });
            return id;
        },
        '[method]counter.increment': (self: number) => {
            const c = counters.get(self);
            if (c) c.value++;
        },
        '[method]counter.get': (self: number): bigint => {
            const c = counters.get(self);
            return BigInt(c?.value ?? 0);
        },
        '[resource-drop]counter': (self: number) => {
            counters.delete(self);
        },
    };

    return {
        'jsco:test/logger@0.1.0': loggerImport,
        'jsco:test/counter@0.1.0': counterImport,
    };
}

function parseTestResults(stdout: string): { name: string; passed: boolean; reason?: string }[] {
    const results: { name: string; passed: boolean; reason?: string }[] = [];
    for (const line of stdout.split('\n')) {
        const passMatch = line.match(/^\[PASS\] (.+)$/);
        if (passMatch) {
            results.push({ name: passMatch[1], passed: true });
            continue;
        }
        const failMatch = line.match(/^\[FAIL\] ([^:]+): (.+)$/);
        if (failMatch) {
            results.push({ name: failMatch[1], passed: false, reason: failMatch[2] });
        }
    }
    return results;
}

describe('Integration tests', () => {
    const verbose = useVerboseOnFailure();

    describe('Scenario A: consumer-direct', () => {
        test('consumer runs all tests via JS WASI host', () => runWithVerbose(verbose, async () => {
            const stdoutChunks: Uint8Array[] = [];
            const stderrChunks: string[] = [];
            const logMessages: string[] = [];

            const wasiImports = createWasiHost({
                args: ['consumer-test', '--scenario', 'A'],
                env: [
                    ['TEST_SPECIAL', 'hello=world 🌍'],
                    ['HOME', '/test/home'],
                    ['PATH', '/usr/bin'],
                ],
                stdout: (bytes) => { stdoutChunks.push(new Uint8Array(bytes)); },
                stderr: (bytes) => {
                    stderrChunks.push(new TextDecoder().decode(bytes));
                },
            });

            const extraImports = createTestImports(logMessages, stderrChunks);
            const mergedImports = { ...wasiImports, ...extraImports };

            const component = await createComponent(consumerWasm, verboseOptions(verbose));
            let exitCode: number | undefined;

            try {
                const instance = await component.instantiate(mergedImports);
                // Find the run export — could be versioned
                const runNs = (instance.exports['wasi:cli/run@0.2.11']
                    ?? instance.exports['wasi:cli/run']) as any;
                expect(runNs).toBeDefined();
                const result = runNs.run();
                // result is { tag: 'ok' } or { tag: 'err' }
                if (result && typeof result === 'object' && 'tag' in result) {
                    exitCode = result.tag === 'ok' ? 0 : 1;
                } else {
                    exitCode = 0;
                }
            } catch (e) {
                if (e instanceof WasiExit) {
                    exitCode = e.code;
                } else {
                    throw e;
                }
            }

            const stdout = new TextDecoder().decode(
                new Uint8Array(stdoutChunks.reduce((acc, c) => [...acc, ...c], [] as number[]))
            );
            const testResults = parseTestResults(stdout);

            // Check we got test results
            expect(testResults.length).toBeGreaterThan(0);

            // Create individual assertions per test
            for (const result of testResults) {
                expect({ test: result.name, passed: result.passed, reason: result.reason })
                    .toEqual({ test: result.name, passed: true, reason: undefined });
            }

            // Verify logger was called
            expect(logMessages.length).toBeGreaterThan(0);

            // Verify exit code
            expect(exitCode).toBe(0);
        }));
    });

    describe('Scenario B: consumer ← forwarder ← JS host', () => {
        test('consumer runs all tests through forwarder', () => runWithVerbose(verbose, async () => {
            const stdoutChunks: Uint8Array[] = [];
            const stderrChunks: string[] = [];
            const logMessages: string[] = [];

            // 1. Create full JS WASI host
            const wasiImports = createWasiHost({
                args: ['consumer-test', '--scenario', 'B'],
                env: [
                    ['TEST_SPECIAL', 'hello=world 🌍'],
                    ['HOME', '/test/home'],
                    ['PATH', '/usr/bin'],
                ],
                stdout: (bytes) => { stdoutChunks.push(new Uint8Array(bytes)); },
                stderr: (bytes) => {
                    stderrChunks.push(new TextDecoder().decode(bytes));
                },
            });

            const extraImports = createTestImports(logMessages, stderrChunks);

            // 2. Instantiate forwarder with JS WASI host + logger
            const forwarderComponent = await createComponent(forwarderWasm, verboseOptions(verbose));
            const forwarderInstance = await forwarderComponent.instantiate({
                ...wasiImports,
                ...extraImports,
            });

            // 3. Build consumer imports: forwarder's exported WASI + JS host io + custom imports
            const forwarderExports = forwarderInstance.exports as Record<string, Record<string, Function>>;

            // Interfaces the forwarder exports (overriding JS host)
            const forwardedInterfaces = [
                'wasi:cli/environment', 'wasi:cli/exit',
                'wasi:cli/stdin', 'wasi:cli/stdout', 'wasi:cli/stderr',
                'wasi:random/random',
                'wasi:clocks/monotonic-clock', 'wasi:clocks/wall-clock',
            ];

            const consumerImports: Record<string, Record<string, Function>> = { ...wasiImports, ...extraImports };

            // Override with forwarder's exports (try versioned first, then unversioned)
            for (const iface of forwardedInterfaces) {
                const exported = forwarderExports[`${iface}@0.2.11`] ?? forwarderExports[iface];
                if (exported) {
                    // Register both versioned and unversioned
                    consumerImports[iface] = exported;
                    consumerImports[`${iface}@0.2.11`] = exported;
                }
            }

            // 4. Instantiate consumer with merged imports
            const consumerComponent = await createComponent(consumerWasm, verboseOptions(verbose));
            let exitCode: number | undefined;

            try {
                const instance = await consumerComponent.instantiate(consumerImports);
                const runNs = (instance.exports['wasi:cli/run@0.2.11']
                    ?? instance.exports['wasi:cli/run']) as any;
                expect(runNs).toBeDefined();
                const result = runNs.run();
                if (result && typeof result === 'object' && 'tag' in result) {
                    exitCode = result.tag === 'ok' ? 0 : 1;
                } else {
                    exitCode = 0;
                }
            } catch (e) {
                if (e instanceof WasiExit) {
                    exitCode = e.code;
                } else {
                    throw e;
                }
            }

            const stdout = new TextDecoder().decode(
                new Uint8Array(stdoutChunks.reduce((acc, c) => [...acc, ...c], [] as number[]))
            );
            const testResults = parseTestResults(stdout);

            expect(testResults.length).toBeGreaterThan(0);

            for (const result of testResults) {
                expect({ test: result.name, passed: result.passed, reason: result.reason })
                    .toEqual({ test: result.name, passed: true, reason: undefined });
            }

            // Verify logger was called AND forwarder logged its interceptions
            expect(logMessages.length).toBeGreaterThan(0);
            const forwarderLogs = logMessages.filter(m => m.includes('[forwarder]'));
            expect(forwarderLogs.length).toBeGreaterThan(0);

            expect(exitCode).toBe(0);
        }));
    });

    describe('Scenario C: consumer ← forwarder ← implementer', () => {
        test('consumer runs all tests through forwarder + implementer', () => runWithVerbose(verbose, async () => {
            const stdoutChunks: Uint8Array[] = [];
            const stderrChunks: string[] = [];
            const logMessages: string[] = [];

            // 1. Instantiate implementer — needs io/* from JS host even though it only exports
            //    (WASI preview1 adapter embedded in the component requires io/streams)
            const implHostImports = createWasiHost({});
            const implementerComponent = await createComponent(implementerWasm, verboseOptions(verbose));
            const implementerInstance = await implementerComponent.instantiate(implHostImports);
            const implExports = implementerInstance.exports as Record<string, Record<string, Function>>;

            // 2. Create JS WASI host for stdin/stdout/stderr + io interfaces
            const wasiImports = createWasiHost({
                stdout: (bytes) => { stdoutChunks.push(new Uint8Array(bytes)); },
                stderr: (bytes) => {
                    stderrChunks.push(new TextDecoder().decode(bytes));
                },
            });

            const extraImports = createTestImports(logMessages, stderrChunks);

            // 3. Instantiate forwarder with implementer's WASI + JS host stdin/stdout/stderr + logger
            //    Implementer provides: environment, exit, random, clocks
            //    JS host provides: stdin, stdout, stderr, io/*
            const implementerInterfaces = [
                'wasi:cli/environment', 'wasi:cli/exit',
                'wasi:random/random',
                'wasi:clocks/monotonic-clock', 'wasi:clocks/wall-clock',
            ];

            const forwarderImports: Record<string, Record<string, Function>> = { ...wasiImports, ...extraImports };
            for (const iface of implementerInterfaces) {
                const exported = implExports[`${iface}@0.2.11`] ?? implExports[iface];
                if (exported) {
                    forwarderImports[iface] = exported;
                    forwarderImports[`${iface}@0.2.11`] = exported;
                }
            }

            const forwarderComponent = await createComponent(forwarderWasm, verboseOptions(verbose));
            const forwarderInstance = await forwarderComponent.instantiate(forwarderImports);
            const forwarderExports = forwarderInstance.exports as Record<string, Record<string, Function>>;

            // 4. Build consumer imports: forwarder's exported WASI + JS host io + custom imports
            const forwardedInterfaces = [
                'wasi:cli/environment', 'wasi:cli/exit',
                'wasi:cli/stdin', 'wasi:cli/stdout', 'wasi:cli/stderr',
                'wasi:random/random',
                'wasi:clocks/monotonic-clock', 'wasi:clocks/wall-clock',
            ];

            const consumerImports: Record<string, Record<string, Function>> = { ...wasiImports, ...extraImports };
            for (const iface of forwardedInterfaces) {
                const exported = forwarderExports[`${iface}@0.2.11`] ?? forwarderExports[iface];
                if (exported) {
                    consumerImports[iface] = exported;
                    consumerImports[`${iface}@0.2.11`] = exported;
                }
            }

            // 5. Instantiate consumer with merged imports
            const consumerComponent = await createComponent(consumerWasm, verboseOptions(verbose));
            let exitCode: number | undefined;

            try {
                const instance = await consumerComponent.instantiate(consumerImports);
                const runNs = (instance.exports['wasi:cli/run@0.2.11']
                    ?? instance.exports['wasi:cli/run']) as any;
                expect(runNs).toBeDefined();
                const result = runNs.run();
                if (result && typeof result === 'object' && 'tag' in result) {
                    exitCode = result.tag === 'ok' ? 0 : 1;
                } else {
                    exitCode = 0;
                }
            } catch (e) {
                if (e instanceof WasiExit) {
                    exitCode = e.code;
                } else {
                    throw e;
                }
            }

            const stdout = new TextDecoder().decode(
                new Uint8Array(stdoutChunks.reduce((acc, c) => [...acc, ...c], [] as number[]))
            );
            const testResults = parseTestResults(stdout);

            expect(testResults.length).toBeGreaterThan(0);

            for (const result of testResults) {
                expect({ test: result.name, passed: result.passed, reason: result.reason })
                    .toEqual({ test: result.name, passed: true, reason: undefined });
            }

            // Verify forwarder logged its interceptions
            const forwarderLogs = logMessages.filter(m => m.includes('[forwarder]'));
            expect(forwarderLogs.length).toBeGreaterThan(0);

            expect(exitCode).toBe(0);
        }));
    });
});
