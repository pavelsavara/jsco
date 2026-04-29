// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { initializeAsserts } from '../../src/utils/assert';
initializeAsserts();

import { liftFlatFlat } from '../../src/marshal/trampoline-lift';
import { lowerFlatFlat } from '../../src/marshal/trampoline-lower';
import type { FunctionLiftPlan } from '../../src/marshal/model/lift-plans';
import type { FunctionLowerPlan } from '../../src/marshal/model/lower-plans';
import type { MarshalingContext } from '../../src/marshal/model/types';

/**
 * Per-task `currentTaskSlots` isolation contract:
 *
 * - On entry to any sync lift trampoline, a fresh `[0, 0]` array is installed
 *   as `ctx.currentTaskSlots`. The previous slots are restored when the
 *   wasm function (which may return a Promise via JSPI) settles.
 * - On every host-import lower trampoline that awaits a Promise, the calling
 *   task's slots are captured before the await and restored before wasm
 *   resumes. This guarantees that even when concurrent reentrant tasks
 *   interleave, `context.get`/`context.set` always reads the current task's
 *   per-task TLS, not whatever the most recently-entered task wrote.
 *
 * These are unit tests for the trampoline contract; the integration
 * scenarios in `tests/host/wasip3/jspi-parallel.test.ts` exercise the same
 * machinery end-to-end via real WASM components.
 */

function createBareCtx(): MarshalingContext {
    return {
        currentTaskSlots: [0, 0],
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

describe('per-task currentTaskSlots isolation', () => {
    test('sync lift trampoline installs fresh slots and restores on return', () => {
        const ctx = createBareCtx();
        const sentinelDefault = ctx.currentTaskSlots;
        let observedSlotsRef: number[] | undefined;

        const wasmFn = (): unknown => {
            observedSlotsRef = ctx.currentTaskSlots;
            ctx.currentTaskSlots[0] = 0xAA;
            ctx.currentTaskSlots[1] = 0xBB;
            return undefined;
        };

        liftFlatFlat(noOpLiftPlan, ctx, wasmFn);

        // Inside the call, slots were a fresh [0, 0] array, not the default.
        expect(observedSlotsRef).not.toBe(sentinelDefault);
        // The fresh array got written.
        expect(observedSlotsRef).toEqual([0xAA, 0xBB]);
        // After return, the default (caller's) slots are restored.
        expect(ctx.currentTaskSlots).toBe(sentinelDefault);
        expect(ctx.currentTaskSlots).toEqual([0, 0]);
    });

    test('sync lift trampoline restores slots even when wasm function throws', () => {
        const ctx = createBareCtx();
        const sentinelDefault = ctx.currentTaskSlots;
        sentinelDefault[0] = 0x11;

        const wasmFn = (): unknown => {
            ctx.currentTaskSlots[0] = 0xCC;
            throw new Error('boom');
        };

        expect(() => liftFlatFlat(noOpLiftPlan, ctx, wasmFn)).toThrow('boom');
        // Caller's slots untouched, despite trap inside wasm.
        expect(ctx.currentTaskSlots).toBe(sentinelDefault);
        expect(ctx.currentTaskSlots[0]).toBe(0x11);
    });

    test('async lift trampoline restores slots when wasm Promise resolves', async () => {
        const ctx = createBareCtx();
        const sentinelDefault = ctx.currentTaskSlots;
        sentinelDefault[0] = 0x99;

        let observedSlotsRef: number[] | undefined;
        let resolveWasm!: (val: unknown) => void;
        const wasmPromise = new Promise<unknown>((resolve) => { resolveWasm = resolve; });

        const wasmFn = (): unknown => {
            observedSlotsRef = ctx.currentTaskSlots;
            ctx.currentTaskSlots[0] = 0x42;
            return wasmPromise;
        };

        const result = liftFlatFlat(noOpLiftPlan, ctx, wasmFn);
        // Outer trampoline returned a Promise; ctx.inExport may still be set
        // until the Promise settles, but that's a pre-existing detail.
        expect(observedSlotsRef).not.toBe(sentinelDefault);
        expect(observedSlotsRef![0]).toBe(0x42);

        resolveWasm(undefined);
        await result;

        // After the wasm Promise resolved, prev slots are restored.
        expect(ctx.currentTaskSlots).toBe(sentinelDefault);
        expect(ctx.currentTaskSlots[0]).toBe(0x99);
    });

    test('lower trampoline (host import) restores caller slots before wasm resumes', async () => {
        const ctx = createBareCtx();
        const callerSlots = [0xA, 0xB];
        ctx.currentTaskSlots = callerSlots;

        let resolveJs!: (val: unknown) => void;
        const jsPromise = new Promise<unknown>((resolve) => { resolveJs = resolve; });
        const jsFn = (): unknown => jsPromise;

        const result = lowerFlatFlat(noOpLowerPlan, ctx, jsFn);

        // While the host import's Promise is pending, an interleaving task
        // could clobber ctx.currentTaskSlots. Simulate that.
        const otherTaskSlots = [0xFF, 0xFE];
        ctx.currentTaskSlots = otherTaskSlots;

        resolveJs(undefined);
        await result;

        // After the host-import Promise resolves, the lower trampoline must
        // have restored OUR caller slots, not left the interleaver's behind.
        // This is the exact invariant wasm relies on when JSPI resumes:
        // ctx.currentTaskSlots must be the calling task's array.
        expect(ctx.currentTaskSlots).toBe(callerSlots);
    });

    test('lower trampoline restores caller slots on rejection too', async () => {
        const ctx = createBareCtx();
        const callerSlots = [0xCAFE, 0];
        ctx.currentTaskSlots = callerSlots;

        let rejectJs!: (e: unknown) => void;
        const jsPromise = new Promise<unknown>((_resolve, reject) => { rejectJs = reject; });
        const jsFn = (): unknown => jsPromise;

        const result = lowerFlatFlat(noOpLowerPlan, ctx, jsFn);

        ctx.currentTaskSlots = [0xDEAD, 0];

        rejectJs(new Error('host import failed'));
        await expect(result).rejects.toThrow('host import failed');

        expect(ctx.currentTaskSlots).toBe(callerSlots);
    });
});
