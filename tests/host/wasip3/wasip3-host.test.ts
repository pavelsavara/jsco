// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { createWasiP3Host as createHost } from '../../../src/host/wasip3/index';
import type { WasiP3Imports } from '../../../wit/wasip3/types/index';

/** All interface keys that WasiP3Imports must contain. */
const ALL_INTERFACE_KEYS: (keyof WasiP3Imports)[] = [
    'wasi:cli/environment',
    'wasi:cli/exit',
    'wasi:cli/stderr',
    'wasi:cli/stdin',
    'wasi:cli/stdout',
    'wasi:cli/terminal-input',
    'wasi:cli/terminal-output',
    'wasi:cli/terminal-stderr',
    'wasi:cli/terminal-stdin',
    'wasi:cli/terminal-stdout',
    'wasi:cli/types',
    'wasi:clocks/monotonic-clock',
    'wasi:clocks/system-clock',
    'wasi:clocks/timezone',
    'wasi:clocks/types',
    'wasi:filesystem/preopens',
    'wasi:filesystem/types',
    'wasi:http/client',
    'wasi:http/handler',
    'wasi:http/types',
    'wasi:random/insecure-seed',
    'wasi:random/insecure',
    'wasi:random/random',
    'wasi:sockets/ip-name-lookup',
    'wasi:sockets/types',
];

describe('createHost', () => {
    describe('structure', () => {
        it('returns an object with all WasiP3Imports interface keys', () => {
            const host = createHost();
            for (const key of ALL_INTERFACE_KEYS) {
                expect(host[key]).toBeDefined();
            }
        });

        it('returns exactly the expected keys (no extras beyond versioned aliases)', () => {
            const host = createHost();
            const keys = Object.keys(host).sort();
            // Unversioned keys must all be present
            for (const key of ALL_INTERFACE_KEYS) {
                expect(keys).toContain(key);
            }
            // Every key is either an unversioned interface key or a versioned alias of one
            for (const key of keys) {
                const base = key.replace(/@0\.3\.0-rc-2026-03-15$/, '');
                expect(ALL_INTERFACE_KEYS).toContain(base as any);
            }
        });

        it('versioned aliases point to the same object as unversioned', () => {
            const host = createHost() as unknown as Record<string, unknown>;
            for (const key of ALL_INTERFACE_KEYS) {
                expect(host[key + '@0.3.0-rc-2026-03-15']).toBe(host[key]);
            }
        });

        it('each interface value is an object', () => {
            const host = createHost();
            for (const key of ALL_INTERFACE_KEYS) {
                expect(typeof host[key]).toBe('object');
                expect(host[key]).not.toBeNull();
            }
        });
    });

    describe('implemented interfaces work', () => {
        it('wasi:cli/environment.getEnvironment returns array', () => {
            const host = createHost();
            expect(host['wasi:cli/environment'].getEnvironment()).toEqual([]);
        });

        it('wasi:random/random.getRandomBytes returns bytes', () => {
            const host = createHost();
            const bytes = host['wasi:random/random'].getRandomBytes(16n);
            expect(bytes).toBeInstanceOf(Uint8Array);
            expect(bytes.length).toBe(16);
        });

        it('wasi:clocks/monotonic-clock.now returns bigint', () => {
            const host = createHost();
            expect(typeof host['wasi:clocks/monotonic-clock'].now()).toBe('bigint');
        });

        it('wasi:cli/stdin.readViaStream returns stream+future pair', () => {
            const host = createHost();
            const [stream, future] = host['wasi:cli/stdin'].readViaStream();
            expect(stream[Symbol.asyncIterator]).toBeDefined();
            expect(future).toBeInstanceOf(Promise);
        });

        it('wasi:cli/stdout.writeViaStream returns a promise', () => {
            const host = createHost();
            const pair = { async *[Symbol.asyncIterator]() { /* empty */ } };
            const future = host['wasi:cli/stdout'].writeViaStream(pair);
            expect(future).toBeInstanceOf(Promise);
        });

        it('wasi:cli/terminal-stdin.getTerminalStdin returns undefined', () => {
            const host = createHost();
            expect(host['wasi:cli/terminal-stdin'].getTerminalStdin()).toBeUndefined();
        });

        it('wasi:filesystem/preopens.getDirectories returns preopens', () => {
            const host = createHost();
            const dirs = host['wasi:filesystem/preopens'].getDirectories();
            expect(dirs.length).toBe(1);
            expect(dirs[0][1]).toBe('/');
        });

        it('wasi:filesystem/types.Descriptor is defined', () => {
            const host = createHost();
            expect(host['wasi:filesystem/types'].Descriptor).toBeDefined();
        });

        it('wasi:http/types.Fields is defined', () => {
            const host = createHost();
            expect(host['wasi:http/types'].Fields).toBeDefined();
        });

        it('wasi:http/types.Request is defined', () => {
            const host = createHost();
            expect(host['wasi:http/types'].Request).toBeDefined();
        });

        it('wasi:http/types.Response is defined', () => {
            const host = createHost();
            expect(host['wasi:http/types'].Response).toBeDefined();
        });

        it('wasi:http/types.RequestOptions is defined', () => {
            const host = createHost();
            expect(host['wasi:http/types'].RequestOptions).toBeDefined();
        });

        it('wasi:http/client.send is a function', () => {
            const host = createHost();
            expect(typeof host['wasi:http/client'].send).toBe('function');
        });

        it('wasi:http/handler.handle is a function', () => {
            const host = createHost();
            expect(typeof host['wasi:http/handler'].handle).toBe('function');
        });

        it('wasi:sockets/types.TcpSocket is a class', () => {
            const host = createHost();
            const types = host['wasi:sockets/types'] as unknown as { TcpSocket: Function; UdpSocket: Function };
            expect(typeof types.TcpSocket).toBe('function');
        });

        it('wasi:sockets/types.UdpSocket is a class', () => {
            const host = createHost();
            const types = host['wasi:sockets/types'] as unknown as { TcpSocket: Function; UdpSocket: Function };
            expect(typeof types.UdpSocket).toBe('function');
        });

        it('wasi:sockets/types.TcpSocket.create throws not-supported in browser stubs', () => {
            const host = createHost();
            const types = host['wasi:sockets/types'] as unknown as { TcpSocket: { create(af: string): never } };
            try {
                types.TcpSocket.create('ipv4');
                fail('should throw');
            } catch (e) {
                expect((e as { tag: string }).tag).toBe('not-supported');
            }
        });

        it('wasi:sockets/ip-name-lookup.resolveAddresses throws not-supported in browser stubs', async () => {
            const host = createHost();
            const lookup = host['wasi:sockets/ip-name-lookup'] as unknown as {
                resolveAddresses(name: string): Promise<never>;
            };
            try {
                await lookup.resolveAddresses('example.com');
                fail('should throw');
            } catch (e) {
                expect((e as { tag: string }).tag).toBe('not-supported');
            }
        });
    });

    describe('independent instances', () => {
        it('two createHost calls return independent objects', () => {
            const host1 = createHost();
            const host2 = createHost();
            expect(host1).not.toBe(host2);
            expect(host1['wasi:cli/environment']).not.toBe(host2['wasi:cli/environment']);
        });
    });
});
