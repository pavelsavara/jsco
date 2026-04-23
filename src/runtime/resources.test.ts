// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { initializeAsserts } from '../utils/assert';
initializeAsserts();

import { createResourceTable } from './resources';

describe('ResourceTable', () => {
    describe('add/get/remove/has', () => {
        test('add returns unique handle, get retrieves the object', () => {
            const rt = createResourceTable();
            const obj = { name: 'test' };
            const h = rt.add(1, obj);
            expect(h).toBeGreaterThan(0);
            expect(rt.get(1, h)).toBe(obj);
        });

        test('remove returns the object and removes the handle', () => {
            const rt = createResourceTable();
            const obj = { name: 'test' };
            const h = rt.add(1, obj);
            const removed = rt.remove(1, h);
            expect(removed).toBe(obj);
            expect(rt.has(1, h)).toBe(false);
        });

        test('has returns true for live handles, false after remove', () => {
            const rt = createResourceTable();
            const h = rt.add(1, 'val');
            expect(rt.has(1, h)).toBe(true);
            rt.remove(1, h);
            expect(rt.has(1, h)).toBe(false);
        });

        test('get with wrong resourceTypeIdx throws', () => {
            const rt = createResourceTable();
            const h = rt.add(1, 'val');
            expect(() => rt.get(2, h)).toThrow('belongs to type 1, not 2');
        });

        test('get on non-existent handle throws', () => {
            const rt = createResourceTable();
            expect(() => rt.get(1, 999)).toThrow('Invalid resource handle');
        });

        test('remove on non-existent handle throws', () => {
            const rt = createResourceTable();
            expect(() => rt.remove(1, 999)).toThrow('Invalid resource handle');
        });

        test('multiple resources of different types coexist', () => {
            const rt = createResourceTable();
            const h1 = rt.add(1, 'type1');
            const h2 = rt.add(2, 'type2');
            expect(rt.get(1, h1)).toBe('type1');
            expect(rt.get(2, h2)).toBe('type2');
            expect(rt.has(1, h2)).toBe(false);
            expect(rt.has(2, h1)).toBe(false);
        });

        test('same object can be added multiple times, gets different handles', () => {
            const rt = createResourceTable();
            const obj = { shared: true };
            const h1 = rt.add(1, obj);
            const h2 = rt.add(1, obj);
            expect(h1).not.toBe(h2);
            expect(rt.get(1, h1)).toBe(obj);
            expect(rt.get(1, h2)).toBe(obj);
        });

        test('handles are monotonically increasing', () => {
            const rt = createResourceTable();
            const h1 = rt.add(1, 'a');
            const h2 = rt.add(1, 'b');
            const h3 = rt.add(1, 'c');
            expect(h2).toBeGreaterThan(h1);
            expect(h3).toBeGreaterThan(h2);
            rt.remove(1, h2);
            const h4 = rt.add(1, 'd');
            expect(h4).toBeGreaterThan(h3); // never reused
        });
    });

    describe('lending', () => {
        test('lend increments lend count', () => {
            const rt = createResourceTable();
            const h = rt.add(1, 'val');
            rt.lend(1, h);
            expect(rt.lendCount(1, h)).toBe(1);
            rt.lend(1, h);
            expect(rt.lendCount(1, h)).toBe(2);
        });

        test('unlend decrements lend count', () => {
            const rt = createResourceTable();
            const h = rt.add(1, 'val');
            rt.lend(1, h);
            rt.lend(1, h);
            rt.unlend(1, h);
            expect(rt.lendCount(1, h)).toBe(1);
        });

        test('remove with outstanding lends throws', () => {
            const rt = createResourceTable();
            const h = rt.add(1, 'val');
            rt.lend(1, h);
            expect(() => rt.remove(1, h)).toThrow('outstanding borrow');
        });

        test('unlend with zero lends throws', () => {
            const rt = createResourceTable();
            const h = rt.add(1, 'val');
            expect(() => rt.unlend(1, h)).toThrow('no outstanding borrows');
        });

        test('remove succeeds after all lends unlent', () => {
            const rt = createResourceTable();
            const h = rt.add(1, 'val');
            rt.lend(1, h);
            rt.unlend(1, h);
            expect(rt.remove(1, h)).toBe('val');
        });
    });

    describe('resource leak detection', () => {
        test('after remove, handle is no longer in the table', () => {
            const rt = createResourceTable();
            const h = rt.add(1, 'val');
            rt.remove(1, h);
            expect(rt.has(1, h)).toBe(false);
            expect(() => rt.get(1, h)).toThrow('Invalid resource handle');
        });

        test('handles are never reused after remove', () => {
            const rt = createResourceTable();
            const seen = new Set<number>();
            for (let i = 0; i < 50; i++) {
                const h = rt.add(1, `val-${i}`);
                expect(seen.has(h)).toBe(false);
                seen.add(h);
                rt.remove(1, h);
            }
        });

        test('disposeOwned removes matching resources', () => {
            const rt = createResourceTable();
            const h1 = rt.add(1, 'a');
            const h2 = rt.add(2, 'b');
            const h3 = rt.add(1, 'c');
            rt.disposeOwned(new Set([1]));
            expect(rt.has(1, h1)).toBe(false);
            expect(rt.has(2, h2)).toBe(true);
            expect(rt.has(1, h3)).toBe(false);
        });

        test('disposeOwned with empty set is a no-op', () => {
            const rt = createResourceTable();
            const h = rt.add(1, 'val');
            rt.disposeOwned(new Set());
            expect(rt.has(1, h)).toBe(true);
        });
    });

    describe('edge cases', () => {
        test('lend on removed handle throws', () => {
            const rt = createResourceTable();
            const h = rt.add(1, 'val');
            rt.remove(1, h);
            expect(() => rt.lend(1, h)).toThrow('Invalid resource handle');
        });

        test('lendCount on non-existent handle throws', () => {
            const rt = createResourceTable();
            expect(() => rt.lendCount(1, 999)).toThrow('Invalid resource handle');
        });

        test('has returns false for wrong typeIdx even if handle exists', () => {
            const rt = createResourceTable();
            const h = rt.add(1, 'val');
            expect(rt.has(1, h)).toBe(true);
            expect(rt.has(2, h)).toBe(false);
        });
    });
});
