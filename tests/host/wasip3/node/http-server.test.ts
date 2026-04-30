// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import * as http from 'node:http';
import { serve } from '../../../../src/host/wasip3/node/http-server';
import type { WasiHttpHandlerExport, ServeHandle } from '../../../../src/host/wasip3/node/http-server';

// ──────────────────── Helpers ────────────────────

/** Simple HTTP request helper using node:http */
function request(
    url: string,
    options?: {
        method?: string;
        headers?: Record<string, string>;
        body?: string;
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

// ──────────────────── Tests ────────────────────

describe('HTTP server (node)', () => {
    describe('basic request/response', () => {
        let handle: ServeHandle;

        afterEach(async () => {
            if (handle) await handle.close();
        });

        it('starts a server and responds to GET', async () => {
            const handler: WasiHttpHandlerExport = {
                async handle(req: unknown): Promise<unknown> {
                    // Read the request to access method/path
                    const request = req as {
                        getMethod(): { tag: string };
                        getPathWithQuery(): string | undefined;
                        getHeaders(): { copyAll(): Array<[string, Uint8Array]> };
                    };
                    const method = request.getMethod();
                    const path = request.getPathWithQuery();

                    // Build a simple response
                    const { _HttpFields, _HttpResponse } = await import('../../../../src/host/wasip3/http');
                    const body = JSON.stringify({ method: method.tag, path });
                    const bodyBytes = new TextEncoder().encode(body);
                    const bodyStream = {
                        async *[Symbol.asyncIterator]() {
                            yield bodyBytes;
                        },
                    };
                    const headers = _HttpFields.fromList([
                        ['content-type', new TextEncoder().encode('application/json')],
                    ]);
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

            handle = await serve(handler, { port: 0, host: '127.0.0.1' });
            expect(handle.port).toBeGreaterThan(0);

            const res = await request(`http://127.0.0.1:${handle.port}/test?q=1`);
            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toBe('application/json');
            const parsed = JSON.parse(res.body);
            expect(parsed.method).toBe('get');
            expect(parsed.path).toBe('/test?q=1');
        }, 10000);

        it('handles POST with body', async () => {
            const handler: WasiHttpHandlerExport = {
                async handle(req: unknown): Promise<unknown> {
                    // Consume request body
                    const request = req as {
                        getMethod(): { tag: string };
                        _internalContents: AsyncIterable<Uint8Array> | undefined;
                    };

                    const chunks: Uint8Array[] = [];
                    const contents = request._internalContents;
                    if (contents) {
                        for await (const chunk of contents) {
                            chunks.push(chunk);
                        }
                    }
                    // Decode request body
                    let offset = 0;
                    const combined = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
                    for (const chunk of chunks) {
                        combined.set(chunk, offset);
                        offset += chunk.length;
                    }
                    const receivedBody = new TextDecoder().decode(combined);

                    const { _HttpFields, _HttpResponse } = await import('../../../../src/host/wasip3/http');
                    const responseBody = new TextEncoder().encode(`echo: ${receivedBody}`);
                    const bodyStream = {
                        async *[Symbol.asyncIterator]() {
                            yield responseBody;
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

            handle = await serve(handler, { port: 0, host: '127.0.0.1' });

            const res = await request(`http://127.0.0.1:${handle.port}/echo`, {
                method: 'POST',
                headers: { 'content-type': 'text/plain' },
                body: 'hello server',
            });
            expect(res.statusCode).toBe(200);
            expect(res.body).toBe('echo: hello server');
        }, 10000);

        it('returns 500 on handler error', async () => {
            const handler: WasiHttpHandlerExport = {
                async handle(): Promise<unknown> {
                    throw new Error('handler crashed');
                },
            };

            handle = await serve(handler, { port: 0, host: '127.0.0.1' });

            const res = await request(`http://127.0.0.1:${handle.port}/fail`);
            expect(res.statusCode).toBe(500);
            expect(res.body).toBe('Internal Server Error');
        }, 10000);

        it('sets custom status codes', async () => {
            const handler: WasiHttpHandlerExport = {
                async handle(): Promise<unknown> {
                    const { _HttpFields, _HttpResponse } = await import('../../../../src/host/wasip3/http');
                    const headers = _HttpFields.fromList([]);
                    const trailersPromise = Promise.resolve({ tag: 'ok' as const, val: undefined });
                    const [response] = _HttpResponse.new(
                        headers as never,
                        undefined,
                        trailersPromise as never,
                    );
                    response.setStatusCode(404);
                    return { tag: 'ok' as const, val: response };
                },
            };

            handle = await serve(handler, { port: 0, host: '127.0.0.1' });

            const res = await request(`http://127.0.0.1:${handle.port}/missing`);
            expect(res.statusCode).toBe(404);
        }, 10000);

        it('passes multiple response headers', async () => {
            const handler: WasiHttpHandlerExport = {
                async handle(): Promise<unknown> {
                    const { _HttpFields, _HttpResponse } = await import('../../../../src/host/wasip3/http');
                    const headers = _HttpFields.fromList([
                        ['x-custom-a', new TextEncoder().encode('alpha')],
                        ['x-custom-b', new TextEncoder().encode('beta')],
                    ]);
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

            handle = await serve(handler, { port: 0, host: '127.0.0.1' });

            const res = await request(`http://127.0.0.1:${handle.port}/headers`);
            expect(res.statusCode).toBe(200);
            expect(res.headers['x-custom-a']).toBe('alpha');
            expect(res.headers['x-custom-b']).toBe('beta');
        }, 10000);

        it('passes request headers to handler', async () => {
            let receivedHeaders: Array<[string, string]> = [];

            const handler: WasiHttpHandlerExport = {
                async handle(req: unknown): Promise<unknown> {
                    const request = req as {
                        getHeaders(): { copyAll(): Array<[string, Uint8Array]> };
                    };
                    const hdrs = request.getHeaders();
                    receivedHeaders = hdrs.copyAll().map(([n, v]) => [n, new TextDecoder().decode(v)]);

                    const { _HttpFields, _HttpResponse } = await import('../../../../src/host/wasip3/http');
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

            handle = await serve(handler, { port: 0, host: '127.0.0.1' });

            await request(`http://127.0.0.1:${handle.port}/`, {
                headers: { 'x-test-header': 'test-value' },
            });

            const testHeader = receivedHeaders.find(([n]) => n.toLowerCase() === 'x-test-header');
            expect(testHeader).toBeDefined();
            expect(testHeader![1]).toBe('test-value');
        }, 10000);
    });

    describe('streaming response body', () => {
        let handle: ServeHandle;

        afterEach(async () => {
            if (handle) await handle.close();
        });

        it('streams response body in multiple chunks', async () => {
            const handler: WasiHttpHandlerExport = {
                async handle(): Promise<unknown> {
                    const { _HttpFields, _HttpResponse } = await import('../../../../src/host/wasip3/http');
                    const bodyStream = {
                        async *[Symbol.asyncIterator]() {
                            yield new TextEncoder().encode('chunk1');
                            yield new TextEncoder().encode('chunk2');
                            yield new TextEncoder().encode('chunk3');
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

            handle = await serve(handler, { port: 0, host: '127.0.0.1' });

            const res = await request(`http://127.0.0.1:${handle.port}/stream`);
            expect(res.statusCode).toBe(200);
            expect(res.body).toBe('chunk1chunk2chunk3');
        }, 10000);

        it('handles empty body (no content)', async () => {
            const handler: WasiHttpHandlerExport = {
                async handle(): Promise<unknown> {
                    const { _HttpFields, _HttpResponse } = await import('../../../../src/host/wasip3/http');
                    const headers = _HttpFields.fromList([]);
                    const trailersPromise = Promise.resolve({ tag: 'ok' as const, val: undefined });
                    const [response] = _HttpResponse.new(
                        headers as never,
                        undefined,
                        trailersPromise as never,
                    );
                    response.setStatusCode(204);
                    return { tag: 'ok' as const, val: response };
                },
            };

            handle = await serve(handler, { port: 0, host: '127.0.0.1' });

            const res = await request(`http://127.0.0.1:${handle.port}/empty`);
            expect(res.statusCode).toBe(204);
            expect(res.body).toBe('');
        }, 10000);
    });

    describe('graceful shutdown', () => {
        it('close() shuts down the server', async () => {
            const handler: WasiHttpHandlerExport = {
                async handle(): Promise<unknown> {
                    const { _HttpFields, _HttpResponse } = await import('../../../../src/host/wasip3/http');
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

            const handle = await serve(handler, { port: 0, host: '127.0.0.1' });
            const port = handle.port;

            // Verify server is running
            const res = await request(`http://127.0.0.1:${port}/`);
            expect(res.statusCode).toBe(200);

            // Close
            await handle.close();

            // Verify server is stopped
            await expect(request(`http://127.0.0.1:${port}/`)).rejects.toThrow();
        }, 10000);
    });

    describe('serve config', () => {
        let handle: ServeHandle;

        afterEach(async () => {
            if (handle) await handle.close();
        });

        it('uses port 0 for ephemeral port', async () => {
            const handler: WasiHttpHandlerExport = {
                async handle(): Promise<unknown> {
                    const { _HttpFields, _HttpResponse } = await import('../../../../src/host/wasip3/http');
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

            handle = await serve(handler, { port: 0, host: '127.0.0.1' });
            expect(handle.port).toBeGreaterThan(0);
            expect(handle.server).toBeDefined();
        }, 10000);

        it('request authority is set from Host header', async () => {
            let receivedAuthority: string | undefined;

            const handler: WasiHttpHandlerExport = {
                async handle(req: unknown): Promise<unknown> {
                    const request = req as { getAuthority(): string | undefined };
                    receivedAuthority = request.getAuthority();

                    const { _HttpFields, _HttpResponse } = await import('../../../../src/host/wasip3/http');
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

            handle = await serve(handler, { port: 0, host: '127.0.0.1' });
            await request(`http://127.0.0.1:${handle.port}/`);

            expect(receivedAuthority).toBe(`127.0.0.1:${handle.port}`);
        }, 10000);

        it('request scheme is HTTP', async () => {
            let receivedScheme: { tag: string } | undefined;

            const handler: WasiHttpHandlerExport = {
                async handle(req: unknown): Promise<unknown> {
                    const request = req as { getScheme(): { tag: string } | undefined };
                    receivedScheme = request.getScheme();

                    const { _HttpFields, _HttpResponse } = await import('../../../../src/host/wasip3/http');
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

            handle = await serve(handler, { port: 0, host: '127.0.0.1' });
            await request(`http://127.0.0.1:${handle.port}/`);

            expect(receivedScheme).toEqual({ tag: 'HTTP' });
        }, 10000);
    });

    describe('multiple concurrent requests', () => {
        let handle: ServeHandle;

        afterEach(async () => {
            if (handle) await handle.close();
        });

        it('handles multiple concurrent requests', async () => {
            let requestCount = 0;

            const handler: WasiHttpHandlerExport = {
                async handle(req: unknown): Promise<unknown> {
                    requestCount++;
                    const request = req as { getPathWithQuery(): string | undefined };
                    const path = request.getPathWithQuery();

                    const { _HttpFields, _HttpResponse } = await import('../../../../src/host/wasip3/http');
                    const body = new TextEncoder().encode(`response for ${path}`);
                    const bodyStream = {
                        async *[Symbol.asyncIterator]() {
                            yield body;
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

            handle = await serve(handler, { port: 0, host: '127.0.0.1' });
            const port = handle.port;

            const results = await Promise.all([
                request(`http://127.0.0.1:${port}/a`),
                request(`http://127.0.0.1:${port}/b`),
                request(`http://127.0.0.1:${port}/c`),
            ]);

            expect(requestCount).toBe(3);
            for (const res of results) {
                expect(res.statusCode).toBe(200);
            }
            const bodies = results.map(r => r.body).sort();
            expect(bodies).toEqual([
                'response for /a',
                'response for /b',
                'response for /c',
            ]);
        }, 10000);
    });
});
