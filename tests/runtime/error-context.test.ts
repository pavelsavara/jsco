// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { createErrorContextTable } from '../../src/runtime/error-context';

describe('createErrorContextTable', () => {
    it('returns an object with all required methods', () => {
        const table = createErrorContextTable();
        expect(typeof table.newErrorContext).toBe('function');
        expect(typeof table.debugMessage).toBe('function');
        expect(typeof table.drop).toBe('function');
        expect(typeof table.add).toBe('function');
        expect(typeof table.get).toBe('function');
        expect(typeof table.remove).toBe('function');
    });

    it('newErrorContext throws not-yet-implemented', () => {
        const table = createErrorContextTable();
        expect(() => table.newErrorContext()).toThrow('not yet implemented');
    });

    it('debugMessage throws not-yet-implemented', () => {
        const table = createErrorContextTable();
        expect(() => table.debugMessage()).toThrow('not yet implemented');
    });

    it('drop throws not-yet-implemented', () => {
        const table = createErrorContextTable();
        expect(() => table.drop()).toThrow('not yet implemented');
    });

    it('add throws not-yet-implemented', () => {
        const table = createErrorContextTable();
        expect(() => table.add()).toThrow('not yet implemented');
    });

    it('get throws not-yet-implemented', () => {
        const table = createErrorContextTable();
        expect(() => table.get()).toThrow('not yet implemented');
    });

    it('remove throws not-yet-implemented', () => {
        const table = createErrorContextTable();
        expect(() => table.remove()).toThrow('not yet implemented');
    });
});
