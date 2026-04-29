// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { MarshalingContext } from '../marshal/model/types';

/** Number of consecutive over-cap heap samples that must occur before
 *  the watchdog aborts — absorbs GC lag and one-off allocation spikes. */
const HEAP_GROWTH_TRIPS_TO_ABORT = 3;

interface MemoryHook { usedJSHeapSize?: number }

let getHeapUsed: () => number;
if (typeof process !== 'undefined' && typeof process.memoryUsage === 'function') {
    getHeapUsed = (): number => process.memoryUsage().heapUsed;
} else if (typeof performance !== 'undefined' && (performance as unknown as { memory?: MemoryHook }).memory) {
    const m = (performance as unknown as { memory: MemoryHook }).memory;
    getHeapUsed = (): number => m.usedJSHeapSize ?? 0;
} else {
    getHeapUsed = (): number => 0;
}

/**
 * Sample host-process heap at a JSPI yield resume; abort the instance if
 * growth since the last yield exceeds the cap for `HEAP_GROWTH_TRIPS_TO_ABORT`
 * consecutive samples (filters GC lag). Sampled at every JSPI yield site:
 * throttle `setImmediate`, host-import resume, `waitable-set.wait` resume.
 * No-op when the cap is unset/zero or no heap-introspection API is available.
 */
export function checkHeapGrowth(mctx: MarshalingContext): void {
    const cap = mctx.maxHeapGrowthPerYield;
    if (!cap || cap <= 0) return;
    const now = getHeapUsed();
    if (now === 0) return;
    const last = mctx.heapAtLastYield ?? 0;
    if (last > 0 && now - last > cap) {
        const trips = (mctx.heapGrowthOverCount ?? 0) + 1;
        mctx.heapGrowthOverCount = trips;
        if (trips >= HEAP_GROWTH_TRIPS_TO_ABORT) {
            const delta = now - last;
            const msg = `heap-growth budget exceeded: ${delta} > ${cap} bytes per yield ` +
                `(${trips} consecutive over-cap samples; likely host-state DOS)`;
            mctx.abort(msg);
            throw new WebAssembly.RuntimeError(msg);
        }
    } else {
        mctx.heapGrowthOverCount = 0;
    }
    mctx.heapAtLastYield = now;
}

/** Test-only: read the current heap-used value via the same backend the
 *  watchdog uses. Returns 0 when the embedder does not expose introspection. */
export function _getHeapUsedForTests(): number {
    return getHeapUsed();
}
