// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { initializeAsserts } from '../utils/assert';
initializeAsserts();

import { createStreamTable } from './stream-table';
import { createFutureTable } from './future-table';
import { createSubtaskTable } from './subtask-table';
import { createWaitableSetTable } from './waitable-set';
import { createResourceTable } from './resources';
import { createMemoryView } from './memory';
import { STREAM_STATUS_DROPPED } from './constants';
import type { MarshalingContext } from '../marshal/model/types';
import type { FutureStorer } from './model/types';

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

describe('abort and dispose', () => {
    describe('AbortController integration', () => {
        test('abort sets signal.aborted to true', () => {
            const ac = new AbortController();
            expect(ac.signal.aborted).toBe(false);
            ac.abort(new Error('component instance trapped'));
            expect(ac.signal.aborted).toBe(true);
        });

        test('abort reason contains the message', () => {
            const ac = new AbortController();
            ac.abort(new Error('component instance trapped'));
            expect((ac.signal.reason as Error).message).toBe('component instance trapped');
        });

        test('dispose reason contains disposed message', () => {
            const ac = new AbortController();
            ac.abort(new Error('component instance disposed'));
            expect((ac.signal.reason as Error).message).toBe('component instance disposed');
        });

        test('double abort is idempotent', () => {
            const ac = new AbortController();
            ac.abort(new Error('first'));
            ac.abort(new Error('second'));
            // First reason wins
            expect((ac.signal.reason as Error).message).toBe('first');
        });
    });

    describe('stream table abort behavior', () => {
        test('pumpIterable stops after abort — no further iter.next() calls', async () => {
            const memory = createTestMemory();
            const ac = new AbortController();
            const st = createStreamTable(memory, makeAllocHandle(), undefined, ac.signal);

            let nextCalls = 0;
            const iterable: AsyncIterable<Uint8Array> = {
                [Symbol.asyncIterator]() {
                    return {
                        next() {
                            nextCalls++;
                            if (nextCalls === 1) {
                                return Promise.resolve({ value: new Uint8Array([1]), done: false });
                            }
                            // Should not be called after abort
                            return new Promise(() => { /* hang forever */ });
                        },
                        return() {
                            return Promise.resolve({ value: undefined as any, done: true });
                        }
                    };
                }
            };
            st.addReadable(0, iterable);
            await new Promise(r => setTimeout(r, 50));
            ac.abort(new Error('component instance trapped'));
            await new Promise(r => setTimeout(r, 50));
            const callsAfterAbort = nextCalls;
            await new Promise(r => setTimeout(r, 50));
            // No further calls after abort
            expect(nextCalls).toBe(callsAfterAbort);
        });

        test('pumpIterable calls iter.return() on abort', async () => {
            const memory = createTestMemory();
            const ac = new AbortController();
            const st = createStreamTable(memory, makeAllocHandle(), undefined, ac.signal);

            let returnCalled = false;
            const iterable: AsyncIterable<Uint8Array> = {
                [Symbol.asyncIterator]() {
                    return {
                        next() {
                            return new Promise<IteratorResult<Uint8Array>>(resolve => {
                                setTimeout(() => resolve({ value: new Uint8Array([1]), done: false }), 100);
                            });
                        },
                        return() {
                            returnCalled = true;
                            return Promise.resolve({ value: undefined as any, done: true });
                        }
                    };
                }
            };
            st.addReadable(0, iterable);
            await new Promise(r => setTimeout(r, 10));
            ac.abort(new Error('component instance trapped'));
            await new Promise(r => setTimeout(r, 150));
            expect(returnCalled).toBe(true);
        });

        test('makeAsyncIterable pending next() resolves with done after abort', async () => {
            const memory = createTestMemory();
            const ac = new AbortController();
            const st = createStreamTable(memory, makeAllocHandle(), undefined, ac.signal);
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);

            const iterable = st.removeReadable(0, readHandle) as AsyncIterable<unknown>;
            const iter = iterable[Symbol.asyncIterator]();

            // Start a pending next()
            const pendingNext = iter.next();

            // Abort
            ac.abort(new Error('component instance disposed'));

            const result = await pendingNext;
            expect(result.done).toBe(true);
        });

        test('write after abort returns dropped status', () => {
            const memory = createTestMemory();
            const ac = new AbortController();
            const st = createStreamTable(memory, makeAllocHandle(), undefined, ac.signal);
            const pair = st.newStream(0);
            const writHandle = Number(pair >> 32n);

            // Dispose the table (simulates abort teardown)
            st.dispose();

            memory.getViewU8(0, 2).set(new Uint8Array([1, 2]));
            const result = st.write(0, writHandle, 0, 2);
            expect(result).toBe((0 << 4) | STREAM_STATUS_DROPPED);
        });

        test('read after abort returns dropped status', () => {
            const memory = createTestMemory();
            const ac = new AbortController();
            const st = createStreamTable(memory, makeAllocHandle(), undefined, ac.signal);
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);

            st.dispose();

            const result = st.read(0, readHandle, 0, 10);
            expect(result).toBe((0 << 4) | STREAM_STATUS_DROPPED);
        });

        test('onReady and onWriteReady callbacks are cleared on dispose', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);

            let readyCalled = 0;
            let writeReadyCalled = 0;
            st.onReady(readHandle, () => { readyCalled++; });
            st.onWriteReady(readHandle, () => { writeReadyCalled++; });

            // onWriteReady fires immediately since buffer is empty
            expect(writeReadyCalled).toBe(1);

            st.dispose();

            // After dispose, these handles no longer exist — no further callbacks
            expect(readyCalled).toBe(0);
        });
    });

    describe('future table abort behavior', () => {
        test('resolveEntry skips storer call when signal is aborted', async () => {
            const memory = createTestMemory();
            const ac = new AbortController();
            const ft = createFutureTable(memory, makeAllocHandle(), ac.signal);

            const storerCalls: unknown[] = [];
            const storer: FutureStorer = (_ctx, _ptr, value) => { storerCalls.push(value); };
            const { promise, resolve } = Promise.withResolvers<string>();
            const handle = ft.addReadable(0, promise, storer);

            const mctx = {} as MarshalingContext;
            ft.read(0, handle, 300, mctx); // register pending read

            // Abort before resolving
            ac.abort(new Error('component instance trapped'));
            resolve('value');
            await promise;
            await new Promise(r => setTimeout(r, 10));

            // Storer should NOT have been called because signal is aborted
            expect(storerCalls.length).toBe(0);
        });

        test('onResolve callbacks are cleared on dispose', async () => {
            const memory = createTestMemory();
            const ft = createFutureTable(memory, makeAllocHandle());
            const { promise } = Promise.withResolvers<void>();
            const handle = ft.addReadable(0, promise);
            const entry = ft.getEntry(handle)!;
            let called = 0;
            entry.onResolve = [() => { called++; }];

            ft.dispose();

            // After dispose, callbacks are cleared
            expect(entry.onResolve).toBeUndefined();
            expect(called).toBe(0);
        });

        test('Promise that resolves after abort does not crash', async () => {
            const memory = createTestMemory();
            const ac = new AbortController();
            const ft = createFutureTable(memory, makeAllocHandle(), ac.signal);

            const storerCalls: unknown[] = [];
            const storer: FutureStorer = (_ctx, _ptr, value) => { storerCalls.push(value); };
            const { promise, resolve } = Promise.withResolvers<string>();
            ft.addReadable(0, promise, storer);

            ac.abort(new Error('component instance trapped'));
            ft.dispose();

            // Resolve after dispose — should not crash
            resolve('late-value');
            await promise;
            await new Promise(r => setTimeout(r, 10));
            expect(storerCalls.length).toBe(0);
        });

        test('pendingRead is nulled on dispose', () => {
            const memory = createTestMemory();
            const ft = createFutureTable(memory, makeAllocHandle());
            const { promise } = Promise.withResolvers<void>();
            const handle = ft.addReadable(0, promise, (() => { }) as FutureStorer);

            const mctx = {} as MarshalingContext;
            ft.read(0, handle, 100, mctx); // sets pendingRead

            ft.dispose();

            // Entry is cleared — getEntry returns undefined
            expect(ft.getEntry(handle)).toBeUndefined();
        });
    });

    describe('subtask table abort behavior', () => {
        test('onResolve callbacks are cleared on dispose', () => {
            const table = createSubtaskTable(makeAllocHandle());
            const { promise } = Promise.withResolvers<void>();
            const handle = table.create(promise);
            const entry = table.getEntry(handle)!;
            let called = 0;
            entry.onResolve = [() => { called++; }];

            table.dispose();
            expect(entry.onResolve).toBeUndefined();
            expect(called).toBe(0);
        });

        test('Promise that resolves after dispose does not crash', async () => {
            const table = createSubtaskTable(makeAllocHandle());
            const { promise, resolve } = Promise.withResolvers<void>();
            const handle = table.create(promise);

            table.dispose();
            expect(table.getEntry(handle)).toBeUndefined();

            // Resolve after dispose — should not crash
            resolve();
            await promise;
            await new Promise(r => setTimeout(r, 10));
        });

        test('entries are cleared on dispose', () => {
            const table = createSubtaskTable(makeAllocHandle());
            const h1 = table.create(Promise.resolve());
            const h2 = table.create(Promise.resolve());
            table.dispose();
            expect(table.getEntry(h1)).toBeUndefined();
            expect(table.getEntry(h2)).toBeUndefined();
        });
    });

    describe('waitable-set abort behavior', () => {
        test('wait on aborted context rejects immediately', async () => {
            const memory = createTestMemory();
            const ac = new AbortController();
            const subtaskTable = createSubtaskTable(makeAllocHandle());
            const futureTable = createFutureTable(memory, makeAllocHandle());
            const streamTable = createStreamTable(memory, makeAllocHandle());
            const ws = createWaitableSetTable(memory, streamTable, futureTable, subtaskTable, ac.signal);

            const setId = ws.newSet();
            ac.abort(new Error('component instance trapped'));

            await expect(ws.wait(setId, 0)).rejects.toThrow('component instance trapped');
        });

        test('wait pending promise rejects when abort fires mid-wait', async () => {
            const memory = createTestMemory();
            const ac = new AbortController();
            const alloc = makeAllocHandle();
            const subtaskTable = createSubtaskTable(alloc);
            const futureTable = createFutureTable(memory, alloc);
            const streamTable = createStreamTable(memory, alloc);
            const ws = createWaitableSetTable(memory, streamTable, futureTable, subtaskTable, ac.signal);

            const setId = ws.newSet();
            // Join a pending subtask
            const { promise: p } = Promise.withResolvers<void>();
            const subtaskHandle = subtaskTable.create(p);
            ws.join(subtaskHandle, setId);

            const waitPromise = ws.wait(setId, 0);
            // Abort mid-wait
            ac.abort(new Error('component instance disposed'));

            await expect(waitPromise).rejects.toThrow('component instance disposed');
        });

        test('poll on disposed context returns 0', () => {
            const memory = createTestMemory();
            const subtaskTable = createSubtaskTable(makeAllocHandle());
            const futureTable = createFutureTable(memory, makeAllocHandle());
            const streamTable = createStreamTable(memory, makeAllocHandle());
            const ws = createWaitableSetTable(memory, streamTable, futureTable, subtaskTable);

            const setId = ws.newSet();
            ws.dispose();

            const result = ws.poll(setId, 0);
            expect(result).toBe(0);
        });

        test('pending resolvers are cleared on dispose', () => {
            const memory = createTestMemory();
            const alloc = makeAllocHandle();
            const subtaskTable = createSubtaskTable(alloc);
            const futureTable = createFutureTable(memory, alloc);
            const streamTable = createStreamTable(memory, alloc);
            const ws = createWaitableSetTable(memory, streamTable, futureTable, subtaskTable);

            const setId = ws.newSet();
            const { promise: p } = Promise.withResolvers<void>();
            const subtaskHandle = subtaskTable.create(p);
            ws.join(subtaskHandle, setId);

            ws.dispose();
            // After dispose, sets and pendingWaitables are cleared
            expect(ws.poll(setId, 0)).toBe(0);
        });
    });

    describe('resource table dispose behavior', () => {
        test('disposeOwned removes resources whose typeIdx is in the set', () => {
            const rt = createResourceTable();
            const h1 = rt.add(1, 'host-resource-1');
            const h2 = rt.add(2, 'guest-resource');
            const h3 = rt.add(1, 'host-resource-2');

            rt.disposeOwned(new Set([1]));

            expect(rt.has(1, h1)).toBe(false);
            expect(rt.has(2, h2)).toBe(true);
            expect(rt.has(1, h3)).toBe(false);
        });

        test('disposeOwned skips guest resources (typeIdx NOT in set)', () => {
            const rt = createResourceTable();
            const h1 = rt.add(10, 'host');
            const h2 = rt.add(20, 'guest');

            rt.disposeOwned(new Set([10]));

            expect(rt.has(10, h1)).toBe(false);
            expect(rt.has(20, h2)).toBe(true);
            expect(rt.get(20, h2)).toBe('guest');
        });

        test('after disposeOwned, has returns false for disposed handles', () => {
            const rt = createResourceTable();
            const h = rt.add(5, 'val');
            rt.disposeOwned(new Set([5]));
            expect(rt.has(5, h)).toBe(false);
        });

        test('disposeOwned with no owned resources is a no-op', () => {
            const rt = createResourceTable();
            const h = rt.add(1, 'val');
            rt.disposeOwned(new Set([999])); // no match
            expect(rt.has(1, h)).toBe(true);
        });

        test('disposeOwned with empty set is a no-op', () => {
            const rt = createResourceTable();
            const h = rt.add(1, 'val');
            rt.disposeOwned(new Set());
            expect(rt.has(1, h)).toBe(true);
        });
    });

    describe('cross-table interactions after abort', () => {
        test('future resolves AFTER dispose — no crash', async () => {
            const memory = createTestMemory();
            const ac = new AbortController();
            const alloc = makeAllocHandle();
            const subtaskTable = createSubtaskTable(alloc);
            const futureTable = createFutureTable(memory, alloc, ac.signal);
            const streamTable = createStreamTable(memory, alloc, undefined, ac.signal);
            const ws = createWaitableSetTable(memory, streamTable, futureTable, subtaskTable, ac.signal);

            const { promise, resolve } = Promise.withResolvers<string>();
            const handle = futureTable.addReadable(0, promise);
            const setId = ws.newSet();
            ws.join(handle, setId);

            // Dispose everything
            ac.abort(new Error('component instance disposed'));
            streamTable.dispose();
            futureTable.dispose();
            subtaskTable.dispose();
            ws.dispose();

            // Resolve after dispose — should not crash
            resolve('late');
            await promise;
            await new Promise(r => setTimeout(r, 10));
        });

        test('subtask resolves AFTER dispose — no crash', async () => {
            const memory = createTestMemory();
            const ac = new AbortController();
            const alloc = makeAllocHandle();
            const subtaskTable = createSubtaskTable(alloc);
            const futureTable = createFutureTable(memory, alloc, ac.signal);
            const streamTable = createStreamTable(memory, alloc, undefined, ac.signal);
            const ws = createWaitableSetTable(memory, streamTable, futureTable, subtaskTable, ac.signal);

            const { promise, resolve } = Promise.withResolvers<void>();
            const handle = subtaskTable.create(promise);
            const setId = ws.newSet();
            ws.join(handle, setId);

            ac.abort(new Error('component instance trapped'));
            ws.dispose();
            subtaskTable.dispose();

            resolve();
            await promise;
            await new Promise(r => setTimeout(r, 10));
        });

        test('stream addReadable with async iterable that throws after abort — no unhandled rejection', async () => {
            const memory = createTestMemory();
            const ac = new AbortController();
            const st = createStreamTable(memory, makeAllocHandle(), undefined, ac.signal);

            let yieldCount = 0;
            async function* errorGen() {
                yieldCount++;
                yield new Uint8Array([1]);
                yieldCount++;
                throw new Error('iterable error after abort');
            }
            st.addReadable(0, errorGen());
            await new Promise(r => setTimeout(r, 20));

            ac.abort(new Error('component instance trapped'));
            st.dispose();
            await new Promise(r => setTimeout(r, 50));

            // Should not cause unhandled rejection
            expect(yieldCount).toBeGreaterThanOrEqual(1);
        });
    });
});
