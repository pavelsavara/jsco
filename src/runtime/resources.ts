// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import isDebug from 'env:isDebug';
import { LogLevel } from '../utils/assert';
import type { LogFn, Verbosity } from '../utils/assert';
import type { ResourceTable } from './model/types';

export function createResourceTable(verbose?: Verbosity, logger?: LogFn): ResourceTable {
    let nextHandle = 1;

    // Resource handle table — handles are globally unique (monotonic counter).
    // Each handle stores the canonical resource type index (the unified type
    // index of the ComponentTypeResource definition). own<T>/borrow<T> both
    // use the same canonical index (their .value field), so per-type isolation
    // is enforced: get/remove/has validate that the requested type matches.
    const handles = new Map<number, { typeIdx: number; obj: unknown; numLends: number }>();

    function getEntry(resourceTypeIdx: number, handle: number): { typeIdx: number; obj: unknown; numLends: number } {
        const entry = handles.get(handle);
        if (entry === undefined) throw new Error(`Invalid resource handle: ${handle}`);
        if (entry.typeIdx !== resourceTypeIdx) throw new Error(`Resource handle ${handle} belongs to type ${entry.typeIdx}, not ${resourceTypeIdx}`);
        return entry;
    }

    return {
        add(resourceTypeIdx: number, obj: unknown): number {
            const handle = nextHandle++;
            handles.set(handle, { typeIdx: resourceTypeIdx, obj, numLends: 0 });
            if (isDebug && (verbose?.executor ?? 0) >= LogLevel.Detailed) {
                logger!('executor', LogLevel.Detailed, `resource.add(typeIdx=${resourceTypeIdx}, handle=${handle})`);
            }
            return handle;
        },
        get(resourceTypeIdx: number, handle: number): unknown {
            const entry = getEntry(resourceTypeIdx, handle);
            if (isDebug && (verbose?.executor ?? 0) >= LogLevel.Detailed) {
                logger!('executor', LogLevel.Detailed, `resource.get(typeIdx=${resourceTypeIdx}, handle=${handle})`);
            }
            return entry.obj;
        },
        remove(resourceTypeIdx: number, handle: number): unknown {
            const entry = getEntry(resourceTypeIdx, handle);
            if (entry.numLends !== 0) throw new Error(`Cannot drop resource handle ${handle}: ${entry.numLends} outstanding borrow(s)`);
            handles.delete(handle);
            if (isDebug && (verbose?.executor ?? 0) >= LogLevel.Detailed) {
                logger!('executor', LogLevel.Detailed, `resource.remove(typeIdx=${resourceTypeIdx}, handle=${handle})`);
            }
            return entry.obj;
        },
        has(resourceTypeIdx: number, handle: number): boolean {
            const entry = handles.get(handle);
            return entry !== undefined && entry.typeIdx === resourceTypeIdx;
        },
        lend(resourceTypeIdx: number, handle: number): void {
            const entry = getEntry(resourceTypeIdx, handle);
            entry.numLends++;
            if (isDebug && (verbose?.executor ?? 0) >= LogLevel.Detailed) {
                logger!('executor', LogLevel.Detailed, `resource.lend(typeIdx=${resourceTypeIdx}, handle=${handle}, numLends=${entry.numLends})`);
            }
        },
        unlend(resourceTypeIdx: number, handle: number): void {
            const entry = getEntry(resourceTypeIdx, handle);
            if (entry.numLends <= 0) throw new Error(`Cannot unlend resource handle ${handle}: no outstanding borrows`);
            entry.numLends--;
            if (isDebug && (verbose?.executor ?? 0) >= LogLevel.Detailed) {
                logger!('executor', LogLevel.Detailed, `resource.unlend(typeIdx=${resourceTypeIdx}, handle=${handle}, numLends=${entry.numLends})`);
            }
        },
        lendCount(resourceTypeIdx: number, handle: number): number {
            const entry = getEntry(resourceTypeIdx, handle);
            return entry.numLends;
        },
        disposeOwned(ownTypeIds: Set<number>): void {
            for (const [handle, entry] of handles) {
                if (ownTypeIds.has(entry.typeIdx)) {
                    handles.delete(handle);
                }
            }
        }
    };
}
