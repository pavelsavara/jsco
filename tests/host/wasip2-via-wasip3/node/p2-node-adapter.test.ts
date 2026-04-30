// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { createWasiP2ViaP3NodeHost, createNodeFilesystem } from '../../../../src/host/wasip2-via-wasip3/node/index';

describe('wasip2-via-wasip3 node adapter', () => {
    test('createWasiP2ViaP3NodeHost returns P2 imports', () => {
        const p2 = createWasiP2ViaP3NodeHost({
            env: [['TEST_KEY', 'test_val']],
            args: ['--test'],
        });
        expect(p2).toBeDefined();
        expect(p2['wasi:cli/environment']).toBeDefined();
        const getEnv = (p2['wasi:cli/environment'] as any)['get-environment'];
        expect(getEnv).toBeDefined();
        const env = getEnv();
        expect(env).toEqual(expect.arrayContaining([['TEST_KEY', 'test_val']]));
    });

    test('createWasiP2ViaP3NodeHost with no config', () => {
        const p2 = createWasiP2ViaP3NodeHost();
        expect(p2).toBeDefined();
        expect(p2['wasi:io/poll']).toBeDefined();
    });

    test('createNodeFilesystem requires at least one mount', () => {
        expect(() => createNodeFilesystem([])).toThrow('At least one mount point is required');
    });

    test('createNodeFilesystem with a mount returns preopens', () => {
        const result = createNodeFilesystem([{ hostPath: '.', guestPath: '/' }]);
        expect(result.preopens).toBeDefined();
    });
});
