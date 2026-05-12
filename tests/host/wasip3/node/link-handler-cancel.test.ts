// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import * as http from 'node:http';
import { serve } from '../../../../src/host/wasip3/node/http-server';
import type { WasiHttpHandlerExport, ServeHandle } from '../../../../src/host/wasip3/node/http-server';

// ──────────────────── Tests ────────────────────

describe('request cancellation cascade (U8 / S4)', () => {
    let handle: ServeHandle;

    afterEach(async () => {
        if (handle) await handle.close();
    });

    test('client disconnect stops response body writing', async () => {
        let chunksWritten = 0;
        let startResolve!: () => void;
        const handlerStarted = new Promise<void>((r) => { startResolve = r; });

        // Handler that streams a slow, infinite body
        const handler: WasiHttpHandlerExport = {
            async handle(): Promise<unknown> {
                const { _HttpFields, _HttpResponse } = await import('../../../../src/host/wasip3/http');
                const bodyStream = {
                    async *[Symbol.asyncIterator]() {
                        startResolve();
                        for (let i = 0; i < 1000; i++) {
                            chunksWritten++;
                            yield new TextEncoder().encode(`chunk-${i}\n`);
                            // Yield to event loop so the abort signal can be checked
                            await new Promise<void>((r) => setImmediate(r));
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

        handle = await serve(handler, { port: 0, host: '127.0.0.1' });

        // Start a request and abort it after the handler starts streaming
        await new Promise<void>((resolve, reject) => {
            const req = http.request(
                {
                    hostname: '127.0.0.1',
                    port: handle.port,
                    path: '/',
                    method: 'GET',
                },
                (res) => {
                    // Read a few bytes then destroy the connection
                    res.once('data', () => {
                        req.destroy();
                        // Give the server time to notice the disconnect
                        setTimeout(resolve, 200);
                    });
                },
            );
            req.on('error', () => {
                // Expected — we destroyed the request
            });
            req.end();
            handlerStarted.catch(reject);
        });

        // The handler should have stopped writing well before 1000 chunks
        // because the abort signal fired on client disconnect
        expect(chunksWritten).toBeLessThan(1000);
    }, 15000);

    test('normal request completes fully when client stays connected', async () => {
        let chunksWritten = 0;

        const handler: WasiHttpHandlerExport = {
            async handle(): Promise<unknown> {
                const { _HttpFields, _HttpResponse } = await import('../../../../src/host/wasip3/http');
                const bodyStream = {
                    async *[Symbol.asyncIterator]() {
                        for (let i = 0; i < 10; i++) {
                            chunksWritten++;
                            yield new TextEncoder().encode(`chunk-${i}\n`);
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

        handle = await serve(handler, { port: 0, host: '127.0.0.1' });

        const res = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
            const req = http.request(
                {
                    hostname: '127.0.0.1',
                    port: handle.port,
                    path: '/',
                    method: 'GET',
                },
                (res) => {
                    const chunks: Buffer[] = [];
                    res.on('data', (chunk: Buffer) => chunks.push(chunk));
                    res.on('end', () => {
                        resolve({
                            statusCode: res.statusCode!,
                            body: Buffer.concat(chunks).toString('utf-8'),
                        });
                    });
                },
            );
            req.on('error', reject);
            req.end();
        });

        expect(res.statusCode).toBe(200);
        expect(chunksWritten).toBe(10);
        expect(res.body).toContain('chunk-0');
        expect(res.body).toContain('chunk-9');
    }, 10000);

    test('handler error after client disconnect is handled gracefully', async () => {
        const errors: string[] = [];

        const handler: WasiHttpHandlerExport = {
            async handle(): Promise<unknown> {
                // Simulate a slow handler that hasn't returned yet
                await new Promise<void>((r) => setTimeout(r, 500));
                throw new Error('handler error after disconnect');
            },
        };

        handle = await serve(handler, {
            port: 0,
            host: '127.0.0.1',
            onError: (msg) => errors.push(msg),
        });

        // Start request and immediately destroy
        await new Promise<void>((resolve) => {
            const req = http.request(
                {
                    hostname: '127.0.0.1',
                    port: handle.port,
                    path: '/',
                    method: 'GET',
                },
                () => { /* ignore response */ },
            );
            req.on('error', () => { /* expected */ });
            req.end();
            setTimeout(() => {
                req.destroy();
                setTimeout(resolve, 600);
            }, 50);
        });

        // The error should have been caught — no unhandled rejection
        expect(errors.length).toBeGreaterThanOrEqual(1);
    }, 15000);
});
