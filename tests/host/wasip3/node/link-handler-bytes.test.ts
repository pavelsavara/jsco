// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import * as http from 'node:http';
import { serve } from '../../../../src/host/wasip3/node/http-server';
import type { WasiHttpHandlerExport, ServeHandle } from '../../../../src/host/wasip3/node/http-server';

// ──────────────────── Helpers ────────────────────

function request(
    url: string,
    options?: {
        method?: string;
        headers?: Record<string, string>;
        body?: string | Buffer;
    },
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
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
        if (options?.body) {
            req.write(options.body);
        }
        req.end();
    });
}

/** Create a mock handler that echoes the request body back, optionally amplified. */
function createEchoHandler(amplifyFactor = 1): WasiHttpHandlerExport {
    return {
        async handle(req: unknown): Promise<unknown> {
            const { _HttpFields, _HttpResponse } = await import('../../../../src/host/wasip3/http');
            const request = req as { _internalContents: AsyncIterable<Uint8Array> | undefined };

            // Collect request body
            const chunks: Uint8Array[] = [];
            if (request._internalContents) {
                for await (const chunk of request._internalContents) {
                    chunks.push(chunk);
                }
            }

            // Amplify the body for decompression-bomb simulation
            const bodyStream = {
                async *[Symbol.asyncIterator]() {
                    for (let i = 0; i < amplifyFactor; i++) {
                        for (const chunk of chunks) {
                            yield chunk;
                        }
                    }
                },
            };

            const headers = _HttpFields.fromList([]);
            const trailersPromise = Promise.resolve({ tag: 'ok' as const, val: undefined });
            const [response] = _HttpResponse.new(
                headers as never,
                bodyStream,
                trailersPromise as never,
            );
            response.setStatusCode(200);
            return { tag: 'ok' as const, val: response };
        },
    };
}

// ──────────────────── Tests ────────────────────

describe('aggregate inflight-bytes cap (U7 / S3)', () => {
    let handle: ServeHandle;

    afterEach(async () => {
        if (handle) await handle.close();
    });

    test('response body within limit succeeds', async () => {
        // Echo handler returns the same body back (1× amplification)
        const handler = createEchoHandler(1);
        handle = await serve(handler, {
            port: 0,
            host: '127.0.0.1',
            network: { maxAggregateInflightBytes: 1_048_576 }, // 1 MiB
        });

        const body = 'A'.repeat(1000);
        const res = await request(`http://127.0.0.1:${handle.port}/`, {
            method: 'POST',
            body,
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toBe(body);
    }, 10000);

    test('response body exceeding aggregate limit truncates response', async () => {
        // Handler amplifies the body 4× — 256KB * 4 = 1MB response, exceeds 512KB limit.
        // Since headers are sent before the body starts streaming, the status
        // code is 200 but the body is truncated when the aggregate trips.
        const handler = createEchoHandler(4);
        const errors: string[] = [];
        handle = await serve(handler, {
            port: 0,
            host: '127.0.0.1',
            network: { maxAggregateInflightBytes: 524_288 }, // 512 KiB
            onError: (msg) => errors.push(msg),
        });

        const body = 'B'.repeat(262_144); // 256 KiB request body
        const res = await request(`http://127.0.0.1:${handle.port}/`, {
            method: 'POST',
            body,
        });
        // Headers were already sent before the aggregate limit tripped, so the
        // status is 200 — but the body is truncated (shorter than the full 4×).
        expect(res.statusCode).toBe(200);
        expect(res.body.length).toBeLessThan(body.length * 4);
        // The onError callback must have fired.
        expect(errors.length).toBeGreaterThanOrEqual(1);
    }, 10000);

    test('request body alone exceeding aggregate limit returns 500', async () => {
        // Handler that just returns empty — the request body itself exceeds the limit
        const handler: WasiHttpHandlerExport = {
            async handle(req: unknown): Promise<unknown> {
                const { _HttpFields, _HttpResponse } = await import('../../../../src/host/wasip3/http');
                const request = req as { _internalContents: AsyncIterable<Uint8Array> | undefined };
                // Consume request body
                if (request._internalContents) {
                    for await (const _chunk of request._internalContents) {
                        // drain
                    }
                }
                const headers = _HttpFields.fromList([]);
                const trailersPromise = Promise.resolve({ tag: 'ok' as const, val: undefined });
                const [response] = _HttpResponse.new(
                    headers as never,
                    undefined,
                    trailersPromise as never,
                );
                response.setStatusCode(200);
                return { tag: 'ok' as const, val: response };
            },
        };
        const errors: string[] = [];
        handle = await serve(handler, {
            port: 0,
            host: '127.0.0.1',
            network: { maxAggregateInflightBytes: 1024 }, // 1 KiB
            onError: (msg) => errors.push(msg),
        });

        const body = 'C'.repeat(2048); // 2 KiB — exceeds 1 KiB limit
        const res = await request(`http://127.0.0.1:${handle.port}/`, {
            method: 'POST',
            body,
        });
        expect(res.statusCode).toBe(500);
    }, 10000);

    test('aggregate limit disabled when set to 0', async () => {
        const handler = createEchoHandler(1);
        handle = await serve(handler, {
            port: 0,
            host: '127.0.0.1',
            network: { maxAggregateInflightBytes: 0 },
        });

        const body = 'D'.repeat(100_000);
        const res = await request(`http://127.0.0.1:${handle.port}/`, {
            method: 'POST',
            body,
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toBe(body);
    }, 10000);

    test('concurrent requests get independent counters', async () => {
        const handler = createEchoHandler(1);
        handle = await serve(handler, {
            port: 0,
            host: '127.0.0.1',
            network: { maxAggregateInflightBytes: 65_536 }, // 64 KiB per request
        });

        // 8 parallel requests, each 32 KiB — all should succeed independently
        const body = 'E'.repeat(32_768);
        const results = await Promise.all(
            Array.from({ length: 8 }, () =>
                request(`http://127.0.0.1:${handle.port}/`, {
                    method: 'POST',
                    body,
                }),
            ),
        );
        for (const res of results) {
            expect(res.statusCode).toBe(200);
            expect(res.body).toBe(body);
        }
    }, 15000);
});
