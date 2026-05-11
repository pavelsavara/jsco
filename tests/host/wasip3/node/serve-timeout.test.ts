// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

/**
 * Unit tests for the serve() HTTP harness timeout behavior.
 *
 * Exercises the per-request timeout path: when a handler never responds,
 * the server should return 504 Gateway Timeout after `httpRequestTimeoutMs`.
 * This validates Step 9 (p3_cli_serve_sleep handler cancellation) without
 * needing a real WASM component.
 */

import { serve } from '../../../../src/host/wasip3/node/http-server';
import type { ServeHandle, WasiHttpHandlerExport } from '../../../../src/host/wasip3/node/http-server';

describe('serve() — request timeout behavior', () => {
    let handle: ServeHandle | undefined;

    afterEach(async () => {
        if (handle) {
            await handle.close();
            handle = undefined;
        }
    });

    test('handler that never responds triggers 504 after timeout', async () => {
        // A mock handler that returns a promise that never resolves.
        const neverHandler: WasiHttpHandlerExport = {
            handle: () => new Promise(() => { /* never resolves */ }),
        };

        handle = await serve(neverHandler, {
            port: 0,
            host: '127.0.0.1',
            network: { httpRequestTimeoutMs: 500 },
        });

        const r = await fetch(`http://127.0.0.1:${handle.port}/`);
        expect(r.status).toBe(504);
        expect(await r.text()).toBe('Gateway Timeout');
    }, 10000);

    test('handler that responds before timeout returns normally', async () => {
        // A mock handler that responds immediately with 200.
        const fastHandler: WasiHttpHandlerExport = {
            handle: () => Promise.resolve({
                tag: 'ok',
                val: {
                    _internalStatusCode: 200,
                    _internalHeaders: {
                        copyAll: () => [['content-type', new TextEncoder().encode('text/plain')]],
                    },
                    _internalContents: (function* () {
                        yield new TextEncoder().encode('Hello!');
                    })(),
                    _internalCompletionResolve: () => { /* no-op */ },
                },
            }),
        };

        handle = await serve(fastHandler, {
            port: 0,
            host: '127.0.0.1',
            network: { httpRequestTimeoutMs: 5000 },
        });

        const r = await fetch(`http://127.0.0.1:${handle.port}/`);
        expect(r.status).toBe(200);
        expect(await r.text()).toBe('Hello!');
    }, 10000);

    test('handler that throws returns 500', async () => {
        const throwingHandler: WasiHttpHandlerExport = {
            handle: () => Promise.reject(new Error('intentional test error')),
        };

        handle = await serve(throwingHandler, {
            port: 0,
            host: '127.0.0.1',
            network: { httpRequestTimeoutMs: 5000 },
        });

        const r = await fetch(`http://127.0.0.1:${handle.port}/`);
        expect(r.status).toBe(500);
        expect(await r.text()).toBe('Internal Server Error');
    }, 10000);

    test('handler returning error result returns 500', async () => {
        const errHandler: WasiHttpHandlerExport = {
            handle: () => Promise.resolve({ tag: 'err', val: { tag: 'internal-error', val: 'broken' } }),
        };

        handle = await serve(errHandler, {
            port: 0,
            host: '127.0.0.1',
            network: { httpRequestTimeoutMs: 5000 },
        });

        const r = await fetch(`http://127.0.0.1:${handle.port}/`);
        expect(r.status).toBe(500);
        expect(await r.text()).toBe('Handler returned error');
    }, 10000);

    test('timeout is configurable — short timeout fires before slow handler', async () => {
        // Handler resolves after 2000ms — but timeout is 200ms so it won't complete.
        const slowHandler: WasiHttpHandlerExport = {
            handle: () => new Promise(resolve =>
                setTimeout(() => resolve({
                    tag: 'ok',
                    val: {
                        _internalStatusCode: 200,
                        _internalHeaders: { copyAll: () => [] },
                        _internalContents: null,
                        _internalCompletionResolve: () => { /* no-op */ },
                    },
                }), 2000),
            ),
        };

        handle = await serve(slowHandler, {
            port: 0,
            host: '127.0.0.1',
            network: { httpRequestTimeoutMs: 200 },
        });

        const start = Date.now();
        const r = await fetch(`http://127.0.0.1:${handle.port}/`);
        const elapsed = Date.now() - start;
        expect(r.status).toBe(504);
        // Should complete around 200ms, not 2000ms
        expect(elapsed).toBeLessThan(1000);
    }, 10000);
});
