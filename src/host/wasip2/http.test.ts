// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * Tests for wasi:http/types + wasi:http/outgoing-handler
 */

import {
    createFields,
    createFieldsFromList,
    createOutgoingRequest,
    createRequestOptions,
    createOutgoingHandler,
    HttpMethod,
    WasiFutureIncomingResponse,
    HttpResult,
    WasiIncomingResponse,
    FetchFn,
} from './http';

// ─── Helpers ───

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Create a mock fetch that returns a canned response */
function mockFetch(
    status: number,
    headers: Record<string, string>,
    body: string | Uint8Array,
): FetchFn {
    return async (_input: string | URL, _init?: RequestInit): Promise<Response> => {
        const bodyBytes = typeof body === 'string' ? enc.encode(body) : body;
        const h = new Headers();
        for (const [k, v] of Object.entries(headers)) {
            h.set(k, v);
        }
        return new Response(bodyBytes, { status, headers: h });
    };
}

/** Create a mock fetch that rejects with a network error */
function mockFetchError(message: string): FetchFn {
    return async () => {
        throw new TypeError(message);
    };
}

/** Create a mock fetch that rejects with an abort error */
function mockFetchAbort(): FetchFn {
    return async () => {
        const err = new DOMException('The operation was aborted', 'AbortError');
        throw err;
    };
}

/** Wait for a future to resolve (polling) */
async function awaitFuture(future: WasiFutureIncomingResponse, maxMs = 5000): Promise<HttpResult<WasiIncomingResponse>> {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
        const result = future.get();
        if (result !== undefined) return result;
        await new Promise(resolve => setTimeout(resolve, 1));
    }
    throw new Error('Future timed out');
}

// ─── Fields ───

describe('wasi:http/types fields', () => {
    test('empty fields', () => {
        const f = createFields();
        expect(f.entries()).toEqual([]);
        expect(f.has('content-type')).toBe(false);
        expect(f.get('content-type')).toEqual([]);
    });

    test('from-list constructor', () => {
        const result = createFieldsFromList([
            ['content-type', enc.encode('text/plain')],
            ['x-custom', enc.encode('foo')],
        ]);
        expect(result.tag).toBe('ok');
        if (result.tag !== 'ok') return;
        const f = result.val;
        expect(f.has('content-type')).toBe(true);
        expect(dec.decode(f.get('content-type')[0])).toBe('text/plain');
    });

    test('from-list with multiple values for same header', () => {
        const result = createFieldsFromList([
            ['x-val', enc.encode('a')],
            ['x-val', enc.encode('b')],
        ]);
        expect(result.tag).toBe('ok');
        if (result.tag !== 'ok') return;
        const f = result.val;
        expect(f.get('x-val')).toHaveLength(2);
    });

    test('from-list rejects invalid header name', () => {
        const result = createFieldsFromList([['invalid header', enc.encode('val')]]);
        expect(result.tag).toBe('err');
        if (result.tag !== 'err') return;
        expect(result.val.tag).toBe('invalid-syntax');
    });

    test('from-list rejects forbidden headers', () => {
        const result = createFieldsFromList([['connection', enc.encode('keep-alive')]]);
        expect(result.tag).toBe('err');
        if (result.tag !== 'err') return;
        expect(result.val.tag).toBe('forbidden');
    });

    test('from-list rejects header values with NUL bytes', () => {
        const result = createFieldsFromList([['x-bad', new Uint8Array([0x00])]]);
        expect(result.tag).toBe('err');
        if (result.tag !== 'err') return;
        expect(result.val.tag).toBe('invalid-syntax');
    });

    test('set header', () => {
        const f = createFields();
        const r = f.set('content-type', [enc.encode('application/json')]);
        expect(r.tag).toBe('ok');
        expect(f.has('content-type')).toBe(true);
        expect(dec.decode(f.get('content-type')[0])).toBe('application/json');
    });

    test('set header replaces existing', () => {
        const f = createFields();
        f.set('x-val', [enc.encode('old')]);
        f.set('x-val', [enc.encode('new')]);
        expect(f.get('x-val')).toHaveLength(1);
        expect(dec.decode(f.get('x-val')[0])).toBe('new');
    });

    test('append header', () => {
        const f = createFields();
        f.append('x-multi', enc.encode('a'));
        f.append('x-multi', enc.encode('b'));
        expect(f.get('x-multi')).toHaveLength(2);
    });

    test('delete header', () => {
        const f = createFields();
        f.set('x-temp', [enc.encode('val')]);
        expect(f.has('x-temp')).toBe(true);
        f.delete('x-temp');
        expect(f.has('x-temp')).toBe(false);
    });

    test('set rejects forbidden header', () => {
        const f = createFields();
        const r = f.set('transfer-encoding', [enc.encode('chunked')]);
        expect(r.tag).toBe('err');
        if (r.tag !== 'err') return;
        expect(r.val.tag).toBe('forbidden');
    });

    test('append rejects invalid header value', () => {
        const f = createFields();
        const r = f.append('x-bad', new Uint8Array([0x0a])); // bare LF
        expect(r.tag).toBe('err');
        if (r.tag !== 'err') return;
        expect(r.val.tag).toBe('invalid-syntax');
    });

    test('entries returns all values', () => {
        const f = createFields();
        f.set('a', [enc.encode('1')]);
        f.append('b', enc.encode('2'));
        f.append('b', enc.encode('3'));
        const entries = f.entries();
        expect(entries).toHaveLength(3);
    });

    test('clone creates independent copy', () => {
        const f = createFields();
        f.set('x-val', [enc.encode('original')]);
        const cloned = f.clone();
        cloned.set('x-val', [enc.encode('modified')]);
        expect(dec.decode(f.get('x-val')[0])).toBe('original');
        expect(dec.decode(cloned.get('x-val')[0])).toBe('modified');
    });

    test('header names are case-insensitive', () => {
        const f = createFields();
        f.set('Content-Type', [enc.encode('text/html')]);
        expect(f.has('content-type')).toBe(true);
        expect(dec.decode(f.get('CONTENT-TYPE')[0])).toBe('text/html');
    });

    test('get returns defensive copies', () => {
        const f = createFields();
        f.set('x-val', [enc.encode('hello')]);
        const retrieved = f.get('x-val')[0]!;
        retrieved[0] = 0xFF; // mutate the returned copy
        expect(dec.decode(f.get('x-val')[0])).toBe('hello'); // original unchanged
    });
});

// ─── Outgoing Request ───

describe('wasi:http/types outgoing-request', () => {
    test('default method is GET', () => {
        const req = createOutgoingRequest(createFields());
        expect(req.method().tag).toBe('get');
    });

    test('set and get method', () => {
        const req = createOutgoingRequest(createFields());
        req.setMethod({ tag: 'post' });
        expect(req.method().tag).toBe('post');
    });

    test('set and get path', () => {
        const req = createOutgoingRequest(createFields());
        req.setPathWithQuery('/api/data?page=1');
        expect(req.pathWithQuery()).toBe('/api/data?page=1');
    });

    test('set and get scheme', () => {
        const req = createOutgoingRequest(createFields());
        req.setScheme({ tag: 'HTTPS' });
        expect(req.scheme()!.tag).toBe('HTTPS');
    });

    test('set and get authority', () => {
        const req = createOutgoingRequest(createFields());
        req.setAuthority('example.com:8080');
        expect(req.authority()).toBe('example.com:8080');
    });

    test('body can only be taken once', () => {
        const req = createOutgoingRequest(createFields());
        const first = req.body();
        expect(first.tag).toBe('ok');
        const second = req.body();
        expect(second.tag).toBe('err');
    });

    test('body write stream can only be taken once', () => {
        const req = createOutgoingRequest(createFields());
        const bodyResult = req.body();
        expect(bodyResult.tag).toBe('ok');
        if (bodyResult.tag !== 'ok') return;
        const body = bodyResult.val;
        const first = body.write();
        expect(first.tag).toBe('ok');
        const second = body.write();
        expect(second.tag).toBe('err');
    });
});

// ─── Request Options ───

describe('wasi:http/types request-options', () => {
    test('defaults are undefined', () => {
        const opts = createRequestOptions();
        expect(opts.connectTimeout()).toBeUndefined();
        expect(opts.firstByteTimeout()).toBeUndefined();
        expect(opts.betweenBytesTimeout()).toBeUndefined();
    });

    test('set and get connect timeout', () => {
        const opts = createRequestOptions();
        opts.setConnectTimeout(5_000_000_000n); // 5 seconds
        expect(opts.connectTimeout()).toBe(5_000_000_000n);
    });

    test('set and get first byte timeout', () => {
        const opts = createRequestOptions();
        opts.setFirstByteTimeout(10_000_000_000n); // 10 seconds
        expect(opts.firstByteTimeout()).toBe(10_000_000_000n);
    });

    test('set and get between bytes timeout', () => {
        const opts = createRequestOptions();
        opts.setBetweenBytesTimeout(1_000_000_000n); // 1 second
        expect(opts.betweenBytesTimeout()).toBe(1_000_000_000n);
    });

    test('clear timeout by setting undefined', () => {
        const opts = createRequestOptions();
        opts.setConnectTimeout(5_000_000_000n);
        opts.setConnectTimeout(undefined);
        expect(opts.connectTimeout()).toBeUndefined();
    });
});

// ─── Outgoing Handler ───

describe('wasi:http/outgoing-handler', () => {
    test('simple GET returns 200', async () => {
        const handler = createOutgoingHandler(mockFetch(200, { 'content-type': 'text/plain' }, 'hello'));
        const req = createOutgoingRequest(createFields());
        req.setScheme({ tag: 'HTTPS' });
        req.setAuthority('example.com');
        req.setPathWithQuery('/');

        const futureResult = handler.handle(req);
        expect(futureResult.tag).toBe('ok');
        if (futureResult.tag !== 'ok') return;
        const future = futureResult.val;

        const result = await awaitFuture(future);
        expect(result.tag).toBe('ok');
        if (result.tag !== 'ok') return;
        const response = result.val;
        expect(response.status()).toBe(200);
    });

    test('response headers accessible', async () => {
        const handler = createOutgoingHandler(mockFetch(200, {
            'content-type': 'application/json',
            'x-custom': 'test-value',
        }, '{}'));
        const req = createOutgoingRequest(createFields());
        req.setScheme({ tag: 'HTTPS' });
        req.setAuthority('example.com');
        req.setPathWithQuery('/api');

        const futureResult = handler.handle(req);
        if (futureResult.tag !== 'ok') return;
        const result = await awaitFuture(futureResult.val);
        if (result.tag !== 'ok') return;
        const response = result.val;

        expect(response.headers().has('content-type')).toBe(true);
        expect(dec.decode(response.headers().get('content-type')[0])).toBe('application/json');
        expect(dec.decode(response.headers().get('x-custom')[0])).toBe('test-value');
    });

    test('response body readable', async () => {
        const handler = createOutgoingHandler(mockFetch(200, {}, 'response body'));
        const req = createOutgoingRequest(createFields());
        req.setScheme({ tag: 'HTTPS' });
        req.setAuthority('example.com');
        req.setPathWithQuery('/data');

        const futureResult = handler.handle(req);
        if (futureResult.tag !== 'ok') return;
        const result = await awaitFuture(futureResult.val);
        if (result.tag !== 'ok') return;
        const response = result.val;

        const bodyResult = response.consume();
        expect(bodyResult.tag).toBe('ok');
        if (bodyResult.tag !== 'ok') return;
        const streamResult = bodyResult.val.stream();
        expect(streamResult.tag).toBe('ok');
        if (streamResult.tag !== 'ok') return;
        const stream = streamResult.val;
        const readResult = stream.read(1000n);
        expect(readResult.tag).toBe('ok');
        if (readResult.tag !== 'ok') return;
        expect(dec.decode(readResult.val)).toBe('response body');
    });

    test('body can only be consumed once', async () => {
        const handler = createOutgoingHandler(mockFetch(200, {}, 'data'));
        const req = createOutgoingRequest(createFields());
        req.setScheme({ tag: 'HTTPS' });
        req.setAuthority('example.com');
        req.setPathWithQuery('/');

        const futureResult = handler.handle(req);
        if (futureResult.tag !== 'ok') return;
        const result = await awaitFuture(futureResult.val);
        if (result.tag !== 'ok') return;

        const first = result.val.consume();
        expect(first.tag).toBe('ok');
        const second = result.val.consume();
        expect(second.tag).toBe('err');
    });

    test('POST with body', async () => {
        let capturedInit: RequestInit | undefined;
        const handler = createOutgoingHandler(async (input, init) => {
            capturedInit = init;
            return new Response('ok', { status: 201 });
        });

        const headers = createFields();
        headers.set('content-type', [enc.encode('application/json')]);
        const req = createOutgoingRequest(headers);
        req.setMethod({ tag: 'post' });
        req.setScheme({ tag: 'HTTPS' });
        req.setAuthority('api.example.com');
        req.setPathWithQuery('/items');

        // Write body
        const bodyResult = req.body();
        expect(bodyResult.tag).toBe('ok');
        if (bodyResult.tag !== 'ok') return;
        const streamResult = bodyResult.val.write();
        expect(streamResult.tag).toBe('ok');
        if (streamResult.tag !== 'ok') return;
        const stream = streamResult.val;
        stream.write(enc.encode('{"name":"test"}'));
        stream.flush();

        const futureResult = handler.handle(req);
        if (futureResult.tag !== 'ok') return;
        const result = await awaitFuture(futureResult.val);
        if (result.tag !== 'ok') return;

        expect(result.val.status()).toBe(201);
        expect(capturedInit?.method).toBe('POST');
        expect(capturedInit?.body).toBeInstanceOf(Uint8Array);
    });

    test('custom method (other)', async () => {
        let capturedInit: RequestInit | undefined;
        const handler = createOutgoingHandler(async (_input, init) => {
            capturedInit = init;
            return new Response('', { status: 200 });
        });

        const req = createOutgoingRequest(createFields());
        req.setMethod({ tag: 'other', val: 'PURGE' });
        req.setScheme({ tag: 'HTTPS' });
        req.setAuthority('cdn.example.com');
        req.setPathWithQuery('/cache/key');

        const futureResult = handler.handle(req);
        if (futureResult.tag !== 'ok') return;
        await awaitFuture(futureResult.val);

        expect(capturedInit?.method).toBe('PURGE');
    });

    test('URL construction', async () => {
        let capturedUrl: string | undefined;
        const handler = createOutgoingHandler(async (input) => {
            capturedUrl = String(input);
            return new Response('', { status: 200 });
        });

        const req = createOutgoingRequest(createFields());
        req.setScheme({ tag: 'HTTP' });
        req.setAuthority('localhost:8080');
        req.setPathWithQuery('/api/v1?key=value');

        const futureResult = handler.handle(req);
        if (futureResult.tag !== 'ok') return;
        await awaitFuture(futureResult.val);

        expect(capturedUrl).toBe('http://localhost:8080/api/v1?key=value');
    });

    test('request headers passed to fetch', async () => {
        let capturedHeaders: Headers | undefined;
        const handler = createOutgoingHandler(async (_input, init) => {
            capturedHeaders = init?.headers as Headers;
            return new Response('', { status: 200 });
        });

        const headers = createFields();
        headers.set('authorization', [enc.encode('Bearer token123')]);
        headers.set('accept', [enc.encode('application/json')]);
        const req = createOutgoingRequest(headers);
        req.setScheme({ tag: 'HTTPS' });
        req.setAuthority('api.example.com');
        req.setPathWithQuery('/secure');

        const futureResult = handler.handle(req);
        if (futureResult.tag !== 'ok') return;
        await awaitFuture(futureResult.val);

        expect(capturedHeaders?.get('authorization')).toBe('Bearer token123');
        expect(capturedHeaders?.get('accept')).toBe('application/json');
    });

    test('different HTTP status codes', async () => {
        for (const status of [200, 201, 204, 301, 400, 404, 500]) {
            const handler = createOutgoingHandler(mockFetch(status, {}, ''));
            const req = createOutgoingRequest(createFields());
            req.setScheme({ tag: 'HTTPS' });
            req.setAuthority('example.com');
            req.setPathWithQuery('/');

            const futureResult = handler.handle(req);
            if (futureResult.tag !== 'ok') continue;
            const result = await awaitFuture(futureResult.val);
            if (result.tag !== 'ok') continue;
            expect(result.val.status()).toBe(status);
        }
    });

    test('binary response body', async () => {
        const binaryData = new Uint8Array([0x00, 0x01, 0xFF, 0xFE, 0x80]);
        const handler = createOutgoingHandler(mockFetch(200, {}, binaryData));
        const req = createOutgoingRequest(createFields());
        req.setScheme({ tag: 'HTTPS' });
        req.setAuthority('example.com');
        req.setPathWithQuery('/binary');

        const futureResult = handler.handle(req);
        if (futureResult.tag !== 'ok') return;
        const result = await awaitFuture(futureResult.val);
        if (result.tag !== 'ok') return;

        const bodyResult = result.val.consume();
        if (bodyResult.tag !== 'ok') return;
        const streamResult = bodyResult.val.stream();
        if (streamResult.tag !== 'ok') return;
        const readResult = streamResult.val.read(100n);
        if (readResult.tag !== 'ok') return;
        expect(readResult.val).toEqual(binaryData);
    });

    test('empty response body', async () => {
        const handler = createOutgoingHandler(mockFetch(204, {}, ''));
        const req = createOutgoingRequest(createFields());
        req.setScheme({ tag: 'HTTPS' });
        req.setAuthority('example.com');
        req.setPathWithQuery('/empty');

        const futureResult = handler.handle(req);
        if (futureResult.tag !== 'ok') return;
        const result = await awaitFuture(futureResult.val);
        if (result.tag !== 'ok') return;

        const bodyResult = result.val.consume();
        if (bodyResult.tag !== 'ok') return;
        const streamResult = bodyResult.val.stream();
        if (streamResult.tag !== 'ok') return;
        const readResult = streamResult.val.read(100n);
        // Empty body → stream immediately closed
        expect(readResult.tag).toBe('err');
    });

    test('future subscribe returns pollable', () => {
        const handler = createOutgoingHandler(mockFetch(200, {}, ''));
        const req = createOutgoingRequest(createFields());
        req.setScheme({ tag: 'HTTPS' });
        req.setAuthority('example.com');
        req.setPathWithQuery('/');

        const futureResult = handler.handle(req);
        if (futureResult.tag !== 'ok') return;
        const future = futureResult.val;
        const pollable = future.subscribe();
        expect(pollable).toBeDefined();
        expect(typeof pollable.ready).toBe('function');
        expect(typeof pollable.block).toBe('function');
    });

    test('future get returns undefined before resolution', () => {
        // Use a fetch that never resolves
        const handler = createOutgoingHandler(async () => {
            return new Promise<Response>(() => { }); // never resolves
        });
        const req = createOutgoingRequest(createFields());
        req.setScheme({ tag: 'HTTPS' });
        req.setAuthority('example.com');
        req.setPathWithQuery('/');

        const futureResult = handler.handle(req);
        if (futureResult.tag !== 'ok') return;
        // Immediately check — should be undefined (not resolved yet)
        expect(futureResult.val.get()).toBeUndefined();
    });
});

// ─── Error Handling ───

describe('wasi:http error handling', () => {
    test('network error maps to destination-unavailable', async () => {
        const handler = createOutgoingHandler(mockFetchError('Failed to fetch'));
        const req = createOutgoingRequest(createFields());
        req.setScheme({ tag: 'HTTPS' });
        req.setAuthority('unreachable.example.com');
        req.setPathWithQuery('/');

        const futureResult = handler.handle(req);
        if (futureResult.tag !== 'ok') return;
        const result = await awaitFuture(futureResult.val);
        expect(result.tag).toBe('err');
        if (result.tag !== 'err') return;
        expect(result.val.tag).toBe('destination-unavailable');
    });

    test('abort error maps to connection-timeout', async () => {
        const handler = createOutgoingHandler(mockFetchAbort());
        const req = createOutgoingRequest(createFields());
        req.setScheme({ tag: 'HTTPS' });
        req.setAuthority('slow.example.com');
        req.setPathWithQuery('/');

        const futureResult = handler.handle(req);
        if (futureResult.tag !== 'ok') return;
        const result = await awaitFuture(futureResult.val);
        expect(result.tag).toBe('err');
        if (result.tag !== 'err') return;
        expect(result.val.tag).toBe('connection-timeout');
    });

    test('timeout error maps to connection-timeout', async () => {
        const handler = createOutgoingHandler(mockFetchError('The operation timed out'));
        const req = createOutgoingRequest(createFields());
        req.setScheme({ tag: 'HTTPS' });
        req.setAuthority('timeout.example.com');
        req.setPathWithQuery('/');

        const futureResult = handler.handle(req);
        if (futureResult.tag !== 'ok') return;
        const result = await awaitFuture(futureResult.val);
        expect(result.tag).toBe('err');
        if (result.tag !== 'err') return;
        expect(result.val.tag).toBe('connection-timeout');
    });

    test('DNS error maps to DNS-error', async () => {
        const handler = createOutgoingHandler(mockFetchError('DNS resolution failed'));
        const req = createOutgoingRequest(createFields());
        req.setScheme({ tag: 'HTTPS' });
        req.setAuthority('bad-dns.example.com');
        req.setPathWithQuery('/');

        const futureResult = handler.handle(req);
        if (futureResult.tag !== 'ok') return;
        const result = await awaitFuture(futureResult.val);
        expect(result.tag).toBe('err');
        if (result.tag !== 'err') return;
        expect(result.val.tag).toBe('DNS-error');
    });

    test('unknown error maps to internal-error', async () => {
        const handler = createOutgoingHandler(async () => {
            throw new Error('something unexpected');
        });
        const req = createOutgoingRequest(createFields());
        req.setScheme({ tag: 'HTTPS' });
        req.setAuthority('example.com');
        req.setPathWithQuery('/');

        const futureResult = handler.handle(req);
        if (futureResult.tag !== 'ok') return;
        const result = await awaitFuture(futureResult.val);
        expect(result.tag).toBe('err');
        if (result.tag !== 'err') return;
        expect(result.val.tag).toBe('internal-error');
    });
});

// ─── Request Options with Handler ───

describe('wasi:http request options with handler', () => {
    test('request options passed (timeout capture)', async () => {
        let capturedInit: RequestInit | undefined;
        const handler = createOutgoingHandler(async (_input, init) => {
            capturedInit = init;
            return new Response('', { status: 200 });
        });

        const req = createOutgoingRequest(createFields());
        req.setScheme({ tag: 'HTTPS' });
        req.setAuthority('example.com');
        req.setPathWithQuery('/');

        const opts = createRequestOptions();
        opts.setConnectTimeout(5_000_000_000n); // 5 seconds in ns

        const futureResult = handler.handle(req, opts);
        if (futureResult.tag !== 'ok') return;
        await awaitFuture(futureResult.val);

        expect(capturedInit?.signal).toBeDefined();
    });

    test('no options means no signal', async () => {
        let capturedInit: RequestInit | undefined;
        const handler = createOutgoingHandler(async (_input, init) => {
            capturedInit = init;
            return new Response('', { status: 200 });
        });

        const req = createOutgoingRequest(createFields());
        req.setScheme({ tag: 'HTTPS' });
        req.setAuthority('example.com');
        req.setPathWithQuery('/');

        const futureResult = handler.handle(req);
        if (futureResult.tag !== 'ok') return;
        await awaitFuture(futureResult.val);

        expect(capturedInit?.signal).toBeUndefined();
    });
});

// ─── Edge Cases ───

describe('wasi:http edge cases', () => {
    test('default URL construction (no scheme/authority/path)', async () => {
        let capturedUrl: string | undefined;
        const handler = createOutgoingHandler(async (input) => {
            capturedUrl = String(input);
            return new Response('', { status: 200 });
        });

        const req = createOutgoingRequest(createFields());
        // No scheme, authority, or path set
        const futureResult = handler.handle(req);
        if (futureResult.tag !== 'ok') return;
        await awaitFuture(futureResult.val);

        expect(capturedUrl).toBe('https://localhost/');
    });

    test('other scheme', async () => {
        let capturedUrl: string | undefined;
        const handler = createOutgoingHandler(async (input) => {
            capturedUrl = String(input);
            return new Response('', { status: 200 });
        });

        const req = createOutgoingRequest(createFields());
        req.setScheme({ tag: 'other', val: 'ws' });
        req.setAuthority('socket.example.com');
        req.setPathWithQuery('/ws');

        const futureResult = handler.handle(req);
        if (futureResult.tag !== 'ok') return;
        await awaitFuture(futureResult.val);

        expect(capturedUrl).toBe('ws://socket.example.com/ws');
    });

    test('all HTTP methods', () => {
        const methods: HttpMethod[] = [
            { tag: 'get' },
            { tag: 'head' },
            { tag: 'post' },
            { tag: 'put' },
            { tag: 'delete' },
            { tag: 'connect' },
            { tag: 'options' },
            { tag: 'trace' },
            { tag: 'patch' },
        ];
        for (const method of methods) {
            const req = createOutgoingRequest(createFields());
            req.setMethod(method);
            expect(req.method().tag).toBe(method.tag);
        }
    });

    test('large response body', async () => {
        const largeBody = new Uint8Array(1024 * 1024); // 1 MB
        for (let i = 0; i < largeBody.length; i++) largeBody[i] = i & 0xFF;
        const handler = createOutgoingHandler(mockFetch(200, {}, largeBody));

        const req = createOutgoingRequest(createFields());
        req.setScheme({ tag: 'HTTPS' });
        req.setAuthority('example.com');
        req.setPathWithQuery('/large');

        const futureResult = handler.handle(req);
        if (futureResult.tag !== 'ok') return;
        const result = await awaitFuture(futureResult.val);
        if (result.tag !== 'ok') return;

        const bodyResult = result.val.consume();
        if (bodyResult.tag !== 'ok') return;
        const streamResult = bodyResult.val.stream();
        if (streamResult.tag !== 'ok') return;
        const readResult = streamResult.val.read(BigInt(2 * 1024 * 1024));
        if (readResult.tag !== 'ok') return;
        expect(readResult.val.length).toBe(1024 * 1024);
        expect(readResult.val[0]).toBe(0);
        expect(readResult.val[255]).toBe(255);
    });

    test('body stream taken once returns error on second take', async () => {
        const handler = createOutgoingHandler(mockFetch(200, {}, 'data'));
        const req = createOutgoingRequest(createFields());
        req.setScheme({ tag: 'HTTPS' });
        req.setAuthority('example.com');
        req.setPathWithQuery('/');

        const futureResult = handler.handle(req);
        if (futureResult.tag !== 'ok') return;
        const result = await awaitFuture(futureResult.val);
        if (result.tag !== 'ok') return;

        const bodyResult = result.val.consume();
        if (bodyResult.tag !== 'ok') return;
        const first = bodyResult.val.stream();
        expect(first.tag).toBe('ok');
        const second = bodyResult.val.stream();
        expect(second.tag).toBe('err');
    });
});
