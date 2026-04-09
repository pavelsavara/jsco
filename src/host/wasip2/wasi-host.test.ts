/**
 * E1: createWasiHost + instantiateWasiComponent tests
 *
 * Tests the WASI host factory (createWasiHost) and the dedicated
 * WASI component instantiator (instantiateWasiComponent).
 */

import { createWasiHost } from './index';

// WasiConfig is a type-only export, inline for ESM compatibility

describe('createWasiHost', () => {
    describe('structure', () => {
        it('returns an object with WASI interface keys', () => {
            const host = createWasiHost();
            expect(host['wasi:cli/stdout']).toBeDefined();
            expect(host['wasi:cli/stderr']).toBeDefined();
            expect(host['wasi:cli/stdin']).toBeDefined();
            expect(host['wasi:cli/environment']).toBeDefined();
            expect(host['wasi:cli/exit']).toBeDefined();
            expect(host['wasi:random/random']).toBeDefined();
            expect(host['wasi:random/insecure']).toBeDefined();
            expect(host['wasi:random/insecure-seed']).toBeDefined();
            expect(host['wasi:clocks/wall-clock']).toBeDefined();
            expect(host['wasi:clocks/monotonic-clock']).toBeDefined();
            expect(host['wasi:io/poll']).toBeDefined();
            expect(host['wasi:filesystem/preopens']).toBeDefined();
            expect(host['wasi:http/outgoing-handler']).toBeDefined();
            expect(host['wasi:sockets/instance-network']).toBeDefined();
            expect(host['wasi:sockets/tcp-create-socket']).toBeDefined();
            expect(host['wasi:sockets/udp-create-socket']).toBeDefined();
            expect(host['wasi:sockets/ip-name-lookup']).toBeDefined();
        });

        it('registers versioned aliases', () => {
            const host = createWasiHost();
            // Check a few versioned aliases
            expect(host['wasi:cli/stdout@0.2.0']).toBeDefined();
            expect(host['wasi:cli/stdout@0.2.6']).toBeDefined();
            expect(host['wasi:cli/stdout@0.2.8']).toBeDefined();
            // Versioned and unversioned should reference the same object
            expect(host['wasi:cli/stdout@0.2.0']).toBe(host['wasi:cli/stdout']);
        });

        it('all interface values are objects with function members', () => {
            const host = createWasiHost();
            for (const [key, iface] of Object.entries(host)) {
                expect(typeof iface).toBe('object');
                for (const [methodName, method] of Object.entries(iface)) {
                    expect(typeof method).toBe('function');
                }
            }
        });
    });

    describe('kebab-case method names', () => {
        it('wasi:cli/stdout has get-stdout', () => {
            const host = createWasiHost();
            expect(typeof host['wasi:cli/stdout']['get-stdout']).toBe('function');
        });

        it('wasi:cli/stdin has get-stdin', () => {
            const host = createWasiHost();
            expect(typeof host['wasi:cli/stdin']['get-stdin']).toBe('function');
        });

        it('wasi:cli/stderr has get-stderr', () => {
            const host = createWasiHost();
            expect(typeof host['wasi:cli/stderr']['get-stderr']).toBe('function');
        });

        it('wasi:cli/environment has get-environment and get-arguments', () => {
            const host = createWasiHost();
            const env = host['wasi:cli/environment'];
            expect(typeof env['get-environment']).toBe('function');
            expect(typeof env['get-arguments']).toBe('function');
            expect(typeof env['initial-cwd']).toBe('function');
        });

        it('wasi:cli/exit has exit', () => {
            const host = createWasiHost();
            expect(typeof host['wasi:cli/exit']['exit']).toBe('function');
        });

        it('wasi:random/random has get-random-bytes and get-random-u64', () => {
            const host = createWasiHost();
            const random = host['wasi:random/random'];
            expect(typeof random['get-random-bytes']).toBe('function');
            expect(typeof random['get-random-u64']).toBe('function');
        });

        it('wasi:clocks/wall-clock has now and resolution', () => {
            const host = createWasiHost();
            const clock = host['wasi:clocks/wall-clock'];
            expect(typeof clock['now']).toBe('function');
            expect(typeof clock['resolution']).toBe('function');
        });

        it('wasi:clocks/monotonic-clock has all methods', () => {
            const host = createWasiHost();
            const clock = host['wasi:clocks/monotonic-clock'];
            expect(typeof clock['now']).toBe('function');
            expect(typeof clock['resolution']).toBe('function');
            expect(typeof clock['subscribe-duration']).toBe('function');
            expect(typeof clock['subscribe-instant']).toBe('function');
        });

        it('wasi:io/poll has poll', () => {
            const host = createWasiHost();
            expect(typeof host['wasi:io/poll']['poll']).toBe('function');
        });
    });

    describe('configuration', () => {
        it('default config produces working host', () => {
            const host = createWasiHost();
            // Environment defaults to empty
            const env = host['wasi:cli/environment']['get-environment']();
            expect(env).toEqual([]);
            const args = host['wasi:cli/environment']['get-arguments']();
            expect(args).toEqual([]);
        });

        it('custom env vars are available', () => {
            const config: WasiConfig = {
                env: [['FOO', 'bar'], ['PATH', '/usr/bin']],
            };
            const host = createWasiHost(config);
            const env = host['wasi:cli/environment']['get-environment']();
            expect(env).toEqual([['FOO', 'bar'], ['PATH', '/usr/bin']]);
        });

        it('custom args are available', () => {
            const config: WasiConfig = {
                args: ['--verbose', 'input.txt'],
            };
            const host = createWasiHost(config);
            const args = host['wasi:cli/environment']['get-arguments']();
            expect(args).toEqual(['--verbose', 'input.txt']);
        });

        it('stdout captures output', () => {
            const chunks: Uint8Array[] = [];
            const config: WasiConfig = {
                stdout: (bytes) => chunks.push(bytes),
            };
            const host = createWasiHost(config);
            const stdout = host['wasi:cli/stdout']['get-stdout']();
            // Write through the output stream
            stdout.blockingWriteAndFlush(new TextEncoder().encode('hello'));
            expect(chunks.length).toBe(1);
            expect(new TextDecoder().decode(chunks[0])).toBe('hello');
        });

        it('custom cwd is available', () => {
            const config: WasiConfig = {
                cwd: '/home/user',
            };
            const host = createWasiHost(config);
            const cwd = host['wasi:cli/environment']['initial-cwd']();
            expect(cwd).toBe('/home/user');
        });

        it('custom filesystem preopens are available', () => {
            const config: WasiConfig = {
                fs: new Map([
                    ['/data/test.txt', new TextEncoder().encode('hello')],
                ]),
            };
            const host = createWasiHost(config);
            const dirs = host['wasi:filesystem/preopens']['get-directories']();
            expect(dirs.length).toBeGreaterThan(0);
        });
    });

    describe('functional behavior', () => {
        it('random bytes returns correct length', () => {
            const host = createWasiHost();
            const bytes = host['wasi:random/random']['get-random-bytes'](10n);
            expect(bytes).toBeInstanceOf(Uint8Array);
            expect(bytes.length).toBe(10);
        });

        it('random u64 returns bigint', () => {
            const host = createWasiHost();
            const val = host['wasi:random/random']['get-random-u64']();
            expect(typeof val).toBe('bigint');
        });

        it('wall-clock now returns datetime', () => {
            const host = createWasiHost();
            const now = host['wasi:clocks/wall-clock']['now']();
            expect(typeof now.seconds).toBe('bigint');
            expect(typeof now.nanoseconds).toBe('number');
            expect(now.seconds).toBeGreaterThan(0n);
        });

        it('monotonic-clock now returns bigint nanoseconds', () => {
            const host = createWasiHost();
            const now = host['wasi:clocks/monotonic-clock']['now']();
            expect(typeof now).toBe('bigint');
            expect(now).toBeGreaterThan(0n);
        });

        it('exit throws WasiExit with status 0 for ok', () => {
            const host = createWasiHost();
            expect(() => host['wasi:cli/exit']['exit']({ tag: 'ok' })).toThrow('WASI exit with status 0');
        });

        it('exit throws WasiExit with status 1 for err', () => {
            const host = createWasiHost();
            expect(() => host['wasi:cli/exit']['exit']({ tag: 'err' })).toThrow('WASI exit with status 1');
        });

        it('socket stubs return not-supported', () => {
            const host = createWasiHost();
            const result = host['wasi:sockets/tcp-create-socket']['create-tcp-socket']('ipv4');
            expect(result).toEqual({ tag: 'err', val: 'not-supported' });
        });

        it('insecure random returns bytes', () => {
            const host = createWasiHost();
            const bytes = host['wasi:random/insecure']['get-insecure-random-bytes'](5n);
            expect(bytes).toBeInstanceOf(Uint8Array);
            expect(bytes.length).toBe(5);
        });

        it('insecure-seed returns tuple of bigints', () => {
            const host = createWasiHost();
            const seed = host['wasi:random/insecure-seed']['insecure-seed']();
            expect(Array.isArray(seed)).toBe(true);
            expect(seed.length).toBe(2);
            expect(typeof seed[0]).toBe('bigint');
            expect(typeof seed[1]).toBe('bigint');
        });
    });
});
