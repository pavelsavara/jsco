// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { getBuildInfo, createComponent, instantiateWasiComponent, LogLevel } from './index';
import { createWasiP3Host, WasiExit } from './host/wasip3/wasip3';
import { createWasiP2ViaP3Adapter } from './host/wasip2-via-wasip3';
import { GIT_HASH, CONFIGURATION } from './utils/constants';
import { detectWasiType, WasiType } from './wasi-auto';
import { parse } from './parser';
import isDebug from 'env:isDebug';
import { initializeAsserts } from './utils/assert';
import { useVerboseOnFailure, verboseOptions, runWithVerbose } from './test-utils/verbose-logger';

initializeAsserts();

const echoReactorWatWasm = './integration-tests/echo-reactor-wat/echo.wasm';
const helloWorldWatWasm = './integration-tests/hello-world-wat/hello.wasm';
const helloCityWatWasm = './integration-tests/hello-city-wat/hello-city.wasm';

describe('index.ts', () => {
    test('getBuildInfo returns git hash and configuration', () => {
        const info = getBuildInfo();
        expect(info).toHaveProperty(GIT_HASH);
        expect(info).toHaveProperty(CONFIGURATION);
        expect(typeof info[GIT_HASH]).toBe('string');
        expect(typeof info[CONFIGURATION]).toBe('string');
    });
});

describe('public API', () => {
    const verbose = useVerboseOnFailure();

    describe('createComponent', () => {
        test('returns a component with instantiate method', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(echoReactorWatWasm, verboseOptions(verbose));
            expect(component).toBeDefined();
            expect(typeof component.instantiate).toBe('function');
        }));

        test('instantiate returns exports with expected function names', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(echoReactorWatWasm, verboseOptions(verbose));
            const instance = await component.instantiate();
            expect(instance).toBeDefined();
            expect(instance.exports).toBeDefined();

            const exportKeys = Object.keys(instance.exports);
            expect(exportKeys).toContain('jsco:test/echo-primitives@0.1.0');
            expect(exportKeys).toContain('jsco:test/echo-compound@0.1.0');
            expect(exportKeys).toContain('jsco:test/echo-algebraic@0.1.0');

            const ns = instance.exports['jsco:test/echo-primitives@0.1.0'] as Record<string, Function>;
            expect(typeof ns.echoBool).toBe('function');
            expect(typeof ns.echoU8).toBe('function');
            expect(typeof ns.echoString).toBe('function');
        }));
    });

    describe('instantiate WASI component via P3 host + adapter', () => {
        test('produces working WASI instance with stdout', () => runWithVerbose(verbose, async () => {
            const chunks: Uint8Array[] = [];
            const stdout = new WritableStream<Uint8Array>({
                write(chunk) { chunks.push(new Uint8Array(chunk)); },
            });
            const p3 = createWasiP3Host({ stdout });
            const p2 = createWasiP2ViaP3Adapter(p3);

            const component = await createComponent(helloWorldWatWasm, verboseOptions(verbose));
            const instance = await component.instantiate(p2);
            const runNs = instance.exports['wasi:cli/run@0.2.11'] as Record<string, Function>;
            expect(runNs).toBeDefined();
            try {
                await runNs.run();
            } catch (e) {
                if (!(e instanceof WasiExit && e.exitCode === 0)) throw e;
            }
            const stdoutText = new TextDecoder().decode(
                new Uint8Array(chunks.reduce<number[]>((acc, c) => [...acc, ...c], []))
            );
            expect(stdoutText).toContain('hello from jsco');
        }));
    });

    describe('createWasiP3Host + adapter', () => {
        test('returns WASI namespace map with expected keys', () => {
            const p3 = createWasiP3Host();
            const host = createWasiP2ViaP3Adapter(p3);
            expect(host).toBeDefined();
            expect(typeof host).toBe('object');

            // Check for versioned WASI interfaces (use bracket access, toHaveProperty parses : and /)
            expect(host['wasi:cli/stdout@0.2.11']).toBeDefined();
            expect(host['wasi:random/random@0.2.11']).toBeDefined();
            expect(host['wasi:clocks/wall-clock@0.2.11']).toBeDefined();
            expect(host['wasi:clocks/monotonic-clock@0.2.11']).toBeDefined();
            expect(host['wasi:io/streams@0.2.11']).toBeDefined();
            expect(host['wasi:io/poll@0.2.11']).toBeDefined();
            expect(host['wasi:cli/stdin@0.2.11']).toBeDefined();
            expect(host['wasi:cli/stderr@0.2.11']).toBeDefined();
        });
    });

    describe('setLogger', () => {
        test('receives messages during verbose instantiation', () => runWithVerbose(verbose, async () => {
            const received: { phase: string; level: LogLevel }[] = [];
            const origLogger = verbose.logger;
            const testLogger = (phase: string, level: LogLevel, ...args: unknown[]) => {
                received.push({ phase, level });
                origLogger(phase, level, ...args);
            };

            const component = await createComponent(echoReactorWatWasm, {
                verbose: { parser: LogLevel.Summary, resolver: LogLevel.Off, binder: LogLevel.Off, executor: LogLevel.Off },
                logger: testLogger,
            } as any);
            expect(component).toBeDefined();
            // Verbose logging is guarded by isDebug — in Release builds the logger is tree-shaken
            if (isDebug) {
                expect(received.length).toBeGreaterThan(0);
                expect(received.some(r => r.phase === 'parser')).toBe(true);
            }
        }));
    });

    describe('hello-city record passing', () => {
        test('createComponent with hello-city, logger import and record parameter', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(helloCityWatWasm, verboseOptions(verbose));

            const logMessages: string[] = [];
            const imports = {
                'hello:city/logger@0.1.0': {
                    log: (msg: string) => { logMessages.push(msg); },
                },
            };

            const instance = await component.instantiate(imports);
            const greeter = instance.exports['hello:city/greeter@0.1.0'] as Record<string, Function>;
            expect(greeter).toBeDefined();
            expect(typeof greeter.run).toBe('function');

            await greeter.run({
                name: 'Prague',
                headCount: 1_000_000,
                budget: BigInt(200_000_000),
            });

            expect(logMessages.length).toBe(1);
            expect(logMessages[0]).toContain('Welcome to Prague');
            expect(logMessages[0]).toContain('drink');
        }));
    });
});

describe('useNumberForInt64 contract', () => {
    const verbose = useVerboseOnFailure();

    describe('useNumberForInt64: false (default) — all i64 exports return bigint', () => {
        test('echo-u64 returns bigint', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(echoReactorWatWasm, { useNumberForInt64: false, noJspi: true, ...verboseOptions(verbose) });
            const instance = await component.instantiate();
            const ns = instance.exports['jsco:test/echo-primitives@0.1.0'] as Record<string, Function>;
            const result = ns.echoU64(42n);
            expect(typeof result).toBe('bigint');
            expect(result).toBe(42n);
        }));

        test('echo-s64 returns bigint', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(echoReactorWatWasm, { useNumberForInt64: false, noJspi: true, ...verboseOptions(verbose) });
            const instance = await component.instantiate();
            const ns = instance.exports['jsco:test/echo-primitives@0.1.0'] as Record<string, Function>;
            const result = ns.echoS64(-100n);
            expect(typeof result).toBe('bigint');
            expect(result).toBe(-100n);
        }));

        test('echo-u64 with large value returns bigint', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(echoReactorWatWasm, { useNumberForInt64: false, noJspi: true, ...verboseOptions(verbose) });
            const instance = await component.instantiate();
            const ns = instance.exports['jsco:test/echo-primitives@0.1.0'] as Record<string, Function>;
            const large = (1n << 53n) + 1n; // beyond Number.MAX_SAFE_INTEGER
            const result = ns.echoU64(large);
            expect(typeof result).toBe('bigint');
            expect(result).toBe(large);
        }));
    });

    describe('useNumberForInt64: true — all i64 exports return number', () => {
        test('echo-u64 returns number', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(echoReactorWatWasm, { useNumberForInt64: true, noJspi: true, ...verboseOptions(verbose) });
            const instance = await component.instantiate();
            const ns = instance.exports['jsco:test/echo-primitives@0.1.0'] as Record<string, Function>;
            const result = ns.echoU64(42);
            expect(typeof result).toBe('number');
            expect(result).toBe(42);
        }));

        test('echo-s64 returns number', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(echoReactorWatWasm, { useNumberForInt64: true, noJspi: true, ...verboseOptions(verbose) });
            const instance = await component.instantiate();
            const ns = instance.exports['jsco:test/echo-primitives@0.1.0'] as Record<string, Function>;
            const result = ns.echoS64(-100);
            expect(typeof result).toBe('number');
            expect(result).toBe(-100);
        }));

        test('echo-u64 accepts number input', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(echoReactorWatWasm, { useNumberForInt64: true, noJspi: true, ...verboseOptions(verbose) });
            const instance = await component.instantiate();
            const ns = instance.exports['jsco:test/echo-primitives@0.1.0'] as Record<string, Function>;
            const result = ns.echoU64(999);
            expect(typeof result).toBe('number');
            expect(result).toBe(999);
        }));

        test('echo-s64 accepts bigint input and still returns number', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(echoReactorWatWasm, { useNumberForInt64: true, noJspi: true, ...verboseOptions(verbose) });
            const instance = await component.instantiate();
            const ns = instance.exports['jsco:test/echo-primitives@0.1.0'] as Record<string, Function>;
            const result = ns.echoS64(50n);
            expect(typeof result).toBe('number');
            expect(result).toBe(50);
        }));
    });

    describe('useNumberForInt64: string[] — per-export filtering', () => {
        test('listed export uses number, unlisted uses bigint', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(echoReactorWatWasm, {
                useNumberForInt64: ['echo-u64'],
                noJspi: true,
                ...verboseOptions(verbose),
            });
            const instance = await component.instantiate();
            const ns = instance.exports['jsco:test/echo-primitives@0.1.0'] as Record<string, Function>;

            // listed → number
            const u64result = ns.echoU64(42);
            expect(typeof u64result).toBe('number');
            expect(u64result).toBe(42);

            // unlisted → bigint
            const s64result = ns.echoS64(-7n);
            expect(typeof s64result).toBe('bigint');
            expect(s64result).toBe(-7n);
        }));
    });

    describe('hello-city record with u64 field', () => {
        test('accepts number budget when useNumberForInt64=true', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(helloCityWatWasm, { useNumberForInt64: true, noJspi: true, ...verboseOptions(verbose) });
            const logMessages: string[] = [];
            const imports = {
                'hello:city/logger@0.1.0': {
                    log: (msg: string) => { logMessages.push(msg); },
                },
            };
            const instance = await component.instantiate(imports);
            const greeter = instance.exports['hello:city/greeter@0.1.0'] as Record<string, Function>;
            greeter.run!({ name: 'Prague', headCount: 1_000_000, budget: 200_000_000 });
            expect(logMessages.length).toBe(1);
            expect(logMessages[0]).toContain('Prague');
        }));

        test('accepts bigint budget when useNumberForInt64=false', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(helloCityWatWasm, { useNumberForInt64: false, noJspi: true, ...verboseOptions(verbose) });
            const logMessages: string[] = [];
            const imports = {
                'hello:city/logger@0.1.0': {
                    log: (msg: string) => { logMessages.push(msg); },
                },
            };
            const instance = await component.instantiate(imports);
            const greeter = instance.exports['hello:city/greeter@0.1.0'] as Record<string, Function>;
            greeter.run({ name: 'Prague', headCount: 1_000_000, budget: BigInt(200_000_000) });
            expect(logMessages.length).toBe(1);
            expect(logMessages[0]).toContain('Prague');
        }));
    });
});

describe('instantiateWasiComponent', () => {
    const verbose = useVerboseOnFailure();

    test('auto-detects P2 and provides host for hello-world', () => runWithVerbose(verbose, async () => {
        const chunks: Uint8Array[] = [];
        const stdout = new WritableStream<Uint8Array>({
            write(chunk) { chunks.push(new Uint8Array(chunk)); },
        });
        const instance = await instantiateWasiComponent(helloWorldWatWasm, { stdout });
        const runNs = instance.exports['wasi:cli/run@0.2.11'] as Record<string, Function>;
        expect(runNs).toBeDefined();
        try {
            await runNs.run();
        } catch (e) {
            if (!(e instanceof WasiExit && e.exitCode === 0)) throw e;
        }
        const stdoutText = new TextDecoder().decode(
            new Uint8Array(chunks.reduce<number[]>((acc, c) => [...acc, ...c], []))
        );
        expect(stdoutText).toContain('hello from jsco');
    }));

    test('exposes imports() on WasmComponent', () => runWithVerbose(verbose, async () => {
        const component = await createComponent(helloWorldWatWasm, verboseOptions(verbose));
        const importNames = component.imports();
        expect(Array.isArray(importNames)).toBe(true);
        expect(importNames.length).toBeGreaterThan(0);
        // P2 component should import WASI interfaces
        expect(importNames.some(n => n.startsWith('wasi:'))).toBe(true);
    }));
});

describe('detectWasiType', () => {
    test('detects P2 from wasi:cli exports', () => {
        expect(detectWasiType(['wasi:cli/run@0.2.11'], [])).toBe(WasiType.P2);
    });

    test('detects P2 from wasi:http exports', () => {
        expect(detectWasiType(['wasi:http/incoming-handler@0.2.0'], [])).toBe(WasiType.P2);
    });

    test('detects P3 from wasi:cli exports', () => {
        expect(detectWasiType(['wasi:cli/run@0.3.0'], [])).toBe(WasiType.P3);
    });

    test('detects P3 from unversioned wasi exports', () => {
        expect(detectWasiType(['wasi:cli/run'], [])).toBe(WasiType.P3);
    });

    test('detects P2 from imports when exports have no WASI', () => {
        expect(detectWasiType(
            ['my:app/api@1.0.0'],
            ['wasi:filesystem/types@0.2.11']
        )).toBe(WasiType.P2);
    });

    test('returns None when no WASI interfaces', () => {
        expect(detectWasiType(['my:app/api@1.0.0'], [])).toBe(WasiType.None);
    });

    test('returns None for empty arrays', () => {
        expect(detectWasiType([], [])).toBe(WasiType.None);
    });
});

describe('WASI P1 detection', () => {
    test('core WASM module (P1) gives clear error', async () => {
        // A minimal core WASM module: magic + version 1
        const coreModule = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
        await expect(parse(coreModule)).rejects.toThrow('WebAssembly core module, not a component');
    });
});
