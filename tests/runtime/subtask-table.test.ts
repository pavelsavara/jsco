// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { initializeAsserts } from '../../src/utils/assert';
initializeAsserts();

import { createSubtaskTable } from '../../src/runtime/subtask-table';
import { SubtaskState } from '../../src/runtime/model/types';

function makeAllocHandle() {
    let next = 2;
    return () => { const h = next; next += 2; return h; };
}

describe('SubtaskTable', () => {
    describe('public interface', () => {
        test('create from pending Promise returns handle in STARTED state', () => {
            const table = createSubtaskTable(makeAllocHandle());
            const { promise } = Promise.withResolvers<void>();
            const handle = table.create(promise);
            expect(handle).toBeGreaterThan(0);
            const entry = table.getEntry(handle);
            expect(entry).toBeDefined();
            expect(entry!.state).toBe(SubtaskState.STARTED);
            expect(entry!.resolved).toBe(false);
        });

        test('getEntry returns undefined after drop', () => {
            const table = createSubtaskTable(makeAllocHandle());
            const { promise } = Promise.withResolvers<void>();
            const handle = table.create(promise);
            expect(table.getEntry(handle)).toBeDefined();
            table.drop(handle);
            expect(table.getEntry(handle)).toBeUndefined();
        });

        test('drop on non-existent handle is a no-op', () => {
            const table = createSubtaskTable(makeAllocHandle());
            expect(() => table.drop(999)).not.toThrow();
        });
    });

    describe('Promise tracking', () => {
        test('Promise resolution transitions to RETURNED', async () => {
            const table = createSubtaskTable(makeAllocHandle());
            const { promise, resolve } = Promise.withResolvers<void>();
            const handle = table.create(promise);
            resolve();
            await promise;
            await new Promise(r => setTimeout(r, 0));
            const entry = table.getEntry(handle);
            expect(entry!.state).toBe(SubtaskState.RETURNED);
            expect(entry!.resolved).toBe(true);
        });

        test('Promise rejection also transitions to RETURNED', async () => {
            const table = createSubtaskTable(makeAllocHandle());
            const { promise, reject } = Promise.withResolvers<void>();
            const handle = table.create(promise);
            reject(new Error('test'));
            await promise.catch(() => { });
            await new Promise(r => setTimeout(r, 0));
            const entry = table.getEntry(handle);
            expect(entry!.state).toBe(SubtaskState.RETURNED);
            expect(entry!.resolved).toBe(true);
        });

        test('onResolve callbacks fire on resolution', async () => {
            const table = createSubtaskTable(makeAllocHandle());
            const { promise, resolve } = Promise.withResolvers<void>();
            const handle = table.create(promise);
            const entry = table.getEntry(handle)!;
            let called = 0;
            entry.onResolve = [() => { called++; }];
            resolve();
            await promise;
            await new Promise(r => setTimeout(r, 0));
            expect(called).toBe(1);
        });

        test('onResolve callbacks fire on rejection', async () => {
            const table = createSubtaskTable(makeAllocHandle());
            const { promise, reject } = Promise.withResolvers<void>();
            const handle = table.create(promise);
            const entry = table.getEntry(handle)!;
            let called = 0;
            entry.onResolve = [() => { called++; }];
            reject(new Error('test'));
            await promise.catch(() => { });
            await new Promise(r => setTimeout(r, 0));
            expect(called).toBe(1);
        });
    });

    describe('resource leak detection', () => {
        test('after drop, entry is removed from internal map', () => {
            const table = createSubtaskTable(makeAllocHandle());
            const { promise } = Promise.withResolvers<void>();
            const handle = table.create(promise);
            table.drop(handle);
            expect(table.getEntry(handle)).toBeUndefined();
        });

        test('multiple subtasks track independently', async () => {
            const table = createSubtaskTable(makeAllocHandle());
            const { promise: p1, resolve: r1 } = Promise.withResolvers<void>();
            const { promise: p2 } = Promise.withResolvers<void>();
            const h1 = table.create(p1);
            const h2 = table.create(p2);
            expect(h1).not.toBe(h2);
            r1();
            await p1;
            await new Promise(r => setTimeout(r, 0));
            expect(table.getEntry(h1)!.state).toBe(SubtaskState.RETURNED);
            expect(table.getEntry(h2)!.state).toBe(SubtaskState.STARTED);
        });

        test('handles are unique across rapid create/drop cycles', () => {
            const table = createSubtaskTable(makeAllocHandle());
            const handles = new Set<number>();
            for (let i = 0; i < 100; i++) {
                const h = table.create(Promise.resolve());
                expect(handles.has(h)).toBe(false);
                handles.add(h);
                table.drop(h);
            }
        });

        test('entries map does not grow after repeated create+drop cycles', () => {
            const table = createSubtaskTable(makeAllocHandle());
            for (let i = 0; i < 100; i++) {
                const h = table.create(Promise.resolve());
                table.drop(h);
                expect(table.getEntry(h)).toBeUndefined();
            }
            // After 100 create+drop cycles, new subtasks still work
            const h = table.create(new Promise(() => { }));
            const entry = table.getEntry(h);
            expect(entry).toBeDefined();
            expect(entry!.state).toBe(SubtaskState.STARTED);
        });
    });

    describe('edge cases', () => {
        test('create from already-resolved Promise eventually transitions to RETURNED', async () => {
            const table = createSubtaskTable(makeAllocHandle());
            const handle = table.create(Promise.resolve());
            // Initially may still be STARTED (microtask not yet run)
            await new Promise(r => setTimeout(r, 10));
            const entry = table.getEntry(handle);
            expect(entry!.state).toBe(SubtaskState.RETURNED);
            expect(entry!.resolved).toBe(true);
        });

        test('drop while Promise is still pending does not crash when Promise later resolves', async () => {
            const table = createSubtaskTable(makeAllocHandle());
            const { promise, resolve } = Promise.withResolvers<void>();
            const handle = table.create(promise);
            table.drop(handle);
            // Resolve after drop — should not crash
            resolve();
            await promise;
            await new Promise(r => setTimeout(r, 10));
            expect(table.getEntry(handle)).toBeUndefined();
        });

        test('handles use even allocation (from shared allocHandle)', () => {
            const table = createSubtaskTable(makeAllocHandle());
            const h = table.create(Promise.resolve());
            expect(h % 2).toBe(0);
        });
    });
});
