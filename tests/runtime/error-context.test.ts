// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { createErrorContextTable } from '../../src/runtime/error-context';

describe('createErrorContextTable', () => {
    it('exposes the public surface', () => {
        const table = createErrorContextTable();
        expect(typeof table.add).toBe('function');
        expect(typeof table.get).toBe('function');
        expect(typeof table.remove).toBe('function');
        expect(typeof table.size).toBe('function');
        expect(table.size()).toBe(0);
    });

    it('add returns a fresh monotonic handle starting at 1', () => {
        const table = createErrorContextTable();
        const h1 = table.add({ debugMessage: 'first' });
        const h2 = table.add({ debugMessage: 'second' });
        const h3 = table.add(new Error('third'));
        expect(h1).toBe(1);
        expect(h2).toBe(2);
        expect(h3).toBe(3);
        expect(table.size()).toBe(3);
    });

    it('get returns the stored value without removing it', () => {
        const table = createErrorContextTable();
        const value = { debugMessage: 'hi' };
        const h = table.add(value);
        expect(table.get(h)).toBe(value);
        expect(table.get(h)).toBe(value);
        expect(table.size()).toBe(1);
    });

    it('remove returns the value and deletes the handle', () => {
        const table = createErrorContextTable();
        const err = new Error('boom');
        const h = table.add(err);
        expect(table.remove(h)).toBe(err);
        expect(table.size()).toBe(0);
        expect(() => table.get(h)).toThrow(/Invalid error-context handle/);
        expect(() => table.remove(h)).toThrow(/Invalid error-context handle/);
    });

    it('handles never collide after removal (monotonic, no reuse)', () => {
        const table = createErrorContextTable();
        const h1 = table.add('a');
        table.remove(h1);
        const h2 = table.add('b');
        expect(h2).toBe(h1 + 1);
    });

    it('get/remove on an unknown handle throws', () => {
        const table = createErrorContextTable();
        expect(() => table.get(42)).toThrow(/Invalid error-context handle: 42/);
        expect(() => table.remove(42)).toThrow(/Invalid error-context handle: 42/);
    });

    it('stores arbitrary JS values (Error, string, plain object, undefined slot via debugMessage)', () => {
        const table = createErrorContextTable();
        const values: unknown[] = [
            new Error('an error'),
            'plain string',
            { debugMessage: 'composite' },
            42,
            null,
        ];
        const handles = values.map((v) => table.add(v));
        for (let i = 0; i < values.length; i++) {
            expect(table.get(handles[i]!)).toBe(values[i]);
        }
    });
});
