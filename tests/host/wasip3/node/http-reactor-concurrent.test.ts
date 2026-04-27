// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * End-to-end concurrency proof for a real wasi:http/handler P3 reactor.
 *
 * Loads `p3_http_echo.component.wasm` (a real wasi:http/handler.Guest impl from
 * the wasmtime test-programs suite), plumbs its `handle` export into the jsco
 * Node http server adapter, and fires multiple HTTP requests in parallel
 * against a single instance to confirm that the runtime can keep N guest
 * handler tasks in flight on the same component instance.
 *
 * This test is the regression guard for the multi-async work proven in
 * tests/host/wasip3/multi-async.test.ts: it exercises the same multi-subtask
 * machinery (waitable-set with multiple readiness sources, per-task ctx slots,
 * concurrent JS-side export invocations) but against a real reactor rather
 * than a hand-written WAT fixture.
 */

import * as http from 'node:http';

import { createComponent } from '../../../../src/resolver';
import { createWasiP2ViaP3Adapter } from '../../../../src/host/wasip2-via-wasip3/index';
import { createWasiP3Host as createP3Host } from '../../../../src/host/wasip3/index';
import { serve } from '../../../../src/host/wasip3/node/http-server';
import type {
    WasiHttpHandlerExport,
    ServeHandle,
} from '../../../../src/host/wasip3/node/http-server';
import { initializeAsserts } from '../../../../src/utils/assert';
import {
    useVerboseOnFailure,
    verboseOptions,
    runWithVerbose,
} from '../../../test-utils/verbose-logger';

initializeAsserts();

const WASM_DIR = './integration-tests/wasmtime/';
const ECHO_WASM = WASM_DIR + 'p3_http_echo.component.wasm';
const HANDLER_INTERFACE = 'wasi:http/handler@0.3.0-rc-2026-03-15';

/** Merged P2+P3 hosts mirroring tests/host/wasip3/integration.test.ts. */
function createMergedHosts(
    config?: Parameters<typeof createP3Host>[0],
): Record<string, unknown> {
    const p3 = createP3Host(config);
    const p2 = createWasiP2ViaP3Adapter(p3);
    return { ...p2, ...p3 };
}

/** Minimal HTTP client request helper. */
function request(
    url: string,
    options?: {
        method?: string;
        headers?: Record<string, string>;
        body?: string;
    },
): Promise<{
    statusCode: number;
    headers: http.IncomingHttpHeaders;
    body: string;
}> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const req = http.request(
            {
                hostname: parsed.hostname,
                port: parsed.port,
                path: parsed.pathname + parsed.search,
                method: options?.method ?? 'GET',
                headers: options?.headers,
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => {
                    resolve({
                        statusCode: res.statusCode!,
                        headers: res.headers,
                        body: Buffer.concat(chunks).toString('utf-8'),
                    });
                });
            },
        );
        req.on('error', reject);
        if (options?.body) req.write(options.body);
        req.end();
    });
}

describe('wasi:http P3 reactor — concurrent requests on a single instance', () => {
    const verbose = useVerboseOnFailure();

    /**
     * G1 — fast-path concurrency.
     * Sends N parallel POST requests with `x-host-to-host: true`, which makes
     * p3_http_echo echo headers/body/trailers without spawning an internal
     * forwarder task. Proves the runtime can keep N guest handler tasks in
     * flight on the same instance and that bodies round-trip correctly.
     */
    test('G1: serves N parallel POST requests (fast-path echo)', () =>
        runWithVerbose(verbose, async () => {
            const imports = createMergedHosts();
            const component = await createComponent(ECHO_WASM, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            let handle: ServeHandle | undefined;
            try {
                const handler = instance.exports[HANDLER_INTERFACE] as
                    | WasiHttpHandlerExport
                    | undefined;
                expect(handler).toBeDefined();
                expect(typeof handler!.handle).toBe('function');

                handle = await serve(handler!, { port: 0, host: '127.0.0.1' });

                const N = 8;
                const bodies = Array.from({ length: N }, (_, i) =>
                    `concurrent-request-${i}-${'x'.repeat(128)}`,
                );

                const responses = await Promise.all(
                    bodies.map((body, i) =>
                        request(`http://127.0.0.1:${handle!.port}/req${i}`, {
                            method: 'POST',
                            headers: {
                                'x-host-to-host': 'true',
                                'content-type': 'text/plain',
                            },
                            body,
                        }),
                    ),
                );

                expect(responses).toHaveLength(N);
                for (let i = 0; i < N; i++) {
                    expect(responses[i]!.statusCode).toBe(200);
                    expect(responses[i]!.body).toBe(bodies[i]);
                }
            } finally {
                if (handle) await handle.close();
                instance.dispose();
            }
        }), 30000);

    /**
     * G2 — non-fast-path / forwarder spawn.
     * Drops the `x-host-to-host` header, which makes p3_http_echo take the
     * difficult path: it calls `wit_bindgen::spawn` to start a forwarder
     * subtask which copies the request body stream chunk-by-chunk into a
     * new `wit_stream` pipe used as the response body, and chains the
     * trailers future. Stresses spawned-subtask + stream-to-stream copy
     * + future chaining inside a single handler task.
     */
    test('G2: serves N parallel POST requests (forwarder spawn path)', () =>
        runWithVerbose(verbose, async () => {
            const imports = createMergedHosts();
            const component = await createComponent(ECHO_WASM, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            let handle: ServeHandle | undefined;
            try {
                const handler = instance.exports[HANDLER_INTERFACE] as
                    | WasiHttpHandlerExport
                    | undefined;
                expect(handler).toBeDefined();

                handle = await serve(handler!, { port: 0, host: '127.0.0.1' });

                const N = 4;
                const bodies = Array.from({ length: N }, (_, i) =>
                    `forwarder-${i}-${'y'.repeat(96)}`,
                );

                const responses = await Promise.all(
                    bodies.map((body, i) =>
                        request(`http://127.0.0.1:${handle!.port}/req${i}`, {
                            method: 'POST',
                            // No x-host-to-host header → forwarder path.
                            headers: { 'content-type': 'text/plain' },
                            body,
                        }),
                    ),
                );

                expect(responses).toHaveLength(N);
                for (let i = 0; i < N; i++) {
                    expect(responses[i]!.statusCode).toBe(200);
                    expect(responses[i]!.body).toBe(bodies[i]);
                }
            } finally {
                if (handle) await handle.close();
                instance.dispose();
            }
        }), 30000);

    /**
     * G3 — large body streaming through the forwarder path.
     * Sends a 256 KiB body that must round-trip via `wit_stream` chunked
     * forwarding. Validates that the host can drain `pipe_rx` concurrently
     * with the spawned forwarder filling `pipe_tx` — without this concurrency
     * the forwarder deadlocks when the body exceeds the stream backpressure
     * threshold (64 KiB by default).
     */
    test('G3: forwarder path round-trips a 256 KiB body intact', () =>
        runWithVerbose(verbose, async () => {
            const imports = createMergedHosts();
            const component = await createComponent(ECHO_WASM, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            let handle: ServeHandle | undefined;
            try {
                const handler = instance.exports[HANDLER_INTERFACE] as
                    | WasiHttpHandlerExport
                    | undefined;
                expect(handler).toBeDefined();

                handle = await serve(handler!, { port: 0, host: '127.0.0.1' });

                const body = 'z'.repeat(256 * 1024);
                const res = await request(`http://127.0.0.1:${handle!.port}/big`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/octet-stream' },
                    body,
                });

                expect(res.statusCode).toBe(200);
                expect(res.body.length).toBe(body.length);
                expect(res.body).toBe(body);
            } finally {
                if (handle) await handle.close();
                instance.dispose();
            }
        }), 30000);

    /**
     * G4 — mixed concurrent paths.
     * Fires N parallel requests where odd-indexed clients take the
     * fast-path (`x-host-to-host: true`) and even-indexed clients take
     * the forwarder spawn path. Both kinds of guest tasks run on the
     * same instance simultaneously, validating that the two code paths
     * do not interfere via shared per-instance state (waitable-set
     * table, ctx slots, subtask handles, stream/future tables).
     */
    test('G4: mixed fast-path + forwarder requests on one instance', () =>
        runWithVerbose(verbose, async () => {
            const imports = createMergedHosts();
            const component = await createComponent(ECHO_WASM, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            let handle: ServeHandle | undefined;
            try {
                const handler = instance.exports[HANDLER_INTERFACE] as
                    | WasiHttpHandlerExport
                    | undefined;
                expect(handler).toBeDefined();

                handle = await serve(handler!, { port: 0, host: '127.0.0.1' });

                const N = 8;
                const bodies = Array.from({ length: N }, (_, i) =>
                    `mixed-${i}-${'m'.repeat(64)}`,
                );

                const responses = await Promise.all(
                    bodies.map((body, i) => {
                        const headers: Record<string, string> = {
                            'content-type': 'text/plain',
                        };
                        if (i % 2 === 1) headers['x-host-to-host'] = 'true';
                        return request(
                            `http://127.0.0.1:${handle!.port}/req${i}`,
                            { method: 'POST', headers, body },
                        );
                    }),
                );

                expect(responses).toHaveLength(N);
                for (let i = 0; i < N; i++) {
                    expect(responses[i]!.statusCode).toBe(200);
                    expect(responses[i]!.body).toBe(bodies[i]);
                }
            } finally {
                if (handle) await handle.close();
                instance.dispose();
            }
        }), 30000);

    /**
     * G5 — instance lifecycle stability under sequential rounds.
     * Issues 3 sequential rounds of K parallel requests against ONE instance.
     * Validates that resource handle tables, waitable-set tables, and
     * subtask tables drain back to a clean state between rounds — a
     * regression guard against cumulative leaks across requests.
     */
    test('G5: same instance handles 3 sequential rounds of parallel requests', () =>
        runWithVerbose(verbose, async () => {
            const imports = createMergedHosts();
            const component = await createComponent(ECHO_WASM, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            let handle: ServeHandle | undefined;
            try {
                const handler = instance.exports[HANDLER_INTERFACE] as
                    | WasiHttpHandlerExport
                    | undefined;
                expect(handler).toBeDefined();

                handle = await serve(handler!, { port: 0, host: '127.0.0.1' });

                const ROUNDS = 3;
                const K = 4;
                for (let round = 0; round < ROUNDS; round++) {
                    const bodies = Array.from({ length: K }, (_, i) =>
                        `round${round}-req${i}-${'r'.repeat(48)}`,
                    );
                    const responses = await Promise.all(
                        bodies.map((body, i) =>
                            request(`http://127.0.0.1:${handle!.port}/round${round}/req${i}`, {
                                method: 'POST',
                                headers: {
                                    'x-host-to-host': 'true',
                                    'content-type': 'text/plain',
                                },
                                body,
                            }),
                        ),
                    );
                    for (let i = 0; i < K; i++) {
                        expect(responses[i]!.statusCode).toBe(200);
                        expect(responses[i]!.body).toBe(bodies[i]);
                    }
                }
            } finally {
                if (handle) await handle.close();
                instance.dispose();
            }
        }), 30000);
});
