// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { initializeAsserts } from '../../src/utils/assert';
initializeAsserts();

import { liftFlatFlat } from '../../src/marshal/trampoline-lift';
import { lowerFlatFlat } from '../../src/marshal/trampoline-lower';
import type { FunctionLiftPlan } from '../../src/marshal/model/lift-plans';
import type { FunctionLowerPlan } from '../../src/marshal/model/lower-plans';
import type { MarshalingContext, TaskState } from '../../src/marshal/model/types';

/**
 * Per-task `currentTask` isolation contract:
 *
 * - On entry to any sync lift trampoline, a fresh `TaskState` with `slots:
 *   [0, 0]` is installed as `ctx.currentTask`. The previous task is restored
 *   when the wasm function (which may return a Promise via JSPI) settles.
 * - On every host-import lower trampoline that awaits a Promise, the calling
 *   task is captured before the await and restored before wasm resumes. This
 *   guarantees that even when concurrent reentrant tasks interleave, canon
 *   built-ins (`context.get`/`context.set`/`task.return`) always read the
 *   current task's per-task state through `mctx.currentTask`, not whatever
 *   the most recently-entered task wrote.
 *
 * These are unit tests for the trampoline contract; the integration
 * scenarios in `tests/host/wasip3/jspi-parallel.test.ts` exercise the same
 * machinery end-to-end via real WASM components.
 */

function createBareCtx(): MarshalingContext {
    return {
        currentTask: { slots: [0, 0] } as TaskState,
        abort: () => undefined,
        verbose: undefined,
        logger: undefined,
    } as unknown as MarshalingContext;
}

const noOpLiftPlan: FunctionLiftPlan = {
    paramLifters: [],
    paramStorers: [],
    resultLowerers: [],
    resultLoader: undefined,
    spilledParamOffsets: [],
    spilledParamsTotalSize: 0,
    spilledParamsMaxAlign: 1,
    totalFlatParams: 0,
    i64ParamPositions: [],
};

const noOpLowerPlan: FunctionLowerPlan = {
    paramLowerers: [],
    paramLoaders: [],
    paramStorers: [],
    resultLifters: [],
    resultStorer: undefined,
    spilledParamOffsets: [],
    spilledParamsTotalSize: 0,
    spilledParamsMaxAlign: 1,
    totalFlatParams: 0,
    i64ParamPositions: [],
    resultBuf: [0],
    resultIsI64: false,
    hasFutureOrStreamReturn: false,
} as unknown as FunctionLowerPlan;

describe('per-task currentTask isolation', () => {
    test('sync lift trampoline installs fresh task and restores on return', () => {
        const ctx = createBareCtx();
        const sentinelDefault = ctx.currentTask;
        let observedTaskRef: TaskState | undefined;

        const wasmFn = (): unknown => {
            observedTaskRef = ctx.currentTask;
            ctx.currentTask.slots[0] = 0xAA;
            ctx.currentTask.slots[1] = 0xBB;
            return undefined;
        };

        liftFlatFlat(noOpLiftPlan, ctx, wasmFn);

        // Inside the call, task was a fresh TaskState, not the default.
        expect(observedTaskRef).not.toBe(sentinelDefault);
        // The fresh slots got written.
        expect(observedTaskRef!.slots).toEqual([0xAA, 0xBB]);
        // After return, the default (caller's) task is restored.
        expect(ctx.currentTask).toBe(sentinelDefault);
        expect(ctx.currentTask.slots).toEqual([0, 0]);
    });

    test('sync lift trampoline restores task even when wasm function throws', () => {
        const ctx = createBareCtx();
        const sentinelDefault = ctx.currentTask;
        sentinelDefault.slots[0] = 0x11;

        const wasmFn = (): unknown => {
            ctx.currentTask.slots[0] = 0xCC;
            throw new Error('boom');
        };

        expect(() => liftFlatFlat(noOpLiftPlan, ctx, wasmFn)).toThrow('boom');
        // Caller's task untouched, despite trap inside wasm.
        expect(ctx.currentTask).toBe(sentinelDefault);
        expect(ctx.currentTask.slots[0]).toBe(0x11);
    });

    test('async lift trampoline restores task when wasm Promise resolves', async () => {
        const ctx = createBareCtx();
        const sentinelDefault = ctx.currentTask;
        sentinelDefault.slots[0] = 0x99;

        let observedTaskRef: TaskState | undefined;
        let resolveWasm!: (val: unknown) => void;
        const wasmPromise = new Promise<unknown>((resolve) => { resolveWasm = resolve; });

        const wasmFn = (): unknown => {
            observedTaskRef = ctx.currentTask;
            ctx.currentTask.slots[0] = 0x42;
            return wasmPromise;
        };

        const result = liftFlatFlat(noOpLiftPlan, ctx, wasmFn);
        // Outer trampoline returned a Promise; ctx.inExport may still be set
        // until the Promise settles, but that's a pre-existing detail.
        expect(observedTaskRef).not.toBe(sentinelDefault);
        expect(observedTaskRef!.slots[0]).toBe(0x42);

        resolveWasm(undefined);
        await result;

        // After the wasm Promise resolved, prev task is restored.
        expect(ctx.currentTask).toBe(sentinelDefault);
        expect(ctx.currentTask.slots[0]).toBe(0x99);
    });

    test('lower trampoline (host import) restores caller task before wasm resumes', async () => {
        const ctx = createBareCtx();
        const callerTask: TaskState = { slots: [0xA, 0xB] };
        ctx.currentTask = callerTask;

        let resolveJs!: (val: unknown) => void;
        const jsPromise = new Promise<unknown>((resolve) => { resolveJs = resolve; });
        const jsFn = (): unknown => jsPromise;

        const result = lowerFlatFlat(noOpLowerPlan, ctx, jsFn);

        // While the host import's Promise is pending, an interleaving task
        // could clobber ctx.currentTask. Simulate that.
        const otherTask: TaskState = { slots: [0xFF, 0xFE] };
        ctx.currentTask = otherTask;

        resolveJs(undefined);
        await result;

        // After the host-import Promise resolves, the lower trampoline must
        // have restored OUR caller task, not left the interleaver's behind.
        // This is the exact invariant wasm relies on when JSPI resumes:
        // ctx.currentTask must be the calling task's TaskState.
        expect(ctx.currentTask).toBe(callerTask);
    });

    test('lower trampoline restores caller task on rejection too', async () => {
        const ctx = createBareCtx();
        const callerTask: TaskState = { slots: [0xCAFE, 0] };
        ctx.currentTask = callerTask;

        let rejectJs!: (e: unknown) => void;
        const jsPromise = new Promise<unknown>((_resolve, reject) => { rejectJs = reject; });
        const jsFn = (): unknown => jsPromise;

        const result = lowerFlatFlat(noOpLowerPlan, ctx, jsFn);

        ctx.currentTask = { slots: [0xDEAD, 0] };

        rejectJs(new Error('host import failed'));
        await expect(result).rejects.toThrow('host import failed');

        expect(ctx.currentTask).toBe(callerTask);
    });
});
