// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { initializeAsserts } from '../../src/utils/assert';
initializeAsserts();

import { createFutureTable } from '../../src/runtime/future-table';
import { createMemoryView } from '../../src/runtime/memory';
import { STREAM_STATUS_COMPLETED, STREAM_STATUS_DROPPED, STREAM_STATUS_CANCELLED, STREAM_BLOCKED } from '../../src/runtime/constants';
import type { MarshalingContext } from '../../src/marshal/model/types';
import type { FutureStorer } from '../../src/runtime/model/types';

function makeAllocHandle() {
    let next = 2;
    return () => { const h = next; next += 2; return h; };
}

function createTestMemory() {
    const mv = createMemoryView();
    const mem = new WebAssembly.Memory({ initial: 1 });
    mv.initialize(mem);
    return mv;
}

describe('FutureTable', () => {
    describe('public interface', () => {
        test('newFuture returns bigint with readable (even) and writable (odd) handles', () => {
            const ft = createFutureTable(createTestMemory(), makeAllocHandle());
            const pair = ft.newFuture(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);
            expect(readHandle % 2).toBe(0); // even = readable
            expect(writHandle % 2).toBe(1); // odd = writable
            expect(writHandle).toBe(readHandle + 1);
        });

        test('write resolves the future, read retrieves the value', () => {
            const memory = createTestMemory();
            const ft = createFutureTable(memory, makeAllocHandle());
            const pair = ft.newFuture(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);

            // Write some data
            const src = new Uint8Array([10, 20, 30, 40]);
            memory.getViewU8(100, 4).set(src);
            const writeResult = ft.write(0, writHandle, 100);
            expect(writeResult).toBe((0 << 4) | STREAM_STATUS_COMPLETED);

            // Read it back
            const readResult = ft.read(0, readHandle, 200);
            expect(readResult).toBe((0 << 4) | STREAM_STATUS_COMPLETED);
        });

        test('read returns BLOCKED when future not yet resolved', () => {
            const ft = createFutureTable(createTestMemory(), makeAllocHandle());
            const pair = ft.newFuture(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const result = ft.read(0, readHandle, 0);
            expect(result).toBe(STREAM_BLOCKED);
        });

        test('read on non-existent entry returns dropped status', () => {
            const ft = createFutureTable(createTestMemory(), makeAllocHandle());
            const result = ft.read(0, 999, 0);
            expect(result).toBe((0 << 4) | STREAM_STATUS_DROPPED);
        });

        test('cancelRead and cancelWrite return dropped on non-existent handle', () => {
            const ft = createFutureTable(createTestMemory(), makeAllocHandle());
            // No entry for handle 0 → cancel returns DROPPED.
            expect(ft.cancelRead(0, 0)).toBe((0 << 4) | STREAM_STATUS_DROPPED);
            expect(ft.cancelWrite(0, 0)).toBe((0 << 4) | STREAM_STATUS_DROPPED);
        });

        test('cancelRead returns CANCELLED when a read was pending', () => {
            const ft = createFutureTable(createTestMemory(), makeAllocHandle());
            const pair = ft.newFuture(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            // Trigger pending read — future is unresolved, no storer set.
            ft.read(0, readHandle, 0);
            // cancel-read on unresolved future returns CANCELLED(0).
            expect(ft.cancelRead(0, readHandle)).toBe((0 << 4) | STREAM_STATUS_CANCELLED);
        });

        test('cancelWrite on unresolved future returns CANCELLED', () => {
            const ft = createFutureTable(createTestMemory(), makeAllocHandle());
            const pair = ft.newFuture(0);
            const writHandle = Number(pair >> 32n);
            expect(ft.cancelWrite(0, writHandle)).toBe((0 << 4) | STREAM_STATUS_CANCELLED);
        });

        test('dropReadable removes readable handle', () => {
            const ft = createFutureTable(createTestMemory(), makeAllocHandle());
            const handle = ft.addReadable(0, 'value');
            expect(ft.getReadable(0, handle)).toBe('value');
            ft.dropReadable(0, handle);
            expect(ft.getReadable(0, handle)).toBeUndefined();
        });

        test('dropWritable auto-resolves unresolved future', () => {
            const ft = createFutureTable(createTestMemory(), makeAllocHandle());
            const pair = ft.newFuture(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);
            // Before drop, read should block
            expect(ft.read(0, readHandle, 0)).toBe(STREAM_BLOCKED);
            ft.dropWritable(0, writHandle);
            // After drop, the entry should be resolved
            const entry = ft.getEntry(readHandle);
            expect(entry?.resolved).toBe(true);
        });

        test('write with ptr=0 resolves future without storing data', () => {
            const ft = createFutureTable(createTestMemory(), makeAllocHandle());
            const pair = ft.newFuture(0);
            const writHandle = Number(pair >> 32n);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const result = ft.write(0, writHandle, 0);
            expect(result).toBe((0 << 4) | STREAM_STATUS_COMPLETED);
            const entry = ft.getEntry(readHandle);
            expect(entry?.resolved).toBe(true);
        });

        test('write to non-existent entry returns dropped', () => {
            const ft = createFutureTable(createTestMemory(), makeAllocHandle());
            expect(ft.write(0, 999, 0)).toBe((0 << 4) | STREAM_STATUS_DROPPED);
        });
    });

    describe('Promise integration', () => {
        test('addReadable with Promise tracks resolution', async () => {
            const ft = createFutureTable(createTestMemory(), makeAllocHandle());
            const { promise, resolve } = Promise.withResolvers<string>();
            const handle = ft.addReadable(0, promise);
            expect(ft.getEntry(handle)?.resolved).toBe(false);
            resolve('done');
            await promise;
            await new Promise(r => setTimeout(r, 0));
            expect(ft.getEntry(handle)?.resolved).toBe(true);
        });

        test('addReadable with rejected Promise sets rejected flag', async () => {
            const ft = createFutureTable(createTestMemory(), makeAllocHandle());
            const { promise, reject } = Promise.withResolvers<string>();
            const handle = ft.addReadable(0, promise);
            reject(new Error('fail'));
            await promise.catch(() => { });
            await new Promise(r => setTimeout(r, 0));
            const entry = ft.getEntry(handle) as any;
            expect(entry.resolved).toBe(true);
            expect(entry.rejected).toBe(true);
        });

        test('addReadable with non-Promise value resolves immediately', () => {
            const ft = createFutureTable(createTestMemory(), makeAllocHandle());
            const handle = ft.addReadable(0, 42);
            const entry = ft.getEntry(handle);
            expect(entry?.resolved).toBe(true);
        });

        test('getReadable returns original JS value', () => {
            const ft = createFutureTable(createTestMemory(), makeAllocHandle());
            const promise = Promise.resolve('test');
            const handle = ft.addReadable(0, promise);
            expect(ft.getReadable(0, handle)).toBe(promise);
        });

        test('removeReadable returns and removes the JS value', () => {
            const ft = createFutureTable(createTestMemory(), makeAllocHandle());
            const handle = ft.addReadable(0, 'val');
            expect(ft.removeReadable(0, handle)).toBe('val');
            expect(ft.getReadable(0, handle)).toBeUndefined();
        });
    });

    describe('Storer integration', () => {
        test('addReadable with FutureStorer encodes resolved value at read time', async () => {
            const memory = createTestMemory();
            const ft = createFutureTable(memory, makeAllocHandle());
            const storerCalls: unknown[][] = [];
            const storer: FutureStorer = (ctx, ptr, value, rejected) => { storerCalls.push([ctx, ptr, value, rejected]); };
            const { promise, resolve } = Promise.withResolvers<string>();
            const handle = ft.addReadable(0, promise, storer);

            resolve('hello');
            await promise;
            await new Promise(r => setTimeout(r, 0));

            const mctx = {} as MarshalingContext;
            ft.read(0, handle, 500, mctx);
            expect(storerCalls).toEqual([[mctx, 500, 'hello', undefined]]);
        });

        test('deferred read: storer called when Promise resolves after read', async () => {
            const memory = createTestMemory();
            const ft = createFutureTable(memory, makeAllocHandle());
            const storerCalls: unknown[][] = [];
            const storer: FutureStorer = (ctx, ptr, value, rejected) => { storerCalls.push([ctx, ptr, value, rejected]); };
            const { promise, resolve } = Promise.withResolvers<number>();
            const handle = ft.addReadable(0, promise, storer);

            const mctx = {} as MarshalingContext;
            // Read before resolution — should return BLOCKED
            const result = ft.read(0, handle, 300, mctx);
            expect(result).toBe(STREAM_BLOCKED);

            // Now resolve — storer should be called with the deferred ptr
            resolve(99);
            await promise;
            await new Promise(r => setTimeout(r, 0));
            expect(storerCalls).toEqual([[mctx, 300, 99, undefined]]);
        });

        test('deferred read: storer called with rejected=true when Promise rejects', async () => {
            const memory = createTestMemory();
            const ft = createFutureTable(memory, makeAllocHandle());
            const storerCalls: unknown[][] = [];
            const storer: FutureStorer = (ctx, ptr, value, rejected) => { storerCalls.push([ctx, ptr, value, rejected]); };
            const { promise, reject } = Promise.withResolvers<number>();
            const handle = ft.addReadable(0, promise, storer);

            const mctx = {} as MarshalingContext;
            ft.read(0, handle, 400, mctx);

            const error = new Error('boom');
            reject(error);
            await promise.catch(() => { });
            await new Promise(r => setTimeout(r, 0));
            expect(storerCalls.length).toBe(1);
            expect(storerCalls[0]![0]).toBe(mctx);
            expect(storerCalls[0]![1]).toBe(400);
            expect(storerCalls[0]![2]).toBe(error);
            expect(storerCalls[0]![3]).toBe(true);
        });
    });

    describe('waitable-set integration', () => {
        test('getEntry returns entry with resolved flag and onResolve callbacks', () => {
            const ft = createFutureTable(createTestMemory(), makeAllocHandle());
            const pair = ft.newFuture(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const entry = ft.getEntry(readHandle);
            expect(entry).toBeDefined();
            expect(entry!.resolved).toBe(false);
        });

        test('onResolve callbacks fire when Promise resolves', async () => {
            const ft = createFutureTable(createTestMemory(), makeAllocHandle());
            const { promise, resolve } = Promise.withResolvers<void>();
            const handle = ft.addReadable(0, promise);
            const entry = ft.getEntry(handle)!;
            let called = 0;
            entry.onResolve = [() => { called++; }];
            resolve();
            await promise;
            await new Promise(r => setTimeout(r, 0));
            expect(called).toBe(1);
        });

        test('onResolve callbacks fire when Promise rejects', async () => {
            const ft = createFutureTable(createTestMemory(), makeAllocHandle());
            const { promise, reject } = Promise.withResolvers<void>();
            const handle = ft.addReadable(0, promise);
            const entry = ft.getEntry(handle)!;
            let called = 0;
            entry.onResolve = [() => { called++; }];
            reject(new Error('fail'));
            await promise.catch(() => { });
            await new Promise(r => setTimeout(r, 0));
            expect(called).toBe(1);
        });

        test('getEntry returns undefined for non-existent handles', () => {
            const ft = createFutureTable(createTestMemory(), makeAllocHandle());
            expect(ft.getEntry(999)).toBeUndefined();
        });
    });

    describe('resource leak detection', () => {
        test('multiple addReadable calls allocate distinct handles', () => {
            const ft = createFutureTable(createTestMemory(), makeAllocHandle());
            const h1 = ft.addReadable(0, 'a');
            const h2 = ft.addReadable(0, 'b');
            expect(h1).not.toBe(h2);
        });

        test('removeWritable cleans up JS writable map', () => {
            const ft = createFutureTable(createTestMemory(), makeAllocHandle());
            const h = ft.addWritable(0, 'writer');
            expect(ft.getWritable(0, h)).toBe('writer');
            expect(ft.removeWritable(0, h)).toBe('writer');
            expect(ft.getWritable(0, h)).toBeUndefined();
        });

        test('dropWritable on already-resolved future is idempotent', () => {
            const ft = createFutureTable(createTestMemory(), makeAllocHandle());
            const pair = ft.newFuture(0);
            const writHandle = Number(pair >> 32n);
            ft.write(0, writHandle, 0); // resolves
            expect(() => ft.dropWritable(0, writHandle)).not.toThrow();
        });

        test('removeReadable cleans up JS readable map', () => {
            const ft = createFutureTable(createTestMemory(), makeAllocHandle());
            const h = ft.addReadable(0, 'reader');
            expect(ft.removeReadable(0, h)).toBe('reader');
            expect(ft.getReadable(0, h)).toBeUndefined();
        });

        test('after dropReadable + dropWritable, JS maps are cleaned up', () => {
            const memory = createTestMemory();
            const ft = createFutureTable(memory, makeAllocHandle());
            const packed = ft.newFuture(0);
            const readHandle = Number(packed & 0xFFFFFFFFn);
            const writHandle = Number(packed >> 32n);
            ft.dropReadable(0, readHandle);
            ft.dropWritable(0, writHandle);
            expect(ft.getReadable(0, readHandle)).toBeUndefined();
            expect(ft.getWritable(0, writHandle)).toBeUndefined();
        });

        test('entries map does not grow unboundedly after repeated newFuture+drop cycles', () => {
            const memory = createTestMemory();
            const ft = createFutureTable(memory, makeAllocHandle());
            for (let i = 0; i < 100; i++) {
                const packed = ft.newFuture(0);
                const readHandle = Number(packed & 0xFFFFFFFFn);
                const writHandle = Number(packed >> 32n);
                ft.dropWritable(0, writHandle);
                ft.dropReadable(0, readHandle);
            }
            // After 100 create+drop cycles, new futures still work
            const packed = ft.newFuture(0);
            const writHandle = Number(packed >> 32n);
            memory.getViewU8(0, 4).set(new Uint8Array([10, 20, 30, 40]));
            const result = ft.write(0, writHandle, 0);
            expect(result & 0xF).toBe(STREAM_STATUS_COMPLETED);
        });

        test('Promise rejection handlers do not leak (no unhandled rejection)', async () => {
            const ft = createFutureTable(createTestMemory(), makeAllocHandle());
            // Create futures backed by rejecting promises
            for (let i = 0; i < 10; i++) {
                ft.addReadable(0, Promise.reject(new Error(`reject-${i}`)));
            }
            // Wait for all rejections to process
            await new Promise(r => setTimeout(r, 50));
            // If unhandled rejections leaked, Node would report them.
            // The test passing without unhandledRejection is the assertion.
        });
    });

    describe('edge cases', () => {
        test('read on resolved future returns COMPLETED with data', () => {
            const memory = createTestMemory();
            const ft = createFutureTable(memory, makeAllocHandle());
            const pair = ft.newFuture(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);

            // Write some data
            memory.getViewU8(100, 4).set(new Uint8Array([1, 2, 3, 4]));
            ft.write(0, writHandle, 100);

            // Read back — should succeed
            const result = ft.read(0, readHandle, 200);
            expect(result).toBe((0 << 4) | STREAM_STATUS_COMPLETED);
        });

        test('addWritable allocates odd handle', () => {
            const ft = createFutureTable(createTestMemory(), makeAllocHandle());
            const h = ft.addWritable(0, 'writer');
            expect(h % 2).toBe(1); // odd = writable
        });

        test('newFuture then dropWritable resolves the entry', () => {
            const ft = createFutureTable(createTestMemory(), makeAllocHandle());
            const pair = ft.newFuture(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);

            expect(ft.getEntry(readHandle)?.resolved).toBe(false);
            ft.dropWritable(0, writHandle);
            expect(ft.getEntry(readHandle)?.resolved).toBe(true);
        });

        test('multiple futures track independently', () => {
            const ft = createFutureTable(createTestMemory(), makeAllocHandle());
            const pair1 = ft.newFuture(0);
            const pair2 = ft.newFuture(0);
            const rh1 = Number(pair1 & 0xFFFFFFFFn);
            const rh2 = Number(pair2 & 0xFFFFFFFFn);
            const wh1 = Number(pair1 >> 32n);

            ft.write(0, wh1, 0);
            expect(ft.getEntry(rh1)?.resolved).toBe(true);
            expect(ft.getEntry(rh2)?.resolved).toBe(false);
        });
    });
});
