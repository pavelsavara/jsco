// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * WASIp3 native integration tests — Rust components built with wit-bindgen 0.57
 * that use P3 WASI interfaces natively.
 *
 * These components import P3 WASI APIs (@0.3.0-rc-2026-03-15) AND P2 WASI
 * APIs (@0.2.6, injected by the wasm-tools component adapter for libc calls).
 * We create a merged P2+P3 host for each scenario.
 *
 * Flat scenarios (A–E):
 *   A: consumer-p3 ← JS host (P3 + adapter P2)
 *   B: consumer-p3 ← forwarder-p3 ← JS host
 *   C: consumer-p3 ← forwarder-p3 ← implementer-p3
 *   D: consumer-p3 ← fwd ← fwd ← implementer-p3 (flat)
 *   E: consumer-p3 ← fwd ← fwd ← JS host (flat)
 *
 * WAC composition scenarios (F–K):
 *   F: consumer-p3 ← fwd ← (fwd ← host) wac-wrapped
 *   G: consumer-p3 ← (fwd ← fwd ← host) wac-composed
 *   H: consumer-p3 ← (fwd ← fwd ← fwd ← host) wac triple
 *   I: consumer-p3 ← (fwd ← implementer) wac-composed
 *   J: consumer-p3 ← (fwd ← fwd ← implementer) wac-composed
 *   K: consumer-p3 ← (fwd ← (fwd ← implementer)) nested wac
 */

import { createComponent } from '../../../src/resolver';
import { createWasiP3Host } from '../../../src/host/wasip3/index';
import { createWasiP2ViaP3Adapter } from '../../../src/host/wasip2-via-wasip3/index';
import { WasiExit } from '../../../src/host/wasip3/cli';
import { initializeAsserts } from '../../../src/utils/assert';
import { useVerboseOnFailure, verboseOptions, runWithVerbose } from '../../test-utils/verbose-logger';
import { createEchoImports } from '../../../integration-tests/echo-reactor-ts/index';

initializeAsserts();

const P3_VERSION = '0.3.0-rc-2026-03-15';
const RUN_EXPORT = `wasi:cli/run@${P3_VERSION}`;

const consumerP3Wasm = './integration-tests/consumer-p3/consumer_p3.wasm';
const forwarderP3Wasm = './integration-tests/forwarder-p3/forwarder_p3.wasm';
const implementerP3Wasm = './integration-tests/implementer-p3/implementer_p3.wasm';

const wrappedForwarderP3Wasm = './integration-tests/compositions/wrapped-forwarder-p3.wasm';
const doubleForwarderP3Wasm = './integration-tests/compositions/double-forwarder-p3.wasm';
const nestedDoubleForwarderP3Wasm = './integration-tests/compositions/nested-double-forwarder-p3.wasm';
const forwarderImplementerP3Wasm = './integration-tests/compositions/forwarder-implementer-p3.wasm';
const doubleForwarderImplementerP3Wasm = './integration-tests/compositions/double-forwarder-implementer-p3.wasm';
const nestedForwarderImplementerP3Wasm = './integration-tests/compositions/nested-forwarder-implementer-p3.wasm';

type ImportsMap = Record<string, Record<string, Function>>;

const fullWasiConfig = {
    args: ['consumer-p3-test'],
    env: [['TEST_SPECIAL', 'hello=world 🌍'], ['HOME', '/test/home'], ['PATH', '/usr/bin']] as [string, string][],
    cwd: '/test/cwd',
};

/** Create merged P2+P3 WASI host imports. */
function createMergedHosts(config?: Parameters<typeof createWasiP3Host>[0]): ImportsMap {
    const p3 = createWasiP3Host(config);
    const p2 = createWasiP2ViaP3Adapter(p3);
    return { ...p2, ...p3 } as unknown as ImportsMap;
}

/** Create test imports (logger, counter, echo interfaces). */
function createTestImports(logMessages: string[]) {
    const counters = new Map<number, { value: number }>();
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
    stderr: string,
    logMessages: string[],
    exitCode: number | undefined,
    expectForwarderLogs: boolean | number = false,
) {
    const testResults = parseTestResults(stdout);
    expect(testResults.length).toBeGreaterThan(0);

    expect(stderr).toContain('stderr_test_output');

    for (const result of testResults) {
        expect({ test: result.name, passed: result.passed, reason: result.reason })
            .toEqual({ test: result.name, passed: true, reason: undefined });
    }

    expect(logMessages.length).toBeGreaterThan(0);

    if (expectForwarderLogs === true || (typeof expectForwarderLogs === 'number' && expectForwarderLogs >= 1)) {
        const forwarderLogs = logMessages.filter(m => m.includes('[forwarder-p3]'));
        expect(forwarderLogs.length).toBeGreaterThan(0);
    }

    expect(exitCode).toBe(0);
}

const yieldToGC = () => new Promise<void>(r => setTimeout(r, 0));

const p3ForwardedInterfaces = [
    'wasi:cli/environment', 'wasi:cli/exit',
    'wasi:random/random',
    'wasi:clocks/monotonic-clock', 'wasi:clocks/system-clock',
    'jsco:test/echo-primitives', 'jsco:test/echo-compound', 'jsco:test/echo-algebraic',
    'jsco:test/echo-complex',
];

const p3ImplementerInterfaces = [
    'wasi:cli/environment', 'wasi:cli/exit',
    'wasi:random/random',
    'wasi:clocks/monotonic-clock', 'wasi:clocks/system-clock',
    'jsco:test/echo-primitives', 'jsco:test/echo-compound', 'jsco:test/echo-algebraic',
    'jsco:test/echo-complex',
];

function wireP3ExportsToImports(
    exports: ImportsMap,
    target: ImportsMap,
    interfaces: string[],
) {
    for (const iface of interfaces) {
        const exported = exports[`${iface}@${P3_VERSION}`] ?? exports[`${iface}@0.1.0`] ?? exports[iface];
        if (exported) {
            target[iface] = exported;
            target[`${iface}@${P3_VERSION}`] = exported;
            target[`${iface}@0.1.0`] = exported;
        }
    }
}

async function runP3ConsumerScenario(
    verbose: ReturnType<typeof useVerboseOnFailure>,
    buildChain: (ctx: {
        wasiExports: ImportsMap;
        extraImports: ImportsMap;
    }) => Promise<ImportsMap>,
    expectForwarderLogs: boolean | number = false,
    wasiConfig?: { args?: string[]; env?: [string, string][]; cwd?: string },
) {
    const stdoutChunks: Uint8Array[] = [];
    const stderrChunks: Uint8Array[] = [];
    const logMessages: string[] = [];

    const wasiExports = createMergedHosts({
        args: wasiConfig?.args,
        env: wasiConfig?.env,
        cwd: wasiConfig?.cwd,
        stdout: new WritableStream<Uint8Array>({
            write(chunk) { stdoutChunks.push(new Uint8Array(chunk)); },
        }),
        stderr: new WritableStream<Uint8Array>({
            write(chunk) { stderrChunks.push(new Uint8Array(chunk)); },
        }),
    });
    const extraImports = createTestImports(logMessages);

    const consumerImports = await buildChain({ wasiExports, extraImports });

    await yieldToGC();
    const consumerComponent = await createComponent(consumerP3Wasm, verboseOptions(verbose));
    let exitCode: number | undefined;
    const instance = await consumerComponent.instantiate(consumerImports);
    try {
        const runNs = (instance.exports[RUN_EXPORT] ?? instance.exports['wasi:cli/run']) as any;
        const result = await runNs.run();
        exitCode = (result && typeof result === 'object' && result.tag === 'err') ? 1 : 0;
    } catch (e) {
        if (e instanceof WasiExit) exitCode = e.exitCode; else throw e;
    } finally {
        instance.dispose();
    }

    const stdout = new TextDecoder().decode(
        new Uint8Array(stdoutChunks.reduce((acc, c) => [...acc, ...c], [] as number[]))
    );
    const stderr = new TextDecoder().decode(
        new Uint8Array(stderrChunks.reduce((acc, c) => [...acc, ...c], [] as number[]))
    );
    assertTestResults(stdout, stderr, logMessages, exitCode, expectForwarderLogs);
}

async function instantiateP3Component(
    wasmPath: string,
    imports: ImportsMap,
    verbose: ReturnType<typeof useVerboseOnFailure>,
) {
    await yieldToGC();
    const component = await createComponent(wasmPath, { noJspi: true, ...verboseOptions(verbose) });
    const instance = await component.instantiate(imports);
    return { exports: instance.exports as ImportsMap, dispose: () => instance.dispose() };
}

describe('WASIp3 native component integration tests (flat)', () => {
    const verbose = useVerboseOnFailure();

    afterEach(yieldToGC);

    test('Scenario A: consumer-p3 direct (P3 host)', () => runWithVerbose(verbose, async () => {
        await runP3ConsumerScenario(
            verbose,
            async ({ wasiExports, extraImports }) => ({ ...wasiExports, ...extraImports }),
            false,
            fullWasiConfig,
        );
    }));

    test('Scenario B: consumer-p3 ← forwarder-p3 ← JS host', () => runWithVerbose(verbose, async () => {
        const disposables: (() => void)[] = [];
        try {
            await runP3ConsumerScenario(
                verbose,
                async ({ wasiExports, extraImports }) => {
                    const fwd = await instantiateP3Component(forwarderP3Wasm, { ...wasiExports, ...extraImports }, verbose);
                    disposables.push(fwd.dispose);
                    const consumerImports: ImportsMap = { ...wasiExports, ...extraImports };
                    wireP3ExportsToImports(fwd.exports, consumerImports, p3ForwardedInterfaces);
                    return consumerImports;
                },
                true,
                fullWasiConfig,
            );
        } finally {
            disposables.forEach(d => d());
        }
    }));

    test('Scenario C: consumer-p3 ← forwarder-p3 ← implementer-p3', () => runWithVerbose(verbose, async () => {
        const disposables: (() => void)[] = [];
        try {
            await runP3ConsumerScenario(
                verbose,
                async ({ wasiExports, extraImports }) => {
                    const impl = await instantiateP3Component(implementerP3Wasm, createMergedHosts(), verbose);
                    disposables.push(impl.dispose);

                    const fwdImports: ImportsMap = { ...wasiExports, ...extraImports };
                    wireP3ExportsToImports(impl.exports, fwdImports, p3ImplementerInterfaces);
                    const fwd = await instantiateP3Component(forwarderP3Wasm, fwdImports, verbose);
                    disposables.push(fwd.dispose);

                    const consumerImports: ImportsMap = { ...wasiExports, ...extraImports };
                    wireP3ExportsToImports(fwd.exports, consumerImports, p3ForwardedInterfaces);
                    return consumerImports;
                },
                true,
            );
        } finally {
            disposables.forEach(d => d());
        }
    }));

    test('Scenario D: consumer-p3 ← fwd ← fwd ← implementer-p3 (flat)', () => runWithVerbose(verbose, async () => {
        const disposables: (() => void)[] = [];
        try {
            await runP3ConsumerScenario(
                verbose,
                async ({ wasiExports, extraImports }) => {
                    const impl = await instantiateP3Component(implementerP3Wasm, createMergedHosts(), verbose);
                    disposables.push(impl.dispose);

                    const fwd2Imports: ImportsMap = { ...wasiExports, ...extraImports };
                    wireP3ExportsToImports(impl.exports, fwd2Imports, p3ImplementerInterfaces);
                    const fwd2 = await instantiateP3Component(forwarderP3Wasm, fwd2Imports, verbose);
                    disposables.push(fwd2.dispose);

                    const fwd1Imports: ImportsMap = { ...wasiExports, ...extraImports };
                    wireP3ExportsToImports(fwd2.exports, fwd1Imports, p3ForwardedInterfaces);
                    const fwd1 = await instantiateP3Component(forwarderP3Wasm, fwd1Imports, verbose);
                    disposables.push(fwd1.dispose);

                    const consumerImports: ImportsMap = { ...wasiExports, ...extraImports };
                    wireP3ExportsToImports(fwd1.exports, consumerImports, p3ForwardedInterfaces);
                    return consumerImports;
                },
                2,
            );
        } finally {
            disposables.forEach(d => d());
        }
    }));

    test('Scenario E: consumer-p3 ← fwd ← fwd ← host (flat)', () => runWithVerbose(verbose, async () => {
        const disposables: (() => void)[] = [];
        try {
            await runP3ConsumerScenario(
                verbose,
                async ({ wasiExports, extraImports }) => {
                    const fwd2 = await instantiateP3Component(forwarderP3Wasm, { ...wasiExports, ...extraImports }, verbose);
                    disposables.push(fwd2.dispose);

                    const fwd1Imports: ImportsMap = { ...wasiExports, ...extraImports };
                    wireP3ExportsToImports(fwd2.exports, fwd1Imports, p3ForwardedInterfaces);
                    const fwd1 = await instantiateP3Component(forwarderP3Wasm, fwd1Imports, verbose);
                    disposables.push(fwd1.dispose);

                    const consumerImports: ImportsMap = { ...wasiExports, ...extraImports };
                    wireP3ExportsToImports(fwd1.exports, consumerImports, p3ForwardedInterfaces);
                    return consumerImports;
                },
                2,
                fullWasiConfig,
            );
        } finally {
            disposables.forEach(d => d());
        }
    }));
});

describe('WASIp3 native component integration tests (WAC compositions)', () => {
    const verbose = useVerboseOnFailure();

    afterEach(yieldToGC);

    test('Scenario F: consumer-p3 ← fwd ← (fwd ← host) wac-wrapped', () => runWithVerbose(verbose, async () => {
        const disposables: (() => void)[] = [];
        try {
            await runP3ConsumerScenario(
                verbose,
                async ({ wasiExports, extraImports }) => {
                    const wrapped = await instantiateP3Component(wrappedForwarderP3Wasm, { ...wasiExports, ...extraImports }, verbose);
                    disposables.push(wrapped.dispose);

                    const fwdImports: ImportsMap = { ...wasiExports, ...extraImports };
                    wireP3ExportsToImports(wrapped.exports, fwdImports, p3ForwardedInterfaces);
                    const fwd = await instantiateP3Component(forwarderP3Wasm, fwdImports, verbose);
                    disposables.push(fwd.dispose);

                    const consumerImports: ImportsMap = { ...wasiExports, ...extraImports };
                    wireP3ExportsToImports(fwd.exports, consumerImports, p3ForwardedInterfaces);
                    return consumerImports;
                },
                2,
                fullWasiConfig,
            );
        } finally {
            disposables.forEach(d => d());
        }
    }));

    test('Scenario G: consumer-p3 ← (fwd ← fwd ← host) wac-composed', () => runWithVerbose(verbose, async () => {
        const disposables: (() => void)[] = [];
        try {
            await runP3ConsumerScenario(
                verbose,
                async ({ wasiExports, extraImports }) => {
                    const dbl = await instantiateP3Component(doubleForwarderP3Wasm, { ...wasiExports, ...extraImports }, verbose);
                    disposables.push(dbl.dispose);
                    const consumerImports: ImportsMap = { ...wasiExports, ...extraImports };
                    wireP3ExportsToImports(dbl.exports, consumerImports, p3ForwardedInterfaces);
                    return consumerImports;
                },
                2,
                fullWasiConfig,
            );
        } finally {
            disposables.forEach(d => d());
        }
    }));

    test('Scenario H: consumer-p3 ← (fwd ← fwd ← fwd ← host) wac triple', () => runWithVerbose(verbose, async () => {
        const disposables: (() => void)[] = [];
        try {
            await runP3ConsumerScenario(
                verbose,
                async ({ wasiExports, extraImports }) => {
                    const nested = await instantiateP3Component(nestedDoubleForwarderP3Wasm, { ...wasiExports, ...extraImports }, verbose);
                    disposables.push(nested.dispose);
                    const consumerImports: ImportsMap = { ...wasiExports, ...extraImports };
                    wireP3ExportsToImports(nested.exports, consumerImports, p3ForwardedInterfaces);
                    return consumerImports;
                },
                3,
                fullWasiConfig,
            );
        } finally {
            disposables.forEach(d => d());
        }
    }));

    test('Scenario I: consumer-p3 ← (fwd ← implementer) wac-composed', () => runWithVerbose(verbose, async () => {
        const disposables: (() => void)[] = [];
        try {
            await runP3ConsumerScenario(
                verbose,
                async ({ wasiExports, extraImports }) => {
                    const composed = await instantiateP3Component(forwarderImplementerP3Wasm, { ...wasiExports, ...extraImports }, verbose);
                    disposables.push(composed.dispose);
                    const consumerImports: ImportsMap = { ...wasiExports, ...extraImports };
                    wireP3ExportsToImports(composed.exports, consumerImports, p3ForwardedInterfaces);
                    return consumerImports;
                },
                true,
            );
        } finally {
            disposables.forEach(d => d());
        }
    }));

    test('Scenario J: consumer-p3 ← (fwd ← fwd ← implementer) wac-composed', () => runWithVerbose(verbose, async () => {
        const disposables: (() => void)[] = [];
        try {
            await runP3ConsumerScenario(
                verbose,
                async ({ wasiExports, extraImports }) => {
                    const composed = await instantiateP3Component(doubleForwarderImplementerP3Wasm, { ...wasiExports, ...extraImports }, verbose);
                    disposables.push(composed.dispose);
                    const consumerImports: ImportsMap = { ...wasiExports, ...extraImports };
                    wireP3ExportsToImports(composed.exports, consumerImports, p3ForwardedInterfaces);
                    return consumerImports;
                },
                2,
            );
        } finally {
            disposables.forEach(d => d());
        }
    }));

    test('Scenario K: consumer-p3 ← (fwd ← (fwd ← implementer)) nested wac', () => runWithVerbose(verbose, async () => {
        const disposables: (() => void)[] = [];
        try {
            await runP3ConsumerScenario(
                verbose,
                async ({ wasiExports, extraImports }) => {
                    const nested = await instantiateP3Component(nestedForwarderImplementerP3Wasm, { ...wasiExports, ...extraImports }, verbose);
                    disposables.push(nested.dispose);
                    const consumerImports: ImportsMap = { ...wasiExports, ...extraImports };
                    wireP3ExportsToImports(nested.exports, consumerImports, p3ForwardedInterfaces);
                    return consumerImports;
                },
                2,
            );
        } finally {
            disposables.forEach(d => d());
        }
    }), 60_000);
});
