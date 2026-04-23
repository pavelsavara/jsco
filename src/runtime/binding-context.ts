// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import isDebug from 'env:isDebug';
import type { MarshalingContext } from '../marshal/model/types';
import type { ResolvedContext } from '../resolver/model/types';
import type { JsImports } from '../resolver/api-types';
import type { RuntimeConfig } from './model/types';
import { createMemoryView } from './memory';
import { createAllocator } from './memory';
import { createInstanceTable } from './instances';
import { createResourceTable } from './resources';
import { createStreamTable } from './stream-table';
import { createFutureTable } from './future-table';
import { createSubtaskTable } from './subtask-table';
import { createErrorContextTable } from './error-context';
import { createWaitableSetTable } from './waitable-set';

export function createBindingContext(componentImports: JsImports, resolved: ResolvedContext, config?: RuntimeConfig): MarshalingContext {
    const memory = createMemoryView();
    const allocator = createAllocator();
    const instances = createInstanceTable();
    const resources = createResourceTable(resolved.verbose, resolved.logger);

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

    const streamTable = createStreamTable(memory, allocHandle, config);
    const futureTable = createFutureTable(memory, allocHandle);
    const subtaskTable = createSubtaskTable(allocHandle);

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
        waitableSets: createWaitableSetTable(memory, streamTable, futureTable, subtaskTable),
        utf8Decoder: new TextDecoder('utf-8', { fatal: true }),
        utf8Encoder: new TextEncoder(),
        verbose: resolved.verbose,
        logger: resolved.logger,
        taskContextSlots: [0, 0],
        backpressure: 0,
        pendingBackgroundTasks: [],
        abort: () => {
            // Per Component Model spec: poisoning the instance prevents all future
            // export calls from executing. checkNotPoisoned() in the lifting
            // trampoline enforces this.
            ctx.poisoned = true;
        },
    };
    if (isDebug) {
        ctx.debugStack = [];
    }
    return ctx;
}
