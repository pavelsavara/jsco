// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import isDebug from 'env:isDebug';
import { LogLevel } from '../utils/assert';
import type { LogFn, Verbosity } from '../utils/assert';
import type { MemoryView, StreamTable, FutureTable, SubtaskTable, WaitableSetTable } from './model/types';
import { STREAM_STATUS_COMPLETED, EVENT_SUBTASK, EVENT_STREAM_READ, EVENT_STREAM_WRITE, EVENT_FUTURE_READ, EVENT_FUTURE_WRITE } from './constants';

function eventTag(eventCode: number, handle: number): string {
    const base = handle & ~1;
    const end = (handle & 1) === 0 ? 'r' : 'w';
    switch (eventCode) {
        case EVENT_SUBTASK: return `subtask#${handle}`;
        case EVENT_STREAM_READ: return `stream#${base}r`;
        case EVENT_STREAM_WRITE: return `stream#${base}w`;
        case EVENT_FUTURE_READ: return `future#${base}r`;
        case EVENT_FUTURE_WRITE: return `future#${base}w`;
        default: return `waitable#${handle}${end}`;
    }
}

function kindTag(handle: number, isStream: boolean, isSubtask: boolean): string {
    const base = handle & ~1;
    const end = (handle & 1) === 0 ? 'r' : 'w';
    if (isSubtask) return `subtask#${handle}`;
    if (isStream) return `stream#${base}${end}`;
    return `future#${base}${end}`;
}

export function createWaitableSetTable(memory: MemoryView, streamTable: StreamTable, futureTable: FutureTable, subtaskTable: SubtaskTable, signal: AbortSignal = new AbortController().signal, verbose?: Verbosity, logger?: LogFn): WaitableSetTable {
    let nextSetId = 1; // Must start at 1 — WASM uses NonZeroU32
    // Each set tracks which handles are joined and pending operations
    const sets = new Map<number, Set<number>>();
    // Map handle → { eventCode, resolve callback }
    const pendingWaitables = new Map<number, { eventCode: number, ready: boolean, resolvers: (() => void)[] }>();

    return {
        newSet(): number {
            const id = nextSetId++;
            sets.set(id, new Set());
            return id;
        },

        wait(setId: number, ptr: number): number | Promise<number> {
            const set = sets.get(setId);
            if (!set) return 0;

            // Spec: task.wait returns exactly ONE event.
            for (const handle of set) {
                const waitable = pendingWaitables.get(handle);
                if (waitable && waitable.ready) {
                    waitable.ready = false;
                    const ev = {
                        eventCode: waitable.eventCode,
                        handle,
                        returnCode: returnCodeFor(handle, waitable.eventCode),
                    };
                    if (isDebug && (verbose?.executor ?? 0) >= LogLevel.Detailed) {
                        logger!('executor', LogLevel.Detailed, `[wait-set#${setId}] wait → ready immediately: ${eventTag(ev.eventCode, ev.handle)}`);
                    }
                    return writeEvents(ptr, [ev]);
                }
            }

            if (isDebug && (verbose?.executor ?? 0) >= LogLevel.Detailed) {
                const tags = Array.from(set).map(h => {
                    const w = pendingWaitables.get(h);
                    return w ? eventTag(w.eventCode, h) : `?#${h}`;
                }).join(',');
                logger!('executor', LogLevel.Detailed, `[wait-set#${setId}] wait → BLOCKING (no events ready); set={${tags}} — wasm task suspends here via JSPI`);
            }
            // No events ready — return a Promise that resolves when one becomes ready
            return new Promise<number>((resolve, reject) => {
                if (signal.aborted) {
                    reject(signal.reason);
                    return;
                }
                let settled = false;
                function onAbort(): void {
                    if (settled) return;
                    settled = true;
                    reject(signal.reason);
                }
                signal.addEventListener('abort', onAbort, { once: true });
                for (const handle of set) {
                    const waitable = pendingWaitables.get(handle);
                    if (waitable) {
                        waitable.resolvers.push(() => {
                            if (settled) return;
                            settled = true;
                            signal.removeEventListener('abort', onAbort);
                            // Find ONE ready event and deliver it
                            for (const h of set) {
                                const w = pendingWaitables.get(h);
                                if (w && w.ready) {
                                    w.ready = false;
                                    const ev = {
                                        eventCode: w.eventCode,
                                        handle: h,
                                        returnCode: returnCodeFor(h, w.eventCode),
                                    };
                                    if (isDebug && (verbose?.executor ?? 0) >= LogLevel.Detailed) {
                                        logger!('executor', LogLevel.Detailed, `[wait-set#${setId}] wait resolved: ${eventTag(ev.eventCode, ev.handle)}`);
                                    }
                                    resolve(writeEvents(ptr, [ev]));
                                    return;
                                }
                            }
                            // Resolver fired but nothing ready (edge case)
                            if (isDebug && (verbose?.executor ?? 0) >= LogLevel.Detailed) {
                                logger!('executor', LogLevel.Detailed, `[wait-set#${setId}] wait resolved: <empty>`);
                            }
                            resolve(0);
                        });
                    }
                }
            });
        },

        poll(setId: number, ptr: number): number {
            const set = sets.get(setId);
            if (!set) return 0;

            // Spec: task.poll returns 0 or 1 events.
            for (const handle of set) {
                const waitable = pendingWaitables.get(handle);
                if (waitable && waitable.ready) {
                    waitable.ready = false;
                    return writeEvents(ptr, [{
                        eventCode: waitable.eventCode,
                        handle,
                        returnCode: returnCodeFor(handle, waitable.eventCode),
                    }]);
                }
            }
            return 0;
        },

        /** Same wait semantics as `wait`, but returns events as JS objects
         *  rather than writing to linear memory. Used by the callback-form
         *  async-lift trampoline. Returns exactly ONE event per the spec. */
        waitJs(setId: number): { eventCode: number; handle: number; returnCode: number }[] | Promise<{ eventCode: number; handle: number; returnCode: number }[]> {
            const set = sets.get(setId);
            if (!set) return [];

            // Spec: one event per wait.
            for (const handle of set) {
                const waitable = pendingWaitables.get(handle);
                if (waitable && waitable.ready) {
                    waitable.ready = false;
                    const ev = {
                        eventCode: waitable.eventCode,
                        handle,
                        returnCode: returnCodeFor(handle, waitable.eventCode),
                    };
                    if (isDebug && (verbose?.executor ?? 0) >= LogLevel.Detailed) {
                        logger!('executor', LogLevel.Detailed, `[wait-set#${setId}] waitJs → ready immediately: ${eventTag(ev.eventCode, ev.handle)}`);
                    }
                    return [ev];
                }
            }

            if (isDebug && (verbose?.executor ?? 0) >= LogLevel.Detailed) {
                const tags = Array.from(set).map(h => {
                    const w = pendingWaitables.get(h);
                    return w ? eventTag(w.eventCode, h) : `?#${h}`;
                }).join(',');
                logger!('executor', LogLevel.Detailed, `[wait-set#${setId}] waitJs → BLOCKING (no events ready); set={${tags}} — wasm task suspends here via JSPI`);
            }

            return new Promise<{ eventCode: number; handle: number; returnCode: number }[]>((resolve, reject) => {
                if (signal.aborted) {
                    reject(signal.reason);
                    return;
                }
                let settled = false;
                function onAbort(): void {
                    if (settled) return;
                    settled = true;
                    reject(signal.reason);
                }
                signal.addEventListener('abort', onAbort, { once: true });
                for (const handle of set) {
                    const waitable = pendingWaitables.get(handle);
                    if (waitable) {
                        waitable.resolvers.push(() => {
                            if (settled) return;
                            settled = true;
                            signal.removeEventListener('abort', onAbort);
                            // Find ONE ready event
                            for (const h of set) {
                                const w = pendingWaitables.get(h);
                                if (w && w.ready) {
                                    w.ready = false;
                                    const ev = {
                                        eventCode: w.eventCode,
                                        handle: h,
                                        returnCode: returnCodeFor(h, w.eventCode),
                                    };
                                    if (isDebug && (verbose?.executor ?? 0) >= LogLevel.Detailed) {
                                        logger!('executor', LogLevel.Detailed, `[wait-set#${setId}] waitJs resolved: ${eventTag(ev.eventCode, ev.handle)}`);
                                    }
                                    resolve([ev]);
                                    return;
                                }
                            }
                            if (isDebug && (verbose?.executor ?? 0) >= LogLevel.Detailed) {
                                logger!('executor', LogLevel.Detailed, `[wait-set#${setId}] waitJs resolved: <empty>`);
                            }
                            resolve([]);
                        });
                    }
                }
            });
        },

        drop(setId: number): void {
            const set = sets.get(setId);
            if (set) {
                for (const handle of set) {
                    pendingWaitables.delete(handle);
                }
                sets.delete(setId);
            }
        },

        join(waitableHandle: number, setId: number): void {
            // setId=0 means "disjoin" — remove handle from any set
            if (setId === 0) {
                for (const [, s] of sets) {
                    s.delete(waitableHandle);
                }
                pendingWaitables.delete(waitableHandle);
                if (isDebug && (verbose?.executor ?? 0) >= LogLevel.Detailed) {
                    logger!('executor', LogLevel.Detailed, `[waitable#${waitableHandle}] disjoin from all sets`);
                }
                return;
            }
            const set = sets.get(setId);
            if (!set) return;
            set.add(waitableHandle);
            // Register this handle as a pending waitable
            if (!pendingWaitables.has(waitableHandle)) {
                // Check subtask table first (subtask handles use even allocations)
                const subtaskEntry = subtaskTable.getEntry(waitableHandle);

                // Determine event type based on handle parity:
                // Even handles are readable, odd are writable
                const isWritable = (waitableHandle & 1) !== 0;

                // Check both stream and future tables to determine the event type
                // and wire up readiness tracking. Handles are unique across tables
                // thanks to the shared allocator.
                const futureEntry = !subtaskEntry ? futureTable.getEntry(waitableHandle & ~1) : undefined;
                const isStream = !subtaskEntry && !futureEntry && streamTable.hasStream(waitableHandle & ~1);

                let eventCode: number;
                if (subtaskEntry) {
                    eventCode = EVENT_SUBTASK;
                } else if (isStream) {
                    eventCode = isWritable ? EVENT_STREAM_WRITE : EVENT_STREAM_READ;
                } else {
                    eventCode = isWritable ? EVENT_FUTURE_WRITE : EVENT_FUTURE_READ;
                }

                const entry: { eventCode: number, ready: boolean, resolvers: (() => void)[] } = {
                    eventCode,
                    ready: false,
                    resolvers: [],
                };
                pendingWaitables.set(waitableHandle, entry);

                if (isDebug && (verbose?.executor ?? 0) >= LogLevel.Detailed) {
                    logger!('executor', LogLevel.Detailed, `[wait-set#${setId}] join ${kindTag(waitableHandle, !!isStream, !!subtaskEntry)}`);
                }

                // Wire up readiness tracking based on the table type
                if (subtaskEntry) {
                    if (!subtaskEntry.resolved) {
                        if (!subtaskEntry.onResolve) subtaskEntry.onResolve = [];
                        subtaskEntry.onResolve.push(() => {
                            entry.ready = true;
                            for (const cb of entry.resolvers) cb();
                        });
                    } else {
                        entry.ready = true;
                    }
                } else if (futureEntry) {
                    if (!futureEntry.resolved) {
                        if (!futureEntry.onResolve) futureEntry.onResolve = [];
                        futureEntry.onResolve.push(() => {
                            entry.ready = true;
                            for (const cb of entry.resolvers) cb();
                        });
                    } else {
                        entry.ready = true;
                    }
                } else if (isStream) {
                    // Wire up async readiness for streams
                    if (isWritable) {
                        // Write side: ready when buffer has space
                        const writeReady = streamTable.hasWriteSpace(waitableHandle & ~1);
                        if (writeReady) {
                            entry.ready = true;
                        } else {
                            streamTable.onWriteReady(waitableHandle & ~1, () => {
                                entry.ready = true;
                                for (const cb of entry.resolvers) cb();
                            });
                        }
                    } else {
                        // Read side: ready when data is available
                        const streamReady = streamTable.hasData(waitableHandle & ~1);
                        if (streamReady) {
                            entry.ready = true;
                        } else {
                            streamTable.onReady(waitableHandle & ~1, () => {
                                entry.ready = true;
                                for (const cb of entry.resolvers) cb();
                            });
                        }
                    }
                }
            }
        },

        dispose(): void {
            for (const waitable of pendingWaitables.values()) {
                for (const cb of waitable.resolvers) {
                    try { cb(); } catch { /* already aborted */ }
                }
                waitable.resolvers.length = 0;
            }
            pendingWaitables.clear();
            sets.clear();
        },
    };

    function writeEvents(ptr: number, events: { eventCode: number, handle: number, returnCode: number }[]): number {
        if (events.length === 0) return 0;
        const view = memory.getView(ptr, events.length * 12);
        for (let i = 0; i < events.length; i++) {
            const e = events[i]!;
            view.setInt32(i * 12, e.eventCode, true);
            view.setInt32(i * 12 + 4, e.handle, true);
            view.setInt32(i * 12 + 8, e.returnCode, true);
        }
        return events.length;
    }

    function returnCodeFor(handle: number, eventCode: number): number {
        if (eventCode === EVENT_SUBTASK) {
            const se = subtaskTable.getEntry(handle);
            return se ? se.state : 0;
        }
        if (eventCode === EVENT_STREAM_READ) {
            return streamTable.fulfillPendingRead(handle);
        }
        return (0 << 4) | STREAM_STATUS_COMPLETED;
    }
}
