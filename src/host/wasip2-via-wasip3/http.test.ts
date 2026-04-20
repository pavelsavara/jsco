// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * Tests for wasi:http/* through the P2-via-P3 adapter.
 *
 * The adapter provides its own AdapterFields/AdapterOutgoingRequest/AdapterRequestOptions
 * and a stub outgoing handler. These tests exercise those implementations through the
 * P2 interface shape (wasi:http/types + wasi:http/outgoing-handler).
 */

import { createWasiP2ViaP3Adapter } from './index';
import { createMockP3 } from './test-helpers';

const enc = new TextEncoder();
const dec = new TextDecoder();

type Fields = {
    get: (name: string) => Uint8Array[];
    has: (name: string) => boolean;
    set: (name: string, values: Uint8Array[]) => { tag: string };
    append: (name: string, value: Uint8Array) => { tag: string };
    delete: (name: string) => { tag: string };
    entries: () => [string, Uint8Array][];
    clone: () => Fields;
};

type OutgoingRequest = {
    method: () => { tag: string; val?: string };
    setMethod: (m: { tag: string; val?: string }) => boolean;
    pathWithQuery: () => string | undefined;
    setPathWithQuery: (p: string | undefined) => boolean;
    scheme: () => { tag: string; val?: string } | undefined;
    setScheme: (s: { tag: string; val?: string } | undefined) => boolean;
    authority: () => string | undefined;
    setAuthority: (a: string | undefined) => boolean;
    headers: () => Fields;
    body: () => { tag: string; val?: unknown };
};

type RequestOptions = {
    connectTimeout: () => bigint | undefined;
    setConnectTimeout: (t: bigint | undefined) => boolean;
    firstByteTimeout: () => bigint | undefined;
    setFirstByteTimeout: (t: bigint | undefined) => boolean;
    betweenBytesTimeout: () => bigint | undefined;
    setBetweenBytesTimeout: (t: bigint | undefined) => boolean;
};

function getHttp() {
    const p2 = createWasiP2ViaP3Adapter(createMockP3());
    const types = p2['wasi:http/types']!;
    const handler = p2['wasi:http/outgoing-handler']!;

    const createFields = () => types['[constructor]fields']!() as Fields;
    const createReq = (headers: Fields) => types['[constructor]outgoing-request']!(headers) as OutgoingRequest;
    const createOpts = () => types['[constructor]request-options']!() as RequestOptions;

    return { types, handler, createFields, createReq, createOpts };
}

// ─── Fields ───

describe('wasi:http/types fields (via P3 adapter)', () => {
    test('empty fields', () => {
        const { createFields } = getHttp();
        const f = createFields();
        expect(f.entries()).toEqual([]);
        expect(f.has('content-type')).toBe(false);
        expect(f.get('content-type')).toEqual([]);
    });

    test('set and get header', () => {
        const { createFields } = getHttp();
        const f = createFields();
        f.set('content-type', [enc.encode('text/plain')]);
        expect(f.has('content-type')).toBe(true);
        expect(dec.decode(f.get('content-type')[0])).toBe('text/plain');
    });

    test('set replaces existing', () => {
        const { createFields } = getHttp();
        const f = createFields();
        f.set('x-val', [enc.encode('old')]);
        f.set('x-val', [enc.encode('new')]);
        expect(f.get('x-val')).toHaveLength(1);
        expect(dec.decode(f.get('x-val')[0])).toBe('new');
    });

    test('append header', () => {
        const { createFields } = getHttp();
        const f = createFields();
        f.append('x-multi', enc.encode('a'));
        f.append('x-multi', enc.encode('b'));
        expect(f.get('x-multi')).toHaveLength(2);
    });

    test('delete header', () => {
        const { createFields } = getHttp();
        const f = createFields();
        f.set('x-temp', [enc.encode('val')]);
        expect(f.has('x-temp')).toBe(true);
        f.delete('x-temp');
        expect(f.has('x-temp')).toBe(false);
    });

    test('entries returns all values', () => {
        const { createFields } = getHttp();
        const f = createFields();
        f.set('a', [enc.encode('1')]);
        f.append('b', enc.encode('2'));
        f.append('b', enc.encode('3'));
        const entries = f.entries();
        expect(entries).toHaveLength(3);
    });

    test('clone creates independent copy', () => {
        const { createFields } = getHttp();
        const f = createFields();
        f.set('x-val', [enc.encode('original')]);
        const cloned = f.clone();
        cloned.set('x-val', [enc.encode('modified')]);
        expect(dec.decode(f.get('x-val')[0])).toBe('original');
        expect(dec.decode(cloned.get('x-val')[0])).toBe('modified');
    });

    test('header names are case-insensitive', () => {
        const { createFields } = getHttp();
        const f = createFields();
        f.set('Content-Type', [enc.encode('text/html')]);
        expect(f.has('content-type')).toBe(true);
        expect(dec.decode(f.get('CONTENT-TYPE')[0])).toBe('text/html');
    });

    test('[static]fields.from-list creates fields from entries', () => {
        const { types } = getHttp();
        const fromList = types['[static]fields.from-list']!;
        const f = fromList([
            ['content-type', enc.encode('text/plain')],
            ['x-custom', enc.encode('foo')],
        ]) as Fields;
        expect(f.has('content-type')).toBe(true);
        expect(dec.decode(f.get('content-type')[0])).toBe('text/plain');
    });

    test('method dispatches through adapter [method]fields.get', () => {
        const { types, createFields } = getHttp();
        const f = createFields();
        f.set('x-test', [enc.encode('hello')]);
        const getFn = types['[method]fields.get']!;
        const values = getFn(f, 'x-test') as Uint8Array[];
        expect(values.length).toBe(1);
        expect(dec.decode(values[0])).toBe('hello');
    });

    test('method dispatches through adapter [method]fields.has', () => {
        const { types, createFields } = getHttp();
        const f = createFields();
        f.set('x-test', [enc.encode('val')]);
        const hasFn = types['[method]fields.has']!;
        expect(hasFn(f, 'x-test')).toBe(true);
        expect(hasFn(f, 'x-missing')).toBe(false);
    });

    test('method dispatches through adapter [method]fields.set', () => {
        const { types, createFields } = getHttp();
        const f = createFields();
        const setFn = types['[method]fields.set']!;
        setFn(f, 'content-type', [enc.encode('application/json')]);
        expect(f.has('content-type')).toBe(true);
    });

    test('method dispatches through adapter [method]fields.append', () => {
        const { types, createFields } = getHttp();
        const f = createFields();
        const appendFn = types['[method]fields.append']!;
        appendFn(f, 'x-multi', enc.encode('a'));
        appendFn(f, 'x-multi', enc.encode('b'));
        expect(f.get('x-multi')).toHaveLength(2);
    });

    test('method dispatches through adapter [method]fields.delete', () => {
        const { types, createFields } = getHttp();
        const f = createFields();
        f.set('x-temp', [enc.encode('val')]);
        const deleteFn = types['[method]fields.delete']!;
        deleteFn(f, 'x-temp');
        expect(f.has('x-temp')).toBe(false);
    });

    test('method dispatches through adapter [method]fields.entries', () => {
        const { types, createFields } = getHttp();
        const f = createFields();
        f.set('a', [enc.encode('1')]);
        const entriesFn = types['[method]fields.entries']!;
        const entries = entriesFn(f) as [string, Uint8Array][];
        expect(entries.length).toBe(1);
    });

    test('method dispatches through adapter [method]fields.clone', () => {
        const { types, createFields } = getHttp();
        const f = createFields();
        f.set('x-val', [enc.encode('test')]);
        const cloneFn = types['[method]fields.clone']!;
        const cloned = cloneFn(f) as Fields;
        cloned.set('x-val', [enc.encode('modified')]);
        expect(dec.decode(f.get('x-val')[0])).toBe('test');
    });
});

// ─── Outgoing Request ───

describe('wasi:http/types outgoing-request (via P3 adapter)', () => {
    test('default method is GET', () => {
        const { createFields, createReq } = getHttp();
        const req = createReq(createFields());
        expect(req.method().tag).toBe('get');
    });

    test('set and get method', () => {
        const { createFields, createReq } = getHttp();
        const req = createReq(createFields());
        req.setMethod({ tag: 'post' });
        expect(req.method().tag).toBe('post');
    });

    test('set and get path', () => {
        const { createFields, createReq } = getHttp();
        const req = createReq(createFields());
        req.setPathWithQuery('/api/data?page=1');
        expect(req.pathWithQuery()).toBe('/api/data?page=1');
    });

    test('set and get scheme', () => {
        const { createFields, createReq } = getHttp();
        const req = createReq(createFields());
        req.setScheme({ tag: 'HTTPS' });
        expect(req.scheme()!.tag).toBe('HTTPS');
    });

    test('set and get authority', () => {
        const { createFields, createReq } = getHttp();
        const req = createReq(createFields());
        req.setAuthority('example.com:8080');
        expect(req.authority()).toBe('example.com:8080');
    });

    test('body can only be taken once', () => {
        const { createFields, createReq } = getHttp();
        const req = createReq(createFields());
        const first = req.body();
        expect(first.tag).toBe('ok');
        const second = req.body();
        expect(second.tag).toBe('err');
    });

    test('custom method (other)', () => {
        const { createFields, createReq } = getHttp();
        const req = createReq(createFields());
        req.setMethod({ tag: 'other', val: 'PURGE' });
        const m = req.method();
        expect(m.tag).toBe('other');
        expect(m.val).toBe('PURGE');
    });

    test('headers returns the fields object', () => {
        const { createFields, createReq } = getHttp();
        const fields = createFields();
        fields.set('x-test', [enc.encode('val')]);
        const req = createReq(fields);
        expect(req.headers().has('x-test')).toBe(true);
    });

    test('method dispatches through adapter', () => {
        const { types, createFields, createReq } = getHttp();
        const req = createReq(createFields());
        const methodFn = types['[method]outgoing-request.method']!;
        expect(methodFn(req).tag).toBe('get');
        const setMethodFn = types['[method]outgoing-request.set-method']!;
        setMethodFn(req, { tag: 'put' });
        expect(methodFn(req).tag).toBe('put');
    });

    test('path dispatches through adapter', () => {
        const { types, createFields, createReq } = getHttp();
        const req = createReq(createFields());
        const setFn = types['[method]outgoing-request.set-path-with-query']!;
        const getFn = types['[method]outgoing-request.path-with-query']!;
        setFn(req, '/test?q=1');
        expect(getFn(req)).toBe('/test?q=1');
    });

    test('scheme dispatches through adapter', () => {
        const { types, createFields, createReq } = getHttp();
        const req = createReq(createFields());
        const setFn = types['[method]outgoing-request.set-scheme']!;
        const getFn = types['[method]outgoing-request.scheme']!;
        setFn(req, { tag: 'HTTP' });
        expect(getFn(req).tag).toBe('HTTP');
    });

    test('authority dispatches through adapter', () => {
        const { types, createFields, createReq } = getHttp();
        const req = createReq(createFields());
        const setFn = types['[method]outgoing-request.set-authority']!;
        const getFn = types['[method]outgoing-request.authority']!;
        setFn(req, 'localhost:8080');
        expect(getFn(req)).toBe('localhost:8080');
    });
});

// ─── Request Options ───

describe('wasi:http/types request-options (via P3 adapter)', () => {
    test('defaults are undefined', () => {
        const { createOpts } = getHttp();
        const opts = createOpts();
        expect(opts.connectTimeout()).toBeUndefined();
        expect(opts.firstByteTimeout()).toBeUndefined();
        expect(opts.betweenBytesTimeout()).toBeUndefined();
    });

    test('set and get connect timeout', () => {
        const { createOpts } = getHttp();
        const opts = createOpts();
        opts.setConnectTimeout(5_000_000_000n);
        expect(opts.connectTimeout()).toBe(5_000_000_000n);
    });

    test('set and get first byte timeout', () => {
        const { createOpts } = getHttp();
        const opts = createOpts();
        opts.setFirstByteTimeout(10_000_000_000n);
        expect(opts.firstByteTimeout()).toBe(10_000_000_000n);
    });

    test('set and get between bytes timeout', () => {
        const { createOpts } = getHttp();
        const opts = createOpts();
        opts.setBetweenBytesTimeout(1_000_000_000n);
        expect(opts.betweenBytesTimeout()).toBe(1_000_000_000n);
    });

    test('clear timeout by setting undefined', () => {
        const { createOpts } = getHttp();
        const opts = createOpts();
        opts.setConnectTimeout(5_000_000_000n);
        opts.setConnectTimeout(undefined);
        expect(opts.connectTimeout()).toBeUndefined();
    });

    test('request-options dispatches through adapter', () => {
        const { types, createOpts } = getHttp();
        const opts = createOpts();
        const setFn = types['[method]request-options.set-connect-timeout']!;
        const getFn = types['[method]request-options.connect-timeout']!;
        setFn(opts, 3_000_000_000n);
        expect(getFn(opts)).toBe(3_000_000_000n);
    });
});

// ─── Outgoing Handler (stub) ───

describe('wasi:http/outgoing-handler (via P3 adapter)', () => {
    test('handle returns err (stub not fully implemented)', () => {
        const { handler, createFields, createReq } = getHttp();
        const req = createReq(createFields());
        const result = handler['handle']!(req) as { tag: string; val: unknown };
        expect(result.tag).toBe('err');
    });
});
