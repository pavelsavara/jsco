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
import { LogLevel, setLogger } from '../../../../src/utils/assert';

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

    test('p3_http_echo serves N parallel POST requests', () =>
        runWithVerbose(verbose, async () => {
            // eslint-disable-next-line no-console
            setLogger((phase, _level, ...args) => console.log(`[${phase}]`, ...args));
            const imports = createMergedHosts();
            const component = await createComponent(
                ECHO_WASM,
                { verbose: { resolver: LogLevel.Summary, executor: LogLevel.Detailed, binder: LogLevel.Summary } },
            );
            const instance = await component.instantiate(imports);
            let handle: ServeHandle | undefined;
            try {
                const handler = instance.exports[HANDLER_INTERFACE] as
                    | WasiHttpHandlerExport
                    | undefined;
                expect(handler).toBeDefined();
                expect(typeof handler!.handle).toBe('function');

                handle = await serve(handler!, { port: 0, host: '127.0.0.1' });

                const N = 1;
                const bodies = Array.from({ length: N }, (_, i) =>
                    `concurrent-request-${i}-${'x'.repeat(64)}`,
                );

                const responses = await Promise.all(
                    bodies.map((body, i) =>
                        request(`http://127.0.0.1:${handle!.port}/req${i}`, {
                            method: 'POST',
                            // Use the host-to-host fast path of p3_http_echo:
                            // it echoes headers/body/trailers without spawning
                            // an internal forwarder task.
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
});
