// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/** Opaque integer handle for a managed resource. */
export type HandleId = number;

/** Configuration for a HandleTable instance. */
export interface HandleTableConfig {
    /** Maximum number of live handles. Default: 10_000. */
    maxHandles?: number;
}

const DEFAULT_MAX_HANDLES = 10_000;

/**
 * A generic handle table that maps integer handles to values of type `T`.
 *
 * Handles are non-negative integers starting at 0.
 * Dropped handles are recycled via a free-list (LIFO).
 */
export interface HandleTable<T> {
    /** Allocate a new handle for `value`. Throws if the table is full. */
    alloc(value: T): HandleId;
    /** Retrieve the value for `handle`. Returns `undefined` if invalid. */
    get(handle: HandleId): T | undefined;
    /** Drop `handle`, returning the value. Throws if invalid or already dropped. */
    drop(handle: HandleId): T;
    /** Number of currently live (non-dropped) handles. */
    readonly size: number;
}

/**
 * Create a new HandleTable with an optional size limit and free-list recycling.
 */
export function createHandleTable<T>(config?: HandleTableConfig): HandleTable<T> {
    const maxHandles = config?.maxHandles ?? DEFAULT_MAX_HANDLES;

    // Slots: undefined means the slot is free (or never allocated).
    // We store { value } wrappers so we can distinguish "stores undefined" from "free slot".
    const slots: ({ value: T } | undefined)[] = [];
    const freeList: number[] = [];
    let liveCount = 0;

    return {
        alloc(value: T): HandleId {
            if (liveCount >= maxHandles) {
                throw new Error(`HandleTable: maximum handle limit (${maxHandles}) exceeded`);
            }
            let handle: HandleId;
            if (freeList.length > 0) {
                handle = freeList.pop()!;
            } else {
                handle = slots.length;
                slots.push(undefined); // grow
            }
            slots[handle] = { value };
            liveCount++;
            return handle;
        },

        get(handle: HandleId): T | undefined {
            if (typeof handle !== 'number' || handle < 0 || handle >= slots.length || (handle | 0) !== handle) {
                return undefined;
            }
            const slot = slots[handle];
            return slot?.value;
        },

        drop(handle: HandleId): T {
            if (typeof handle !== 'number' || handle < 0 || handle >= slots.length || (handle | 0) !== handle) {
                throw new Error(`HandleTable: invalid handle: ${handle}`);
            }
            const slot = slots[handle];
            if (slot === undefined) {
                throw new Error(`HandleTable: use-after-drop on handle ${handle}`);
            }
            const value = slot.value;
            slots[handle] = undefined;
            freeList.push(handle);
            liveCount--;
            return value;
        },

        get size(): number {
            return liveCount;
        },
    };
}
