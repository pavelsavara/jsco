// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { SubtaskState } from './model/types';
import type { SubtaskTable, SubtaskEntry } from './model/types';

export function createSubtaskTable(allocHandle: () => number): SubtaskTable {
    const entries = new Map<number, SubtaskEntry>();

    return {
        create(promise: Promise<unknown>): number {
            const handle = allocHandle();
            const entry: SubtaskEntry = {
                state: SubtaskState.STARTED,
                resolved: false,
            };
            entries.set(handle, entry);

            promise.then(
                () => {
                    entry.state = SubtaskState.RETURNED;
                    entry.resolved = true;
                    if (entry.onResolve) {
                        for (const cb of entry.onResolve) cb();
                        entry.onResolve = undefined;
                    }
                },
                () => {
                    entry.state = SubtaskState.RETURNED;
                    entry.resolved = true;
                    if (entry.onResolve) {
                        for (const cb of entry.onResolve) cb();
                        entry.onResolve = undefined;
                    }
                }
            );

            return handle;
        },

        getEntry(handle: number): SubtaskEntry | undefined {
            return entries.get(handle);
        },

        cancel(handle: number): number {
            const entry = entries.get(handle);
            if (!entry) {
                throw new WebAssembly.RuntimeError(`subtask.cancel: unknown handle ${handle}`);
            }
            // Idempotent on already-resolved subtasks: state stays RETURNED.
            if (!entry.resolved) {
                entry.state = SubtaskState.RETURNED;
                entry.resolved = true;
                if (entry.onResolve) {
                    for (const cb of entry.onResolve) cb();
                    entry.onResolve = undefined;
                }
            }
            return entry.state;
        },

        drop(handle: number): void {
            entries.delete(handle);
        },

        dispose(): void {
            for (const entry of entries.values()) {
                entry.onResolve = undefined;
            }
            entries.clear();
        },
    };
}
