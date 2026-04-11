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

setConfiguration('Debug');

const consumerWasm = './integration-tests/target/wasm32-wasip1/release/consumer.wasm';

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
    describe('Scenario A: consumer-direct', () => {
        test('consumer runs all tests via JS WASI host', async () => {
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

            const component = await createComponent(consumerWasm);
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
        });
    });
});
