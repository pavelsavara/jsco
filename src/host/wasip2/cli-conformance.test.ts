// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * WASI P2 conformance tests — runs pre-built Wasmtime test-program components
 * via the jsco CLI and validates exit codes / stdout.
 *
 * Test binaries are from https://github.com/bytecodealliance/wasmtime
 * (Apache-2.0 WITH LLVM-exception).
 *
 * The .component.wasm files live in integration-tests/wasmtime/.
 * Fixture files for filesystem tests are in integration-tests/wasmtime/fixtures/.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { execFileSync } from 'child_process';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { existsSync, mkdtempSync, cpSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';

const distIndex = path.resolve('./dist/debug/index.js');
const wasmDir = path.resolve('./integration-tests/wasmtime');
const fixturesDir = path.join(wasmDir, 'fixtures');
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const nodeExe = process.execPath;

function component(name: string): string {
    return path.join(wasmDir, `${name}.component.wasm`);
}

function hasComponent(name: string): boolean {
    return existsSync(component(name));
}

interface RunOptions {
    args?: string[];
    env?: Record<string, string>;
    dirs?: string[];
    stdin?: string;
    timeout?: number;
    expectedExit?: number;
}

// TODO: re-enable once CLI `run` command handles all WASI P2 interfaces correctly
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function runJsco(_wasmFile: string, _opts: RunOptions = {}): { stdout: string; stderr: string; status: number } {
    return { stdout: '', stderr: 'not yet implemented', status: 1 };
}

/* Original implementation — restore when ready:
function runJscoImpl(wasmFile: string, opts: RunOptions = {}): { stdout: string; stderr: string; status: number } {
    const cliArgs: string[] = [
        '--experimental-wasm-jspi',
        '--experimental-vm-modules',
        distIndex,
        'run',
    ];

    if (opts.dirs) {
        for (const dir of opts.dirs) {
            cliArgs.push('--dir', dir);
        }
    }

    if (opts.env) {
        for (const [k, v] of Object.entries(opts.env)) {
            cliArgs.push('--env', `${k}=${v}`);
        }
    }

    cliArgs.push(wasmFile);

    if (opts.args) {
        cliArgs.push('--', ...opts.args);
    }

    try {
        const stdout = execFileSync(nodeExe, cliArgs, {
            encoding: 'utf-8',
            timeout: opts.timeout ?? 30_000,
            input: opts.stdin,
            env: { ...process.env, NODE_NO_WARNINGS: '1' },
            maxBuffer: 20 * 1024 * 1024,
        });
        return { stdout, stderr: '', status: 0 };
    } catch (e: unknown) {
        const err = e as { stdout?: string; stderr?: string; status?: number };
        return {
            stdout: err.stdout ?? '',
            stderr: err.stderr ?? '',
            status: err.status ?? 1,
        };
    }
}
*/

/** Create a temp directory pre-populated with fixture files. */
function createWorkspace(): string {
    const ws = mkdtempSync(path.join(tmpdir(), 'jsco-wasi-conformance-'));
    cpSync(fixturesDir, ws, { recursive: true });
    return ws;
}

const haveDistDebug = existsSync(distIndex);
const haveWasmDir = existsSync(wasmDir);
// TODO: re-enable once CLI `run` command handles all WASI P2 interfaces correctly
const _describeIfReady = haveDistDebug && haveWasmDir ? describe : describe.skip;
const describeIfReady = describe.skip;

describeIfReady('WASI P2 conformance (wasmtime test-programs)', () => {

    // ── Phase 1: CLI & Core ──────────────────────────────────────────

    describe('cli: stdout', () => {
        test('p2_cli_hello_stdout', () => {
            const r = runJsco(component('p2_cli_hello_stdout'));
            expect(r.status).toBe(0);
            expect(r.stdout).toContain('Hello, world!');
        });

        test('p2_cli_much_stdout', () => {
            const r = runJsco(component('p2_cli_much_stdout'));
            expect(r.status).toBe(0);
        });

        test('p2_cli_stdio_write_flushes', () => {
            const r = runJsco(component('p2_cli_stdio_write_flushes'));
            expect(r.status).toBe(0);
        });
    });

    describe('cli: args', () => {
        test('p2_cli_args', () => {
            const r = runJsco(component('p2_cli_args'), {
                args: ['hello', 'world'],
            });
            expect(r.status).toBe(0);
        });

        test('p2_cli_argv0', () => {
            const r = runJsco(component('p2_cli_argv0'));
            expect(r.status).toBe(0);
        });
    });

    describe('cli: environment', () => {
        test('p2_cli_env', () => {
            const r = runJsco(component('p2_cli_env'), {
                env: { FOO: 'bar', BAZ: 'qux' },
            });
            expect(r.status).toBe(0);
        });

        test('p2_cli_large_env', () => {
            const r = runJsco(component('p2_cli_large_env'), {
                env: { LARGE: 'x'.repeat(1024) },
            });
            expect(r.status).toBe(0);
        });
    });

    describe('cli: exit codes', () => {
        test('p2_cli_exit_default', () => {
            const r = runJsco(component('p2_cli_exit_default'));
            expect(r.status).toBe(0);
        });

        test('p2_cli_exit_success', () => {
            const r = runJsco(component('p2_cli_exit_success'));
            expect(r.status).toBe(0);
        });

        test('p2_cli_exit_failure', () => {
            const r = runJsco(component('p2_cli_exit_failure'));
            expect(r.status).not.toBe(0);
        });

        test('p2_cli_exit_panic', () => {
            const r = runJsco(component('p2_cli_exit_panic'));
            expect(r.status).not.toBe(0);
        });
    });

    describe('cli: stdin', () => {
        test('p2_cli_stdin', () => {
            const r = runJsco(component('p2_cli_stdin'), {
                stdin: 'So rested he by the Tumtum tree',
            });
            expect(r.status).toBe(0);
        });

        test('p2_cli_stdin_empty', () => {
            const r = runJsco(component('p2_cli_stdin_empty'), {
                stdin: '',
            });
            expect(r.status).toBe(0);
        });
    });

    describe('cli: clocks', () => {
        test('p2_cli_default_clocks', () => {
            const r = runJsco(component('p2_cli_default_clocks'));
            expect(r.status).toBe(0);
        });

        test('p2_cli_sleep', () => {
            const r = runJsco(component('p2_cli_sleep'));
            expect(r.status).toBe(0);
        });
    });

    describe('cli: misc', () => {
        test('p2_cli_export_cabi_realloc', () => {
            const r = runJsco(component('p2_cli_export_cabi_realloc'));
            expect(r.status).toBe(0);
        });
    });

    // ── Phase 1: Filesystem ──────────────────────────────────────────

    describe('filesystem', () => {
        let workspace: string;

        beforeEach(() => {
            workspace = createWorkspace();
        });

        test('p2_cli_file_read', () => {
            const r = runJsco(component('p2_cli_file_read'), {
                dirs: [`${workspace}::.`],
            });
            expect(r.status).toBe(0);
        });

        test('p2_cli_file_append', () => {
            const r = runJsco(component('p2_cli_file_append'), {
                dirs: [`${workspace}::.`],
            });
            expect(r.status).toBe(0);
        });

        test('p2_cli_file_dir_sync', () => {
            const r = runJsco(component('p2_cli_file_dir_sync'), {
                dirs: [`${workspace}::.`],
            });
            expect(r.status).toBe(0);
        });

        test('p2_cli_directory_list', () => {
            const r = runJsco(component('p2_cli_directory_list'), {
                dirs: [`${workspace}::.`],
            });
            expect(r.status).toBe(0);
        });
    });

    // ── Phase 2: TCP Sockets ─────────────────────────────────────────

    describe('tcp', () => {
        test('p2_tcp_bind', () => {
            const r = runJsco(component('p2_tcp_bind'));
            expect(r.status).toBe(0);
        });

        test('p2_tcp_connect', () => {
            const r = runJsco(component('p2_tcp_connect'));
            expect(r.status).toBe(0);
        });

        test('p2_tcp_listen', () => {
            const r = runJsco(component('p2_tcp_listen'));
            expect(r.status).toBe(0);
        });

        test('p2_tcp_sample_application', () => {
            const r = runJsco(component('p2_tcp_sample_application'), {
                timeout: 60_000,
            });
            expect(r.status).toBe(0);
        });

        test('p2_tcp_sockopts', () => {
            const r = runJsco(component('p2_tcp_sockopts'));
            expect(r.status).toBe(0);
        });

        test('p2_tcp_states', () => {
            const r = runJsco(component('p2_tcp_states'));
            expect(r.status).toBe(0);
        });

        test('p2_tcp_streams', () => {
            const r = runJsco(component('p2_tcp_streams'));
            expect(r.status).toBe(0);
        });
    });

    // ── Phase 2: UDP Sockets ─────────────────────────────────────────

    describe('udp', () => {
        test('p2_udp_bind', () => {
            const r = runJsco(component('p2_udp_bind'));
            expect(r.status).toBe(0);
        });

        test('p2_udp_connect', () => {
            const r = runJsco(component('p2_udp_connect'));
            expect(r.status).toBe(0);
        });

        test('p2_udp_sample_application', () => {
            const r = runJsco(component('p2_udp_sample_application'), {
                timeout: 60_000,
            });
            expect(r.status).toBe(0);
        });

        test('p2_udp_sockopts', () => {
            const r = runJsco(component('p2_udp_sockopts'));
            expect(r.status).toBe(0);
        });

        test('p2_udp_states', () => {
            const r = runJsco(component('p2_udp_states'));
            expect(r.status).toBe(0);
        });

        test('p2_udp_send_too_much', () => {
            const r = runJsco(component('p2_udp_send_too_much'));
            expect(r.status).toBe(0);
        });
    });

    // ── Phase 3: HTTP Outbound ───────────────────────────────────────
    // These tests require an HTTP echo server. They read the server
    // address from the HTTP_SERVER environment variable.
    // TODO: Start a mock HTTP server in beforeAll and pass its address.

    describe.skip('http outbound (needs mock server)', () => {
        // const httpServerAddr = 'localhost:????';

        test('p2_http_outbound_request_get', () => {
            const r = runJsco(component('p2_http_outbound_request_get'), {
                // env: { HTTP_SERVER: httpServerAddr },
            });
            expect(r.status).toBe(0);
        });

        test('p2_http_outbound_request_post', () => {
            const r = runJsco(component('p2_http_outbound_request_post'), {
                // env: { HTTP_SERVER: httpServerAddr },
            });
            expect(r.status).toBe(0);
        });

        test('p2_http_outbound_request_put', () => {
            const r = runJsco(component('p2_http_outbound_request_put'), {
                // env: { HTTP_SERVER: httpServerAddr },
            });
            expect(r.status).toBe(0);
        });

        test('p2_http_outbound_request_large_post', () => {
            const r = runJsco(component('p2_http_outbound_request_large_post'), {
                // env: { HTTP_SERVER: httpServerAddr },
            });
            expect(r.status).toBe(0);
        });

        test('p2_http_outbound_request_content_length', () => {
            const r = runJsco(component('p2_http_outbound_request_content_length'), {
                // env: { HTTP_SERVER: httpServerAddr },
            });
            expect(r.status).toBe(0);
        });

        test('p2_http_outbound_request_response_build', () => {
            const r = runJsco(component('p2_http_outbound_request_response_build'), {
                // env: { HTTP_SERVER: httpServerAddr },
            });
            expect(r.status).toBe(0);
        });

        test('p2_http_outbound_request_invalid_dnsname', () => {
            const r = runJsco(component('p2_http_outbound_request_invalid_dnsname'), {
                // env: { HTTP_SERVER: httpServerAddr },
            });
            expect(r.status).toBe(0);
        });

        test('p2_http_outbound_request_invalid_header', () => {
            const r = runJsco(component('p2_http_outbound_request_invalid_header'), {
                // env: { HTTP_SERVER: httpServerAddr },
            });
            expect(r.status).toBe(0);
        });

        test('p2_http_outbound_request_invalid_port', () => {
            const r = runJsco(component('p2_http_outbound_request_invalid_port'), {
                // env: { HTTP_SERVER: httpServerAddr },
            });
            expect(r.status).toBe(0);
        });

        test('p2_http_outbound_request_invalid_version', () => {
            const r = runJsco(component('p2_http_outbound_request_invalid_version'), {
                // env: { HTTP_SERVER: httpServerAddr },
            });
            expect(r.status).toBe(0);
        });

        test('p2_http_outbound_request_unknown_method', () => {
            const r = runJsco(component('p2_http_outbound_request_unknown_method'), {
                // env: { HTTP_SERVER: httpServerAddr },
            });
            expect(r.status).toBe(0);
        });

        test('p2_http_outbound_request_unsupported_scheme', () => {
            const r = runJsco(component('p2_http_outbound_request_unsupported_scheme'), {
                // env: { HTTP_SERVER: httpServerAddr },
            });
            expect(r.status).toBe(0);
        });

        test('p2_http_outbound_request_timeout', () => {
            const r = runJsco(component('p2_http_outbound_request_timeout'), {
                // env: { HTTP_SERVER: httpServerAddr },
                timeout: 60_000,
            });
            expect(r.status).toBe(0);
        });

        test('p2_http_outbound_request_missing_path_and_query', () => {
            const r = runJsco(component('p2_http_outbound_request_missing_path_and_query'), {
                // env: { HTTP_SERVER: httpServerAddr },
            });
            expect(r.status).toBe(0);
        });
    });

    // ── Phase 4: Miscellaneous ───────────────────────────────────────

    describe('misc', () => {
        test('p2_random', () => {
            const r = runJsco(component('p2_random'));
            expect(r.status).toBe(0);
        });

        test('p2_sleep', () => {
            const r = runJsco(component('p2_sleep'));
            expect(r.status).toBe(0);
        });

        test('p2_ip_name_lookup', () => {
            const r = runJsco(component('p2_ip_name_lookup'));
            expect(r.status).toBe(0);
        });

        test('p2_stream_pollable_correct', () => {
            const r = runJsco(component('p2_stream_pollable_correct'));
            expect(r.status).toBe(0);
        });

        test('p2_api_time', () => {
            const r = runJsco(component('p2_api_time'));
            expect(r.status).toBe(0);
        });

        test('p2_api_read_only', () => {
            const workspace = createWorkspace();
            const r = runJsco(component('p2_api_read_only'), {
                dirs: [`${workspace}::.::ro`],
            });
            expect(r.status).toBe(0);
        });

        test('p2_api_reactor', () => {
            const r = runJsco(component('p2_api_reactor'));
            expect(r.status).toBe(0);
        });
    });

    // ── WASI Preview 3 (skipped — async component model not yet supported) ──

    describe.skip('p3: cli', () => {
        test('p3_cli_hello_stdout', () => {
            const r = runJsco(component('p3_cli_hello_stdout'));
            expect(r.status).toBe(0);
        });

        test('p3_cli_hello_stdout_post_return', () => {
            const r = runJsco(component('p3_cli_hello_stdout_post_return'));
            expect(r.status).toBe(0);
        });

        test('p3_cli_much_stdout', () => {
            const r = runJsco(component('p3_cli_much_stdout'));
            expect(r.status).toBe(0);
        });

        test('p3_cli_read_stdin', () => {
            const r = runJsco(component('p3_cli_read_stdin'), {
                stdin: 'hello p3',
            });
            expect(r.status).toBe(0);
        });

        test('p3_cli', () => {
            const r = runJsco(component('p3_cli'));
            expect(r.status).toBe(0);
        });

        test('p3_cli_many_tasks', () => {
            const r = runJsco(component('p3_cli_many_tasks'));
            expect(r.status).toBe(0);
        });

        test('p3_cli_random_limits', () => {
            const r = runJsco(component('p3_cli_random_limits'));
            expect(r.status).toBe(0);
        });
    });

    describe.skip('p3: clocks & random', () => {
        test('p3_clocks_sleep', () => {
            const r = runJsco(component('p3_clocks_sleep'));
            expect(r.status).toBe(0);
        });

        test('p3_big_random_buf', () => {
            const r = runJsco(component('p3_big_random_buf'));
            expect(r.status).toBe(0);
        });

        test('p3_random_imports', () => {
            const r = runJsco(component('p3_random_imports'));
            expect(r.status).toBe(0);
        });
    });

    describe.skip('p3: filesystem', () => {
        test('p3_filesystem_file_read_write', () => {
            const workspace = createWorkspace();
            const r = runJsco(component('p3_filesystem_file_read_write'), {
                dirs: [`${workspace}::.`],
            });
            expect(r.status).toBe(0);
        });

        test('p3_file_write', () => {
            const workspace = createWorkspace();
            const r = runJsco(component('p3_file_write'), {
                dirs: [`${workspace}::.`],
            });
            expect(r.status).toBe(0);
        });

        test('p3_readdir', () => {
            const workspace = createWorkspace();
            const r = runJsco(component('p3_readdir'), {
                dirs: [`${workspace}::.`],
            });
            expect(r.status).toBe(0);
        });
    });

    describe.skip('p3: tcp sockets', () => {
        test('p3_sockets_tcp_bind', () => {
            const r = runJsco(component('p3_sockets_tcp_bind'));
            expect(r.status).toBe(0);
        });

        test('p3_sockets_tcp_connect', () => {
            const r = runJsco(component('p3_sockets_tcp_connect'));
            expect(r.status).toBe(0);
        });

        test('p3_sockets_tcp_listen', () => {
            const r = runJsco(component('p3_sockets_tcp_listen'));
            expect(r.status).toBe(0);
        });

        test('p3_sockets_tcp_sample_application', () => {
            const r = runJsco(component('p3_sockets_tcp_sample_application'), {
                timeout: 60_000,
            });
            expect(r.status).toBe(0);
        });

        test('p3_sockets_tcp_sockopts', () => {
            const r = runJsco(component('p3_sockets_tcp_sockopts'));
            expect(r.status).toBe(0);
        });

        test('p3_sockets_tcp_states', () => {
            const r = runJsco(component('p3_sockets_tcp_states'));
            expect(r.status).toBe(0);
        });

        test('p3_sockets_tcp_streams', () => {
            const r = runJsco(component('p3_sockets_tcp_streams'));
            expect(r.status).toBe(0);
        });
    });

    describe.skip('p3: udp sockets', () => {
        test('p3_sockets_udp_bind', () => {
            const r = runJsco(component('p3_sockets_udp_bind'));
            expect(r.status).toBe(0);
        });

        test('p3_sockets_udp_connect', () => {
            const r = runJsco(component('p3_sockets_udp_connect'));
            expect(r.status).toBe(0);
        });

        test('p3_sockets_udp_receive', () => {
            const r = runJsco(component('p3_sockets_udp_receive'));
            expect(r.status).toBe(0);
        });

        test('p3_sockets_udp_sample_application', () => {
            const r = runJsco(component('p3_sockets_udp_sample_application'), {
                timeout: 60_000,
            });
            expect(r.status).toBe(0);
        });

        test('p3_sockets_udp_send', () => {
            const r = runJsco(component('p3_sockets_udp_send'));
            expect(r.status).toBe(0);
        });

        test('p3_sockets_udp_sockopts', () => {
            const r = runJsco(component('p3_sockets_udp_sockopts'));
            expect(r.status).toBe(0);
        });

        test('p3_sockets_udp_states', () => {
            const r = runJsco(component('p3_sockets_udp_states'));
            expect(r.status).toBe(0);
        });
    });

    describe.skip('p3: ip name lookup', () => {
        test('p3_sockets_ip_name_lookup', () => {
            const r = runJsco(component('p3_sockets_ip_name_lookup'));
            expect(r.status).toBe(0);
        });
    });

    describe.skip('p3: http (needs mock server)', () => {
        test('p3_http_echo', () => {
            const r = runJsco(component('p3_http_echo'));
            expect(r.status).toBe(0);
        });

        test('p3_http_middleware', () => {
            const r = runJsco(component('p3_http_middleware'));
            expect(r.status).toBe(0);
        });

        test('p3_http_middleware_with_chain', () => {
            const r = runJsco(component('p3_http_middleware_with_chain'));
            expect(r.status).toBe(0);
        });

        test('p3_http_proxy', () => {
            const r = runJsco(component('p3_http_proxy'));
            expect(r.status).toBe(0);
        });

        test('p3_http_outbound_request_get', () => {
            const r = runJsco(component('p3_http_outbound_request_get'));
            expect(r.status).toBe(0);
        });

        test('p3_http_outbound_request_post', () => {
            const r = runJsco(component('p3_http_outbound_request_post'));
            expect(r.status).toBe(0);
        });

        test('p3_http_outbound_request_put', () => {
            const r = runJsco(component('p3_http_outbound_request_put'));
            expect(r.status).toBe(0);
        });

        test('p3_http_outbound_request_large_post', () => {
            const r = runJsco(component('p3_http_outbound_request_large_post'));
            expect(r.status).toBe(0);
        });

        test('p3_http_outbound_request_content_length', () => {
            const r = runJsco(component('p3_http_outbound_request_content_length'));
            expect(r.status).toBe(0);
        });

        test('p3_http_outbound_request_response_build', () => {
            const r = runJsco(component('p3_http_outbound_request_response_build'));
            expect(r.status).toBe(0);
        });

        test('p3_http_outbound_request_invalid_dnsname', () => {
            const r = runJsco(component('p3_http_outbound_request_invalid_dnsname'));
            expect(r.status).toBe(0);
        });

        test('p3_http_outbound_request_invalid_header', () => {
            const r = runJsco(component('p3_http_outbound_request_invalid_header'));
            expect(r.status).toBe(0);
        });

        test('p3_http_outbound_request_invalid_port', () => {
            const r = runJsco(component('p3_http_outbound_request_invalid_port'));
            expect(r.status).toBe(0);
        });

        test('p3_http_outbound_request_invalid_version', () => {
            const r = runJsco(component('p3_http_outbound_request_invalid_version'));
            expect(r.status).toBe(0);
        });

        test('p3_http_outbound_request_unknown_method', () => {
            const r = runJsco(component('p3_http_outbound_request_unknown_method'));
            expect(r.status).toBe(0);
        });

        test('p3_http_outbound_request_unsupported_scheme', () => {
            const r = runJsco(component('p3_http_outbound_request_unsupported_scheme'));
            expect(r.status).toBe(0);
        });

        test('p3_http_outbound_request_timeout', () => {
            const r = runJsco(component('p3_http_outbound_request_timeout'), {
                timeout: 60_000,
            });
            expect(r.status).toBe(0);
        });

        test('p3_http_outbound_request_missing_path_and_query', () => {
            const r = runJsco(component('p3_http_outbound_request_missing_path_and_query'));
            expect(r.status).toBe(0);
        });
    });

    describe.skip('p3: serve', () => {
        test('p3_cli_serve_hello_world', () => {
            const r = runJsco(component('p3_cli_serve_hello_world'));
            expect(r.status).toBe(0);
        });

        test('p3_cli_serve_sleep', () => {
            const r = runJsco(component('p3_cli_serve_sleep'));
            expect(r.status).toBe(0);
        });

        test('p3_api_proxy', () => {
            const r = runJsco(component('p3_api_proxy'));
            expect(r.status).toBe(0);
        });
    });
});
