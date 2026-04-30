// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

/**
 * HTTP P3 WAT integration suite — server-side.
 *
 * Drives hand-written WASIp3 component-model WATs (consumer/forwarder/
 * implementer for HTTP) through the same A–K topology as the existing
 * non-HTTP P3 native suite, exercising real streaming request/response bodies.
 *
 * Phase 1.2 (this commit): adds Scenario C — server-fwd → server-impl wired at
 * the JS host boundary. The forwarder appends "-fwd-" to both directions, the
 * implementer appends "-handled-", giving the body-mutation contract:
 *     response_body == request_body + "-fwd-" + "-handled-" + "-fwd-"
 *
 * Subsequent phases will add WAC compositions and Scenarios B, D–K.
 */

import { createComponent } from '../../../src/resolver';
import { _HttpFields, _HttpRequest, _HttpResponse } from '../../../src/host/wasip3/http';
import { createWasiP3Host } from '../../../src/host/wasip3/index';
import { initializeAsserts } from '../../../src/utils/assert';
import {
    useVerboseOnFailure,
    verboseOptions,
    runWithVerbose,
} from '../../test-utils/verbose-logger';

initializeAsserts();

const SERVER_IMPL_WASM = './integration-tests/http-p3-wat/server-impl-p3.wasm';
const SERVER_FWD_WASM = './integration-tests/http-p3-wat/server-fwd-p3.wasm';
const FWD_IMPL_COMPOSED_WASM = './integration-tests/compositions/forwarder-implementer-http-p3-server.wasm';
const DOUBLE_FWD_IMPL_WASM = './integration-tests/compositions/double-forwarder-implementer-http-p3.wasm';
const NESTED_FWD_IMPL_WASM = './integration-tests/compositions/nested-forwarder-implementer-http-p3.wasm';
const WRAPPED_FWD_WASM = './integration-tests/compositions/wrapped-forwarder-http-p3.wasm';
const DOUBLE_FWD_WASM = './integration-tests/compositions/double-forwarder-http-p3.wasm';
const NESTED_DOUBLE_FWD_WASM = './integration-tests/compositions/nested-double-forwarder-http-p3.wasm';
const CLIENT_CONSUMER_WASM = './integration-tests/http-p3-wat/client-consumer-p3.wasm';
const HANDLER_INTERFACE = 'wasi:http/handler@0.3.0-rc-2026-03-15';
const SINK_INTERFACE = 'jsco:test/sink@0.1.0';
const RUNNER_INTERFACE = 'jsco:test/runner@0.1.0';

interface ResponseLike {
    getStatusCode(): number;
}

interface HandlerExport {
    handle(req: unknown): Promise<{ tag: 'ok'; val: ResponseLike } | { tag: 'err'; val: unknown }>;
}

/**
 * Synthesize an HttpRequest whose body is an AsyncIterable yielding the given
 * chunks. The implementer's stream.read pump will consume these chunks.
 */
function makeSyntheticRequest(chunks: Uint8Array[] = []): unknown {
    const reqHeaders = _HttpFields.fromList([]);
    const trailers = Promise.resolve({ tag: 'ok' as const, val: undefined });
    const body: AsyncIterable<Uint8Array> | undefined = chunks.length === 0
        ? undefined
        : {
            async *[Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array> {
                for (const c of chunks) yield c;
            },
        };
    const [request] = _HttpRequest.new(
        reqHeaders as never,
        body as never,
        trailers as never,
        undefined,
    );
    return request;
}

/** Drain an AsyncIterable<Uint8Array> into a single concatenated Uint8Array. */
async function drain(stream: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
    const parts: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of stream) {
        parts.push(chunk);
        total += chunk.length;
    }
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) { out.set(p, off); off += p.length; }
    return out;
}

/**
 * JS-side `wasi:http/handler` implementer (Scenarios B, E, F, G, H).
 * Mirrors what `server-impl-p3.wat` does: drain the request body, append
 * "-handled-", return as the response body.
 */
function makeJsImpl(): { handle: (req: unknown) => Promise<{ tag: 'ok'; val: unknown } | { tag: 'err'; val: unknown }> } {
    return {
        async handle(req: unknown) {
            const completion = Promise.resolve({ tag: 'ok' as const, val: undefined });
            const [bodyStream] = _HttpRequest.consumeBody(req as never, completion as never);
            const enc = new TextEncoder();
            const respBody: AsyncIterable<Uint8Array> = {
                async *[Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array> {
                    for await (const chunk of bodyStream as AsyncIterable<Uint8Array>) {
                        yield chunk;
                    }
                    yield enc.encode('-handled-');
                },
            };
            const respHeaders = _HttpFields.fromList([]);
            const respTrailers = Promise.resolve({ tag: 'ok' as const, val: undefined });
            const [response] = _HttpResponse.new(respHeaders as never, respBody, respTrailers as never);
            return { tag: 'ok' as const, val: response };
        },
    };
}

/** Drain a response body via the JS host's consumeBody helper into a string. */
async function drainResponseBody(response: ResponseLike): Promise<string> {
    const completion = Promise.resolve({ tag: 'ok' as const, val: undefined });
    const [bodyStream] = _HttpResponse.consumeBody(response as never, completion as never);
    const bodyBytes = await drain(bodyStream as AsyncIterable<Uint8Array>);
    return new TextDecoder().decode(bodyBytes);
}

describe('HTTP P3 WAT — server-suite (Phase 1.1)', () => {
    const verbose = useVerboseOnFailure();

    async function runScenarioA(requestBody: string): Promise<string> {
        const wasiImports = createWasiP3Host();
        const component = await createComponent(SERVER_IMPL_WASM, verboseOptions(verbose));
        const instance = await component.instantiate(wasiImports);
        try {
            const handler = instance.exports[HANDLER_INTERFACE] as HandlerExport | undefined;
            expect(handler).toBeDefined();
            expect(typeof handler!.handle).toBe('function');

            const enc = new TextEncoder();
            const chunks = requestBody.length === 0 ? [] : [enc.encode(requestBody)];
            const request = makeSyntheticRequest(chunks);
            const result = await handler!.handle(request);
            expect(result.tag).toBe('ok');

            const response = result.val as ResponseLike;
            expect(response.getStatusCode()).toBe(200);

            const { _HttpResponse } = await import('../../../src/host/wasip3/http');
            const completion = Promise.resolve({ tag: 'ok' as const, val: undefined });
            const [bodyStream] = _HttpResponse.consumeBody(
                response as never,
                completion as never,
            );
            const bodyBytes = await drain(bodyStream as AsyncIterable<Uint8Array>);
            return new TextDecoder().decode(bodyBytes);
        } finally {
            instance.dispose();
        }
    }

    test('Scenario A: empty request body → response body == "-handled-"', () =>
        runWithVerbose(verbose, async () => {
            const body = await runScenarioA('');
            expect(body).toBe('-handled-');
        }));

    test('Scenario A: TWO-chunk request body ["hello","-fwd-"] → impl produces 19 bytes', () =>
        runWithVerbose(verbose, async () => {
            const wasiImports = createWasiP3Host();
            const component = await createComponent(SERVER_IMPL_WASM, verboseOptions(verbose));
            const instance = await component.instantiate(wasiImports);
            try {
                const handler = instance.exports[HANDLER_INTERFACE] as HandlerExport | undefined;
                const enc = new TextEncoder();
                const request = makeSyntheticRequest([enc.encode('hello'), enc.encode('-fwd-')]);
                const result = await handler!.handle(request);
                const response = (result as { tag: 'ok'; val: ResponseLike }).val;
                const { _HttpResponse } = await import('../../../src/host/wasip3/http');
                const completion = Promise.resolve({ tag: 'ok' as const, val: undefined });
                const [bodyStream] = _HttpResponse.consumeBody(response as never, completion as never);
                const bodyBytes = await drain(bodyStream as AsyncIterable<Uint8Array>);
                const body = new TextDecoder().decode(bodyBytes);
                expect(body).toBe('hello-fwd--handled-');
            } finally {
                instance.dispose();
            }
        }));

    test('Scenario A: request body "test-input" → response body == "test-input-handled-"', () =>
        runWithVerbose(verbose, async () => {
            const body = await runScenarioA('test-input');
            expect(body).toBe('test-input-handled-');
        }));
});

describe('HTTP P3 WAT — server-suite (Phase 1.2)', () => {
    const verbose = useVerboseOnFailure({ executor: 2 as any, resolver: 1 as any });

    async function runScenarioC(requestBody: string): Promise<string> {
        const wasiImports = createWasiP3Host();

        // Instantiate the upstream implementer first.
        const implComp = await createComponent(SERVER_IMPL_WASM, verboseOptions(verbose));
        const implInstance = await implComp.instantiate(wasiImports);
        const upstreamHandler = implInstance.exports[HANDLER_INTERFACE] as HandlerExport | undefined;
        expect(upstreamHandler).toBeDefined();

        // Wire the forwarder's wasi:http/handler import to the implementer's export.
        const fwdImports = {
            ...wasiImports,
            [HANDLER_INTERFACE]: upstreamHandler as unknown as Record<string, Function>,
        };
        const fwdComp = await createComponent(SERVER_FWD_WASM, verboseOptions(verbose));
        const fwdInstance = await fwdComp.instantiate(fwdImports);

        try {
            const handler = fwdInstance.exports[HANDLER_INTERFACE] as HandlerExport | undefined;
            expect(handler).toBeDefined();

            const enc = new TextEncoder();
            const chunks = requestBody.length === 0 ? [] : [enc.encode(requestBody)];
            const request = makeSyntheticRequest(chunks);
            const result = await handler!.handle(request);
            expect(result.tag).toBe('ok');

            const response = result.val as ResponseLike;
            expect(response.getStatusCode()).toBe(200);

            const { _HttpResponse } = await import('../../../src/host/wasip3/http');
            const completion = Promise.resolve({ tag: 'ok' as const, val: undefined });
            const [bodyStream] = _HttpResponse.consumeBody(
                response as never,
                completion as never,
            );
            const bodyBytes = await drain(bodyStream as AsyncIterable<Uint8Array>);
            return new TextDecoder().decode(bodyBytes);
        } finally {
            fwdInstance.dispose();
            implInstance.dispose();
        }
    }

    test('Scenario C: empty body → "-fwd--handled--fwd-"', () =>
        runWithVerbose(verbose, async () => {
            const body = await runScenarioC('');
            expect(body).toBe('-fwd--handled--fwd-');
        }));

    test('Scenario C: body "hello" → "hello-fwd--handled--fwd-"', () =>
        runWithVerbose(verbose, async () => {
            const body = await runScenarioC('hello');
            expect(body).toBe('hello-fwd--handled--fwd-');
        }));
});

describe('HTTP P3 WAT — server-suite (Phase 1.3)', () => {
    const verbose = useVerboseOnFailure();

    // Scenario I: test → (fwd ← impl) WAC-composed component.
    // The composition pre-wires fwd's wasi:http/handler import to impl's
    // export; the resulting component re-exports fwd's handler downstream.
    // Body-mutation contract is the same as Scenario C.
    async function runScenarioI(requestBody: string): Promise<string> {
        const wasiImports = createWasiP3Host();
        const component = await createComponent(FWD_IMPL_COMPOSED_WASM, verboseOptions(verbose));
        const instance = await component.instantiate(wasiImports);
        try {
            const handler = instance.exports[HANDLER_INTERFACE] as HandlerExport | undefined;
            expect(handler).toBeDefined();
            expect(typeof handler!.handle).toBe('function');

            const enc = new TextEncoder();
            const chunks = requestBody.length === 0 ? [] : [enc.encode(requestBody)];
            const request = makeSyntheticRequest(chunks);
            const result = await handler!.handle(request);
            expect(result.tag).toBe('ok');

            const response = result.val as ResponseLike;
            expect(response.getStatusCode()).toBe(200);

            const { _HttpResponse } = await import('../../../src/host/wasip3/http');
            const completion = Promise.resolve({ tag: 'ok' as const, val: undefined });
            const [bodyStream] = _HttpResponse.consumeBody(
                response as never,
                completion as never,
            );
            const bodyBytes = await drain(bodyStream as AsyncIterable<Uint8Array>);
            return new TextDecoder().decode(bodyBytes);
        } finally {
            instance.dispose();
        }
    }

    test('Scenario I: empty body → "-fwd--handled--fwd-"', () =>
        runWithVerbose(verbose, async () => {
            const body = await runScenarioI('');
            expect(body).toBe('-fwd--handled--fwd-');
        }));

    test('Scenario I: body "hello" → "hello-fwd--handled--fwd-"', () =>
        runWithVerbose(verbose, async () => {
            const body = await runScenarioI('hello');
            expect(body).toBe('hello-fwd--handled--fwd-');
        }));
});

// =====================================================================
// Phase 2 — server-suite scenario matrix
//
// Body-mutation contract:  resp == req + "-fwd-"*N + "-handled-" + "-fwd-"*N
// where N = number of forwarders in the chain.
// =====================================================================

/**
 * Wire a server-fwd-p3 instance to an upstream handler import. Returns the
 * downstream-facing handler. The fwd is owned by the caller (must dispose).
 */
async function instantiateFwdWithUpstream(
    upstream: { handle: (req: unknown) => Promise<unknown> },
    verbose: ReturnType<typeof useVerboseOnFailure>,
): Promise<{ instance: Awaited<ReturnType<Awaited<ReturnType<typeof createComponent>>['instantiate']>>; handler: HandlerExport }> {
    const wasiImports = createWasiP3Host();
    const fwdImports = {
        ...wasiImports,
        [HANDLER_INTERFACE]: upstream as unknown as Record<string, Function>,
    };
    const fwdComp = await createComponent(SERVER_FWD_WASM, verboseOptions(verbose));
    const instance = await fwdComp.instantiate(fwdImports);
    const handler = instance.exports[HANDLER_INTERFACE] as HandlerExport;
    return { instance, handler };
}

describe('HTTP P3 WAT — server-suite (Phase 2 — Scenario B: fwd → JS impl)', () => {
    const verbose = useVerboseOnFailure();

    async function runB(requestBody: string): Promise<string> {
        const upstream = makeJsImpl();
        const { instance, handler } = await instantiateFwdWithUpstream(upstream, verbose);
        try {
            const enc = new TextEncoder();
            const chunks = requestBody.length === 0 ? [] : [enc.encode(requestBody)];
            const result = await handler.handle(makeSyntheticRequest(chunks));
            expect(result.tag).toBe('ok');
            return drainResponseBody((result as { tag: 'ok'; val: ResponseLike }).val);
        } finally {
            instance.dispose();
        }
    }

    test('empty body → "-fwd--handled--fwd-"', () =>
        runWithVerbose(verbose, async () => {
            expect(await runB('')).toBe('-fwd--handled--fwd-');
        }));

    test('body "hello" → "hello-fwd--handled--fwd-"', () =>
        runWithVerbose(verbose, async () => {
            expect(await runB('hello')).toBe('hello-fwd--handled--fwd-');
        }));
});

describe('HTTP P3 WAT — server-suite (Phase 2 — Scenario D: fwd → fwd → server-impl)', () => {
    const verbose = useVerboseOnFailure();

    async function runD(requestBody: string): Promise<string> {
        const wasiImports = createWasiP3Host();
        const implComp = await createComponent(SERVER_IMPL_WASM, verboseOptions(verbose));
        const implInstance = await implComp.instantiate(wasiImports);
        const innerUpstream = implInstance.exports[HANDLER_INTERFACE] as HandlerExport;

        const inner = await instantiateFwdWithUpstream(innerUpstream, verbose);
        const outer = await instantiateFwdWithUpstream(inner.handler, verbose);

        try {
            const enc = new TextEncoder();
            const chunks = requestBody.length === 0 ? [] : [enc.encode(requestBody)];
            const result = await outer.handler.handle(makeSyntheticRequest(chunks));
            expect(result.tag).toBe('ok');
            return drainResponseBody((result as { tag: 'ok'; val: ResponseLike }).val);
        } finally {
            outer.instance.dispose();
            inner.instance.dispose();
            implInstance.dispose();
        }
    }

    test('empty body → "-fwd--fwd--handled--fwd--fwd-"', () =>
        runWithVerbose(verbose, async () => {
            expect(await runD('')).toBe('-fwd--fwd--handled--fwd--fwd-');
        }));

    test('body "hi" → "hi-fwd--fwd--handled--fwd--fwd-"', () =>
        runWithVerbose(verbose, async () => {
            expect(await runD('hi')).toBe('hi-fwd--fwd--handled--fwd--fwd-');
        }));
});

describe('HTTP P3 WAT — server-suite (Phase 2 — Scenario E: fwd → fwd → JS impl)', () => {
    const verbose = useVerboseOnFailure();

    async function runE(requestBody: string): Promise<string> {
        const upstream = makeJsImpl();
        const inner = await instantiateFwdWithUpstream(upstream, verbose);
        const outer = await instantiateFwdWithUpstream(inner.handler, verbose);
        try {
            const enc = new TextEncoder();
            const chunks = requestBody.length === 0 ? [] : [enc.encode(requestBody)];
            const result = await outer.handler.handle(makeSyntheticRequest(chunks));
            expect(result.tag).toBe('ok');
            return drainResponseBody((result as { tag: 'ok'; val: ResponseLike }).val);
        } finally {
            outer.instance.dispose();
            inner.instance.dispose();
        }
    }

    test('empty body → "-fwd--fwd--handled--fwd--fwd-"', () =>
        runWithVerbose(verbose, async () => {
            expect(await runE('')).toBe('-fwd--fwd--handled--fwd--fwd-');
        }));

    test('body "hi" → "hi-fwd--fwd--handled--fwd--fwd-"', () =>
        runWithVerbose(verbose, async () => {
            expect(await runE('hi')).toBe('hi-fwd--fwd--handled--fwd--fwd-');
        }));
});

// ---------- Closed compositions (J, K) — handler is fully composed ----------

/** Helper: instantiate a closed composition that exports `handler`, send a
 * request, drain response body. */
async function runClosedComposition(
    wasm: string,
    requestBody: string,
    verbose: ReturnType<typeof useVerboseOnFailure>,
): Promise<string> {
    const wasiImports = createWasiP3Host();
    const component = await createComponent(wasm, verboseOptions(verbose));
    const instance = await component.instantiate(wasiImports);
    try {
        const handler = instance.exports[HANDLER_INTERFACE] as HandlerExport;
        const enc = new TextEncoder();
        const chunks = requestBody.length === 0 ? [] : [enc.encode(requestBody)];
        const result = await handler.handle(makeSyntheticRequest(chunks));
        expect(result.tag).toBe('ok');
        return drainResponseBody((result as { tag: 'ok'; val: ResponseLike }).val);
    } finally {
        instance.dispose();
    }
}

describe('HTTP P3 WAT — server-suite (Phase 2 — Scenario J: WAC fwd → fwd → impl)', () => {
    const verbose = useVerboseOnFailure();

    test('empty body → "-fwd--fwd--handled--fwd--fwd-"', () =>
        runWithVerbose(verbose, async () => {
            expect(await runClosedComposition(DOUBLE_FWD_IMPL_WASM, '', verbose))
                .toBe('-fwd--fwd--handled--fwd--fwd-');
        }));

    test('body "hi" → "hi-fwd--fwd--handled--fwd--fwd-"', () =>
        runWithVerbose(verbose, async () => {
            expect(await runClosedComposition(DOUBLE_FWD_IMPL_WASM, 'hi', verbose))
                .toBe('hi-fwd--fwd--handled--fwd--fwd-');
        }));
});

describe('HTTP P3 WAT — server-suite (Phase 2 — Scenario K: WAC fwd → fwd → fwd → impl)', () => {
    const verbose = useVerboseOnFailure();

    test('empty body → "-fwd-"x3 + "-handled-" + "-fwd-"x3', () =>
        runWithVerbose(verbose, async () => {
            expect(await runClosedComposition(NESTED_FWD_IMPL_WASM, '', verbose))
                .toBe('-fwd--fwd--fwd--handled--fwd--fwd--fwd-');
        }));

    test('body "hi" → "hi" + "-fwd-"x3 + "-handled-" + "-fwd-"x3', () =>
        runWithVerbose(verbose, async () => {
            expect(await runClosedComposition(NESTED_FWD_IMPL_WASM, 'hi', verbose))
                .toBe('hi-fwd--fwd--fwd--handled--fwd--fwd--fwd-');
        }));
});

// ---------- Open-upstream compositions (F, G, H) — host wires JS impl ---

/**
 * Helper: instantiate a composition with `wasi:http/handler` left as a
 * top-level import, wire it to a JS implementer, send a request, drain
 * response body.
 */
async function runOpenComposition(
    wasm: string,
    requestBody: string,
    verbose: ReturnType<typeof useVerboseOnFailure>,
): Promise<string> {
    const wasiImports = createWasiP3Host();
    const upstream = makeJsImpl();
    const imports = {
        ...wasiImports,
        [HANDLER_INTERFACE]: upstream as unknown as Record<string, Function>,
    };
    const component = await createComponent(wasm, verboseOptions(verbose));
    const instance = await component.instantiate(imports);
    try {
        const handler = instance.exports[HANDLER_INTERFACE] as HandlerExport;
        const enc = new TextEncoder();
        const chunks = requestBody.length === 0 ? [] : [enc.encode(requestBody)];
        const result = await handler.handle(makeSyntheticRequest(chunks));
        expect(result.tag).toBe('ok');
        return drainResponseBody((result as { tag: 'ok'; val: ResponseLike }).val);
    } finally {
        instance.dispose();
    }
}

describe('HTTP P3 WAT — server-suite (Phase 2 — Scenario F: WAC wrapped-fwd → JS impl)', () => {
    const verbose = useVerboseOnFailure();

    test('empty body → "-fwd--handled--fwd-"', () =>
        runWithVerbose(verbose, async () => {
            expect(await runOpenComposition(WRAPPED_FWD_WASM, '', verbose))
                .toBe('-fwd--handled--fwd-');
        }));

    test('body "hello" → "hello-fwd--handled--fwd-"', () =>
        runWithVerbose(verbose, async () => {
            expect(await runOpenComposition(WRAPPED_FWD_WASM, 'hello', verbose))
                .toBe('hello-fwd--handled--fwd-');
        }));
});

describe('HTTP P3 WAT — server-suite (Phase 2 — Scenario G: WAC double-fwd → JS impl)', () => {
    const verbose = useVerboseOnFailure();

    test('empty body → "-fwd--fwd--handled--fwd--fwd-"', () =>
        runWithVerbose(verbose, async () => {
            expect(await runOpenComposition(DOUBLE_FWD_WASM, '', verbose))
                .toBe('-fwd--fwd--handled--fwd--fwd-');
        }));

    test('body "hi" → "hi-fwd--fwd--handled--fwd--fwd-"', () =>
        runWithVerbose(verbose, async () => {
            expect(await runOpenComposition(DOUBLE_FWD_WASM, 'hi', verbose))
                .toBe('hi-fwd--fwd--handled--fwd--fwd-');
        }));
});

describe('HTTP P3 WAT — server-suite (Phase 2 — Scenario H: WAC nested-double-fwd → JS impl)', () => {
    const verbose = useVerboseOnFailure();

    test('empty body → "-fwd-"x3 + "-handled-" + "-fwd-"x3', () =>
        runWithVerbose(verbose, async () => {
            expect(await runOpenComposition(NESTED_DOUBLE_FWD_WASM, '', verbose))
                .toBe('-fwd--fwd--fwd--handled--fwd--fwd--fwd-');
        }));

    test('body "hi" → "hi" + "-fwd-"x3 + "-handled-" + "-fwd-"x3', () =>
        runWithVerbose(verbose, async () => {
            expect(await runOpenComposition(NESTED_DOUBLE_FWD_WASM, 'hi', verbose))
                .toBe('hi-fwd--fwd--fwd--handled--fwd--fwd--fwd-');
        }));
});

// =====================================================================
// Phase 2 — error variants
//
// These assert end-to-end propagation of errors at the JS↔guest boundary.
// One variant remains deferred:
//   - "Body stream cancels mid-pump" — requires `stream.cancel-read` issuance
//     from a guest, not currently exercised by either WAT.
// =====================================================================

describe('HTTP P3 WAT — server-suite (Phase 2 — error variants)', () => {
    const verbose = useVerboseOnFailure();

    test('JS impl returns Err(internal-error) — direct caller observes Err', () =>
        runWithVerbose(verbose, async () => {
            const errImpl = {
                async handle(_req: unknown) {
                    return { tag: 'err' as const, val: { tag: 'internal-error' as const, val: 'oops' } };
                },
            };
            const result = await errImpl.handle(makeSyntheticRequest([]));
            expect(result.tag).toBe('err');
            expect((result as { tag: 'err'; val: { tag: string } }).val.tag).toBe('internal-error');
        }));

    test('JS impl trailers future resolves to Err — caller observes trailers Err', () =>
        runWithVerbose(verbose, async () => {
            const errTrailersImpl: { handle: (req: unknown) => Promise<{ tag: 'ok'; val: unknown } | { tag: 'err'; val: unknown }> } = {
                async handle(req: unknown) {
                    const completion = Promise.resolve({ tag: 'ok' as const, val: undefined });
                    const [bodyStream] = _HttpRequest.consumeBody(req as never, completion as never);
                    const respBody: AsyncIterable<Uint8Array> = {
                        async *[Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array> {
                            for await (const chunk of bodyStream as AsyncIterable<Uint8Array>) yield chunk;
                        },
                    };
                    const respHeaders = _HttpFields.fromList([]);
                    const respTrailers = Promise.resolve({ tag: 'err' as const, val: { tag: 'internal-error' as const, val: 'trailers-failed' } });
                    const [response] = _HttpResponse.new(respHeaders as never, respBody, respTrailers as never);
                    return { tag: 'ok' as const, val: response };
                },
            };

            const result = await errTrailersImpl.handle(makeSyntheticRequest([]));
            expect(result.tag).toBe('ok');
            const completion = Promise.resolve({ tag: 'ok' as const, val: undefined });
            const [body, trailers] = _HttpResponse.consumeBody(
                (result as { tag: 'ok'; val: ResponseLike }).val as never,
                completion as never,
            );
            await drain(body as AsyncIterable<Uint8Array>);
            const trailersResult = await trailers as { tag: 'ok' | 'err'; val: unknown };
            expect(trailersResult.tag).toBe('err');
            expect((trailersResult.val as { tag: string }).tag).toBe('internal-error');
        }));

    test('WAT fwd propagates Err from JS upstream impl — caller observes Err(internal-error)', () =>
        runWithVerbose(verbose, async () => {
            // The JS upstream consumes the request body (so the fwd's req-side
            // pump can complete cleanly) and then returns Err. The fwd hits
            // phase-4's err branch and re-returns Err downstream.
            const errImpl: { handle: (req: unknown) => Promise<{ tag: 'ok'; val: unknown } | { tag: 'err'; val: unknown }> } = {
                async handle(req: unknown) {
                    const completion = Promise.resolve({ tag: 'ok' as const, val: undefined });
                    const [bodyStream] = _HttpRequest.consumeBody(req as never, completion as never);
                    // Drain the body so the fwd's req pump is unblocked.
                    for await (const _chunk of bodyStream as AsyncIterable<Uint8Array>) { /* discard */ }
                    return { tag: 'err' as const, val: { tag: 'internal-error' as const, val: 'upstream-failed' } };
                },
            };
            const { instance, handler } = await instantiateFwdWithUpstream(errImpl, verbose);
            try {
                const result = await handler.handle(makeSyntheticRequest([new TextEncoder().encode('hi')]));
                expect(result.tag).toBe('err');
                expect((result as { tag: 'err'; val: { tag: string } }).val.tag).toBe('internal-error');
            } finally {
                instance.dispose();
            }
        }));
});





// =====================================================================
// Phase 3 — client/consumer suite
//
// Body-mutation contract (consumer-side, mirror of server-side):
//   collected_body == request_body + "-fwd-"*N + "-handled-" + "-fwd-"*N
//
// Request body shape (generated by client-consumer-p3.wat):
//   "hello" + (32 × 0x42) + "world" + (2 MiB × 0x00)
//   Total = 2097194 bytes.
// =====================================================================

interface RunnerExport {
    run(): Promise<{ tag: 'ok'; val: undefined } | { tag: 'err'; val: unknown }>;
}

const REQ_HELLO = new TextEncoder().encode('hello');
const REQ_PATTERN = new Uint8Array(32).fill(0x42);
const REQ_WORLD = new TextEncoder().encode('world');
const REQ_ZEROS_LEN = 2 * 1024 * 1024;

function expectedRequestBody(): Uint8Array {
    const total = REQ_HELLO.length + REQ_PATTERN.length + REQ_WORLD.length + REQ_ZEROS_LEN;
    const out = new Uint8Array(total);
    let off = 0;
    out.set(REQ_HELLO, off); off += REQ_HELLO.length;
    out.set(REQ_PATTERN, off); off += REQ_PATTERN.length;
    out.set(REQ_WORLD, off); off += REQ_WORLD.length;
    // remainder is zero by default
    return out;
}

/**
 * Runs the consumer wired to a chosen upstream handler. Collects all bytes
 * forwarded to `jsco:test/sink.chunk` and returns them concatenated.
 */
async function runConsumer(
    upstream: { handle: (req: unknown) => Promise<unknown> },
    verbose: ReturnType<typeof useVerboseOnFailure>,
): Promise<Uint8Array> {
    const wasiImports = createWasiP3Host();
    const collected: Uint8Array[] = [];
    const sink = {
        chunk(data: Uint8Array): void {
            // Copy — jsco may reuse the buffer.
            collected.push(new Uint8Array(data));
        },
    };
    const imports: Record<string, unknown> = {
        ...wasiImports,
        [HANDLER_INTERFACE]: upstream as unknown as Record<string, Function>,
        [SINK_INTERFACE]: sink as unknown as Record<string, Function>,
    };
    const component = await createComponent(CLIENT_CONSUMER_WASM, verboseOptions(verbose));
    const instance = await component.instantiate(imports);
    try {
        const runner = instance.exports[RUNNER_INTERFACE] as RunnerExport | undefined;
        expect(runner).toBeDefined();
        const result = await runner!.run();
        expect(result.tag).toBe('ok');

        const total = collected.reduce((n, c) => n + c.length, 0);
        const out = new Uint8Array(total);
        let off = 0;
        for (const c of collected) { out.set(c, off); off += c.length; }
        return out;
    } finally {
        instance.dispose();
    }
}

/** Concat REQ + suffix bytes — convenience for expected-body assembly. */
function reqPlus(suffix: string): Uint8Array {
    const reqBytes = expectedRequestBody();
    const suff = new TextEncoder().encode(suffix);
    const out = new Uint8Array(reqBytes.length + suff.length);
    out.set(reqBytes, 0);
    out.set(suff, reqBytes.length);
    return out;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    // Fast head/tail spot-check for huge buffers, then byte-compare a window.
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

/**
 * Eager-draining JS impl for consumer-side tests. The lazy `makeJsImpl` is
 * unsuitable for client-driven flows because its response body generator only
 * reads the request body when iterated — and the consumer can't iterate the
 * response until it has finished writing the request. Result: deadlock.
 *
 * This variant awaits the full request body before returning the response,
 * letting the consumer's writes complete in lock-step with the host's reads.
 */
function makeJsImplEager(suffix: string = '-handled-'): { handle: (req: unknown) => Promise<{ tag: 'ok'; val: unknown } | { tag: 'err'; val: unknown }> } {
    return {
        async handle(req: unknown) {
            const completion = Promise.resolve({ tag: 'ok' as const, val: undefined });
            const [bodyStream] = _HttpRequest.consumeBody(req as never, completion as never);
            const collected: Uint8Array[] = [];
            for await (const chunk of bodyStream as AsyncIterable<Uint8Array>) {
                collected.push(chunk);
            }
            const enc = new TextEncoder();
            const respBody: AsyncIterable<Uint8Array> = {
                async *[Symbol.asyncIterator]() {
                    for (const c of collected) yield c;
                    yield enc.encode(suffix);
                },
            };
            const respHeaders = _HttpFields.fromList([]);
            const respTrailers = Promise.resolve({ tag: 'ok' as const, val: undefined });
            const [response] = _HttpResponse.new(respHeaders as never, respBody, respTrailers as never);
            return { tag: 'ok' as const, val: response };
        },
    };
}

describe('HTTP P3 WAT — client-suite (Phase 3 — Scenario A\': consumer → JS impl)', () => {
    const verbose = useVerboseOnFailure();

    test('collected body == request + "-handled-"', () =>
        runWithVerbose(verbose, async () => {
            const collected = await runConsumer(makeJsImplEager(), verbose);
            const expected = reqPlus('-handled-');
            expect(collected.length).toBe(expected.length);
            expect(bytesEqual(collected, expected)).toBe(true);
        }), 60_000);
});

// =====================================================================
// Phase 3 — WAT-to-WAT scenarios
//
// These exercise the consumer-WAT against WAT upstream chains, going
// through the JS-AsyncIterable bridge that wraps each component's stream
// handles. They validate the concurrent-driver pattern in
// client-consumer-p3.wat (interleaved req-write and resp-read) plus the
// early task.return in server-impl-p3.wat — both required to avoid the
// classic two-side streaming deadlock.
// =====================================================================
describe('HTTP P3 WAT — client-suite (Phase 3 — Scenario B\': consumer → server-impl WAT)', () => {
    const verbose = useVerboseOnFailure();

    test('collected body == request + "-handled-"', () =>
        runWithVerbose(verbose, async () => {
            const wasiImports = createWasiP3Host();
            const implComp = await createComponent(SERVER_IMPL_WASM, verboseOptions(verbose));
            const implInstance = await implComp.instantiate(wasiImports);
            const upstream = implInstance.exports[HANDLER_INTERFACE] as HandlerExport;
            try {
                const collected = await runConsumer(upstream, verbose);
                const expected = reqPlus('-handled-');
                expect(collected.length).toBe(expected.length);
                expect(bytesEqual(collected, expected)).toBe(true);
            } finally {
                implInstance.dispose();
            }
        }), 60_000);
});

// Scenarios C' and I' deferred: server-fwd-p3.wat uses an 8-phase SERIAL
// driver (req-side phases 0..3, then subtask-wait phase 4, then resp-side
// phases 5..8). For 2 MiB streaming bodies, the upstream impl backpressures
// its resp_body_w (entry hits 64 KiB threshold) when fwd is still in req-side
// phases — fwd doesn't read resp_in until phase 5 — so impl stops reading
// req → req_out bridge fills → fwd's req_out write BLOCKs → deadlock.
// Fixing this requires a concurrent driver in fwd mirroring the consumer's
// event-dispatched pump pattern (substantial rewrite). Filed for Phase 4.
describe.skip('HTTP P3 WAT — client-suite (Phase 3 — Scenario C\': consumer → fwd → server-impl)', () => {
    const verbose = useVerboseOnFailure();

    test('DEFERRED: serial fwd driver deadlocks on 2 MiB body — needs concurrent rewrite', () =>
        runWithVerbose(verbose, async () => {
            const wasiImports = createWasiP3Host();
            const implComp = await createComponent(SERVER_IMPL_WASM, verboseOptions(verbose));
            const implInstance = await implComp.instantiate(wasiImports);
            const upstreamHandler = implInstance.exports[HANDLER_INTERFACE] as HandlerExport;

            const fwd = await instantiateFwdWithUpstream(upstreamHandler, verbose);
            try {
                const collected = await runConsumer(fwd.handler, verbose);
                const expected = reqPlus('-handled-');
                expect(collected.length).toBe(expected.length);
                expect(bytesEqual(collected, expected)).toBe(true);
            } finally {
                fwd.instance.dispose();
                implInstance.dispose();
            }
        }), 60_000);
});

// Scenario I' deferred for the same reason as C' (serial fwd driver in the
// composed forwarder-implementer artifact deadlocks on streaming bodies).
describe.skip('HTTP P3 WAT — client-suite (Phase 3 — Scenario I\': consumer → composed fwd+impl)', () => {
    const verbose = useVerboseOnFailure();

    test('collected body == request + "-handled-"', () =>
        runWithVerbose(verbose, async () => {
            const wasiImports = createWasiP3Host();
            const composedComp = await createComponent(FWD_IMPL_COMPOSED_WASM, verboseOptions(verbose));
            const composedInstance = await composedComp.instantiate(wasiImports);
            const upstream = composedInstance.exports[HANDLER_INTERFACE] as HandlerExport;
            try {
                const collected = await runConsumer(upstream, verbose);
                const expected = reqPlus('-handled-');
                expect(collected.length).toBe(expected.length);
                expect(bytesEqual(collected, expected)).toBe(true);
            } finally {
                composedInstance.dispose();
            }
        }), 60_000);
});
