// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { parse } from '../../src/parser/index';

describe('parser test', () => {
    test('to fail on invalid header', async () => {
        const wasm = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
        expect(async () => await parse(wasm)).rejects.toThrowError('unexpected magic, version or layer.');
    });
});
