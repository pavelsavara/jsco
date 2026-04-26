// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * Tests for wasi:cli/* through the P2-via-P3 adapter.
 * Mirrors wasip2/cli.test.ts.
 */

import { createWasiP2ViaP3Adapter } from '../../../src/host/wasip2-via-wasip3/index';
import { createMockP3 } from './test-helpers';
import { createStreamPair } from '../../../src/host/wasip3/streams';
import type { WasiStreamReadable } from '../../../src/host/wasip3/streams';
import type { WasiInputStream, WasiOutputStream } from '../../../src/host/wasip2-via-wasip3/io';

describe('wasi:cli/environment (via P3 adapter)', () => {
    it('getEnvironment returns configured pairs from mock', () => {
        const host = createWasiP2ViaP3Adapter(createMockP3());
        expect(host['wasi:cli/environment']!['get-environment']!()).toEqual([['FOO', 'bar'], ['BAZ', 'qux']]);
    });

    it('getEnvironment returns empty list when mock returns empty', () => {
        const host = createWasiP2ViaP3Adapter(createMockP3({
            'wasi:cli/environment': {
                getEnvironment: () => [],
                getArguments: () => [],
                getInitialCwd: () => undefined,
            },
        }));
        expect(host['wasi:cli/environment']!['get-environment']!()).toEqual([]);
    });

    it('environment with = in value is preserved', () => {
        const host = createWasiP2ViaP3Adapter(createMockP3({
            'wasi:cli/environment': {
                getEnvironment: () => [['KEY', 'a=b=c']],
                getArguments: () => [],
                getInitialCwd: () => undefined,
            },
        }));
        expect(host['wasi:cli/environment']!['get-environment']!()).toEqual([['KEY', 'a=b=c']]);
    });

    it('environment with unicode keys and values', () => {
        const host = createWasiP2ViaP3Adapter(createMockP3({
            'wasi:cli/environment': {
                getEnvironment: () => [['日本語', 'テスト']],
                getArguments: () => [],
                getInitialCwd: () => undefined,
            },
        }));
        expect(host['wasi:cli/environment']!['get-environment']!()).toEqual([['日本語', 'テスト']]);
    });

    it('getArguments returns configured arguments from mock', () => {
        const host = createWasiP2ViaP3Adapter(createMockP3());
        expect(host['wasi:cli/environment']!['get-arguments']!()).toEqual(['arg1', 'arg2']);
    });

    it('getArguments returns empty list when mock returns empty', () => {
        const host = createWasiP2ViaP3Adapter(createMockP3({
            'wasi:cli/environment': {
                getEnvironment: () => [],
                getArguments: () => [],
                getInitialCwd: () => undefined,
            },
        }));
        expect(host['wasi:cli/environment']!['get-arguments']!()).toEqual([]);
    });

    it('arguments with spaces and special characters', () => {
        const host = createWasiP2ViaP3Adapter(createMockP3({
            'wasi:cli/environment': {
                getEnvironment: () => [],
                getArguments: () => ['hello world', '--path=/tmp/a b', '"'],
                getInitialCwd: () => undefined,
            },
        }));
        expect(host['wasi:cli/environment']!['get-arguments']!()).toEqual(['hello world', '--path=/tmp/a b', '"']);
    });

    it('initialCwd returns configured cwd from mock', () => {
        const host = createWasiP2ViaP3Adapter(createMockP3());
        expect(host['wasi:cli/environment']!['initial-cwd']!()).toBe('/home/test');
    });

    it('initialCwd returns undefined when mock returns undefined', () => {
        const host = createWasiP2ViaP3Adapter(createMockP3({
            'wasi:cli/environment': {
                getEnvironment: () => [],
                getArguments: () => [],
                getInitialCwd: () => undefined,
            },
        }));
        expect(host['wasi:cli/environment']!['initial-cwd']!()).toBeUndefined();
    });
});

describe('wasi:cli/exit (via P3 adapter)', () => {
    it('exit with ok throws', () => {
        const host = createWasiP2ViaP3Adapter(createMockP3());
        expect(() => host['wasi:cli/exit']!['exit']!({ tag: 'ok' })).toThrow();
    });

    it('exit with err throws', () => {
        const host = createWasiP2ViaP3Adapter(createMockP3());
        expect(() => host['wasi:cli/exit']!['exit']!({ tag: 'err' })).toThrow();
    });

    it('exitWithCode throws', () => {
        const host = createWasiP2ViaP3Adapter(createMockP3());
        expect(() => host['wasi:cli/exit']!['exit-with-code']!(42)).toThrow();
    });
});

describe('wasi:cli/stdin (via P3 adapter)', () => {
    it('getStdin returns an input stream', () => {
        const host = createWasiP2ViaP3Adapter(createMockP3());
        const stream = host['wasi:cli/stdin']!['get-stdin']!() as WasiInputStream;
        expect(stream).toBeDefined();
        expect(typeof stream.read).toBe('function');
    });

    it('stdin stream reads data from P3 stdin', async () => {
        const host = createWasiP2ViaP3Adapter(createMockP3());
        const stream = host['wasi:cli/stdin']!['get-stdin']!() as WasiInputStream;

        // Wait for the async pump to produce data
        await new Promise(resolve => setTimeout(resolve, 50));

        const result = stream.read(1024n);
        expect(result.tag).toBe('ok');
        if (result.tag === 'ok') {
            expect(result.val).toBeInstanceOf(Uint8Array);
            expect(result.val.length).toBe(5); // "Hello"
        }
    });

    it('stdin with binary data returns raw bytes', async () => {
        const binary = new Uint8Array([0xFF, 0x00, 0x80, 0xFE]);
        const host = createWasiP2ViaP3Adapter(createMockP3({
            'wasi:cli/stdin': {
                readViaStream: () => {
                    const pair = createStreamPair<Uint8Array>();
                    pair.write(binary);
                    pair.close();
                    return [pair.readable, Promise.resolve()];
                },
            },
        }));
        const stream = host['wasi:cli/stdin']!['get-stdin']!() as WasiInputStream;
        await new Promise(resolve => setTimeout(resolve, 50));
        const result = stream.read(4n);
        expect(result.tag).toBe('ok');
        if (result.tag === 'ok') {
            expect(result.val).toEqual(binary);
        }
    });

    it('subscribe returns a pollable', () => {
        const host = createWasiP2ViaP3Adapter(createMockP3());
        const stream = host['wasi:cli/stdin']!['get-stdin']!() as WasiInputStream;
        const pollable = stream.subscribe();
        expect(typeof pollable.ready).toBe('function');
        expect(typeof pollable.block).toBe('function');
    });
});

describe('wasi:cli/stdout (via P3 adapter)', () => {
    it('getStdout returns an output stream', () => {
        const host = createWasiP2ViaP3Adapter(createMockP3());
        const stream = host['wasi:cli/stdout']!['get-stdout']!() as WasiOutputStream;
        expect(stream).toBeDefined();
        expect(typeof stream.write).toBe('function');
        expect(typeof stream.checkWrite).toBe('function');
    });

    it('stdout writes propagate to P3', async () => {
        const writtenChunks: Uint8Array[] = [];
        const host = createWasiP2ViaP3Adapter(createMockP3({
            'wasi:cli/stdout': {
                writeViaStream: async (data: WasiStreamReadable<Uint8Array>) => {
                    for await (const chunk of data) {
                        writtenChunks.push(chunk);
                    }
                },
            },
        }));
        const stream = host['wasi:cli/stdout']!['get-stdout']!() as WasiOutputStream;
        const result = stream.write(new TextEncoder().encode('Hello'));
        expect(result.tag).toBe('ok');
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(writtenChunks.length).toBeGreaterThanOrEqual(1);
    });

    it('writing empty data succeeds', () => {
        const host = createWasiP2ViaP3Adapter(createMockP3());
        const stream = host['wasi:cli/stdout']!['get-stdout']!() as WasiOutputStream;
        const result = stream.write(new Uint8Array(0));
        expect(result.tag).toBe('ok');
    });
});

describe('wasi:cli/stderr (via P3 adapter)', () => {
    it('getStderr returns an output stream', () => {
        const host = createWasiP2ViaP3Adapter(createMockP3());
        const stream = host['wasi:cli/stderr']!['get-stderr']!() as WasiOutputStream;
        expect(stream).toBeDefined();
        expect(typeof stream.write).toBe('function');
    });
});

describe('wasi:cli/terminal-* (via P3 adapter)', () => {
    it('getTerminalStdin returns undefined', () => {
        const host = createWasiP2ViaP3Adapter(createMockP3());
        expect(host['wasi:cli/terminal-stdin']!['get-terminal-stdin']!()).toBeUndefined();
    });

    it('getTerminalStdout returns undefined', () => {
        const host = createWasiP2ViaP3Adapter(createMockP3());
        expect(host['wasi:cli/terminal-stdout']!['get-terminal-stdout']!()).toBeUndefined();
    });

    it('getTerminalStderr returns undefined', () => {
        const host = createWasiP2ViaP3Adapter(createMockP3());
        expect(host['wasi:cli/terminal-stderr']!['get-terminal-stderr']!()).toBeUndefined();
    });
});
