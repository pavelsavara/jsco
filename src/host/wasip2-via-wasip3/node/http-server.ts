// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * wasi:http/incoming-handler — Node.js HTTP server integration
 *
 * Bridges Node.js http.Server requests to WASM components that export
 * wasi:http/incoming-handler. The WASM component receives an incoming-request
 * resource and a response-outparam resource, then writes back the response.
 *
 * Usage:
 *   const server = createHttpServer(wasmHandler, { port: 8080 });
 *   server.start(); // starts listening
 *   server.stop();  // graceful shutdown
 */

import type { IncomingMessage, ServerResponse, Server as HttpServer } from 'node:http';
import type {
    WasiFields,
    WasiIncomingBody,
    HttpMethod,
    HttpScheme,
    HttpErrorCode,
    HttpResult,
    WasiIncomingRequest,
    WasiOutgoingResponse,
    WasiResponseOutparam,
    WasiResponseOutparamInternal,
    IncomingHandlerFn,
    WasiFutureTrailers,
    HttpServerConfig,
    WasiHttpServer,
    WasiOutputStream,
} from '../http-types';
import { createFields, createFieldsFromList, NETWORK_DEFAULTS } from '../http-types';
import { createInputStream, createOutputStream, createSyncPollable } from '../io';

// ─── Incoming Request ───

/** Create an incoming request from a Node.js IncomingMessage with a streaming body */
function createIncomingRequest(req: IncomingMessage, bodyStream: ReturnType<typeof createInputStream>): WasiIncomingRequest {
    let consumed = false;

    // Build headers — filter out hop-by-hop headers that createFieldsFromList rejects
    const INCOMING_SKIP_HEADERS = new Set([
        'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
        'te', 'trailer', 'transfer-encoding', 'upgrade',
    ]);
    const headerEntries: [string, Uint8Array][] = [];
    for (const [name, value] of Object.entries(req.headers)) {
        if (value === undefined) continue;
        if (INCOMING_SKIP_HEADERS.has(name.toLowerCase())) continue;
        const values = Array.isArray(value) ? value : [value];
        for (const v of values) {
            headerEntries.push([name, new TextEncoder().encode(v)]);
        }
    }
    const fieldsResult = createFieldsFromList(headerEntries);
    const fields = fieldsResult.tag === 'ok' ? fieldsResult.val : createFields();

    const method = parseMethod(req.method ?? 'GET');
    const pathWithQuery = req.url;
    const scheme: HttpScheme | undefined = (req as any).socket?.encrypted ? { tag: 'HTTPS' } : { tag: 'HTTP' };
    const authority = req.headers.host;

    return {
        method: () => method,
        pathWithQuery: () => pathWithQuery,
        scheme: () => scheme,
        authority: () => authority,
        headers: () => fields,
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

function parseMethod(method: string): HttpMethod {
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

// ─── Outgoing Response ───

/** Create an outgoing response */
export function createOutgoingResponse(headers: WasiFields): WasiOutgoingResponse {
    let _statusCode = 200;
    let bodyTaken = false;
    const bodyChunks: Uint8Array[] = [];

    return {
        statusCode: () => _statusCode,
        setStatusCode(code: number): boolean {
            if (code < 100 || code > 999) return false;
            _statusCode = code;
            return true;
        },
        headers: () => headers,
        body(): HttpResult<{ write(): HttpResult<WasiOutputStream> }> {
            if (bodyTaken) return { tag: 'err', val: { tag: 'internal-error', val: 'body already taken' } };
            bodyTaken = true;
            let streamTaken = false;
            return {
                tag: 'ok',
                val: {
                    write(): HttpResult<WasiOutputStream> {
                        if (streamTaken) return { tag: 'err', val: { tag: 'internal-error', val: 'stream already taken' } };
                        streamTaken = true;
                        return {
                            tag: 'ok',
                            val: createOutputStream((bytes) => { bodyChunks.push(new Uint8Array(bytes)); }),
                        };
                    },
                },
            };
        },
        /** @internal */
        _bodyChunks: () => bodyChunks,
        _headers: () => headers,
    } as WasiOutgoingResponse & { _bodyChunks(): Uint8Array[]; _headers(): WasiFields };
}

// ─── Response Outparam ───

/** Create a response-outparam */
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

// ─── HTTP Server ───

/**
 * Create an HTTP server that routes requests to a WASM incoming-handler.
 *
 * @param handler The wasi:http/incoming-handler.handle function
 * @param config Server configuration
 */
export function createHttpServer(handler: IncomingHandlerFn, config?: HttpServerConfig): WasiHttpServer {
    let http: typeof import('node:http');
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
        http = require('node:http') as typeof import('node:http');
    } catch {
        throw new Error('HTTP server requires Node.js');
    }

    const hostname = config?.hostname ?? '127.0.0.1';
    const requestedPort = config?.port ?? 0;
    const maxBodyBytes = config?.network?.maxHttpBodyBytes ?? NETWORK_DEFAULTS.maxHttpBodyBytes;
    const maxHeadersBytes = config?.network?.maxHttpHeadersBytes ?? NETWORK_DEFAULTS.maxHttpHeadersBytes;
    const requestTimeoutMs = config?.network?.httpRequestTimeoutMs ?? NETWORK_DEFAULTS.httpRequestTimeoutMs;
    const maxConnections = config?.network?.maxHttpConnections ?? NETWORK_DEFAULTS.maxHttpConnections;
    const maxUrlBytes = config?.network?.maxRequestUrlBytes ?? NETWORK_DEFAULTS.maxRequestUrlBytes;
    const headersTimeoutMs = config?.network?.httpHeadersTimeoutMs ?? NETWORK_DEFAULTS.httpHeadersTimeoutMs;
    const keepAliveTimeoutMs = config?.network?.httpKeepAliveTimeoutMs ?? NETWORK_DEFAULTS.httpKeepAliveTimeoutMs;
    let actualPort = 0;
    let server: HttpServer | null = null;

    /** Measure total incoming header size */
    function measureHeaderBytes(req: IncomingMessage): number {
        let total = 0;
        const raw = req.rawHeaders;
        for (let i = 0; i < raw.length; i++) {
            total += raw[i]!.length;
        }
        return total;
    }

    /** Measure total outgoing response header size */
    function measureFieldsBytes(fields: WasiFields): number {
        let total = 0;
        for (const [name, value] of fields.entries()) {
            total += name.length + value.byteLength;
        }
        return total;
    }

    async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
        // Enforce URL length limit
        if (req.url && req.url.length > maxUrlBytes) {
            res.writeHead(414);
            res.end('URI Too Long');
            return;
        }

        // Enforce incoming header size limit
        if (measureHeaderBytes(req) > maxHeadersBytes) {
            res.writeHead(431);
            res.end('Request Header Fields Too Large');
            return;
        }

        // Collect body with size limit (streamed to WASM handler)
        const bodyChunks: Buffer[] = [];
        let bodySize = 0;
        let bodyTooLarge = false;

        await new Promise<void>(resolve => {
            if (req.complete) { resolve(); return; }
            req.on('data', (chunk: Buffer) => {
                bodySize += chunk.length;
                if (bodySize > maxBodyBytes) {
                    bodyTooLarge = true;
                    req.destroy();
                    resolve();
                    return;
                }
                bodyChunks.push(chunk);
            });
            req.on('end', resolve);
            req.on('error', resolve);
        });

        if (bodyTooLarge) {
            res.writeHead(413);
            res.end('Payload Too Large');
            return;
        }

        const bodyData = Buffer.concat(bodyChunks);
        const bodyStream = createInputStream(new Uint8Array(bodyData));

        const incomingRequest = createIncomingRequest(req, bodyStream);
        const { outparam, promise } = createResponseOutparam();

        // Call WASM handler
        try {
            handler(incomingRequest, outparam);
        } catch (err) {
            res.writeHead(500);
            res.end('Internal Server Error');
            return;
        }

        // Wait for response with timeout
        const timeoutPromise = new Promise<'timeout'>(resolve => {
            setTimeout(() => resolve('timeout'), requestTimeoutMs);
        });
        const raceResult = await Promise.race([promise, timeoutPromise]);

        if (raceResult === 'timeout') {
            if (!res.headersSent) {
                res.writeHead(504);
                res.end('Gateway Timeout');
            }
            return;
        }
        const result = raceResult;

        if (typeof result === 'object' && 'tag' in result) {
            // Error code
            res.writeHead(502);
            res.end(`Gateway Error: ${(result as HttpErrorCode).tag}`);
            return;
        }

        const response = result as WasiOutgoingResponse;
        const responseWithInternal = response as WasiOutgoingResponse & { _bodyChunks?(): Uint8Array[]; _headers?(): WasiFields };

        // Validate outgoing response headers size
        const headerFields = responseWithInternal._headers ? responseWithInternal._headers() : response.headers();
        if (measureFieldsBytes(headerFields) > maxHeadersBytes) {
            res.writeHead(502);
            res.end('Response Header Fields Too Large');
            return;
        }

        // Write status and headers
        const statusCode = response.statusCode();
        const headers: Record<string, string[]> = {};
        for (const [name, value] of headerFields.entries()) {
            if (!headers[name]) headers[name] = [];
            headers[name]!.push(new TextDecoder().decode(value));
        }
        res.writeHead(statusCode, headers);

        // Write body with size enforcement
        const responseBodyChunks = responseWithInternal._bodyChunks?.() ?? [];
        let totalResponseBody = 0;
        for (const chunk of responseBodyChunks) {
            totalResponseBody += chunk.byteLength;
            if (totalResponseBody > maxBodyBytes) {
                res.end();
                return;
            }
            res.write(chunk);
        }
        res.end();
    }

    return {
        start(): Promise<number> {
            return new Promise<number>((resolve, reject) => {
                server = http.createServer((req, res) => {
                    handleRequest(req, res).catch(err => {
                        if (!res.headersSent) {
                            res.writeHead(500);
                            res.end('Internal Server Error');
                        }
                        void err; // swallow handler error
                    });
                });
                // Slowloris protection: time allowed for client to send complete headers
                server.headersTimeout = headersTimeoutMs;
                // Keep-alive timeout: time to wait for next request on a keep-alive connection
                server.keepAliveTimeout = keepAliveTimeoutMs;
                // Max concurrent connections
                server.maxConnections = maxConnections;
                server.on('error', reject);
                server.listen(requestedPort, hostname, () => {
                    const addr = server!.address();
                    actualPort = typeof addr === 'object' && addr ? addr.port : requestedPort;
                    resolve(actualPort);
                });
            });
        },
        stop(): Promise<void> {
            return new Promise<void>((resolve, reject) => {
                if (!server) { resolve(); return; }
                server.close((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        },
        port: () => actualPort,
    };
}

// ─── Static response-outparam.set function ───

/** wasi:http/types response-outparam.set — static function */
export function responseOutparamSet(
    param: WasiResponseOutparam,
    response: { tag: 'ok'; val: WasiOutgoingResponse } | { tag: 'err'; val: HttpErrorCode },
): void {
    (param as WasiResponseOutparamInternal)._resolve(response);
}

// ─── Future Trailers (for incoming-body.finish) ───

/** Create a future-trailers that immediately resolves with no trailers */
export function createFutureTrailers(): WasiFutureTrailers {
    let consumed = false;
    return {
        subscribe: () => createSyncPollable(() => true),
        get: () => {
            if (consumed) return undefined;
            consumed = true;
            return { tag: 'ok', val: { tag: 'ok', val: undefined } };
        },
    };
}
