/**
 * Integration tests — consumer, forwarder, implementer composition scenarios
 *
 * Scenario A: consumer ← JS host (direct)
 * Scenario B: consumer ← forwarder ← JS host (2-level composition)
 * Scenario C: consumer ← forwarder ← implementer (3-level, no JS WASI)
 * Scenario D: consumer ← forwarder ← forwarder ← implementer (flat, 4 components)
 * Scenario E: consumer ← forwarder ← forwarder ← host (flat, 3 components)
 * Scenario F: consumer ← forwarder ← (forwarder ← host) (inner wac-wrapped)
 * Scenario G: consumer ← (forwarder ← forwarder ← host) (wac-composed double forwarder)
 * Scenario H: consumer ← (forwarder ← (forwarder ← host)) (nested wac composition)
 * Scenario I: consumer ← (forwarder ← implementer) (wac-composed, implementer inside)
 * Scenario J: consumer ← (forwarder ← forwarder ← implementer) (wac-composed, implementer inside)
 * Scenario K: consumer ← (forwarder ← (forwarder ← implementer)) (nested wac, implementer inside)
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
const wrappedForwarderWasm = './integration-tests/compositions/wrapped-forwarder.wasm';
const doubleForwarderWasm = './integration-tests/compositions/double-forwarder.wasm';
const nestedDoubleForwarderWasm = './integration-tests/compositions/nested-double-forwarder.wasm';
const forwarderImplementerWasm = './integration-tests/compositions/forwarder-implementer.wasm';
const doubleForwarderImplementerWasm = './integration-tests/compositions/double-forwarder-implementer.wasm';
const nestedForwarderImplementerWasm = './integration-tests/compositions/nested-forwarder-implementer.wasm';

interface CounterState {
    value: number;
}

function createTestImports(logMessages: string[], _stderrChunks: string[]) {
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
        '[constructor]counter': (_name: string): number => {
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

const forwardedInterfaces = [
    'wasi:cli/environment', 'wasi:cli/exit',
    'wasi:cli/stdin', 'wasi:cli/stdout', 'wasi:cli/stderr',
    'wasi:random/random',
    'wasi:clocks/monotonic-clock', 'wasi:clocks/wall-clock',
];

const implementerInterfaces = [
    'wasi:cli/environment', 'wasi:cli/exit',
    'wasi:random/random',
    'wasi:clocks/monotonic-clock', 'wasi:clocks/wall-clock',
];

function wireExportsToImports(
    exports: Record<string, Record<string, Function>>,
    target: Record<string, Record<string, Function>>,
    interfaces: string[],
) {
    for (const iface of interfaces) {
        const exported = exports[`${iface}@0.2.11`] ?? exports[iface];
        if (exported) {
            target[iface] = exported;
            target[`${iface}@0.2.11`] = exported;
        }
    }
}

function assertTestResults(
    stdout: string,
    logMessages: string[],
    exitCode: number | undefined,
    expectForwarderLogs: boolean | number = false,
) {
    const testResults = parseTestResults(stdout);
    expect(testResults.length).toBeGreaterThan(0);

    for (const result of testResults) {
        expect({ test: result.name, passed: result.passed, reason: result.reason })
            .toEqual({ test: result.name, passed: true, reason: undefined });
    }

    expect(logMessages.length).toBeGreaterThan(0);

    if (expectForwarderLogs === true || (typeof expectForwarderLogs === 'number' && expectForwarderLogs >= 1)) {
        const forwarderLogs = logMessages.filter(m => m.includes('[forwarder]'));
        expect(forwarderLogs.length).toBeGreaterThan(0);
    }

    if (typeof expectForwarderLogs === 'number' && expectForwarderLogs >= 2) {
        // With two forwarders, each intercepted WASI call is logged by both forwarders independently.
        // Verify that the same operation was logged at least twice (once per forwarder in the chain).
        const envLogs = logMessages.filter(m => m.includes('[forwarder]') && m.includes('get-environment'));
        expect(envLogs.length).toBeGreaterThanOrEqual(2);
    }

    expect(exitCode).toBe(0);
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

            const consumerImports: Record<string, Record<string, Function>> = { ...wasiImports, ...extraImports };

            // Override with forwarder's exports (try versioned first, then unversioned)
            wireExportsToImports(forwarderExports, consumerImports, forwardedInterfaces);

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

            const forwarderImports: Record<string, Record<string, Function>> = { ...wasiImports, ...extraImports };
            wireExportsToImports(implExports, forwarderImports, implementerInterfaces);

            const forwarderComponent = await createComponent(forwarderWasm, verboseOptions(verbose));
            const forwarderInstance = await forwarderComponent.instantiate(forwarderImports);
            const forwarderExports = forwarderInstance.exports as Record<string, Record<string, Function>>;

            // 4. Build consumer imports: forwarder's exported WASI + JS host io + custom imports

            const consumerImports: Record<string, Record<string, Function>> = { ...wasiImports, ...extraImports };
            wireExportsToImports(forwarderExports, consumerImports, forwardedInterfaces);

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

    describe('Scenario D: consumer ← fwd ← fwd ← implementer (flat)', () => {
        test('consumer runs through two forwarders + implementer', () => runWithVerbose(verbose, async () => {
            const stdoutChunks: Uint8Array[] = [];
            const stderrChunks: string[] = [];
            const logMessages: string[] = [];

            // 1. Instantiate implementer
            const implHostImports = createWasiHost({});
            const implementerComponent = await createComponent(implementerWasm, verboseOptions(verbose));
            const implementerInstance = await implementerComponent.instantiate(implHostImports);
            const implExports = implementerInstance.exports as Record<string, Record<string, Function>>;

            // 2. JS WASI host for io/streams
            const wasiImports = createWasiHost({
                stdout: (bytes) => { stdoutChunks.push(new Uint8Array(bytes)); },
                stderr: (bytes) => { stderrChunks.push(new TextDecoder().decode(bytes)); },
            });
            const extraImports = createTestImports(logMessages, stderrChunks);

            // 3. Inner forwarder (fwd2) ← implementer + JS host io
            const fwd2Imports: Record<string, Record<string, Function>> = { ...wasiImports, ...extraImports };
            wireExportsToImports(implExports, fwd2Imports, implementerInterfaces);

            const fwd2Component = await createComponent(forwarderWasm, verboseOptions(verbose));
            const fwd2Instance = await fwd2Component.instantiate(fwd2Imports);
            const fwd2Exports = fwd2Instance.exports as Record<string, Record<string, Function>>;

            // 4. Outer forwarder (fwd1) ← fwd2 + JS host io
            const fwd1Imports: Record<string, Record<string, Function>> = { ...wasiImports, ...extraImports };
            wireExportsToImports(fwd2Exports, fwd1Imports, forwardedInterfaces);

            const fwd1Component = await createComponent(forwarderWasm, verboseOptions(verbose));
            const fwd1Instance = await fwd1Component.instantiate(fwd1Imports);
            const fwd1Exports = fwd1Instance.exports as Record<string, Record<string, Function>>;

            // 5. Consumer ← fwd1
            const consumerImports: Record<string, Record<string, Function>> = { ...wasiImports, ...extraImports };
            wireExportsToImports(fwd1Exports, consumerImports, forwardedInterfaces);

            const consumerComponent = await createComponent(consumerWasm, verboseOptions(verbose));
            let exitCode: number | undefined;
            try {
                const instance = await consumerComponent.instantiate(consumerImports);
                const runNs = (instance.exports['wasi:cli/run@0.2.11'] ?? instance.exports['wasi:cli/run']) as any;
                const result = runNs.run();
                exitCode = (result && typeof result === 'object' && result.tag === 'err') ? 1 : 0;
            } catch (e) {
                if (e instanceof WasiExit) exitCode = e.code; else throw e;
            }

            const stdout = new TextDecoder().decode(new Uint8Array(stdoutChunks.reduce((acc, c) => [...acc, ...c], [] as number[])));
            assertTestResults(stdout, logMessages, exitCode, 2);
        }));
    });

    describe('Scenario E: consumer ← fwd ← fwd ← host (flat)', () => {
        test('consumer runs through two forwarders to JS host', () => runWithVerbose(verbose, async () => {
            const stdoutChunks: Uint8Array[] = [];
            const stderrChunks: string[] = [];
            const logMessages: string[] = [];

            const wasiImports = createWasiHost({
                args: ['consumer-test', '--scenario', 'E'],
                env: [['TEST_SPECIAL', 'hello=world 🌍'], ['HOME', '/test/home'], ['PATH', '/usr/bin']],
                stdout: (bytes) => { stdoutChunks.push(new Uint8Array(bytes)); },
                stderr: (bytes) => { stderrChunks.push(new TextDecoder().decode(bytes)); },
            });
            const extraImports = createTestImports(logMessages, stderrChunks);

            // Inner forwarder (fwd2) ← JS host
            const fwd2Component = await createComponent(forwarderWasm, verboseOptions(verbose));
            const fwd2Instance = await fwd2Component.instantiate({ ...wasiImports, ...extraImports });
            const fwd2Exports = fwd2Instance.exports as Record<string, Record<string, Function>>;

            // Outer forwarder (fwd1) ← fwd2
            const fwd1Imports: Record<string, Record<string, Function>> = { ...wasiImports, ...extraImports };
            wireExportsToImports(fwd2Exports, fwd1Imports, forwardedInterfaces);

            const fwd1Component = await createComponent(forwarderWasm, verboseOptions(verbose));
            const fwd1Instance = await fwd1Component.instantiate(fwd1Imports);
            const fwd1Exports = fwd1Instance.exports as Record<string, Record<string, Function>>;

            // Consumer ← fwd1
            const consumerImports: Record<string, Record<string, Function>> = { ...wasiImports, ...extraImports };
            wireExportsToImports(fwd1Exports, consumerImports, forwardedInterfaces);

            const consumerComponent = await createComponent(consumerWasm, verboseOptions(verbose));
            let exitCode: number | undefined;
            try {
                const instance = await consumerComponent.instantiate(consumerImports);
                const runNs = (instance.exports['wasi:cli/run@0.2.11'] ?? instance.exports['wasi:cli/run']) as any;
                const result = runNs.run();
                exitCode = (result && typeof result === 'object' && result.tag === 'err') ? 1 : 0;
            } catch (e) {
                if (e instanceof WasiExit) exitCode = e.code; else throw e;
            }

            const stdout = new TextDecoder().decode(new Uint8Array(stdoutChunks.reduce((acc, c) => [...acc, ...c], [] as number[])));
            assertTestResults(stdout, logMessages, exitCode, 2);
        }));
    });

    describe('Scenario F: consumer ← fwd ← (fwd ← host) wac-wrapped', () => {
        test('consumer runs through forwarder + wac-wrapped forwarder', () => runWithVerbose(verbose, async () => {
            const stdoutChunks: Uint8Array[] = [];
            const stderrChunks: string[] = [];
            const logMessages: string[] = [];

            const wasiImports = createWasiHost({
                args: ['consumer-test', '--scenario', 'F'],
                env: [['TEST_SPECIAL', 'hello=world 🌍'], ['HOME', '/test/home'], ['PATH', '/usr/bin']],
                stdout: (bytes) => { stdoutChunks.push(new Uint8Array(bytes)); },
                stderr: (bytes) => { stderrChunks.push(new TextDecoder().decode(bytes)); },
            });
            const extraImports = createTestImports(logMessages, stderrChunks);

            // Inner: wac-wrapped forwarder (nested component) ← JS host
            const wrappedComponent = await createComponent(wrappedForwarderWasm, verboseOptions(verbose));
            const wrappedInstance = await wrappedComponent.instantiate({ ...wasiImports, ...extraImports });
            const wrappedExports = wrappedInstance.exports as Record<string, Record<string, Function>>;

            // Outer: forwarder ← wrapped forwarder
            const fwdImports: Record<string, Record<string, Function>> = { ...wasiImports, ...extraImports };
            wireExportsToImports(wrappedExports, fwdImports, forwardedInterfaces);

            const fwdComponent = await createComponent(forwarderWasm, verboseOptions(verbose));
            const fwdInstance = await fwdComponent.instantiate(fwdImports);
            const fwdExports = fwdInstance.exports as Record<string, Record<string, Function>>;

            // Consumer ← forwarder
            const consumerImports: Record<string, Record<string, Function>> = { ...wasiImports, ...extraImports };
            wireExportsToImports(fwdExports, consumerImports, forwardedInterfaces);

            const consumerComponent = await createComponent(consumerWasm, verboseOptions(verbose));
            let exitCode: number | undefined;
            try {
                const instance = await consumerComponent.instantiate(consumerImports);
                const runNs = (instance.exports['wasi:cli/run@0.2.11'] ?? instance.exports['wasi:cli/run']) as any;
                const result = runNs.run();
                exitCode = (result && typeof result === 'object' && result.tag === 'err') ? 1 : 0;
            } catch (e) {
                if (e instanceof WasiExit) exitCode = e.code; else throw e;
            }

            const stdout = new TextDecoder().decode(new Uint8Array(stdoutChunks.reduce((acc, c) => [...acc, ...c], [] as number[])));
            assertTestResults(stdout, logMessages, exitCode, 2);
        }));
    });

    describe('Scenario G: consumer ← (fwd ← fwd ← host) wac-composed', () => {
        test('consumer runs through wac-composed double forwarder', () => runWithVerbose(verbose, async () => {
            const stdoutChunks: Uint8Array[] = [];
            const stderrChunks: string[] = [];
            const logMessages: string[] = [];

            const wasiImports = createWasiHost({
                args: ['consumer-test', '--scenario', 'G'],
                env: [['TEST_SPECIAL', 'hello=world 🌍'], ['HOME', '/test/home'], ['PATH', '/usr/bin']],
                stdout: (bytes) => { stdoutChunks.push(new Uint8Array(bytes)); },
                stderr: (bytes) => { stderrChunks.push(new TextDecoder().decode(bytes)); },
            });
            const extraImports = createTestImports(logMessages, stderrChunks);

            // Composed double-forwarder ← JS host
            const doubleComponent = await createComponent(doubleForwarderWasm, verboseOptions(verbose));
            const doubleInstance = await doubleComponent.instantiate({ ...wasiImports, ...extraImports });
            const doubleExports = doubleInstance.exports as Record<string, Record<string, Function>>;

            // Consumer ← composed double-forwarder
            const consumerImports: Record<string, Record<string, Function>> = { ...wasiImports, ...extraImports };
            wireExportsToImports(doubleExports, consumerImports, forwardedInterfaces);

            const consumerComponent = await createComponent(consumerWasm, verboseOptions(verbose));
            let exitCode: number | undefined;
            try {
                const instance = await consumerComponent.instantiate(consumerImports);
                const runNs = (instance.exports['wasi:cli/run@0.2.11'] ?? instance.exports['wasi:cli/run']) as any;
                const result = runNs.run();
                exitCode = (result && typeof result === 'object' && result.tag === 'err') ? 1 : 0;
            } catch (e) {
                if (e instanceof WasiExit) exitCode = e.code; else throw e;
            }

            const stdout = new TextDecoder().decode(new Uint8Array(stdoutChunks.reduce((acc, c) => [...acc, ...c], [] as number[])));
            assertTestResults(stdout, logMessages, exitCode, 2);
        }));
    });

    describe('Scenario H: consumer ← (fwd ← (fwd ← host)) nested wac', () => {
        test('consumer runs through nested wac-composed double forwarder', () => runWithVerbose(verbose, async () => {
            const stdoutChunks: Uint8Array[] = [];
            const stderrChunks: string[] = [];
            const logMessages: string[] = [];

            const wasiImports = createWasiHost({
                args: ['consumer-test', '--scenario', 'H'],
                env: [['TEST_SPECIAL', 'hello=world 🌍'], ['HOME', '/test/home'], ['PATH', '/usr/bin']],
                stdout: (bytes) => { stdoutChunks.push(new Uint8Array(bytes)); },
                stderr: (bytes) => { stderrChunks.push(new TextDecoder().decode(bytes)); },
            });
            const extraImports = createTestImports(logMessages, stderrChunks);

            // Nested composed component (fwd → (fwd → host)) ← JS host
            const nestedComponent = await createComponent(nestedDoubleForwarderWasm, verboseOptions(verbose));
            const nestedInstance = await nestedComponent.instantiate({ ...wasiImports, ...extraImports });
            const nestedExports = nestedInstance.exports as Record<string, Record<string, Function>>;

            // Consumer ← nested composed component
            const consumerImports: Record<string, Record<string, Function>> = { ...wasiImports, ...extraImports };
            wireExportsToImports(nestedExports, consumerImports, forwardedInterfaces);

            const consumerComponent = await createComponent(consumerWasm, verboseOptions(verbose));
            let exitCode: number | undefined;
            try {
                const instance = await consumerComponent.instantiate(consumerImports);
                const runNs = (instance.exports['wasi:cli/run@0.2.11'] ?? instance.exports['wasi:cli/run']) as any;
                const result = runNs.run();
                exitCode = (result && typeof result === 'object' && result.tag === 'err') ? 1 : 0;
            } catch (e) {
                if (e instanceof WasiExit) exitCode = e.code; else throw e;
            }

            const stdout = new TextDecoder().decode(new Uint8Array(stdoutChunks.reduce((acc, c) => [...acc, ...c], [] as number[])));
            assertTestResults(stdout, logMessages, exitCode, 2);
        }));
    });

    describe('Scenario I: consumer ← (fwd ← implementer) wac-composed', () => {
        test('consumer runs through wac-composed forwarder + implementer', () => runWithVerbose(verbose, async () => {
            const stdoutChunks: Uint8Array[] = [];
            const stderrChunks: string[] = [];
            const logMessages: string[] = [];

            // JS host provides only io/streams + logger (implementer is inside the composition)
            const wasiImports = createWasiHost({
                stdout: (bytes) => { stdoutChunks.push(new Uint8Array(bytes)); },
                stderr: (bytes) => { stderrChunks.push(new TextDecoder().decode(bytes)); },
            });
            const extraImports = createTestImports(logMessages, stderrChunks);

            // Composed component (fwd ← implementer) ← JS host io + logger
            const composedComponent = await createComponent(forwarderImplementerWasm, verboseOptions(verbose));
            const composedInstance = await composedComponent.instantiate({ ...wasiImports, ...extraImports });
            const composedExports = composedInstance.exports as Record<string, Record<string, Function>>;

            // Consumer ← composed component
            const consumerImports: Record<string, Record<string, Function>> = { ...wasiImports, ...extraImports };
            wireExportsToImports(composedExports, consumerImports, forwardedInterfaces);

            const consumerComponent = await createComponent(consumerWasm, verboseOptions(verbose));
            let exitCode: number | undefined;
            try {
                const instance = await consumerComponent.instantiate(consumerImports);
                const runNs = (instance.exports['wasi:cli/run@0.2.11'] ?? instance.exports['wasi:cli/run']) as any;
                const result = runNs.run();
                exitCode = (result && typeof result === 'object' && result.tag === 'err') ? 1 : 0;
            } catch (e) {
                if (e instanceof WasiExit) exitCode = e.code; else throw e;
            }

            const stdout = new TextDecoder().decode(new Uint8Array(stdoutChunks.reduce((acc, c) => [...acc, ...c], [] as number[])));
            assertTestResults(stdout, logMessages, exitCode, true);
        }));
    });

    describe('Scenario J: consumer ← (fwd ← fwd ← implementer) wac-composed', () => {
        test('consumer runs through wac-composed double forwarder + implementer', () => runWithVerbose(verbose, async () => {
            const stdoutChunks: Uint8Array[] = [];
            const stderrChunks: string[] = [];
            const logMessages: string[] = [];

            const wasiImports = createWasiHost({
                stdout: (bytes) => { stdoutChunks.push(new Uint8Array(bytes)); },
                stderr: (bytes) => { stderrChunks.push(new TextDecoder().decode(bytes)); },
            });
            const extraImports = createTestImports(logMessages, stderrChunks);

            // Composed component (fwd ← fwd ← implementer) ← JS host io + logger
            const composedComponent = await createComponent(doubleForwarderImplementerWasm, verboseOptions(verbose));
            const composedInstance = await composedComponent.instantiate({ ...wasiImports, ...extraImports });
            const composedExports = composedInstance.exports as Record<string, Record<string, Function>>;

            // Consumer ← composed component
            const consumerImports: Record<string, Record<string, Function>> = { ...wasiImports, ...extraImports };
            wireExportsToImports(composedExports, consumerImports, forwardedInterfaces);

            const consumerComponent = await createComponent(consumerWasm, verboseOptions(verbose));
            let exitCode: number | undefined;
            try {
                const instance = await consumerComponent.instantiate(consumerImports);
                const runNs = (instance.exports['wasi:cli/run@0.2.11'] ?? instance.exports['wasi:cli/run']) as any;
                const result = runNs.run();
                exitCode = (result && typeof result === 'object' && result.tag === 'err') ? 1 : 0;
            } catch (e) {
                if (e instanceof WasiExit) exitCode = e.code; else throw e;
            }

            const stdout = new TextDecoder().decode(new Uint8Array(stdoutChunks.reduce((acc, c) => [...acc, ...c], [] as number[])));
            assertTestResults(stdout, logMessages, exitCode, 2);
        }));
    });

    describe('Scenario K: consumer ← (fwd ← (fwd ← implementer)) nested wac', () => {
        test('consumer runs through nested wac-composed forwarder + implementer', () => runWithVerbose(verbose, async () => {
            const stdoutChunks: Uint8Array[] = [];
            const stderrChunks: string[] = [];
            const logMessages: string[] = [];

            const wasiImports = createWasiHost({
                stdout: (bytes) => { stdoutChunks.push(new Uint8Array(bytes)); },
                stderr: (bytes) => { stderrChunks.push(new TextDecoder().decode(bytes)); },
            });
            const extraImports = createTestImports(logMessages, stderrChunks);

            // Nested composed component (fwd ← (fwd ← implementer)) ← JS host io + logger
            const nestedComponent = await createComponent(nestedForwarderImplementerWasm, verboseOptions(verbose));
            const nestedInstance = await nestedComponent.instantiate({ ...wasiImports, ...extraImports });
            const nestedExports = nestedInstance.exports as Record<string, Record<string, Function>>;

            // Consumer ← nested composed component
            const consumerImports: Record<string, Record<string, Function>> = { ...wasiImports, ...extraImports };
            wireExportsToImports(nestedExports, consumerImports, forwardedInterfaces);

            const consumerComponent = await createComponent(consumerWasm, verboseOptions(verbose));
            let exitCode: number | undefined;
            try {
                const instance = await consumerComponent.instantiate(consumerImports);
                const runNs = (instance.exports['wasi:cli/run@0.2.11'] ?? instance.exports['wasi:cli/run']) as any;
                const result = runNs.run();
                exitCode = (result && typeof result === 'object' && result.tag === 'err') ? 1 : 0;
            } catch (e) {
                if (e instanceof WasiExit) exitCode = e.code; else throw e;
            }

            const stdout = new TextDecoder().decode(new Uint8Array(stdoutChunks.reduce((acc, c) => [...acc, ...c], [] as number[])));
            assertTestResults(stdout, logMessages, exitCode, 2);
        }));
    });
});
