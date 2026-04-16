// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { createHost } from './index';
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

        it('returns exactly the expected keys (no extras)', () => {
            const host = createHost();
            const keys = Object.keys(host).sort();
            const expected = [...ALL_INTERFACE_KEYS].sort();
            expect(keys).toEqual(expected);
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
    });

    describe('stub interfaces still throw not-implemented', () => {
        it('wasi:filesystem/preopens.getDirectories throws', () => {
            const host = createHost();
            expect(() => host['wasi:filesystem/preopens'].getDirectories()).toThrow(/not implemented/);
        });

        it('wasi:http/client.send throws', () => {
            const host = createHost();
            expect(() => (host['wasi:http/client'] as Record<string, Function>)['send']({})).toThrow(/not implemented/);
        });

        it('wasi:sockets/types accessed property is a function that throws when called', () => {
            const host = createHost();
            const iface = host['wasi:sockets/types'] as Record<string, Function>;
            // Proxy returns a function for any property access; calling it throws
            expect(typeof iface['TcpSocket']).toBe('function');
            expect(() => iface['TcpSocket']()).toThrow(/not implemented/);
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
