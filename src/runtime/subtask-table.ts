// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

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
