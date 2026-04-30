// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

/**
 * wasi:http adapter — bridges P3 http (client/handler) to P2 (outgoing-handler/types).
 *
 * Key differences:
 * - P3 `client.send(request)` → P2 `outgoing-handler.handle(request, options?)`
 * - P3 returns `async result<response, error-code>` → P2 returns `future-incoming-response`
 * - P3 request/response use streams directly → P2 uses outgoing-body/incoming-body resources
 */

import type { WasiP3Imports } from '../wasip3';
import type { WasiPollable, WasiInputStream, WasiOutputStream } from './io';
import { createSyncPollable, createAsyncPollable, createInputStream, createOutputStream } from './io';
import type { HttpMethod, HttpScheme, AdaptedHttpTypes } from './http-types';
import { ok, err } from '../wasip3';

type HttpErrorCode = { tag: string; val?: unknown };
type HeaderError = { tag: string };
type HttpResult<T> = { tag: 'ok'; val: T } | { tag: 'err'; val: HttpErrorCode };

// ─── Fields ───

export class AdapterFields {
    private map: Map<string, Uint8Array[]>;

    constructor(entries?: [string, Uint8Array][]) {
        this.map = new Map();
        if (entries) {
            for (const [name, value] of entries) {
                const key = name.toLowerCase();
                const existing = this.map.get(key);
                if (existing) {
                    existing.push(value);
                } else {
                    this.map.set(key, [value]);
                }
            }
        }
    }

    get(name: string): Uint8Array[] {
        return this.map.get(name.toLowerCase()) ?? [];
    }
    has(name: string): boolean {
        return this.map.has(name.toLowerCase());
    }
    set(name: string, values: Uint8Array[]): { tag: 'ok' } | { tag: 'err'; val: HeaderError } {
        this.map.set(name.toLowerCase(), [...values]);
        return ok();
    }
    append(name: string, value: Uint8Array): { tag: 'ok' } | { tag: 'err'; val: HeaderError } {
        const key = name.toLowerCase();
        const existing = this.map.get(key);
        if (existing) {
            existing.push(value);
        } else {
            this.map.set(key, [value]);
        }
        return ok();
    }
    delete(name: string): { tag: 'ok' } | { tag: 'err'; val: HeaderError } {
        this.map.delete(name.toLowerCase());
        return { tag: 'ok' };
    }
    entries(): [string, Uint8Array][] {
        const result: [string, Uint8Array][] = [];
        for (const [name, values] of this.map) {
            for (const value of values) {
                result.push([name, value]);
            }
        }
        return result;
    }
    clone(): AdapterFields {
        return new AdapterFields(this.entries());
    }
}

// ─── Outgoing Request ───

export class AdapterOutgoingRequest {
    private _method: HttpMethod = { tag: 'get' };
    private _path: string | undefined;
    private _scheme: HttpScheme | undefined;
    private _authority: string | undefined;
    private _headers: AdapterFields;
    private _body: AdapterOutgoingBody | null = null;
    private _bodyConsumed = false;

    constructor(headers: AdapterFields) {
        this._headers = headers;
    }

    method(): HttpMethod { return this._method; }
    setMethod(m: HttpMethod): boolean { this._method = m; return true; }
    pathWithQuery(): string | undefined { return this._path; }
    setPathWithQuery(p: string | undefined): boolean { this._path = p; return true; }
    scheme(): HttpScheme | undefined { return this._scheme; }
    setScheme(s: HttpScheme | undefined): boolean { this._scheme = s; return true; }
    authority(): string | undefined { return this._authority; }
    setAuthority(a: string | undefined): boolean { this._authority = a; return true; }
    headers(): AdapterFields { return this._headers; }
    body(): HttpResult<AdapterOutgoingBody> {
        if (this._bodyConsumed) return err({ tag: 'internal-error', val: 'body already consumed' });
        this._bodyConsumed = true;
        this._body = new AdapterOutgoingBody();
        return ok(this._body);
    }

    /** Called internally to get the body bytes for sending */
    getBodyBytes(): Uint8Array {
        return this._body?.getBytes() ?? new Uint8Array(0);
    }
}

export class AdapterOutgoingBody {
    private _stream: WasiOutputStream | null = null;
    private _bytes: Uint8Array = new Uint8Array(0);
    private _streamConsumed = false;

    write(): HttpResult<WasiOutputStream> {
        if (this._streamConsumed) return err({ tag: 'internal-error', val: 'stream already consumed' });
        this._streamConsumed = true;
        const chunks: Uint8Array[] = [];
        this._stream = createOutputStream((bytes) => {
            chunks.push(bytes);
        });
        // Store reference to collect bytes later
        (this as { _chunks?: Uint8Array[] })._chunks = chunks;
        return ok(this._stream);
    }

    getBytes(): Uint8Array {
        const chunks = (this as { _chunks?: Uint8Array[] })._chunks;
        if (!chunks || chunks.length === 0) return new Uint8Array(0);
        const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
        const result = new Uint8Array(totalLen);
        let offset = 0;
        for (const c of chunks) {
            result.set(c, offset);
            offset += c.length;
        }
        return result;
    }
}

// ─── Request Options ───

export class AdapterRequestOptions {
    private _connectTimeout: bigint | undefined;
    private _firstByteTimeout: bigint | undefined;
    private _betweenBytesTimeout: bigint | undefined;

    connectTimeout(): bigint | undefined { return this._connectTimeout; }
    setConnectTimeout(t: bigint | undefined): boolean { this._connectTimeout = t; return true; }
    firstByteTimeout(): bigint | undefined { return this._firstByteTimeout; }
    setFirstByteTimeout(t: bigint | undefined): boolean { this._firstByteTimeout = t; return true; }
    betweenBytesTimeout(): bigint | undefined { return this._betweenBytesTimeout; }
    setBetweenBytesTimeout(t: bigint | undefined): boolean { this._betweenBytesTimeout = t; return true; }
}

// ─── Incoming Response / Body / Future ───

export class AdapterIncomingResponse {
    private _status: number;
    private _headers: AdapterFields;
    private _bodyData: Uint8Array;
    private _bodyConsumed = false;

    constructor(status: number, headers: AdapterFields, body: Uint8Array) {
        this._status = status;
        this._headers = headers;
        this._bodyData = body;
    }

    status(): number { return this._status; }
    headers(): AdapterFields { return this._headers; }
    consume(): HttpResult<AdapterIncomingBody> {
        if (this._bodyConsumed) return err({ tag: 'internal-error', val: 'body already consumed' });
        this._bodyConsumed = true;
        return ok(new AdapterIncomingBody(this._bodyData));
    }
}

export class AdapterIncomingBody {
    private _data: Uint8Array;
    private _streamConsumed = false;

    constructor(data: Uint8Array) {
        this._data = data;
    }

    stream(): HttpResult<WasiInputStream> {
        if (this._streamConsumed) return err({ tag: 'internal-error', val: 'stream already consumed' });
        this._streamConsumed = true;
        return ok(createInputStream(this._data));
    }
}

export class AdapterFutureIncomingResponse {
    private _promise: Promise<AdapterIncomingResponse>;
    private _result: AdapterIncomingResponse | null = null;
    private _error: HttpErrorCode | null = null;
    private _resolved = false;

    constructor(promise: Promise<AdapterIncomingResponse>) {
        this._promise = promise;
        this._promise.then(
            resp => { this._result = resp; this._resolved = true; },
            err => { this._error = err as HttpErrorCode; this._resolved = true; },
        );
    }

    subscribe(): WasiPollable {
        if (this._resolved) return createSyncPollable(() => true);
        return createAsyncPollable(this._promise.then(() => { }).catch(() => { }));
    }

    get(): HttpResult<AdapterIncomingResponse> | undefined {
        if (!this._resolved) return undefined;
        if (this._error) return err(this._error);
        return ok(this._result!);
    }
}

// ─── Adapter factory functions ───

export function adaptHttpTypes(): AdaptedHttpTypes {
    return {
        createFields: (): AdapterFields => new AdapterFields(),
        createFieldsFromList: (entries: [string, Uint8Array][]): AdapterFields => new AdapterFields(entries),
        createOutgoingRequest: (headers: AdapterFields): AdapterOutgoingRequest => new AdapterOutgoingRequest(headers),
        createRequestOptions: (): AdapterRequestOptions => new AdapterRequestOptions(),
        AdapterOutgoingBody,
        AdapterIncomingResponse,
        AdapterIncomingBody,
        AdapterFutureIncomingResponse,
    };
}

export function adaptOutgoingHandler(_p3: WasiP3Imports): { handle(_request: AdapterOutgoingRequest, _options?: AdapterRequestOptions): HttpResult<AdapterFutureIncomingResponse> } {
    // P3 has wasi:http/client.send() — but for browser adapter we provide
    // a stub since actual HTTP is complex. Real adapter would delegate to P3.
    return {
        handle(_request: AdapterOutgoingRequest, _options?: AdapterRequestOptions): HttpResult<AdapterFutureIncomingResponse> {
            // Stub: return a not-supported error for now
            // Real implementation would build a P3 request and call p3['wasi:http/client'].send()
            return err({ tag: 'internal-error', val: 'HTTP adapter not fully implemented' });
        },
    };
}
