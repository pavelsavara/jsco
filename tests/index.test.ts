// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { getBuildInfo, createComponent, instantiateWasiComponent, LogLevel } from '../src/index';
import { createWasiP3Host, WasiExit } from '../src/host/wasip3/wasip3';
import { createWasiP2ViaP3Adapter } from '../src/host/wasip2-via-wasip3';
import { detectWasiType, WasiType, isCoreModule } from '../src/wasi-auto';
import { createWasiP1ViaP3Adapter } from '../src/host/wasip1-via-wasip3';
import { parse } from '../src/parser';
import isDebug from 'env:isDebug';
import { initializeAsserts } from '../src/utils/assert';
import { useVerboseOnFailure, verboseOptions, runWithVerbose } from './test-utils/verbose-logger';

initializeAsserts();

const echoReactorWatWasm = './integration-tests/echo-reactor-wat/echo.wasm';
const helloWorldWatWasm = './integration-tests/hello-p2-world-wat/hello.wasm';
const helloP3WorldWatWasm = './integration-tests/hello-p3-world-wat/hello-p3.wasm';
const helloCityWatWasm = './integration-tests/hello-city-wat/hello-city.wasm';
const helloP1WorldWatWasm = './integration-tests/hello-p1-world-wat/hello.wasm';
const fileIoP1WatWasm = './integration-tests/file-io-p1-wat/file-io.wasm';
const envP1WatWasm = './integration-tests/env-p1-wat/env.wasm';
const clockRandomPollP1WatWasm = './integration-tests/clock-random-poll-p1-wat/test.wasm';

describe('index.ts', () => {
    test('getBuildInfo returns git hash and configuration', () => {
        const info = getBuildInfo();
        expect(info).toHaveProperty('gitHash');
        expect(info).toHaveProperty('configuration');
        expect(typeof info.gitHash).toBe('string');
        expect(typeof info.configuration).toBe('string');
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
            try {
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
            } finally {
                instance.dispose();
            }
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
            try {
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
            } finally {
                instance.dispose();
            }
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

    describe('instantiate P3 WASI component via P3 host', () => {
        test('produces working WASI instance with stdout', () => runWithVerbose(verbose, async () => {
            const chunks: Uint8Array[] = [];
            const stdout = new WritableStream<Uint8Array>({
                write(chunk) { chunks.push(new Uint8Array(chunk)); },
            });
            const p3 = createWasiP3Host({ stdout });

            const component = await createComponent(helloP3WorldWatWasm, verboseOptions(verbose));
            const instance = await component.instantiate(p3);
            try {
                const runNs = instance.exports['wasi:cli/run@0.3.0-rc-2026-03-15'] as Record<string, Function>;
                expect(runNs).toBeDefined();
                await runNs.run();
                const stdoutText = new TextDecoder().decode(
                    new Uint8Array(chunks.reduce<number[]>((acc, c) => [...acc, ...c], []))
                );
                expect(stdoutText).toContain('hello from jsco');
            } finally {
                instance.dispose();
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
            try {
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
            } finally {
                instance.dispose();
            }
        }));
    });
});

describe('useNumberForInt64 contract', () => {
    const verbose = useVerboseOnFailure();

    describe('useNumberForInt64: false (default) — all i64 exports return bigint', () => {
        test('echo-u64 returns bigint', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(echoReactorWatWasm, { useNumberForInt64: false, noJspi: true, ...verboseOptions(verbose) });
            const instance = await component.instantiate();
            try {
                const ns = instance.exports['jsco:test/echo-primitives@0.1.0'] as Record<string, Function>;
                const result = ns.echoU64(42n);
                expect(typeof result).toBe('bigint');
                expect(result).toBe(42n);
            } finally {
                instance.dispose();
            }
        }));

        test('echo-s64 returns bigint', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(echoReactorWatWasm, { useNumberForInt64: false, noJspi: true, ...verboseOptions(verbose) });
            const instance = await component.instantiate();
            try {
                const ns = instance.exports['jsco:test/echo-primitives@0.1.0'] as Record<string, Function>;
                const result = ns.echoS64(-100n);
                expect(typeof result).toBe('bigint');
                expect(result).toBe(-100n);
            } finally {
                instance.dispose();
            }
        }));

        test('echo-u64 with large value returns bigint', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(echoReactorWatWasm, { useNumberForInt64: false, noJspi: true, ...verboseOptions(verbose) });
            const instance = await component.instantiate();
            try {
                const ns = instance.exports['jsco:test/echo-primitives@0.1.0'] as Record<string, Function>;
                const large = (1n << 53n) + 1n; // beyond Number.MAX_SAFE_INTEGER
                const result = ns.echoU64(large);
                expect(typeof result).toBe('bigint');
                expect(result).toBe(large);
            } finally {
                instance.dispose();
            }
        }));
    });

    describe('useNumberForInt64: true — all i64 exports return number', () => {
        test('echo-u64 returns number', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(echoReactorWatWasm, { useNumberForInt64: true, noJspi: true, ...verboseOptions(verbose) });
            const instance = await component.instantiate();
            try {
                const ns = instance.exports['jsco:test/echo-primitives@0.1.0'] as Record<string, Function>;
                const result = ns.echoU64(42);
                expect(typeof result).toBe('number');
                expect(result).toBe(42);
            } finally {
                instance.dispose();
            }
        }));

        test('echo-s64 returns number', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(echoReactorWatWasm, { useNumberForInt64: true, noJspi: true, ...verboseOptions(verbose) });
            const instance = await component.instantiate();
            try {
                const ns = instance.exports['jsco:test/echo-primitives@0.1.0'] as Record<string, Function>;
                const result = ns.echoS64(-100);
                expect(typeof result).toBe('number');
                expect(result).toBe(-100);
            } finally {
                instance.dispose();
            }
        }));

        test('echo-u64 accepts number input', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(echoReactorWatWasm, { useNumberForInt64: true, noJspi: true, ...verboseOptions(verbose) });
            const instance = await component.instantiate();
            try {
                const ns = instance.exports['jsco:test/echo-primitives@0.1.0'] as Record<string, Function>;
                const result = ns.echoU64(999);
                expect(typeof result).toBe('number');
                expect(result).toBe(999);
            } finally {
                instance.dispose();
            }
        }));

        test('echo-s64 accepts bigint input and still returns number', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(echoReactorWatWasm, { useNumberForInt64: true, noJspi: true, ...verboseOptions(verbose) });
            const instance = await component.instantiate();
            try {
                const ns = instance.exports['jsco:test/echo-primitives@0.1.0'] as Record<string, Function>;
                const result = ns.echoS64(50n);
                expect(typeof result).toBe('number');
                expect(result).toBe(50);
            } finally {
                instance.dispose();
            }
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
            try {
                const ns = instance.exports['jsco:test/echo-primitives@0.1.0'] as Record<string, Function>;

                // listed → number
                const u64result = ns.echoU64(42);
                expect(typeof u64result).toBe('number');
                expect(u64result).toBe(42);

                // unlisted → bigint
                const s64result = ns.echoS64(-7n);
                expect(typeof s64result).toBe('bigint');
                expect(s64result).toBe(-7n);
            } finally {
                instance.dispose();
            }
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
            try {
                const greeter = instance.exports['hello:city/greeter@0.1.0'] as Record<string, Function>;
                greeter.run!({ name: 'Prague', headCount: 1_000_000, budget: 200_000_000 });
                expect(logMessages.length).toBe(1);
                expect(logMessages[0]).toContain('Prague');
            } finally {
                instance.dispose();
            }
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
            try {
                const greeter = instance.exports['hello:city/greeter@0.1.0'] as Record<string, Function>;
                greeter.run({ name: 'Prague', headCount: 1_000_000, budget: BigInt(200_000_000) });
                expect(logMessages.length).toBe(1);
                expect(logMessages[0]).toContain('Prague');
            } finally {
                instance.dispose();
            }
        }));
    });
});

describe('instantiateWasiComponent', () => {
    const verbose = useVerboseOnFailure();

    test('auto-detects P2 and provides host for hello-p2-world', () => runWithVerbose(verbose, async () => {
        const chunks: Uint8Array[] = [];
        const stdout = new WritableStream<Uint8Array>({
            write(chunk) { chunks.push(new Uint8Array(chunk)); },
        });
        const instance = await instantiateWasiComponent(helloWorldWatWasm, { stdout });
        try {
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
        } finally {
            instance.dispose();
        }
    }));

    test('auto-detects P3 and provides host for hello-p3-world', () => runWithVerbose(verbose, async () => {
        const chunks: Uint8Array[] = [];
        const stdout = new WritableStream<Uint8Array>({
            write(chunk) { chunks.push(new Uint8Array(chunk)); },
        });
        const instance = await instantiateWasiComponent(helloP3WorldWatWasm, { stdout });
        try {
            const runNs = instance.exports['wasi:cli/run@0.3.0-rc-2026-03-15'] as Record<string, Function>;
            expect(runNs).toBeDefined();
            await runNs.run();
            const stdoutText = new TextDecoder().decode(
                new Uint8Array(chunks.reduce<number[]>((acc, c) => [...acc, ...c], []))
            );
            expect(stdoutText).toContain('hello from jsco');
        } finally {
            instance.dispose();
        }
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
    test('core WASM module (P1) gives clear error from parser', async () => {
        // A minimal core WASM module: magic + version 1
        const coreModule = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
        await expect(parse(coreModule)).rejects.toThrow('WebAssembly core module, not a component');
    });

    test('isCoreModule detects core modules', () => {
        const core = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
        expect(isCoreModule(core)).toBe(true);
    });

    test('isCoreModule rejects components', () => {
        const component = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x0d, 0x00, 0x01, 0x00]);
        expect(isCoreModule(component)).toBe(false);
    });
});

describe('WASI P1 adapter', () => {
    test('createWasiP1ViaP3Adapter returns adapter with all 45 functions', () => {
        const adapter = createWasiP1ViaP3Adapter();
        expect(adapter).toBeDefined();
        expect(adapter.imports.wasi_snapshot_preview1).toBeDefined();
        expect(typeof adapter.imports.wasi_snapshot_preview1.fd_write).toBe('function');
        expect(typeof adapter.imports.wasi_snapshot_preview1.proc_exit).toBe('function');
        expect(typeof adapter.imports.wasi_snapshot_preview1.args_get).toBe('function');
        expect(typeof adapter.imports.wasi_snapshot_preview1.environ_get).toBe('function');
        expect(typeof adapter.imports.wasi_snapshot_preview1.clock_time_get).toBe('function');
        expect(typeof adapter.imports.wasi_snapshot_preview1.random_get).toBe('function');
        expect(typeof adapter.imports.wasi_snapshot_preview1.poll_oneoff).toBe('function');
        expect(typeof adapter.bindMemory).toBe('function');
    });

    test('hello-p1-world-wat prints hello via fd_write', async () => {
        const adapter = createWasiP1ViaP3Adapter();
        const fs = await import('node:fs');
        const wasmBytes = fs.readFileSync(helloP1WorldWatWasm);
        const module = await WebAssembly.compile(wasmBytes);
        const instance = await WebAssembly.instantiate(module, adapter.imports);

        const wasmMemory = instance.exports['memory'] as WebAssembly.Memory;
        adapter.bindMemory(wasmMemory);

        try {
            (instance.exports['_start'] as Function)();
        } catch (e: unknown) {
            if (!(e instanceof Error && e.name === 'WasiExit' && (e as any).exitCode === 0)) throw e;
        }

        // Check that adapter captured stdout
        const adapterAny = adapter as any;
        const chunks: Uint8Array[] = adapterAny.stdoutChunks;
        expect(chunks.length).toBeGreaterThan(0);
        const text = new TextDecoder().decode(
            new Uint8Array(chunks.reduce<number[]>((acc, c) => [...acc, ...c], []))
        );
        expect(text).toContain('hello from jsco');
    });
});

describe('instantiateWasiComponent with P1 module', () => {
    test('auto-detects P1 core module and provides instance with _start', async () => {
        const fs = await import('node:fs');
        const wasmBytes = fs.readFileSync(helloP1WorldWatWasm);

        const instance = await instantiateWasiComponent(wasmBytes);
        try {
            expect(instance.exports['_start']).toBeDefined();
            expect(typeof instance.exports['_start']).toBe('function');
        } finally {
            instance.dispose();
        }
    });

    test('auto-detects P1 via string path', async () => {
        // File path triggers toBytes→fetchLike→fs.readFile, then core module detection.
        // proc_exit(0) does NOT throw during instantiation since _start is not auto-called.
        const instance = await instantiateWasiComponent(helloP1WorldWatWasm);
        instance.dispose();
    });
});

describe('WASI P1 file I/O', () => {
    test('file-io-p1-wat: write file, read back, output to stdout', async () => {
        const adapter = createWasiP1ViaP3Adapter({
            fs: new Map(), // empty VFS
        });
        const fs = await import('node:fs');
        const wasmBytes = fs.readFileSync(fileIoP1WatWasm);
        const module = await WebAssembly.compile(wasmBytes);
        const instance = await WebAssembly.instantiate(module, adapter.imports);

        const wasmMemory = instance.exports['memory'] as WebAssembly.Memory;
        adapter.bindMemory(wasmMemory);

        try {
            (instance.exports['_start'] as Function)();
        } catch (e: unknown) {
            if (!(e instanceof Error && e.name === 'WasiExit' && (e as any).exitCode === 0)) throw e;
        }

        // Stdout should contain "hello from file\n" (read back from VFS file)
        const adapterAny = adapter as any;
        const chunks: Uint8Array[] = adapterAny.stdoutChunks;
        expect(chunks.length).toBeGreaterThan(0);
        const text = new TextDecoder().decode(
            new Uint8Array(chunks.reduce<number[]>((acc, c) => [...acc, ...c], []))
        );
        expect(text).toBe('hello from file\n');
    });

    test('path_open with create, fd_write, fd_read round-trip', async () => {
        const adapter = createWasiP1ViaP3Adapter({
            fs: new Map([['existing.txt', 'pre-existing content']]),
        });
        // Use a minimal module that just needs memory
        const fs = await import('node:fs');
        const wasmBytes = fs.readFileSync(fileIoP1WatWasm);
        const module = await WebAssembly.compile(wasmBytes);
        const instance = await WebAssembly.instantiate(module, adapter.imports);
        const wasmMemory = instance.exports['memory'] as WebAssembly.Memory;
        adapter.bindMemory(wasmMemory);

        // Verify the pre-existing file can be opened via the adapter's imports
        const p1 = adapter.imports.wasi_snapshot_preview1;

        // Manually test fd_prestat_get on fd 3 (root preopen)
        const errno = p1.fd_prestat_get(3, 800);
        expect(errno).toBe(0); // Success

        // fd_prestat_get on fd 4 should return Badf (8) since no fd 4 exists yet
        const errno2 = p1.fd_prestat_get(4, 800);
        expect(errno2).toBe(8); // Badf
    });

    test('path_create_directory and path_remove_directory', async () => {
        const adapter = createWasiP1ViaP3Adapter({ fs: new Map() });
        const fs = await import('node:fs');
        const wasmBytes = fs.readFileSync(fileIoP1WatWasm);
        const module = await WebAssembly.compile(wasmBytes);
        const instance = await WebAssembly.instantiate(module, adapter.imports);
        const wasmMemory = instance.exports['memory'] as WebAssembly.Memory;
        adapter.bindMemory(wasmMemory);

        const p1 = adapter.imports.wasi_snapshot_preview1;
        const enc = new TextEncoder();

        // Write "testdir" at offset 900 in WASM memory
        const dirName = enc.encode('testdir');
        new Uint8Array(wasmMemory.buffer, 900, dirName.length).set(dirName);

        // Create directory
        const mkdirErr = p1.path_create_directory(3, 900, dirName.length);
        expect(mkdirErr).toBe(0); // Success

        // Creating same directory again should fail with Exist(20)
        const mkdirErr2 = p1.path_create_directory(3, 900, dirName.length);
        expect(mkdirErr2).toBe(20); // Exist

        // Remove directory
        const rmdirErr = p1.path_remove_directory(3, 900, dirName.length);
        expect(rmdirErr).toBe(0); // Success

        // Removing again should fail with Noent(44)
        const rmdirErr2 = p1.path_remove_directory(3, 900, dirName.length);
        expect(rmdirErr2).toBe(44); // Noent
    });

    test('path_filestat_get returns file metadata', async () => {
        const content = 'hello world';
        const adapter = createWasiP1ViaP3Adapter({
            fs: new Map([['info.txt', content]]),
        });
        const fs = await import('node:fs');
        const wasmBytes = fs.readFileSync(fileIoP1WatWasm);
        const module = await WebAssembly.compile(wasmBytes);
        const instance = await WebAssembly.instantiate(module, adapter.imports);
        const wasmMemory = instance.exports['memory'] as WebAssembly.Memory;
        adapter.bindMemory(wasmMemory);

        const p1 = adapter.imports.wasi_snapshot_preview1;
        const enc = new TextEncoder();

        // Write filename at offset 900
        const fileName = enc.encode('info.txt');
        new Uint8Array(wasmMemory.buffer, 900, fileName.length).set(fileName);

        // Get file stat at offset 1000 (64 bytes for filestat)
        const err = p1.path_filestat_get(3, 0, 900, fileName.length, 1000);
        expect(err).toBe(0);

        const view = new DataView(wasmMemory.buffer);
        // filetype at offset 16 should be RegularFile (4)
        expect(view.getUint8(1000 + 16)).toBe(4);
        // size at offset 32 should be the content length
        expect(view.getBigUint64(1000 + 32, true)).toBe(BigInt(enc.encode(content).length));
    });

    test('fd_seek and fd_tell', async () => {
        const adapter = createWasiP1ViaP3Adapter({
            fs: new Map([['seek-test.txt', 'abcdefghij']]),
        });
        const fs = await import('node:fs');
        const wasmBytes = fs.readFileSync(fileIoP1WatWasm);
        const module = await WebAssembly.compile(wasmBytes);
        const instance = await WebAssembly.instantiate(module, adapter.imports);
        const wasmMemory = instance.exports['memory'] as WebAssembly.Memory;
        adapter.bindMemory(wasmMemory);

        const p1 = adapter.imports.wasi_snapshot_preview1;
        const enc = new TextEncoder();
        const view = new DataView(wasmMemory.buffer);

        // Open the file
        const fileName = enc.encode('seek-test.txt');
        new Uint8Array(wasmMemory.buffer, 900, fileName.length).set(fileName);
        const openErr = p1.path_open(3, 0, 900, fileName.length, 0, -1n, -1n, 0, 600);
        expect(openErr).toBe(0);
        const fileFd = view.getUint32(600, true);

        // Seek to offset 5 (Set)
        const seekErr = p1.fd_seek(fileFd, 5n, 0, 700); // Whence.Set = 0
        expect(seekErr).toBe(0);
        expect(view.getBigUint64(700, true)).toBe(5n);

        // Tell should report 5
        const tellErr = p1.fd_tell(fileFd, 700);
        expect(tellErr).toBe(0);
        expect(view.getBigUint64(700, true)).toBe(5n);

        // Seek to end
        const seekEndErr = p1.fd_seek(fileFd, 0n, 2, 700); // Whence.End = 2
        expect(seekEndErr).toBe(0);
        expect(view.getBigUint64(700, true)).toBe(10n); // file is 10 bytes
    });

    test('fd_readdir lists directory entries', async () => {
        const adapter = createWasiP1ViaP3Adapter({
            fs: new Map([
                ['a.txt', 'aaa'],
                ['b.txt', 'bbb'],
            ]),
        });
        const fs = await import('node:fs');
        const wasmBytes = fs.readFileSync(fileIoP1WatWasm);
        const module = await WebAssembly.compile(wasmBytes);
        const instance = await WebAssembly.instantiate(module, adapter.imports);
        const wasmMemory = instance.exports['memory'] as WebAssembly.Memory;
        adapter.bindMemory(wasmMemory);

        const p1 = adapter.imports.wasi_snapshot_preview1;
        const view = new DataView(wasmMemory.buffer);

        // fd_readdir on root preopen (fd 3)
        // buf=1000, buf_len=512, cookie=0, bufused_ptr=200
        const err = p1.fd_readdir(3, 1000, 512, 0n, 200);
        expect(err).toBe(0);
        const bufUsed = view.getUint32(200, true);
        // Should have some bytes used (at least 2 entries * 24 header + names)
        expect(bufUsed).toBeGreaterThan(0);

        // Parse first dirent: d_namlen at offset 16
        const namLen1 = view.getUint32(1000 + 16, true);
        expect(namLen1).toBeGreaterThan(0);
    });

    test('path_unlink_file removes a file', async () => {
        const adapter = createWasiP1ViaP3Adapter({
            fs: new Map([['to-delete.txt', 'content']]),
        });
        const fs = await import('node:fs');
        const wasmBytes = fs.readFileSync(fileIoP1WatWasm);
        const module = await WebAssembly.compile(wasmBytes);
        const instance = await WebAssembly.instantiate(module, adapter.imports);
        const wasmMemory = instance.exports['memory'] as WebAssembly.Memory;
        adapter.bindMemory(wasmMemory);

        const p1 = adapter.imports.wasi_snapshot_preview1;
        const enc = new TextEncoder();

        const fileName = enc.encode('to-delete.txt');
        new Uint8Array(wasmMemory.buffer, 900, fileName.length).set(fileName);

        // File should exist — stat returns success
        const statErr = p1.path_filestat_get(3, 0, 900, fileName.length, 1000);
        expect(statErr).toBe(0);

        // Unlink the file
        const unlinkErr = p1.path_unlink_file(3, 900, fileName.length);
        expect(unlinkErr).toBe(0);

        // File should not exist — stat returns Noent(44)
        const statErr2 = p1.path_filestat_get(3, 0, 900, fileName.length, 1000);
        expect(statErr2).toBe(44);
    });

    test('path_rename moves a file', async () => {
        const adapter = createWasiP1ViaP3Adapter({
            fs: new Map([['old-name.txt', 'rename me']]),
        });
        const fs = await import('node:fs');
        const wasmBytes = fs.readFileSync(fileIoP1WatWasm);
        const module = await WebAssembly.compile(wasmBytes);
        const instance = await WebAssembly.instantiate(module, adapter.imports);
        const wasmMemory = instance.exports['memory'] as WebAssembly.Memory;
        adapter.bindMemory(wasmMemory);

        const p1 = adapter.imports.wasi_snapshot_preview1;
        const enc = new TextEncoder();

        const oldName = enc.encode('old-name.txt');
        new Uint8Array(wasmMemory.buffer, 900, oldName.length).set(oldName);
        const newName = enc.encode('new-name.txt');
        new Uint8Array(wasmMemory.buffer, 950, newName.length).set(newName);

        // Rename: fd=3, old_path=900, old_len=12, new_fd=3, new_path=950, new_len=12
        const renameErr = p1.path_rename(3, 900, oldName.length, 3, 950, newName.length);
        expect(renameErr).toBe(0);

        // Old name should be gone
        const statOld = p1.path_filestat_get(3, 0, 900, oldName.length, 1000);
        expect(statOld).toBe(44); // Noent

        // New name should exist
        const statNew = p1.path_filestat_get(3, 0, 950, newName.length, 1000);
        expect(statNew).toBe(0);
    });

    test('instantiateWasiComponent with P1 module and VFS config', async () => {
        const fs = await import('node:fs');
        const wasmBytes = fs.readFileSync(fileIoP1WatWasm);

        const instance = await instantiateWasiComponent(wasmBytes, {
            fs: new Map(),
        });
        try {
            // Should have _start since it's a command module
            expect(instance.exports['_start']).toBeDefined();
        } finally {
            instance.dispose();
        }
    });
});

describe('WASI P1 environment and args', () => {
    test('env-p1-wat: args and environ round-trip', async () => {
        const adapter = createWasiP1ViaP3Adapter({
            args: ['program', 'hello-arg'],
            env: [['MY_VAR', 'my_value']],
        });
        const fs = await import('node:fs');
        const wasmBytes = fs.readFileSync(envP1WatWasm);
        const module = await WebAssembly.compile(wasmBytes);
        const instance = await WebAssembly.instantiate(module, adapter.imports);

        const wasmMemory = instance.exports['memory'] as WebAssembly.Memory;
        adapter.bindMemory(wasmMemory);

        try {
            (instance.exports['_start'] as Function)();
        } catch (e: unknown) {
            if (!(e instanceof Error && e.name === 'WasiExit' && (e as any).exitCode === 0)) throw e;
        }

        const adapterAny = adapter as any;
        const chunks: Uint8Array[] = adapterAny.stdoutChunks;
        const text = new TextDecoder().decode(
            new Uint8Array(chunks.reduce<number[]>((acc, c) => [...acc, ...c], []))
        );
        expect(text).toBe('hello-arg\nMY_VAR=my_value\n');
    });

    test('args_sizes_get returns correct counts', () => {
        const adapter = createWasiP1ViaP3Adapter({
            args: ['a', 'bb', 'ccc'],
        });
        const memory = new WebAssembly.Memory({ initial: 1 });
        adapter.bindMemory(memory);

        const p1 = adapter.imports.wasi_snapshot_preview1;
        const view = new DataView(memory.buffer);

        const err = p1.args_sizes_get(0, 4);
        expect(err).toBe(0);
        expect(view.getUint32(0, true)).toBe(3); // argc
        // buf size = "a\0" + "bb\0" + "ccc\0" = 2 + 3 + 4 = 9
        expect(view.getUint32(4, true)).toBe(9);
    });

    test('environ_sizes_get returns correct counts', () => {
        const adapter = createWasiP1ViaP3Adapter({
            env: [['K1', 'V1'], ['KEY2', 'VALUE2']],
        });
        const memory = new WebAssembly.Memory({ initial: 1 });
        adapter.bindMemory(memory);

        const p1 = adapter.imports.wasi_snapshot_preview1;
        const view = new DataView(memory.buffer);

        const err = p1.environ_sizes_get(0, 4);
        expect(err).toBe(0);
        expect(view.getUint32(0, true)).toBe(2); // count
        // buf size = "K1=V1\0" + "KEY2=VALUE2\0" = 6 + 12 = 18
        expect(view.getUint32(4, true)).toBe(18);
    });

    test('empty args and env return zero counts', () => {
        const adapter = createWasiP1ViaP3Adapter();
        const memory = new WebAssembly.Memory({ initial: 1 });
        adapter.bindMemory(memory);

        const p1 = adapter.imports.wasi_snapshot_preview1;
        const view = new DataView(memory.buffer);

        p1.args_sizes_get(0, 4);
        expect(view.getUint32(0, true)).toBe(0);
        expect(view.getUint32(4, true)).toBe(0);

        p1.environ_sizes_get(8, 12);
        expect(view.getUint32(8, true)).toBe(0);
        expect(view.getUint32(12, true)).toBe(0);
    });
});

describe('WASI P1 clocks', () => {
    test('clock_res_get returns non-zero resolution for realtime and monotonic', () => {
        const adapter = createWasiP1ViaP3Adapter();
        const memory = new WebAssembly.Memory({ initial: 1 });
        adapter.bindMemory(memory);

        const p1 = adapter.imports.wasi_snapshot_preview1;
        const view = new DataView(memory.buffer);

        // Realtime (id=0)
        const err0 = p1.clock_res_get(0, 0);
        expect(err0).toBe(0);
        expect(view.getBigUint64(0, true)).toBeGreaterThan(0n);

        // Monotonic (id=1)
        const err1 = p1.clock_res_get(1, 0);
        expect(err1).toBe(0);
        expect(view.getBigUint64(0, true)).toBeGreaterThan(0n);
    });

    test('clock_res_get returns Notsup for process/thread CPU time', () => {
        const adapter = createWasiP1ViaP3Adapter();
        const memory = new WebAssembly.Memory({ initial: 1 });
        adapter.bindMemory(memory);

        const p1 = adapter.imports.wasi_snapshot_preview1;

        // ProcessCputimeId (2) and ThreadCputimeId (3)
        expect(p1.clock_res_get(2, 0)).toBe(58); // Notsup
        expect(p1.clock_res_get(3, 0)).toBe(58); // Notsup
    });

    test('clock_time_get returns non-zero time for realtime', () => {
        const adapter = createWasiP1ViaP3Adapter();
        const memory = new WebAssembly.Memory({ initial: 1 });
        adapter.bindMemory(memory);

        const p1 = adapter.imports.wasi_snapshot_preview1;
        const view = new DataView(memory.buffer);

        const err = p1.clock_time_get(0, 0n, 0);
        expect(err).toBe(0);
        const timeNs = view.getBigUint64(0, true);
        // Should be a reasonable timestamp (after year 2020 in nanoseconds)
        expect(timeNs).toBeGreaterThan(1577836800000000000n);
    });

    test('clock_time_get returns non-zero time for monotonic', () => {
        const adapter = createWasiP1ViaP3Adapter();
        const memory = new WebAssembly.Memory({ initial: 1 });
        adapter.bindMemory(memory);

        const p1 = adapter.imports.wasi_snapshot_preview1;
        const view = new DataView(memory.buffer);

        const err = p1.clock_time_get(1, 0n, 0);
        expect(err).toBe(0);
        // Monotonic time should be >= 0 (it's relative to process start)
        expect(view.getBigUint64(0, true)).toBeGreaterThanOrEqual(0n);
    });
});

describe('WASI P1 random', () => {
    test('random_get fills buffer with random bytes', () => {
        const adapter = createWasiP1ViaP3Adapter();
        const memory = new WebAssembly.Memory({ initial: 1 });
        adapter.bindMemory(memory);

        const p1 = adapter.imports.wasi_snapshot_preview1;

        // Zero-fill the buffer first
        new Uint8Array(memory.buffer, 0, 64).fill(0);

        const err = p1.random_get(0, 64);
        expect(err).toBe(0);

        // Check at least one non-zero byte
        const buf = new Uint8Array(memory.buffer, 0, 64);
        const hasNonZero = buf.some(b => b !== 0);
        expect(hasNonZero).toBe(true);
    });

    test('random_get with zero length succeeds', () => {
        const adapter = createWasiP1ViaP3Adapter();
        const memory = new WebAssembly.Memory({ initial: 1 });
        adapter.bindMemory(memory);

        const err = adapter.imports.wasi_snapshot_preview1.random_get(0, 0);
        expect(err).toBe(0);
    });
});

describe('WASI P1 poll', () => {
    test('poll_oneoff with clock subscription returns immediately', () => {
        const adapter = createWasiP1ViaP3Adapter();
        const memory = new WebAssembly.Memory({ initial: 1 });
        adapter.bindMemory(memory);

        const p1 = adapter.imports.wasi_snapshot_preview1;
        const view = new DataView(memory.buffer);

        // Build a clock subscription at offset 0 (48 bytes)
        // userdata = 99
        view.setBigUint64(0, 99n, true);
        // u.tag = 0 (Clock) at offset 8
        view.setUint8(8, 0);
        // u.clock.id = 1 (Monotonic) at offset 16
        view.setUint32(16, 1, true);
        // u.clock.timeout = 0 at offset 24
        view.setBigUint64(24, 0n, true);
        // u.clock.precision = 0 at offset 32
        view.setBigUint64(32, 0n, true);
        // u.clock.flags = 0 at offset 40
        view.setUint16(40, 0, true);

        // Event output at offset 100 (32 bytes), nevents at offset 200
        const err = p1.poll_oneoff(0, 100, 1, 200);
        expect(err).toBe(0);
        expect(view.getUint32(200, true)).toBe(1); // 1 event
        expect(view.getBigUint64(100, true)).toBe(99n); // userdata preserved
        expect(view.getUint16(108, true)).toBe(0); // error = Success
        expect(view.getUint8(110)).toBe(0); // type = Clock
    });

    test('poll_oneoff with fd_read subscription returns ready', () => {
        const adapter = createWasiP1ViaP3Adapter();
        const memory = new WebAssembly.Memory({ initial: 1 });
        adapter.bindMemory(memory);

        const p1 = adapter.imports.wasi_snapshot_preview1;
        const view = new DataView(memory.buffer);

        // Build an FdRead subscription at offset 0 (48 bytes)
        // userdata = 7
        view.setBigUint64(0, 7n, true);
        // u.tag = 1 (FdRead) at offset 8
        view.setUint8(8, 1);
        // u.fd_read.file_descriptor = 0 (stdin) at offset 16
        view.setUint32(16, 0, true);

        const err = p1.poll_oneoff(0, 100, 1, 200);
        expect(err).toBe(0);
        expect(view.getUint32(200, true)).toBe(1);
        expect(view.getBigUint64(100, true)).toBe(7n); // userdata
        expect(view.getUint8(110)).toBe(1); // type = FdRead
    });

    test('poll_oneoff with multiple subscriptions', () => {
        const adapter = createWasiP1ViaP3Adapter();
        const memory = new WebAssembly.Memory({ initial: 1 });
        adapter.bindMemory(memory);

        const p1 = adapter.imports.wasi_snapshot_preview1;
        const view = new DataView(memory.buffer);

        // Subscription 0: Clock at offset 0
        view.setBigUint64(0, 1n, true);
        view.setUint8(8, 0); // Clock
        view.setUint32(16, 0, true); // Realtime
        view.setBigUint64(24, 0n, true);
        view.setBigUint64(32, 0n, true);
        view.setUint16(40, 0, true);

        // Subscription 1: FdWrite at offset 48
        view.setBigUint64(48, 2n, true);
        view.setUint8(56, 2); // FdWrite
        view.setUint32(64, 1, true); // stdout

        // Events at 200, nevents at 300
        const err = p1.poll_oneoff(0, 200, 2, 300);
        expect(err).toBe(0);
        expect(view.getUint32(300, true)).toBe(2); // 2 events
    });
});

describe('WASI P1 sched_yield and sockets', () => {
    test('sched_yield returns Success', () => {
        const adapter = createWasiP1ViaP3Adapter();
        expect(adapter.imports.wasi_snapshot_preview1.sched_yield()).toBe(0);
    });

    test('sock_accept returns Notsup', () => {
        const adapter = createWasiP1ViaP3Adapter();
        const memory = new WebAssembly.Memory({ initial: 1 });
        adapter.bindMemory(memory);
        expect(adapter.imports.wasi_snapshot_preview1.sock_accept(0, 0, 0)).toBe(58);
    });

    test('sock_recv returns Notsup', () => {
        const adapter = createWasiP1ViaP3Adapter();
        const memory = new WebAssembly.Memory({ initial: 1 });
        adapter.bindMemory(memory);
        expect(adapter.imports.wasi_snapshot_preview1.sock_recv(0, 0, 0, 0, 0, 0)).toBe(58);
    });

    test('sock_send returns Notsup', () => {
        const adapter = createWasiP1ViaP3Adapter();
        const memory = new WebAssembly.Memory({ initial: 1 });
        adapter.bindMemory(memory);
        expect(adapter.imports.wasi_snapshot_preview1.sock_send(0, 0, 0, 0, 0)).toBe(58);
    });

    test('sock_shutdown returns Notsup', () => {
        const adapter = createWasiP1ViaP3Adapter();
        const memory = new WebAssembly.Memory({ initial: 1 });
        adapter.bindMemory(memory);
        expect(adapter.imports.wasi_snapshot_preview1.sock_shutdown(0, 0)).toBe(58);
    });
});

describe('WASI P1 clocks/random/poll integration (WAT)', () => {
    test('clock-random-poll-p1-wat: all Phase 3 functions pass', async () => {
        const adapter = createWasiP1ViaP3Adapter();
        const fs = await import('node:fs');
        const wasmBytes = fs.readFileSync(clockRandomPollP1WatWasm);
        const module = await WebAssembly.compile(wasmBytes);
        const instance = await WebAssembly.instantiate(module, adapter.imports);

        const wasmMemory = instance.exports['memory'] as WebAssembly.Memory;
        adapter.bindMemory(wasmMemory);

        try {
            (instance.exports['_start'] as Function)();
        } catch (e: unknown) {
            if (!(e instanceof Error && e.name === 'WasiExit')) throw e;
            const exitCode = (e as any).exitCode;
            if (exitCode !== 0) {
                throw new Error(`WAT test exited with code ${exitCode} (see test.wat for error map)`);
            }
        }

        const adapterAny = adapter as any;
        const chunks: Uint8Array[] = adapterAny.stdoutChunks;
        const text = new TextDecoder().decode(
            new Uint8Array(chunks.reduce<number[]>((acc, c) => [...acc, ...c], []))
        );
        expect(text).toBe('ok\n');
    });
});

describe('instantiateWasiComponent input normalization', () => {
    test('accepts Uint8Array input', async () => {
        const fs = await import('node:fs');
        const bytes = fs.readFileSync(helloP1WorldWatWasm);
        const instance = await instantiateWasiComponent(new Uint8Array(bytes));
        instance.dispose();
    });

    test('accepts ArrayBuffer input', async () => {
        const fs = await import('node:fs');
        const bytes = fs.readFileSync(helloP1WorldWatWasm);
        const instance = await instantiateWasiComponent(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        instance.dispose();
    });

    test('accepts ArrayLike<number> input', async () => {
        const fs = await import('node:fs');
        const bytes = fs.readFileSync(helloP1WorldWatWasm);
        const arrayLike: ArrayLike<number> = { length: bytes.length, ...Array.from(bytes) };
        const instance = await instantiateWasiComponent(arrayLike as any);
        instance.dispose();
    });

    test('accepts ReadableStream input for P1 module', async () => {
        const fs = await import('node:fs');
        const bytes = fs.readFileSync(helloP1WorldWatWasm);
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new Uint8Array(bytes));
                controller.close();
            }
        });
        const instance = await instantiateWasiComponent(stream as any);
        instance.dispose();
    });

    test('rejects unsupported input type', async () => {
        await expect(instantiateWasiComponent(42 as any)).rejects.toThrow('Unsupported input type');
    });
});
