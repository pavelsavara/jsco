// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * End-to-end test for the WASIp3 HTTP handler async-lift export path.
 *
 * Loads `hello-http-p3.wasm` (a hand-written WAT component, see
 * `integration-tests/hello-http-p3-wat/hello-http-p3.wat`) which:
 *   - imports `wasi:http/types` (request + response resource types)
 *   - imports `test:hello-http/helper@0.1.0` for `make-hello-response`
 *     and `fail-mode` (a host-driven flag toggling Ok vs Err behaviour)
 *   - exports `wasi:http/handler@0.3.0-rc-2026-03-15` with `handle`
 *     async-lifted (canon lift ... async with callback) returning
 *     `result<own<response>, error-code>` (Spilled, delivered via task.return).
 *
 * Validates:
 *   F1 — async-lift trampoline lifts its `own<request>` parameter through
 *        the canonical resource table (no more handle=0 panic).
 *   F2 — `task.return` properly loads the spilled result struct from guest
 *        memory and resolves the awaited handle().
 *   serve() — adapter unwraps the `{tag,val}` Result shape returned by a
 *        WASM-lifted handler and serves the response over Node http.
 *
 * Out of scope (per `proposals.md` "HTTP Reactor Concurrency"): parallel /
 * concurrent request processing on a single instance.
 */

import * as http from 'node:http';

import { createComponent } from '../../../../src/resolver';
import { _HttpFields, _HttpRequest, _HttpResponse } from '../../../../src/host/wasip3/http';
import { createWasiP3Host } from '../../../../src/host/wasip3/index';
import { serve } from '../../../../src/host/wasip3/node/http-server';
import type {
    WasiHttpHandlerExport,
    ServeHandle,
} from '../../../../src/host/wasip3/node/http-server';
import { initializeAsserts } from '../../../../src/utils/assert';
import {
    useVerboseOnFailure,
    verboseOptions,
    runWithVerbose,
} from '../../../test-utils/verbose-logger';

initializeAsserts();

const HELLO_HTTP_WASM = './integration-tests/hello-http-p3-wat/hello-http-p3.wasm';
const HANDLER_INTERFACE = 'wasi:http/handler@0.3.0-rc-2026-03-15';
const HELPER_INTERFACE = 'test:hello-http/helper@0.1.0';

const RESPONSE_BODY = 'hello from wat';
const RESPONSE_CONTENT_TYPE = 'text/plain';

/** Build a fresh HttpResponse with a fixed 200/text body. */
function makeHelloResponse(): unknown {
    const headers = _HttpFields.fromList([
        ['content-type', new TextEncoder().encode(RESPONSE_CONTENT_TYPE)],
    ]);
    const bodyBytes = new TextEncoder().encode(RESPONSE_BODY);
    const bodyStream = {
        async *[Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array> {
            yield bodyBytes;
        },
    };
    const trailersPromise = Promise.resolve({ tag: 'ok' as const, val: undefined });
    const [response] = _HttpResponse.new(
        headers as never,
        bodyStream,
        trailersPromise as never,
    );
    response.setStatusCode(200);
    return response;
}

/** Synthesize a minimal HttpRequest for direct handler-export invocation. */
function makeSyntheticRequest(): unknown {
    const reqHeaders = _HttpFields.fromList([]);
    const trailers = Promise.resolve({ tag: 'ok' as const, val: undefined });
    const [request] = _HttpRequest.new(
        reqHeaders as never,
        undefined,
        trailers as never,
        undefined,
    );
    return request;
}

/** Minimal HTTP client request helper. */
function clientRequest(
    url: string,
    options?: { method?: string },
): Promise<{
    statusCode: number;
    headers: http.IncomingHttpHeaders;
    body: string;
}> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const req = http.request(
            {
                hostname: parsed.hostname,
                port: parsed.port,
                path: parsed.pathname + parsed.search,
                method: options?.method ?? 'GET',
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => {
                    resolve({
                        statusCode: res.statusCode!,
                        headers: res.headers,
                        body: Buffer.concat(chunks).toString('utf-8'),
                    });
                });
            },
        );
        req.on('error', reject);
        req.end();
    });
}

interface FailModeRef {
    /** 0 = handler returns Ok(response); 1 = handler returns Err(internal-error). */
    value: number;
}

function buildImports(failMode: FailModeRef): Record<string, unknown> {
    const wasi = createWasiP3Host();
    return {
        ...wasi,
        [HELPER_INTERFACE]: {
            'make-hello-response': (): unknown => makeHelloResponse(),
            'fail-mode': (): number => failMode.value,
        },
    };
}

describe('hello-http-p3 WAT — async-lift handler end-to-end', () => {
    const verbose = useVerboseOnFailure();

    test('direct: handler.handle(synthetic) returns Ok-wrapped response', () =>
        runWithVerbose(verbose, async () => {
            const failMode: FailModeRef = { value: 0 };
            const component = await createComponent(HELLO_HTTP_WASM, verboseOptions(verbose));
            const instance = await component.instantiate(buildImports(failMode));
            try {
                const handler = instance.exports[HANDLER_INTERFACE] as
                    | WasiHttpHandlerExport
                    | undefined;
                expect(handler).toBeDefined();
                expect(typeof handler!.handle).toBe('function');

                const request = makeSyntheticRequest();
                const result = await handler!.handle(request) as { tag: string; val?: unknown };
                expect(result).toBeDefined();
                expect(result.tag).toBe('ok');
                expect(result.val).toBeDefined();
                const response = result.val as { getStatusCode(): number };
                expect(response.getStatusCode()).toBe(200);
            } finally {
                instance.dispose();
            }
        }));

    test('direct: fail-mode=1 yields Err(internal-error)', () =>
        runWithVerbose(verbose, async () => {
            const failMode: FailModeRef = { value: 1 };
            const component = await createComponent(HELLO_HTTP_WASM, verboseOptions(verbose));
            const instance = await component.instantiate(buildImports(failMode));
            try {
                const handler = instance.exports[HANDLER_INTERFACE] as
                    WasiHttpHandlerExport;

                const request = makeSyntheticRequest();
                const result = await handler.handle(request) as { tag: string; val?: unknown };
                expect(result.tag).toBe('err');
                expect(result.val).toBeDefined();
                const errVal = result.val as { tag: string };
                expect(errVal.tag).toBe('internal-error');
            } finally {
                instance.dispose();
            }
        }));

    test('via serve(): GET / returns 200 with hello body', () =>
        runWithVerbose(verbose, async () => {
            const failMode: FailModeRef = { value: 0 };
            const component = await createComponent(HELLO_HTTP_WASM, verboseOptions(verbose));
            const instance = await component.instantiate(buildImports(failMode));
            let serveHandle: ServeHandle | undefined;
            try {
                const handler = instance.exports[HANDLER_INTERFACE] as
                    WasiHttpHandlerExport;
                serveHandle = await serve(handler, { port: 0, host: '127.0.0.1' });

                const res = await clientRequest(`http://127.0.0.1:${serveHandle.port}/`);
                expect(res.statusCode).toBe(200);
                expect(res.headers['content-type']).toBe(RESPONSE_CONTENT_TYPE);
                expect(res.body).toBe(RESPONSE_BODY);
            } finally {
                if (serveHandle) await serveHandle.close();
                instance.dispose();
            }
        }), 15000);

    test('via serve(): fail-mode=1 yields HTTP 500', () =>
        runWithVerbose(verbose, async () => {
            const failMode: FailModeRef = { value: 1 };
            const component = await createComponent(HELLO_HTTP_WASM, verboseOptions(verbose));
            const instance = await component.instantiate(buildImports(failMode));
            let serveHandle: ServeHandle | undefined;
            try {
                const handler = instance.exports[HANDLER_INTERFACE] as
                    WasiHttpHandlerExport;
                serveHandle = await serve(handler, { port: 0, host: '127.0.0.1' });

                const res = await clientRequest(`http://127.0.0.1:${serveHandle.port}/`);
                expect(res.statusCode).toBe(500);
            } finally {
                if (serveHandle) await serveHandle.close();
                instance.dispose();
            }
        }), 15000);
});
