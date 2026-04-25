// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * WASIp3 HTTP Server — Node.js implementation.
 *
 * `serve(handler, config?)` starts an `http.Server` that routes incoming
 * HTTP requests to a WASM handler export (`wasi:http/handler.handle`).
 */

import * as http from 'node:http';

import type { WasiStreamReadable } from '../streams';
import type { NetworkConfig } from '../types';
import { ok } from '../result';
import { NETWORK_DEFAULTS } from '../types';
import {
    _HttpFields as HttpFields,
    _HttpRequest as HttpRequest,
    _HttpResponse as HttpResponse,
    _getHttpLimits as getHttpLimits,
} from '../http';
import type {
    _HttpLimits as HttpLimits,
    _HttpResult as Result,
    _HttpErrorCode as ErrorCode,
    _HttpMethod as Method,
    _HttpScheme as Scheme,
} from '../http';

// ──────────────────── Server config ────────────────────

export interface ServeConfig {
    /** Port to listen on. Default: 8080 */
    port?: number;
    /** Host to bind to. Default: '127.0.0.1' */
    host?: string;
    /** Network limits and timeouts */
    network?: NetworkConfig;
}

export interface ServeHandle {
    /** The underlying http.Server */
    server: http.Server;
    /** The actual port the server is listening on */
    port: number;
    /** Gracefully shut down the server */
    close(): Promise<void>;
}

// ──────────────────── Method parsing ────────────────────

function parseMethod(method: string): Method {
    switch (method.toUpperCase()) {
        case 'GET': return { tag: 'get' };
        case 'HEAD': return { tag: 'head' };
        case 'POST': return { tag: 'post' };
        case 'PUT': return { tag: 'put' };
        case 'DELETE': return { tag: 'delete' };
        case 'CONNECT': return { tag: 'connect' };
        case 'OPTIONS': return { tag: 'options' };
        case 'TRACE': return { tag: 'trace' };
        case 'PATCH': return { tag: 'patch' };
        default: return { tag: 'other', val: method };
    }
}

// ──────────────────── Request conversion ────────────────────

function nodeRequestToWasi(
    req: http.IncomingMessage,
    limits: HttpLimits,
): [unknown, Promise<Result<void, ErrorCode>>] {
    // Parse headers
    const headerEntries: Array<[string, Uint8Array]> = [];
    const rawHeaders = req.rawHeaders;
    for (let i = 0; i < rawHeaders.length; i += 2) {
        const name = rawHeaders[i]!;
        const value = rawHeaders[i + 1]!;
        headerEntries.push([name, new TextEncoder().encode(value)]);
    }
    const headers = HttpFields.fromIncomingList(headerEntries, limits);

    // Streaming request body
    const bodyStream: WasiStreamReadable<Uint8Array> = {
        async *[Symbol.asyncIterator]() {
            let totalBytes = 0;
            for await (const chunk of req) {
                const buf = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk as Buffer);
                totalBytes += buf.length;
                if (totalBytes > limits.maxHttpBodyBytes) {
                    throw new Error('request body size exceeded');
                }
                yield buf;
            }
        },
    };

    // No trailers for now
    const trailersPromise = Promise.resolve(
        ok(undefined) as Result<HttpFields | undefined, ErrorCode>,
    );

    const [request, completionFuture] = HttpRequest.new(
        headers as unknown as InstanceType<typeof HttpFields>,
        bodyStream,
        trailersPromise as Promise<Result<HttpFields | undefined, ErrorCode>>,
        undefined,
    );

    // Set method
    request.setMethod(parseMethod(req.method ?? 'GET'));

    // Set scheme (always HTTP for plain http.Server)
    request.setScheme({ tag: 'HTTP' } as Scheme);

    // Set authority from Host header
    const hostHeader = req.headers.host;
    if (hostHeader) {
        request.setAuthority(hostHeader);
    }

    // Set path with query
    request.setPathWithQuery(req.url ?? '/');

    return [request, completionFuture];
}

// ──────────────────── Response writing ────────────────────

async function writeWasiResponse(
    res: http.ServerResponse,
    wasiResponse: unknown,
): Promise<void> {
    const response = wasiResponse as HttpResponse;

    // Write status code
    const statusCode = response._internalStatusCode;
    res.statusCode = statusCode;

    // Write headers
    const headers = response._internalHeaders;
    for (const [name, value] of headers.copyAll()) {
        const existing = res.getHeader(name);
        if (existing !== undefined) {
            const arr = Array.isArray(existing) ? existing : [String(existing)];
            arr.push(new TextDecoder().decode(value));
            res.setHeader(name, arr);
        } else {
            res.setHeader(name, new TextDecoder().decode(value));
        }
    }

    // Stream response body
    const contents = response._internalContents;
    if (contents) {
        for await (const chunk of contents) {
            await new Promise<void>((resolve, reject) => {
                const ok = res.write(chunk);
                if (ok) {
                    resolve();
                } else {
                    res.once('drain', resolve);
                    res.once('error', reject);
                }
            });
        }
    }

    // Signal completion
    response._internalCompletionResolve(ok(undefined));

    // End the response
    await new Promise<void>((resolve) => {
        res.end(resolve);
    });
}

// ──────────────────── Handler type ────────────────────

export interface WasiHttpHandlerExport {
    handle(request: unknown): Promise<unknown>;
}

// ──────────────────── serve() ────────────────────

export async function serve(
    handler: WasiHttpHandlerExport,
    config?: ServeConfig,
): Promise<ServeHandle> {
    const port = config?.port ?? 8080;
    const host = config?.host ?? '127.0.0.1';
    const network = config?.network;
    const limits = getHttpLimits(network);

    const requestTimeoutMs = network?.httpRequestTimeoutMs ?? NETWORK_DEFAULTS.httpRequestTimeoutMs;
    const headersTimeoutMs = network?.httpHeadersTimeoutMs ?? NETWORK_DEFAULTS.httpHeadersTimeoutMs;
    const keepAliveTimeoutMs = network?.httpKeepAliveTimeoutMs ?? NETWORK_DEFAULTS.httpKeepAliveTimeoutMs;

    const server = http.createServer();

    // Security: set timeouts to prevent Slowloris and idle connections
    server.headersTimeout = headersTimeoutMs;
    server.keepAliveTimeout = keepAliveTimeoutMs;

    // Track active connections for graceful shutdown
    const activeConnections = new Set<http.ServerResponse>();

    server.on('request', (req: http.IncomingMessage, res: http.ServerResponse) => {
        activeConnections.add(res);
        res.on('close', () => activeConnections.delete(res));

        // Per-request timeout
        const timer = setTimeout(() => {
            if (!res.headersSent) {
                res.writeHead(504, { 'Content-Type': 'text/plain' });
            }
            res.end('Gateway Timeout');
        }, requestTimeoutMs);

        (async (): Promise<void> => {
            try {
                const [request, completionFuture] = nodeRequestToWasi(req, limits);
                const response = await handler.handle(request);

                // If handler succeeded, resolve the request completion
                completionFuture.then(() => { /* consumed by request internals */ });

                await writeWasiResponse(res, response);
            } catch (e) {
                if (!res.headersSent) {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                }
                res.end('Internal Server Error');
            } finally {
                clearTimeout(timer);
            }
        })();
    });

    // Start listening
    await new Promise<void>((resolve) => {
        server.listen(port, host, () => {
            resolve();
        });
    });

    const actualPort = (server.address() as { port: number }).port;

    return {
        server,
        port: actualPort,
        async close(): Promise<void> {
            // Close all active connections
            for (const res of activeConnections) {
                res.end();
            }
            activeConnections.clear();

            await new Promise<void>((resolve, reject) => {
                server.close((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        },
    };
}
