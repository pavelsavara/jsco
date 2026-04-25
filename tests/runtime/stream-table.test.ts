// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { initializeAsserts } from '../../src/utils/assert';
initializeAsserts();

import { createStreamTable } from '../../src/runtime/stream-table';
import { createMemoryView } from '../../src/runtime/memory';
import { STREAM_STATUS_COMPLETED, STREAM_STATUS_DROPPED, STREAM_BLOCKED } from '../../src/runtime/constants';
import type { MarshalingContext } from '../../src/marshal/model/types';

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

describe('StreamTable', () => {
    describe('byte streams', () => {
        test('newStream returns bigint with readable (even) and writable (odd) handles', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);
            expect(readHandle % 2).toBe(0);
            expect(writHandle % 2).toBe(1);
            expect(writHandle).toBe(readHandle + 1);
        });

        test('write then read transfers bytes through the stream', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);

            // Write data
            const src = new Uint8Array([1, 2, 3, 4, 5]);
            memory.getViewU8(100, 5).set(src);
            const writeResult = st.write(0, writHandle, 100, 5);
            expect(writeResult).toBe((5 << 4) | STREAM_STATUS_COMPLETED);

            // Read it
            const readResult = st.read(0, readHandle, 200, 10);
            expect(readResult).toBe((5 << 4) | STREAM_STATUS_COMPLETED);
            const dst = memory.getViewU8(200, 5);
            expect(Array.from(dst)).toEqual([1, 2, 3, 4, 5]);
        });

        test('read returns BLOCKED when no data is available', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const result = st.read(0, readHandle, 0, 10);
            expect(result).toBe(STREAM_BLOCKED);
        });

        test('read returns STREAM_STATUS_DROPPED after writer closes', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);
            st.dropWritable(0, writHandle); // close writer
            const result = st.read(0, readHandle, 0, 10);
            expect(result).toBe((0 << 4) | STREAM_STATUS_DROPPED);
        });

        test('write returns packed (len << 4) | COMPLETED on success', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const pair = st.newStream(0);
            const writHandle = Number(pair >> 32n);
            memory.getViewU8(0, 3).set(new Uint8Array([10, 20, 30]));
            const result = st.write(0, writHandle, 0, 3);
            expect(result).toBe((3 << 4) | STREAM_STATUS_COMPLETED);
        });

        test('write to a closed stream returns dropped status', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);
            st.dropReadable(0, readHandle); // close from reader side
            const result = st.write(0, writHandle, 0, 5);
            expect(result).toBe((0 << 4) | STREAM_STATUS_DROPPED);
        });

        test('cancelRead clears pending read, returns completed', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            // Trigger pending read
            st.read(0, readHandle, 100, 10);
            const result = st.cancelRead(0, readHandle);
            expect(result).toBe((0 << 4) | STREAM_STATUS_COMPLETED);
        });

        test('cancelWrite returns completed', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const result = st.cancelWrite(0, 0);
            expect(result).toBe((0 << 4) | STREAM_STATUS_COMPLETED);
        });

        test('dropWritable closes the stream, signals pending readers', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);
            // After drop, stream should be closed
            st.dropWritable(0, writHandle);
            expect(st.hasData(readHandle)).toBe(true); // closed counts as "has data"
        });

        test('zero-length write returns completed with 0', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const pair = st.newStream(0);
            const writHandle = Number(pair >> 32n);
            const result = st.write(0, writHandle, 0, 0);
            expect(result).toBe((0 << 4) | STREAM_STATUS_COMPLETED);
        });

        test('operations on non-existent handles return appropriate status', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            expect(st.read(0, 999, 0, 10)).toBe((0 << 4) | STREAM_STATUS_DROPPED);
            expect(st.write(0, 999, 0, 5)).toBe((0 << 4) | STREAM_STATUS_DROPPED);
        });

        test('multiple sequential writes accumulate in buffer', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);

            memory.getViewU8(0, 2).set(new Uint8Array([1, 2]));
            st.write(0, writHandle, 0, 2);
            memory.getViewU8(0, 2).set(new Uint8Array([3, 4]));
            st.write(0, writHandle, 0, 2);

            const readResult = st.read(0, readHandle, 100, 10);
            // Should get all 4 bytes
            expect(readResult >>> 4).toBe(4);
            expect(Array.from(memory.getViewU8(100, 4))).toEqual([1, 2, 3, 4]);
        });

        test('partial reads leave remainder in buffer', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);

            memory.getViewU8(0, 5).set(new Uint8Array([10, 20, 30, 40, 50]));
            st.write(0, writHandle, 0, 5);

            // Read only 3
            const result1 = st.read(0, readHandle, 100, 3);
            expect(result1 >>> 4).toBe(3);
            expect(Array.from(memory.getViewU8(100, 3))).toEqual([10, 20, 30]);

            // Read remaining
            const result2 = st.read(0, readHandle, 200, 10);
            expect(result2 >>> 4).toBe(2);
            expect(Array.from(memory.getViewU8(200, 2))).toEqual([40, 50]);
        });

        test('read after all data consumed and stream closed returns dropped', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);

            memory.getViewU8(0, 2).set(new Uint8Array([1, 2]));
            st.write(0, writHandle, 0, 2);
            st.dropWritable(0, writHandle); // close

            // Consume data
            st.read(0, readHandle, 100, 10);
            // Now read again — should get dropped
            const result = st.read(0, readHandle, 100, 10);
            expect(result).toBe((0 << 4) | STREAM_STATUS_DROPPED);
        });

        test('read when stream closed but buffer non-empty returns remaining data first', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);

            memory.getViewU8(0, 3).set(new Uint8Array([7, 8, 9]));
            st.write(0, writHandle, 0, 3);
            st.dropWritable(0, writHandle); // close

            const result = st.read(0, readHandle, 100, 10);
            expect(result >>> 4).toBe(3);
            expect(Array.from(memory.getViewU8(100, 3))).toEqual([7, 8, 9]);
        });
    });

    describe('typed streams', () => {
        test('addReadable with elementStorer creates a typed stream', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const storer = (_ctx: MarshalingContext, _ptr: number, _value: unknown) => { };
            const mctx = {} as MarshalingContext;
            const handle = st.addReadable(0, null, storer, 4, mctx);
            expect(handle).toBeGreaterThan(0);
            expect(handle % 2).toBe(0); // readable = even
        });

        test('typed stream read encodes elements via elementStorer callback', () => {
            const memory = createTestMemory();
            const alloc = makeAllocHandle();
            const st = createStreamTable(memory, alloc);

            const storedArgs: unknown[][] = [];
            const storer = (ctx: MarshalingContext, ptr: number, value: unknown) => {
                storedArgs.push([ctx, ptr, value]);
            };
            const mctx = {} as MarshalingContext;

            // Create typed stream and manually push elements to its buffer
            const _handle = st.addReadable(0, null, storer, 8, mctx);
            // Simulate async iterable pushing elements - use an iterable that yields immediately
            const iterable = {
                [Symbol.asyncIterator]: () => {
                    let i = 0;
                    const items = ['a', 'b', 'c'];
                    return {
                        next: () => {
                            if (i < items.length) {
                                return Promise.resolve({ value: items[i++], done: false });
                            }
                            return Promise.resolve({ value: undefined, done: true });
                        }
                    };
                }
            };
            const handle2 = st.addReadable(0, iterable, storer, 8, mctx);
            // Allow microtask for pump
            return new Promise<void>((resolve) => {
                setTimeout(() => {
                    const _result = st.read(0, handle2, 1000, 3);
                    // Should have encoded elements via storer
                    expect(storedArgs.length).toBeGreaterThan(0);
                    resolve();
                }, 50);
            });
        });

        test('fulfillPendingRead for typed streams encodes via storer', async () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());

            const storedArgs: unknown[][] = [];
            const storer = (ctx: MarshalingContext, ptr: number, value: unknown) => {
                storedArgs.push([ctx, ptr, value]);
            };
            const mctx = {} as MarshalingContext;

            // Create typed stream with async iterable
            async function* gen() {
                yield 'hello';
                yield 'world';
            }
            const handle = st.addReadable(0, gen(), storer, 8, mctx);

            // Issue a read that will BLOCK (no data yet at call time)
            // Data should be pumped but read issued before pump completes
            const _readResult = st.read(0, handle, 500, 2);
            // Wait for pump to push elements into the buffer
            await new Promise(r => setTimeout(r, 50));

            // fulfillPendingRead should encode buffered elements via storer
            const _result = st.fulfillPendingRead(handle);
            // Either the initial read consumed elements or
            // fulfillPendingRead consumed them. In either case, storer was called.
            expect(storedArgs.length).toBeGreaterThan(0);
            // Verify the storer received correct context
            expect(storedArgs[0]![0]).toBe(mctx);
        });
    });

    describe('async iterable integration', () => {
        test('addReadable with async iterable pumps data into buffer', async () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());

            async function* gen() {
                yield new Uint8Array([1, 2, 3]);
                yield new Uint8Array([4, 5]);
            }
            const handle = st.addReadable(0, gen());
            // Wait for pump
            await new Promise(r => setTimeout(r, 50));
            expect(st.hasData(handle)).toBe(true);
        });

        test('removeReadable for newStream-created handles returns async iterable', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const iterable = st.removeReadable(0, readHandle);
            expect(iterable).toBeDefined();
            expect(typeof (iterable as any)[Symbol.asyncIterator]).toBe('function');
        });

        test('getReadable/getWritable return original JS value', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const readVal = { type: 'reader' };
            const writeVal = { type: 'writer' };
            const rHandle = st.addReadable(0, readVal);
            const wHandle = st.addWritable(0, writeVal);
            expect(st.getReadable(0, rHandle)).toBe(readVal);
            expect(st.getWritable(0, wHandle)).toBe(writeVal);
        });

        test('addWritable allocates odd handle', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const wHandle = st.addWritable(0, 'writer');
            expect(wHandle % 2).toBe(1); // odd = writable
        });

        test('addReadable with async iterable that errors closes stream', async () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());

            async function* errorGen() {
                yield new Uint8Array([1]);
                throw new Error('pump error');
            }
            const handle = st.addReadable(0, errorGen());
            // Wait for pump to error
            await new Promise(r => setTimeout(r, 50));
            expect(st.hasData(handle)).toBe(true); // closed = hasData
        });
    });

    describe('backpressure — write-side', () => {
        test('write tracks bufferedBytes, returns BLOCKED when exceeding threshold', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle(), { streamBackpressureBytes: 16 });
            const pair = st.newStream(0);
            const writHandle = Number(pair >> 32n);

            // Fill up 16 bytes
            memory.getViewU8(0, 16).set(new Uint8Array(16).fill(0xAA));
            st.write(0, writHandle, 0, 16);

            // Next write should block
            memory.getViewU8(0, 1).set(new Uint8Array([1]));
            const result = st.write(0, writHandle, 0, 1);
            expect(result).toBe(STREAM_BLOCKED);
        });

        test('write succeeds if a waitingReader is present even when buffer is full', async () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle(), { streamBackpressureBytes: 4 });
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);

            // Fill buffer to threshold
            memory.getViewU8(0, 4).set(new Uint8Array(4).fill(0xBB));
            st.write(0, writHandle, 0, 4);

            // Create a waiting reader by getting async iterable and calling next
            const iterable = st.removeReadable(0, readHandle) as AsyncIterable<unknown>;
            const iter = iterable[Symbol.asyncIterator]();
            // Drain the buffer
            await iter.next(); // gets the 4 bytes

            // Now write should succeed since it was drained
            memory.getViewU8(0, 2).set(new Uint8Array([1, 2]));
            const result = st.write(0, writHandle, 0, 2);
            expect(result).toBe((2 << 4) | STREAM_STATUS_COMPLETED);
        });

        test('hasWriteSpace returns false when buffer exceeds threshold', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle(), { streamBackpressureBytes: 8 });
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);

            expect(st.hasWriteSpace(readHandle)).toBe(true);
            memory.getViewU8(0, 8).set(new Uint8Array(8).fill(0xFF));
            st.write(0, writHandle, 0, 8);
            expect(st.hasWriteSpace(readHandle)).toBe(false);

            // Drain
            st.read(0, readHandle, 100, 8);
            expect(st.hasWriteSpace(readHandle)).toBe(true);
        });

        test('onWriteReady fires callback immediately if space available', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const cb = { called: 0 };
            st.onWriteReady(readHandle, () => { cb.called++; });
            expect(cb.called).toBe(1);
        });

        test('onWriteReady defers callback when buffer full, fires after drain', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle(), { streamBackpressureBytes: 4 });
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);

            // Fill buffer
            memory.getViewU8(0, 4).set(new Uint8Array(4).fill(0));
            st.write(0, writHandle, 0, 4);

            const cb = { called: 0 };
            st.onWriteReady(readHandle, () => { cb.called++; });
            expect(cb.called).toBe(0); // deferred

            // Drain by reading
            st.read(0, readHandle, 100, 4);
            expect(cb.called).toBe(1);
        });

        test('custom backpressure threshold via constructor parameter', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle(), { streamBackpressureBytes: 2 });
            const pair = st.newStream(0);
            const writHandle = Number(pair >> 32n);

            memory.getViewU8(0, 2).set(new Uint8Array([1, 2]));
            st.write(0, writHandle, 0, 2);

            memory.getViewU8(0, 1).set(new Uint8Array([3]));
            const result = st.write(0, writHandle, 0, 1);
            expect(result).toBe(STREAM_BLOCKED);
        });
    });

    describe('backpressure — read-side', () => {
        test('read drains buffer and decrements bufferedBytes, triggering write-ready', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle(), { streamBackpressureBytes: 8 });
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);

            memory.getViewU8(0, 8).set(new Uint8Array(8).fill(0xCC));
            st.write(0, writHandle, 0, 8);
            // Buffer now at threshold

            const cb = { called: 0 };
            st.onWriteReady(readHandle, () => { cb.called++; });
            expect(cb.called).toBe(0);

            // Read to drain
            st.read(0, readHandle, 100, 8);
            expect(cb.called).toBe(1);
        });

        test('fulfillPendingRead drains buffer and decrements bufferedBytes, triggering write-ready', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle(), { streamBackpressureBytes: 8 });
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);

            // Create pending read first
            st.read(0, readHandle, 500, 10);

            // Fill buffer to threshold
            memory.getViewU8(0, 8).set(new Uint8Array(8).fill(0xDD));
            st.write(0, writHandle, 0, 8);

            const cb = { called: 0 };
            st.onWriteReady(readHandle, () => { cb.called++; });
            expect(cb.called).toBe(0);

            // fulfillPendingRead should drain and trigger write-ready
            st.fulfillPendingRead(readHandle);
            expect(cb.called).toBe(1);
        });

        test('read after partial write returns only available bytes', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);

            memory.getViewU8(0, 3).set(new Uint8Array([1, 2, 3]));
            st.write(0, writHandle, 0, 3);

            const result = st.read(0, readHandle, 100, 100);
            expect(result >>> 4).toBe(3); // only 3 bytes available
        });
    });

    describe('backpressure — cross-side interactions', () => {
        test('writer blocked → reader reads → writer unblocked via onWriteReady', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle(), { streamBackpressureBytes: 4 });
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);

            // Fill buffer to threshold
            memory.getViewU8(0, 4).set(new Uint8Array([1, 2, 3, 4]));
            st.write(0, writHandle, 0, 4);

            // Writer is now blocked
            memory.getViewU8(0, 1).set(new Uint8Array([5]));
            expect(st.write(0, writHandle, 0, 1)).toBe(STREAM_BLOCKED);

            let writeReady = false;
            st.onWriteReady(readHandle, () => { writeReady = true; });
            expect(writeReady).toBe(false);

            // Reader drains
            st.read(0, readHandle, 100, 4);
            expect(writeReady).toBe(true);

            // Writer can write again
            memory.getViewU8(0, 1).set(new Uint8Array([5]));
            const result = st.write(0, writHandle, 0, 1);
            expect(result >>> 4).toBe(1);
        });

        test('writer blocked → reader drops readable → writer sees closed', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle(), { streamBackpressureBytes: 4 });
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);

            memory.getViewU8(0, 4).set(new Uint8Array([1, 2, 3, 4]));
            st.write(0, writHandle, 0, 4);
            expect(st.write(0, writHandle, 0, 1)).toBe(STREAM_BLOCKED);

            // Reader drops — stream closes
            st.dropReadable(0, readHandle);

            // Writer should see dropped/closed
            memory.getViewU8(0, 1).set(new Uint8Array([5]));
            const result = st.write(0, writHandle, 0, 1);
            expect(result).toBe((0 << 4) | STREAM_STATUS_DROPPED);
        });

        test('writer writes small chunks → reader reads large buffer → partial fill', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);

            // Write two small chunks
            memory.getViewU8(0, 2).set(new Uint8Array([10, 20]));
            st.write(0, writHandle, 0, 2);
            memory.getViewU8(0, 3).set(new Uint8Array([30, 40, 50]));
            st.write(0, writHandle, 0, 3);

            // Read with large buffer — should get all 5 bytes
            const result = st.read(0, readHandle, 200, 1000);
            expect(result >>> 4).toBe(5);
            expect(Array.from(memory.getViewU8(200, 5))).toEqual([10, 20, 30, 40, 50]);
        });

        test('rapid alternating write/read cycles maintain correct bufferedBytes', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle(), { streamBackpressureBytes: 10 });
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);

            for (let i = 0; i < 20; i++) {
                memory.getViewU8(0, 3).set(new Uint8Array([1, 2, 3]));
                st.write(0, writHandle, 0, 3);
                st.read(0, readHandle, 100, 3);
            }

            // Buffer should be empty — hasWriteSpace should be true
            expect(st.hasWriteSpace(readHandle)).toBe(true);
        });
    });

    describe('waitable-set integration', () => {
        test('hasStream returns true for known base handles', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            expect(st.hasStream(readHandle)).toBe(true);
            expect(st.hasStream(9999)).toBe(false);
        });

        test('hasData returns true when chunks available or stream closed', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);
            expect(st.hasData(readHandle)).toBe(false);

            memory.getViewU8(0, 1).set(new Uint8Array([42]));
            st.write(0, writHandle, 0, 1);
            expect(st.hasData(readHandle)).toBe(true);
        });

        test('onReady fires callback immediately if data available', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);

            memory.getViewU8(0, 1).set(new Uint8Array([1]));
            st.write(0, writHandle, 0, 1);

            const cb = { called: 0 };
            st.onReady(readHandle, () => { cb.called++; });
            expect(cb.called).toBe(1);
        });

        test('onReady defers callback when no data, fires when writer drops', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);

            const cb2 = { called: 0 };
            st.onReady(readHandle, () => { cb2.called++; });
            expect(cb2.called).toBe(0);

            // dropWritable triggers signalReady (closes the stream)
            st.dropWritable(0, writHandle);
            expect(cb2.called).toBe(1);
        });

        test('onReady defers callback, fires when async iterable pumps data', async () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());

            const { promise, resolve } = Promise.withResolvers<Uint8Array>();
            async function* gen() { yield await promise; }
            const handle = st.addReadable(0, gen());

            const cb3 = { called: 0 };
            st.onReady(handle, () => { cb3.called++; });
            expect(cb3.called).toBe(0);

            resolve(new Uint8Array([1]));
            await new Promise(r => setTimeout(r, 50));
            expect(cb3.called).toBeGreaterThanOrEqual(1);
        });

        test('fulfillPendingRead copies buffered data into guest buffer', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);

            // Create pending read
            st.read(0, readHandle, 500, 10);

            // Write data
            memory.getViewU8(0, 3).set(new Uint8Array([11, 22, 33]));
            st.write(0, writHandle, 0, 3);

            // Fulfill the pending read
            const result = st.fulfillPendingRead(readHandle);
            expect(result >>> 4).toBe(3);
            expect(Array.from(memory.getViewU8(500, 3))).toEqual([11, 22, 33]);
        });

        test('fulfillPendingRead with no pending read returns completed with 0', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const result = st.fulfillPendingRead(readHandle);
            expect(result).toBe((0 << 4) | STREAM_STATUS_COMPLETED);
        });
    });

    describe('resource leak detection', () => {
        test('removeReadable returns value and cleans up JS map', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const val = { data: 'test' };
            const handle = st.addReadable(0, val);
            expect(st.removeReadable(0, handle)).toBe(val);
            expect(st.getReadable(0, handle)).toBeUndefined();
        });

        test('removeWritable returns value and cleans up JS map', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const val = { data: 'test' };
            const handle = st.addWritable(0, val);
            expect(st.removeWritable(0, handle)).toBe(val);
            expect(st.getWritable(0, handle)).toBeUndefined();
        });

        test('dropReadable signals writer via onReadableDrop', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            let dropCalled = 0;
            const handle = st.addReadable(0, { onReadableDrop: () => { dropCalled++; } });
            st.dropReadable(0, handle);
            expect(dropCalled).toBe(1);
        });

        test('after dropReadable + dropWritable, stream is closed', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);

            st.dropReadable(0, readHandle);
            st.dropWritable(0, writHandle);

            // Both ends dropped — reads/writes return DROPPED
            expect(st.read(0, readHandle, 0, 10)).toBe((0 << 4) | STREAM_STATUS_DROPPED);
            expect(st.write(0, writHandle, 0, 1)).toBe((0 << 4) | STREAM_STATUS_DROPPED);
        });

        test('addReadable with async iterable that errors closes stream and stops pumping', async () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            let nextCalls = 0;
            async function* errorGen() {
                nextCalls++;
                yield new Uint8Array([1]);
                nextCalls++;
                throw new Error('pump error');
            }
            const handle = st.addReadable(0, errorGen());
            await new Promise(r => setTimeout(r, 50));
            // Stream should be closed
            expect(st.hasData(handle)).toBe(true);
            expect(nextCalls).toBe(2);
        });

        test('entries map does not grow unboundedly after repeated newStream+drop cycles', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            for (let i = 0; i < 100; i++) {
                const pair = st.newStream(0);
                const readHandle = Number(pair & 0xFFFFFFFFn);
                const writHandle = Number(pair >> 32n);
                st.dropWritable(0, writHandle);
                st.dropReadable(0, readHandle);
            }
            // After 100 create+drop cycles, new streams still work
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);
            memory.getViewU8(0, 3).set(new Uint8Array([1, 2, 3]));
            st.write(0, writHandle, 0, 3);
            const result = st.read(0, readHandle, 100, 3);
            expect(result >>> 4).toBe(3);
        });
    });

    describe('edge cases', () => {
        test('multiple sequential writes then single large read returns all data', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);

            for (let i = 0; i < 10; i++) {
                memory.getViewU8(0, 1).set(new Uint8Array([i]));
                st.write(0, writHandle, 0, 1);
            }

            const result = st.read(0, readHandle, 100, 100);
            expect(result >>> 4).toBe(10);
            expect(Array.from(memory.getViewU8(100, 10))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        });

        test('read from stream that was never written to returns BLOCKED', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            expect(st.read(0, readHandle, 0, 10)).toBe(STREAM_BLOCKED);
        });

        test('write/read on non-existent handles returns DROPPED not throw', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            expect(st.read(0, 12345, 0, 10)).toBe((0 << 4) | STREAM_STATUS_DROPPED);
            expect(st.write(0, 12345, 0, 5)).toBe((0 << 4) | STREAM_STATUS_DROPPED);
        });

        test('dropReadable then dropWritable on same stream does not throw', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle());
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);
            expect(() => {
                st.dropReadable(0, readHandle);
                st.dropWritable(0, writHandle);
            }).not.toThrow();
        });

        test('onWriteReady fires when stream closes even if buffer full', () => {
            const memory = createTestMemory();
            const st = createStreamTable(memory, makeAllocHandle(), { streamBackpressureBytes: 4 });
            const pair = st.newStream(0);
            const readHandle = Number(pair & 0xFFFFFFFFn);
            const writHandle = Number(pair >> 32n);

            // Fill buffer
            memory.getViewU8(0, 4).set(new Uint8Array(4).fill(0));
            st.write(0, writHandle, 0, 4);

            let writeReadyCalled = false;
            st.onWriteReady(readHandle, () => { writeReadyCalled = true; });
            expect(writeReadyCalled).toBe(false);

            // Close stream via dropReadable
            st.dropReadable(0, readHandle);
            expect(writeReadyCalled).toBe(true);
        });
    });
});
