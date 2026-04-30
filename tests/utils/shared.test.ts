// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { bigIntReplacer } from '../../src/utils/shared';

describe('shared.ts', () => {
    describe('bigIntReplacer', () => {
        test('converts bigint to string with n suffix', () => {
            expect(bigIntReplacer('key', 42n)).toBe('42n');
        });

        test('passes non-bigint through', () => {
            expect(bigIntReplacer('key', 42)).toBe(42);
            expect(bigIntReplacer('key', 'hello')).toBe('hello');
            expect(bigIntReplacer('key', null)).toBe(null);
        });

        test('works with JSON.stringify', () => {
            const obj = { a: 1n, b: 2, c: 'x' };
            const json = JSON.stringify(obj, bigIntReplacer);
            expect(json).toBe('{"a":"1n","b":2,"c":"x"}');
        });
    });
});
