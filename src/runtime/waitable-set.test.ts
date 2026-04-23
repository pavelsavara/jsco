// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { initializeAsserts } from '../utils/assert';
initializeAsserts();

import { createWaitableSetTable } from './waitable-set';
import { createStreamTable } from './stream-table';
import { createFutureTable } from './future-table';
import { createSubtaskTable } from './subtask-table';
import { createMemoryView } from './memory';
import { SubtaskState } from './model/types';
import { EVENT_SUBTASK, EVENT_STREAM_READ, EVENT_FUTURE_READ, EVENT_STREAM_WRITE, EVENT_FUTURE_WRITE } from './constants';

function makeAllocHandle() {
    let next = 2;
    return () => { const h = next; next += 2; return h; };
}

function createTestEnv() {
    const memory = createMemoryView();
    const mem = new WebAssembly.Memory({ initial: 1 });
    memory.initialize(mem);
    const alloc = makeAllocHandle();
    const streamTable = createStreamTable(memory, alloc);
    const futureTable = createFutureTable(memory, alloc);
    const subtaskTable = createSubtaskTable(alloc);
    const waitableSet = createWaitableSetTable(memory, streamTable, futureTable, subtaskTable);
    return { memory, streamTable, futureTable, subtaskTable, waitableSet };
}

describe('WaitableSetTable', () => {
    describe('public interface', () => {
        test('newSet returns non-zero set ID', () => {
            const { waitableSet } = createTestEnv();
            const id = waitableSet.newSet();
            expect(id).toBeGreaterThan(0);
        });

        test('newSet returns unique IDs', () => {
            const { waitableSet } = createTestEnv();
            const id1 = waitableSet.newSet();
            const id2 = waitableSet.newSet();
            expect(id1).not.toBe(id2);
        });

        test('join adds a waitable handle to a set', () => {
            const { waitableSet, subtaskTable } = createTestEnv();
            const setId = waitableSet.newSet();
            const { promise, resolve } = Promise.withResolvers<void>();
            const handle = subtaskTable.create(promise);
            waitableSet.join(handle, setId);
            // Should not throw
            resolve();
        });

        test('join with setId=0 disjoins handle from all sets', () => {
            const { waitableSet, subtaskTable } = createTestEnv();
            const setId = waitableSet.newSet();
            const handle = subtaskTable.create(Promise.resolve());
            waitableSet.join(handle, setId);
            waitableSet.join(handle, 0); // disjoin
            // After disjoin, poll should not find this handle
            const result = waitableSet.poll(setId, 100);
            expect(result).toBe(0);
        });

        test('drop removes set and all its pending waitables', () => {
            const { waitableSet, subtaskTable } = createTestEnv();
            const setId = waitableSet.newSet();
            const handle = subtaskTable.create(Promise.resolve());
            waitableSet.join(handle, setId);
            waitableSet.drop(setId);
            // After drop, poll should return 0
            expect(waitableSet.poll(setId, 100)).toBe(0);
        });

        test('poll returns 0 when no events ready', () => {
            const { waitableSet, subtaskTable } = createTestEnv();
            const setId = waitableSet.newSet();
            const handle = subtaskTable.create(new Promise(() => { })); // never resolves
            waitableSet.join(handle, setId);
            expect(waitableSet.poll(setId, 100)).toBe(0);
        });

        test('poll returns event count and writes events to memory when ready', async () => {
            const { waitableSet, subtaskTable, memory } = createTestEnv();
            const setId = waitableSet.newSet();
            const { promise, resolve } = Promise.withResolvers<void>();
            const handle = subtaskTable.create(promise);
            waitableSet.join(handle, setId);

            resolve();
            await promise;
            await new Promise(r => setTimeout(r, 0));

            const count = waitableSet.poll(setId, 200);
            expect(count).toBe(1);
            // Read event: 12 bytes at ptr 200
            const view = memory.getView(200, 12);
            const eventCode = view.getInt32(0, true);
            const eventHandle = view.getInt32(4, true);
            const returnCode = view.getInt32(8, true);
            expect(eventCode).toBe(EVENT_SUBTASK);
            expect(eventHandle).toBe(handle);
            expect(returnCode).toBe(SubtaskState.RETURNED);
        });
    });

    describe('blocking wait', () => {
        test('wait returns synchronously when events are already ready', async () => {
            const { waitableSet, subtaskTable } = createTestEnv();
            const setId = waitableSet.newSet();
            const { promise, resolve } = Promise.withResolvers<void>();
            const handle = subtaskTable.create(promise);
            resolve();
            await promise;
            await new Promise(r => setTimeout(r, 0));

            waitableSet.join(handle, setId);
            const result = waitableSet.wait(setId, 300);
            // Should return synchronously (not a Promise)
            expect(typeof result).toBe('number');
            expect(result).toBe(1);
        });

        test('wait returns a Promise when no events ready', () => {
            const { waitableSet, subtaskTable } = createTestEnv();
            const setId = waitableSet.newSet();
            const handle = subtaskTable.create(new Promise(() => { }));
            waitableSet.join(handle, setId);

            const result = waitableSet.wait(setId, 400);
            expect(result).toBeInstanceOf(Promise);
        });

        test('Promise resolves when a joined waitable becomes ready', async () => {
            const { waitableSet, subtaskTable } = createTestEnv();
            const setId = waitableSet.newSet();
            const { promise, resolve } = Promise.withResolvers<void>();
            const handle = subtaskTable.create(promise);
            waitableSet.join(handle, setId);

            const waitPromise = waitableSet.wait(setId, 500);
            expect(waitPromise).toBeInstanceOf(Promise);

            resolve();
            await promise;
            const count = await waitPromise;
            expect(count).toBeGreaterThan(0);
        });
    });

    describe('event types', () => {
        test('subtask handle produces EVENT_SUBTASK', async () => {
            const { waitableSet, subtaskTable, memory } = createTestEnv();
            const setId = waitableSet.newSet();
            const { promise, resolve } = Promise.withResolvers<void>();
            const handle = subtaskTable.create(promise);
            waitableSet.join(handle, setId);
            resolve();
            await promise;
            await new Promise(r => setTimeout(r, 0));

            waitableSet.poll(setId, 600);
            const eventCode = memory.getView(600, 4).getInt32(0, true);
            expect(eventCode).toBe(EVENT_SUBTASK);
        });

        test('future readable handle produces EVENT_FUTURE_READ', async () => {
            const { waitableSet, futureTable, memory } = createTestEnv();
            const setId = waitableSet.newSet();
            const { promise, resolve } = Promise.withResolvers<string>();
            const handle = futureTable.addReadable(0, promise);
            waitableSet.join(handle, setId);
            resolve('done');
            await promise;
            await new Promise(r => setTimeout(r, 0));

            const count = waitableSet.poll(setId, 700);
            expect(count).toBe(1);
            const eventCode = memory.getView(700, 4).getInt32(0, true);
            expect(eventCode).toBe(EVENT_FUTURE_READ);
        });

        test('stream readable handle produces EVENT_STREAM_READ', async () => {
            const { waitableSet, streamTable, memory } = createTestEnv();
            const setId = waitableSet.newSet();

            // Use async iterable so pumpIterable triggers signalReady → onReady
            const { promise, resolve } = Promise.withResolvers<Uint8Array>();
            async function* gen() { yield await promise; }
            const readHandle = streamTable.addReadable(0, gen());

            waitableSet.join(readHandle, setId);

            // Resolve the iterable to pump data and trigger readiness
            resolve(new Uint8Array([42]));
            await new Promise(r => setTimeout(r, 50));

            const count = waitableSet.poll(setId, 800);
            expect(count).toBe(1);
            const eventCode = memory.getView(800, 4).getInt32(0, true);
            expect(eventCode).toBe(EVENT_STREAM_READ);
        });
    });

    describe('event delivery format', () => {
        test('events written as 12-byte records little-endian', async () => {
            const { waitableSet, subtaskTable, memory } = createTestEnv();
            const setId = waitableSet.newSet();
            const { promise, resolve } = Promise.withResolvers<void>();
            const handle = subtaskTable.create(promise);
            waitableSet.join(handle, setId);
            resolve();
            await promise;
            await new Promise(r => setTimeout(r, 0));

            waitableSet.poll(setId, 900);
            const view = memory.getView(900, 12);
            // eventCode: i32 at offset 0
            // handle: i32 at offset 4
            // returnCode: i32 at offset 8
            expect(view.getInt32(0, true)).toBe(EVENT_SUBTASK);
            expect(view.getInt32(4, true)).toBe(handle);
            expect(view.getInt32(8, true)).toBe(SubtaskState.RETURNED);
        });
    });

    describe('resource leak detection', () => {
        test('after drop, pending waitables are cleaned up', () => {
            const { waitableSet, subtaskTable } = createTestEnv();
            const setId = waitableSet.newSet();
            const handle = subtaskTable.create(Promise.resolve());
            waitableSet.join(handle, setId);
            waitableSet.drop(setId);
            // Should not affect future sets
            const setId2 = waitableSet.newSet();
            expect(waitableSet.poll(setId2, 100)).toBe(0);
        });

        test('join(handle, 0) disjoins and cleans up pending waitable', () => {
            const { waitableSet, subtaskTable } = createTestEnv();
            const setId = waitableSet.newSet();
            const handle = subtaskTable.create(Promise.resolve());
            waitableSet.join(handle, setId);
            waitableSet.join(handle, 0);
            // No events should fire even after resolution
            expect(waitableSet.poll(setId, 100)).toBe(0);
        });
    });

    describe('edge cases', () => {
        test('wait/poll on non-existent set returns 0', () => {
            const { waitableSet } = createTestEnv();
            expect(waitableSet.poll(9999, 100)).toBe(0);
            expect(waitableSet.wait(9999, 100)).toBe(0);
        });

        test('join on non-existent set is a no-op', () => {
            const { waitableSet, subtaskTable } = createTestEnv();
            const handle = subtaskTable.create(Promise.resolve());
            expect(() => waitableSet.join(handle, 9999)).not.toThrow();
        });

        test('handle already joined is not duplicated', async () => {
            const { waitableSet, subtaskTable } = createTestEnv();
            const setId = waitableSet.newSet();
            const { promise, resolve } = Promise.withResolvers<void>();
            const handle = subtaskTable.create(promise);
            waitableSet.join(handle, setId);
            waitableSet.join(handle, setId); // duplicate join
            resolve();
            await promise;
            await new Promise(r => setTimeout(r, 0));

            const count = waitableSet.poll(setId, 100);
            // Should only get 1 event, not 2
            expect(count).toBe(1);
        });
    });

    describe('writable handle events', () => {
        test('stream writable handle produces EVENT_STREAM_WRITE', async () => {
            const memory = createMemoryView();
            const mem = new WebAssembly.Memory({ initial: 1 });
            memory.initialize(mem);
            const alloc = makeAllocHandle();
            // Use small backpressure threshold so we can fill and drain easily
            const streamTable = createStreamTable(memory, alloc, { streamBackpressureBytes: 16 });
            const futureTable = createFutureTable(memory, alloc);
            const subtaskTable = createSubtaskTable(alloc);
            const waitableSet = createWaitableSetTable(memory, streamTable, futureTable, subtaskTable);

            const packed = streamTable.newStream(0);
            const readHandle = Number(packed & 0xFFFFFFFFn);
            const writHandle = Number(packed >> 32n);

            // Fill buffer past backpressure threshold
            const data = new Uint8Array(20);
            // Write data into WASM memory first
            memory.getViewU8(0, 20).set(data);
            streamTable.write(0, writHandle, 0, 20);

            // Now join the writable handle — buffer is full, so onWriteReady is wired
            const setId = waitableSet.newSet();
            waitableSet.join(writHandle, setId);
            expect(waitableSet.poll(setId, 600)).toBe(0); // not ready yet

            // Read from the stream to drain buffer → triggers checkWriteReady
            streamTable.read(0, readHandle, 100, 20);

            // Now poll — should have EVENT_STREAM_WRITE
            const count = waitableSet.poll(setId, 700);
            expect(count).toBe(1);
            const eventCode = memory.getView(700, 4).getInt32(0, true);
            expect(eventCode).toBe(EVENT_STREAM_WRITE);
        });

        test('future writable handle produces EVENT_FUTURE_WRITE', () => {
            const { waitableSet, futureTable, memory } = createTestEnv();

            const packed = futureTable.newFuture(0);
            const writHandle = Number(packed >> 32n);

            const setId = waitableSet.newSet();
            waitableSet.join(writHandle, setId);

            // Not ready yet — future is unresolved
            expect(waitableSet.poll(setId, 600)).toBe(0);

            // Write to the future → resolves it → fires onResolve
            // First put some data in WASM memory
            memory.getViewU8(0, 4).set(new Uint8Array([1, 2, 3, 4]));
            futureTable.write(0, writHandle, 0);

            const count = waitableSet.poll(setId, 700);
            expect(count).toBe(1);
            const eventCode = memory.getView(700, 4).getInt32(0, true);
            expect(eventCode).toBe(EVENT_FUTURE_WRITE);
        });
    });

    describe('mixed and multiple ready waitables', () => {
        test('wait with mixed ready/not-ready waitables returns only the ready ones', async () => {
            const { waitableSet, subtaskTable, memory } = createTestEnv();
            const setId = waitableSet.newSet();

            // One that resolves (ready)
            const { promise: p1, resolve: r1 } = Promise.withResolvers<void>();
            const h1 = subtaskTable.create(p1);
            waitableSet.join(h1, setId);

            // One that never resolves (not ready)
            const h2 = subtaskTable.create(new Promise(() => { }));
            waitableSet.join(h2, setId);

            r1();
            await p1;
            await new Promise(r => setTimeout(r, 0));

            const count = waitableSet.poll(setId, 800);
            expect(count).toBe(1);
            const eventHandle = memory.getView(800, 12).getInt32(4, true);
            expect(eventHandle).toBe(h1);
        });

        test('multiple waitables ready: all returned in single poll', async () => {
            const { waitableSet, subtaskTable, memory } = createTestEnv();
            const setId = waitableSet.newSet();

            const { promise: p1, resolve: r1 } = Promise.withResolvers<void>();
            const h1 = subtaskTable.create(p1);
            waitableSet.join(h1, setId);

            const { promise: p2, resolve: r2 } = Promise.withResolvers<void>();
            const h2 = subtaskTable.create(p2);
            waitableSet.join(h2, setId);

            r1();
            r2();
            await p1;
            await p2;
            await new Promise(r => setTimeout(r, 0));

            const count = waitableSet.poll(setId, 900);
            expect(count).toBe(2);
            // Both events written as 12-byte records
            const view = memory.getView(900, 24);
            const handles = [view.getInt32(4, true), view.getInt32(16, true)];
            expect(handles).toContain(h1);
            expect(handles).toContain(h2);
        });

        test('multiple ready in single wait() call', async () => {
            const { waitableSet, subtaskTable, memory } = createTestEnv();
            const setId = waitableSet.newSet();

            const { promise: p1, resolve: r1 } = Promise.withResolvers<void>();
            const h1 = subtaskTable.create(p1);
            waitableSet.join(h1, setId);

            const { promise: p2, resolve: r2 } = Promise.withResolvers<void>();
            const h2 = subtaskTable.create(p2);
            waitableSet.join(h2, setId);

            // Resolve both before calling wait
            r1();
            r2();
            await p1;
            await p2;
            await new Promise(r => setTimeout(r, 0));

            // wait() should return synchronously since events are already ready
            const count = waitableSet.wait(setId, 1000);
            expect(typeof count).toBe('number');
            expect(count).toBe(2);
            const view = memory.getView(1000, 24);
            const handles = [view.getInt32(4, true), view.getInt32(16, true)];
            expect(handles).toContain(h1);
            expect(handles).toContain(h2);
        });
    });
});
