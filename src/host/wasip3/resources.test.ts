// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { createHandleTable } from './resources';
import type { HandleId } from './resources';

describe('HandleTable', () => {
    // ─── 1.1 Happy path ─────────────────────────────────────────────

    describe('happy path', () => {
        it('allocates a handle and retrieves the stored value', () => {
            const table = createHandleTable<string>();
            const h = table.alloc('hello');
            expect(table.get(h)).toBe('hello');
        });

        it('allocates multiple handles with unique integers', () => {
            const table = createHandleTable<number>();
            const handles = [table.alloc(10), table.alloc(20), table.alloc(30)];
            const unique = new Set(handles);
            expect(unique.size).toBe(3);
            expect(table.get(handles[0]!)).toBe(10);
            expect(table.get(handles[1]!)).toBe(20);
            expect(table.get(handles[2]!)).toBe(30);
        });

        it('drops a handle and the value is no longer retrievable', () => {
            const table = createHandleTable<string>();
            const h = table.alloc('gone');
            table.drop(h);
            expect(table.get(h)).toBeUndefined();
        });

        it('reuses dropped slots via free-list', () => {
            const table = createHandleTable<string>();
            const h1 = table.alloc('a');
            table.drop(h1);
            const h2 = table.alloc('b');
            // The dropped slot should be reused
            expect(h2).toBe(h1);
            expect(table.get(h2)).toBe('b');
        });

        it('allocates handles up to configured limit', () => {
            const table = createHandleTable<number>({ maxHandles: 5 });
            for (let i = 0; i < 5; i++) {
                table.alloc(i);
            }
            expect(table.size).toBe(5);
        });

        it('tracks size correctly across alloc/drop', () => {
            const table = createHandleTable<string>();
            expect(table.size).toBe(0);
            const h1 = table.alloc('a');
            const h2 = table.alloc('b');
            expect(table.size).toBe(2);
            table.drop(h1);
            expect(table.size).toBe(1);
            table.drop(h2);
            expect(table.size).toBe(0);
        });
    });

    // ─── 1.1 Error path ─────────────────────────────────────────────

    describe('error path', () => {
        it('get with a never-allocated handle returns undefined', () => {
            const table = createHandleTable<string>();
            expect(table.get(42)).toBeUndefined();
        });

        it('drop a handle that was never allocated throws', () => {
            const table = createHandleTable<string>();
            expect(() => table.drop(99)).toThrow();
        });

        it('double-drop throws use-after-drop error', () => {
            const table = createHandleTable<string>();
            const h = table.alloc('value');
            table.drop(h);
            expect(() => table.drop(h)).toThrow(/use-after-drop/);
        });
    });

    // ─── 1.1 Edge cases ─────────────────────────────────────────────

    describe('edge cases', () => {
        it('allocate, drop all, allocate again — handles reused from free-list', () => {
            const table = createHandleTable<number>();
            const h0 = table.alloc(0);
            const h1 = table.alloc(1);
            const h2 = table.alloc(2);
            table.drop(h2);
            table.drop(h1);
            table.drop(h0);
            // LIFO free-list: should get h0 first, then h1, then h2
            const r0 = table.alloc(100);
            const r1 = table.alloc(200);
            const r2 = table.alloc(300);
            expect(new Set([r0, r1, r2]).size).toBe(3);
            expect(table.get(r0)).toBe(100);
            expect(table.get(r1)).toBe(200);
            expect(table.get(r2)).toBe(300);
        });

        it('handle 0 is a valid handle (not confused with falsy)', () => {
            const table = createHandleTable<string>();
            const h = table.alloc('zero');
            // First allocated handle should be 0
            expect(h).toBe(0);
            expect(table.get(0)).toBe('zero');
        });

        it('concurrent allocations in the same microtask produce no duplicates', () => {
            const table = createHandleTable<number>();
            const handles: HandleId[] = [];
            for (let i = 0; i < 100; i++) {
                handles.push(table.alloc(i));
            }
            const unique = new Set(handles);
            expect(unique.size).toBe(100);
        });
    });

    // ─── 1.1 Invalid arguments ──────────────────────────────────────

    describe('invalid arguments', () => {
        it('allocating undefined is allowed (stores the value)', () => {
            const table = createHandleTable<undefined>();
            const h = table.alloc(undefined);
            // get should return undefined as the stored value, not "missing"
            // We can verify alloc/drop cycle works
            expect(table.size).toBe(1);
            table.drop(h);
            expect(table.size).toBe(0);
        });

        it('get with negative number returns undefined', () => {
            const table = createHandleTable<string>();
            table.alloc('a');
            expect(table.get(-1)).toBeUndefined();
        });

        it('get with NaN returns undefined', () => {
            const table = createHandleTable<string>();
            table.alloc('a');
            expect(table.get(NaN)).toBeUndefined();
        });

        it('get with Infinity returns undefined', () => {
            const table = createHandleTable<string>();
            table.alloc('a');
            expect(table.get(Infinity)).toBeUndefined();
        });

        it('get with string as handle returns undefined', () => {
            const table = createHandleTable<string>();
            table.alloc('a');
            expect(table.get('foo' as unknown as HandleId)).toBeUndefined();
        });

        it('get with object as handle returns undefined', () => {
            const table = createHandleTable<string>();
            table.alloc('a');
            expect(table.get({} as unknown as HandleId)).toBeUndefined();
        });

        it('get with floating-point number that looks valid returns undefined', () => {
            const table = createHandleTable<string>();
            table.alloc('a');
            // 0.5 is not an integer handle
            expect(table.get(0.5)).toBeUndefined();
        });

        it('get with 1.0 (integer-valued float) returns the value', () => {
            const table = createHandleTable<string>();
            table.alloc('first'); // handle 0
            table.alloc('second'); // handle 1
            // 1.0 === 1 in JS, so (1.0 | 0) === 1
            expect(table.get(1.0)).toBe('second');
        });
    });

    // ─── 1.1 Evil arguments ─────────────────────────────────────────

    describe('evil arguments', () => {
        it('handles from one table do not work in another', () => {
            const table1 = createHandleTable<string>();
            const table2 = createHandleTable<string>();
            const h1 = table1.alloc('table1-value');
            // table2 has no handle at h1's index
            expect(table2.get(h1)).toBeUndefined();
        });

        it('Number.MAX_SAFE_INTEGER as handle does not cause out-of-bounds', () => {
            const table = createHandleTable<string>();
            table.alloc('a');
            expect(table.get(Number.MAX_SAFE_INTEGER)).toBeUndefined();
        });

        it('__proto__ as handle does not pollute prototype', () => {
            const table = createHandleTable<string>();
            table.alloc('a');
            // Passing __proto__ as a handle (coerced to NaN) should return undefined
            expect(table.get('__proto__' as unknown as HandleId)).toBeUndefined();
        });

        it('constructor as handle does not pollute prototype', () => {
            const table = createHandleTable<string>();
            table.alloc('a');
            expect(table.get('constructor' as unknown as HandleId)).toBeUndefined();
        });

        it('toString as handle does not pollute prototype', () => {
            const table = createHandleTable<string>();
            table.alloc('a');
            expect(table.get('toString' as unknown as HandleId)).toBeUndefined();
        });

        it('__proto__ as stored value does not pollute prototype', () => {
            const table = createHandleTable<unknown>();
            const h = table.alloc('__proto__');
            expect(table.get(h)).toBe('__proto__');
            table.drop(h);
        });

        it('rapid alloc/drop cycle respects max limit', () => {
            const table = createHandleTable<number>({ maxHandles: 10 });
            // Fill to capacity
            const handles: HandleId[] = [];
            for (let i = 0; i < 10; i++) {
                handles.push(table.alloc(i));
            }
            // Should throw at capacity
            expect(() => table.alloc(99)).toThrow(/maximum handle limit/);
            // Drop one, should allow one more
            table.drop(handles[0]!);
            expect(() => table.alloc(100)).not.toThrow();
            // Full again
            expect(() => table.alloc(101)).toThrow(/maximum handle limit/);
        });

        it('rapid alloc/drop loop does not break free-list integrity', () => {
            const table = createHandleTable<number>({ maxHandles: 100 });
            for (let i = 0; i < 1000; i++) {
                const h = table.alloc(i);
                expect(table.get(h)).toBe(i);
                table.drop(h);
            }
            expect(table.size).toBe(0);
        });

        it('descriptor handle used as socket handle must fail (per-type-table isolation)', () => {
            const descriptorTable = createHandleTable<{ kind: string; path: string }>();
            const socketTable = createHandleTable<{ kind: string; fd: number }>();
            const descHandle = descriptorTable.alloc({ kind: 'descriptor', path: '/tmp' });
            // Passing the descriptor handle to the socket table should not find a valid socket
            expect(socketTable.get(descHandle)).toBeUndefined();
        });

        it('drop then reuse handle does not leak old value', () => {
            const table = createHandleTable<string>();
            const h1 = table.alloc('old-resource');
            table.drop(h1);
            const h2 = table.alloc('new-resource');
            // h2 should reuse h1's slot
            expect(h2).toBe(h1);
            expect(table.get(h2)).toBe('new-resource');
            // Old references to h1 now see "new-resource" — this is expected
            // since handles are just integers. The type system prevents misuse.
        });
    });
});
