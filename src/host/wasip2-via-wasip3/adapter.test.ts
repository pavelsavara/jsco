// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * Unit tests for the WASIp2-via-WASIp3 adapter.
 *
 * All tests use mocked P3 implementations — no real WASM or integration tests.
 */

import type { WasiP3Imports } from '../../../wit/wasip3/types/index';
import { createWasiP2ViaP3Adapter } from './index';
import { createStreamPair } from '../wasip3/streams';
import type { WasiStreamReadable } from '../wasip3/streams';
import type { WasiPollable, WasiInputStream, WasiOutputStream } from './io';

// ─── Mock P3 Host Builder ───

function createMockP3(overrides?: Partial<Record<string, unknown>>): WasiP3Imports {
    // Build a minimal mock P3 host with all required interfaces
    const base: Record<string, unknown> = {
        'wasi:cli/environment': {
            getEnvironment: () => [['FOO', 'bar'], ['BAZ', 'qux']] as [string, string][],
            getArguments: () => ['arg1', 'arg2'],
            getInitialCwd: () => '/home/test',
        },
        'wasi:cli/exit': {
            exit: (status: { tag: string }) => {
                throw new Error(`exit: ${status.tag}`);
            },
            exitWithCode: (code: number) => {
                throw new Error(`exit: ${code}`);
            },
        },
        'wasi:cli/stdin': {
            readViaStream: () => {
                const pair = createStreamPair<Uint8Array>();
                pair.write(new Uint8Array([72, 101, 108, 108, 111])); // "Hello"
                pair.close();
                return [pair.readable, Promise.resolve()];
            },
        },
        'wasi:cli/stdout': {
            writeViaStream: (_data: WasiStreamReadable<Uint8Array>) => Promise.resolve(),
        },
        'wasi:cli/stderr': {
            writeViaStream: (_data: WasiStreamReadable<Uint8Array>) => Promise.resolve(),
        },
        'wasi:cli/terminal-input': {},
        'wasi:cli/terminal-output': {},
        'wasi:cli/terminal-stdin': {
            getTerminalStdin: () => undefined,
        },
        'wasi:cli/terminal-stdout': {
            getTerminalStdout: () => undefined,
        },
        'wasi:cli/terminal-stderr': {
            getTerminalStderr: () => undefined,
        },
        'wasi:cli/types': {},
        'wasi:clocks/monotonic-clock': {
            now: () => BigInt(Math.round(performance.now() * 1_000_000)),
            getResolution: () => 1_000n,
            waitUntil: (when: bigint) => {
                const nowNs = BigInt(Math.round(performance.now() * 1_000_000));
                if (when <= nowNs) return undefined;
                const delayMs = Number(when - nowNs) / 1_000_000;
                return new Promise(resolve => setTimeout(resolve, Math.max(0, delayMs)));
            },
            waitFor: (howLong: bigint) => {
                if (howLong <= 0n) return undefined;
                const delayMs = Number(howLong) / 1_000_000;
                return new Promise(resolve => setTimeout(resolve, Math.max(0, delayMs)));
            },
        },
        'wasi:clocks/system-clock': {
            now: () => {
                const ms = Date.now();
                return { seconds: BigInt(Math.floor(ms / 1000)), nanoseconds: (ms % 1000) * 1_000_000 };
            },
            getResolution: () => 1_000_000n,
        },
        'wasi:clocks/timezone': {
            ianaId: () => 'UTC',
            utcOffset: () => 0n,
            toDebugString: () => 'UTC',
        },
        'wasi:clocks/types': {},
        'wasi:filesystem/preopens': {
            getDirectories: () => [],
        },
        'wasi:filesystem/types': {},
        'wasi:http/client': {
            send: () => { throw new Error('not implemented'); },
        },
        'wasi:http/handler': {
            handle: () => { throw new Error('not implemented'); },
        },
        'wasi:http/types': {},
        'wasi:random/random': {
            getRandomBytes: (len: bigint) => {
                const buf = new Uint8Array(Number(len));
                crypto.getRandomValues(buf);
                return buf;
            },
            getRandomU64: () => {
                const buf = new Uint8Array(8);
                crypto.getRandomValues(buf);
                const view = new DataView(buf.buffer);
                return view.getBigUint64(0, true);
            },
        },
        'wasi:random/insecure': {
            getInsecureRandomBytes: (len: bigint) => new Uint8Array(Number(len)),
            getInsecureRandomU64: () => 42n,
        },
        'wasi:random/insecure-seed': {
            getInsecureSeed: () => [1n, 2n] as [bigint, bigint],
        },
        'wasi:sockets/ip-name-lookup': {
            resolveAddresses: () => { throw Object.assign(new Error('not-supported'), { tag: 'not-supported' }); },
        },
        'wasi:sockets/types': {
            TcpSocket: { create: () => { throw Object.assign(new Error('not-supported'), { tag: 'not-supported' }); } },
            UdpSocket: { create: () => { throw Object.assign(new Error('not-supported'), { tag: 'not-supported' }); } },
        },
    };

    return { ...base, ...overrides } as unknown as WasiP3Imports;
}

// ─── Tests ───

describe('WASIp2-via-WASIp3 Adapter', () => {

    describe('createWasiP2ViaP3Adapter', () => {
        it('returns an object with all required P2 interface keys', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);

            expect(p2['wasi:random/random']).toBeDefined();
            expect(p2['wasi:random/insecure']).toBeDefined();
            expect(p2['wasi:random/insecure-seed']).toBeDefined();
            expect(p2['wasi:clocks/wall-clock']).toBeDefined();
            expect(p2['wasi:clocks/monotonic-clock']).toBeDefined();
            expect(p2['wasi:clocks/timezone']).toBeDefined();
            expect(p2['wasi:io/poll']).toBeDefined();
            expect(p2['wasi:io/error']).toBeDefined();
            expect(p2['wasi:io/streams']).toBeDefined();
            expect(p2['wasi:cli/environment']).toBeDefined();
            expect(p2['wasi:cli/exit']).toBeDefined();
            expect(p2['wasi:cli/stdin']).toBeDefined();
            expect(p2['wasi:cli/stdout']).toBeDefined();
            expect(p2['wasi:cli/stderr']).toBeDefined();
            expect(p2['wasi:cli/terminal-stdin']).toBeDefined();
            expect(p2['wasi:cli/terminal-stdout']).toBeDefined();
            expect(p2['wasi:cli/terminal-stderr']).toBeDefined();
            expect(p2['wasi:filesystem/types']).toBeDefined();
            expect(p2['wasi:filesystem/preopens']).toBeDefined();
            expect(p2['wasi:http/types']).toBeDefined();
            expect(p2['wasi:http/outgoing-handler']).toBeDefined();
            expect(p2['wasi:sockets/instance-network']).toBeDefined();
            expect(p2['wasi:sockets/network']).toBeDefined();
            expect(p2['wasi:sockets/tcp-create-socket']).toBeDefined();
            expect(p2['wasi:sockets/tcp']).toBeDefined();
            expect(p2['wasi:sockets/udp-create-socket']).toBeDefined();
            expect(p2['wasi:sockets/udp']).toBeDefined();
            expect(p2['wasi:sockets/ip-name-lookup']).toBeDefined();
        });

        it('registers versioned keys for all interfaces', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);

            // Check a few versioned keys
            expect(p2['wasi:random/random@0.2.0']).toBeDefined();
            expect(p2['wasi:random/random@0.2.11']).toBeDefined();
            expect(p2['wasi:cli/stdin@0.2.0']).toBeDefined();
            expect(p2['wasi:io/poll@0.2.5']).toBeDefined();

            // Versioned and unversioned should be the same object
            expect(p2['wasi:random/random@0.2.0']).toBe(p2['wasi:random/random']);
        });
    });

    describe('wasi:random/* (passthrough)', () => {
        it('getRandomBytes returns requested length', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const fn = p2['wasi:random/random']!['get-random-bytes']!;
            const bytes = fn(16n) as Uint8Array;
            expect(bytes).toBeInstanceOf(Uint8Array);
            expect(bytes.length).toBe(16);
        });

        it('getRandomU64 returns a bigint', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const fn = p2['wasi:random/random']!['get-random-u64']!;
            const val = fn() as bigint;
            expect(typeof val).toBe('bigint');
        });

        it('insecureSeed returns [bigint, bigint]', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const fn = p2['wasi:random/insecure-seed']!['insecure-seed']!;
            const seed = fn() as [bigint, bigint];
            expect(seed).toEqual([1n, 2n]);
        });
    });

    describe('wasi:cli/environment', () => {
        it('getEnvironment delegates to P3', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const fn = p2['wasi:cli/environment']!['get-environment']!;
            const env = fn() as [string, string][];
            expect(env).toEqual([['FOO', 'bar'], ['BAZ', 'qux']]);
        });

        it('getArguments delegates to P3', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const fn = p2['wasi:cli/environment']!['get-arguments']!;
            const args = fn() as string[];
            expect(args).toEqual(['arg1', 'arg2']);
        });

        it('initialCwd maps P3 getInitialCwd to P2 initial-cwd', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const fn = p2['wasi:cli/environment']!['initial-cwd']!;
            expect(fn()).toBe('/home/test');
        });
    });

    describe('wasi:cli/exit', () => {
        it('exit throws', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const fn = p2['wasi:cli/exit']!['exit']!;
            expect(() => fn({ tag: 'ok' })).toThrow();
        });

        it('exitWithCode throws', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const fn = p2['wasi:cli/exit']!['exit-with-code']!;
            expect(() => fn(42)).toThrow();
        });
    });

    describe('wasi:cli/stdin', () => {
        it('getStdin returns a WasiInputStream', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const fn = p2['wasi:cli/stdin']!['get-stdin']!;
            const stream = fn() as WasiInputStream;
            expect(stream).toBeDefined();
            expect(typeof stream.read).toBe('function');
            expect(typeof stream.blockingRead).toBe('function');
            expect(typeof stream.subscribe).toBe('function');
        });

        it('stdin stream reads data from P3 stdin', async () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const fn = p2['wasi:cli/stdin']!['get-stdin']!;
            const stream = fn() as WasiInputStream;

            // Wait for the async pump to produce data
            await new Promise(resolve => setTimeout(resolve, 50));

            const result = stream.read(1024n);
            expect(result.tag).toBe('ok');
            if (result.tag === 'ok') {
                expect(result.val).toBeInstanceOf(Uint8Array);
                expect(result.val.length).toBe(5); // "Hello"
            }
        });

        it('subscribe returns a pollable', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const fn = p2['wasi:cli/stdin']!['get-stdin']!;
            const stream = fn() as WasiInputStream;
            const pollable = stream.subscribe();
            expect(typeof pollable.ready).toBe('function');
            expect(typeof pollable.block).toBe('function');
        });
    });

    describe('wasi:cli/stdout', () => {
        it('getStdout returns a WasiOutputStream', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const fn = p2['wasi:cli/stdout']!['get-stdout']!;
            const stream = fn() as WasiOutputStream;
            expect(stream).toBeDefined();
            expect(typeof stream.write).toBe('function');
            expect(typeof stream.checkWrite).toBe('function');
        });

        it('stdout writes propagate to P3', async () => {
            const writtenChunks: Uint8Array[] = [];
            const p3 = createMockP3({
                'wasi:cli/stdout': {
                    writeViaStream: async (data: WasiStreamReadable<Uint8Array>) => {
                        for await (const chunk of data) {
                            writtenChunks.push(chunk);
                        }
                    },
                },
            });
            const p2 = createWasiP2ViaP3Adapter(p3);
            const fn = p2['wasi:cli/stdout']!['get-stdout']!;
            const stream = fn() as WasiOutputStream;

            const result = stream.write(new TextEncoder().encode('Hello'));
            expect(result.tag).toBe('ok');

            // Give the async pump time to propagate
            await new Promise(resolve => setTimeout(resolve, 50));
            expect(writtenChunks.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('wasi:cli/terminal-*', () => {
        it('getTerminalStdin returns undefined', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const fn = p2['wasi:cli/terminal-stdin']!['get-terminal-stdin']!;
            expect(fn()).toBeUndefined();
        });

        it('getTerminalStdout returns undefined', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const fn = p2['wasi:cli/terminal-stdout']!['get-terminal-stdout']!;
            expect(fn()).toBeUndefined();
        });

        it('getTerminalStderr returns undefined', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const fn = p2['wasi:cli/terminal-stderr']!['get-terminal-stderr']!;
            expect(fn()).toBeUndefined();
        });
    });

    describe('wasi:clocks/monotonic-clock', () => {
        it('now returns a bigint', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const fn = p2['wasi:clocks/monotonic-clock']!['now']!;
            const val = fn() as bigint;
            expect(typeof val).toBe('bigint');
            expect(val > 0n).toBe(true);
        });

        it('resolution delegates to P3 getResolution', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const fn = p2['wasi:clocks/monotonic-clock']!['resolution']!;
            const val = fn() as bigint;
            expect(typeof val).toBe('bigint');
            expect(val).toBe(1_000n);
        });

        it('subscribeDuration returns a pollable', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const fn = p2['wasi:clocks/monotonic-clock']!['subscribe-duration']!;
            const pollable = fn(0n) as WasiPollable;
            expect(pollable.ready()).toBe(true);
        });

        it('subscribeDuration with positive duration returns async pollable', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const fn = p2['wasi:clocks/monotonic-clock']!['subscribe-duration']!;
            const pollable = fn(1_000_000_000n) as WasiPollable; // 1s
            expect(typeof pollable.ready).toBe('function');
            expect(typeof pollable.block).toBe('function');
        });

        it('subscribeInstant returns a pollable', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const now = p2['wasi:clocks/monotonic-clock']!['now']!() as bigint;
            const fn = p2['wasi:clocks/monotonic-clock']!['subscribe-instant']!;
            const pollable = fn(now - 1n) as WasiPollable; // past
            expect(pollable.ready()).toBe(true);
        });
    });

    describe('wasi:clocks/wall-clock', () => {
        it('now returns a WasiDatetime', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const fn = p2['wasi:clocks/wall-clock']!['now']!;
            const dt = fn() as { seconds: bigint; nanoseconds: number };
            expect(typeof dt.seconds).toBe('bigint');
            expect(typeof dt.nanoseconds).toBe('number');
            expect(dt.seconds > 0n).toBe(true);
        });

        it('now clamps negative P3 seconds to 0', () => {
            const p3 = createMockP3({
                'wasi:clocks/system-clock': {
                    now: () => ({ seconds: -100n, nanoseconds: 500_000_000 }),
                    getResolution: () => 1_000_000n,
                },
            });
            const p2 = createWasiP2ViaP3Adapter(p3);
            const fn = p2['wasi:clocks/wall-clock']!['now']!;
            const dt = fn() as { seconds: bigint; nanoseconds: number };
            expect(dt.seconds).toBe(0n);
            expect(dt.nanoseconds).toBe(500_000_000);
        });

        it('resolution returns a WasiDatetime', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const fn = p2['wasi:clocks/wall-clock']!['resolution']!;
            const dt = fn() as { seconds: bigint; nanoseconds: number };
            expect(typeof dt.seconds).toBe('bigint');
            expect(typeof dt.nanoseconds).toBe('number');
        });
    });

    describe('wasi:clocks/timezone', () => {
        it('display returns a timezone-display record', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const fn = p2['wasi:clocks/timezone']!['display']!;
            const tz = fn({ seconds: 0n, nanoseconds: 0 }) as {
                utcOffset: number;
                name: string;
                inDaylightSavingTime: boolean;
            };
            expect(typeof tz.utcOffset).toBe('number');
            expect(typeof tz.name).toBe('string');
            expect(tz.name).toBe('UTC');
            expect(tz.inDaylightSavingTime).toBe(false);
        });
    });

    describe('wasi:io/poll', () => {
        it('poll with sync-ready pollable returns immediately', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const pollFn = p2['wasi:io/poll']!['poll']!;

            const pollable: WasiPollable = { ready: () => true, block: () => { } };
            const indices = pollFn([pollable]) as Uint32Array;
            expect(indices).toBeInstanceOf(Uint32Array);
            expect(indices.length).toBe(1);
            expect(indices[0]).toBe(0);
        });

        it('[method]pollable.ready dispatches to the pollable', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const readyFn = p2['wasi:io/poll']!['[method]pollable.ready']!;
            const pollable: WasiPollable = { ready: () => true, block: () => { } };
            expect(readyFn(pollable)).toBe(true);
        });
    });

    describe('wasi:io/error', () => {
        it('[method]error.to-debug-string dispatches to the error', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const fn = p2['wasi:io/error']!['[method]error.to-debug-string']!;
            const err = { toDebugString: () => 'test error' };
            expect(fn(err)).toBe('test error');
        });
    });

    describe('wasi:io/streams', () => {
        it('input-stream methods dispatch to the stream', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const stdin = p2['wasi:cli/stdin']!['get-stdin']!() as WasiInputStream;

            const subscribeFn = p2['wasi:io/streams']!['[method]input-stream.subscribe']!;

            const pollable = subscribeFn(stdin) as WasiPollable;
            expect(typeof pollable.ready).toBe('function');
        });

        it('output-stream methods dispatch to the stream', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const stdout = p2['wasi:cli/stdout']!['get-stdout']!() as WasiOutputStream;

            const checkWriteFn = p2['wasi:io/streams']!['[method]output-stream.check-write']!;
            const result = checkWriteFn(stdout) as { tag: string; val: bigint };
            expect(result.tag).toBe('ok');
            expect(result.val > 0n).toBe(true);
        });
    });

    describe('wasi:filesystem/preopens', () => {
        it('getDirectories returns empty list for empty mock', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const fn = p2['wasi:filesystem/preopens']!['get-directories']!;
            const dirs = fn() as unknown[];
            expect(dirs).toEqual([]);
        });
    });

    describe('wasi:sockets/*', () => {
        it('instance-network returns an opaque object', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const fn = p2['wasi:sockets/instance-network']!['instance-network']!;
            const network = fn();
            expect(network).toBeDefined();
        });

        it('create-tcp-socket returns err for browser stubs', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const fn = p2['wasi:sockets/tcp-create-socket']!['create-tcp-socket']!;
            const result = fn('ipv4') as { tag: string; val: string };
            expect(result.tag).toBe('err');
            expect(result.val).toBe('not-supported');
        });

        it('create-udp-socket returns err for browser stubs', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const fn = p2['wasi:sockets/udp-create-socket']!['create-udp-socket']!;
            const result = fn('ipv4') as { tag: string; val: string };
            expect(result.tag).toBe('err');
            expect(result.val).toBe('not-supported');
        });
    });

    describe('wasi:http/types', () => {
        it('[constructor]fields creates a fields object', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const fn = p2['wasi:http/types']!['[constructor]fields']!;
            const fields = fn() as { get: (name: string) => Uint8Array[]; has: (name: string) => boolean };
            expect(fields).toBeDefined();
            expect(fields.has('content-type')).toBe(false);
        });

        it('fields.set and fields.get work', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const createFields = p2['wasi:http/types']!['[constructor]fields']!;
            const fields = createFields() as {
                get: (name: string) => Uint8Array[];
                has: (name: string) => boolean;
                set: (name: string, values: Uint8Array[]) => { tag: string };
                entries: () => [string, Uint8Array][];
            };

            const setFn = p2['wasi:http/types']!['[method]fields.set']!;
            const getFn = p2['wasi:http/types']!['[method]fields.get']!;
            const hasFn = p2['wasi:http/types']!['[method]fields.has']!;

            const value = new TextEncoder().encode('text/plain');
            setFn(fields, 'content-type', [value]);
            expect(hasFn(fields, 'content-type')).toBe(true);
            const values = getFn(fields, 'content-type') as Uint8Array[];
            expect(values.length).toBe(1);
            expect(new TextDecoder().decode(values[0])).toBe('text/plain');
        });

        it('[constructor]outgoing-request creates a request', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const createFields = p2['wasi:http/types']!['[constructor]fields']!;
            const createReq = p2['wasi:http/types']!['[constructor]outgoing-request']!;
            const headers = createFields();
            const req = createReq(headers) as {
                method: () => HttpMethod;
                setMethod: (m: HttpMethod) => boolean;
                pathWithQuery: () => string | undefined;
                setPathWithQuery: (p: string) => boolean;
            };
            type HttpMethod = { tag: string; val?: string };
            expect(req.method().tag).toBe('get');
            req.setMethod({ tag: 'post' });
            expect(req.method().tag).toBe('post');
        });
    });

    describe('wasi:http/outgoing-handler', () => {
        it('handle returns err (stub)', () => {
            const p3 = createMockP3();
            const p2 = createWasiP2ViaP3Adapter(p3);
            const createFields = p2['wasi:http/types']!['[constructor]fields']!;
            const createReq = p2['wasi:http/types']!['[constructor]outgoing-request']!;
            const handleFn = p2['wasi:http/outgoing-handler']!['handle']!;

            const headers = createFields();
            const req = createReq(headers);
            const result = handleFn(req) as { tag: string; val: unknown };
            expect(result.tag).toBe('err');
        });
    });
});
