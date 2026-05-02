// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

/**
 * WASIp3 HTTP Server — Node.js implementation.
 *
 * `serve(handler, config?)` starts an `http.Server` that routes incoming
 * HTTP requests to a WASM handler export (`wasi:http/handler.handle`).
 */

import * as http from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';

import type { WasiStreamReadable } from '../streams';
import type { NetworkConfig } from '../types';
import { ok } from '../result';
import { NETWORK_DEFAULTS } from '../types';

/** Default cap for chained `linkHandler` recursion depth (S1). */
const DEFAULT_MAX_HANDLER_CHAIN_DEPTH = 8;
/** Per-async-context handler chain depth, scoped by `linkHandler` wrappers. */
const handlerDepthStore = new AsyncLocalStorage<number>();
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
    /** Called when a request handler throws. Silent by default. */
    onError?: (message: string, error: unknown) => void;
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
        // Field values may be plain Array<number> when lifted from a wasm
        // list<u8>; coerce to Uint8Array for TextDecoder.
        const bytes = value instanceof Uint8Array ? value : Uint8Array.from(value as ArrayLike<number>);
        const decoded = new TextDecoder().decode(bytes);
        const existing = res.getHeader(name);
        if (existing !== undefined) {
            const arr = Array.isArray(existing) ? existing : [String(existing)];
            arr.push(decoded);
            res.setHeader(name, arr);
        } else {
            res.setHeader(name, decoded);
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

/** Default WIT interface name for the P3 WASI HTTP handler. */
export const WASI_HTTP_HANDLER_INTERFACE = 'wasi:http/handler@0.3.0-rc-2026-03-15' as const;

/**
 * Build an `imports` fragment that satisfies one component instance's
 * `wasi:http/handler` import (or any equivalent renamed interface) with
 * another instance's handler export. Pure JavaScript wiring — no binary
 * fusion, no host-side stub.
 *
 * Usage:
 * ```ts
 * const inner = await (await createComponent(echo)).instantiate(host);
 * const outer = await (await createComponent(middleware)).instantiate({
 *     ...host,
 *     ...linkHandler(inner),
 * });
 * ```
 *
 * Pass `opts.as` to expose the export under a different interface name
 * (e.g. when the importing guest renames the interface to
 * `local:local/chain-http`).
 *
 * Throws if the provider does not export the canonical
 * `wasi:http/handler@0.3.0-rc-2026-03-15` interface.
 *
 * `opts.maxDepth` (default 8) caps the recursion depth across chained
 * `linkHandler` calls. Each invocation of the returned `handle()` increments
 * a per-async-context counter (Node `AsyncLocalStorage`), so a wiring like
 * `A.handler -> B.handler -> A.handler -> ...` aborts with a clear error
 * before the JSPI stack or the host event loop collapses. Concurrent
 * unrelated requests get independent counters.
 *
 * Trust boundaries (S5): `linkHandler` does **no** header filtering.
 * Inbound `Authorization`, `Cookie`, `Proxy-Authorization`, `Set-Cookie`,
 * and similar credential-bearing headers are forwarded verbatim. If the
 * chain crosses a trust boundary (e.g. a third-party middleware), insert
 * a JS- or component-level filter between layers; this helper is sugar,
 * not a security boundary.
 */
export function linkHandler(
    provider: { exports: Record<string, unknown> },
    opts?: { as?: string; maxDepth?: number },
): Record<string, WasiHttpHandlerExport> {
    const ex = provider.exports[WASI_HTTP_HANDLER_INTERFACE];
    if (!ex || typeof (ex as WasiHttpHandlerExport).handle !== 'function') {
        throw new Error(
            `linkHandler: provider does not export ${WASI_HTTP_HANDLER_INTERFACE} `
            + 'with a handle() method',
        );
    }
    const inner = ex as WasiHttpHandlerExport;
    const maxDepth = opts?.maxDepth ?? DEFAULT_MAX_HANDLER_CHAIN_DEPTH;
    const importName = opts?.as ?? WASI_HTTP_HANDLER_INTERFACE;
    const wrapped: WasiHttpHandlerExport = {
        async handle(request: unknown): Promise<unknown> {
            const depth = (handlerDepthStore.getStore() ?? 0) + 1;
            if (depth > maxDepth) {
                throw new Error(
                    `linkHandler: handler chain depth ${depth} exceeds maxDepth=${maxDepth} `
                    + '(possible recursive wiring)',
                );
            }
            return handlerDepthStore.run(depth, () => inner.handle(request));
        },
    };
    return { [importName]: wrapped };
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
    const onError = config?.onError ?? ((): void => { /* silent by default */ });
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

        // Per-request timeout. unref() so a stuck timer alone never keeps Node
        // alive past the natural end of the test/process.
        const timer = setTimeout(() => {
            if (!res.headersSent) {
                res.writeHead(504, { 'Content-Type': 'text/plain' });
            }
            res.end('Gateway Timeout');
        }, requestTimeoutMs);
        (timer as unknown as { unref?: () => void }).unref?.();

        (async (): Promise<void> => {
            try {
                const [request, completionFuture] = nodeRequestToWasi(req, limits);
                const handlerResult = await handler.handle(request);

                // WIT spec: `handle` returns result<response, error-code>.
                if (handlerResult === null || typeof handlerResult !== 'object' || !('tag' in (handlerResult as object))) {
                    throw new Error('handler returned non-Result value (expected { tag: "ok" | "err", val })');
                }
                const r = handlerResult as { tag: string; val?: unknown };
                if (r.tag === 'err') {
                    if (!res.headersSent) {
                        res.writeHead(500, { 'Content-Type': 'text/plain' });
                    }
                    res.end('Handler returned error');
                    return;
                }
                const response = r.val;

                // If handler succeeded, resolve the request completion
                completionFuture.then(() => { /* consumed by request internals */ });

                await writeWasiResponse(res, response);
            } catch (e) {
                onError('jsco serve: request handler threw:', e);
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

            // Drop any keep-alive sockets that fetch() / undici left idle —
            // Node `server.close()` otherwise waits for them to time out, which
            // shows up in jest as "a worker process has failed to exit
            // gracefully". `closeAllConnections` requires Node 18.2+.
            const srv = server as http.Server & {
                closeIdleConnections?: () => void;
                closeAllConnections?: () => void;
            };
            srv.closeIdleConnections?.();
            srv.closeAllConnections?.();

            await new Promise<void>((resolve, reject) => {
                server.close((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        },
    };
}
