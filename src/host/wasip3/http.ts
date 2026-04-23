// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * WASIp3 HTTP — Fields, Request, RequestOptions, Response resources + client send().
 *
 * Maps WIT `wasi:http/types` classes and `wasi:http/client` send() to the
 * browser Fetch API with duplex streaming support.
 */

import type {
    WasiHttpTypes,
    WasiHttpClient,
    WasiHttpHandler,
} from '../../../wit/wasip3/types/index';
import type { WasiStreamReadable } from './streams';
import type { HostConfig, NetworkConfig } from './types';
import { ok, err } from './result';
import { NETWORK_DEFAULTS } from './types';

// ──────────────────── Local type aliases ────────────────────

type Duration = bigint;
type FieldName = string;
type FieldValue = Uint8Array;
type StatusCode = number;
type Result<T, E> = { tag: 'ok'; val: T } | { tag: 'err'; val: E };

type Method =
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

type Scheme =
    | { tag: 'HTTP' }
    | { tag: 'HTTPS' }
    | { tag: 'other'; val: string };

type HeaderError =
    | { tag: 'invalid-syntax' }
    | { tag: 'forbidden' }
    | { tag: 'immutable' }
    | { tag: 'size-exceeded' }
    | { tag: 'other'; val: string | undefined };

type RequestOptionsError =
    | { tag: 'not-supported' }
    | { tag: 'immutable' }
    | { tag: 'other'; val: string | undefined };

type ErrorCode =
    | { tag: 'DNS-timeout' }
    | { tag: 'DNS-error'; val: { rcode?: string; infoCode?: number } }
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
    | { tag: 'TLS-alert-received'; val: { alertId?: number; alertMessage?: string } }
    | { tag: 'HTTP-request-denied' }
    | { tag: 'HTTP-request-length-required' }
    | { tag: 'HTTP-request-body-size'; val: bigint | undefined }
    | { tag: 'HTTP-request-method-invalid' }
    | { tag: 'HTTP-request-URI-invalid' }
    | { tag: 'HTTP-request-URI-too-long' }
    | { tag: 'HTTP-request-header-section-size'; val: number | undefined }
    | { tag: 'HTTP-request-header-size'; val: { fieldName?: string; fieldSize?: number } | undefined }
    | { tag: 'HTTP-request-trailer-section-size'; val: number | undefined }
    | { tag: 'HTTP-request-trailer-size'; val: { fieldName?: string; fieldSize?: number } }
    | { tag: 'HTTP-response-incomplete' }
    | { tag: 'HTTP-response-header-section-size'; val: number | undefined }
    | { tag: 'HTTP-response-header-size'; val: { fieldName?: string; fieldSize?: number } }
    | { tag: 'HTTP-response-body-size'; val: bigint | undefined }
    | { tag: 'HTTP-response-trailer-section-size'; val: number | undefined }
    | { tag: 'HTTP-response-trailer-size'; val: { fieldName?: string; fieldSize?: number } }
    | { tag: 'HTTP-response-transfer-coding'; val: string | undefined }
    | { tag: 'HTTP-response-content-coding'; val: string | undefined }
    | { tag: 'HTTP-response-timeout' }
    | { tag: 'HTTP-upgrade-failed' }
    | { tag: 'HTTP-protocol-error' }
    | { tag: 'loop-detected' }
    | { tag: 'configuration-error' }
    | { tag: 'internal-error'; val: string | undefined };

type Headers = HttpFields;
type Trailers = HttpFields;

// ──────────────────── Validation helpers ────────────────────

// RFC 9110 §5.1: token = 1*tchar ; tchar = "!" / "#" / "$" / "%" / "&" / "'" / "*" / "+" / "-" / "." / "^" / "_" / "`" / "|" / "~" / DIGIT / ALPHA
const VALID_TOKEN_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
// RFC 9110 §5.5: field-value = *field-content
// field-content = field-vchar [ 1*( SP / HTAB / field-vchar ) field-vchar ]
// Disallow \r, \n, \0
const INVALID_FIELD_VALUE_RE = /[\r\n\0]/;

// Headers that must not be set by the user (per WASI spec / fetch spec)
const FORBIDDEN_HEADERS = new Set([
    'connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade',
    'host', 'te', 'trailer',
]);

function validateFieldName(name: string): void {
    if (!VALID_TOKEN_RE.test(name)) {
        throw Object.assign(new Error('invalid header name'), { tag: 'invalid-syntax' } as HeaderError);
    }
}

function validateFieldValue(value: Uint8Array): void {
    for (let i = 0; i < value.length; i++) {
        const b = value[i]!;
        if (b === 0x0d || b === 0x0a || b === 0x00) {
            throw Object.assign(new Error('invalid header value'), { tag: 'invalid-syntax' } as HeaderError);
        }
    }
}

function checkForbiddenHeader(name: string): void {
    if (FORBIDDEN_HEADERS.has(name.toLowerCase())) {
        throw Object.assign(new Error(`forbidden header: ${name}`), { tag: 'forbidden' } as HeaderError);
    }
}

function ensureMutable(immutable: boolean): void {
    if (immutable) {
        throw Object.assign(new Error('fields are immutable'), { tag: 'immutable' } as HeaderError);
    }
}

// ──────────────────── Size limit helpers ────────────────────

interface HttpLimits {
    maxHeadersBytes: number;
    maxHttpBodyBytes: number;
    maxRequestUrlBytes: number;
}

function getHttpLimits(network?: NetworkConfig): HttpLimits {
    return {
        maxHeadersBytes: network?.maxHttpHeadersBytes ?? NETWORK_DEFAULTS.maxHttpHeadersBytes,
        maxHttpBodyBytes: network?.maxHttpBodyBytes ?? NETWORK_DEFAULTS.maxHttpBodyBytes,
        maxRequestUrlBytes: network?.maxRequestUrlBytes ?? NETWORK_DEFAULTS.maxRequestUrlBytes,
    };
}

// ──────────────────── Fields resource ────────────────────

class HttpFields {
    // Store entries as ordered list of [lowercaseName, originalName, value]
    private entries: Array<[string, string, Uint8Array]> = [];
    private _immutable = false;
    private readonly limits: HttpLimits;
    private totalSize = 0;

    constructor(limits?: HttpLimits) {
        this.limits = limits ?? getHttpLimits();
    }

    static fromList(entries: Array<[FieldName, FieldValue]>, limits?: HttpLimits): HttpFields {
        const f = new HttpFields(limits);
        for (const [name, value] of entries) {
            validateFieldName(name);
            validateFieldValue(value);
            checkForbiddenHeader(name);
            const entrySize = name.length + value.length;
            if (f.totalSize + entrySize > f.limits.maxHeadersBytes) {
                throw Object.assign(new Error('headers size exceeded'), { tag: 'size-exceeded' } as HeaderError);
            }
            f.totalSize += entrySize;
            f.entries.push([name.toLowerCase(), name, value]);
        }
        return f;
    }

    /** @internal Create from incoming request headers (no forbidden header check). */
    static fromIncomingList(entries: Array<[FieldName, FieldValue]>, limits?: HttpLimits): HttpFields {
        const f = new HttpFields(limits);
        for (const [name, value] of entries) {
            validateFieldName(name);
            validateFieldValue(value);
            const entrySize = name.length + value.length;
            if (f.totalSize + entrySize > f.limits.maxHeadersBytes) {
                throw Object.assign(new Error('headers size exceeded'), { tag: 'size-exceeded' } as HeaderError);
            }
            f.totalSize += entrySize;
            f.entries.push([name.toLowerCase(), name, value]);
        }
        return f;
    }

    get(name: FieldName): Array<FieldValue> {
        const lower = name.toLowerCase();
        const result: FieldValue[] = [];
        for (const [key, , value] of this.entries) {
            if (key === lower) result.push(value);
        }
        return result;
    }

    has(name: FieldName): boolean {
        if (!VALID_TOKEN_RE.test(name)) return false;
        const lower = name.toLowerCase();
        for (const [key] of this.entries) {
            if (key === lower) return true;
        }
        return false;
    }

    set(name: FieldName, values: Array<FieldValue>): void {
        ensureMutable(this._immutable);
        validateFieldName(name);
        checkForbiddenHeader(name);
        for (const v of values) validateFieldValue(v);

        const lower = name.toLowerCase();

        // Calculate new size contribution
        let newEntrySize = 0;
        for (const v of values) newEntrySize += name.length + v.length;

        // Remove old entries for this name
        let removedSize = 0;
        this.entries = this.entries.filter(([key, origName, val]) => {
            if (key === lower) {
                removedSize += origName.length + val.length;
                return false;
            }
            return true;
        });

        if (this.totalSize - removedSize + newEntrySize > this.limits.maxHeadersBytes) {
            throw Object.assign(new Error('headers size exceeded'), { tag: 'size-exceeded' } as HeaderError);
        }
        this.totalSize = this.totalSize - removedSize + newEntrySize;

        for (const v of values) {
            this.entries.push([lower, name, v]);
        }
    }

    delete(name: FieldName): void {
        ensureMutable(this._immutable);
        validateFieldName(name);
        const lower = name.toLowerCase();
        this.entries = this.entries.filter(([key, origName, val]) => {
            if (key === lower) {
                this.totalSize -= origName.length + val.length;
                return false;
            }
            return true;
        });
    }

    getAndDelete(name: FieldName): Array<FieldValue> {
        ensureMutable(this._immutable);
        validateFieldName(name);
        const lower = name.toLowerCase();
        const result: FieldValue[] = [];
        this.entries = this.entries.filter(([key, origName, val]) => {
            if (key === lower) {
                this.totalSize -= origName.length + val.length;
                result.push(val);
                return false;
            }
            return true;
        });
        return result;
    }

    append(name: FieldName, value: FieldValue): void {
        ensureMutable(this._immutable);
        validateFieldName(name);
        validateFieldValue(value);
        checkForbiddenHeader(name);
        const entrySize = name.length + value.length;
        if (this.totalSize + entrySize > this.limits.maxHeadersBytes) {
            throw Object.assign(new Error('headers size exceeded'), { tag: 'size-exceeded' } as HeaderError);
        }
        this.totalSize += entrySize;
        this.entries.push([name.toLowerCase(), name, value]);
    }

    copyAll(): Array<[FieldName, FieldValue]> {
        return this.entries.map(([, origName, value]) => [origName, value]);
    }

    clone(): HttpFields {
        const f = new HttpFields(this.limits);
        for (const [lower, origName, value] of this.entries) {
            const copy = new Uint8Array(value.length);
            copy.set(value);
            f.entries.push([lower, origName, copy]);
        }
        f.totalSize = this.totalSize;
        return f;
    }

    /** Mark this Fields instance as immutable. */
    freeze(): void {
        this._immutable = true;
    }

    /** Whether this Fields instance is immutable. */
    get immutable(): boolean {
        return this._immutable;
    }

    /** Convert to a JS Headers object (for fetch). */
    toFetchHeaders(): globalThis.Headers {
        const h = new globalThis.Headers();
        for (const [, origName, value] of this.entries) {
            h.append(origName, new TextDecoder().decode(value));
        }
        return h;
    }

    /** Create from a fetch Response.headers. */
    static fromFetchHeaders(headers: globalThis.Headers, limits?: HttpLimits): HttpFields {
        const f = new HttpFields(limits);
        headers.forEach((value, name) => {
            const encoded = new TextEncoder().encode(value);
            const entrySize = name.length + encoded.length;
            f.totalSize += entrySize;
            f.entries.push([name.toLowerCase(), name, encoded]);
        });
        f._immutable = true;
        return f;
    }
}

// ──────────────────── RequestOptions resource ────────────────────

class HttpRequestOptions {
    private _connectTimeout: Duration | undefined;
    private _firstByteTimeout: Duration | undefined;
    private _betweenBytesTimeout: Duration | undefined;
    private _immutable = false;

    constructor() {
        // defaults: all undefined
    }

    getConnectTimeout(): Duration | undefined {
        return this._connectTimeout;
    }

    setConnectTimeout(duration: Duration | undefined): void {
        if (this._immutable) {
            throw Object.assign(new Error('request options are immutable'), { tag: 'immutable' } as RequestOptionsError);
        }
        this._connectTimeout = duration;
    }

    getFirstByteTimeout(): Duration | undefined {
        return this._firstByteTimeout;
    }

    setFirstByteTimeout(duration: Duration | undefined): void {
        if (this._immutable) {
            throw Object.assign(new Error('request options are immutable'), { tag: 'immutable' } as RequestOptionsError);
        }
        this._firstByteTimeout = duration;
    }

    getBetweenBytesTimeout(): Duration | undefined {
        return this._betweenBytesTimeout;
    }

    setBetweenBytesTimeout(duration: Duration | undefined): void {
        if (this._immutable) {
            throw Object.assign(new Error('request options are immutable'), { tag: 'immutable' } as RequestOptionsError);
        }
        this._betweenBytesTimeout = duration;
    }

    clone(): HttpRequestOptions {
        const c = new HttpRequestOptions();
        c._connectTimeout = this._connectTimeout;
        c._firstByteTimeout = this._firstByteTimeout;
        c._betweenBytesTimeout = this._betweenBytesTimeout;
        return c;
    }

    freeze(): void {
        this._immutable = true;
    }

    /** Get the most restrictive timeout in ms for use with AbortSignal. */
    getTimeoutMs(defaultMs: number): number {
        const candidates: number[] = [];
        if (this._connectTimeout !== undefined) candidates.push(Number(this._connectTimeout) / 1_000_000);
        if (this._firstByteTimeout !== undefined) candidates.push(Number(this._firstByteTimeout) / 1_000_000);
        if (candidates.length === 0) return defaultMs;
        return Math.min(...candidates);
    }
}

// ──────────────────── Request resource ────────────────────

class HttpRequest {
    private _method: Method = { tag: 'get' };
    private _pathWithQuery: string | undefined;
    private _scheme: Scheme | undefined;
    private _authority: string | undefined;
    private _headers: HttpFields;
    private _options: HttpRequestOptions | undefined;
    private _contents: WasiStreamReadable<Uint8Array> | undefined;
    private _trailers: Promise<Result<HttpFields | undefined, ErrorCode>>;
    private _consumed = false;
    private _completionResolve!: (value: Result<void, ErrorCode>) => void;

    private constructor(
        headers: HttpFields,
        contents: WasiStreamReadable<Uint8Array> | undefined,
        trailers: Promise<Result<HttpFields | undefined, ErrorCode>>,
        options: HttpRequestOptions | undefined,
    ) {
        this._headers = headers;
        this._contents = contents;
        this._trailers = trailers;
        this._options = options;
    }

    static new(
        headers: Headers,
        contents: WasiStreamReadable<Uint8Array> | undefined,
        trailers: Promise<Result<Trailers | undefined, ErrorCode>>,
        options: HttpRequestOptions | undefined,
    ): [HttpRequest, Promise<Result<void, ErrorCode>>] {
        let completionResolve!: (value: Result<void, ErrorCode>) => void;
        const completionFuture = new Promise<Result<void, ErrorCode>>(resolve => {
            completionResolve = resolve;
        });
        const req = new HttpRequest(headers as HttpFields, contents, trailers as Promise<Result<HttpFields | undefined, ErrorCode>>, options);
        req._completionResolve = completionResolve;
        return [req, completionFuture];
    }

    getMethod(): Method {
        return this._method;
    }

    setMethod(method: Method): void {
        if (method.tag === 'other' && !VALID_TOKEN_RE.test(method.val)) {
            throw Object.assign(new Error('invalid method'), { tag: 'HTTP-request-method-invalid' });
        }
        this._method = method;
    }

    getPathWithQuery(): string | undefined {
        return this._pathWithQuery;
    }

    setPathWithQuery(pathWithQuery: string | undefined): void {
        this._pathWithQuery = pathWithQuery;
    }

    getScheme(): Scheme | undefined {
        return this._scheme;
    }

    setScheme(scheme: Scheme | undefined): void {
        this._scheme = scheme;
    }

    getAuthority(): string | undefined {
        return this._authority;
    }

    setAuthority(authority: string | undefined): void {
        if (authority !== undefined && INVALID_FIELD_VALUE_RE.test(authority)) {
            throw Object.assign(new Error('invalid authority'), { tag: 'HTTP-request-URI-invalid' });
        }
        this._authority = authority;
    }

    getOptions(): HttpRequestOptions | undefined {
        if (this._options) {
            this._options.freeze();
        }
        return this._options;
    }

    getHeaders(): HttpFields {
        const frozenClone = this._headers.clone();
        frozenClone.freeze();
        return frozenClone;
    }

    static consumeBody(
        this_: HttpRequest,
        res: Promise<Result<void, ErrorCode>>,
    ): [WasiStreamReadable<Uint8Array>, Promise<Result<Trailers | undefined, ErrorCode>>] {
        if (this_._consumed) {
            throw new Error('request body already consumed');
        }
        this_._consumed = true;

        // Forward the res future to the completion promise
        res.then(r => this_._completionResolve(r)).catch(() => {
            this_._completionResolve(err({ tag: 'internal-error', val: 'res future rejected' }));
        });

        // If no contents, return an empty stream
        const bodyStream: WasiStreamReadable<Uint8Array> = this_._contents ?? {
            async *[Symbol.asyncIterator]() { /* empty body */ },
        };

        return [bodyStream, this_._trailers as Promise<Result<Trailers | undefined, ErrorCode>>];
    }

    /** @internal Access for send() implementation. */
    get _internalContents(): WasiStreamReadable<Uint8Array> | undefined { return this._contents; }
    get _internalHeaders(): HttpFields { return this._headers; }
    get _internalOptions(): HttpRequestOptions | undefined { return this._options; }
    get _internalCompletionResolve(): (value: Result<void, ErrorCode>) => void { return this._completionResolve; }
}

// ──────────────────── Response resource ────────────────────

class HttpResponse {
    private _statusCode: StatusCode = 200;
    private _headers: HttpFields;
    private _contents: WasiStreamReadable<Uint8Array> | undefined;
    private _trailers: Promise<Result<HttpFields | undefined, ErrorCode>>;
    private _consumed = false;
    private _completionResolve!: (value: Result<void, ErrorCode>) => void;

    private constructor(
        headers: HttpFields,
        contents: WasiStreamReadable<Uint8Array> | undefined,
        trailers: Promise<Result<HttpFields | undefined, ErrorCode>>,
    ) {
        this._headers = headers;
        this._contents = contents;
        this._trailers = trailers;
    }

    static new(
        headers: Headers,
        contents: WasiStreamReadable<Uint8Array> | undefined,
        trailers: Promise<Result<Trailers | undefined, ErrorCode>>,
    ): [HttpResponse, Promise<Result<void, ErrorCode>>] {
        let completionResolve!: (value: Result<void, ErrorCode>) => void;
        const completionFuture = new Promise<Result<void, ErrorCode>>(resolve => {
            completionResolve = resolve;
        });
        const resp = new HttpResponse(headers as HttpFields, contents, trailers as Promise<Result<HttpFields | undefined, ErrorCode>>);
        resp._completionResolve = completionResolve;
        return [resp, completionFuture];
    }

    getStatusCode(): StatusCode {
        return this._statusCode;
    }

    setStatusCode(statusCode: StatusCode): void {
        if (statusCode < 0 || statusCode > 999 || !Number.isInteger(statusCode)) {
            throw new Error(`invalid status code: ${statusCode}`);
        }
        this._statusCode = statusCode;
    }

    getHeaders(): HttpFields {
        const frozenClone = this._headers.clone();
        frozenClone.freeze();
        return frozenClone;
    }

    static consumeBody(
        this_: HttpResponse,
        res: Promise<Result<void, ErrorCode>>,
    ): [WasiStreamReadable<Uint8Array>, Promise<Result<Trailers | undefined, ErrorCode>>] {
        if (this_._consumed) {
            throw new Error('response body already consumed');
        }
        this_._consumed = true;

        res.then(r => this_._completionResolve(r)).catch(() => {
            this_._completionResolve(err({ tag: 'internal-error', val: 'res future rejected' }));
        });

        const bodyStream: WasiStreamReadable<Uint8Array> = this_._contents ?? {
            async *[Symbol.asyncIterator]() { /* empty body */ },
        };

        return [bodyStream, this_._trailers as Promise<Result<Trailers | undefined, ErrorCode>>];
    }

    /** @internal Access for serve() implementation. */
    get _internalStatusCode(): StatusCode { return this._statusCode; }
    get _internalHeaders(): HttpFields { return this._headers; }
    get _internalContents(): WasiStreamReadable<Uint8Array> | undefined { return this._contents; }
    get _internalCompletionResolve(): (value: Result<void, ErrorCode>) => void { return this._completionResolve; }
}

// ──────────────────── HTTP Client: send() ────────────────────

function methodTagToString(method: Method): string {
    if (method.tag === 'other') return method.val;
    return method.tag.toUpperCase();
}

function buildUrl(req: HttpRequest): string {
    const scheme = req.getScheme();
    const authority = req.getAuthority();
    const pathWithQuery = req.getPathWithQuery() ?? '/';

    if (!scheme || !authority) {
        throw Object.assign(new Error('missing scheme or authority'), { tag: 'HTTP-request-URI-invalid' });
    }

    let schemeStr: string;
    if (scheme.tag === 'HTTP') schemeStr = 'http';
    else if (scheme.tag === 'HTTPS') schemeStr = 'https';
    else schemeStr = scheme.val;

    // Only allow http/https schemes
    if (schemeStr !== 'http' && schemeStr !== 'https') {
        throw Object.assign(new Error(`unsupported scheme: ${schemeStr}`), { tag: 'HTTP-request-URI-invalid' });
    }

    return `${schemeStr}://${authority}${pathWithQuery}`;
}

function wrapBodyAsReadableStream(
    stream: WasiStreamReadable<Uint8Array>,
    maxBytes: number,
): ReadableStream<Uint8Array> {
    const iter = (stream as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]();
    let totalBytes = 0;
    return new ReadableStream<Uint8Array>({
        async pull(controller) {
            try {
                const { done, value } = await iter.next();
                if (done) {
                    controller.close();
                    return;
                }
                totalBytes += value.length;
                if (totalBytes > maxBytes) {
                    controller.error(new Error('request body size exceeded'));
                    return;
                }
                controller.enqueue(value);
            } catch (e) {
                controller.error(e);
            }
        },
        cancel() {
            iter.return?.();
        },
    });
}

function mapFetchError(e: unknown): ErrorCode {
    if (e instanceof TypeError) {
        const msg = (e as Error).message.toLowerCase();
        if (msg.includes('abort') || msg.includes('timeout')) {
            return { tag: 'connection-timeout' };
        }
        if (msg.includes('network') || msg.includes('fetch')) {
            return { tag: 'destination-not-found' };
        }
    }
    if (e instanceof DOMException) {
        if (e.name === 'AbortError') {
            return { tag: 'connection-timeout' };
        }
    }
    return { tag: 'internal-error', val: e instanceof Error ? e.message : String(e) };
}

async function sendImpl(
    request: HttpRequest,
    limits: HttpLimits,
    defaultTimeoutMs: number,
): Promise<HttpResponse> {
    const url = buildUrl(request);

    // Validate URL length
    if (url.length > limits.maxRequestUrlBytes) {
        throw Object.assign(new Error('request URI too long'), { tag: 'HTTP-request-URI-too-long' } as ErrorCode);
    }

    const methodStr = methodTagToString(request.getMethod());
    const headers = request._internalHeaders;
    const fetchHeaders = headers.toFetchHeaders();

    // Prepare body
    const contents = request._internalContents;
    let body: ReadableStream<Uint8Array> | undefined;
    if (contents) {
        body = wrapBodyAsReadableStream(contents, limits.maxHttpBodyBytes);
    }

    // Determine timeout
    const options = request._internalOptions;
    const timeoutMs = options ? options.getTimeoutMs(defaultTimeoutMs) : defaultTimeoutMs;

    // Build fetch init
    const init: RequestInit & { duplex?: string } = {
        method: methodStr,
        headers: fetchHeaders,
        signal: AbortSignal.timeout(timeoutMs),
    };

    if (body) {
        init.body = body;
        init.duplex = 'half';
    }

    let fetchResponse: globalThis.Response;
    try {
        fetchResponse = await fetch(url, init);
    } catch (e) {
        const errorCode = mapFetchError(e);
        request._internalCompletionResolve(err(errorCode));
        throw Object.assign(new Error(`HTTP send failed: ${(e as Error).message}`), errorCode);
    }

    // Mark request as successfully transmitted
    request._internalCompletionResolve(ok(undefined));

    // Build response
    const responseHeaders = HttpFields.fromFetchHeaders(fetchResponse.headers, limits);

    // Wrap response body as WasiStreamReadable
    let responseContents: WasiStreamReadable<Uint8Array> | undefined;
    if (fetchResponse.body) {
        const reader = fetchResponse.body.getReader();
        let totalResponseBytes = 0;
        responseContents = {
            async *[Symbol.asyncIterator]() {
                try {
                    for (; ;) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        totalResponseBytes += value.length;
                        if (totalResponseBytes > limits.maxHttpBodyBytes) {
                            reader.cancel('response body size exceeded');
                            throw new Error('response body size exceeded');
                        }
                        yield value;
                    }
                } finally {
                    reader.releaseLock();
                }
            },
        };
    }

    // No trailers support from fetch API — resolve with ok(undefined)
    const trailersPromise = Promise.resolve(ok(undefined) as Result<Trailers | undefined, ErrorCode>);

    const [response] = HttpResponse.new(responseHeaders, responseContents, trailersPromise);
    (response as { setStatusCode(s: number): void }).setStatusCode(fetchResponse.status);

    return response;
}

// ──────────────────── Factory functions ────────────────────

/**
 * Create the `wasi:http/types` interface.
 *
 * Returns the `Fields`, `Request`, `RequestOptions`, and `Response` resource
 * classes configured with the current network limits.
 */
export function createHttpTypes(config?: HostConfig): typeof WasiHttpTypes {
    const limits = getHttpLimits(config?.network);

    const FieldsClass = class extends HttpFields {
        constructor() {
            super(limits);
        }

        static fromList(entries: Array<[FieldName, FieldValue]>): HttpFields {
            return HttpFields.fromList(entries, limits);
        }
    };

    return {
        Fields: FieldsClass,
        Request: HttpRequest,
        RequestOptions: HttpRequestOptions,
        Response: HttpResponse,
    } as unknown as typeof WasiHttpTypes;
}

/**
 * Create the `wasi:http/client` interface.
 *
 * Provides `send(request)` which executes HTTP requests via the Fetch API
 * with duplex streaming, timeout support, and full error code mapping.
 */
export function createHttpClient(config?: HostConfig): typeof WasiHttpClient {
    const limits = getHttpLimits(config?.network);
    const defaultTimeoutMs = config?.network?.httpRequestTimeoutMs ?? NETWORK_DEFAULTS.httpRequestTimeoutMs;

    return {
        async send(request: unknown): Promise<unknown> {
            return sendImpl(request as HttpRequest, limits, defaultTimeoutMs);
        },
    } as unknown as typeof WasiHttpClient;
}

/**
 * Create the `wasi:http/handler` interface (stub).
 *
 * The handler is a guest export, not a host import. This stub throws
 * a descriptive error if called — use `serve()` for server mode.
 */
export function createHttpHandler(): typeof WasiHttpHandler {
    // handler is a guest export, not a host import.
    // For now, provide a stub that throws.
    return {
        async handle(): Promise<never> {
            throw new Error('WASIp3 host: http/handler is a guest export, not a host import');
        },
    } as unknown as typeof WasiHttpHandler;
}

// ──────────────────── Internal exports for HTTP server ────────────────────

/** @internal Used by node/http-server.ts */
export {
    HttpFields as _HttpFields,
    HttpRequest as _HttpRequest,
    HttpResponse as _HttpResponse,
    getHttpLimits as _getHttpLimits,
};
export type { HttpLimits as _HttpLimits };
export type { Result as _HttpResult, ErrorCode as _HttpErrorCode, Method as _HttpMethod, Scheme as _HttpScheme };
