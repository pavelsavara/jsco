// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import isDebug from 'env:isDebug';
import type { BindingContext } from '../resolver/types';
import type { LiftingFromJs, JsFunction, WasmValue } from './types';
import type { MemoryStorer } from '../binder/to-abi';
import type { MemoryLoader } from '../binder/to-js';
import { bigIntReplacer } from '../utils/shared';
import { LogLevel } from '../utils/assert';

export type FunctionLowerPlan = {
    paramLowerers: Function[],
    paramLoaders: MemoryLoader[],
    resultLifters: LiftingFromJs[],
    resultStorer: MemoryStorer | undefined,
    spilledParamOffsets: number[],
    resultBuf: WasmValue[],
    resultIsI64: boolean,
};

// --- Flat params, Flat result ---

export function lowerFlatFlat(plan: FunctionLowerPlan, ctx: BindingContext, jsFunction: JsFunction, ...args: any[]): any {
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
        const resJs = jsFunction(...convertedArgs);
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
    } catch (e: unknown) {
        if (e && typeof e === 'object' && 'promise' in e && (e as any).promise instanceof Promise) {
            return (e as any).promise;
        }
        throw e;
    }
}

// --- Flat params, Spilled result ---

export function lowerFlatSpilled(plan: FunctionLowerPlan, ctx: BindingContext, jsFunction: JsFunction, ...args: any[]): any {
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
        const resJs = jsFunction(...convertedArgs);
        if (isDebug && (ctx.verbose?.executor ?? 0) >= LogLevel.Summary) {
            ctx.logger!('executor', LogLevel.Summary, `← lowering result=${JSON.stringify(resJs, bigIntReplacer)}`);
        }
        if (plan.resultStorer !== undefined) {
            plan.resultStorer(ctx, retptr, resJs);
        }
    } catch (e: unknown) {
        if (e && typeof e === 'object' && 'promise' in e && (e as any).promise instanceof Promise) {
            return (e as any).promise;
        }
        throw e;
    }
}

// --- Spilled params, Flat result ---

export function lowerSpilledFlat(plan: FunctionLowerPlan, ctx: BindingContext, jsFunction: JsFunction, ...args: any[]): any {
    try {
        const convertedArgs = new Array(plan.paramLoaders.length);
        const ptr = args[0] as number;
        for (let i = 0; i < plan.paramLoaders.length; i++) {
            convertedArgs[i] = plan.paramLoaders[i]!(ctx, ptr + plan.spilledParamOffsets[i]!);
        }
        if (isDebug && (ctx.verbose?.executor ?? 0) >= LogLevel.Summary) {
            ctx.logger!('executor', LogLevel.Summary, `→ lowering args=${JSON.stringify(convertedArgs, bigIntReplacer)}`);
        }
        const resJs = jsFunction(...convertedArgs);
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
    } catch (e: unknown) {
        if (e && typeof e === 'object' && 'promise' in e && (e as any).promise instanceof Promise) {
            return (e as any).promise;
        }
        throw e;
    }
}

// --- Spilled params, Spilled result ---

export function lowerSpilledSpilled(plan: FunctionLowerPlan, ctx: BindingContext, jsFunction: JsFunction, ...args: any[]): any {
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
        const resJs = jsFunction(...convertedArgs);
        if (isDebug && (ctx.verbose?.executor ?? 0) >= LogLevel.Summary) {
            ctx.logger!('executor', LogLevel.Summary, `← lowering result=${JSON.stringify(resJs, bigIntReplacer)}`);
        }
        if (plan.resultStorer !== undefined) {
            plan.resultStorer(ctx, retptr, resJs);
        }
    } catch (e: unknown) {
        if (e && typeof e === 'object' && 'promise' in e && (e as any).promise instanceof Promise) {
            return (e as any).promise;
        }
        throw e;
    }
}
