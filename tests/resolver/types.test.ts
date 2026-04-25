// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { initializeAsserts } from '../../src/utils/assert';
initializeAsserts();

import { ModelTag } from '../../src/parser/model/tags';
import { resolveCanonicalOptions, StringEncoding } from '../../src/resolver/types';
import type { CanonicalOption } from '../../src/parser/model/canonicals';

describe('types.ts', () => {
    describe('resolveCanonicalOptions', () => {
        test('empty options gives UTF8 defaults', () => {
            const result = resolveCanonicalOptions([]);
            expect(result.stringEncoding).toBe(StringEncoding.Utf8);
            expect(result.memoryIndex).toBeUndefined();
            expect(result.reallocIndex).toBeUndefined();
            expect(result.postReturnIndex).toBeUndefined();
        });

        test('UTF8 option', () => {
            const result = resolveCanonicalOptions([
                { tag: ModelTag.CanonicalOptionUTF8 } as CanonicalOption,
            ]);
            expect(result.stringEncoding).toBe(StringEncoding.Utf8);
        });

        test('UTF16 option', () => {
            const result = resolveCanonicalOptions([
                { tag: ModelTag.CanonicalOptionUTF16 } as CanonicalOption,
            ]);
            expect(result.stringEncoding).toBe(StringEncoding.Utf16);
        });

        test('CompactUTF16 option', () => {
            const result = resolveCanonicalOptions([
                { tag: ModelTag.CanonicalOptionCompactUTF16 } as CanonicalOption,
            ]);
            expect(result.stringEncoding).toBe(StringEncoding.CompactUtf16);
        });

        test('memory option', () => {
            const result = resolveCanonicalOptions([
                { tag: ModelTag.CanonicalOptionMemory, value: 3 } as CanonicalOption,
            ]);
            expect(result.memoryIndex).toBe(3);
        });

        test('realloc option', () => {
            const result = resolveCanonicalOptions([
                { tag: ModelTag.CanonicalOptionRealloc, value: 5 } as CanonicalOption,
            ]);
            expect(result.reallocIndex).toBe(5);
        });

        test('postReturn option', () => {
            const result = resolveCanonicalOptions([
                { tag: ModelTag.CanonicalOptionPostReturn, value: 7 } as CanonicalOption,
            ]);
            expect(result.postReturnIndex).toBe(7);
        });

        test('all options combined', () => {
            const result = resolveCanonicalOptions([
                { tag: ModelTag.CanonicalOptionUTF16 } as CanonicalOption,
                { tag: ModelTag.CanonicalOptionMemory, value: 0 } as CanonicalOption,
                { tag: ModelTag.CanonicalOptionRealloc, value: 1 } as CanonicalOption,
                { tag: ModelTag.CanonicalOptionPostReturn, value: 2 } as CanonicalOption,
            ]);
            expect(result.stringEncoding).toBe(StringEncoding.Utf16);
            expect(result.memoryIndex).toBe(0);
            expect(result.reallocIndex).toBe(1);
            expect(result.postReturnIndex).toBe(2);
        });

        test('last encoding wins', () => {
            const result = resolveCanonicalOptions([
                { tag: ModelTag.CanonicalOptionUTF8 } as CanonicalOption,
                { tag: ModelTag.CanonicalOptionUTF16 } as CanonicalOption,
                { tag: ModelTag.CanonicalOptionCompactUTF16 } as CanonicalOption,
            ]);
            expect(result.stringEncoding).toBe(StringEncoding.CompactUtf16);
        });
    });
});
