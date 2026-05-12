// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { linkHandler, WASI_HTTP_HANDLER_INTERFACE } from '../../../../src/host/wasip3/node/http-server';
import type { WasiHttpHandlerExport } from '../../../../src/host/wasip3/node/http-server';

describe('linkHandler recursion-depth (U5 / S1)', () => {
    test('default cap (8) trips on self-referential wiring', async () => {
        // Build a provider whose handle re-enters the wrapper, forming an
        // infinite recursive chain. Each entry runs through `linkHandler`'s
        // depth-counted wrapper and increments the per-async-context depth.
        const ref: { wrapper?: WasiHttpHandlerExport } = {};
        const provider = {
            exports: {
                [WASI_HTTP_HANDLER_INTERFACE]: {
                    async handle(req: unknown): Promise<unknown> {
                        // Re-enter through the wrapper, not through `provider`
                        // directly — the wrapper is what increments depth.
                        return ref.wrapper!.handle(req);
                    },
                },
            },
        };
        const linked = linkHandler(provider);
        ref.wrapper = linked[WASI_HTTP_HANDLER_INTERFACE];

        await expect(ref.wrapper.handle({})).rejects.toThrow(/handler chain depth .* exceeds maxDepth=8/);
    });

    test('configurable maxDepth=3 trips earlier', async () => {
        const ref: { wrapper?: WasiHttpHandlerExport } = {};
        const provider = {
            exports: {
                [WASI_HTTP_HANDLER_INTERFACE]: {
                    async handle(req: unknown): Promise<unknown> {
                        return ref.wrapper!.handle(req);
                    },
                },
            },
        };
        const linked = linkHandler(provider, { maxDepth: 3 });
        ref.wrapper = linked[WASI_HTTP_HANDLER_INTERFACE];

        await expect(ref.wrapper.handle({})).rejects.toThrow(/maxDepth=3/);
    });

    test('non-recursive call passes through with depth=1', async () => {
        const provider = {
            exports: {
                [WASI_HTTP_HANDLER_INTERFACE]: {
                    async handle(req: unknown): Promise<unknown> {
                        return { ok: true, echoed: req };
                    },
                },
            },
        };
        const wrapper = linkHandler(provider)[WASI_HTTP_HANDLER_INTERFACE];
        const result = await wrapper.handle({ method: 'GET' });
        expect(result).toEqual({ ok: true, echoed: { method: 'GET' } });
    });

    test('two-deep manual chain stays below cap', async () => {
        // Stack two wrappers (e.g. middleware -> middleware -> echo).
        const echo = {
            exports: {
                [WASI_HTTP_HANDLER_INTERFACE]: {
                    async handle(req: unknown): Promise<unknown> { return { handled: req }; },
                },
            },
        };
        const middleware1 = {
            exports: {
                [WASI_HTTP_HANDLER_INTERFACE]: linkHandler(echo)[WASI_HTTP_HANDLER_INTERFACE],
            },
        };
        const middleware2 = {
            exports: {
                [WASI_HTTP_HANDLER_INTERFACE]: linkHandler(middleware1)[WASI_HTTP_HANDLER_INTERFACE],
            },
        };
        const top = linkHandler(middleware2)[WASI_HTTP_HANDLER_INTERFACE];
        const result = await top.handle({ via: 'chain' });
        expect(result).toEqual({ handled: { via: 'chain' } });
    });

    test('concurrent unrelated requests do not share a counter', async () => {
        // 16 parallel non-recursive calls; per-async-context depth must
        // remain 1 for each (no cross-contamination via shared counter).
        const provider = {
            exports: {
                [WASI_HTTP_HANDLER_INTERFACE]: {
                    async handle(req: unknown): Promise<unknown> {
                        // Yield to let interleaving expose any shared state.
                        await new Promise<void>((resolve) => setImmediate(resolve));
                        return req;
                    },
                },
            },
        };
        const wrapper = linkHandler(provider, { maxDepth: 1 })[WASI_HTTP_HANDLER_INTERFACE];
        const results = await Promise.all(
            Array.from({ length: 16 }, (_, i) => wrapper.handle({ i })),
        );
        expect(results).toEqual(Array.from({ length: 16 }, (_, i) => ({ i })));
    });
});
