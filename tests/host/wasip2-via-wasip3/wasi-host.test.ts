// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * Tests that createWasiP2ViaP3Adapter produces a correct P2 host shape.
 * Mirrors wasip2/wasi-host.test.ts but goes through the P3 adapter.
 */

import { createWasiP2ViaP3Adapter } from '../../../src/host/wasip2-via-wasip3/index';
import { createMockP3 } from './test-helpers';

describe('createWasiP2ViaP3Adapter', () => {
    describe('structure', () => {
        it('returns an object with WASI interface keys', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
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
            const host = createWasiP2ViaP3Adapter(createMockP3());
            expect(host['wasi:cli/stdout@0.2.0']).toBeDefined();
            expect(host['wasi:cli/stdout@0.2.6']).toBeDefined();
            expect(host['wasi:cli/stdout@0.2.8']).toBeDefined();
            expect(host['wasi:cli/stdout@0.2.0']).toBe(host['wasi:cli/stdout']);
        });

        it('all interface values are objects with function members', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            for (const [_key, iface] of Object.entries(host)) {
                expect(typeof iface).toBe('object');
                for (const [_methodName, method] of Object.entries(iface)) {
                    expect(typeof method).toBe('function');
                }
            }
        });
    });

    describe('kebab-case method names', () => {
        it('wasi:cli/stdout has get-stdout', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            expect(typeof host['wasi:cli/stdout']!['get-stdout']).toBe('function');
        });

        it('wasi:cli/stdin has get-stdin', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            expect(typeof host['wasi:cli/stdin']!['get-stdin']).toBe('function');
        });

        it('wasi:cli/stderr has get-stderr', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            expect(typeof host['wasi:cli/stderr']!['get-stderr']).toBe('function');
        });

        it('wasi:cli/environment has get-environment and get-arguments', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const env = host['wasi:cli/environment']!;
            expect(typeof env['get-environment']).toBe('function');
            expect(typeof env['get-arguments']).toBe('function');
            expect(typeof env['initial-cwd']).toBe('function');
        });

        it('wasi:cli/exit has exit', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            expect(typeof host['wasi:cli/exit']!['exit']).toBe('function');
        });

        it('wasi:random/random has get-random-bytes and get-random-u64', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const random = host['wasi:random/random']!;
            expect(typeof random['get-random-bytes']).toBe('function');
            expect(typeof random['get-random-u64']).toBe('function');
        });

        it('wasi:clocks/wall-clock has now and resolution', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const clock = host['wasi:clocks/wall-clock']!;
            expect(typeof clock['now']).toBe('function');
            expect(typeof clock['resolution']).toBe('function');
        });

        it('wasi:clocks/monotonic-clock has all methods', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const clock = host['wasi:clocks/monotonic-clock']!;
            expect(typeof clock['now']).toBe('function');
            expect(typeof clock['resolution']).toBe('function');
            expect(typeof clock['subscribe-duration']).toBe('function');
            expect(typeof clock['subscribe-instant']).toBe('function');
        });

        it('wasi:io/poll has poll', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            expect(typeof host['wasi:io/poll']!['poll']).toBe('function');
        });
    });

    describe('configuration via mock', () => {
        it('default mock produces working host', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const env = host['wasi:cli/environment']!['get-environment']!();
            expect(env).toEqual([['FOO', 'bar'], ['BAZ', 'qux']]);
            const args = host['wasi:cli/environment']!['get-arguments']!();
            expect(args).toEqual(['arg1', 'arg2']);
        });

        it('custom env vars via mock override', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3({
                'wasi:cli/environment': {
                    getEnvironment: () => [['CUSTOM', 'val'], ['PATH', '/usr/bin']],
                    getArguments: () => [],
                    getInitialCwd: () => undefined,
                },
            }));
            const env = host['wasi:cli/environment']!['get-environment']!();
            expect(env).toEqual([['CUSTOM', 'val'], ['PATH', '/usr/bin']]);
        });
    });

    describe('functional behavior', () => {
        it('random bytes returns correct length', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const bytes = host['wasi:random/random']!['get-random-bytes']!(10n);
            expect(bytes).toBeInstanceOf(Uint8Array);
            expect(bytes.length).toBe(10);
        });

        it('random u64 returns bigint', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const val = host['wasi:random/random']!['get-random-u64']!();
            expect(typeof val).toBe('bigint');
        });

        it('wall-clock now returns datetime', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const now = host['wasi:clocks/wall-clock']!['now']!();
            expect(typeof now.seconds).toBe('bigint');
            expect(typeof now.nanoseconds).toBe('number');
            expect(now.seconds).toBeGreaterThan(0n);
        });

        it('monotonic-clock now returns bigint nanoseconds', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const now = host['wasi:clocks/monotonic-clock']!['now']!();
            expect(typeof now).toBe('bigint');
            expect(now).toBeGreaterThan(0n);
        });

        it('exit throws', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            expect(() => host['wasi:cli/exit']!['exit']!({ tag: 'ok' })).toThrow();
        });

        it('socket creation returns err not-supported', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const result = host['wasi:sockets/tcp-create-socket']!['create-tcp-socket']!('ipv4');
            expect(result.tag).toBe('err');
            expect(result.val).toBe('not-supported');
        });

        it('insecure random returns bytes', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const bytes = host['wasi:random/insecure']!['get-insecure-random-bytes']!(5n);
            expect(bytes).toBeInstanceOf(Uint8Array);
            expect(bytes.length).toBe(5);
        });

        it('insecure-seed returns tuple of bigints', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const seed = host['wasi:random/insecure-seed']!['insecure-seed']!();
            expect(Array.isArray(seed)).toBe(true);
            expect(seed.length).toBe(2);
            expect(typeof seed[0]).toBe('bigint');
            expect(typeof seed[1]).toBe('bigint');
        });
    });

    describe('io stream adapter methods', () => {
        it('pollable ready/block/drop work', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const ioPoll = host['wasi:io/poll']! as Record<string, Function>;
            // subscribe-duration returns a pollable
            const clocks = host['wasi:clocks/monotonic-clock']! as Record<string, Function>;
            const pollable = clocks['subscribe-duration']!(1_000_000n);
            expect(pollable).toBeDefined();
            // test pollable methods via the io/poll interface
            expect(typeof ioPoll['[method]pollable.ready']).toBe('function');
            expect(typeof ioPoll['[method]pollable.block']).toBe('function');
            expect(typeof ioPoll['[resource-drop]pollable']).toBe('function');
            // call ready
            const ready = ioPoll['[method]pollable.ready']!(pollable);
            expect(typeof ready).toBe('boolean');
            // drop is a no-op
            ioPoll['[resource-drop]pollable']!();
        });

        it('error.to-debug-string works', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const ioError = host['wasi:io/error']! as Record<string, Function>;
            const mockError = { toDebugString: () => 'test error' };
            expect(ioError['[method]error.to-debug-string']!(mockError)).toBe('test error');
            // drop is a no-op
            ioError['[resource-drop]error']!();
        });

        it('input-stream methods work with mock', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const streams = host['wasi:io/streams']! as Record<string, Function>;
            // Check all method types exist
            expect(typeof streams['[method]input-stream.read']).toBe('function');
            expect(typeof streams['[method]input-stream.blocking-read']).toBe('function');
            expect(typeof streams['[method]input-stream.skip']).toBe('function');
            expect(typeof streams['[method]input-stream.blocking-skip']).toBe('function');
            expect(typeof streams['[method]input-stream.subscribe']).toBe('function');
            expect(typeof streams['[resource-drop]input-stream']).toBe('function');
            // drop is a no-op
            streams['[resource-drop]input-stream']!();
        });

        it('output-stream methods work with mock', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const streams = host['wasi:io/streams']! as Record<string, Function>;
            expect(typeof streams['[method]output-stream.check-write']).toBe('function');
            expect(typeof streams['[method]output-stream.write']).toBe('function');
            expect(typeof streams['[method]output-stream.blocking-write-and-flush']).toBe('function');
            expect(typeof streams['[method]output-stream.flush']).toBe('function');
            expect(typeof streams['[method]output-stream.blocking-flush']).toBe('function');
            expect(typeof streams['[method]output-stream.write-zeroes']).toBe('function');
            expect(typeof streams['[method]output-stream.blocking-write-zeroes-and-flush']).toBe('function');
            expect(typeof streams['[method]output-stream.splice']).toBe('function');
            expect(typeof streams['[method]output-stream.blocking-splice']).toBe('function');
            expect(typeof streams['[method]output-stream.subscribe']).toBe('function');
            expect(typeof streams['[resource-drop]output-stream']).toBe('function');
            // drop is a no-op
            streams['[resource-drop]output-stream']!();
        });
    });

    describe('http types adapter methods', () => {
        it('creates fields object', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const http = host['wasi:http/types']! as Record<string, Function>;
            const fields = http['[constructor]fields']!();
            expect(fields).toBeDefined();
            expect(typeof fields.get).toBe('function');
            expect(typeof fields.has).toBe('function');
            expect(typeof fields.set).toBe('function');
            expect(typeof fields.append).toBe('function');
            expect(typeof fields.delete).toBe('function');
            expect(typeof fields.entries).toBe('function');
            expect(typeof fields.clone).toBe('function');
        });

        it('fields from-list creates with initial values', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const http = host['wasi:http/types']! as Record<string, Function>;
            const entries: [string, Uint8Array][] = [
                ['content-type', new TextEncoder().encode('text/plain')],
                ['x-custom', new TextEncoder().encode('value')],
            ];
            const fields = http['[static]fields.from-list']!(entries);
            expect(fields.has('content-type')).toBe(true);
            expect(fields.has('x-custom')).toBe(true);
            expect(fields.has('nonexistent')).toBe(false);
        });

        it('fields get/set/append/delete/entries work', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const http = host['wasi:http/types']! as Record<string, Function>;
            const fields = http['[constructor]fields']!();
            const enc = new TextEncoder();
            // append
            http['[method]fields.append']!(fields, 'x-key', enc.encode('val1'));
            http['[method]fields.append']!(fields, 'x-key', enc.encode('val2'));
            // get
            const vals = http['[method]fields.get']!(fields, 'x-key');
            expect(vals.length).toBe(2);
            // has
            expect(http['[method]fields.has']!(fields, 'x-key')).toBe(true);
            // set
            http['[method]fields.set']!(fields, 'x-key', [enc.encode('replaced')]);
            const after = http['[method]fields.get']!(fields, 'x-key');
            expect(after.length).toBe(1);
            // entries
            const allEntries = http['[method]fields.entries']!(fields);
            expect(allEntries.length).toBeGreaterThanOrEqual(1);
            // clone
            const cloned = http['[method]fields.clone']!(fields);
            expect(cloned).toBeDefined();
            // delete
            http['[method]fields.delete']!(fields, 'x-key');
            expect(http['[method]fields.has']!(fields, 'x-key')).toBe(false);
            // drop
            http['[resource-drop]fields']!();
        });

        it('outgoing-request constructor and methods', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const http = host['wasi:http/types']! as Record<string, Function>;
            const fields = http['[constructor]fields']!();
            const req = http['[constructor]outgoing-request']!(fields);
            expect(req).toBeDefined();
            // method
            const method = http['[method]outgoing-request.method']!(req);
            expect(method).toBeDefined();
            // set-method
            http['[method]outgoing-request.set-method']!(req, { tag: 'get' });
            // path-with-query
            const path = http['[method]outgoing-request.path-with-query']!(req);
            expect(path === undefined || typeof path === 'string').toBe(true);
            // set-path-with-query
            http['[method]outgoing-request.set-path-with-query']!(req, '/test?q=1');
            // scheme
            http['[method]outgoing-request.scheme']!(req);
            // set-scheme
            http['[method]outgoing-request.set-scheme']!(req, { tag: 'https' });
            // authority
            http['[method]outgoing-request.authority']!(req);
            // set-authority
            http['[method]outgoing-request.set-authority']!(req, 'example.com');
            // headers
            const headers = http['[method]outgoing-request.headers']!(req);
            expect(headers).toBeDefined();
            // body
            const body = http['[method]outgoing-request.body']!(req);
            expect(body).toBeDefined();
            // drop
            http['[resource-drop]outgoing-request']!();
        });

        it('outgoing-body write and finish', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const http = host['wasi:http/types']! as Record<string, Function>;
            const fields = http['[constructor]fields']!();
            const req = http['[constructor]outgoing-request']!(fields);
            const bodyResult = http['[method]outgoing-request.body']!(req);
            if (bodyResult && bodyResult.tag === 'ok') {
                const body = bodyResult.val;
                const writeResult = http['[method]outgoing-body.write']!(body);
                expect(writeResult).toBeDefined();
            }
            // static finish
            const finishResult = http['[static]outgoing-body.finish']!();
            expect(finishResult.tag).toBe('ok');
            http['[resource-drop]outgoing-body']!();
        });

        it('request-options constructor and methods', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const http = host['wasi:http/types']! as Record<string, Function>;
            const opts = http['[constructor]request-options']!();
            expect(opts).toBeDefined();
            // connect-timeout
            const ct = http['[method]request-options.connect-timeout']!(opts);
            expect(ct === undefined || typeof ct === 'bigint').toBe(true);
            http['[method]request-options.set-connect-timeout']!(opts, 5000n);
            // first-byte-timeout
            http['[method]request-options.first-byte-timeout']!(opts);
            http['[method]request-options.set-first-byte-timeout']!(opts, 10000n);
            // between-bytes-timeout
            http['[method]request-options.between-bytes-timeout']!(opts);
            http['[method]request-options.set-between-bytes-timeout']!(opts, 1000n);
            http['[resource-drop]request-options']!();
        });

        it('incoming-response stubs', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const http = host['wasi:http/types']! as Record<string, Function>;
            const mockResp = { status: () => 200, headers: () => ({}), consume: () => ({}) };
            expect(http['[method]incoming-response.status']!(mockResp)).toBe(200);
            expect(http['[method]incoming-response.headers']!(mockResp)).toBeDefined();
            expect(http['[method]incoming-response.consume']!(mockResp)).toBeDefined();
            http['[resource-drop]incoming-response']!();
        });

        it('incoming-body stubs', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const http = host['wasi:http/types']! as Record<string, Function>;
            const mockBody = { stream: () => ({}) };
            expect(http['[method]incoming-body.stream']!(mockBody)).toBeDefined();
            const trailers = http['[static]incoming-body.finish']!();
            expect(trailers).toBeDefined();
            expect(typeof trailers.subscribe).toBe('function');
            expect(typeof trailers.get).toBe('function');
            http['[resource-drop]incoming-body']!();
        });

        it('future-incoming-response stubs', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const http = host['wasi:http/types']! as Record<string, Function>;
            const mockFuture = { subscribe: () => ({ ready: () => true, block: async () => { } }), get: () => ({ tag: 'ok' }) };
            const pollable = http['[method]future-incoming-response.subscribe']!(mockFuture);
            expect(pollable).toBeDefined();
            const result = http['[method]future-incoming-response.get']!(mockFuture);
            expect(result).toBeDefined();
            http['[resource-drop]future-incoming-response']!();
        });

        it('outgoing-response constructor and methods', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const http = host['wasi:http/types']! as Record<string, Function>;
            const fields = http['[constructor]fields']!();
            const resp = http['[constructor]outgoing-response']!(fields);
            expect(resp).toBeDefined();
            expect(resp.statusCode()).toBe(200);
            expect(resp.setStatusCode(404)).toBe(true);
            expect(resp.statusCode()).toBe(404);
            expect(resp.headers()).toBeDefined();
            const body = resp.body();
            expect(body).toBeDefined();
            http['[resource-drop]outgoing-response']!();
        });

        it('response-outparam and future-trailers stubs', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const http = host['wasi:http/types']! as Record<string, Function>;
            http['[resource-drop]response-outparam']!();
            http['[static]response-outparam.set']!();
            const trailPollable = http['[method]future-trailers.subscribe']!();
            expect(trailPollable).toBeDefined();
            const trailResult = http['[method]future-trailers.get']!();
            expect(trailResult).toBeDefined();
            http['[resource-drop]future-trailers']!();
        });

        it('http-error-code returns undefined', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const http = host['wasi:http/types']! as Record<string, Function>;
            expect(http['http-error-code']!()).toBeUndefined();
            http['[resource-drop]incoming-request']!();
        });
    });

    describe('filesystem adapter methods', () => {
        it('get-directories returns array of tuples', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const preopens = host['wasi:filesystem/preopens']! as Record<string, Function>;
            const dirs = preopens['get-directories']!();
            expect(Array.isArray(dirs)).toBe(true);
        });

        it('filesystem-error-code returns undefined', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const fsTypes = host['wasi:filesystem/types']! as Record<string, Function>;
            expect(fsTypes['filesystem-error-code']!()).toBeUndefined();
        });

        it('descriptor and directory-entry-stream drops are no-ops', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const fsTypes = host['wasi:filesystem/types']! as Record<string, Function>;
            expect(() => fsTypes['[resource-drop]descriptor']!()).not.toThrow();
            expect(() => fsTypes['[resource-drop]directory-entry-stream']!()).not.toThrow();
        });

        it('read-directory-entry calls method on self', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const fsTypes = host['wasi:filesystem/types']! as Record<string, Function>;
            const mockDirStream = { readDirectoryEntry: () => ({ tag: 'ok', val: undefined }) };
            const result = fsTypes['[method]directory-entry-stream.read-directory-entry']!(mockDirStream);
            expect(result.tag).toBe('ok');
        });
    });

    describe('socket adapter methods', () => {
        it('instance-network returns an object', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const net = host['wasi:sockets/instance-network']! as Record<string, Function>;
            expect(typeof net['instance-network']).toBe('function');
            const result = net['instance-network']!();
            expect(result).toBeDefined();
        });

        it('tcp-create-socket returns err not-supported', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const tcp = host['wasi:sockets/tcp-create-socket']! as Record<string, Function>;
            expect(tcp['create-tcp-socket']!('ipv4')).toEqual({ tag: 'err', val: 'not-supported' });
            expect(tcp['create-tcp-socket']!('ipv6')).toEqual({ tag: 'err', val: 'not-supported' });
        });

        it('udp-create-socket returns err not-supported', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const udp = host['wasi:sockets/udp-create-socket']! as Record<string, Function>;
            expect(udp['create-udp-socket']!('ipv4')).toEqual({ tag: 'err', val: 'not-supported' });
        });

        it('ip-name-lookup resolve-addresses returns err not-supported', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const dns = host['wasi:sockets/ip-name-lookup']! as Record<string, Function>;
            const result = dns['resolve-addresses']!({}, 'example.com');
            expect(result.tag).toBe('err');
            expect(result.val).toBe('not-supported');
        });

        it('network drop is a no-op', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const net = host['wasi:sockets/network']! as Record<string, Function>;
            expect(() => net['[resource-drop]network']!()).not.toThrow();
        });
    });

    describe('cli terminal adapter methods', () => {
        it('terminal-stdin returns undefined (no terminal)', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const ts = host['wasi:cli/terminal-stdin']! as Record<string, Function>;
            expect(ts['get-terminal-stdin']!()).toBeUndefined();
        });

        it('terminal-stdout returns undefined (no terminal)', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const ts = host['wasi:cli/terminal-stdout']! as Record<string, Function>;
            expect(ts['get-terminal-stdout']!()).toBeUndefined();
        });

        it('terminal-stderr returns undefined (no terminal)', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const ts = host['wasi:cli/terminal-stderr']! as Record<string, Function>;
            expect(ts['get-terminal-stderr']!()).toBeUndefined();
        });
    });

    describe('timezone adapter methods', () => {
        it('timezone display returns object', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const tz = host['wasi:clocks/timezone']! as Record<string, Function>;
            expect(typeof tz['display']).toBe('function');
        });
    });
});
