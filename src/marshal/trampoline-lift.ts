// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import isDebug from 'env:isDebug';
import type { MarshalingContext } from '../resolver/types';
import type { WasmPointer, WasmSize, WasmFunction, WasmValue, TaskState } from './model/types';
import type { FunctionLiftPlan } from './model/lift-plans';
export type { FunctionLiftPlan } from './model/lift-plans';
import { validateAllocResult, checkNotPoisoned, checkNotReentrant } from './validation';
import { bigIntReplacer } from '../utils/shared';
import { LogLevel } from '../utils/assert';
import { pushTask } from './task-state';

function processFlatResult(plan: FunctionLiftPlan, ctx: MarshalingContext, rawWasm: any): any {
    let result: any;
    if (plan.resultLowerers.length === 1) {
        result = plan.resultLowerers[0]!(ctx, rawWasm);
    }
    if (isDebug && ctx.postReturnFn) {
        ctx.postReturnFn();
        ctx.postReturnFn = undefined;
    }
    if (isDebug && (ctx.verbose?.executor ?? 0) >= LogLevel.Summary) {
        ctx.logger!('executor', LogLevel.Summary, `← lifting result=${JSON.stringify(result, bigIntReplacer)}`);
    }
    return result;
}

function processSpilledResult(plan: FunctionLiftPlan, ctx: MarshalingContext, rawWasm: any): any {
    const result = plan.resultLoader!(ctx, rawWasm as number);
    if (isDebug && ctx.postReturnFn) {
        ctx.postReturnFn();
        ctx.postReturnFn = undefined;
    }
    if (isDebug && (ctx.verbose?.executor ?? 0) >= LogLevel.Summary) {
        ctx.logger!('executor', LogLevel.Summary, `← lifting result=${JSON.stringify(result, bigIntReplacer)}`);
    }
    return result;
}

function handleLiftResult(plan: FunctionLiftPlan, ctx: MarshalingContext, rawResult: any, processResult: typeof processFlatResult, prevTask: TaskState): any {
    if (rawResult instanceof Promise) {
        return rawResult.then(
            (wasmResult) => {
                ctx.currentTask = prevTask;
                try { return processResult(plan, ctx, wasmResult); }
                catch (e) { ctx.abort(); throw e; }
                finally { ctx.inExport = false; }
            },
            (e: unknown) => { ctx.currentTask = prevTask; ctx.abort(); ctx.inExport = false; throw e; },
        );
    }
    try {
        return processResult(plan, ctx, rawResult);
    } finally {
        ctx.currentTask = prevTask;
    }
}

/**
 * Lift JS args → WASM-flat for an async-lifted export. Subset of the
 * flat-param trampolines (params + i64 BigInt only; no result handling —
 * the result is delivered via `task.return`). Async exports cap at
 * MAX_FLAT_ASYNC_PARAMS=4; spilled params are rejected by the caller.
 */
export function liftAsyncFlatParams(plan: FunctionLiftPlan, ctx: MarshalingContext, args: unknown[]): unknown[] {
    if (isDebug && (ctx.verbose?.executor ?? 0) >= LogLevel.Summary) {
        ctx.logger!('executor', LogLevel.Summary, `→ async lifting args=${JSON.stringify(args, bigIntReplacer)}`);
    }
    if (args.length !== plan.paramLifters.length) {
        throw new Error(`Expected ${plan.paramLifters.length} arguments, got ${args.length}`);
    }
    const wasmArgs = new Array(plan.totalFlatParams);
    let pos = 0;
    for (let i = 0; i < plan.paramLifters.length; i++) {
        pos += plan.paramLifters[i]!(ctx, args[i], wasmArgs as WasmValue[], pos);
    }
    for (let k = 0; k < plan.i64ParamPositions.length; k++) {
        const idx = plan.i64ParamPositions[k]!;
        if (typeof wasmArgs[idx] !== 'bigint') {
            wasmArgs[idx] = BigInt(wasmArgs[idx] as number);
        }
    }
    return wasmArgs;
}

// --- Flat params, Flat result ---

export function liftFlatFlat(plan: FunctionLiftPlan, ctx: MarshalingContext, wasmFunction: WasmFunction, ...args: any[]): any {
    checkNotPoisoned(ctx);
    checkNotReentrant(ctx);
    ctx.inExport = true;
    const prevTask = pushTask(ctx, { slots: [0, 0] });
    if (isDebug && (ctx.verbose?.executor ?? 0) >= LogLevel.Summary) {
        ctx.logger!('executor', LogLevel.Summary, `→ lifting args=${JSON.stringify(args, bigIntReplacer)}`);
    }
    try {
        if (args.length !== plan.paramLifters.length) {
            throw new Error(`Expected ${plan.paramLifters.length} arguments, got ${args.length}`);
        }
        const wasmArgs = new Array(plan.totalFlatParams);
        let pos = 0;
        for (let i = 0; i < plan.paramLifters.length; i++) {
            pos += plan.paramLifters[i]!(ctx, args[i], wasmArgs as WasmValue[], pos);
        }
        for (let k = 0; k < plan.i64ParamPositions.length; k++) {
            const idx = plan.i64ParamPositions[k]!;
            if (typeof wasmArgs[idx] !== 'bigint') {
                wasmArgs[idx] = BigInt(wasmArgs[idx] as number);
            }
        }
        return handleLiftResult(plan, ctx, wasmFunction(...wasmArgs), processFlatResult, prevTask);
    } catch (e) {
        ctx.currentTask = prevTask;
        ctx.abort();
        throw e;
    } finally {
        ctx.inExport = false;
    }
}

// --- Flat params, Spilled result ---

export function liftFlatSpilled(plan: FunctionLiftPlan, ctx: MarshalingContext, wasmFunction: WasmFunction, ...args: any[]): any {
    checkNotPoisoned(ctx);
    checkNotReentrant(ctx);
    ctx.inExport = true;
    const prevTask = pushTask(ctx, { slots: [0, 0] });
    if (isDebug && (ctx.verbose?.executor ?? 0) >= LogLevel.Summary) {
        ctx.logger!('executor', LogLevel.Summary, `→ lifting args=${JSON.stringify(args, bigIntReplacer)}`);
    }
    try {
        if (args.length !== plan.paramLifters.length) {
            throw new Error(`Expected ${plan.paramLifters.length} arguments, got ${args.length}`);
        }
        const wasmArgs = new Array(plan.totalFlatParams);
        let pos = 0;
        for (let i = 0; i < plan.paramLifters.length; i++) {
            pos += plan.paramLifters[i]!(ctx, args[i], wasmArgs as WasmValue[], pos);
        }
        for (let k = 0; k < plan.i64ParamPositions.length; k++) {
            const idx = plan.i64ParamPositions[k]!;
            if (typeof wasmArgs[idx] !== 'bigint') {
                wasmArgs[idx] = BigInt(wasmArgs[idx] as number);
            }
        }
        return handleLiftResult(plan, ctx, wasmFunction(...wasmArgs), processSpilledResult, prevTask);
    } catch (e) {
        ctx.currentTask = prevTask;
        ctx.abort();
        throw e;
    } finally {
        ctx.inExport = false;
    }
}

// --- Spilled params, Flat result ---

export function liftSpilledFlat(plan: FunctionLiftPlan, ctx: MarshalingContext, wasmFunction: WasmFunction, ...args: any[]): any {
    checkNotPoisoned(ctx);
    checkNotReentrant(ctx);
    ctx.inExport = true;
    const prevTask = pushTask(ctx, { slots: [0, 0] });
    if (isDebug && (ctx.verbose?.executor ?? 0) >= LogLevel.Summary) {
        ctx.logger!('executor', LogLevel.Summary, `→ lifting args=${JSON.stringify(args, bigIntReplacer)}`);
    }
    try {
        if (args.length !== plan.paramStorers.length) {
            throw new Error(`Expected ${plan.paramStorers.length} arguments, got ${args.length}`);
        }
        const ptr = ctx.allocator.realloc(0 as WasmPointer, 0 as WasmSize,
            plan.spilledParamsMaxAlign as WasmSize, plan.spilledParamsTotalSize as WasmSize);
        validateAllocResult(ctx, ptr, plan.spilledParamsMaxAlign, plan.spilledParamsTotalSize);
        for (let i = 0; i < plan.paramStorers.length; i++) {
            plan.paramStorers[i]!(ctx, ptr + plan.spilledParamOffsets[i]!, args[i]);
        }
        return handleLiftResult(plan, ctx, wasmFunction(ptr), processFlatResult, prevTask);
    } catch (e) {
        ctx.currentTask = prevTask;
        ctx.abort();
        throw e;
    } finally {
        ctx.inExport = false;
    }
}

// --- Spilled params, Spilled result ---

export function liftSpilledSpilled(plan: FunctionLiftPlan, ctx: MarshalingContext, wasmFunction: WasmFunction, ...args: any[]): any {
    checkNotPoisoned(ctx);
    checkNotReentrant(ctx);
    ctx.inExport = true;
    const prevTask = pushTask(ctx, { slots: [0, 0] });
    if (isDebug && (ctx.verbose?.executor ?? 0) >= LogLevel.Summary) {
        ctx.logger!('executor', LogLevel.Summary, `→ lifting args=${JSON.stringify(args, bigIntReplacer)}`);
    }
    try {
        if (args.length !== plan.paramStorers.length) {
            throw new Error(`Expected ${plan.paramStorers.length} arguments, got ${args.length}`);
        }
        const ptr = ctx.allocator.realloc(0 as WasmPointer, 0 as WasmSize,
            plan.spilledParamsMaxAlign as WasmSize, plan.spilledParamsTotalSize as WasmSize);
        validateAllocResult(ctx, ptr, plan.spilledParamsMaxAlign, plan.spilledParamsTotalSize);
        for (let i = 0; i < plan.paramStorers.length; i++) {
            plan.paramStorers[i]!(ctx, ptr + plan.spilledParamOffsets[i]!, args[i]);
        }
        return handleLiftResult(plan, ctx, wasmFunction(ptr), processSpilledResult, prevTask);
    } catch (e) {
        ctx.currentTask = prevTask;
        ctx.abort();
        throw e;
    } finally {
        ctx.inExport = false;
    }
}
