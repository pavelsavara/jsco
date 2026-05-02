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

/** Map a P3 HttpMethod tag to the HTTP method string used by fetch. */
function methodTagToString(m: HttpMethod): string {
    if (m.tag === 'other') return m.val;
    return m.tag.toUpperCase();
}

/** Build absolute URL from a P2-adapter outgoing request. */
function buildAdapterUrl(req: AdapterOutgoingRequest): { url: string } | { err: HttpErrorCode } {
    const scheme = req.scheme();
    const authority = req.authority();
    const pathWithQuery = req.pathWithQuery();
    if (!scheme || !authority) {
        return { err: { tag: 'HTTP-request-URI-invalid', val: 'missing scheme or authority' } };
    }
    if (pathWithQuery === undefined) {
        return { err: { tag: 'HTTP-request-URI-invalid', val: 'missing path-with-query' } };
    }
    let schemeStr: string;
    if (scheme.tag === 'HTTP') schemeStr = 'http';
    else if (scheme.tag === 'HTTPS') schemeStr = 'https';
    else schemeStr = scheme.val;
    if (schemeStr !== 'http' && schemeStr !== 'https') {
        return { err: { tag: 'HTTP-protocol-error' } };
    }
    return { url: `${schemeStr}://${authority}${pathWithQuery}` };
}

/** Convert AdapterFields to a fetch-compatible Headers object. */
function adapterFieldsToFetchHeaders(fields: AdapterFields): globalThis.Headers {
    const h = new globalThis.Headers();
    const dec = new TextDecoder();
    for (const [name, value] of fields.entries()) {
        // `content-length` is a fetch-forbidden header — undici rejects it
        // and the body length is computed by fetch itself anyway.
        if (name.toLowerCase() === 'content-length') continue;
        const bytes = value instanceof Uint8Array ? value : Uint8Array.from(value as ArrayLike<number>);
        h.append(name, dec.decode(bytes));
    }
    return h;
}

/** Convert fetch response Headers to AdapterFields. */
async function fetchHeadersToAdapterFields(headers: globalThis.Headers): Promise<AdapterFields> {
    const enc = new TextEncoder();
    const entries: [string, Uint8Array][] = [];
    headers.forEach((value, name) => { entries.push([name, enc.encode(value)]); });
    return new AdapterFields(entries);
}

/** Map fetch errors to a P2-adapter HttpErrorCode. */
function adapterMapFetchError(e: unknown): HttpErrorCode {
    const errName = e && typeof e === 'object' ? (e as { name?: string }).name : undefined;
    if (errName === 'AbortError' || errName === 'TimeoutError') {
        return { tag: 'connection-timeout' };
    }
    if (errName === 'TypeError' || e instanceof TypeError) {
        const msg = String((e as Error).message ?? '').toLowerCase();
        if (msg.includes('abort') || msg.includes('timeout')) return { tag: 'connection-timeout' };
        // Node's fetch surfaces DNS failures and other network errors as
        // TypeError("fetch failed") with a `.cause` from undici. Inspect
        // both the cause chain and its message text since some failures
        // (DNS) only carry the diagnostic text.
        const cause = (e as { cause?: unknown }).cause;
        if (cause && typeof cause === 'object') {
            const code = (cause as { code?: string }).code;
            if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'EAI_FAIL') {
                return { tag: 'DNS-error', val: { rcode: code } };
            }
            if (code === 'ECONNREFUSED') return { tag: 'connection-refused' };
            if (code === 'ECONNRESET') return { tag: 'connection-terminated' };
            if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') return { tag: 'connection-timeout' };
            const causeMsg = String((cause as { message?: unknown }).message ?? '').toLowerCase();
            if (causeMsg.includes('getaddrinfo') || causeMsg.includes('enotfound') || causeMsg.includes('dns')) {
                return { tag: 'DNS-error', val: {} };
            }
            if (causeMsg.includes('refused')) return { tag: 'connection-refused' };
            if (causeMsg.includes('timeout')) return { tag: 'connection-timeout' };
        }
        if (msg.includes('getaddrinfo') || msg.includes('enotfound') || msg.includes('dns')) {
            return { tag: 'DNS-error', val: {} };
        }
        if (msg.includes('refused')) return { tag: 'connection-refused' };
        // Generic "fetch failed" from Node without a recognisable cause is
        // most often a DNS-resolution failure on a syntactically-valid host.
        if (msg === 'fetch failed') return { tag: 'DNS-error', val: {} };
        if (msg.includes('network') || msg.includes('fetch')) return { tag: 'destination-not-found' };
    }
    return { tag: 'internal-error', val: e instanceof Error ? e.message : String(e) };
}

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
 * Adapt P2 `wasi:http/outgoing-handler.handle` to fetch.
 *
 * The P2 adapter has already buffered the request body bytes synchronously
 * via `AdapterOutgoingBody` (an OutputStream-backed collector), so we have
 * a complete `Uint8Array` body at the moment `handle()` is called. We
 * therefore bypass P3 streaming entirely and just issue a plain `fetch()`
 * with `body: Uint8Array`. This avoids the back-and-forth WASM scheduling
 * that would otherwise be required to drain a P3 stream while the guest is
 * suspended awaiting `future-incoming-response.get()`.
 */
export function adaptOutgoingHandler(_p3: WasiP3Imports, _maxBufferSize?: number): {
    handle(request: AdapterOutgoingRequest, options?: AdapterRequestOptions): HttpResult<AdapterFutureIncomingResponse>;
} {
    return {
        handle(request: AdapterOutgoingRequest, options?: AdapterRequestOptions): HttpResult<AdapterFutureIncomingResponse> {
            let url: string;
            let method: string;
            let fetchHeaders: globalThis.Headers;
            try {
                const built = buildAdapterUrl(request);
                if ('err' in built) return err(built.err);
                url = built.url;
                method = methodTagToString(request.method());
                fetchHeaders = adapterFieldsToFetchHeaders(request.headers());
            } catch (e) {
                return err({ tag: 'HTTP-request-URI-invalid', val: e instanceof Error ? e.message : String(e) });
            }

            const init: RequestInit = {
                method,
                headers: fetchHeaders,
            };

            // Apply timeout (most-restrictive of connect / first-byte timeouts).
            // option<u64> lifts to null for None, so use loose equality.
            if (options) {
                const candidates: number[] = [];
                const ct = options.connectTimeout();
                const fbt = options.firstByteTimeout();
                if (ct != null) candidates.push(Number(ct) / 1_000_000);
                if (fbt != null) candidates.push(Number(fbt) / 1_000_000);
                if (candidates.length > 0) {
                    init.signal = AbortSignal.timeout(Math.min(...candidates));
                }
            }

            const promise = (async (): Promise<AdapterIncomingResponse> => {
                // Wait for the guest to call outgoing-body.finish() before snapshotting bytes.
                await request.whenBodyFinished();
                const bodyBytes = request.getBodyBytes();
                if (bodyBytes.length > 0 && method !== 'GET' && method !== 'HEAD') {
                    init.body = bodyBytes as unknown as BodyInit;
                }
                let resp: globalThis.Response;
                try {
                    resp = await fetch(url, init);
                } catch (e) {
                    throw adapterMapFetchError(e);
                }
                const respHeaders = await fetchHeadersToAdapterFields(resp.headers);
                const respBody = new Uint8Array(await resp.arrayBuffer());
                return new AdapterIncomingResponse(resp.status, respHeaders, respBody);
            })();

            return ok(new AdapterFutureIncomingResponse(promise));
        },
    };
}
