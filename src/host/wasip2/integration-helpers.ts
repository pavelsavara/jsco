// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * Shared helpers for integration tests.
 * Extracted to a module so multiple test files can reuse them
 * without duplicating code. Splitting scenarios across files
 * ensures each Jest worker handles fewer heavy WASM component
 * instances, avoiding OOM.
 */

import { createComponent } from '../../resolver';
import { createWasiP2Host } from './index';
import { WasiExit } from './api';
import type { VerboseCapture } from '../../test-utils/verbose-logger';
import { verboseOptions } from '../../test-utils/verbose-logger';
import type { ResolutionStats } from '../../resolver/api-types';
import { createEchoImports } from '../../../integration-tests/echo-reactor-ts/index';

export type ImportsMap = Record<string, Record<string, Function>>;

export type ComponentResult = {
    exports: ImportsMap;
    stats?: ResolutionStats;
};

export const consumerWasm = './integration-tests/target/wasm32-wasip1/release/consumer.wasm';
export const forwarderWasm = './integration-tests/target/wasm32-wasip1/release/forwarder.wasm';
export const implementerWasm = './integration-tests/target/wasm32-wasip1/release/implementer.wasm';
export const wrappedForwarderWasm = './integration-tests/compositions/wrapped-forwarder.wasm';
export const doubleForwarderWasm = './integration-tests/compositions/double-forwarder.wasm';
export const nestedDoubleForwarderWasm = './integration-tests/compositions/nested-double-forwarder.wasm';
export const forwarderImplementerWasm = './integration-tests/compositions/forwarder-implementer.wasm';
export const doubleForwarderImplementerWasm = './integration-tests/compositions/double-forwarder-implementer.wasm';
export const nestedForwarderImplementerWasm = './integration-tests/compositions/nested-forwarder-implementer.wasm';
export const echoReactorWatWasm = './integration-tests/echo-reactor-wat/echo.wasm';

export const fullWasiConfig = {
    args: ['consumer-test'],
    env: [['TEST_SPECIAL', 'hello=world 🌍'], ['HOME', '/test/home'], ['PATH', '/usr/bin']] as [string, string][],
};

export const forwardedInterfaces = [
    'wasi:cli/environment', 'wasi:cli/exit',
    'wasi:cli/stdin', 'wasi:cli/stdout', 'wasi:cli/stderr',
    'wasi:random/random',
    'wasi:clocks/monotonic-clock', 'wasi:clocks/wall-clock',
    'jsco:test/echo-primitives', 'jsco:test/echo-compound', 'jsco:test/echo-algebraic',
    'jsco:test/echo-complex',
];

export const implementerInterfaces = [
    'wasi:cli/environment', 'wasi:cli/exit',
    'wasi:random/random',
    'wasi:clocks/monotonic-clock', 'wasi:clocks/wall-clock',
    'jsco:test/echo-primitives', 'jsco:test/echo-compound', 'jsco:test/echo-algebraic',
    'jsco:test/echo-complex',
];

/** Yield to the event loop so the GC can reclaim memory between heavy operations. */
export const yieldToGC = () => new Promise<void>(r => setTimeout(r, 0));

interface CounterState {
    value: number;
}

export function createTestImports(logMessages: string[], _stderrChunks: string[]) {
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

    const echoImports = createEchoImports();

    return {
        'jsco:test/logger@0.1.0': loggerImport,
        'jsco:test/counter@0.1.0': counterImport,
        ...echoImports,
    };
}

function parseTestResults(stdout: string): { name: string; passed: boolean; reason?: string }[] {
    const results: { name: string; passed: boolean; reason?: string }[] = [];
    for (const line of stdout.split('\n')) {
        const passMatch = line.match(/^\[PASS\] (.+)$/);
        if (passMatch) {
            const name = passMatch[1];
            if (name) results.push({ name, passed: true });
            continue;
        }
        const failMatch = line.match(/^\[FAIL\] ([^:]+): (.+)$/);
        if (failMatch) {
            const name = failMatch[1];
            if (name) results.push({ name, passed: false, reason: failMatch[2] });
        }
    }
    return results;
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
        const envLogs = logMessages.filter(m => m.includes('[forwarder]') && m.includes('get-environment'));
        expect(envLogs.length).toBeGreaterThanOrEqual(2);
    }

    expect(exitCode).toBe(0);
}

export function wireExportsToImports(
    exports: ImportsMap,
    target: ImportsMap,
    interfaces: string[],
) {
    for (const iface of interfaces) {
        const exported = exports[`${iface}@0.2.11`] ?? exports[`${iface}@0.1.0`] ?? exports[iface];
        if (exported) {
            target[iface] = exported;
            target[`${iface}@0.2.11`] = exported;
            target[`${iface}@0.1.0`] = exported;
        }
    }
}

/**
 * Common helper for all integration scenarios.
 * Creates WASI + test imports, calls buildChain to wire up the component chain,
 * then instantiates and runs the consumer, asserting results.
 */
export async function runConsumerScenario(
    verbose: VerboseCapture,
    buildChain: (ctx: {
        wasiExports: ImportsMap;
        extraImports: ImportsMap;
    }) => Promise<ImportsMap>,
    expectForwarderLogs: boolean | number = false,
    wasiConfig?: { args?: string[]; env?: [string, string][] },
): Promise<ResolutionStats | undefined> {
    const stdoutChunks: Uint8Array[] = [];
    const stderrChunks: string[] = [];
    const logMessages: string[] = [];

    const wasiExports = createWasiP2Host({
        args: wasiConfig?.args,
        env: wasiConfig?.env,
        stdout: (bytes) => { stdoutChunks.push(new Uint8Array(bytes)); },
        stderr: (bytes) => { stderrChunks.push(new TextDecoder().decode(bytes)); },
    });
    const extraImports = createTestImports(logMessages, stderrChunks);

    const consumerImports = await buildChain({ wasiExports: wasiExports, extraImports });

    await yieldToGC();
    const consumerComponent = await createComponent(consumerWasm, verboseOptions(verbose));
    let exitCode: number | undefined;
    try {
        const instance = await consumerComponent.instantiate(consumerImports);
        const runNs = (instance.exports['wasi:cli/run@0.2.11'] ?? instance.exports['wasi:cli/run']) as any;
        const result = await runNs.run();
        exitCode = (result && typeof result === 'object' && result.tag === 'err') ? 1 : 0;
    } catch (e) {
        if (e instanceof WasiExit) exitCode = e.status; else throw e;
    }

    const stdout = new TextDecoder().decode(
        new Uint8Array(stdoutChunks.reduce((acc, c) => [...acc, ...c], [] as number[]))
    );
    assertTestResults(stdout, logMessages, exitCode, expectForwarderLogs);
    return (consumerComponent as any).stats;
}

/** Instantiate a component with yield points for GC. */
export async function instantiateComponent(
    wasmPath: string,
    imports: ImportsMap,
    verbose: VerboseCapture,
): Promise<ComponentResult> {
    await yieldToGC();
    const component = await createComponent(wasmPath, { noJspi: true, ...verboseOptions(verbose) });
    const instance = await component.instantiate(imports);
    return { exports: instance.exports as ImportsMap, stats: (component as any).stats };
}
