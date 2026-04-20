// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * HTTP-specific P2 type interfaces for the HTTP server.
 *
 * These types define the WASI P2 HTTP surface (fields, requests, responses,
 * bodies) used by the Node.js HTTP server bridge. They are intentionally
 * self-contained — the adapter core (index.ts, http.ts) has its own internal
 * type definitions; these exist solely for the node/http-server.ts bridge.
 */

import type {
    WasiPollable,
    WasiInputStream,
    WasiOutputStream,
} from './io';

// Re-export IO types used in HTTP interfaces
export type { WasiPollable, WasiInputStream, WasiOutputStream } from './io';

// ─── HTTP Types ───

/** wasi:http/types method variant */
export type HttpMethod =
    | { tag: 'get' }
    | { tag: 'head' }
    | { tag: 'post' }
    | { tag: 'put' }
    | { tag: 'delete' }
    | { tag: 'connect' }
    | { tag: 'options' }
    | { tag: 'trace' }
    | { tag: 'patch' }
    | { tag: 'other'; val: string };

/** wasi:http/types scheme variant */
export type HttpScheme =
    | { tag: 'HTTP' }
    | { tag: 'HTTPS' }
    | { tag: 'other'; val: string };

/** wasi:http/types error-code variant */
export type HttpErrorCode =
    | { tag: 'DNS-timeout' }
    | { tag: 'DNS-error'; val?: { rcode?: string; infoCode?: number } }
    | { tag: 'destination-not-found' }
    | { tag: 'destination-unavailable' }
    | { tag: 'destination-IP-prohibited' }
    | { tag: 'destination-IP-unroutable' }
    | { tag: 'connection-refused' }
    | { tag: 'connection-terminated' }
    | { tag: 'connection-timeout' }
    | { tag: 'connection-read-timeout' }
    | { tag: 'connection-write-timeout' }
    | { tag: 'connection-limit-reached' }
    | { tag: 'TLS-protocol-error' }
    | { tag: 'TLS-certificate-error' }
    | { tag: 'TLS-alert-received'; val?: { alertId?: number; alertMessage?: string } }
    | { tag: 'HTTP-request-denied' }
    | { tag: 'HTTP-request-length-required' }
    | { tag: 'HTTP-request-body-size'; val?: bigint }
    | { tag: 'HTTP-request-method-invalid' }
    | { tag: 'HTTP-request-URI-invalid' }
    | { tag: 'HTTP-request-URI-too-long' }
    | { tag: 'HTTP-request-header-section-size'; val?: number }
    | { tag: 'HTTP-request-header-size'; val?: { fieldName?: string; fieldSize?: number } }
    | { tag: 'HTTP-request-trailer-section-size'; val?: number }
    | { tag: 'HTTP-request-trailer-size'; val: { fieldName?: string; fieldSize?: number } }
    | { tag: 'HTTP-response-incomplete' }
    | { tag: 'HTTP-response-header-section-size'; val?: number }
    | { tag: 'HTTP-response-header-size'; val: { fieldName?: string; fieldSize?: number } }
    | { tag: 'HTTP-response-body-size'; val?: bigint }
    | { tag: 'HTTP-response-trailer-section-size'; val?: number }
    | { tag: 'HTTP-response-trailer-size'; val: { fieldName?: string; fieldSize?: number } }
    | { tag: 'HTTP-response-transfer-coding'; val?: string }
    | { tag: 'HTTP-response-content-coding'; val?: string }
    | { tag: 'HTTP-response-timeout' }
    | { tag: 'HTTP-upgrade-failed' }
    | { tag: 'HTTP-protocol-error' }
    | { tag: 'loop-detected' }
    | { tag: 'configuration-error' }
    | { tag: 'internal-error'; val?: string };

/** wasi:http/types header-error */
export type HeaderError =
    | { tag: 'invalid-syntax' }
    | { tag: 'forbidden' }
    | { tag: 'immutable' };

/** Result type for HTTP operations */
export type HttpResult<T> = { tag: 'ok'; val: T } | { tag: 'err'; val: HttpErrorCode };

/** wasi:http/types fields resource — HTTP headers/trailers */
export interface WasiFields {
    get(name: string): Uint8Array[];
    has(name: string): boolean;
    set(name: string, values: Uint8Array[]): { tag: 'ok' } | { tag: 'err'; val: HeaderError };
    append(name: string, value: Uint8Array): { tag: 'ok' } | { tag: 'err'; val: HeaderError };
    delete(name: string): { tag: 'ok' } | { tag: 'err'; val: HeaderError };
    entries(): [string, Uint8Array][];
    clone(): WasiFields;
}

/** wasi:http/types incoming-request resource */
export interface WasiIncomingRequest {
    method(): HttpMethod;
    pathWithQuery(): string | undefined;
    scheme(): HttpScheme | undefined;
    authority(): string | undefined;
    headers(): WasiFields;
    consume(): HttpResult<WasiIncomingBody>;
}

/** wasi:http/types incoming-body resource */
export interface WasiIncomingBody {
    stream(): HttpResult<WasiInputStream>;
}

/** wasi:http/types outgoing-body resource */
export interface WasiOutgoingBody {
    write(): HttpResult<WasiOutputStream>;
}

/** wasi:http/types outgoing-response resource */
export interface WasiOutgoingResponse {
    statusCode(): number;
    setStatusCode(code: number): boolean;
    headers(): WasiFields;
    body(): HttpResult<WasiOutgoingBody>;
}

/** wasi:http/types response-outparam resource */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface WasiResponseOutparam {
}

/** @internal Extended WasiResponseOutparam with resolve callback */
export interface WasiResponseOutparamInternal extends WasiResponseOutparam {
    _resolve(response: { tag: 'ok'; val: WasiOutgoingResponse } | { tag: 'err'; val: HttpErrorCode }): void;
}

/** Handler function type matching wasi:http/incoming-handler.handle */
export type IncomingHandlerFn = (request: WasiIncomingRequest, responseOut: WasiResponseOutparam) => void;

/** wasi:http/types future-trailers resource */
export interface WasiFutureTrailers {
    subscribe(): WasiPollable;
    get(): { tag: 'ok'; val: { tag: 'ok'; val: WasiFields | undefined } } | { tag: 'err'; val: string } | undefined;
}

// ─── Server Config ───

/** Networking configuration */
export interface NetworkConfig {
    maxHttpBodyBytes?: number;
    maxHttpHeadersBytes?: number;
    socketBufferBytes?: number;
    maxTcpPendingConnections?: number;
    tcpIdleTimeoutMs?: number;
    httpRequestTimeoutMs?: number;
    maxUdpDatagrams?: number;
    dnsTimeoutMs?: number;
    maxConcurrentDnsLookups?: number;
    maxHttpConnections?: number;
    maxRequestUrlBytes?: number;
    httpHeadersTimeoutMs?: number;
    httpKeepAliveTimeoutMs?: number;
}

export const NETWORK_DEFAULTS = {
    maxHttpBodyBytes: 2_097_152,
    maxHttpHeadersBytes: 204_800,
    socketBufferBytes: 204_800,
    maxTcpPendingConnections: 500,
    tcpIdleTimeoutMs: 120_000,
    httpRequestTimeoutMs: 30_000,
    maxUdpDatagrams: 1_000,
    dnsTimeoutMs: 5_000,
    maxConcurrentDnsLookups: 100,
    maxHttpConnections: 1_000,
    maxRequestUrlBytes: 8_192,
    httpHeadersTimeoutMs: 60_000,
    httpKeepAliveTimeoutMs: 5_000,
} as const;

/** Configuration for the HTTP server */
export interface HttpServerConfig {
    port?: number;
    hostname?: string;
    network?: NetworkConfig;
}

/** HTTP server handle */
export interface WasiHttpServer {
    start(): Promise<number>;
    stop(): Promise<void>;
    port(): number;
}

export interface ServeInstance {
    exports: Record<string, Record<string, Function> | undefined>;
}

// ─── Fields Factory ───

/** Forbidden headers that cannot be set via the WASI HTTP API */
const FORBIDDEN_HEADERS = new Set([
    'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailer', 'transfer-encoding', 'upgrade',
]);

function isValidHeaderName(name: string): boolean {
    return /^[a-zA-Z0-9!#$%&'*+\-.^_`|~]+$/.test(name);
}

function isValidHeaderValue(value: Uint8Array): boolean {
    for (let i = 0; i < value.length; i++) {
        const b = value[i];
        if (b === 0x00 || b === 0x0a || b === 0x0d) return false;
    }
    return true;
}

function createFieldsFromMap(map: Map<string, Uint8Array[]>, immutable = false): WasiFields {
    return {
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
