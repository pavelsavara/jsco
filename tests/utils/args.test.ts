// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { parseCliArgs, HELP_TEXT, getHelpText, RUN_HELP_TEXT, SERVE_HELP_TEXT } from '../../src/utils/args';

describe('parseCliArgs', () => {
    // ─── Command detection ───

    test('bare .wasm path defaults to run command', () => {
        const result = parseCliArgs(['component.wasm']);
        expect(result.command).toBe('run');
        expect(result.componentUrl).toBe('component.wasm');
        expect(result.error).toBeUndefined();
        expect(result.help).toBe(false);
        expect(result.options.useNumberForInt64).toBe(false);
        expect(result.options.noJspi).toBe(false);
        expect(result.options.validateTypes).toBe(true);
    });

    test('explicit run command', () => {
        const result = parseCliArgs(['run', 'component.wasm']);
        expect(result.command).toBe('run');
        expect(result.componentUrl).toBe('component.wasm');
        expect(result.error).toBeUndefined();
    });

    test('serve command', () => {
        const result = parseCliArgs(['serve', 'component.wasm']);
        expect(result.command).toBe('serve');
        expect(result.componentUrl).toBe('component.wasm');
        expect(result.error).toBeUndefined();
    });

    test('help command shows help', () => {
        const result = parseCliArgs(['help']);
        expect(result.help).toBe(true);
        expect(result.error).toBeUndefined();
    });

    test('help run shows run help', () => {
        const result = parseCliArgs(['help', 'run']);
        expect(result.help).toBe(true);
        expect(result.command).toBe('run');
    });

    test('help serve shows serve help', () => {
        const result = parseCliArgs(['help', 'serve']);
        expect(result.help).toBe(true);
        expect(result.command).toBe('serve');
    });

    // ─── Common flags ───

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

    test('all flags combined with run', () => {
        const result = parseCliArgs(['run', '--use-number-for-int64', '--no-jspi', '--validate-types', '--component=app.wasm']);
        expect(result.command).toBe('run');
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

    test('run --help returns help for run', () => {
        const result = parseCliArgs(['run', '--help']);
        expect(result.help).toBe(true);
        expect(result.command).toBe('run');
    });

    test('serve --help returns help for serve', () => {
        const result = parseCliArgs(['serve', '--help']);
        expect(result.help).toBe(true);
        expect(result.command).toBe('serve');
    });

    // ─── Help text content ───

    test('HELP_TEXT contains commands', () => {
        expect(HELP_TEXT).toContain('run');
        expect(HELP_TEXT).toContain('serve');
        expect(HELP_TEXT).toContain('help');
    });

    test('RUN_HELP_TEXT contains run-specific content', () => {
        expect(RUN_HELP_TEXT).toContain('Runs a WebAssembly component');
        expect(RUN_HELP_TEXT).toContain('--dir');
        expect(RUN_HELP_TEXT).toContain('--env');
        expect(RUN_HELP_TEXT).toContain('--max-http-body-bytes');
    });

    test('SERVE_HELP_TEXT contains serve-specific content', () => {
        expect(SERVE_HELP_TEXT).toContain('Serves requests');
        expect(SERVE_HELP_TEXT).toContain('--addr');
        expect(SERVE_HELP_TEXT).toContain('0.0.0.0:8080');
    });

    test('getHelpText returns correct text per command', () => {
        expect(getHelpText()).toBe(HELP_TEXT);
        expect(getHelpText('run')).toBe(RUN_HELP_TEXT);
        expect(getHelpText('serve')).toBe(SERVE_HELP_TEXT);
    });

    // ─── Serve-specific options ───

    describe('serve options', () => {
        test('--addr with = syntax', () => {
            const result = parseCliArgs(['serve', '--addr=127.0.0.1:3000', 'test.wasm']);
            expect(result.command).toBe('serve');
            expect(result.options.addr).toBe('127.0.0.1:3000');
        });

        test('--addr with space syntax', () => {
            const result = parseCliArgs(['serve', '--addr', '0.0.0.0:9090', 'test.wasm']);
            expect(result.command).toBe('serve');
            expect(result.options.addr).toBe('0.0.0.0:9090');
        });

        test('addr defaults to undefined (resolved at runtime)', () => {
            const result = parseCliArgs(['serve', 'test.wasm']);
            expect(result.options.addr).toBeUndefined();
        });
    });

    // ─── Environment CLI args ───

    describe('environment CLI args', () => {
        test('--env KEY=VALUE with = syntax', () => {
            const result = parseCliArgs(['--env=HOME=/usr/home', 'test.wasm']);
            expect(result.options.env).toEqual({ HOME: '/usr/home' });
            expect(result.error).toBeUndefined();
        });

        test('--env KEY=VALUE with space syntax', () => {
            const result = parseCliArgs(['--env', 'HOME=/usr/home', 'test.wasm']);
            expect(result.options.env).toEqual({ HOME: '/usr/home' });
            expect(result.error).toBeUndefined();
        });

        test('multiple --env args', () => {
            const result = parseCliArgs(['--env', 'A=1', '--env', 'B=2', 'test.wasm']);
            expect(result.options.env).toEqual({ A: '1', B: '2' });
        });

        test('--env with value containing =', () => {
            const result = parseCliArgs(['--env', 'PATH=/usr/bin:/bin', 'test.wasm']);
            expect(result.options.env).toEqual({ PATH: '/usr/bin:/bin' });
        });

        test('--env NAME inherits single variable', () => {
            const result = parseCliArgs(['--env', 'HOME', 'test.wasm']);
            expect(result.options.envInheritNames).toEqual(['HOME']);
            expect(result.error).toBeUndefined();
        });

        test('--env=NAME inherits single variable (= syntax)', () => {
            const result = parseCliArgs(['--env=HOME', 'test.wasm']);
            expect(result.options.envInheritNames).toEqual(['HOME']);
        });

        test('--env-inherit flag', () => {
            const result = parseCliArgs(['--env-inherit', 'test.wasm']);
            expect(result.options.envInheritAll).toBe(true);
            expect(result.error).toBeUndefined();
        });
    });

    // ─── Mount CLI args ───

    describe('mount CLI args', () => {
        test('--dir HOST::GUEST with space syntax', () => {
            const result = parseCliArgs(['--dir', '/data::/mnt/data', 'test.wasm']);
            expect(result.options.mounts).toEqual([{ hostPath: '/data', guestPath: '/mnt/data', readOnly: false }]);
            expect(result.error).toBeUndefined();
        });

        test('--dir=HOST::GUEST with = syntax', () => {
            const result = parseCliArgs(['--dir=/data::/mnt/data', 'test.wasm']);
            expect(result.options.mounts).toEqual([{ hostPath: '/data', guestPath: '/mnt/data', readOnly: false }]);
        });

        test('--dir HOST::GUEST::ro mounts read-only', () => {
            const result = parseCliArgs(['--dir', '/data::/mnt/data::ro', 'test.wasm']);
            expect(result.options.mounts).toEqual([{ hostPath: '/data', guestPath: '/mnt/data', readOnly: true }]);
        });

        test('--dir HOST_DIR without guest maps to same path', () => {
            const result = parseCliArgs(['--dir', '/data', 'test.wasm']);
            expect(result.options.mounts).toEqual([{ hostPath: '/data', guestPath: '/data', readOnly: false }]);
        });

        test('multiple --dir args', () => {
            const result = parseCliArgs(['--dir', '.::/app', '--dir', '/tmp::/tmp::ro', 'test.wasm']);
            expect(result.options.mounts).toHaveLength(2);
            expect(result.options.mounts[0]).toEqual({ hostPath: '.', guestPath: '/app', readOnly: false });
            expect(result.options.mounts[1]).toEqual({ hostPath: '/tmp', guestPath: '/tmp', readOnly: true });
        });
    });

    // ─── CWD ───

    describe('cwd CLI arg', () => {
        test('--cwd with = syntax', () => {
            const result = parseCliArgs(['--cwd=/app', 'test.wasm']);
            expect(result.options.cwd).toBe('/app');
            expect(result.error).toBeUndefined();
        });

        test('--cwd with space syntax', () => {
            const result = parseCliArgs(['--cwd', '/app', 'test.wasm']);
            expect(result.options.cwd).toBe('/app');
        });
    });

    // ─── Enabled interfaces ───

    describe('enabledInterfaces CLI args', () => {
        test('--enable with = syntax', () => {
            const result = parseCliArgs(['--enable=wasi:http', 'test.wasm']);
            expect(result.options.enabledInterfaces).toEqual(['wasi:http']);
        });

        test('--enable with space syntax', () => {
            const result = parseCliArgs(['--enable', 'wasi:http', 'test.wasm']);
            expect(result.options.enabledInterfaces).toEqual(['wasi:http']);
        });

        test('multiple --enable args', () => {
            const result = parseCliArgs(['--enable', 'wasi:http', '--enable', 'wasi:cli', 'test.wasm']);
            expect(result.options.enabledInterfaces).toEqual(['wasi:http', 'wasi:cli']);
        });

        test('no --enable leaves enabledInterfaces undefined', () => {
            const result = parseCliArgs(['test.wasm']);
            expect(result.options.enabledInterfaces).toBeUndefined();
        });
    });

    // ─── Resource limit CLI args ───

    describe('resource limit CLI args', () => {
        test('default limits is empty object', () => {
            const result = parseCliArgs(['test.wasm']);
            expect(result.options.limits).toEqual({});
        });

        test('--max-allocation-size with = syntax', () => {
            const result = parseCliArgs(['--max-allocation-size=8388608', 'test.wasm']);
            expect(result.options.limits.maxAllocationSize).toBe(8388608);
        });

        test('--max-allocation-size with space syntax', () => {
            const result = parseCliArgs(['--max-allocation-size', '8388608', 'test.wasm']);
            expect(result.options.limits.maxAllocationSize).toBe(8388608);
        });

        test('--max-handles', () => {
            const result = parseCliArgs(['--max-handles=5000', 'test.wasm']);
            expect(result.options.limits.maxHandles).toBe(5000);
        });

        test('--max-path-length', () => {
            const result = parseCliArgs(['--max-path-length=2048', 'test.wasm']);
            expect(result.options.limits.maxPathLength).toBe(2048);
        });

        test('--max-memory-bytes', () => {
            const result = parseCliArgs(['--max-memory-bytes=134217728', 'test.wasm']);
            expect(result.options.limits.maxMemoryBytes).toBe(134217728);
        });

        test('--max-memory-bytes=0 disables', () => {
            const result = parseCliArgs(['--max-memory-bytes=0', 'test.wasm']);
            expect(result.options.limits.maxMemoryBytes).toBe(0);
        });

        test('--max-canon-ops-without-yield', () => {
            const result = parseCliArgs(['--max-canon-ops-without-yield=50000', 'test.wasm']);
            expect(result.options.limits.maxCanonOpsWithoutYield).toBe(50000);
        });

        test('--max-canon-ops-without-yield=0 disables', () => {
            const result = parseCliArgs(['--max-canon-ops-without-yield=0', 'test.wasm']);
            expect(result.options.limits.maxCanonOpsWithoutYield).toBe(0);
        });

        test('--max-canon-ops-without-yield negative is rejected', () => {
            const result = parseCliArgs(['--max-canon-ops-without-yield=-1', 'test.wasm']);
            expect(result.error).toMatch(/Invalid value for --max-canon-ops-without-yield/);
        });

        test('--max-memory-bytes missing value', () => {
            const result = parseCliArgs(['--max-memory-bytes']);
            expect(result.error).toBe('Missing value for --max-memory-bytes');
        });
    });

    // ─── Networking CLI args ───

    describe('networking CLI args', () => {
        test('--max-http-body-bytes with = syntax', () => {
            const result = parseCliArgs(['--max-http-body-bytes=4194304', 'test.wasm']);
            expect(result.options.network.maxHttpBodyBytes).toBe(4194304);
        });

        test('--max-http-body-bytes with space syntax', () => {
            const result = parseCliArgs(['--max-http-body-bytes', '4194304', 'test.wasm']);
            expect(result.options.network.maxHttpBodyBytes).toBe(4194304);
        });

        test('--max-http-headers-bytes', () => {
            const result = parseCliArgs(['--max-http-headers-bytes=100000', 'test.wasm']);
            expect(result.options.network.maxHttpHeadersBytes).toBe(100000);
        });

        test('--max-network-buffer-size', () => {
            const result = parseCliArgs(['--max-network-buffer-size=65536', 'test.wasm']);
            expect(result.options.limits.maxNetworkBufferSize).toBe(65536);
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

    // ─── Usage message includes command ───

    test('no args error includes run in usage', () => {
        const result = parseCliArgs([]);
        expect(result.error).toContain('jsco run');
    });

    test('serve without .wasm error includes serve in usage', () => {
        const result = parseCliArgs(['serve']);
        expect(result.error).toContain('jsco serve');
    });

    // ─── Missing value errors ───

    describe('missing value errors', () => {
        test('--env at end of args returns error', () => {
            const result = parseCliArgs(['--env']);
            expect(result.error).toBe('Missing value for --env');
        });

        test('--env followed by flag returns error', () => {
            const result = parseCliArgs(['--env', '--no-jspi', 'test.wasm']);
            expect(result.error).toBe('Missing value for --env');
        });

        test('--dir at end of args returns error', () => {
            const result = parseCliArgs(['--dir']);
            expect(result.error).toBe('Missing value for --dir');
        });

        test('--dir followed by flag returns error', () => {
            const result = parseCliArgs(['--dir', '--help']);
            expect(result.error).toBe('Missing value for --dir');
        });

        test('--cwd at end of args returns error', () => {
            const result = parseCliArgs(['--cwd']);
            expect(result.error).toBe('Missing value for --cwd');
        });

        test('--enable at end of args returns error', () => {
            const result = parseCliArgs(['--enable']);
            expect(result.error).toBe('Missing value for --enable');
        });

        test('--addr at end of args returns error', () => {
            const result = parseCliArgs(['serve', '--addr']);
            expect(result.error).toBe('Missing value for --addr');
        });

        test('--max-http-body-bytes at end returns error', () => {
            const result = parseCliArgs(['--max-http-body-bytes']);
            expect(result.error).toBe('Missing value for --max-http-body-bytes');
        });

        test('--max-http-headers-bytes at end returns error', () => {
            const result = parseCliArgs(['--max-http-headers-bytes']);
            expect(result.error).toBe('Missing value for --max-http-headers-bytes');
        });

        test('--max-network-buffer-size at end returns error', () => {
            const result = parseCliArgs(['--max-network-buffer-size']);
            expect(result.error).toBe('Missing value for --max-network-buffer-size');
        });

        test('--max-tcp-pending at end returns error', () => {
            const result = parseCliArgs(['--max-tcp-pending']);
            expect(result.error).toBe('Missing value for --max-tcp-pending');
        });

        test('--tcp-idle-timeout-ms at end returns error', () => {
            const result = parseCliArgs(['--tcp-idle-timeout-ms']);
            expect(result.error).toBe('Missing value for --tcp-idle-timeout-ms');
        });

        test('--http-request-timeout-ms at end returns error', () => {
            const result = parseCliArgs(['--http-request-timeout-ms']);
            expect(result.error).toBe('Missing value for --http-request-timeout-ms');
        });

        test('--max-udp-datagrams at end returns error', () => {
            const result = parseCliArgs(['--max-udp-datagrams']);
            expect(result.error).toBe('Missing value for --max-udp-datagrams');
        });

        test('--dns-timeout-ms at end returns error', () => {
            const result = parseCliArgs(['--dns-timeout-ms']);
            expect(result.error).toBe('Missing value for --dns-timeout-ms');
        });

        test('--max-concurrent-dns at end returns error', () => {
            const result = parseCliArgs(['--max-concurrent-dns']);
            expect(result.error).toBe('Missing value for --max-concurrent-dns');
        });

        test('--max-http-connections at end returns error', () => {
            const result = parseCliArgs(['--max-http-connections']);
            expect(result.error).toBe('Missing value for --max-http-connections');
        });

        test('--max-request-url-bytes at end returns error', () => {
            const result = parseCliArgs(['--max-request-url-bytes']);
            expect(result.error).toBe('Missing value for --max-request-url-bytes');
        });

        test('--http-headers-timeout-ms at end returns error', () => {
            const result = parseCliArgs(['--http-headers-timeout-ms']);
            expect(result.error).toBe('Missing value for --http-headers-timeout-ms');
        });

        test('--http-keep-alive-timeout-ms at end returns error', () => {
            const result = parseCliArgs(['--http-keep-alive-timeout-ms']);
            expect(result.error).toBe('Missing value for --http-keep-alive-timeout-ms');
        });
    });

    // ─── --dir format errors ───

    describe('--dir format errors', () => {
        test('invalid double-colon format returns error', () => {
            const result = parseCliArgs(['--dir', '/host::/guest::rw', 'test.wasm']);
            expect(result.error).toContain('Invalid --dir format');
        });

        test('too many :: segments returns error', () => {
            const result = parseCliArgs(['--dir', 'a::b::c::d', 'test.wasm']);
            expect(result.error).toContain('Invalid --dir format');
        });
    });

    // ─── Mixed environment args ───

    describe('mixed environment args', () => {
        test('inherit + explicit in same invocation', () => {
            const result = parseCliArgs(['--env', 'PATH', '--env', 'HOME=/my/home', 'test.wasm']);
            expect(result.options.envInheritNames).toEqual(['PATH']);
            expect(result.options.env).toEqual({ HOME: '/my/home' });
        });

        test('multiple inherits', () => {
            const result = parseCliArgs(['--env', 'PATH', '--env', 'LANG', 'test.wasm']);
            expect(result.options.envInheritNames).toEqual(['PATH', 'LANG']);
        });

        test('--env-inherit with explicit env', () => {
            const result = parseCliArgs(['--env-inherit', '--env', 'EXTRA=val', 'test.wasm']);
            expect(result.options.envInheritAll).toBe(true);
            expect(result.options.env).toEqual({ EXTRA: 'val' });
        });

        test('env value with empty value after =', () => {
            const result = parseCliArgs(['--env', 'KEY=', 'test.wasm']);
            expect(result.options.env).toEqual({ KEY: '' });
        });
    });

    // ─── Networking args with space syntax ───

    describe('networking space syntax', () => {
        test('--max-http-headers-bytes with space', () => {
            const result = parseCliArgs(['--max-http-headers-bytes', '50000', 'test.wasm']);
            expect(result.options.network.maxHttpHeadersBytes).toBe(50000);
        });

        test('--max-network-buffer-size with space', () => {
            const result = parseCliArgs(['--max-network-buffer-size', '32768', 'test.wasm']);
            expect(result.options.limits.maxNetworkBufferSize).toBe(32768);
        });

        test('--max-tcp-pending with space', () => {
            const result = parseCliArgs(['--max-tcp-pending', '256', 'test.wasm']);
            expect(result.options.network.maxTcpPendingConnections).toBe(256);
        });

        test('--tcp-idle-timeout-ms with space', () => {
            const result = parseCliArgs(['--tcp-idle-timeout-ms', '30000', 'test.wasm']);
            expect(result.options.network.tcpIdleTimeoutMs).toBe(30000);
        });

        test('--max-udp-datagrams with space', () => {
            const result = parseCliArgs(['--max-udp-datagrams', '100', 'test.wasm']);
            expect(result.options.network.maxUdpDatagrams).toBe(100);
        });

        test('--dns-timeout-ms with space', () => {
            const result = parseCliArgs(['--dns-timeout-ms', '5000', 'test.wasm']);
            expect(result.options.network.dnsTimeoutMs).toBe(5000);
        });

        test('--max-concurrent-dns with space', () => {
            const result = parseCliArgs(['--max-concurrent-dns', '20', 'test.wasm']);
            expect(result.options.network.maxConcurrentDnsLookups).toBe(20);
        });

        test('--max-http-connections with space', () => {
            const result = parseCliArgs(['--max-http-connections', '200', 'test.wasm']);
            expect(result.options.network.maxHttpConnections).toBe(200);
        });

        test('--max-request-url-bytes with space', () => {
            const result = parseCliArgs(['--max-request-url-bytes', '8192', 'test.wasm']);
            expect(result.options.network.maxRequestUrlBytes).toBe(8192);
        });

        test('--http-headers-timeout-ms with space', () => {
            const result = parseCliArgs(['--http-headers-timeout-ms', '15000', 'test.wasm']);
            expect(result.options.network.httpHeadersTimeoutMs).toBe(15000);
        });

        test('--http-keep-alive-timeout-ms with space', () => {
            const result = parseCliArgs(['--http-keep-alive-timeout-ms', '5000', 'test.wasm']);
            expect(result.options.network.httpKeepAliveTimeoutMs).toBe(5000);
        });

        test('--http-request-timeout-ms with space', () => {
            const result = parseCliArgs(['--http-request-timeout-ms', '10000', 'test.wasm']);
            expect(result.options.network.httpRequestTimeoutMs).toBe(10000);
        });
    });

    // ─── Complex combined scenarios ───

    describe('complex combined scenarios', () => {
        test('serve with all options', () => {
            const result = parseCliArgs([
                'serve',
                '--addr=localhost:3000',
                '--dir', '/data::/mnt/data',
                '--env', 'PORT=3000',
                '--env', 'NODE_ENV',
                '--cwd', '/app',
                '--enable', 'wasi:http',
                '--max-http-body-bytes=5242880',
                'server.wasm',
            ]);
            expect(result.command).toBe('serve');
            expect(result.options.addr).toBe('localhost:3000');
            expect(result.options.mounts).toHaveLength(1);
            expect(result.options.env).toEqual({ PORT: '3000' });
            expect(result.options.envInheritNames).toEqual(['NODE_ENV']);
            expect(result.options.cwd).toBe('/app');
            expect(result.options.enabledInterfaces).toEqual(['wasi:http']);
            expect(result.options.network.maxHttpBodyBytes).toBe(5242880);
            expect(result.componentUrl).toBe('server.wasm');
            expect(result.error).toBeUndefined();
        });

        test('run with multiple mounts and enables', () => {
            const result = parseCliArgs([
                'run',
                '--dir=.::/app',
                '--dir=/tmp::/tmp::ro',
                '--dir', '/home/user',
                '--enable=wasi:cli',
                '--enable=wasi:filesystem',
                '--no-jspi',
                'app.wasm',
            ]);
            expect(result.command).toBe('run');
            expect(result.options.mounts).toHaveLength(3);
            expect(result.options.mounts[2]).toEqual({ hostPath: '/home/user', guestPath: '/home/user', readOnly: false });
            expect(result.options.enabledInterfaces).toEqual(['wasi:cli', 'wasi:filesystem']);
            expect(result.options.noJspi).toBe(true);
            expect(result.error).toBeUndefined();
        });

        test('non-wasm positional arg returns error', () => {
            const result = parseCliArgs(['run', 'something']);
            expect(result.error).toContain('Unknown argument');
        });
    });

    // ─── Component args (-- separator) ───

    describe('component args (-- separator)', () => {
        test('-- passes remaining args as componentArgs', () => {
            const result = parseCliArgs(['test.wasm', '--', 'arg1', 'arg2']);
            expect(result.options.componentArgs).toEqual(['arg1', 'arg2']);
            expect(result.componentUrl).toBe('test.wasm');
            expect(result.error).toBeUndefined();
        });

        test('-- with no following args gives empty componentArgs', () => {
            const result = parseCliArgs(['test.wasm', '--']);
            expect(result.options.componentArgs).toEqual([]);
            expect(result.error).toBeUndefined();
        });

        test('-- passes flags as component args without parsing', () => {
            const result = parseCliArgs(['test.wasm', '--', '--help', '--unknown', '-x']);
            expect(result.options.componentArgs).toEqual(['--help', '--unknown', '-x']);
            expect(result.help).toBe(false);
            expect(result.error).toBeUndefined();
        });

        test('run command with -- separator', () => {
            const result = parseCliArgs(['run', 'app.wasm', '--', 'hello', 'world']);
            expect(result.command).toBe('run');
            expect(result.componentUrl).toBe('app.wasm');
            expect(result.options.componentArgs).toEqual(['hello', 'world']);
        });

        test('default componentArgs is empty', () => {
            const result = parseCliArgs(['test.wasm']);
            expect(result.options.componentArgs).toEqual([]);
        });
    });
});
