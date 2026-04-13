// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { getBuildInfo } from './index';
import { GIT_HASH, CONFIGURATION } from './constants';

describe('index.ts', () => {
    test('getBuildInfo returns git hash and configuration', () => {
        const info = getBuildInfo();
        expect(info).toHaveProperty(GIT_HASH);
        expect(info).toHaveProperty(CONFIGURATION);
        expect(typeof info[GIT_HASH]).toBe('string');
        expect(typeof info[CONFIGURATION]).toBe('string');
    });
});
