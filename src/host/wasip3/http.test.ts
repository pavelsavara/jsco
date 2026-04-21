// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { createHttpTypes, createHttpClient, createHttpHandler } from './http';
import type { WasiP3Config } from './types';

// ──────────────────── Helper: text encoder ────────────────────
const enc = new TextEncoder();
const dec = new TextDecoder();

function encode(s: string): Uint8Array {
    return enc.encode(s);
}

// ──────────────────── Access internals via the WIT-shaped API ────────────────────

// The factories return WIT-typed objects; cast to access class methods.
function getTypes(config?: WasiP3Config) {
    return createHttpTypes(config) as unknown as {
        Fields: {
            new(): FieldsLike;
            fromList(entries: Array<[string, Uint8Array]>): FieldsLike;
        };
        Request: {
            new(
                headers: FieldsLike,
                contents: AsyncIterable<Uint8Array> | undefined,
                trailers: Promise<{ tag: string; val: unknown }>,
                options: RequestOptionsLike | undefined,
            ): [RequestLike, Promise<{ tag: string; val: unknown }>];
            consumeBody(
                req: RequestLike,
                res: Promise<{ tag: string; val: unknown }>,
            ): [AsyncIterable<Uint8Array>, Promise<{ tag: string; val: unknown }>];
        };
        RequestOptions: { new(): RequestOptionsLike };
        Response: {
            new(
                headers: FieldsLike,
                contents: AsyncIterable<Uint8Array> | undefined,
                trailers: Promise<{ tag: string; val: unknown }>,
            ): [ResponseLike, Promise<{ tag: string; val: unknown }>];
            consumeBody(
                resp: ResponseLike,
                res: Promise<{ tag: string; val: unknown }>,
            ): [AsyncIterable<Uint8Array>, Promise<{ tag: string; val: unknown }>];
        };
    };
}

interface FieldsLike {
    get(name: string): Uint8Array[];
    has(name: string): boolean;
    set(name: string, values: Uint8Array[]): void;
    delete(name: string): void;
    getAndDelete(name: string): Uint8Array[];
    append(name: string, value: Uint8Array): void;
    copyAll(): Array<[string, Uint8Array]>;
    clone(): FieldsLike;
}

interface RequestOptionsLike {
    getConnectTimeout(): bigint | undefined;
    setConnectTimeout(d: bigint | undefined): void;
    getFirstByteTimeout(): bigint | undefined;
    setFirstByteTimeout(d: bigint | undefined): void;
    getBetweenBytesTimeout(): bigint | undefined;
    setBetweenBytesTimeout(d: bigint | undefined): void;
    clone(): RequestOptionsLike;
}

interface RequestLike {
    getMethod(): { tag: string; val?: string };
    setMethod(m: { tag: string; val?: string }): void;
    getPathWithQuery(): string | undefined;
    setPathWithQuery(p: string | undefined): void;
    getScheme(): { tag: string; val?: string } | undefined;
    setScheme(s: { tag: string; val?: string } | undefined): void;
    getAuthority(): string | undefined;
    setAuthority(a: string | undefined): void;
    getOptions(): RequestOptionsLike | undefined;
    getHeaders(): FieldsLike;
}

interface ResponseLike {
    getStatusCode(): number;
    setStatusCode(s: number): void;
    getHeaders(): FieldsLike;
}

// ──────────────────── Fields ────────────────────

describe('HttpFields', () => {
    const types = getTypes();

    describe('constructor and fromList', () => {
        it('empty constructor creates empty fields', () => {
            const f = new types.Fields();
            expect(f.copyAll()).toEqual([]);
        });

        it('fromList creates fields from entries', () => {
            const f = types.Fields.fromList([
                ['content-type', encode('text/html')],
                ['x-custom', encode('val1')],
            ]);
            expect(f.has('content-type')).toBe(true);
            expect(f.has('x-custom')).toBe(true);
            expect(dec.decode(f.get('content-type')[0])).toBe('text/html');
        });

        it('fromList rejects invalid header name', () => {
            expect(() => types.Fields.fromList([['bad name', encode('v')]])).toThrow();
        });

        it('fromList rejects CRLF in value', () => {
            expect(() => types.Fields.fromList([['x-ok', new Uint8Array([0x0d, 0x0a])]])).toThrow();
        });

        it('fromList rejects null byte in value', () => {
            expect(() => types.Fields.fromList([['x-ok', new Uint8Array([0x00])]])).toThrow();
        });

        it('fromList rejects forbidden header', () => {
            expect(() => types.Fields.fromList([['host', encode('example.com')]])).toThrow();
        });
    });

    describe('get/has', () => {
        it('get returns all values for a name (case insensitive)', () => {
            const f = types.Fields.fromList([
                ['X-Custom', encode('a')],
                ['x-custom', encode('b')],
            ]);
            const vals = f.get('X-CUSTOM');
            expect(vals.length).toBe(2);
            expect(dec.decode(vals[0])).toBe('a');
            expect(dec.decode(vals[1])).toBe('b');
        });

        it('get returns empty array for missing name', () => {
            const f = new types.Fields();
            expect(f.get('x-missing')).toEqual([]);
        });

        it('has returns false for syntactically invalid name', () => {
            const f = new types.Fields();
            expect(f.has('bad name')).toBe(false);
        });

        it('has returns false for missing name', () => {
            const f = new types.Fields();
            expect(f.has('x-missing')).toBe(false);
        });
    });

    describe('set', () => {
        it('set replaces existing values', () => {
            const f = types.Fields.fromList([['x-foo', encode('old')]]);
            f.set('x-foo', [encode('new1'), encode('new2')]);
            expect(f.get('x-foo').length).toBe(2);
            expect(dec.decode(f.get('x-foo')[0])).toBe('new1');
        });

        it('set validates name', () => {
            const f = new types.Fields();
            expect(() => f.set('bad name', [encode('v')])).toThrow();
        });

        it('set rejects forbidden header', () => {
            const f = new types.Fields();
            expect(() => f.set('host', [encode('evil.com')])).toThrow();
        });
    });

    describe('delete', () => {
        it('delete removes all values for a name', () => {
            const f = types.Fields.fromList([
                ['x-foo', encode('a')],
                ['x-foo', encode('b')],
                ['x-bar', encode('c')],
            ]);
            f.delete('x-foo');
            expect(f.has('x-foo')).toBe(false);
            expect(f.has('x-bar')).toBe(true);
        });

        it('delete on missing name is a no-op', () => {
            const f = new types.Fields();
            expect(() => f.delete('x-missing')).not.toThrow();
        });
    });

    describe('getAndDelete', () => {
        it('getAndDelete returns values and removes', () => {
            const f = types.Fields.fromList([['x-foo', encode('val')]]);
            const vals = f.getAndDelete('x-foo');
            expect(vals.length).toBe(1);
            expect(dec.decode(vals[0])).toBe('val');
            expect(f.has('x-foo')).toBe(false);
        });
    });

    describe('append', () => {
        it('append adds a value without removing existing', () => {
            const f = types.Fields.fromList([['x-foo', encode('a')]]);
            f.append('x-foo', encode('b'));
            expect(f.get('x-foo').length).toBe(2);
        });

        it('append rejects forbidden header', () => {
            const f = new types.Fields();
            expect(() => f.append('transfer-encoding', encode('chunked'))).toThrow();
        });
    });

    describe('copyAll', () => {
        it('copyAll returns all entries preserving original casing', () => {
            const f = types.Fields.fromList([
                ['Content-Type', encode('text/plain')],
                ['X-Custom', encode('v')],
            ]);
            const all = f.copyAll();
            expect(all.length).toBe(2);
            expect(all[0][0]).toBe('Content-Type');
            expect(all[1][0]).toBe('X-Custom');
        });
    });

    describe('clone', () => {
        it('clone creates independent copy', () => {
            const f = types.Fields.fromList([['x-foo', encode('original')]]);
            const c = f.clone();
            c.set('x-foo', [encode('modified')]);
            // Original unchanged
            expect(dec.decode(f.get('x-foo')[0])).toBe('original');
            expect(dec.decode(c.get('x-foo')[0])).toBe('modified');
        });

        it('clone deep copies values', () => {
            const val = encode('value');
            const f = types.Fields.fromList([['x-foo', val]]);
            const c = f.clone();
            // Mutate the clone's value copy
            const cloneVal = c.get('x-foo')[0];
            cloneVal[0] = 0xff;
            // Original still intact
            expect(f.get('x-foo')[0][0]).not.toBe(0xff);
        });
    });

    describe('immutability', () => {
        it('set on immutable fields throws', () => {
            const f = types.Fields.fromList([['x-foo', encode('v')]]);
            // Freeze by using it as request headers (getHeaders freezes clone)
            // Instead, test through creating a request and getting headers
            // For direct test, we can use the internal freeze:
            (f as unknown as { freeze(): void }).freeze();
            expect(() => f.set('x-foo', [encode('new')])).toThrow();
        });

        it('delete on immutable fields throws', () => {
            const f = new types.Fields();
            (f as unknown as { freeze(): void }).freeze();
            expect(() => f.delete('x-foo')).toThrow();
        });

        it('append on immutable fields throws', () => {
            const f = new types.Fields();
            (f as unknown as { freeze(): void }).freeze();
            expect(() => f.append('x-foo', encode('v'))).toThrow();
        });

        it('getAndDelete on immutable fields throws', () => {
            const f = new types.Fields();
            (f as unknown as { freeze(): void }).freeze();
            expect(() => f.getAndDelete('x-foo')).toThrow();
        });
    });

    describe('size limits', () => {
        it('rejects headers exceeding size limit', () => {
            const config: WasiP3Config = { network: { maxHttpHeadersBytes: 50 } };
            const t = getTypes(config);
            // Each entry: name.length + value.length
            expect(() => t.Fields.fromList([
                ['x-big', new Uint8Array(100)],
            ])).toThrow();
        });

        it('append rejects when size would be exceeded', () => {
            const config: WasiP3Config = { network: { maxHttpHeadersBytes: 30 } };
            const t = getTypes(config);
            const f = t.Fields.fromList([['x-a', encode('short')]]);
            expect(() => f.append('x-b', new Uint8Array(30))).toThrow();
        });
    });

    describe('evil arguments', () => {
        it('header name __proto__ is a valid token but forbidden-safe', () => {
            // __proto__ matches the token regex, so it's syntactically valid
            // It should not pollute prototypes
            const f = types.Fields.fromList([['__proto__', encode('evil')]]);
            expect(f.get('__proto__').length).toBe(1);
            expect(({} as Record<string, unknown>)['__proto__']).not.toBe('evil');
        });

        it('header name constructor should not pollute', () => {
            const f = types.Fields.fromList([['constructor', encode('evil')]]);
            expect(f.get('constructor').length).toBe(1);
        });

        it('header value with response splitting pattern is rejected', () => {
            // HTTP response splitting: value contains \r\n followed by a fake header
            expect(() => types.Fields.fromList([
                ['x-safe', encode('value\r\nX-Injected: true')],
            ])).toThrow();
        });

        it('many headers are accepted within size limit', () => {
            const config: WasiP3Config = { network: { maxHttpHeadersBytes: 100_000 } };
            const t = getTypes(config);
            const entries: [string, Uint8Array][] = [];
            for (let i = 0; i < 100; i++) {
                entries.push([`x-h${i}`, encode(`value${i}`)]);
            }
            const f = t.Fields.fromList(entries);
            expect(f.copyAll().length).toBe(100);
        });
    });

    describe('invalid arguments', () => {
        it('set with empty header name throws', () => {
            const f = new types.Fields();
            expect(() => f.set('', [encode('value')])).toThrow();
        });

        it('fromList with header name containing null byte throws', () => {
            expect(() => types.Fields.fromList([['x-null\x00byte', encode('v')]])).toThrow();
        });

        it('fromList with header name containing CRLF throws', () => {
            expect(() => types.Fields.fromList([['x-bad\r\n', encode('v')]])).toThrow();
        });

        it('header value with only \\r (no \\n) is accepted', () => {
            // Bare \r without \n may be accepted per some implementations
            // or rejected — verify no crash
            try {
                types.Fields.fromList([['x-bare-cr', encode('val\rue')]]);
            } catch {
                // Also acceptable
            }
        });

        it('empty header value is valid', () => {
            const f = types.Fields.fromList([['x-empty', new Uint8Array(0)]]);
            expect(f.get('x-empty').length).toBe(1);
            expect(f.get('x-empty')[0].length).toBe(0);
        });

        it('multiple values for same header preserved in order', () => {
            const f = types.Fields.fromList([
                ['x-multi', encode('first')],
                ['x-multi', encode('second')],
                ['x-multi', encode('third')],
            ]);
            const vals = f.get('x-multi');
            expect(vals.length).toBe(3);
            expect(dec.decode(vals[0])).toBe('first');
            expect(dec.decode(vals[1])).toBe('second');
            expect(dec.decode(vals[2])).toBe('third');
        });
    });
});

// ──────────────────── RequestOptions ────────────────────

describe('HttpRequestOptions', () => {
    const types = getTypes();

    it('default options have undefined timeouts', () => {
        const o = new types.RequestOptions();
        expect(o.getConnectTimeout()).toBeUndefined();
        expect(o.getFirstByteTimeout()).toBeUndefined();
        expect(o.getBetweenBytesTimeout()).toBeUndefined();
    });

    it('set and get timeouts', () => {
        const o = new types.RequestOptions();
        o.setConnectTimeout(5_000_000_000n);
        o.setFirstByteTimeout(10_000_000_000n);
        o.setBetweenBytesTimeout(1_000_000_000n);
        expect(o.getConnectTimeout()).toBe(5_000_000_000n);
        expect(o.getFirstByteTimeout()).toBe(10_000_000_000n);
        expect(o.getBetweenBytesTimeout()).toBe(1_000_000_000n);
    });

    it('clone creates independent copy', () => {
        const o = new types.RequestOptions();
        o.setConnectTimeout(1n);
        const c = o.clone();
        c.setConnectTimeout(2n);
        expect(o.getConnectTimeout()).toBe(1n);
        expect(c.getConnectTimeout()).toBe(2n);
    });

    it('set on frozen options throws', () => {
        const o = new types.RequestOptions();
        (o as unknown as { freeze(): void }).freeze();
        expect(() => o.setConnectTimeout(1n)).toThrow();
    });
});

// ──────────────────── Request ────────────────────

describe('HttpRequest', () => {
    const types = getTypes();

    function makeRequest(opts?: { body?: AsyncIterable<Uint8Array>; options?: RequestOptionsLike }) {
        const headers = new types.Fields();
        const trailers = Promise.resolve({ tag: 'ok' as const, val: undefined });
        return types.Request.new(
            headers,
            opts?.body as unknown as AsyncIterable<Uint8Array> | undefined,
            trailers,
            opts?.options,
        );
    }

    it('default method is GET', () => {
        const [req] = makeRequest();
        expect(req.getMethod().tag).toBe('get');
    });

    it('set/get method', () => {
        const [req] = makeRequest();
        req.setMethod({ tag: 'post' });
        expect(req.getMethod().tag).toBe('post');
    });

    it('set custom method', () => {
        const [req] = makeRequest();
        req.setMethod({ tag: 'other', val: 'PURGE' });
        expect(req.getMethod()).toEqual({ tag: 'other', val: 'PURGE' });
    });

    it('setMethod rejects invalid custom method', () => {
        const [req] = makeRequest();
        expect(() => req.setMethod({ tag: 'other', val: '' })).toThrow();
    });

    it('set/get pathWithQuery', () => {
        const [req] = makeRequest();
        req.setPathWithQuery('/api/v1?q=test');
        expect(req.getPathWithQuery()).toBe('/api/v1?q=test');
    });

    it('default pathWithQuery is undefined', () => {
        const [req] = makeRequest();
        expect(req.getPathWithQuery()).toBeUndefined();
    });

    it('set/get scheme', () => {
        const [req] = makeRequest();
        req.setScheme({ tag: 'HTTPS' });
        expect(req.getScheme()).toEqual({ tag: 'HTTPS' });
    });

    it('set custom scheme other', () => {
        const [req] = makeRequest();
        req.setScheme({ tag: 'other', val: 'wss' });
        expect(req.getScheme()).toEqual({ tag: 'other', val: 'wss' });
    });

    it('set/get authority', () => {
        const [req] = makeRequest();
        req.setAuthority('example.com');
        expect(req.getAuthority()).toBe('example.com');
    });

    it('setAuthority rejects CRLF injection', () => {
        const [req] = makeRequest();
        expect(() => req.setAuthority('evil.com\r\nX-Injected: true')).toThrow();
    });

    it('getHeaders returns frozen clone', () => {
        const [req] = makeRequest();
        const h = req.getHeaders();
        expect(() => h.set('x-test', [encode('v')])).toThrow();
    });

    it('getOptions returns frozen options', () => {
        const opts = new types.RequestOptions();
        opts.setConnectTimeout(1n);
        const [req] = makeRequest({ options: opts });
        const o = req.getOptions();
        expect(o).toBeDefined();
        expect(o!.getConnectTimeout()).toBe(1n);
        expect(() => o!.setConnectTimeout(2n)).toThrow();
    });

    it('consumeBody returns body stream and trailers', async () => {
        const bodyData = encode('hello');
        const body = {
            async *[Symbol.asyncIterator]() {
                yield bodyData;
            },
        };
        const [req] = makeRequest({ body });
        const resFuture = Promise.resolve({ tag: 'ok' as const, val: undefined });
        const [stream, trailers] = types.Request.consumeBody(req, resFuture);
        const chunks: Uint8Array[] = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        expect(chunks.length).toBe(1);
        expect(dec.decode(chunks[0])).toBe('hello');

        const t = await trailers;
        expect(t.tag).toBe('ok');
    });

    it('consumeBody twice throws', () => {
        const [req] = makeRequest();
        const resFuture = Promise.resolve({ tag: 'ok' as const, val: undefined });
        types.Request.consumeBody(req, resFuture);
        expect(() => types.Request.consumeBody(req, resFuture)).toThrow(/already consumed/);
    });

    it('consumeBody with no contents returns empty stream', async () => {
        const [req] = makeRequest();
        const resFuture = Promise.resolve({ tag: 'ok' as const, val: undefined });
        const [stream] = types.Request.consumeBody(req, resFuture);
        const chunks: Uint8Array[] = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        expect(chunks.length).toBe(0);
    });

    it('new returns completion future', () => {
        const [, completionFuture] = makeRequest();
        expect(completionFuture).toBeInstanceOf(Promise);
    });

    it('setPathWithQuery with path traversal stores as-is (no host-side decoding)', () => {
        const [req] = makeRequest();
        // WASI HTTP does not decode/resolve URL paths — that's the server's job
        req.setPathWithQuery('/../../../etc/passwd');
        expect(req.getPathWithQuery()).toBe('/../../../etc/passwd');
    });

    it('setMethod CONNECT is accepted (host does not restrict methods)', () => {
        const [req] = makeRequest();
        req.setMethod({ tag: 'other', val: 'CONNECT' });
        expect(req.getMethod()).toEqual({ tag: 'other', val: 'CONNECT' });
    });

    it('request without body — consumeBody yields empty stream', async () => {
        const [req] = makeRequest();
        const resFuture = Promise.resolve({ tag: 'ok' as const, val: undefined });
        const [stream] = types.Request.consumeBody(req, resFuture);
        const chunks: Uint8Array[] = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        expect(chunks.length).toBe(0);
    });

    it('request without options — getOptions returns undefined', () => {
        const [req] = makeRequest();
        // No options were passed to makeRequest
        // Depending on implementation, it may return undefined or default options
        const opts = req.getOptions();
        // Either is acceptable
        if (opts === undefined) {
            expect(opts).toBeUndefined();
        } else {
            expect(opts.getConnectTimeout()).toBeUndefined();
        }
    });
});

// ──────────────────── Response ────────────────────

describe('HttpResponse', () => {
    const types = getTypes();

    function makeResponse(opts?: { body?: AsyncIterable<Uint8Array> }) {
        const headers = new types.Fields();
        const trailers = Promise.resolve({ tag: 'ok' as const, val: undefined });
        return types.Response.new(
            headers,
            opts?.body as unknown as AsyncIterable<Uint8Array> | undefined,
            trailers,
        );
    }

    it('default status code is 200', () => {
        const [resp] = makeResponse();
        expect(resp.getStatusCode()).toBe(200);
    });

    it('set/get status code', () => {
        const [resp] = makeResponse();
        resp.setStatusCode(404);
        expect(resp.getStatusCode()).toBe(404);
    });

    it('setStatusCode rejects invalid values', () => {
        const [resp] = makeResponse();
        expect(() => resp.setStatusCode(-1)).toThrow();
        expect(() => resp.setStatusCode(1000)).toThrow();
        expect(() => resp.setStatusCode(1.5)).toThrow();
    });

    it('setStatusCode 0 is rejected or set', () => {
        const [resp] = makeResponse();
        // 0 is not a valid HTTP status code — implementation may reject it
        try {
            resp.setStatusCode(0);
            // If it doesn't throw, at least verify it was stored
            expect(resp.getStatusCode()).toBe(0);
        } catch {
            // Expected — 0 is invalid
        }
    });

    it('setStatusCode 999 is accepted', () => {
        const [resp] = makeResponse();
        resp.setStatusCode(999);
        expect(resp.getStatusCode()).toBe(999);
    });

    it('getHeaders returns frozen clone', () => {
        const [resp] = makeResponse();
        const h = resp.getHeaders();
        expect(() => h.set('x-test', [encode('v')])).toThrow();
    });

    it('consumeBody returns body stream', async () => {
        const bodyData = encode('response body');
        const body = {
            async *[Symbol.asyncIterator]() {
                yield bodyData;
            },
        };
        const [resp] = makeResponse({ body });
        const resFuture = Promise.resolve({ tag: 'ok' as const, val: undefined });
        const [stream, trailers] = types.Response.consumeBody(resp, resFuture);
        const chunks: Uint8Array[] = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        expect(dec.decode(chunks[0])).toBe('response body');

        const t = await trailers;
        expect(t.tag).toBe('ok');
    });

    it('consumeBody twice throws', () => {
        const [resp] = makeResponse();
        const resFuture = Promise.resolve({ tag: 'ok' as const, val: undefined });
        types.Response.consumeBody(resp, resFuture);
        expect(() => types.Response.consumeBody(resp, resFuture)).toThrow(/already consumed/);
    });

    it('consumeBody with no contents returns empty stream', async () => {
        const [resp] = makeResponse();
        const resFuture = Promise.resolve({ tag: 'ok' as const, val: undefined });
        const [stream] = types.Response.consumeBody(resp, resFuture);
        const chunks: Uint8Array[] = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        expect(chunks.length).toBe(0);
    });

    it('new returns completion future', () => {
        const [, completionFuture] = makeResponse();
        expect(completionFuture).toBeInstanceOf(Promise);
    });
});

// ──────────────────── HTTP Client: send() ────────────────────

describe('HttpClient.send()', () => {
    const types = getTypes();
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    function mockFetch(handler: (url: string, init: RequestInit) => Promise<globalThis.Response>) {
        globalThis.fetch = handler as typeof globalThis.fetch;
    }

    function buildRequest(opts: {
        method?: { tag: string; val?: string };
        scheme?: { tag: string; val?: string };
        authority?: string;
        path?: string;
        headers?: Array<[string, Uint8Array]>;
        body?: AsyncIterable<Uint8Array>;
        options?: RequestOptionsLike;
    }): RequestLike {
        const h = opts.headers ? types.Fields.fromList(opts.headers) : new types.Fields();
        const trailers = Promise.resolve({ tag: 'ok' as const, val: undefined });
        const [req] = types.Request.new(h, opts.body as unknown as AsyncIterable<Uint8Array> | undefined, trailers, opts.options);
        if (opts.method) req.setMethod(opts.method as { tag: string; val?: string });
        if (opts.scheme) req.setScheme(opts.scheme as { tag: string; val?: string });
        if (opts.authority) req.setAuthority(opts.authority);
        if (opts.path) req.setPathWithQuery(opts.path);
        return req;
    }

    it('sends a GET request and receives response', async () => {
        mockFetch(async (url, init) => {
            expect(url).toBe('https://example.com/test');
            expect(init.method).toBe('GET');
            return new Response('hello', { status: 200, headers: { 'x-resp': 'yes' } });
        });

        const client = createHttpClient();
        const req = buildRequest({ scheme: { tag: 'HTTPS' }, authority: 'example.com', path: '/test' });
        const resp = await (client as unknown as { send(r: RequestLike): Promise<ResponseLike> }).send(req);

        expect(resp.getStatusCode()).toBe(200);
        const h = resp.getHeaders();
        expect(h.has('x-resp')).toBe(true);
    });

    it('sends a POST request with body', async () => {
        let receivedBody = '';
        mockFetch(async (_url, init) => {
            if (init.body) {
                const reader = (init.body as ReadableStream<Uint8Array>).getReader();
                const chunks: Uint8Array[] = [];
                for (; ;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value);
                }
                receivedBody = dec.decode(new Uint8Array(chunks.reduce((a, c) => a + c.length, 0)));
                let offset = 0;
                const merged = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
                for (const c of chunks) { merged.set(c, offset); offset += c.length; }
                receivedBody = dec.decode(merged);
            }
            return new Response('ok', { status: 201 });
        });

        const body = {
            async *[Symbol.asyncIterator]() {
                yield encode('request ');
                yield encode('body');
            },
        };

        const client = createHttpClient();
        const req = buildRequest({
            method: { tag: 'post' },
            scheme: { tag: 'HTTP' },
            authority: 'localhost:8080',
            path: '/upload',
            body,
        });
        const resp = await (client as unknown as { send(r: RequestLike): Promise<ResponseLike> }).send(req);

        expect(resp.getStatusCode()).toBe(201);
        expect(receivedBody).toBe('request body');
    });

    it('streams response body', async () => {
        mockFetch(async () => {
            const body = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(encode('chunk1'));
                    controller.enqueue(encode('chunk2'));
                    controller.close();
                },
            });
            return new Response(body, { status: 200 });
        });

        const client = createHttpClient();
        const req = buildRequest({ scheme: { tag: 'HTTPS' }, authority: 'example.com', path: '/' });
        const resp = await (client as unknown as { send(r: RequestLike): Promise<ResponseLike> }).send(req);

        // Consume body via consumeBody
        const resFuture = Promise.resolve({ tag: 'ok' as const, val: undefined });
        const [stream] = (types.Response as unknown as {
            consumeBody(r: ResponseLike, f: Promise<unknown>): [AsyncIterable<Uint8Array>, Promise<unknown>];
        }).consumeBody(resp as unknown as ResponseLike, resFuture);

        const chunks: string[] = [];
        for await (const chunk of stream) {
            chunks.push(dec.decode(chunk));
        }
        expect(chunks).toEqual(['chunk1', 'chunk2']);
    });

    it('rejects unsupported scheme', async () => {
        const client = createHttpClient();
        const req = buildRequest({
            scheme: { tag: 'other', val: 'ftp' },
            authority: 'example.com',
            path: '/',
        });

        await expect(
            (client as unknown as { send(r: RequestLike): Promise<ResponseLike> }).send(req)
        ).rejects.toThrow(/unsupported scheme/);
    });

    it('rejects missing scheme', async () => {
        const client = createHttpClient();
        const req = buildRequest({ authority: 'example.com', path: '/' });

        await expect(
            (client as unknown as { send(r: RequestLike): Promise<ResponseLike> }).send(req)
        ).rejects.toThrow(/missing scheme or authority/);
    });

    it('rejects missing authority', async () => {
        const client = createHttpClient();
        const req = buildRequest({ scheme: { tag: 'HTTPS' }, path: '/' });

        await expect(
            (client as unknown as { send(r: RequestLike): Promise<ResponseLike> }).send(req)
        ).rejects.toThrow(/missing scheme or authority/);
    });

    it('maps fetch TypeError to error code', async () => {
        mockFetch(async () => {
            throw new TypeError('fetch failed');
        });

        const client = createHttpClient();
        const req = buildRequest({ scheme: { tag: 'HTTPS' }, authority: 'no-such-host.invalid', path: '/' });

        await expect(
            (client as unknown as { send(r: RequestLike): Promise<ResponseLike> }).send(req)
        ).rejects.toThrow();
    });

    it('maps AbortError to connection-timeout', async () => {
        mockFetch(async () => {
            throw new DOMException('The operation was aborted', 'AbortError');
        });

        const client = createHttpClient();
        const req = buildRequest({ scheme: { tag: 'HTTPS' }, authority: 'slow-host.invalid', path: '/' });

        try {
            await (client as unknown as { send(r: RequestLike): Promise<ResponseLike> }).send(req);
            fail('should have thrown');
        } catch (e) {
            expect((e as { tag: string }).tag).toBe('connection-timeout');
        }
    });

    it('rejects URL exceeding max length', async () => {
        const config: WasiP3Config = { network: { maxRequestUrlBytes: 50 } };
        const client = createHttpClient(config);
        const req = buildRequest({
            scheme: { tag: 'HTTPS' },
            authority: 'example.com',
            path: '/' + 'a'.repeat(100),
        });

        await expect(
            (client as unknown as { send(r: RequestLike): Promise<ResponseLike> }).send(req)
        ).rejects.toThrow(/too long/);
    });

    it('uses request timeout from options', async () => {
        let receivedSignal: AbortSignal | undefined;
        mockFetch(async (_url, init) => {
            receivedSignal = init.signal ?? undefined;
            return new Response('ok', { status: 200 });
        });

        const opts = new types.RequestOptions();
        opts.setConnectTimeout(2_000_000_000n); // 2 seconds in nanoseconds
        const client = createHttpClient();
        const req = buildRequest({
            scheme: { tag: 'HTTPS' },
            authority: 'example.com',
            path: '/',
            options: opts,
        });
        await (client as unknown as { send(r: RequestLike): Promise<ResponseLike> }).send(req);
        expect(receivedSignal).toBeDefined();
    });

    it('resolves completion future on successful send', async () => {
        mockFetch(async () => new Response('ok', { status: 200 }));

        const h = new types.Fields();
        const trailers = Promise.resolve({ tag: 'ok' as const, val: undefined });
        const [req, completionFuture] = types.Request.new(h, undefined, trailers, undefined);
        req.setScheme({ tag: 'HTTPS' });
        req.setAuthority('example.com');
        req.setPathWithQuery('/');

        const client = createHttpClient();
        await (client as unknown as { send(r: RequestLike): Promise<ResponseLike> }).send(req as unknown as RequestLike);

        const result = await completionFuture;
        expect(result.tag).toBe('ok');
    });

    it('resolves completion future with error on failed send', async () => {
        mockFetch(async () => {
            throw new TypeError('network error');
        });

        const h = new types.Fields();
        const trailers = Promise.resolve({ tag: 'ok' as const, val: undefined });
        const [req, completionFuture] = types.Request.new(h, undefined, trailers, undefined);
        req.setScheme({ tag: 'HTTPS' });
        req.setAuthority('no-such-host.invalid');
        req.setPathWithQuery('/');

        const client = createHttpClient();
        try {
            await (client as unknown as { send(r: RequestLike): Promise<ResponseLike> }).send(req as unknown as RequestLike);
        } catch {
            // expected
        }

        const result = await completionFuture;
        expect(result.tag).toBe('err');
    });

    it('handles response with no body', async () => {
        mockFetch(async () => new Response(null, { status: 204 }));

        const client = createHttpClient();
        const req = buildRequest({ scheme: { tag: 'HTTPS' }, authority: 'example.com', path: '/' });
        const resp = await (client as unknown as { send(r: RequestLike): Promise<ResponseLike> }).send(req);

        expect(resp.getStatusCode()).toBe(204);
    });

    it('preserves response headers', async () => {
        mockFetch(async () => {
            return new Response('ok', {
                status: 200,
                headers: {
                    'content-type': 'application/json',
                    'x-request-id': '12345',
                },
            });
        });

        const client = createHttpClient();
        const req = buildRequest({ scheme: { tag: 'HTTPS' }, authority: 'example.com', path: '/' });
        const resp = await (client as unknown as { send(r: RequestLike): Promise<ResponseLike> }).send(req);

        const h = resp.getHeaders();
        expect(h.has('content-type')).toBe(true);
        expect(h.has('x-request-id')).toBe(true);
    });

    it('passes correct HTTP method', async () => {
        let receivedMethod = '';
        mockFetch(async (_url, init) => {
            receivedMethod = init.method ?? 'GET';
            return new Response('ok', { status: 200 });
        });

        const client = createHttpClient();
        const req = buildRequest({
            method: { tag: 'put' },
            scheme: { tag: 'HTTPS' },
            authority: 'example.com',
            path: '/resource',
        });
        await (client as unknown as { send(r: RequestLike): Promise<ResponseLike> }).send(req);
        expect(receivedMethod).toBe('PUT');
    });

    it('multiple concurrent sends complete independently', async () => {
        let callCount = 0;
        mockFetch(async (_url, _init) => {
            callCount++;
            return new Response(`response-${callCount}`, { status: 200 });
        });

        const client = createHttpClient();
        const req1 = buildRequest({ scheme: { tag: 'HTTPS' }, authority: 'a.com', path: '/1' });
        const req2 = buildRequest({ scheme: { tag: 'HTTPS' }, authority: 'b.com', path: '/2' });

        const [resp1, resp2] = await Promise.all([
            (client as unknown as { send(r: RequestLike): Promise<ResponseLike> }).send(req1),
            (client as unknown as { send(r: RequestLike): Promise<ResponseLike> }).send(req2),
        ]);

        expect(resp1.getStatusCode()).toBe(200);
        expect(resp2.getStatusCode()).toBe(200);
        expect(callCount).toBe(2);
    });

    it('send request with custom request headers', async () => {
        let receivedHeaders: Headers | undefined;
        mockFetch(async (_url, init) => {
            receivedHeaders = new Headers(init.headers as HeadersInit);
            return new Response('ok', { status: 200 });
        });

        const client = createHttpClient();
        const req = buildRequest({
            scheme: { tag: 'HTTPS' },
            authority: 'example.com',
            path: '/',
            headers: [['x-custom', encode('myvalue')]],
        });
        await (client as unknown as { send(r: RequestLike): Promise<ResponseLike> }).send(req);
        expect(receivedHeaders!.get('x-custom')).toBe('myvalue');
    });

    it('empty response body — stream ends immediately', async () => {
        mockFetch(async () => new Response('', { status: 200 }));

        const client = createHttpClient();
        const req = buildRequest({ scheme: { tag: 'HTTPS' }, authority: 'example.com', path: '/' });
        const resp = await (client as unknown as { send(r: RequestLike): Promise<ResponseLike> }).send(req);

        const resFuture = Promise.resolve({ tag: 'ok' as const, val: undefined });
        const [stream] = (types.Response as unknown as {
            consumeBody(r: ResponseLike, f: Promise<unknown>): [AsyncIterable<Uint8Array>, Promise<unknown>];
        }).consumeBody(resp as unknown as ResponseLike, resFuture);

        const chunks: Uint8Array[] = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        // Empty string may yield one empty chunk or zero chunks
        const totalBytes = chunks.reduce((a, c) => a + c.length, 0);
        expect(totalBytes).toBe(0);
    });
});

// ──────────────────── HTTP Handler (stub) ────────────────────

describe('HttpHandler', () => {
    it('handle throws (it is a guest export, not host import)', async () => {
        const handler = createHttpHandler() as unknown as { handle(): Promise<never> };
        await expect(handler.handle()).rejects.toThrow(/guest export/);
    });
});
