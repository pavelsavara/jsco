// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { linkHandler, WASI_HTTP_HANDLER_INTERFACE } from '../../../../src/host/wasip3/node/http-server';

describe('linkHandler (U4)', () => {
    const fakeHandle = async (): Promise<unknown> => undefined;
    const fakeExport = { handle: fakeHandle };

    test('default interface: returns wrapped export under canonical key', async () => {
        const provider = { exports: { [WASI_HTTP_HANDLER_INTERFACE]: fakeExport } };
        const out = linkHandler(provider);
        expect(Object.keys(out)).toEqual([WASI_HTTP_HANDLER_INTERFACE]);
        // Wrapper object identity differs (depth-counted), but delegates to
        // the inner handle.
        expect(out[WASI_HTTP_HANDLER_INTERFACE]).not.toBe(fakeExport);
        expect(typeof out[WASI_HTTP_HANDLER_INTERFACE].handle).toBe('function');
        expect(await out[WASI_HTTP_HANDLER_INTERFACE].handle({})).toBeUndefined();
    });

    test('renamed: returns wrapped export under requested key', async () => {
        const provider = { exports: { [WASI_HTTP_HANDLER_INTERFACE]: fakeExport } };
        const out = linkHandler(provider, { as: 'local:local/chain-http' });
        expect(Object.keys(out)).toEqual(['local:local/chain-http']);
        expect(typeof out['local:local/chain-http'].handle).toBe('function');
    });

    test('throws when provider lacks the canonical export', () => {
        const provider = { exports: {} };
        expect(() => linkHandler(provider)).toThrow(/does not export wasi:http\/handler/);
    });

    test('throws when provider export has no handle() method', () => {
        const provider = { exports: { [WASI_HTTP_HANDLER_INTERFACE]: {} } };
        expect(() => linkHandler(provider)).toThrow(/handle\(\) method/);
    });

    test('throws when provider export.handle is not a function', () => {
        const provider = { exports: { [WASI_HTTP_HANDLER_INTERFACE]: { handle: 42 } } };
        expect(() => linkHandler(provider)).toThrow(/handle\(\) method/);
    });

    test('canonical interface constant matches WIT path', () => {
        expect(WASI_HTTP_HANDLER_INTERFACE).toBe('wasi:http/handler@0.3.0-rc-2026-03-15');
    });
});
