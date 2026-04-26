// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { MarshalingContext } from '../marshal/model/types';
import type { MemoryView, StreamTable, StreamEntry, RuntimeConfig } from './model/types';
import { STREAM_STATUS_COMPLETED, STREAM_STATUS_DROPPED, STREAM_STATUS_CANCELLED, STREAM_BLOCKED, STREAM_BACKPRESSURE, STREAM_BACKPRESSURE_CHUNKS } from './constants';

export function createStreamTable(memory: MemoryView, allocHandle: () => number, config?: RuntimeConfig, signal: AbortSignal = new AbortController().signal): StreamTable {
    const backpressureThreshold = config?.streamBackpressureBytes ?? STREAM_BACKPRESSURE;
    const backpressureChunks = config?.streamBackpressureChunks ?? STREAM_BACKPRESSURE_CHUNKS;

    // Handle numbering: even = readable, odd = writable. Base = handle & ~1.
    const entries = new Map<number, StreamEntry>();
    const jsReadables = new Map<number, unknown>();
    const jsWritables = new Map<number, unknown>();

    function baseHandle(handle: number): number { return handle & ~1; }

    /** Signal that data arrived or stream closed — notify waitable-set watchers. */
    function signalReady(entry: StreamEntry): void {
        if (entry.onReady) {
            for (const cb of entry.onReady) cb();
        }
    }

    /** Signal that buffer drained below threshold — notify write-side waiters. */
    function checkWriteReady(entry: StreamEntry): void {
        if (!entry.onWriteReady || entry.onWriteReady.length === 0) return;
        const overBytes = (entry.bufferedBytes ?? 0) >= backpressureThreshold;
        const overChunks = entry.chunks.length >= backpressureChunks;
        if (entry.closed || (!overBytes && !overChunks)) {
            const cbs = entry.onWriteReady;
            entry.onWriteReady = undefined;
            for (const cb of cbs) cb();
        }
    }

    /** Pump an async iterable into a stream entry's buffer in the background. */
    function pumpIterable(iterable: AsyncIterable<unknown>, entry: StreamEntry): void {
        const iter = iterable[Symbol.asyncIterator]();
        let pumping = false;
        function pump(): void {
            if (pumping) return;
            if (signal.aborted) {
                iter.return?.();
                entry.closed = true;
                if (entry.waitingReader) {
                    entry.waitingReader(null);
                }
                signalReady(entry);
                return;
            }
            // F1/B5 mitigation: pause pumping when buffer is full; resume when
            // reader drains via checkWriteReady. Without this, a fast JS-side
            // iterable (e.g. a network socket) accumulates chunks indefinitely
            // when the guest doesn't read, OOMing the JS heap.
            if (entry.chunks.length >= backpressureChunks ||
                (entry.bufferedBytes ?? 0) >= backpressureThreshold) {
                if (!entry.onWriteReady) entry.onWriteReady = [];
                entry.onWriteReady.push(pump);
                return;
            }
            pumping = true;
            iter.next().then((result) => {
                pumping = false;
                if (signal.aborted) {
                    iter.return?.();
                    entry.closed = true;
                    if (entry.waitingReader) {
                        entry.waitingReader(null);
                    }
                    signalReady(entry);
                    return;
                }
                if (result.done) {
                    entry.closed = true;
                    if (entry.waitingReader) {
                        entry.waitingReader(null);
                    }
                    signalReady(entry);
                } else {
                    if (entry.waitingReader) {
                        entry.waitingReader(result.value);
                    } else {
                        entry.chunks.push(result.value);
                        if (result.value instanceof Uint8Array) {
                            entry.bufferedBytes = (entry.bufferedBytes ?? 0) + result.value.length;
                        }
                    }
                    signalReady(entry);
                    pump(); // continue pumping
                }
            }, () => {
                // Error in iterable — close the stream
                pumping = false;
                entry.closed = true;
                if (entry.waitingReader) {
                    entry.waitingReader(null);
                }
                signalReady(entry);
            });
        }
        pump();
    }

    /** Build an async-iterable backed by the stream entry's internal buffer. */
    function makeAsyncIterable(entry: StreamEntry): AsyncIterable<unknown> {
        return {
            [Symbol.asyncIterator](): AsyncIterator<unknown> {
                return {
                    next(): Promise<IteratorResult<unknown>> {
                        if (entry.chunks.length > 0) {
                            const chunk = entry.chunks.shift()!;
                            if (chunk instanceof Uint8Array) {
                                entry.bufferedBytes = Math.max(0, (entry.bufferedBytes ?? 0) - chunk.length);
                            }
                            checkWriteReady(entry);
                            return Promise.resolve({ value: chunk, done: false });
                        }
                        if (entry.closed) {
                            return Promise.resolve({ value: undefined as any, done: true });
                        }
                        return new Promise<IteratorResult<unknown>>((resolve) => {
                            entry.waitingReader = (chunk): void => {
                                entry.waitingReader = undefined;
                                signal.removeEventListener('abort', onAbort);
                                // give the browser/event loop a chance to process other pending tasks
                                if (chunk === null) {
                                    resolve({ value: undefined as any, done: true });
                                } else {
                                    resolve({ value: chunk, done: false });
                                }
                            };
                            function onAbort(): void {
                                if (entry.waitingReader) {
                                    entry.waitingReader(null);
                                }
                            }
                            signal.addEventListener('abort', onAbort, { once: true });
                        });
                    },
                    return(): Promise<IteratorResult<unknown>> {
                        entry.closed = true;
                        if (entry.waitingReader) {
                            entry.waitingReader(null);
                        }
                        signalReady(entry);
                        checkWriteReady(entry);
                        return Promise.resolve({ value: undefined as any, done: true });
                    },
                };
            },
        };
    }

    /** Read typed (non-byte) elements from a stream: encode each via elementStorer. */
    function readTypedElements(entry: StreamEntry, ptr: number, len: number): number {
        const elemSize = entry.elementSize!;
        const storer = entry.elementStorer!;
        const mctx = entry.mctx!;
        // len is the element count (not byte count) per the canonical ABI
        let count = 0;
        while (entry.chunks.length > 0 && count < len) {
            const element = entry.chunks.shift()!;
            storer(mctx, ptr + count * elemSize, element);
            count++;
        }
        if (count > 0) {
            checkWriteReady(entry);
            return (count << 4) | STREAM_STATUS_COMPLETED;
        }
        if (entry.closed) return (0 << 4) | STREAM_STATUS_DROPPED;
        entry.pendingRead = { ptr, len };
        return STREAM_BLOCKED;
    }

    return {
        newStream(_typeIdx: number): bigint {
            const readHandle = allocHandle();
            const writHandle = readHandle + 1;
            entries.set(readHandle, { chunks: [], closed: false });
            return BigInt(writHandle) << 32n | BigInt(readHandle);
        },

        read(_typeIdx: number, handle: number, ptr: number, len: number): number {
            const base = baseHandle(handle);
            const entry = entries.get(base);
            if (!entry) return (0 << 4) | STREAM_STATUS_DROPPED;
            // Typed stream: each chunk is a single element, encode via storer
            if (entry.elementStorer && entry.elementSize) {
                return readTypedElements(entry, ptr, len);
            }
            // Byte stream: copy available data into WASM linear memory
            let offset = 0;
            while (entry.chunks.length > 0 && offset < len) {
                const chunk = entry.chunks[0] as Uint8Array;
                const needed = len - offset;
                if (chunk.length <= needed) {
                    memory.getViewU8(ptr + offset, chunk.length).set(chunk);
                    offset += chunk.length;
                    entry.chunks.shift();
                } else {
                    memory.getViewU8(ptr + offset, needed).set(chunk.subarray(0, needed));
                    offset += needed;
                    entry.chunks[0] = chunk.subarray(needed);
                }
            }
            if (offset > 0) {
                entry.bufferedBytes = Math.max(0, (entry.bufferedBytes ?? 0) - offset);
                checkWriteReady(entry);
                return (offset << 4) | STREAM_STATUS_COMPLETED;
            }
            if (entry.closed) return (0 << 4) | STREAM_STATUS_DROPPED;
            entry.pendingRead = { ptr, len };
            return STREAM_BLOCKED;
        },

        write(_typeIdx: number, handle: number, ptr: number, len: number): number {
            const base = baseHandle(handle);
            const entry = entries.get(base);
            if (!entry) return (0 << 4) | STREAM_STATUS_DROPPED;
            if (entry.closed) return (0 << 4) | STREAM_STATUS_DROPPED;
            if (len > 0) {
                // Backpressure: block if buffer is full and no reader is waiting
                if (!entry.waitingReader && (entry.bufferedBytes ?? 0) >= backpressureThreshold) {
                    return STREAM_BLOCKED;
                }
                // Copy data from WASM linear memory
                const src = memory.getViewU8(ptr, len);
                const copy = new Uint8Array(src);
                if (entry.waitingReader) {
                    entry.waitingReader(copy);
                } else {
                    entry.chunks.push(copy);
                    entry.bufferedBytes = (entry.bufferedBytes ?? 0) + len;
                }
            }
            return (len << 4) | STREAM_STATUS_COMPLETED;
        },

        cancelRead(_typeIdx: number, handle: number): number {
            const base = baseHandle(handle);
            const entry = entries.get(base);
            if (!entry) return (0 << 4) | STREAM_STATUS_DROPPED;
            // Per canonical ABI (`pack_copy_result`): cancel-read returns
            // CANCELLED when the read was successfully cancelled with no data
            // transferred. If data already arrived (entry.chunks has data
            // matching the pending read) the host should return COMPLETED with
            // the byte count; today we cancel before delivering, so always
            // return CANCELLED(0). If the stream has been closed, return
            // DROPPED(0). If no read was pending, return COMPLETED(0)
            // (no-op cancellation).
            const hadPending = entry.pendingRead !== undefined;
            entry.pendingRead = undefined;
            if (entry.closed) return (0 << 4) | STREAM_STATUS_DROPPED;
            if (hadPending) return (0 << 4) | STREAM_STATUS_CANCELLED;
            return (0 << 4) | STREAM_STATUS_COMPLETED;
        },

        cancelWrite(_typeIdx: number, handle: number): number {
            const base = baseHandle(handle);
            const entry = entries.get(base);
            if (!entry) return (0 << 4) | STREAM_STATUS_DROPPED;
            if (entry.closed) return (0 << 4) | STREAM_STATUS_DROPPED;
            // Symmetric to cancelRead: writes that haven't been buffered yet
            // are reported CANCELLED. Today our `write()` is synchronous (it
            // either buffers or returns BLOCKED), so there's no in-flight
            // pending write to cancel — return CANCELLED(0) as a no-op.
            return (0 << 4) | STREAM_STATUS_CANCELLED;
        },

        dropReadable(_typeIdx: number, handle: number): void {
            const base = baseHandle(handle);
            jsReadables.delete(handle);
            const entry = entries.get(base);
            if (entry) {
                entry.closed = true;
                if (entry.onReadableDrop) entry.onReadableDrop();
                checkWriteReady(entry);
            }
        },

        dropWritable(_typeIdx: number, handle: number): void {
            const base = baseHandle(handle);
            jsWritables.delete(handle);
            const entry = entries.get(base);
            if (entry) {
                entry.closed = true;
                if (entry.waitingReader) {
                    entry.waitingReader(null);
                }
                signalReady(entry);
            }
        },

        addReadable(_typeIdx: number, value: unknown, elementStorer?: (ctx: MarshalingContext, ptr: number, value: unknown) => void, elementSize?: number, mctx?: MarshalingContext): number {
            const readHandle = allocHandle();
            const entry: StreamEntry = { chunks: [], closed: false, elementStorer, elementSize, mctx };
            // Capture onReadableDrop from the value if present
            if (value && typeof (value as any).onReadableDrop === 'function') {
                entry.onReadableDrop = (value as any).onReadableDrop as () => void;
            }
            entries.set(readHandle, entry);
            jsReadables.set(readHandle, value);
            // If the value is an async iterable, pump it into the buffer
            if (value && typeof (value as any)[Symbol.asyncIterator] === 'function') {
                pumpIterable(value as AsyncIterable<unknown>, entry);
            }
            return readHandle;
        },
        getReadable(_typeIdx: number, handle: number): unknown {
            return jsReadables.get(handle);
        },
        removeReadable(_typeIdx: number, handle: number): unknown {
            const val = jsReadables.get(handle);
            if (val) {
                jsReadables.delete(handle);
                return val;
            }
            // For stream.new()-created handles, create an async iterable from the buffer
            const base = baseHandle(handle);
            const entry = entries.get(base);
            if (entry) return makeAsyncIterable(entry);
            return undefined;
        },
        addWritable(_typeIdx: number, value: unknown): number {
            const writHandle = allocHandle() + 1;
            entries.set(writHandle & ~1, { chunks: [], closed: false });
            jsWritables.set(writHandle, value);
            return writHandle;
        },
        getWritable(_typeIdx: number, handle: number): unknown {
            return jsWritables.get(handle);
        },
        removeWritable(_typeIdx: number, handle: number): unknown {
            const val = jsWritables.get(handle);
            jsWritables.delete(handle);
            return val;
        },

        hasStream(baseHandle: number): boolean {
            return entries.has(baseHandle);
        },

        hasData(baseHandle: number): boolean {
            const entry = entries.get(baseHandle);
            if (!entry) return false;
            return entry.chunks.length > 0 || entry.closed;
        },

        onReady(baseHandle: number, callback: () => void): void {
            const entry = entries.get(baseHandle);
            if (!entry) return;
            if (entry.chunks.length > 0 || entry.closed) {
                callback();
                return;
            }
            if (!entry.onReady) entry.onReady = [];
            entry.onReady.push(callback);
        },

        fulfillPendingRead(handle: number): number {
            const base = baseHandle(handle);
            const entry = entries.get(base);
            if (!entry || !entry.pendingRead) return (0 << 4) | STREAM_STATUS_COMPLETED;
            const { ptr, len } = entry.pendingRead;
            entry.pendingRead = undefined;
            // Typed stream: encode elements via storer
            if (entry.elementStorer && entry.elementSize) {
                return readTypedElements(entry, ptr, len);
            }
            // Copy available data into the guest's deferred buffer
            let offset = 0;
            while (entry.chunks.length > 0 && offset < len) {
                const chunk = entry.chunks[0]! as Uint8Array;
                const needed = len - offset;
                if (chunk.length <= needed) {
                    memory.getViewU8(ptr + offset, chunk.length).set(chunk);
                    offset += chunk.length;
                    entry.chunks.shift();
                } else {
                    memory.getViewU8(ptr + offset, needed).set(chunk.subarray(0, needed));
                    offset += needed;
                    entry.chunks[0] = chunk.subarray(needed);
                }
            }
            if (offset > 0) {
                entry.bufferedBytes = Math.max(0, (entry.bufferedBytes ?? 0) - offset);
                checkWriteReady(entry);
                return (offset << 4) | STREAM_STATUS_COMPLETED;
            }
            if (entry.closed) return (0 << 4) | STREAM_STATUS_DROPPED;
            return (0 << 4) | STREAM_STATUS_COMPLETED;
        },

        hasWriteSpace(baseHandle: number): boolean {
            const entry = entries.get(baseHandle);
            if (!entry) return false;
            return (entry.bufferedBytes ?? 0) < backpressureThreshold;
        },

        onWriteReady(baseHandle: number, callback: () => void): void {
            const entry = entries.get(baseHandle);
            if (!entry) return;
            if ((entry.bufferedBytes ?? 0) < backpressureThreshold) {
                callback();
                return;
            }
            if (!entry.onWriteReady) entry.onWriteReady = [];
            entry.onWriteReady.push(callback);
        },

        dispose(): void {
            for (const entry of entries.values()) {
                entry.closed = true;
                entry.onReady = undefined;
                entry.onWriteReady = undefined;
                entry.pendingRead = undefined;
                if (entry.waitingReader) {
                    entry.waitingReader(null);
                    entry.waitingReader = undefined;
                }
            }
            entries.clear();
            jsReadables.clear();
            jsWritables.clear();
        },
    };
}
