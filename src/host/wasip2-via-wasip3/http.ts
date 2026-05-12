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
import { createSyncPollable, createAsyncPollable, createInputStream, createOutputStream, createWasiError } from './io';
import type { HttpMethod, HttpScheme, AdaptedHttpTypes } from './http-types';
import { ok, err } from '../wasip3';

type HttpErrorCode = { tag: string; val?: unknown };
type HeaderError = { tag: string };
type HttpResult<T> = { tag: 'ok'; val: T } | { tag: 'err'; val: HttpErrorCode };

// ─── Header / method / scheme / authority / path validation ───
//
// These mirror the wasmtime input-validation contract on `OutgoingRequest`:
// `set-method`, `set-scheme`, `set-authority`, `set-path-with-query` return
// `result<_, _>` and must reject inputs containing control characters, CR/LF,
// or otherwise invalid syntax (RFC 7230 / RFC 3986). Built-in method/scheme
// variants are always accepted.

// RFC 7230 token = 1*tchar; tchar = !#$%&'*+-.^_`|~ / DIGIT / ALPHA.
function isHttpToken(s: string): boolean {
    if (s.length === 0) return false;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        const ok = (c >= 0x30 && c <= 0x39) // 0-9
            || (c >= 0x41 && c <= 0x5A) // A-Z
            || (c >= 0x61 && c <= 0x7A) // a-z
            || c === 0x21 || c === 0x23 || c === 0x24 || c === 0x25
            || c === 0x26 || c === 0x27 || c === 0x2A || c === 0x2B
            || c === 0x2D || c === 0x2E || c === 0x5E || c === 0x5F
            || c === 0x60 || c === 0x7C || c === 0x7E;
        if (!ok) return false;
    }
    return true;
}

function isValidMethod(m: HttpMethod): boolean {
    if (m.tag !== 'other') return true;
    return isHttpToken(m.val);
}

// RFC 3986 scheme = ALPHA *( ALPHA / DIGIT / "+" / "-" / "." ).
function isValidScheme(s: HttpScheme): boolean {
    if (s.tag !== 'other') return true;
    const v = s.val;
    if (v.length === 0) return false;
    const c0 = v.charCodeAt(0);
    const isAlpha0 = (c0 >= 0x41 && c0 <= 0x5A) || (c0 >= 0x61 && c0 <= 0x7A);
    if (!isAlpha0) return false;
    for (let i = 1; i < v.length; i++) {
        const c = v.charCodeAt(i);
        const ok = (c >= 0x30 && c <= 0x39)
            || (c >= 0x41 && c <= 0x5A)
            || (c >= 0x61 && c <= 0x7A)
            || c === 0x2B || c === 0x2D || c === 0x2E;
        if (!ok) return false;
    }
    return true;
}

// Authority is host[:port]; reject CR/LF and other control characters.
function isValidAuthority(a: string): boolean {
    if (a.length === 0) return false;
    for (let i = 0; i < a.length; i++) {
        const c = a.charCodeAt(i);
        if (c < 0x20 || c === 0x7F) return false;
    }
    return true;
}

// path-with-query: reject CR/LF/control chars and whitespace.
function isValidPathWithQuery(p: string): boolean {
    for (let i = 0; i < p.length; i++) {
        const c = p.charCodeAt(i);
        if (c < 0x20 || c === 0x7F || c === 0x20) return false;
    }
    return true;
}

// ─── Fields ───

const FORBIDDEN_HEADER_NAMES: ReadonlySet<string> = new Set([
    'connection',
    'keep-alive',
    'host',
    'http2-settings',
    'te',
    'transfer-encoding',
    'upgrade',
    'proxy-connection',
    'proxy-authenticate',
    'proxy-authorization',
    'expect',
    'set-cookie',
    'custom-forbidden-header',
]);

function isHeaderValueValid(value: Uint8Array): boolean {
    for (let i = 0; i < value.length; i++) {
        const c = value[i]!;
        if (c === 0x0A || c === 0x0D || c === 0x00) return false;
    }
    return true;
}

function checkAddHeader(name: string, value: Uint8Array): { tag: 'ok' } | { tag: 'err'; val: HeaderError } {
    if (!isHttpToken(name)) return err({ tag: 'invalid-syntax' });
    if (!isHeaderValueValid(value)) return err({ tag: 'invalid-syntax' });
    if (FORBIDDEN_HEADER_NAMES.has(name.toLowerCase())) return err({ tag: 'forbidden' });
    return ok();
}

export class AdapterFields {
    private map: Map<string, Uint8Array[]>;
    /** Names that must not be mutated on this instance (lowercase). */
    private immutableNames: Set<string> = new Set();

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

    /**
     * Construct from a list, applying header-name/value/forbidden validation.
     * Returns either the constructed fields or the first error encountered.
     */
    static fromListChecked(entries: [string, Uint8Array][]): { tag: 'ok'; val: AdapterFields } | { tag: 'err'; val: HeaderError } {
        for (const [name, value] of entries) {
            const r = checkAddHeader(name, value);
            if (r.tag === 'err') return r;
        }
        return ok(new AdapterFields(entries));
    }

    /** @internal Mark a header name as immutable (e.g. content-length on request headers). */
    markImmutable(name: string): void {
        this.immutableNames.add(name.toLowerCase());
    }

    get(name: string): Uint8Array[] {
        return this.map.get(name.toLowerCase()) ?? [];
    }
    has(name: string): boolean {
        return this.map.has(name.toLowerCase());
    }
    set(name: string, values: Uint8Array[]): { tag: 'ok' } | { tag: 'err'; val: HeaderError } {
        const lower = name.toLowerCase();
        if (this.immutableNames.has(lower)) return err({ tag: 'immutable' });
        if (!isHttpToken(name)) return err({ tag: 'invalid-syntax' });
        if (FORBIDDEN_HEADER_NAMES.has(lower)) return err({ tag: 'forbidden' });
        for (const v of values) {
            if (!isHeaderValueValid(v)) return err({ tag: 'invalid-syntax' });
        }
        this.map.set(lower, [...values]);
        return ok();
    }
    append(name: string, value: Uint8Array): { tag: 'ok' } | { tag: 'err'; val: HeaderError } {
        const lower = name.toLowerCase();
        if (this.immutableNames.has(lower)) return err({ tag: 'immutable' });
        const r = checkAddHeader(name, value);
        if (r.tag === 'err') return r;
        const existing = this.map.get(lower);
        if (existing) {
            existing.push(value);
        } else {
            this.map.set(lower, [value]);
        }
        return ok();
    }
    delete(name: string): { tag: 'ok' } | { tag: 'err'; val: HeaderError } {
        const lower = name.toLowerCase();
        if (this.immutableNames.has(lower)) return err({ tag: 'immutable' });
        this.map.delete(lower);
        return ok();
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
    private _maxBufferSize: number | undefined;

    constructor(headers: AdapterFields, maxBufferSize?: number) {
        this._headers = headers;
        this._maxBufferSize = maxBufferSize;
        // Per wasi:http, Content-Length on request headers is immutable
        // because it is determined by the OutgoingBody framing.
        this._headers.markImmutable('content-length');
    }

    method(): HttpMethod { return this._method; }
    setMethod(m: HttpMethod): boolean {
        if (!isValidMethod(m)) return false;
        this._method = m;
        return true;
    }
    pathWithQuery(): string | undefined { return this._path; }
    setPathWithQuery(p: string | undefined): boolean {
        if (p !== undefined && !isValidPathWithQuery(p)) return false;
        this._path = p;
        return true;
    }
    scheme(): HttpScheme | undefined { return this._scheme; }
    setScheme(s: HttpScheme | undefined): boolean {
        if (s !== undefined && !isValidScheme(s)) return false;
        this._scheme = s;
        return true;
    }
    authority(): string | undefined { return this._authority; }
    setAuthority(a: string | undefined): boolean {
        if (a !== undefined && !isValidAuthority(a)) return false;
        this._authority = a;
        return true;
    }
    headers(): AdapterFields { return this._headers; }
    body(): HttpResult<AdapterOutgoingBody> {
        if (this._bodyConsumed) return err({ tag: 'internal-error', val: 'body already consumed' });
        this._bodyConsumed = true;
        // Snapshot the declared content-length (if any) at body-creation time.
        const clVals = this._headers.get('content-length');
        let contentLength: number | undefined;
        if (clVals.length > 0) {
            const v = clVals[0]!;
            const bytes = v instanceof Uint8Array ? v : Uint8Array.from(v as ArrayLike<number>);
            const dec = new TextDecoder();
            const parsed = Number.parseInt(dec.decode(bytes).trim(), 10);
            if (Number.isFinite(parsed) && parsed >= 0) contentLength = parsed;
        }
        this._body = new AdapterOutgoingBody(this._maxBufferSize, contentLength);
        return ok(this._body);
    }

    /** Called internally to get the body bytes for sending */
    getBodyBytes(): Uint8Array {
        return this._body?.getBytes() ?? new Uint8Array(0);
    }

    /** Resolves once the guest has called outgoing-body.finish, or immediately if no body was created. */
    whenBodyFinished(): Promise<void> {
        return this._body ? this._body.whenFinished() : Promise.resolve();
    }
}

export class AdapterOutgoingBody {
    private _stream: WasiOutputStream | null = null;
    private _bytes: Uint8Array = new Uint8Array(0);
    private _streamConsumed = false;
    private _finished = false;
    private _finishResolve!: () => void;
    private _finishedPromise: Promise<void>;
    private _maxBufferSize: number | undefined;
    private _contentLength: number | undefined;
    private _written = 0;
    private _sizeError: HttpErrorCode | undefined;

    constructor(maxBufferSize?: number, contentLength?: number) {
        this._maxBufferSize = maxBufferSize;
        this._contentLength = contentLength;
        this._finishedPromise = new Promise<void>((resolve) => { this._finishResolve = resolve; });
    }

    write(): HttpResult<WasiOutputStream> {
        if (this._streamConsumed) return err({ tag: 'internal-error', val: 'stream already consumed' });
        this._streamConsumed = true;
        const chunks: Uint8Array[] = [];
        const cl = this._contentLength;
        const onWrite = (bytes: Uint8Array): void => {
            this._written += bytes.length;
            if (cl !== undefined && this._written > cl) {
                // Record the over-write so finish() also returns the error.
                const code: HttpErrorCode = {
                    tag: 'HTTP-request-body-size',
                    val: BigInt(this._written),
                };
                this._sizeError = code;
                throw createWasiError(`request body exceeds content-length ${cl}`, code);
            }
            chunks.push(bytes);
        };
        this._stream = createOutputStream(onWrite, this._maxBufferSize);
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

    /** Called by `[static]outgoing-body.finish`. Idempotent. Returns
     *  result<_, error-code> per wit; the err path triggers when content-length
     *  was declared but the body underran or overran it. */
    finish(): HttpResult<void> {
        if (this._finished) return ok();
        this._finished = true;
        this._finishResolve();
        if (this._sizeError) return err(this._sizeError);
        if (this._contentLength !== undefined && this._written !== this._contentLength) {
            return err({
                tag: 'HTTP-request-body-size',
                val: BigInt(this._written),
            });
        }
        return ok();
    }

    whenFinished(): Promise<void> {
        return this._finishedPromise;
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
    private _taken = false;

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

    /**
     * P2 wit: `get: func() -> option<result<result<incoming-response, error-code>, ()>>`
     *  - undefined           → not yet ready
     *  - ok(innerResult)     → first successful call after resolve
     *  - err(undefined)      → response already taken (subsequent calls)
     */
    get(): { tag: 'ok'; val: HttpResult<AdapterIncomingResponse> } | { tag: 'err'; val: void } | undefined {
        if (!this._resolved) return undefined;
        if (this._taken) return { tag: 'err', val: undefined };
        this._taken = true;
        const inner: HttpResult<AdapterIncomingResponse> = this._error ? err(this._error) : ok(this._result!);
        return { tag: 'ok', val: inner };
    }
}

// ─── Adapter factory functions ───

export function adaptHttpTypes(maxBufferSize?: number): AdaptedHttpTypes {
    return {
        createFields: (): AdapterFields => new AdapterFields(),
        createFieldsFromList: (entries: [string, Uint8Array][]): AdapterFields => new AdapterFields(entries),
        createOutgoingRequest: (headers: AdapterFields): AdapterOutgoingRequest => new AdapterOutgoingRequest(headers, maxBufferSize),
        createRequestOptions: (): AdapterRequestOptions => new AdapterRequestOptions(),
        AdapterOutgoingBody,
        AdapterIncomingResponse,
        AdapterIncomingBody,
        AdapterFutureIncomingResponse,
    };
}

/**
 * Adapt P2 `wasi:http/outgoing-handler.handle` via P3's public API.
 *
 * Constructs a P3 `HttpRequest` from the adapter's `AdapterOutgoingRequest`,
 * delegates to P3's `client.send()` for fetch, validation, and error mapping,
 * then converts the P3 `HttpResponse` back to an `AdapterIncomingResponse`.
 */
export function adaptOutgoingHandler(p3: WasiP3Imports, _maxBufferSize?: number): {
    handle(request: AdapterOutgoingRequest, options?: AdapterRequestOptions): HttpResult<AdapterFutureIncomingResponse>;
} {
    // At runtime, `WasiP3Imports` holds the actual P3 class constructors
    // returned by createHttpTypes/createHttpClient under unversioned WIT keys.
    const httpTypes = p3['wasi:http/types'] as unknown as P3HttpTypes;
    const httpClient = p3['wasi:http/client'] as unknown as P3HttpClient;

    return {
        handle(request: AdapterOutgoingRequest, options?: AdapterRequestOptions): HttpResult<AdapterFutureIncomingResponse> {
            // P2 guests expect structural validation errors in the outer result
            // (not via the future). These are minimal pre-checks — full validation
            // (URL length, body-size, error mapping) is delegated to P3's send().
            const scheme = request.scheme();
            const authority = request.authority();
            if (!scheme || !authority) return err({ tag: 'HTTP-request-URI-invalid' });
            if (request.pathWithQuery() === undefined) return err({ tag: 'HTTP-request-URI-invalid' });
            if (scheme.tag === 'other') {
                const s = scheme.val.toLowerCase();
                if (s !== 'http' && s !== 'https') return err({ tag: 'HTTP-protocol-error' });
            }
            const m = request.method();
            const upper = (m.tag === 'other' ? m.val : m.tag).toUpperCase();
            if (upper === 'CONNECT' || upper === 'TRACE' || upper === 'TRACK') {
                return err({ tag: 'HTTP-protocol-error' });
            }

            const promise = (async (): Promise<AdapterIncomingResponse> => {
                // 1. Build P3 Fields from P2 AdapterFields entries
                const p3Headers = httpTypes.Fields.fromList(request.headers().entries());

                // 2. Wait for body finish, create one-shot body stream
                await request.whenBodyFinished();
                const bodyBytes = request.getBodyBytes();
                const bodyStream: AsyncIterable<Uint8Array> | undefined =
                    bodyBytes.length > 0
                        ? { async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> { yield bodyBytes; } }
                        : undefined;

                // 3. Build P3 RequestOptions from P2 options
                let p3Options: P3RequestOptions | undefined;
                if (options) {
                    p3Options = new httpTypes.RequestOptions();
                    const ct = options.connectTimeout();
                    if (ct != null) p3Options.setConnectTimeout(ct);
                    const fbt = options.firstByteTimeout();
                    if (fbt != null) p3Options.setFirstByteTimeout(fbt);
                    const bbt = options.betweenBytesTimeout();
                    if (bbt != null) p3Options.setBetweenBytesTimeout(bbt);
                }

                // 4. Construct P3 Request
                const noTrailers = Promise.resolve({ tag: 'ok' as const, val: undefined });
                const [p3Request, completionFuture] = httpTypes.Request.new(
                    p3Headers, bodyStream, noTrailers, p3Options,
                );
                // Absorb completion future rejection to prevent unhandled rejection
                (completionFuture as Promise<unknown>).catch(() => { /* absorbed by adapter */ });

                // 5. Set method, scheme, authority, path — P3 setters validate per RFC
                p3Request.setMethod(request.method());
                p3Request.setScheme(request.scheme());
                p3Request.setAuthority(request.authority());
                p3Request.setPathWithQuery(request.pathWithQuery());

                // 6. Send via P3 client — handles fetch, error mapping, content-length
                const result = await httpClient.send(p3Request);
                if (result.tag === 'err') throw result.val;
                const p3Response = result.val;

                // 7. Extract status and headers
                const status = p3Response.getStatusCode();
                const respHeaders = new AdapterFields(p3Response.getHeaders().copyAll());

                // 8. Drain response body via P3's consumeBody API
                const noRes = Promise.resolve({ tag: 'ok' as const, val: undefined });
                const [bodyReadable] = httpTypes.Response.consumeBody(p3Response, noRes);
                const chunks: Uint8Array[] = [];
                for await (const chunk of bodyReadable) {
                    chunks.push(chunk);
                }
                let respBody: Uint8Array;
                if (chunks.length === 0) {
                    respBody = new Uint8Array(0);
                } else if (chunks.length === 1) {
                    respBody = chunks[0]!;
                } else {
                    const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
                    respBody = new Uint8Array(totalLen);
                    let offset = 0;
                    for (const c of chunks) {
                        respBody.set(c, offset);
                        offset += c.length;
                    }
                }

                return new AdapterIncomingResponse(status, respHeaders, respBody);
            })();

            return ok(new AdapterFutureIncomingResponse(promise));
        },
    };
}

// ─── P3 type shapes used by the adapter ───
//
// At runtime the `WasiP3Imports` record holds class objects from
// `createHttpTypes` / `createHttpClient`. These interfaces describe
// only the subset of methods the adapter needs.

interface P3Fields {
    copyAll(): [string, Uint8Array][];
}

interface P3RequestOptions {
    setConnectTimeout(d: bigint): void;
    setFirstByteTimeout(d: bigint): void;
    setBetweenBytesTimeout(d: bigint): void;
}

interface P3Request {
    setMethod(m: HttpMethod): void;
    setScheme(s: HttpScheme | undefined): void;
    setAuthority(a: string | undefined): void;
    setPathWithQuery(p: string | undefined): void;
}

interface P3Response {
    getStatusCode(): number;
    getHeaders(): P3Fields;
}

interface P3HttpTypes {
    Fields: {
        fromList(entries: [string, Uint8Array][]): P3Fields;
    };
    Request: {
        'new'(
            headers: P3Fields,
            contents: AsyncIterable<Uint8Array> | undefined,
            trailers: Promise<unknown>,
            options: P3RequestOptions | undefined,
        ): [P3Request, Promise<unknown>];
    };
    Response: {
        consumeBody(
            this_: P3Response,
            res: Promise<unknown>,
        ): [AsyncIterable<Uint8Array>, Promise<unknown>];
    };
    RequestOptions: new () => P3RequestOptions;
}

interface P3HttpClient {
    send(request: P3Request): Promise<{ tag: 'ok'; val: P3Response } | { tag: 'err'; val: HttpErrorCode }>;
}
