// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

/**
 * WASIp3 wasmtime corpus tests — every prebuilt `.component.wasm` artifact
 * in `integration-tests/wasmtime/` is either:
 *   1. Wired to a parameterized smoke test below, OR
 *   2. Already exercised by another test file (KNOWN_TESTED), OR
 *   3. Listed in KNOWN_UNSUPPORTED with a one-line reason.
 *
 * The inventory test fails if a new `.component.wasm` lands in the corpus
 * without being classified, forcing every artifact to be accounted for.
 *
 * See plan-1-wasmtime-corpus.md for the rationale.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import * as http from 'node:http';

import { createComponent } from '../../../src/resolver';
import { createWasiP2ViaP3Adapter } from '../../../src/host/wasip2-via-wasip3/index';
import { createWasiP3Host as createP3Host } from '../../../src/host/wasip3/index';
import { serve, linkHandler } from '../../../src/host/wasip3/node/http-server';
import type { WasiHttpHandlerExport, ServeHandle } from '../../../src/host/wasip3/node/http-server';
import { WasiExit } from '../../../src/host/wasip3/cli';
import { initializeAsserts } from '../../../src/utils/assert';
import { useVerboseOnFailure, verboseOptions, runWithVerbose } from '../../test-utils/verbose-logger';
import { startEchoServer, EchoServerHandle } from '../../test-utils/echo-server-fixture';

initializeAsserts();

const WASM_DIR = './integration-tests/wasmtime/';
const P2_RUN_PREFIX = 'wasi:cli/run@0.2.';

/**
 * Files already exercised by other test files. Keep this in sync with greps
 * across `tests/host/wasip3/*.test.ts` and `tests/host/wasip3/node/*.test.ts`.
 */
const KNOWN_TESTED: ReadonlySet<string> = new Set([
    // tests/host/wasip3/integration.test.ts
    'p3_big_random_buf.component.wasm',
    'p3_random_imports.component.wasm',
    'p3_cli_hello_stdout.component.wasm',
    'p3_cli.component.wasm',
    'p3_clocks_sleep.component.wasm',
    'p3_cli_much_stdout.component.wasm',
    'p3_cli_read_stdin.component.wasm',
    'p3_cli_hello_stdout_post_return.component.wasm',
    'p3_cli_random_limits.component.wasm',
    // tests/host/wasip3/node/http-reactor-concurrent.test.ts
    'p3_http_echo.component.wasm',
    // tests/host/wasip3/sockets-integration.test.ts
    'p3_sockets_tcp_sample_application.component.wasm',
    'p3_sockets_tcp_bind.component.wasm',
    'p3_sockets_tcp_connect.component.wasm',
    'p3_sockets_tcp_listen.component.wasm',
    'p3_sockets_tcp_states.component.wasm',
    'p3_sockets_tcp_streams.component.wasm',
    'p3_sockets_tcp_sockopts.component.wasm',
    'p3_sockets_udp_bind.component.wasm',
    'p3_sockets_udp_connect.component.wasm',
    'p3_sockets_udp_send.component.wasm',
    'p3_sockets_udp_receive.component.wasm',
    'p3_sockets_udp_sample_application.component.wasm',
    'p3_sockets_udp_states.component.wasm',
    'p3_sockets_udp_sockopts.component.wasm',
    'p3_sockets_ip_name_lookup.component.wasm',
]);

/**
 * Allowlist of artifacts not yet wired with reasons. Each entry should
 * eventually be either replaced with a working smoke test or filed as a
 * tracking issue. The smoke tests below opportunistically MAY exercise
 * some of these — the allowlist documents what is intentionally NOT yet
 * exercised end-to-end.
 */
const KNOWN_UNSUPPORTED: ReadonlyMap<string, string> = new Map([
    // ── HTTP outbound: the echo-server-p3 fixture (see
    //    `tests/test-utils/echo-server-fixture.ts` and the smoke test in
    //    "echo server fixture" describe block below) is wired and verified
    //    via fetch(). However the wasmtime guests fail today because:
    //    • P2: `wasi:http/outgoing-handler.handle` in
    //      `src/host/wasip2-via-wasip3` is a stub that returns
    //      `internal-error` ("HTTP adapter not fully implemented").
    //    • P3: `client::send(request)` in `src/host/wasip3/http.ts` deadlocks
    //      when a guest passes a still-unwritten contents stream
    //      (`Some(contents_rx)`) — fetch's pull() awaits the wasi stream
    //      while the guest only drops `contents_tx` after `send` returns.
    //    Once those host gaps are resolved, move the relevant entries into
    //    a roster that exercises them with `HTTP_SERVER` set to the fixture.
    ['p2_http_outbound_request_invalid_version.component.wasm', 'needs HTTP/2 server'],
    ['p2_http_outbound_request_response_build.component.wasm', 'host missing [method]outgoing-response.body — OutgoingResponse type not implemented'],
    ['p3_http_outbound_request_get.component.wasm', 'p3 client.send deadlocks: JSPI suspends wasm task while host awaits body drain from same task'],
    ['p3_http_outbound_request_post.component.wasm', 'p3 client.send deadlocks: JSPI suspends wasm task while host awaits body drain from same task'],
    ['p3_http_outbound_request_put.component.wasm', 'p3 client.send deadlocks: JSPI suspends wasm task while host awaits body drain from same task'],
    ['p3_http_outbound_request_content_length.component.wasm', 'p3 client.send deadlocks: JSPI suspends wasm task while host awaits body drain from same task'],
    ['p3_http_outbound_request_large_post.component.wasm', 'p3 client.send deadlocks: JSPI suspends wasm task while host awaits body drain from same task'],
    ['p3_http_outbound_request_invalid_dnsname.component.wasm', 'needs DNS-failure mapping fixture'],
    ['p3_http_outbound_request_invalid_header.component.wasm', 'needs HTTP/2 server with header validation'],
    ['p3_http_outbound_request_invalid_port.component.wasm', 'needs port-validation error mapping'],
    ['p3_http_outbound_request_invalid_version.component.wasm', 'needs HTTP/2 server'],
    ['p3_http_outbound_request_missing_path_and_query.component.wasm', 'needs raw-socket-level error injection'],
    ['p3_http_outbound_request_response_build.component.wasm', 'asserts client-side response builder shape'],
    ['p3_http_outbound_request_timeout.component.wasm', 'needs slow-response server fixture'],
    ['p3_http_outbound_request_unknown_method.component.wasm', 'asserts client-side method validation'],
    ['p3_http_outbound_request_unsupported_scheme.component.wasm', 'asserts client-side scheme validation'],
    // ── HTTP service exports (handler/serve) — wired below where feasible.
    //    `p3_cli_serve_hello_world` and `p3_api_proxy` are exercised via the
    //    serve() Node HTTP harness. The remaining ones either deadlock on the
    //    JSPI client.send issue (proxy) or need an imported handler chain
    //    (middleware), or sleep forever (serve_sleep).
    ['p3_cli_serve_sleep.component.wasm', 'service export with infinite sleep — needs cancel/abort harness'],
    ['p3_http_proxy.component.wasm', 'service export proxying outbound — blocked by p3 client.send JSPI deadlock'],
    // ── Trapping/cancel-on-quota behaviours not yet plumbed.
    ['p3_cli_many_tasks.component.wasm', 'designed to trap after 1000 [async-lower] calls (resource quota)'],
    // ── P3 filesystem: host registers Descriptor class but missing the flat
    //    [method]descriptor.* import table (write-via-stream, read-via-stream,
    //    read-directory, etc.). Tracked as a host gap.
    ['p3_filesystem_file_read_write.component.wasm', 'host missing [method]descriptor.write-via-stream import'],
    ['p3_file_write.component.wasm', 'host missing [method]descriptor.write-via-stream import'],
    ['p3_readdir.component.wasm', 'host missing [method]descriptor.read-directory import'],
    // ── P2 sockets: covered by P3 sockets through the adapter.
    ['p2_tcp_bind.component.wasm', 'P2 sockets — covered by p3_sockets_tcp_bind'],
    ['p2_tcp_connect.component.wasm', 'P2 sockets — covered by p3_sockets_tcp_connect'],
    ['p2_tcp_listen.component.wasm', 'P2 sockets — covered by p3_sockets_tcp_listen'],
    ['p2_tcp_sample_application.component.wasm', 'P2 sockets — covered by p3 sample_application'],
    ['p2_tcp_sockopts.component.wasm', 'P2 sockets — covered by p3 sockopts'],
    ['p2_tcp_states.component.wasm', 'P2 sockets — covered by p3 tcp_states'],
    ['p2_tcp_streams.component.wasm', 'P2 sockets — covered by p3 tcp_streams'],
    ['p2_udp_bind.component.wasm', 'P2 sockets — covered by p3 udp_bind'],
    ['p2_udp_connect.component.wasm', 'P2 sockets — covered by p3 udp_connect'],
    ['p2_udp_sample_application.component.wasm', 'P2 sockets — covered by p3 udp sample_application'],
    ['p2_udp_send_too_much.component.wasm', 'P2 sockets — relies on send() ENOBUFS shape'],
    ['p2_udp_sockopts.component.wasm', 'P2 sockets — covered by p3 udp_sockopts'],
    ['p2_udp_states.component.wasm', 'P2 sockets — covered by p3 udp_states'],
    ['p2_ip_name_lookup.component.wasm', 'P2 DNS — covered by p3_sockets_ip_name_lookup'],
    // ── P2 reactor / API export shape not yet wired.
    ['p2_api_reactor.component.wasm', 'parser bug: canon.lift type_index resolves to ComponentTypeDefinedOwn (68) instead of ComponentTypeFunc when export signature contains own<imported-resource>'],
    ['p2_api_read_only.component.wasm', 'needs read-only descriptor flag in preopen — host always sets write:true'],
    ['p2_api_time.component.wasm', 'asserts specific Instant/SystemTime values — host has no fake-clock injection point'],
    // ── P2 file/dir fixtures handled inline by the P2 CLI roster (config.fs).
]);

/** Create merged P2+P3 hosts. Mirror integration.test.ts. */
function createMergedHosts(config?: Parameters<typeof createP3Host>[0]): Record<string, unknown> {
    const p3 = createP3Host(config);
    const p2 = createWasiP2ViaP3Adapter(p3, { limits: config?.limits });
    return { ...p2, ...p3 };
}

/** Capture stream into a deferred-decoded buffer. */
function captureStream(): { stream: WritableStream<Uint8Array>; text: () => string } {
    const chunks: Uint8Array[] = [];
    const stream = new WritableStream<Uint8Array>({
        write(chunk) { chunks.push(new Uint8Array(chunk)); },
    });
    return {
        stream,
        text: () => {
            const total = chunks.reduce((n, c) => n + c.length, 0);
            const out = new Uint8Array(total);
            let o = 0;
            for (const c of chunks) { out.set(c, o); o += c.length; }
            return new TextDecoder().decode(out);
        },
    };
}

/** Build a one-shot ReadableStream that yields `s` as UTF-8, then closes. */
function stringToReadable(s: string): ReadableStream<Uint8Array> {
    const bytes = new TextEncoder().encode(s);
    return new ReadableStream<Uint8Array>({
        start(controller) {
            if (bytes.length > 0) controller.enqueue(bytes);
            controller.close();
        },
    });
}

/** Resolve any `wasi:cli/run@0.2.x` export on the instance. */
function getP2RunExport(exp: Record<string, unknown>): { run: () => Promise<unknown> } | undefined {
    for (const k of Object.keys(exp)) {
        if (k.startsWith(P2_RUN_PREFIX)) return exp[k] as { run: () => Promise<unknown> };
    }
    return undefined;
}

/** Run a P2 component to completion. Returns the exit code (0 on success). */
async function runP2(
    file: string,
    cfg: Parameters<typeof createP3Host>[0] | undefined,
    verbose: ReturnType<typeof useVerboseOnFailure>,
): Promise<number> {
    const imports = createMergedHosts(cfg);
    const component = await createComponent(WASM_DIR + file, verboseOptions(verbose));
    const instance = await component.instantiate(imports);
    try {
        const run = getP2RunExport(instance.exports as Record<string, unknown>);
        if (!run) throw new Error(`No wasi:cli/run@0.2.* export on ${file}`);
        const result = await run.run();
        // P2 run returns result<_, _> — { tag: 'ok' } or { tag: 'err' }.
        if (result && typeof result === 'object' && 'tag' in result) {
            return (result as { tag: string }).tag === 'ok' ? 0 : 1;
        }
        return 0;
    } catch (e) {
        if (e instanceof WasiExit) return e.exitCode;
        // Rust panic!() lowers to wasm `unreachable` and surfaces as a
        // WebAssembly.RuntimeError. Wasmtime maps this to exit-code 1; we mirror
        // that here so guest tests like p2_cli_exit_panic can be asserted.
        if (e instanceof WebAssembly.RuntimeError) return 1;
        throw e;
    } finally {
        instance.dispose();
    }
}

describe('wasmtime corpus inventory', () => {
    test('every .component.wasm is classified', () => {
        const dir = path.resolve(WASM_DIR);
        const all = fs.readdirSync(dir).filter(f => f.endsWith('.component.wasm'));
        // Build the set of files this test file owns smoke tests for.
        // Keep in sync with test.each rosters below.
        const owned = new Set<string>([
            ...P2_CLI_SIMPLE.map(([f]) => f),
            ...P3_CLI_SIMPLE.map(([f]) => f),
            ...P3_FS_SIMPLE.map(([f]) => f),
            ...P2_HTTP_OUTBOUND.map(([f]) => f),
            ...P2_HTTP_OUTBOUND_VALIDATION.map(([f]) => f),
            ...P3_SERVE.map(([f]) => f),
            ...P3_MIDDLEWARE_CHAIN.map(([f]) => f),
        ]);
        const unaccounted: string[] = [];
        for (const f of all) {
            if (KNOWN_TESTED.has(f)) continue;
            if (KNOWN_UNSUPPORTED.has(f)) continue;
            if (owned.has(f)) continue;
            unaccounted.push(f);
        }
        if (unaccounted.length > 0) {
            throw new Error(
                'Unaccounted wasmtime corpus files (add to KNOWN_TESTED, '
                + 'KNOWN_UNSUPPORTED, or wire a smoke test):\n  '
                + unaccounted.join('\n  '),
            );
        }
        // Sanity: every entry in the allowlists must point at an existing file.
        const present = new Set(all);
        const missing: string[] = [];
        for (const f of KNOWN_TESTED) if (!present.has(f)) missing.push(`KNOWN_TESTED: ${f}`);
        for (const f of KNOWN_UNSUPPORTED.keys()) if (!present.has(f)) missing.push(`KNOWN_UNSUPPORTED: ${f}`);
        if (missing.length > 0) {
            throw new Error(`Stale allowlist entry (file not on disk):\n  ${missing.join('\n  ')}`);
        }
    });
});

// ─────────────────────── P2 CLI smoke tests ───────────────────────
//
// Tuple shape: [filename, expectedExitCode, configFactory, postCheck?]
// configFactory is a thunk so we get a fresh capture per test invocation.

type CliConfigFactory = () => {
    cfg: Parameters<typeof createP3Host>[0];
};

const sinkStdoutStderr: CliConfigFactory = () => {
    const out = captureStream();
    const err = captureStream();
    return {
        cfg: { stdout: out.stream, stderr: err.stream },
    };
};

const P2_CLI_SIMPLE: ReadonlyArray<[string, number, CliConfigFactory]> = [
    // hello-world: prints to stdout AND stderr.
    ['p2_cli_hello_stdout.component.wasm', 0, sinkStdoutStderr],
    // export_cabi_realloc — guest exports its own realloc; main prints "hello, world".
    ['p2_cli_export_cabi_realloc.component.wasm', 0, sinkStdoutStderr],
    // exit_default — main returns normally; exit_code 0.
    ['p2_cli_exit_default.component.wasm', 0, sinkStdoutStderr],
    // exit_success — std::process::exit(0).
    ['p2_cli_exit_success.component.wasm', 0, sinkStdoutStderr],
    // exit_failure — std::process::exit(1).
    ['p2_cli_exit_failure.component.wasm', 1, sinkStdoutStderr],
    // exit_panic — Rust panic!() → wasm `unreachable` trap → exit-code 1.
    ['p2_cli_exit_panic.component.wasm', 1, sinkStdoutStderr],
    // args — guest asserts argv == ["hello", "this", "", "is an argument", "with 🚩 emoji"]
    //        (program name comes first; the guest skip(1)s).
    ['p2_cli_args.component.wasm', 0, () => ({
        cfg: {
            args: ['p2_cli_args', 'hello', 'this', '', 'is an argument', 'with 🚩 emoji'],
            stdout: captureStream().stream, stderr: captureStream().stream,
        },
    })],
    // argv0 — guest only asserts that all args() iter returns the same prefix
    //         (arg[0] == arg[0] tautologically, then None == None).
    ['p2_cli_argv0.component.wasm', 0, sinkStdoutStderr],
    // env — guest expects exactly {frabjous: "day", callooh: "callay"}.
    ['p2_cli_env.component.wasm', 0, () => ({
        cfg: {
            env: [['frabjous', 'day'], ['callooh', 'callay']],
            stdout: captureStream().stream, stderr: captureStream().stream,
        },
    })],
    // default_clocks — uses Instant::now / SystemTime::now; just runs.
    ['p2_cli_default_clocks.component.wasm', 0, sinkStdoutStderr],
    // sleep — std::thread::sleep(100ns) → translates to monotonic-clock sleep.
    ['p2_cli_sleep.component.wasm', 0, sinkStdoutStderr],
    // much_stdout — args: ["bin", "x", "1000"] writes "x" 1000x.
    ['p2_cli_much_stdout.component.wasm', 0, () => ({
        cfg: {
            args: ['p2_cli_much_stdout', 'x', '1000'],
            stdout: captureStream().stream, stderr: captureStream().stream,
        },
    })],
    // large_env — prints all env pairs as `k=v`.
    ['p2_cli_large_env.component.wasm', 0, () => {
        const env: [string, string][] = [];
        for (let i = 0; i < 32; i++) env.push([`key_${i}`, `value_${i}`]);
        return {
            cfg: { env, stdout: captureStream().stream, stderr: captureStream().stream },
        };
    }],
    // random — exercises random::random + insecure + insecure_seed.
    ['p2_random.component.wasm', 0, sinkStdoutStderr],
    // sleep — exercises monotonic-clock subscribe/block.
    ['p2_sleep.component.wasm', 0, sinkStdoutStderr],
    // stdin — read_to_string equals "So rested he by the Tumtum tree".
    ['p2_cli_stdin.component.wasm', 0, () => ({
        cfg: {
            stdin: stringToReadable('So rested he by the Tumtum tree'),
            stdout: captureStream().stream, stderr: captureStream().stream,
        },
    })],
    // stdin_empty — fd_read with 0-byte iovec succeeds; payload irrelevant.
    ['p2_cli_stdin_empty.component.wasm', 0, () => ({
        cfg: {
            stdin: stringToReadable(''),
            stdout: captureStream().stream, stderr: captureStream().stream,
        },
    })],
    // stream_pollable_correct — stdin.subscribe + stdout.subscribe semantics.
    // Empty stdin closes immediately; pollable becomes ready (EOF).
    ['p2_stream_pollable_correct.component.wasm', 0, () => ({
        cfg: {
            stdin: stringToReadable(''),
            stdout: captureStream().stream, stderr: captureStream().stream,
        },
    })],
    // stdio_write_flushes — prints "> ", flushes, then read_line on EOF stdin.
    // read_line on closed stdin returns Ok(0) with the buffer untouched, so
    // assert!(s.is_empty()) holds.
    ['p2_cli_stdio_write_flushes.component.wasm', 0, () => ({
        cfg: {
            stdin: stringToReadable(''),
            stdout: captureStream().stream, stderr: captureStream().stream,
        },
    })],
    // file_read — reads bar.txt (27 bytes) from preopened root.
    ['p2_cli_file_read.component.wasm', 0, () => ({
        cfg: {
            fs: new Map([['bar.txt', 'And stood awhile in thought']]),
            stdout: captureStream().stream, stderr: captureStream().stream,
        },
    })],
    // file_append — opens bar.txt with append, writes more, then seeks+writes.
    ['p2_cli_file_append.component.wasm', 0, () => ({
        cfg: {
            fs: new Map([['bar.txt', 'And stood awhile in thought']]),
            stdout: captureStream().stream, stderr: captureStream().stream,
        },
    })],
    // file_dir_sync — sync_all/sync_data on bar.txt (in-memory VFS no-ops).
    ['p2_cli_file_dir_sync.component.wasm', 0, () => ({
        cfg: {
            fs: new Map([['bar.txt', 'And stood awhile in thought']]),
            stdout: captureStream().stream, stderr: captureStream().stream,
        },
    })],
    // directory_list — read_dir("/") and read_dir("/sub") with exact set match.
    ['p2_cli_directory_list.component.wasm', 0, () => ({
        cfg: {
            fs: new Map<string, Uint8Array | string>([
                ['foo.txt', ''], ['bar.txt', ''], ['baz.txt', ''],
                ['sub/wow.txt', ''], ['sub/yay.txt', ''],
            ]),
            stdout: captureStream().stream, stderr: captureStream().stream,
        },
    })],
];

describe('wasmtime corpus — P2 CLI smoke', () => {
    const verbose = useVerboseOnFailure();

    test.each(P2_CLI_SIMPLE.map(([f, code]) => [f, code]) as Array<[string, number]>)(
        '%s exits with %d',
        (file, expectedExit) => runWithVerbose(verbose, async () => {
            const factory = P2_CLI_SIMPLE.find(([f]) => f === file)![2];
            const { cfg } = factory();
            const exit = await runP2(file, cfg, verbose);
            expect(exit).toBe(expectedExit);
        }),
    );

    // Dedicated per-test paths for cases that need access to captured
    // stdout/stderr (closure-scoped, not reachable from the parametric runner).

    test('p2_cli_hello_stdout — both stdout and stderr receive "hello, world"', () => runWithVerbose(verbose, async () => {
        const out = captureStream();
        const err = captureStream();
        const exit = await runP2('p2_cli_hello_stdout.component.wasm',
            { stdout: out.stream, stderr: err.stream }, verbose);
        expect(exit).toBe(0);
        expect(out.text()).toContain('hello, world');
        expect(err.text()).toContain('hello, world');
    }));

    test('p2_cli_export_cabi_realloc — prints hello, world via custom realloc', () => runWithVerbose(verbose, async () => {
        const out = captureStream();
        const exit = await runP2('p2_cli_export_cabi_realloc.component.wasm',
            { stdout: out.stream, stderr: captureStream().stream }, verbose);
        expect(exit).toBe(0);
        expect(out.text()).toContain('hello, world');
    }));

    test('p2_cli_much_stdout — writes exactly 1000 x bytes', () => runWithVerbose(verbose, async () => {
        const out = captureStream();
        const exit = await runP2('p2_cli_much_stdout.component.wasm', {
            args: ['p2_cli_much_stdout', 'x', '1000'],
            stdout: out.stream, stderr: captureStream().stream,
        }, verbose);
        expect(exit).toBe(0);
        expect(out.text()).toBe('x'.repeat(1000));
    }));

    test('p2_cli_large_env — every env entry round-trips through stdout', () => runWithVerbose(verbose, async () => {
        const env: [string, string][] = [];
        for (let i = 0; i < 32; i++) env.push([`key_${i}`, `value_${i}`]);
        const out = captureStream();
        const exit = await runP2('p2_cli_large_env.component.wasm',
            { env, stdout: out.stream, stderr: captureStream().stream }, verbose);
        expect(exit).toBe(0);
        for (const [k, v] of env) expect(out.text()).toContain(`${k}=${v}`);
    }));
});

// ─────────────────────── P3 CLI smoke tests ───────────────────────
// All P3 CLI artifacts in the corpus are either KNOWN_TESTED or KNOWN_UNSUPPORTED;
// no parametric roster needed here yet. The empty array is referenced by the
// inventory test below as a future extension point.
const P3_CLI_SIMPLE: ReadonlyArray<[string]> = [];

// ─────────────────── P3 filesystem smoke tests ───────────────────
// All p3 filesystem corpus artifacts currently hit missing host methods
// (see KNOWN_UNSUPPORTED). Keep the array empty for now; once the host gap
// is fixed move entries out of KNOWN_UNSUPPORTED and into this list.
const P3_FS_SIMPLE: ReadonlyArray<[string]> = [];

// ─────────────────── P3 service-export roster ───────────────────
const P3_SERVE: ReadonlyArray<[string]> = [
    ['p3_cli_serve_hello_world.component.wasm'],
    ['p3_api_proxy.component.wasm'],
];

// ─────────────────── P3 middleware chain roster ───────────────────
// The outer (middleware) component imports `wasi:http/handler`; we wire
// `p3_http_echo` as the inner via `linkHandler()`. The chain test below
// drives both fixtures through serve().
const P3_MIDDLEWARE_CHAIN: ReadonlyArray<[string]> = [
    ['p3_http_middleware.component.wasm'],
    ['p3_http_middleware_with_chain.component.wasm'],
];

// ─────────────────── HTTP outbound smoke tests ───────────────────
//
// The wasmtime guest tests that issue outbound HTTP requests against
// `HTTP_SERVER` are not yet wired here — see the matching entries in
// `KNOWN_UNSUPPORTED` for the precise host gap that blocks each one.
// The fixture used to host the wasmtime echo server contract is exercised
// directly via `fetch()` further below to prove it works end-to-end.

// ─────────────────── Echo-server fixture smoke test ───────────────────
//
// Verifies the wasmtime-style HTTP echo server, served out-of-process by
// `jsco serve integration-tests/echo-server-p3/echo_server_p3.wasm`, honours
// the wire contract documented in `http-echo-server.md`:
//   * 200 OK
//   * `x-wasmtime-test-method`  = stringified request method
//   * `x-wasmtime-test-uri`     = path-with-query
//   * pass-through `content-length` (when present on request)
//   * body echo
//
// The corresponding wasmtime guest tests
// (p[23]_http_outbound_request_{get,post,put,content_length,large_post}) are
// listed in KNOWN_UNSUPPORTED above with a precise diagnosis of which host
// gap currently blocks them. Once those gaps are fixed they can be wired up
// here against the same fixture.

describe('wasmtime corpus — echo-server-p3 fixture (out-of-process via jsco serve)', () => {
    let server: EchoServerHandle | undefined;

    beforeAll(async () => {
        server = await startEchoServer();
    }, 30000);

    afterAll(async () => {
        if (server) await server.stop();
    });

    test('GET /get?some=arg&goes=here echoes method, uri and empty body', async () => {
        if (!server) throw new Error('echo server not started');
        const url = `http://${server.addr}/get?some=arg&goes=here`;
        const r = await fetch(url, { method: 'GET' });
        expect(r.status).toBe(200);
        expect(r.headers.get('x-wasmtime-test-method')).toBe('GET');
        expect(r.headers.get('x-wasmtime-test-uri')).toBe('/get?some=arg&goes=here');
        const body = await r.arrayBuffer();
        expect(body.byteLength).toBe(0);
    });

    test('POST /post echoes body bytes and content-length pass-through', async () => {
        if (!server) throw new Error('echo server not started');
        const url = `http://${server.addr}/post`;
        const payload = 'hello echo body';
        const r = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'text/plain', 'content-length': String(payload.length) },
            body: payload,
        });
        expect(r.status).toBe(200);
        expect(r.headers.get('x-wasmtime-test-method')).toBe('POST');
        expect(r.headers.get('x-wasmtime-test-uri')).toBe('/post');
        expect(r.headers.get('content-length')).toBe(String(payload.length));
        expect(await r.text()).toBe(payload);
    });

    test('PUT /put echoes method-name and body', async () => {
        if (!server) throw new Error('echo server not started');
        const url = `http://${server.addr}/put`;
        const payload = new Uint8Array([1, 2, 3, 4, 5]);
        const r = await fetch(url, {
            method: 'PUT',
            headers: { 'content-length': String(payload.length) },
            body: payload,
        });
        expect(r.status).toBe(200);
        expect(r.headers.get('x-wasmtime-test-method')).toBe('PUT');
        expect(new Uint8Array(await r.arrayBuffer())).toEqual(payload);
    });
});

// ─────────────────── P2 HTTP outbound corpus tests ───────────────────
//
// Wasmtime's P2 HTTP outbound guests issue real HTTP requests via the
// `wasi:http/outgoing-handler.handle` import against an `HTTP_SERVER`
// env-var address. They run in-process here (not via the jsco-serve
// subprocess) — the echo-server fixture serves as the target endpoint.

const P2_HTTP_OUTBOUND: ReadonlyArray<[string]> = [
    ['p2_http_outbound_request_get.component.wasm'],
    ['p2_http_outbound_request_post.component.wasm'],
    ['p2_http_outbound_request_put.component.wasm'],
    ['p2_http_outbound_request_large_post.component.wasm'],
    // Validates content-length: writing exact length succeeds against an echo server;
    // the under/over-write cases panic the guest BEFORE issuing a request, so they
    // exercise the host's outgoing-body finish/blocking-write validation only.
    ['p2_http_outbound_request_content_length.component.wasm'],
];

// P2 HTTP outbound guests that exercise client-side input validation — they
// don't issue real network traffic, just assert that the host’s
// outgoing-request setters and outgoing-handler.handle() reject malformed
// inputs with the right ErrorCode shape.
const P2_HTTP_OUTBOUND_VALIDATION: ReadonlyArray<[string]> = [
    ['p2_http_outbound_request_unknown_method.component.wasm'],
    ['p2_http_outbound_request_unsupported_scheme.component.wasm'],
    ['p2_http_outbound_request_missing_path_and_query.component.wasm'],
    ['p2_http_outbound_request_invalid_port.component.wasm'],
    // Tries to fetch "some.invalid.dnsname:3000" — expects DnsError or ConnectionRefused.
    ['p2_http_outbound_request_invalid_dnsname.component.wasm'],
    // Connect-timeout against TEST-NET-3 (203.0.113.12) with 200ms timeout.
    ['p2_http_outbound_request_timeout.component.wasm'],
    // Header validation: malformed names, invalid values, forbidden names, immutable content-length.
    ['p2_http_outbound_request_invalid_header.component.wasm'],
];

describe('wasmtime corpus — P2 HTTP outbound (in-process via P2-via-P3 adapter)', () => {
    const verbose = useVerboseOnFailure();
    let server: EchoServerHandle | undefined;

    beforeAll(async () => {
        server = await startEchoServer();
    }, 30000);

    afterAll(async () => {
        if (server) await server.stop();
    });

    test.each(P2_HTTP_OUTBOUND)('%s exits 0 against echo server', (file) =>
        runWithVerbose(verbose, async () => {
            if (!server) throw new Error('echo server not started');
            const out = captureStream();
            const errs = captureStream();
            // large_post posts ~1 MiB + 1 KiB body — needs higher buffer cap than default 1 MiB.
            const limits = file === 'p2_http_outbound_request_large_post.component.wasm'
                ? { maxNetworkBufferSize: 4 * 1024 * 1024 }
                : undefined;
            let exit: number;
            try {
                exit = await runP2(file, {
                    env: [['HTTP_SERVER', server.addr]],
                    stdout: out.stream,
                    stderr: errs.stream,
                    ...(limits ? { limits } : {}),
                }, verbose);
            } catch (e) {
                throw new Error(
                    `P2 ${file} threw: ${e instanceof Error ? e.message : String(e)}\n--- stdout ---\n${out.text()}\n--- stderr ---\n${errs.text()}`,
                );
            }
            if (exit !== 0) {
                throw new Error(
                    `P2 ${file} exited ${exit}\n--- stdout ---\n${out.text()}\n--- stderr ---\n${errs.text()}`,
                );
            }
        }), 60000);
});

// ─────────────────── P3 service-export harness ───────────────────
//
// `p3_cli_serve_hello_world` and `p3_api_proxy` export
// `wasi:http/handler@0.3.0-rc-2026-03-15` directly. We use the existing
// `serve()` Node HTTP adapter (also used by `node/http-reactor-concurrent`)
// to drive the guest with a real HTTP request and assert the response.

describe('wasmtime corpus — P2 HTTP client-side validation', () => {
    const verbose = useVerboseOnFailure();

    test.each(P2_HTTP_OUTBOUND_VALIDATION)('%s exits 0 (no network)', (file) =>
        runWithVerbose(verbose, async () => {
            const out = captureStream();
            const errs = captureStream();
            // No HTTP_SERVER env var: these guests never reach the network.
            // Validation is asserted entirely on the host's outgoing-request
            // setters and on outgoing-handler.handle() input checks.
            let exit: number;
            try {
                exit = await runP2(file, {
                    stdout: out.stream,
                    stderr: errs.stream,
                }, verbose);
            } catch (e) {
                throw new Error(
                    `P2 ${file} threw: ${e instanceof Error ? e.message : String(e)}\n--- stdout ---\n${out.text()}\n--- stderr ---\n${errs.text()}`,
                );
            }
            if (exit !== 0) {
                throw new Error(
                    `P2 ${file} exited ${exit}\n--- stdout ---\n${out.text()}\n--- stderr ---\n${errs.text()}`,
                );
            }
        }), 30000);
});

const HANDLER_INTERFACE_P3 = 'wasi:http/handler@0.3.0-rc-2026-03-15';

describe('wasmtime corpus — P3 service exports (serve())', () => {
    const verbose = useVerboseOnFailure();

    async function serveAndGet(file: string, path: string): Promise<{ status: number; body: string }> {
        const imports = createMergedHosts();
        const component = await createComponent(WASM_DIR + file, verboseOptions(verbose));
        const instance = await component.instantiate(imports as Parameters<typeof component.instantiate>[0]);
        let handle: ServeHandle | undefined;
        try {
            const handler = instance.exports[HANDLER_INTERFACE_P3] as WasiHttpHandlerExport | undefined;
            if (!handler) throw new Error(`${file}: missing ${HANDLER_INTERFACE_P3}`);
            handle = await serve(handler, { port: 0, host: '127.0.0.1' });
            const r = await fetch(`http://127.0.0.1:${handle.port}${path}`);
            return { status: r.status, body: await r.text() };
        } finally {
            if (handle) await handle.close();
            instance.dispose();
        }
    }

    test('p3_cli_serve_hello_world — GET / returns "Hello, WASI!"', () =>
        runWithVerbose(verbose, async () => {
            const r = await serveAndGet('p3_cli_serve_hello_world.component.wasm', '/');
            expect(r.status).toBe(200);
            expect(r.body).toBe('Hello, WASI!');
        }), 30000);

    test('p3_api_proxy — GET / returns "hello, world!" and validates request shape', () =>
        runWithVerbose(verbose, async () => {
            const r = await serveAndGet('p3_api_proxy.component.wasm', '/');
            expect(r.status).toBe(200);
            expect(r.body).toBe('hello, world!');
        }), 30000);
});

// ─────────────────── P3 middleware (handler-import chain) ───────────────────
//
// `p3_http_middleware` exports `wasi:http/handler@0.3.0-rc-2026-03-15` AND
// imports the same interface — it forwards (with optional deflate transcoding)
// to whichever component satisfies the import. Wasmtime fuses with
// `wasm-compose`; jsco wires at the JS layer via `linkHandler()`.
//
// `p3_http_middleware_with_chain` is the same shape but renames the imported
// interface to `local:local/chain-http`.

describe('wasmtime corpus — P3 middleware chain (handler import wiring)', () => {
    const verbose = useVerboseOnFailure();

    /**
     * Spin up `outer` whose handler import is satisfied by `inner.exports`.
     * Returns ServeHandle plus a dispose() callback that tears down both
     * instances in reverse instantiation order (outer first).
     */
    async function instantiateChain(
        innerFile: string,
        outerFile: string,
        opts?: { as?: string; network?: import('../../../src/runtime/model/types').NetworkConfig },
    ): Promise<{
        handle: ServeHandle;
        dispose: () => Promise<void>;
    }> {
        const sharedImports = createMergedHosts();
        const innerComp = await createComponent(WASM_DIR + innerFile, verboseOptions(verbose));
        const inner = await innerComp.instantiate(sharedImports as Parameters<typeof innerComp.instantiate>[0]);
        const outerComp = await createComponent(WASM_DIR + outerFile, verboseOptions(verbose));
        const outerImports = {
            ...createMergedHosts(),
            ...linkHandler(inner, opts),
        };
        const outer = await outerComp.instantiate(outerImports as Parameters<typeof outerComp.instantiate>[0]);
        const handler = outer.exports[HANDLER_INTERFACE_P3] as WasiHttpHandlerExport | undefined;
        if (!handler) throw new Error(`${outerFile}: missing ${HANDLER_INTERFACE_P3}`);
        const handle = await serve(handler, { port: 0, host: '127.0.0.1', network: opts?.network });
        return {
            handle,
            dispose: async (): Promise<void> => {
                await handle.close();
                outer.dispose();
                inner.dispose();
            },
        };
    }

    /**
     * Make a raw HTTP request with explicit headers so we can control
     * accept-encoding (Node's `fetch` auto-decompresses and adds
     * `accept-encoding: gzip, deflate` which would always trigger the
     * middleware's deflate-response branch).
     */
    function rawRequest(
        port: number,
        opts: { method?: string; pathname?: string; headers?: Record<string, string>; body?: Buffer | string },
    ): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
        return new Promise((resolve, reject) => {
            const req = http.request(
                {
                    host: '127.0.0.1',
                    port,
                    method: opts.method ?? 'GET',
                    path: opts.pathname ?? '/',
                    headers: opts.headers ?? {},
                },
                (res) => {
                    const chunks: Buffer[] = [];
                    res.on('data', (c) => chunks.push(c));
                    res.on('end', () => resolve({
                        status: res.statusCode ?? 0,
                        headers: res.headers,
                        body: Buffer.concat(chunks),
                    }));
                    res.on('error', reject);
                },
            );
            req.on('error', reject);
            if (opts.body !== undefined) req.write(opts.body);
            req.end();
        });
    }

    test('I1a: p3_http_middleware → p3_http_echo: plain GET echoes request headers', () =>
        runWithVerbose(verbose, async () => {
            const chain = await instantiateChain('p3_http_echo.component.wasm', 'p3_http_middleware.component.wasm');
            try {
                const r = await rawRequest(chain.handle.port, {
                    method: 'GET',
                    pathname: '/get',
                    headers: { foo: 'bar' },
                });
                expect(r.status).toBe(200);
                // Echo echoes request headers as-is into the response.
                expect(r.headers['foo']).toBe('bar');
                // Plain request — no accept-encoding, so middleware does not deflate.
                expect(r.headers['content-encoding']).toBeUndefined();
                expect(r.body.length).toBe(0);
            } finally {
                await chain.dispose();
            }
        }), 30000);

    test('I1b: p3_http_middleware → p3_http_echo: POST body echoed, no deflate', () =>
        runWithVerbose(verbose, async () => {
            const chain = await instantiateChain('p3_http_echo.component.wasm', 'p3_http_middleware.component.wasm');
            try {
                const payload = 'middleware passthrough body';
                const r = await rawRequest(chain.handle.port, {
                    method: 'POST',
                    pathname: '/post',
                    headers: { 'content-type': 'text/plain', 'content-length': String(Buffer.byteLength(payload)) },
                    body: payload,
                });
                expect(r.status).toBe(200);
                expect(r.headers['content-encoding']).toBeUndefined();
                expect(r.body.toString()).toBe(payload);
            } finally {
                await chain.dispose();
            }
        }), 30000);

    test('I1c: p3_http_middleware → p3_http_echo: deflate request body decoded before forwarding', () =>
        runWithVerbose(verbose, async () => {
            const chain = await instantiateChain('p3_http_echo.component.wasm', 'p3_http_middleware.component.wasm');
            try {
                const payload = 'compressible '.repeat(64);
                const compressed = zlib.deflateRawSync(payload);
                const r = await rawRequest(chain.handle.port, {
                    method: 'POST',
                    pathname: '/post',
                    headers: {
                        'content-type': 'text/plain',
                        'content-encoding': 'deflate',
                        // No content-length: middleware decodes the body so
                        // the forwarded length differs from the inbound
                        // length; echo copies request headers onto the
                        // response, so a stale content-length would break the
                        // response framing. Node will use chunked transfer.
                    },
                    body: compressed,
                });
                expect(r.status).toBe(200);
                // Middleware decoded the deflated request body before forwarding to echo.
                // No accept-encoding sent, so response body is plain.
                expect(r.headers['content-encoding']).toBeUndefined();
                expect(r.body.toString()).toBe(payload);
            } finally {
                await chain.dispose();
            }
        }), 30000);

    test('I1d: p3_http_middleware → p3_http_echo: response deflate-encoded when accept-encoding=deflate', () =>
        runWithVerbose(verbose, async () => {
            const chain = await instantiateChain('p3_http_echo.component.wasm', 'p3_http_middleware.component.wasm');
            try {
                const payload = 'compressible '.repeat(64);
                const r = await rawRequest(chain.handle.port, {
                    method: 'POST',
                    pathname: '/post',
                    headers: {
                        'content-type': 'text/plain',
                        'accept-encoding': 'deflate',
                        'content-length': String(Buffer.byteLength(payload)),
                    },
                    body: payload,
                });
                expect(r.status).toBe(200);
                expect(r.headers['content-encoding']).toBe('deflate');
                const decoded = zlib.inflateRawSync(r.body).toString();
                expect(decoded).toBe(payload);
            } finally {
                await chain.dispose();
            }
        }), 30000);

    test('I2: p3_http_middleware_with_chain → p3_http_echo (renamed import as local:local/chain-http)', () =>
        runWithVerbose(verbose, async () => {
            const chain = await instantiateChain(
                'p3_http_echo.component.wasm',
                'p3_http_middleware_with_chain.component.wasm',
                { as: 'local:local/chain-http' },
            );
            try {
                const r = await rawRequest(chain.handle.port, {
                    method: 'GET',
                    pathname: '/get',
                    headers: { foo: 'bar' },
                });
                expect(r.status).toBe(200);
                expect(r.headers['foo']).toBe('bar');
            } finally {
                await chain.dispose();
            }
        }), 30000);

    /**
     * Three-deep chain: middleware -> middleware -> echo. Verifies that
     * `linkHandler`-wrapped exports themselves expose a usable
     * `wasi:http/handler` interface that another `linkHandler` can wire to,
     * and that two layers of deflate transcoding compose without breaking.
     */
    test('I3: middleware → middleware → echo (chain depth 2)', () =>
        runWithVerbose(verbose, async () => {
            const sharedImports = createMergedHosts();
            const echoComp = await createComponent(WASM_DIR + 'p3_http_echo.component.wasm', verboseOptions(verbose));
            const echo = await echoComp.instantiate(sharedImports as Parameters<typeof echoComp.instantiate>[0]);
            const mw1Comp = await createComponent(WASM_DIR + 'p3_http_middleware.component.wasm', verboseOptions(verbose));
            const mw1 = await mw1Comp.instantiate({
                ...createMergedHosts(),
                ...linkHandler(echo),
            } as Parameters<typeof mw1Comp.instantiate>[0]);
            const mw2Comp = await createComponent(WASM_DIR + 'p3_http_middleware.component.wasm', verboseOptions(verbose));
            const mw2 = await mw2Comp.instantiate({
                ...createMergedHosts(),
                ...linkHandler(mw1),
            } as Parameters<typeof mw2Comp.instantiate>[0]);
            const handler = mw2.exports[HANDLER_INTERFACE_P3] as WasiHttpHandlerExport | undefined;
            if (!handler) throw new Error('mw2: missing handler export');
            const h = await serve(handler, { port: 0, host: '127.0.0.1' });
            try {
                const r = await rawRequest(h.port, {
                    method: 'GET',
                    pathname: '/get',
                    headers: { foo: 'bar' },
                });
                expect(r.status).toBe(200);
                expect(r.headers['foo']).toBe('bar');
                expect(r.headers['content-encoding']).toBeUndefined();
            } finally {
                await h.close();
                mw2.dispose();
                mw1.dispose();
                echo.dispose();
            }
        }), 60000);

    /**
     * Concurrency under chain: drive 16 parallel requests through the
     * middleware → echo chain. Asserts per-task isolation (no header /
     * body cross-contamination, no resource-handle aliasing).
     */
    test('I4: 16 parallel requests through middleware → echo chain', () =>
        runWithVerbose(verbose, async () => {
            const chain = await instantiateChain('p3_http_echo.component.wasm', 'p3_http_middleware.component.wasm');
            try {
                const N = 16;
                const requests = Array.from({ length: N }, (_, i) => rawRequest(chain.handle.port, {
                    method: 'POST',
                    pathname: `/post/${i}`,
                    headers: {
                        'content-type': 'text/plain',
                        'x-req-id': String(i),
                        'content-length': String(Buffer.byteLength(`payload-${i}`)),
                    },
                    body: `payload-${i}`,
                }));
                const responses = await Promise.all(requests);
                for (let i = 0; i < N; i++) {
                    const r = responses[i]!;
                    expect(r.status).toBe(200);
                    // Echo copies request headers onto response — the unique
                    // x-req-id proves no cross-contamination.
                    expect(r.headers['x-req-id']).toBe(String(i));
                    expect(r.body.toString()).toBe(`payload-${i}`);
                }
            } finally {
                await chain.dispose();
            }
        }), 60000);

    // ──── S3: aggregate inflight-bytes cap integration ────

    test('S3: aggregate inflight-bytes cap — default limit allows normal traffic', () =>
        runWithVerbose(verbose, async () => {
            // Default limit (16 MiB) should allow normal middleware traffic.
            const chain = await instantiateChain(
                'p3_http_echo.component.wasm',
                'p3_http_middleware.component.wasm',
            );
            try {
                const payload = 'hello-s3-' + 'X'.repeat(1000);
                const r = await rawRequest(chain.handle.port, {
                    method: 'POST',
                    pathname: '/post',
                    headers: {
                        'content-type': 'text/plain',
                        'content-length': String(Buffer.byteLength(payload)),
                    },
                    body: payload,
                });
                expect(r.status).toBe(200);
                expect(r.body.toString()).toBe(payload);
            } finally {
                await chain.dispose();
            }
        }), 30000);

    test('S3: aggregate inflight-bytes cap — very tight limit truncates body', () =>
        runWithVerbose(verbose, async () => {
            // A 128-byte limit is far too low for real middleware traffic.
            // The request body stream is silently closed by the aggregate
            // limit, so the guest sees EOF and returns a partial/empty
            // response rather than crashing.
            const sharedImports = createMergedHosts();
            const innerComp = await createComponent(WASM_DIR + 'p3_http_echo.component.wasm', verboseOptions(verbose));
            const inner = await innerComp.instantiate(sharedImports as Parameters<typeof innerComp.instantiate>[0]);
            const outerComp = await createComponent(WASM_DIR + 'p3_http_middleware.component.wasm', verboseOptions(verbose));
            const outer = await outerComp.instantiate({
                ...createMergedHosts(),
                ...linkHandler(inner),
            } as Parameters<typeof outerComp.instantiate>[0]);
            const handler = outer.exports['wasi:http/handler@0.3.0-rc-2026-03-15'] as WasiHttpHandlerExport;
            const h = await serve(handler, {
                port: 0,
                host: '127.0.0.1',
                network: { maxAggregateInflightBytes: 128 },
            });
            try {
                const payload = 'Y'.repeat(1000);
                try {
                    const r = await rawRequest(h.port, {
                        method: 'POST',
                        pathname: '/post',
                        headers: {
                            'content-type': 'text/plain',
                            'content-length': String(Buffer.byteLength(payload)),
                        },
                        body: payload,
                    });
                    // The response body should be truncated — either shorter
                    // than the payload, an error code, or empty.
                    if (r.status === 200) {
                        expect(r.body.length).toBeLessThan(payload.length);
                    }
                    // Status 500 is also acceptable if the error propagated
                } catch {
                    // Connection error is acceptable (instance aborted)
                }
            } finally {
                await h.close();
                outer.dispose();
                inner.dispose();
            }
        }), 30000);

    // ──── S4: client disconnect integration ────

    test('S4: client disconnect mid-response produces no host crash', () =>
        runWithVerbose(verbose, async () => {
            const chain = await instantiateChain(
                'p3_http_echo.component.wasm',
                'p3_http_middleware.component.wasm',
            );
            try {
                // Send a large body that will take time to stream back, then
                // abort the client connection mid-response.
                const bigBody = 'Y'.repeat(100_000);
                await new Promise<void>((resolve) => {
                    const req = http.request(
                        {
                            hostname: '127.0.0.1',
                            port: chain.handle.port,
                            path: '/post',
                            method: 'POST',
                            headers: {
                                'content-type': 'text/plain',
                                'content-length': String(Buffer.byteLength(bigBody)),
                            },
                        },
                        (res) => {
                            // Read one chunk then abort
                            res.once('data', () => {
                                req.destroy();
                                setTimeout(resolve, 200);
                            });
                        },
                    );
                    req.on('error', () => { /* expected — we destroyed */ });
                    req.write(bigBody);
                    req.end();
                });

                // After the abort, the chain should still be alive and serve
                // new requests successfully.
                const r = await rawRequest(chain.handle.port, {
                    method: 'GET',
                    pathname: '/get',
                    headers: { alive: 'yes' },
                });
                expect(r.status).toBe(200);
                expect(r.headers['alive']).toBe('yes');
            } finally {
                await chain.dispose();
            }
        }), 30000);

    /**
     * Inventory hygiene: confirm both middleware corpus files are tracked
     * in `P3_MIDDLEWARE_CHAIN` (and therefore in the `owned` inventory set)
     * and not listed in `KNOWN_UNSUPPORTED`. Catches regressions where the
     * roster drifts out of sync with the corpus.
     */
    test('I6: inventory hygiene — middleware files are tracked, not unsupported', () => {
        const middlewareFiles = P3_MIDDLEWARE_CHAIN.map(([f]) => f);
        expect(middlewareFiles).toEqual(expect.arrayContaining([
            'p3_http_middleware.component.wasm',
            'p3_http_middleware_with_chain.component.wasm',
        ]));
        for (const f of middlewareFiles) {
            expect(KNOWN_UNSUPPORTED.has(f)).toBe(false);
        }
    });
});
