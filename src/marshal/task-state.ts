// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { MarshalingContext, TaskState } from './model/types';

/**
 * Install `task` as `mctx.currentTask` and return the previous task so the
 * caller can restore it in a `finally` block.
 *
 * Allocation-free wasm-boundary swap helper. JS is single-threaded, so
 * between awaits exactly one task is active; canon built-ins
 * (`context.get`/`context.set`/`task.return`) read everything they need
 * through `mctx.currentTask`. Pairs with a literal `mctx.currentTask = prev`
 * (no helper needed for the restore side — direct assignment keeps the
 * cleanup visible at the call site and avoids extra closures or microtasks
 * on hot paths like the async-lift event-delivery loop).
 *
 * Usage:
 * ```
 * const prev = pushTask(mctx, task);
 * try { status = await coreFn(...); }
 * finally { mctx.currentTask = prev; }
 * ```
 */
export function pushTask(mctx: MarshalingContext, task: TaskState): TaskState {
    const prev = mctx.currentTask;
    mctx.currentTask = task;
    return prev;
}
