// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * wasi:http/incoming-handler — Node.js HTTP server integration (P2-via-P3)
 *
 * Delegates to the P3 HTTP server (wasip3/node/http-server.ts serve()) and
 * bridges P2 incoming-handler semantics to the P3 handler interface.
 * P2 handlers receive (WasiIncomingRequest, WasiResponseOutparam);
 * this module wraps them as P3 handlers that take a P3 HttpRequest and
 * return a P3 HttpResponse.
 *
 * Usage:
 *   const server = createHttpServer(wasmHandler, { port: 8080 });
 *   server.start(); // starts listening
 *   server.stop();  // graceful shutdown
 */

import type { ServeHandle } from '../../wasip3/node/http-server';
import { serve as p3Serve } from '../../wasip3/node/http-server';
import {
    _HttpFields,
    _HttpRequest,
    _HttpResponse,
} from '../../wasip3/http';
import { ok } from '../../wasip3/result';
import type { WasiStreamReadable } from '../../wasip3/streams';
import { collectBytes } from '../../wasip3/streams';
import type {
    WasiFields,
    WasiIncomingBody,
    HttpMethod,
    HttpScheme,
    HttpErrorCode,
    HttpResult,
    WasiIncomingRequest,
    WasiOutgoingResponse,
    WasiResponseOutparamInternal,
    IncomingHandlerFn,
    HttpServerConfig,
    WasiHttpServer,
} from '../http-types';
import { NETWORK_DEFAULTS } from '../http-types';
import { createInputStream } from '../io';

// ─── P3 Fields → P2 Fields adapter ───

function wrapP3FieldsAsP2(p3Fields: _HttpFields): WasiFields {
    return {
        get: (name: string) => p3Fields.get(name),
        has: (name: string) => p3Fields.has(name),
        set: () => ({ tag: 'err' as const, val: { tag: 'immutable' as const } }),
        append: () => ({ tag: 'err' as const, val: { tag: 'immutable' as const } }),
        delete: () => ({ tag: 'err' as const, val: { tag: 'immutable' as const } }),
        entries: () => p3Fields.copyAll(),
        clone: () => wrapP3FieldsAsP2(p3Fields.clone()),
    };
}

// ─── P3 Request → P2 Request bridge ───

function createP2RequestFromP3(
    p3Request: _HttpRequest,
    bodyData: Uint8Array,
): WasiIncomingRequest {
    const method = p3Request.getMethod() as HttpMethod;
    const pathWithQuery = p3Request.getPathWithQuery();
    const scheme = p3Request.getScheme() as HttpScheme | undefined;
    const authority = p3Request.getAuthority();
    const p3Headers = p3Request.getHeaders();
    const p2Headers = wrapP3FieldsAsP2(p3Headers);
    const bodyStream = createInputStream(bodyData);
    let consumed = false;

    return {
        method: () => method,
        pathWithQuery: () => pathWithQuery,
        scheme: () => scheme,
        authority: () => authority,
        headers: () => p2Headers,
        consume(): HttpResult<WasiIncomingBody> {
            if (consumed) return { tag: 'err', val: { tag: 'internal-error', val: 'body already consumed' } };
            consumed = true;
            let streamTaken = false;
            return {
                tag: 'ok',
                val: {
                    stream(): HttpResult<ReturnType<typeof createInputStream>> {
                        if (streamTaken) return { tag: 'err', val: { tag: 'internal-error', val: 'stream already taken' } };
                        streamTaken = true;
                        return { tag: 'ok', val: bodyStream };
                    },
                },
            };
        },
    };
}

// ─── P2 Response → P3 Response bridge ───

function convertP2ResponseToP3(p2Response: WasiOutgoingResponse): _HttpResponse {
    const p2WithInternals = p2Response as WasiOutgoingResponse & { _bodyChunks?(): Uint8Array[]; _headers?(): WasiFields };

    // Convert P2 headers to P3 HttpFields
    const headerFields = p2WithInternals._headers ? p2WithInternals._headers() : p2Response.headers();
    const entries = headerFields.entries();
    const p3Headers = _HttpFields.fromIncomingList(entries);

    // Get body chunks from P2 response
    const bodyChunks = p2WithInternals._bodyChunks?.() ?? [];

    // Create async iterable from body chunks
    let contents: WasiStreamReadable<Uint8Array> | undefined;
    if (bodyChunks.length > 0) {
        contents = {
            async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
                for (const chunk of bodyChunks) {
                    yield chunk;
                }
            },
        };
    }

    // Build P3 response
    const trailersPromise = Promise.resolve(ok(undefined) as any);
    const [p3Response] = _HttpResponse.new(p3Headers as any, contents, trailersPromise);
    p3Response.setStatusCode(p2Response.statusCode());

    return p3Response;
}

// ─── Create P3 error response ───

function createP3ErrorResponse(statusCode: number): _HttpResponse {
    const headers = new _HttpFields();
    const trailersPromise = Promise.resolve(ok(undefined) as any);
    const [response] = _HttpResponse.new(headers as any, undefined, trailersPromise);
    response.setStatusCode(statusCode);
    return response;
}

// ─── Response Outparam ───

function createResponseOutparam(): { outparam: WasiResponseOutparamInternal; promise: Promise<WasiOutgoingResponse | HttpErrorCode> } {
    let resolve!: (val: WasiOutgoingResponse | HttpErrorCode) => void;
    const promise = new Promise<WasiOutgoingResponse | HttpErrorCode>(r => { resolve = r; });

    const outparam: WasiResponseOutparamInternal = {
        _resolve(response) {
            if (response.tag === 'ok') {
                resolve(response.val);
            } else {
                resolve(response.val);
            }
        },
    };

    return { outparam, promise };
}

// ─── HTTP Server (delegates to P3 serve) ───

/**
 * Create an HTTP server that routes requests to a WASM incoming-handler.
 * Delegates to the P3 HTTP server and bridges P2 ↔ P3 semantics.
 *
 * @param handler The wasi:http/incoming-handler.handle function (P2 interface)
 * @param config Server configuration
 */
export function createHttpServer(handler: IncomingHandlerFn, config?: HttpServerConfig): WasiHttpServer {
    let serveHandle: ServeHandle | null = null;
    const maxUrlBytes = config?.network?.maxRequestUrlBytes ?? NETWORK_DEFAULTS.maxRequestUrlBytes;

    const p3Handler = {
        async handle(p3Request: unknown): Promise<unknown> {
            const req = p3Request as _HttpRequest;

            // Enforce URL length limit (P2-specific check, not done by P3 serve)
            const url = req.getPathWithQuery();
            if (url && url.length > maxUrlBytes) {
                return { tag: 'ok' as const, val: createP3ErrorResponse(414) };
            }

            // Consume P3 request body
            let resResolve!: (v: any) => void;
            const resPromise = new Promise<any>(r => { resResolve = r; });
            const [bodyStream] = _HttpRequest.consumeBody(req, resPromise);
            const bodyData = await collectBytes(bodyStream);
            resResolve(ok(undefined));

            // Create P2 request from P3 request metadata + buffered body
            const p2Request = createP2RequestFromP3(req, bodyData);

            // Create P2 response outparam
            const { outparam, promise } = createResponseOutparam();

            // Call P2 handler
            try {
                handler(p2Request, outparam);
            } catch {
                return { tag: 'ok' as const, val: createP3ErrorResponse(500) };
            }

            // Await P2 response
            const result = await promise;

            // Check for error code (has 'tag' property; WasiOutgoingResponse does not)
            if (typeof result === 'object' && 'tag' in result) {
                return { tag: 'ok' as const, val: createP3ErrorResponse(502) };
            }

            // Convert P2 response to P3 response
            return { tag: 'ok' as const, val: convertP2ResponseToP3(result as WasiOutgoingResponse) };
        },
    };

    return {
        async start(): Promise<number> {
            serveHandle = await p3Serve(p3Handler, {
                port: config?.port ?? 0,
                host: config?.hostname,
                network: config?.network,
            });
            return serveHandle.port;
        },
        async stop(): Promise<void> {
            if (serveHandle) {
                await serveHandle.close();
                serveHandle = null;
            }
        },
        port(): number {
            return serveHandle?.port ?? 0;
        },
    };
}


