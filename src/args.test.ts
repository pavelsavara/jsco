// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { parseCliArgs, HELP_TEXT } from './args';

describe('parseCliArgs', () => {
    test('bare .wasm path as last argument', () => {
        const result = parseCliArgs(['component.wasm']);
        expect(result.componentUrl).toBe('component.wasm');
        expect(result.error).toBeUndefined();
        expect(result.help).toBe(false);
        expect(result.options.useNumberForInt64).toBe(false);
        expect(result.options.noJspi).toBe(false);
        expect(result.options.validateTypes).toBe(true);
    });

    test('--component= flag', () => {
        const result = parseCliArgs(['--component=/path/to/my.wasm']);
        expect(result.componentUrl).toBe('/path/to/my.wasm');
        expect(result.error).toBeUndefined();
    });

    test('--use-number-for-int64 flag', () => {
        const result = parseCliArgs(['--use-number-for-int64', 'test.wasm']);
        expect(result.options.useNumberForInt64).toBe(true);
        expect(result.componentUrl).toBe('test.wasm');
        expect(result.error).toBeUndefined();
    });

    test('--no-jspi flag', () => {
        const result = parseCliArgs(['--no-jspi', 'test.wasm']);
        expect(result.options.noJspi).toBe(true);
        expect(result.error).toBeUndefined();
    });

    test('--validate-types flag', () => {
        const result = parseCliArgs(['--validate-types', 'test.wasm']);
        expect(result.options.validateTypes).toBe(true);
        expect(result.error).toBeUndefined();
    });

    test('all flags combined', () => {
        const result = parseCliArgs(['--use-number-for-int64', '--no-jspi', '--validate-types', '--component=app.wasm']);
        expect(result.options.useNumberForInt64).toBe(true);
        expect(result.options.noJspi).toBe(true);
        expect(result.options.validateTypes).toBe(true);
        expect(result.componentUrl).toBe('app.wasm');
        expect(result.error).toBeUndefined();
    });

    test('unknown argument returns error', () => {
        const result = parseCliArgs(['--unknown', 'test.wasm']);
        expect(result.error).toBe('Unknown argument: --unknown');
    });

    test('no arguments returns usage error', () => {
        const result = parseCliArgs([]);
        expect(result.error).toContain('usage:');
        expect(result.componentUrl).toBeUndefined();
    });

    test('.wasm only recognized as last argument', () => {
        const result = parseCliArgs(['foo.wasm', 'bar.wasm']);
        expect(result.error).toBe('Unknown argument: foo.wasm');
    });

    test('empty strings are skipped', () => {
        const result = parseCliArgs(['', '', 'test.wasm']);
        expect(result.componentUrl).toBe('test.wasm');
        expect(result.error).toBeUndefined();
    });

    test('--component= with empty value', () => {
        const result = parseCliArgs(['--component=']);
        expect(result.componentUrl).toBe('');
        // empty string is falsy, so usage error is returned
        expect(result.error).toContain('usage:');
    });

    test('--help flag', () => {
        const result = parseCliArgs(['--help']);
        expect(result.help).toBe(true);
        expect(result.error).toBeUndefined();
    });

    test('-h flag', () => {
        const result = parseCliArgs(['-h']);
        expect(result.help).toBe(true);
        expect(result.error).toBeUndefined();
    });

    test('--help suppresses usage error', () => {
        const result = parseCliArgs(['--help']);
        expect(result.help).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.componentUrl).toBeUndefined();
    });

    test('HELP_TEXT contains all networking options', () => {
        expect(HELP_TEXT).toContain('--max-http-body-bytes');
        expect(HELP_TEXT).toContain('--max-http-headers-bytes');
        expect(HELP_TEXT).toContain('--socket-buffer-bytes');
        expect(HELP_TEXT).toContain('--max-tcp-pending');
        expect(HELP_TEXT).toContain('--tcp-idle-timeout-ms');
        expect(HELP_TEXT).toContain('--http-request-timeout-ms');
        expect(HELP_TEXT).toContain('--max-udp-datagrams');
        expect(HELP_TEXT).toContain('--dns-timeout-ms');
        expect(HELP_TEXT).toContain('--max-concurrent-dns');
        expect(HELP_TEXT).toContain('--max-http-connections');
        expect(HELP_TEXT).toContain('--max-request-url-bytes');
        expect(HELP_TEXT).toContain('--http-headers-timeout-ms');
        expect(HELP_TEXT).toContain('--http-keep-alive-timeout-ms');
        expect(HELP_TEXT).toContain('--env=');
        expect(HELP_TEXT).toContain('--env-inherit');
        expect(HELP_TEXT).toContain('--dir=');
        expect(HELP_TEXT).toContain('--cwd=');
        expect(HELP_TEXT).toContain('--enable=');
    });

    describe('networking CLI args', () => {
        test('--max-http-body-bytes', () => {
            const result = parseCliArgs(['--max-http-body-bytes=4194304', 'test.wasm']);
            expect(result.options.network.maxHttpBodyBytes).toBe(4194304);
        });

        test('--max-http-headers-bytes', () => {
            const result = parseCliArgs(['--max-http-headers-bytes=100000', 'test.wasm']);
            expect(result.options.network.maxHttpHeadersBytes).toBe(100000);
        });

        test('--socket-buffer-bytes', () => {
            const result = parseCliArgs(['--socket-buffer-bytes=65536', 'test.wasm']);
            expect(result.options.network.socketBufferBytes).toBe(65536);
        });

        test('--max-tcp-pending', () => {
            const result = parseCliArgs(['--max-tcp-pending=1000', 'test.wasm']);
            expect(result.options.network.maxTcpPendingConnections).toBe(1000);
        });

        test('--tcp-idle-timeout-ms', () => {
            const result = parseCliArgs(['--tcp-idle-timeout-ms=60000', 'test.wasm']);
            expect(result.options.network.tcpIdleTimeoutMs).toBe(60000);
        });

        test('--http-request-timeout-ms', () => {
            const result = parseCliArgs(['--http-request-timeout-ms=5000', 'test.wasm']);
            expect(result.options.network.httpRequestTimeoutMs).toBe(5000);
        });

        test('--max-udp-datagrams', () => {
            const result = parseCliArgs(['--max-udp-datagrams=500', 'test.wasm']);
            expect(result.options.network.maxUdpDatagrams).toBe(500);
        });

        test('--dns-timeout-ms', () => {
            const result = parseCliArgs(['--dns-timeout-ms=3000', 'test.wasm']);
            expect(result.options.network.dnsTimeoutMs).toBe(3000);
        });

        test('--max-concurrent-dns', () => {
            const result = parseCliArgs(['--max-concurrent-dns=50', 'test.wasm']);
            expect(result.options.network.maxConcurrentDnsLookups).toBe(50);
        });

        test('all networking args combined', () => {
            const result = parseCliArgs([
                '--max-http-body-bytes=1048576',
                '--max-tcp-pending=200',
                '--dns-timeout-ms=2000',
                'test.wasm',
            ]);
            expect(result.options.network.maxHttpBodyBytes).toBe(1048576);
            expect(result.options.network.maxTcpPendingConnections).toBe(200);
            expect(result.options.network.dnsTimeoutMs).toBe(2000);
            expect(result.error).toBeUndefined();
        });

        test('invalid numeric value defaults to 0', () => {
            const result = parseCliArgs(['--max-tcp-pending=abc', 'test.wasm']);
            expect(result.options.network.maxTcpPendingConnections).toBe(0);
        });
    });

    describe('environment CLI args', () => {
        test('--env=KEY=VALUE sets env variable', () => {
            const result = parseCliArgs(['--env=HOME=/usr/home', 'test.wasm']);
            expect(result.options.env).toEqual({ HOME: '/usr/home' });
            expect(result.error).toBeUndefined();
        });

        test('multiple --env args', () => {
            const result = parseCliArgs(['--env=A=1', '--env=B=2', 'test.wasm']);
            expect(result.options.env).toEqual({ A: '1', B: '2' });
        });

        test('--env with value containing =', () => {
            const result = parseCliArgs(['--env=PATH=/usr/bin:/bin', 'test.wasm']);
            expect(result.options.env).toEqual({ PATH: '/usr/bin:/bin' });
        });

        test('--env without = in value is an error', () => {
            const result = parseCliArgs(['--env=NOVALUE', 'test.wasm']);
            expect(result.error).toContain('Invalid --env format');
        });

        test('--env-inherit flag', () => {
            const result = parseCliArgs(['--env-inherit', 'test.wasm']);
            expect(result.options.envInherit).toBe(true);
            expect(result.error).toBeUndefined();
        });
    });

    describe('mount CLI args', () => {
        test('--dir=HOST::GUEST mounts read-write', () => {
            const result = parseCliArgs(['--dir=/data::/mnt/data', 'test.wasm']);
            expect(result.options.mounts).toEqual([{ hostPath: '/data', guestPath: '/mnt/data', readOnly: false }]);
            expect(result.error).toBeUndefined();
        });

        test('--dir=HOST::GUEST::ro mounts read-only', () => {
            const result = parseCliArgs(['--dir=/data::/mnt/data::ro', 'test.wasm']);
            expect(result.options.mounts).toEqual([{ hostPath: '/data', guestPath: '/mnt/data', readOnly: true }]);
        });

        test('multiple --dir args', () => {
            const result = parseCliArgs(['--dir=.::/app', '--dir=/tmp::/tmp::ro', 'test.wasm']);
            expect(result.options.mounts).toHaveLength(2);
            expect(result.options.mounts[0]).toEqual({ hostPath: '.', guestPath: '/app', readOnly: false });
            expect(result.options.mounts[1]).toEqual({ hostPath: '/tmp', guestPath: '/tmp', readOnly: true });
        });

        test('invalid --dir format', () => {
            const result = parseCliArgs(['--dir=/data', 'test.wasm']);
            expect(result.error).toContain('Invalid --dir format');
        });
    });

    describe('cwd CLI arg', () => {
        test('--cwd sets working directory', () => {
            const result = parseCliArgs(['--cwd=/app', 'test.wasm']);
            expect(result.options.cwd).toBe('/app');
            expect(result.error).toBeUndefined();
        });
    });

    describe('enabledInterfaces CLI args', () => {
        test('--enable sets enabled interfaces', () => {
            const result = parseCliArgs(['--enable=wasi:http', 'test.wasm']);
            expect(result.options.enabledInterfaces).toEqual(['wasi:http']);
        });

        test('multiple --enable args', () => {
            const result = parseCliArgs(['--enable=wasi:http', '--enable=wasi:cli', 'test.wasm']);
            expect(result.options.enabledInterfaces).toEqual(['wasi:http', 'wasi:cli']);
        });

        test('no --enable leaves enabledInterfaces undefined', () => {
            const result = parseCliArgs(['test.wasm']);
            expect(result.options.enabledInterfaces).toBeUndefined();
        });
    });

    describe('new networking CLI args', () => {
        test('--max-http-connections', () => {
            const result = parseCliArgs(['--max-http-connections=500', 'test.wasm']);
            expect(result.options.network.maxHttpConnections).toBe(500);
        });

        test('--max-request-url-bytes', () => {
            const result = parseCliArgs(['--max-request-url-bytes=4096', 'test.wasm']);
            expect(result.options.network.maxRequestUrlBytes).toBe(4096);
        });

        test('--http-headers-timeout-ms', () => {
            const result = parseCliArgs(['--http-headers-timeout-ms=30000', 'test.wasm']);
            expect(result.options.network.httpHeadersTimeoutMs).toBe(30000);
        });

        test('--http-keep-alive-timeout-ms', () => {
            const result = parseCliArgs(['--http-keep-alive-timeout-ms=10000', 'test.wasm']);
            expect(result.options.network.httpKeepAliveTimeoutMs).toBe(10000);
        });
    });
});
