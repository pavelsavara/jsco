// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * HTTP-specific P2 type interfaces for the HTTP server bridge.
 *
 * Types that are identical to P3 (NetworkConfig, NETWORK_DEFAULTS, HttpMethod,
 * HttpScheme) are re-exported from wasip3/types and wasip3/http. P2-specific
 * resource interfaces (WasiFields, WasiIncomingRequest, WasiOutgoingResponse,
 * etc.) remain here because they have no P3 equivalent.
 */

import type {
    WasiPollable,
    WasiInputStream,
    WasiOutputStream,
} from './io';

// Re-export IO types used in HTTP interfaces
export type { WasiPollable, WasiInputStream, WasiOutputStream } from './io';

// Re-export types shared with P3
export type { NetworkConfig } from '../wasip3';
import type { NetworkConfig } from '../wasip3';
export { NETWORK_DEFAULTS } from '../wasip3';
import type { _HttpMethod, _HttpScheme } from '../wasip3';
export type { _HttpMethod as HttpMethod, _HttpScheme as HttpScheme } from '../wasip3';

import type {
    AdapterFields, AdapterOutgoingRequest, AdapterRequestOptions,
    AdapterOutgoingBody, AdapterIncomingResponse, AdapterIncomingBody,
    AdapterFutureIncomingResponse,
} from './http';

// Local aliases for use in this file
type HttpMethod = _HttpMethod;
type HttpScheme = _HttpScheme;

// ─── Adapter factory return type ───

export interface AdaptedHttpTypes {
    createFields: () => AdapterFields;
    createFieldsFromList: (entries: [string, Uint8Array][]) => AdapterFields;
    createOutgoingRequest: (headers: AdapterFields) => AdapterOutgoingRequest;
    createRequestOptions: () => AdapterRequestOptions;
    AdapterOutgoingBody: typeof AdapterOutgoingBody;
    AdapterIncomingResponse: typeof AdapterIncomingResponse;
    AdapterIncomingBody: typeof AdapterIncomingBody;
    AdapterFutureIncomingResponse: typeof AdapterFutureIncomingResponse;
}

// ─── HTTP Types ───

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


