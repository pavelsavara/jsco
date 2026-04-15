// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * wasi:http/types + wasi:http/outgoing-handler
 *
 * Browser-native HTTP client using fetch(). Implements the WASI HTTP
 * types (fields, requests, responses, bodies) and the outgoing-handler.
 *
 * Features:
 * - Fields resource wrapping Map<string, Uint8Array[]>
 * - OutgoingRequest with method, path, scheme, authority, headers, body
 * - IncomingResponse wrapping fetch Response
 * - FutureIncomingResponse wrapping fetch Promise → Pollable
 * - Request options: connect-timeout, first-byte-timeout, between-bytes-timeout
 * - Error mapping: fetch failures → WASI HTTP error-code variant
 * - Incoming handler: stub (would need Service Worker)
 */

import type {
    WasiInputStream,
    WasiOutputStream,
    WasiPollable,
    HttpMethod,
    HttpScheme,
    HttpErrorCode,
    HeaderError,
    HttpResult,
    WasiFields,
    WasiOutgoingRequest,
    WasiOutgoingBody,
    WasiRequestOptions,
    WasiIncomingResponse,
    WasiIncomingBody,
    WasiFutureIncomingResponse,
    WasiOutgoingHandler,
} from './api';
import type { FetchFn } from './types';
import { createInputStream, createOutputStream } from './streams';
import { createAsyncPollable } from './poll';

function httpOk<T>(val: T): HttpResult<T> {
    return { tag: 'ok', val };
}

function httpErr<T>(code: HttpErrorCode): HttpResult<T> {
    return { tag: 'err', val: code };
}

// ─── Fields ───

/** Forbidden headers that cannot be set via the WASI HTTP API */
const FORBIDDEN_HEADERS = new Set([
    'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailer', 'transfer-encoding', 'upgrade',
]);

function isValidHeaderName(name: string): boolean {
    return /^[a-zA-Z0-9!#$%&'*+\-.^_`|~]+$/.test(name);
}

function isValidHeaderValue(value: Uint8Array): boolean {
    // Header values must not contain NUL or bare CR/LF
    for (let i = 0; i < value.length; i++) {
        const b = value[i];
        if (b === 0x00 || b === 0x0a || b === 0x0d) return false;
    }
    return true;
}

/** Create a new empty Fields resource */
export function createFields(): WasiFields {
    return createFieldsFromMap(new Map());
}

/** Create Fields from a list of (name, value) pairs */
export function createFieldsFromList(entries: [string, Uint8Array][]): { tag: 'ok'; val: WasiFields } | { tag: 'err'; val: HeaderError } {
    const map = new Map<string, Uint8Array[]>();
    for (const [name, value] of entries) {
        const lower = name.toLowerCase();
        if (!isValidHeaderName(lower)) return { tag: 'err', val: { tag: 'invalid-syntax' } };
        if (!isValidHeaderValue(value)) return { tag: 'err', val: { tag: 'invalid-syntax' } };
        if (FORBIDDEN_HEADERS.has(lower)) return { tag: 'err', val: { tag: 'forbidden' } };
        const existing = map.get(lower) ?? [];
        existing.push(new Uint8Array(value));
        map.set(lower, existing);
    }
    return { tag: 'ok', val: createFieldsFromMap(map) };
}

function createFieldsFromMap(map: Map<string, Uint8Array[]>, immutable = false): WasiFields {
    const fields: WasiFields = {
        get(name: string): Uint8Array[] {
            return (map.get(name.toLowerCase()) ?? []).map(v => new Uint8Array(v));
        },

        has(name: string): boolean {
            return map.has(name.toLowerCase());
        },

        set(name: string, values: Uint8Array[]): { tag: 'ok' } | { tag: 'err'; val: HeaderError } {
            if (immutable) return { tag: 'err', val: { tag: 'immutable' } };
            const lower = name.toLowerCase();
            if (!isValidHeaderName(lower)) return { tag: 'err', val: { tag: 'invalid-syntax' } };
            if (FORBIDDEN_HEADERS.has(lower)) return { tag: 'err', val: { tag: 'forbidden' } };
            for (const v of values) {
                if (!isValidHeaderValue(v)) return { tag: 'err', val: { tag: 'invalid-syntax' } };
            }
            map.set(lower, values.map(v => new Uint8Array(v)));
            return { tag: 'ok' };
        },

        append(name: string, value: Uint8Array): { tag: 'ok' } | { tag: 'err'; val: HeaderError } {
            if (immutable) return { tag: 'err', val: { tag: 'immutable' } };
            const lower = name.toLowerCase();
            if (!isValidHeaderName(lower)) return { tag: 'err', val: { tag: 'invalid-syntax' } };
            if (!isValidHeaderValue(value)) return { tag: 'err', val: { tag: 'invalid-syntax' } };
            if (FORBIDDEN_HEADERS.has(lower)) return { tag: 'err', val: { tag: 'forbidden' } };
            const existing = map.get(lower) ?? [];
            existing.push(new Uint8Array(value));
            map.set(lower, existing);
            return { tag: 'ok' };
        },

        delete(name: string): { tag: 'ok' } | { tag: 'err'; val: HeaderError } {
            if (immutable) return { tag: 'err', val: { tag: 'immutable' } };
            const lower = name.toLowerCase();
            if (FORBIDDEN_HEADERS.has(lower)) return { tag: 'err', val: { tag: 'forbidden' } };
            map.delete(lower);
            return { tag: 'ok' };
        },

        entries(): [string, Uint8Array][] {
            const result: [string, Uint8Array][] = [];
            for (const [name, values] of map) {
                for (const value of values) {
                    result.push([name, new Uint8Array(value)]);
                }
            }
            return result;
        },

        clone(): WasiFields {
            const cloned = new Map<string, Uint8Array[]>();
            for (const [name, values] of map) {
                cloned.set(name, values.map(v => new Uint8Array(v)));
            }
            return createFieldsFromMap(cloned);
        },
    };

    return fields;
}

// ─── Outgoing Request ───

/** Create an outgoing request */
export function createOutgoingRequest(headers: WasiFields): WasiOutgoingRequest {
    let _method: HttpMethod = { tag: 'get' };
    let _pathWithQuery: string | undefined = undefined;
    let _scheme: HttpScheme | undefined = undefined;
    let _authority: string | undefined = undefined;
    let bodyTaken = false;
    const bodyChunks: Uint8Array[] = [];

    return {
        method: () => _method,
        setMethod(method: HttpMethod): boolean { _method = method; return true; },
        pathWithQuery: () => _pathWithQuery,
        setPathWithQuery(path: string | undefined): boolean { _pathWithQuery = path; return true; },
        scheme: () => _scheme,
        setScheme(scheme: HttpScheme | undefined): boolean { _scheme = scheme; return true; },
        authority: () => _authority,
        setAuthority(authority: string | undefined): boolean { _authority = authority; return true; },
        headers: () => headers,
        body(): HttpResult<WasiOutgoingBody> {
            if (bodyTaken) return httpErr({ tag: 'internal-error', val: 'body already taken' });
            bodyTaken = true;
            let streamTaken = false;
            return httpOk({
                write(): HttpResult<WasiOutputStream> {
                    if (streamTaken) return httpErr({ tag: 'internal-error', val: 'stream already taken' });
                    streamTaken = true;
                    return httpOk(createOutputStream((bytes) => {
                        bodyChunks.push(new Uint8Array(bytes));
                    }));
                },
            });
        },
        /** @internal — access the accumulated body bytes */
        _bodyChunks: () => bodyChunks,
        _headers: () => headers,
    } as WasiOutgoingRequest & { _bodyChunks(): Uint8Array[]; _headers(): WasiFields };
}

// ─── Request Options ───

/** Create request options */
export function createRequestOptions(): WasiRequestOptions {
    let _connectTimeout: bigint | undefined = undefined;
    let _firstByteTimeout: bigint | undefined = undefined;
    let _betweenBytesTimeout: bigint | undefined = undefined;

    return {
        connectTimeout: () => _connectTimeout,
        setConnectTimeout(timeout: bigint | undefined): boolean { _connectTimeout = timeout; return true; },
        firstByteTimeout: () => _firstByteTimeout,
        setFirstByteTimeout(timeout: bigint | undefined): boolean { _firstByteTimeout = timeout; return true; },
        betweenBytesTimeout: () => _betweenBytesTimeout,
        setBetweenBytesTimeout(timeout: bigint | undefined): boolean { _betweenBytesTimeout = timeout; return true; },
    };
}

// ─── Outgoing Body finish ───

/** Finish an outgoing-body — flush stream, mark complete */
export function finishOutgoingBody(_body: WasiOutgoingBody, _trailers?: WasiFields): HttpResult<void> {
    // The body is already collected via the write stream. Just accept and succeed.
    return httpOk(undefined);
}

// ─── Incoming Response ───

function createIncomingResponse(status: number, headers: WasiFields, bodyBytes: Uint8Array): WasiIncomingResponse {
    let consumed = false;

    return {
        status: () => status,
        headers: () => headers,
        consume(): HttpResult<WasiIncomingBody> {
            if (consumed) return httpErr({ tag: 'internal-error', val: 'body already consumed' });
            consumed = true;
            let streamTaken = false;
            return httpOk({
                stream(): HttpResult<WasiInputStream> {
                    if (streamTaken) return httpErr({ tag: 'internal-error', val: 'stream already taken' });
                    streamTaken = true;
                    return httpOk(createInputStream(bodyBytes));
                },
            });
        },
    };
}

// ─── Outgoing Handler ───

/** Convert an HttpMethod variant to a fetch method string */
function methodToString(method: HttpMethod): string {
    if (method.tag === 'other') return method.val;
    return method.tag.toUpperCase();
}

/** Build a URL string from request components */
function buildUrl(request: WasiOutgoingRequest): string {
    const scheme = request.scheme();
    const authority = request.authority();
    const pathWithQuery = request.pathWithQuery();

    let schemeStr = 'https';
    if (scheme) {
        if (scheme.tag === 'HTTP') schemeStr = 'http';
        else if (scheme.tag === 'HTTPS') schemeStr = 'https';
        else schemeStr = scheme.val;
    }

    const host = authority ?? 'localhost';
    const path = pathWithQuery ?? '/';

    return `${schemeStr}://${host}${path}`;
}

/** Build the fetch RequestInit from a WASI outgoing request */
function buildRequestInit(request: WasiOutgoingRequest & { _bodyChunks?(): Uint8Array[]; _headers?(): WasiFields }): RequestInit {
    const method = methodToString(request.method());
    const headers = new Headers();
    const wasiHeaders = (request as any)._headers ? (request as any)._headers() : request.headers();
    for (const [name, value] of wasiHeaders.entries()) {
        headers.append(name, new TextDecoder().decode(value));
    }

    const init: RequestInit = { method, headers };

    // Attach body for methods that support it
    const bodyChunks: Uint8Array[] | undefined = (request as any)._bodyChunks?.();
    if (bodyChunks && bodyChunks.length > 0) {
        const totalLength = bodyChunks.reduce((sum, c) => sum + c.length, 0);
        const body = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of bodyChunks) {
            body.set(chunk, offset);
            offset += chunk.length;
        }
        init.body = body;
    }

    return init;
}

/** Map a fetch error to an HttpErrorCode */
function mapFetchError(error: unknown): HttpErrorCode {
    if (error instanceof TypeError) {
        const msg = error.message.toLowerCase();
        if (msg.includes('network') || msg.includes('failed to fetch')) {
            return { tag: 'destination-unavailable' };
        }
        if (msg.includes('abort') || msg.includes('timeout') || msg.includes('timed out')) {
            return { tag: 'connection-timeout' };
        }
        if (msg.includes('dns')) {
            return { tag: 'DNS-error' };
        }
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
        return { tag: 'connection-timeout' };
    }
    return { tag: 'internal-error', val: error instanceof Error ? error.message : String(error) };
}

/** Calculate timeout in milliseconds from nanosecond options */
function getTimeoutMs(options?: WasiRequestOptions): number | undefined {
    if (!options) return undefined;
    // Use the shortest specified timeout
    const timeouts: bigint[] = [];
    const ct = options.connectTimeout();
    const fbt = options.firstByteTimeout();
    if (ct !== undefined) timeouts.push(ct);
    if (fbt !== undefined) timeouts.push(fbt);
    if (timeouts.length === 0) return undefined;
    const minNs = timeouts.reduce((a, b) => a < b ? a : b);
    return Number(minNs / 1_000_000n);
}

/**
 * Create a wasi:http/outgoing-handler implementation.
 *
 * @param fetchFn The fetch function to use. Defaults to globalThis.fetch.
 * @param maxHttpBodyBytes Maximum HTTP body size in bytes. Default: 2MB.
 */
export function createOutgoingHandler(fetchFn?: FetchFn, maxHttpBodyBytes?: number): WasiOutgoingHandler {
    const doFetch: FetchFn = fetchFn ?? globalThis.fetch.bind(globalThis);
    const bodyLimit = maxHttpBodyBytes ?? 2_097_152;

    return {
        handle(request: WasiOutgoingRequest, options?: WasiRequestOptions): HttpResult<WasiFutureIncomingResponse> {
            const url = buildUrl(request);
            const init = buildRequestInit(request);

            // Apply timeout if specified
            const timeoutMs = getTimeoutMs(options);
            if (timeoutMs !== undefined) {
                init.signal = AbortSignal.timeout(timeoutMs);
            }

            // Start the fetch
            let result: HttpResult<WasiIncomingResponse> | undefined = undefined;

            const fetchPromise = doFetch(url, init)
                .then(async (response) => {
                    // Enforce response body size limit via Content-Length header
                    if (bodyLimit !== undefined) {
                        const contentLength = response.headers.get('content-length');
                        if (contentLength !== null && parseInt(contentLength, 10) > bodyLimit) {
                            result = httpErr({ tag: 'HTTP-response-body-size', val: BigInt(parseInt(contentLength, 10)) });
                            return;
                        }
                    }

                    // Convert response headers to WasiFields
                    const headerEntries: [string, Uint8Array][] = [];
                    response.headers.forEach((value, name) => {
                        headerEntries.push([name, new TextEncoder().encode(value)]);
                    });
                    const fieldsResult = createFieldsFromList(headerEntries);
                    const responseHeaders = fieldsResult.tag === 'ok'
                        ? fieldsResult.val
                        : createFields(); // fallback if headers have forbidden names

                    // Stream body with size enforcement
                    const bodyChunks: Uint8Array[] = [];
                    let totalBodySize = 0;
                    if (response.body) {
                        const reader = response.body.getReader();
                        for (; ;) {
                            const { done, value: chunk } = await reader.read();
                            if (done) break;
                            totalBodySize += chunk.byteLength;
                            if (bodyLimit !== undefined && totalBodySize > bodyLimit) {
                                reader.cancel();
                                result = httpErr({ tag: 'HTTP-response-body-size', val: BigInt(totalBodySize) });
                                return;
                            }
                            bodyChunks.push(chunk);
                        }
                    }

                    // Concatenate chunks
                    const bodyBytes = new Uint8Array(totalBodySize);
                    let offset = 0;
                    for (const chunk of bodyChunks) {
                        bodyBytes.set(chunk, offset);
                        offset += chunk.byteLength;
                    }

                    result = httpOk(createIncomingResponse(response.status, responseHeaders, bodyBytes));
                })
                .catch((error) => {
                    result = httpErr(mapFetchError(error));
                });

            // Create pollable that resolves when fetch completes
            const pollable = createAsyncPollable(fetchPromise);

            return httpOk({
                subscribe(): WasiPollable {
                    return pollable;
                },
                get(): HttpResult<WasiIncomingResponse> | undefined {
                    return result;
                },
            });
        },
    };
}
