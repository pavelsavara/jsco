// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { stripImportPrefix } from './import-names';

describe('stripImportPrefix', () => {
    test('strips import-func- prefix', () => {
        expect(stripImportPrefix('import-func-my-function')).toBe('my-function');
    });

    test('strips import-method- prefix', () => {
        expect(stripImportPrefix('import-method-obj-do-thing')).toBe('obj-do-thing');
    });

    test('strips import-constructor- prefix', () => {
        expect(stripImportPrefix('import-constructor-my-type')).toBe('my-type');
    });

    test('strips import-static- prefix', () => {
        expect(stripImportPrefix('import-static-obj-count')).toBe('obj-count');
    });

    test('strips import-type- prefix', () => {
        expect(stripImportPrefix('import-type-my-resource')).toBe('my-resource');
    });

    test('returns name unchanged when no prefix matches', () => {
        expect(stripImportPrefix('plain-name')).toBe('plain-name');
    });

    test('returns empty string when prefix is the entire name', () => {
        expect(stripImportPrefix('import-func-')).toBe('');
    });

    test('does not strip partial prefix matches', () => {
        expect(stripImportPrefix('import-fun-something')).toBe('import-fun-something');
    });
});
