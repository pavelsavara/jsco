// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import isDebug from 'env:isDebug';
import type { MarshalingContext } from '../marshal/model/types';
import type { ResolvedContext } from '../resolver/model/types';
import type { JsImports } from '../resolver/api-types';
import type { RuntimeConfig } from './model/types';
import { LIMIT_DEFAULTS } from './model/types';
import { createMemoryView } from './memory';
import { createAllocator } from './memory';
import { createInstanceTable } from './instances';
import { createResourceTable } from './resources';
import { createStreamTable } from './stream-table';
import { createFutureTable } from './future-table';
import { createSubtaskTable } from './subtask-table';
import { createErrorContextTable } from './error-context';
import { createWaitableSetTable } from './waitable-set';

export function createMarshalingContext(componentImports: JsImports, resolved: ResolvedContext, config?: RuntimeConfig): MarshalingContext {
    const memory = createMemoryView();
    const allocator = createAllocator();
    const instances = createInstanceTable();
    const resources = createResourceTable(resolved.verbose, resolved.logger, config?.limits?.maxHandles);

    const abortController = new AbortController();

    // Shared handle allocator: all stream/future handles come from a single
    // counter so they never overlap. This is required by the canonical ABI
    // where stream and future handles share a single "waitables" table.
    // Must start at 2 (first even > 0) — WASM uses NonZeroU32 for handles.
    let sharedNextHandle = 2;
    function allocHandle(): number {
        const h = sharedNextHandle;
        sharedNextHandle += 2; // even = readable, odd = writable
        return h;
    }

    const streamTable = createStreamTable(memory, allocHandle, config, abortController.signal);
    const futureTable = createFutureTable(memory, allocHandle, abortController.signal);
    const subtaskTable = createSubtaskTable(allocHandle);
    const waitableSetTable = createWaitableSetTable(memory, streamTable, futureTable, subtaskTable, abortController.signal);

    const ctx: MarshalingContext = {
        componentImports,
        instances,
        memory,
        allocator,
        resources,
        streams: streamTable,
        futures: futureTable,
        subtasks: subtaskTable,
        errorContexts: createErrorContextTable(),
        waitableSets: waitableSetTable,
        utf8Decoder: new TextDecoder('utf-8', { fatal: true }),
        utf8Encoder: new TextEncoder(),
        verbose: resolved.verbose,
        logger: resolved.logger,
        currentTask: { slots: [0, 0] },
        backpressure: 0,
        pendingBackgroundTasks: [],
        opsSinceYield: resolved.yieldThrottle !== undefined ? 0 : undefined,
        maxMemoryBytes: config?.limits?.maxMemoryBytes,
        maxAllocationSize: config?.limits?.maxAllocationSize ?? LIMIT_DEFAULTS.maxAllocationSize,
        canonOpsSinceYield: 0,
        maxCanonOpsWithoutYield: config?.limits?.maxCanonOpsWithoutYield ?? LIMIT_DEFAULTS.maxCanonOpsWithoutYield,
        maxBlockingTimeMs: config?.limits?.maxBlockingTimeMs ?? LIMIT_DEFAULTS.maxBlockingTimeMs,
        maxHeapGrowthPerYield: config?.limits?.maxHeapGrowthPerYield ?? LIMIT_DEFAULTS.maxHeapGrowthPerYield,
        heapAtLastYield: 0,
        heapGrowthOverCount: 0,
        abortSignal: abortController.signal,
        abort: (reason?: string) => {
            ctx.poisoned = true;
            abortController.abort(new Error(reason ?? 'component instance trapped'));
        },
        dispose: () => {
            if (ctx.poisoned) return;
            ctx.abort('component instance disposed');
            streamTable.dispose();
            futureTable.dispose();
            subtaskTable.dispose();
            waitableSetTable.dispose();
            resources.disposeOwned(resolved.ownInstanceResources);
        },
    };
    if (isDebug) {
        ctx.debugStack = [];
    }
    return ctx;
}
