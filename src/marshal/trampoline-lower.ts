// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import isDebug from 'env:isDebug';
import type { MarshalingContext } from '../resolver/types';
import type { JsFunction } from './model/types';
import type { FunctionLowerPlan } from './model/lower-plans';
export type { FunctionLowerPlan } from './model/lower-plans';
import { bigIntReplacer } from '../utils/shared';
import { LogLevel } from '../utils/assert';

function processFlatResult(plan: FunctionLowerPlan, ctx: MarshalingContext, resJs: any): any {
    if (isDebug && (ctx.verbose?.executor ?? 0) >= LogLevel.Summary) {
        ctx.logger!('executor', LogLevel.Summary, `← lowering result=${JSON.stringify(resJs, bigIntReplacer)}`);
    }
    if (plan.resultLifters.length === 1) {
        plan.resultLifters[0]!(ctx, resJs, plan.resultBuf, 0);
        if (plan.resultIsI64 && typeof plan.resultBuf[0] !== 'bigint') {
            return BigInt(plan.resultBuf[0] as number);
        }
        return plan.resultBuf[0];
    }
}

function processSpilledResult(plan: FunctionLowerPlan, ctx: MarshalingContext, retptr: number, resJs: any): void {
    if (isDebug && (ctx.verbose?.executor ?? 0) >= LogLevel.Summary) {
        ctx.logger!('executor', LogLevel.Summary, `← lowering result=${JSON.stringify(resJs, bigIntReplacer)}`);
    }
    if (plan.resultStorer !== undefined) {
        plan.resultStorer(ctx, retptr, resJs);
    }
}

function handleLowerResult(plan: FunctionLowerPlan, ctx: MarshalingContext, resJs: any,
    processResult: (plan: FunctionLowerPlan, ctx: MarshalingContext, resJs: any) => any): any {
    if (!plan.hasFutureOrStreamReturn && resJs instanceof Promise) {
        return resJs.then(
            (val: any) => {
                try { return processResult(plan, ctx, val); }
                catch (e) { ctx.abort(); throw e; }
            },
            // Rejection: do NOT abort the whole instance. For async-lower the
            // subtask table cleanly transitions to RETURNED; for sync-lower
            // JSPI the wasm caller receives a regular trap. Both paths are
            // recoverable at the task level.
            (e: unknown) => { throw e; },
        );
    }
    return processResult(plan, ctx, resJs);
}

function handleLowerResultSpilled(plan: FunctionLowerPlan, ctx: MarshalingContext, retptr: number, resJs: any): any {
    if (!plan.hasFutureOrStreamReturn && resJs instanceof Promise) {
        return resJs.then(
            (val: any) => {
                try { return processSpilledResult(plan, ctx, retptr, val); }
                catch (e) { ctx.abort(); throw e; }
            },
            // Rejection: see handleLowerResult — do NOT abort the instance.
            (e: unknown) => { throw e; },
        );
    }
    return processSpilledResult(plan, ctx, retptr, resJs);
}

// --- Flat params, Flat result ---

export function lowerFlatFlat(plan: FunctionLowerPlan, ctx: MarshalingContext, jsFunction: JsFunction, ...args: any[]): any {
    try {
        const convertedArgs = new Array(plan.paramLowerers.length);
        let flatOffset = 0;
        for (let i = 0; i < plan.paramLowerers.length; i++) {
            const lowerer = plan.paramLowerers[i]!;
            const spill = (lowerer as any).spill;
            convertedArgs[i] = lowerer(ctx, ...args.slice(flatOffset, flatOffset + spill));
            flatOffset += spill;
        }
        if (isDebug && (ctx.verbose?.executor ?? 0) >= LogLevel.Summary) {
            ctx.logger!('executor', LogLevel.Summary, `→ lowering args=${JSON.stringify(convertedArgs, bigIntReplacer)}`);
        }
        return handleLowerResult(plan, ctx, jsFunction(...convertedArgs), processFlatResult);
    } catch (e: unknown) {
        if (e && typeof e === 'object' && 'promise' in e && (e as any).promise instanceof Promise) {
            return handleLowerResult(plan, ctx, (e as any).promise, processFlatResult);
        }
        throw e;
    }
}

// --- Flat params, Spilled result ---

export function lowerFlatSpilled(plan: FunctionLowerPlan, ctx: MarshalingContext, jsFunction: JsFunction, ...args: any[]): any {
    try {
        const convertedArgs = new Array(plan.paramLowerers.length);
        let flatOffset = 0;
        for (let i = 0; i < plan.paramLowerers.length; i++) {
            const lowerer = plan.paramLowerers[i]!;
            const spill = (lowerer as any).spill;
            convertedArgs[i] = lowerer(ctx, ...args.slice(flatOffset, flatOffset + spill));
            flatOffset += spill;
        }
        if (isDebug && (ctx.verbose?.executor ?? 0) >= LogLevel.Summary) {
            ctx.logger!('executor', LogLevel.Summary, `→ lowering args=${JSON.stringify(convertedArgs, bigIntReplacer)}`);
        }
        const retptr = args[args.length - 1] as number;
        return handleLowerResultSpilled(plan, ctx, retptr, jsFunction(...convertedArgs));
    } catch (e: unknown) {
        if (e && typeof e === 'object' && 'promise' in e && (e as any).promise instanceof Promise) {
            const retptr = args[args.length - 1] as number;
            return handleLowerResultSpilled(plan, ctx, retptr, (e as any).promise);
        }
        throw e;
    }
}

// --- Spilled params, Flat result ---

export function lowerSpilledFlat(plan: FunctionLowerPlan, ctx: MarshalingContext, jsFunction: JsFunction, ...args: any[]): any {
    try {
        const convertedArgs = new Array(plan.paramLoaders.length);
        const ptr = args[0] as number;
        for (let i = 0; i < plan.paramLoaders.length; i++) {
            convertedArgs[i] = plan.paramLoaders[i]!(ctx, ptr + plan.spilledParamOffsets[i]!);
        }
        if (isDebug && (ctx.verbose?.executor ?? 0) >= LogLevel.Summary) {
            ctx.logger!('executor', LogLevel.Summary, `→ lowering args=${JSON.stringify(convertedArgs, bigIntReplacer)}`);
        }
        return handleLowerResult(plan, ctx, jsFunction(...convertedArgs), processFlatResult);
    } catch (e: unknown) {
        if (e && typeof e === 'object' && 'promise' in e && (e as any).promise instanceof Promise) {
            return handleLowerResult(plan, ctx, (e as any).promise, processFlatResult);
        }
        throw e;
    }
}

// --- Spilled params, Spilled result ---

export function lowerSpilledSpilled(plan: FunctionLowerPlan, ctx: MarshalingContext, jsFunction: JsFunction, ...args: any[]): any {
    try {
        const convertedArgs = new Array(plan.paramLoaders.length);
        const ptr = args[0] as number;
        for (let i = 0; i < plan.paramLoaders.length; i++) {
            convertedArgs[i] = plan.paramLoaders[i]!(ctx, ptr + plan.spilledParamOffsets[i]!);
        }
        if (isDebug && (ctx.verbose?.executor ?? 0) >= LogLevel.Summary) {
            ctx.logger!('executor', LogLevel.Summary, `→ lowering args=${JSON.stringify(convertedArgs, bigIntReplacer)}`);
        }
        const retptr = args[args.length - 1] as number;
        return handleLowerResultSpilled(plan, ctx, retptr, jsFunction(...convertedArgs));
    } catch (e: unknown) {
        if (e && typeof e === 'object' && 'promise' in e && (e as any).promise instanceof Promise) {
            const retptr = args[args.length - 1] as number;
            return handleLowerResultSpilled(plan, ctx, retptr, (e as any).promise);
        }
        throw e;
    }
}
