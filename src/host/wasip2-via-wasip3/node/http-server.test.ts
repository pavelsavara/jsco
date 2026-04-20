// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * Tests for wasi:http/incoming-handler — Node.js HTTP server via P2-via-P3 adapter
 */

import type {
    WasiIncomingRequest,
    WasiResponseOutparam,
    IncomingHandlerFn,
    WasiResponseOutparamInternal,
} from '../http-types';
import {
    createHttpServer,
    createOutgoingResponse,
    responseOutparamSet,
    createFutureTrailers,
} from './http-server';
import { createFields, createFieldsFromList } from '../http-types';

const enc = new TextEncoder();
const dec = new TextDecoder();

// ─── outgoing-response ───

describe('wasi:http/types outgoing-response (P2-via-P3)', () => {
    test('create with default status 200', () => {
        const fields = createFields();
        const response = createOutgoingResponse(fields);
        expect(response.statusCode()).toBe(200);
    });

    test('set status code', () => {
        const fields = createFields();
        const response = createOutgoingResponse(fields);
        expect(response.setStatusCode(404)).toBe(true);
        expect(response.statusCode()).toBe(404);
    });

    test('reject invalid status codes', () => {
        const fields = createFields();
        const response = createOutgoingResponse(fields);
        expect(response.setStatusCode(99)).toBe(false);
        expect(response.setStatusCode(1000)).toBe(false);
    });

    test('get body and write stream', () => {
        const fields = createFields();
        const response = createOutgoingResponse(fields);
        const body = response.body();
        expect(body.tag).toBe('ok');
        if (body.tag !== 'ok') return;

        const writeResult = body.val.write();
        expect(writeResult.tag).toBe('ok');
    });

    test('body can only be taken once', () => {
        const fields = createFields();
        const response = createOutgoingResponse(fields);
        const first = response.body();
        expect(first.tag).toBe('ok');
        const second = response.body();
        expect(second.tag).toBe('err');
    });
});

// ─── response-outparam.set ───

describe('wasi:http/types response-outparam.set (P2-via-P3)', () => {
    test('set with ok response', () => {
        const fields = createFields();
        const response = createOutgoingResponse(fields);
        let resolved = false;

        const mockOutparam: WasiResponseOutparamInternal = {
            _resolve: () => { resolved = true; },
        };

        responseOutparamSet(mockOutparam, { tag: 'ok', val: response });
        expect(resolved).toBe(true);
    });
});

// ─── future-trailers ───

describe('wasi:http/types future-trailers (P2-via-P3)', () => {
    test('immediately resolves with no trailers', () => {
        const ft = createFutureTrailers();
        const pollable = ft.subscribe();
        expect(pollable.ready()).toBe(true);

        const result = ft.get();
        expect(result).toBeDefined();
        if (result) {
            expect(result.tag).toBe('ok');
            if (result.tag === 'ok') {
                expect(result.val.tag).toBe('ok');
            }
        }
    });

    test('get returns undefined on second call', () => {
        const ft = createFutureTrailers();
        const first = ft.get();
        expect(first).toBeDefined();
        const second = ft.get();
        expect(second).toBeUndefined();
    });

    test('subscribe returns pollable that is always ready', () => {
        const ft = createFutureTrailers();
        const p = ft.subscribe();
        expect(p.ready()).toBe(true);
        // Calling ready again should still be true
        expect(p.ready()).toBe(true);
    });
});

// ─── HTTP Server ───

describe('wasi:http/incoming-handler server (P2-via-P3)', () => {
    test('start and stop server', async () => {
        const handler: IncomingHandlerFn = (_request: WasiIncomingRequest, responseOut: WasiResponseOutparam) => {
            const fields = createFields();
            const response = createOutgoingResponse(fields);
            responseOutparamSet(responseOut, { tag: 'ok', val: response });
        };

        const server = createHttpServer(handler, { port: 0 });
        const port = await server.start();
        expect(port).toBeGreaterThan(0);
        expect(server.port()).toBe(port);

        await server.stop();
    }, 10000);

    test('handle GET request', async () => {
        const handler: IncomingHandlerFn = (request: WasiIncomingRequest, responseOut: WasiResponseOutparam) => {
            const method = request.method();
            expect(method.tag).toBe('get');
            const path = request.pathWithQuery();
            expect(path).toBe('/test?q=1');

            const fieldsResult = createFieldsFromList([
                ['content-type', enc.encode('text/plain')],
            ]);
            const fields = fieldsResult.tag === 'ok' ? fieldsResult.val : createFields();
            const response = createOutgoingResponse(fields);
            response.setStatusCode(200);

            // Write body
            const bodyResult = response.body();
            if (bodyResult.tag === 'ok') {
                const writeResult = bodyResult.val.write();
                if (writeResult.tag === 'ok') {
                    writeResult.val.blockingWriteAndFlush(enc.encode('Hello from WASM'));
                }
            }

            responseOutparamSet(responseOut, { tag: 'ok', val: response });
        };

        const server = createHttpServer(handler, { port: 0 });
        const port = await server.start();

        try {
            const response = await fetch(`http://127.0.0.1:${port}/test?q=1`);
            expect(response.status).toBe(200);
            const body = await response.text();
            expect(body).toBe('Hello from WASM');
        } finally {
            await server.stop();
        }
    }, 15000);

    test('handle POST request with body', async () => {
        const handler: IncomingHandlerFn = (request: WasiIncomingRequest, responseOut: WasiResponseOutparam) => {
            const method = request.method();
            expect(method.tag).toBe('post');

            // Read request body
            const consume = request.consume();
            let bodyText = '';
            if (consume.tag === 'ok') {
                const streamResult = consume.val.stream();
                if (streamResult.tag === 'ok') {
                    const readResult = streamResult.val.read(65536n);
                    if (readResult.tag === 'ok') {
                        bodyText = dec.decode(readResult.val);
                    }
                }
            }

            const fields = createFields();
            const response = createOutgoingResponse(fields);
            response.setStatusCode(200);

            const bodyResult = response.body();
            if (bodyResult.tag === 'ok') {
                const writeResult = bodyResult.val.write();
                if (writeResult.tag === 'ok') {
                    writeResult.val.blockingWriteAndFlush(enc.encode(`Echo: ${bodyText}`));
                }
            }

            responseOutparamSet(responseOut, { tag: 'ok', val: response });
        };

        const server = createHttpServer(handler, { port: 0 });
        const port = await server.start();

        try {
            const response = await fetch(`http://127.0.0.1:${port}/submit`, {
                method: 'POST',
                body: 'test data',
            });
            expect(response.status).toBe(200);
            const body = await response.text();
            expect(body).toBe('Echo: test data');
        } finally {
            await server.stop();
        }
    }, 15000);

    test('request headers are forwarded', async () => {
        let receivedHeaders: [string, Uint8Array][] = [];
        const handler: IncomingHandlerFn = (request: WasiIncomingRequest, responseOut: WasiResponseOutparam) => {
            receivedHeaders = request.headers().entries();
            const fields = createFields();
            const response = createOutgoingResponse(fields);
            responseOutparamSet(responseOut, { tag: 'ok', val: response });
        };

        const server = createHttpServer(handler, { port: 0 });
        const port = await server.start();

        try {
            await fetch(`http://127.0.0.1:${port}/`, {
                headers: { 'x-custom': 'test-value' },
            });

            const customHeader = receivedHeaders.find(
                ([name]) => name === 'x-custom'
            );
            expect(customHeader).toBeDefined();
            if (customHeader) {
                expect(dec.decode(customHeader[1])).toBe('test-value');
            }
        } finally {
            await server.stop();
        }
    }, 10000);

    test('handler error returns 500', async () => {
        const handler: IncomingHandlerFn = () => {
            throw new Error('handler crash');
        };

        const server = createHttpServer(handler, { port: 0 });
        const port = await server.start();

        try {
            const response = await fetch(`http://127.0.0.1:${port}/`);
            expect(response.status).toBe(500);
        } finally {
            await server.stop();
        }
    }, 10000);

    test('URL exceeding maxRequestUrlBytes returns 414', async () => {
        const handler: IncomingHandlerFn = (_req, responseOut) => {
            const fields = createFields();
            const response = createOutgoingResponse(fields);
            responseOutparamSet(responseOut, { tag: 'ok', val: response });
        };

        const server = createHttpServer(handler, {
            port: 0,
            network: { maxRequestUrlBytes: 20 },
        });
        const port = await server.start();

        try {
            const longPath = '/a'.repeat(50);
            const response = await fetch(`http://127.0.0.1:${port}${longPath}`);
            expect(response.status).toBe(414);
        } finally {
            await server.stop();
        }
    }, 10000);

    test('short URL within maxRequestUrlBytes succeeds', async () => {
        const handler: IncomingHandlerFn = (_req, responseOut) => {
            const fields = createFields();
            const response = createOutgoingResponse(fields);
            responseOutparamSet(responseOut, { tag: 'ok', val: response });
        };

        const server = createHttpServer(handler, {
            port: 0,
            network: { maxRequestUrlBytes: 1000 },
        });
        const port = await server.start();

        try {
            const response = await fetch(`http://127.0.0.1:${port}/ok`);
            expect(response.status).toBe(200);
        } finally {
            await server.stop();
        }
    }, 10000);

    test('server port() returns actual listening port', async () => {
        const handler: IncomingHandlerFn = (_req, responseOut) => {
            const fields = createFields();
            const response = createOutgoingResponse(fields);
            responseOutparamSet(responseOut, { tag: 'ok', val: response });
        };

        const server = createHttpServer(handler, { port: 0 });
        const port = await server.start();

        try {
            expect(server.port()).toBe(port);
            expect(port).toBeGreaterThan(0);
        } finally {
            await server.stop();
        }
    }, 10000);

    test('server accepts custom hostname', async () => {
        const handler: IncomingHandlerFn = (_req, responseOut) => {
            const fields = createFields();
            const response = createOutgoingResponse(fields);
            responseOutparamSet(responseOut, { tag: 'ok', val: response });
        };

        const server = createHttpServer(handler, { port: 0, hostname: '127.0.0.1' });
        const port = await server.start();

        try {
            const response = await fetch(`http://127.0.0.1:${port}/`);
            expect(response.status).toBe(200);
        } finally {
            await server.stop();
        }
    }, 10000);
});
