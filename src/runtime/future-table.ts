// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { MarshalingContext } from '../marshal/model/types';
import type { MemoryView, FutureTable, FutureStorer } from './model/types';
import { STREAM_STATUS_COMPLETED, STREAM_STATUS_DROPPED, STREAM_STATUS_CANCELLED, STREAM_BLOCKED } from './constants';

type FutureEntry = {
    resolved: boolean;
    /** Whether the Promise was rejected (error case). */
    rejected?: boolean;
    /** Stored bytes from future.write, copied back on future.read. */
    data?: Uint8Array;
    /** Resolved JS value from the Promise (for storer-based encoding). */
    resolvedValue?: unknown;
    /** Storer callback to encode resolved value into WASM memory. */
    storer?: FutureStorer;
    /** Pending read: ptr and mctx saved when future.read returns BLOCKED. */
    pendingRead?: { ptr: number, mctx: MarshalingContext };
    /** Callbacks to invoke when this future resolves (for waitable-set integration). */
    onResolve?: (() => void)[];
};

export function createFutureTable(memory: MemoryView, allocHandle: () => number, signal: AbortSignal = new AbortController().signal): FutureTable {
    const entries = new Map<number, FutureEntry>();
    const jsReadables = new Map<number, unknown>();
    const jsWritables = new Map<number, unknown>();

    function resolveEntry(base: number, entry: FutureEntry): void {
        entry.resolved = true;
        // If there's a pending read, write the resolved value to guest memory now
        if (entry.pendingRead && entry.storer && !signal.aborted) {
            entry.storer(entry.pendingRead.mctx, entry.pendingRead.ptr, entry.resolvedValue, entry.rejected);
            entry.pendingRead = undefined;
        }
        if (entry.onResolve) {
            for (const cb of entry.onResolve) cb();
            entry.onResolve = undefined;
        }
    }

    return {
        newFuture(_typeIdx: number): bigint {
            const readHandle = allocHandle();
            const writHandle = readHandle + 1;
            entries.set(readHandle, { resolved: false });
            return BigInt(writHandle) << 32n | BigInt(readHandle);
        },

        read(_typeIdx: number, handle: number, ptr: number, mctx?: MarshalingContext): number {
            const base = handle & ~1;
            const entry = entries.get(base);
            if (!entry) { return (0 << 4) | STREAM_STATUS_DROPPED; }
            if (!entry.resolved) {
                // Save the target pointer and context for deferred writing.
                // When the Promise resolves, resolveEntry will write data to this ptr.
                if (mctx && entry.storer) {
                    entry.pendingRead = { ptr, mctx };
                } else {
                    // Track that a read was attempted (returned BLOCKED) so a
                    // subsequent cancel-read can correctly return CANCELLED.
                    entry.pendingRead = { ptr, mctx: mctx as MarshalingContext };
                }
                return STREAM_BLOCKED;
            }
            // Already resolved — write immediately
            if (entry.storer && mctx) {
                entry.storer(mctx, ptr, entry.resolvedValue, entry.rejected);
            } else if (entry.data && entry.data.length > 0) {
                // Fallback: copy stored raw bytes
                memory.getViewU8(ptr, entry.data.length).set(entry.data);
            }
            return (0 << 4) | STREAM_STATUS_COMPLETED;
        },

        write(_typeIdx: number, handle: number, ptr: number): number {
            const base = handle & ~1;
            const entry = entries.get(base);
            if (!entry) return (0 << 4) | STREAM_STATUS_DROPPED;
            // For now, store a reasonable amount of bytes from WASM memory.
            // The exact size depends on the type T, but we store a safe maximum
            // and let future.read copy them back.
            if (ptr !== 0) {
                // Store up to 256 bytes (generous for most future types)
                const copyLen = Math.min(256, memory.getMemory().buffer.byteLength - ptr);
                if (copyLen > 0) {
                    entry.data = new Uint8Array(memory.getViewU8(ptr, copyLen));
                }
            }
            resolveEntry(base, entry);
            return (0 << 4) | STREAM_STATUS_COMPLETED;
        },

        cancelRead(_typeIdx: number, handle: number): number {
            const base = handle & ~1;
            const entry = entries.get(base);
            if (!entry) return (0 << 4) | STREAM_STATUS_DROPPED;
            const hadPending = entry.pendingRead !== undefined;
            entry.pendingRead = undefined;
            if (entry.resolved) return (0 << 4) | STREAM_STATUS_COMPLETED;
            if (hadPending) return (0 << 4) | STREAM_STATUS_CANCELLED;
            return (0 << 4) | STREAM_STATUS_COMPLETED;
        },

        cancelWrite(_typeIdx: number, handle: number): number {
            const base = handle & ~1;
            const entry = entries.get(base);
            if (!entry) return (0 << 4) | STREAM_STATUS_DROPPED;
            if (entry.resolved) return (0 << 4) | STREAM_STATUS_COMPLETED;
            return (0 << 4) | STREAM_STATUS_CANCELLED;
        },

        dropReadable(_typeIdx: number, handle: number): void {
            jsReadables.delete(handle);
        },

        dropWritable(_typeIdx: number, handle: number): void {
            jsWritables.delete(handle);
            const base = handle & ~1;
            const entry = entries.get(base);
            if (entry && !entry.resolved) {
                resolveEntry(base, entry);
            }
        },

        addReadable(_typeIdx: number, value: unknown, storer?: FutureStorer): number {
            const readHandle = allocHandle();
            const entry: FutureEntry = { resolved: false, storer };
            entries.set(readHandle, entry);
            jsReadables.set(readHandle, value);
            // If the value is a Promise, track its resolution and capture the resolved value
            if (value && typeof (value as any).then === 'function') {
                (value as Promise<unknown>).then(
                    (resolvedValue) => {
                        entry.resolvedValue = resolvedValue;
                        resolveEntry(readHandle, entry);
                    },
                    (rejectedValue) => {
                        entry.resolvedValue = rejectedValue;
                        entry.rejected = true;
                        resolveEntry(readHandle, entry);
                    },
                );
            } else {
                // Non-Promise values are immediately resolved
                entry.resolvedValue = value;
                entry.resolved = true;
            }
            return readHandle;
        },
        getReadable(_typeIdx: number, handle: number): unknown {
            return jsReadables.get(handle);
        },
        removeReadable(_typeIdx: number, handle: number): unknown {
            const val = jsReadables.get(handle);
            jsReadables.delete(handle);
            return val;
        },
        addWritable(_typeIdx: number, value: unknown): number {
            const writHandle = allocHandle() + 1;
            entries.set(writHandle & ~1, { resolved: false });
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
        getEntry(handle: number): FutureEntry | undefined {
            const base = handle & ~1;
            return entries.get(base);
        },

        dispose(): void {
            for (const entry of entries.values()) {
                entry.onResolve = undefined;
                entry.pendingRead = undefined;
            }
            entries.clear();
            jsReadables.clear();
            jsWritables.clear();
        },
    };
}
