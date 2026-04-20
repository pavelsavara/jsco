// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { BindingContext } from '../resolver/types';
import type { LiftingFromJs, WasmPointer, WasmSize, WasmValue, JsValue } from './types';
import type { MemoryStorer } from '../resolver/binding/to-abi';
import { validateAllocResult } from './validation';
import { TAG, VAL, OK } from '../utils/constants';

// --- Primitive memory storers ---

export function boolStorer(ctx: BindingContext, ptr: number, val: JsValue): void {
    ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize).setUint8(0, val ? 1 : 0);
}

export function s8Storer(ctx: BindingContext, ptr: number, val: JsValue): void {
    ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize).setInt8(0, val as number);
}

export function u8Storer(ctx: BindingContext, ptr: number, val: JsValue): void {
    ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize).setUint8(0, (val as number) & 0xFF);
}

export function s16Storer(ctx: BindingContext, ptr: number, val: JsValue): void {
    ctx.memory.getView(ptr as WasmPointer, 2 as WasmSize).setInt16(0, val as number, true);
}

export function u16Storer(ctx: BindingContext, ptr: number, val: JsValue): void {
    ctx.memory.getView(ptr as WasmPointer, 2 as WasmSize).setUint16(0, (val as number) & 0xFFFF, true);
}

export function s32Storer(ctx: BindingContext, ptr: number, val: JsValue): void {
    ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setInt32(0, val as number, true);
}

export function u32Storer(ctx: BindingContext, ptr: number, val: JsValue): void {
    ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setUint32(0, (val as number) >>> 0, true);
}

export function s64Storer(ctx: BindingContext, ptr: number, val: JsValue): void {
    ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize).setBigInt64(0, BigInt(val), true);
}

export function u64Storer(ctx: BindingContext, ptr: number, val: JsValue): void {
    ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize).setBigUint64(0, BigInt(val), true);
}

export function f32Storer(ctx: BindingContext, ptr: number, val: JsValue): void {
    if (typeof val !== 'number') throw new TypeError(`expected a number for f32, got ${typeof val}`);
    ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setFloat32(0, val, true);
}

export function f64Storer(ctx: BindingContext, ptr: number, val: JsValue): void {
    if (typeof val !== 'number') throw new TypeError(`expected a number for f64, got ${typeof val}`);
    ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize).setFloat64(0, val, true);
}

export function charStorer(ctx: BindingContext, ptr: number, val: JsValue): void {
    if (typeof val !== 'string') throw new TypeError(`expected a string for char, got ${typeof val}`);
    ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setUint32(0, val.codePointAt(0)!, true);
}

export type StringStorerPlan = { lifter: LiftingFromJs };

export function stringStorer(plan: StringStorerPlan, ctx: BindingContext, ptr: number, val: JsValue): void {
    const tmp: WasmValue[] = [0, 0];
    plan.lifter(ctx, val, tmp, 0);
    const dv = ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize);
    dv.setInt32(0, tmp[0] as number, true);
    dv.setInt32(4, tmp[1] as number, true);
}

// --- Compound memory storers ---

export type RecordStorerPlan = { fields: { name: string, offset: number, storer: MemoryStorer }[] };

export function recordStorer(plan: RecordStorerPlan, ctx: BindingContext, ptr: number, jsValue: JsValue): void {
    if (jsValue == null || typeof jsValue !== 'object') throw new TypeError(`expected an object for record, got ${jsValue === null ? 'null' : typeof jsValue}`);
    for (let i = 0; i < plan.fields.length; i++) {
        const f = plan.fields[i]!;
        f.storer(ctx, ptr + f.offset, jsValue[f.name]);
    }
}

export type ListStorerPlan = { elemSize: number, elemAlign: number, elemStorer: MemoryStorer };

export function listStorer(plan: ListStorerPlan, ctx: BindingContext, ptr: number, jsValue: JsValue): void {
    if (jsValue == null) throw new TypeError(`expected an array for list, got ${jsValue === null ? 'null' : 'undefined'}`);
    const len = jsValue.length;
    let listPtr = 0;
    if (len > 0) {
        const totalSize = len * plan.elemSize;
        listPtr = ctx.allocator.realloc(0 as WasmPointer, 0 as WasmSize, plan.elemAlign as WasmSize, totalSize as WasmSize);
        validateAllocResult(ctx, listPtr as WasmPointer, plan.elemAlign, totalSize);
        for (let i = 0; i < len; i++) {
            plan.elemStorer(ctx, listPtr + i * plan.elemSize, jsValue[i]);
        }
    }
    const dv = ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize);
    dv.setInt32(0, listPtr, true);
    dv.setInt32(4, len, true);
}

export type OptionStorerPlan = { payloadOffset: number, payloadStorer: MemoryStorer };

export function optionStorer(plan: OptionStorerPlan, ctx: BindingContext, ptr: number, jsValue: JsValue): void {
    const dv = ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize);
    if (jsValue === null || jsValue === undefined) {
        dv.setUint8(0, 0);
    } else {
        dv.setUint8(0, 1);
        plan.payloadStorer(ctx, ptr + plan.payloadOffset, jsValue);
    }
}

export type ResultStorerPlan = { payloadOffset: number, okStorer?: MemoryStorer, errStorer?: MemoryStorer };

export function resultStorerBoth(plan: ResultStorerPlan, ctx: BindingContext, ptr: number, jsValue: JsValue): void {
    const dv = ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize);
    if (jsValue == null) throw new TypeError(`expected a result value, got ${jsValue === null ? 'null' : 'undefined'}`);
    const tag = jsValue[TAG], val = jsValue[VAL];
    if (typeof tag !== 'string') throw new TypeError(`Expected result value with 'tag' field, got ${typeof jsValue === 'object' ? JSON.stringify(jsValue) : typeof jsValue}`);
    if (tag === OK) {
        dv.setUint8(0, 0);
        plan.okStorer!(ctx, ptr + plan.payloadOffset, val);
    } else {
        dv.setUint8(0, 1);
        plan.errStorer!(ctx, ptr + plan.payloadOffset, val);
    }
}

export function resultStorerOkOnly(plan: ResultStorerPlan, ctx: BindingContext, ptr: number, jsValue: JsValue): void {
    const dv = ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize);
    if (jsValue == null) throw new TypeError(`expected a result value, got ${jsValue === null ? 'null' : 'undefined'}`);
    const tag = jsValue[TAG], val = jsValue[VAL];
    if (typeof tag !== 'string') throw new TypeError(`Expected result value with 'tag' field, got ${typeof jsValue === 'object' ? JSON.stringify(jsValue) : typeof jsValue}`);
    if (tag === OK) {
        dv.setUint8(0, 0);
        plan.okStorer!(ctx, ptr + plan.payloadOffset, val);
    } else {
        dv.setUint8(0, 1);
    }
}

export function resultStorerErrOnly(plan: ResultStorerPlan, ctx: BindingContext, ptr: number, jsValue: JsValue): void {
    const dv = ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize);
    if (jsValue == null) throw new TypeError(`expected a result value, got ${jsValue === null ? 'null' : 'undefined'}`);
    const tag = jsValue[TAG], val = jsValue[VAL];
    if (typeof tag !== 'string') throw new TypeError(`Expected result value with 'tag' field, got ${typeof jsValue === 'object' ? JSON.stringify(jsValue) : typeof jsValue}`);
    if (tag === OK) {
        dv.setUint8(0, 0);
    } else {
        dv.setUint8(0, 1);
        plan.errStorer!(ctx, ptr + plan.payloadOffset, val);
    }
}

export function resultStorerVoid(_plan: ResultStorerPlan, ctx: BindingContext, ptr: number, jsValue: JsValue): void {
    const dv = ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize);
    if (jsValue == null) throw new TypeError(`expected a result value, got ${jsValue === null ? 'null' : 'undefined'}`);
    const tag = jsValue[TAG];
    if (typeof tag !== 'string') throw new TypeError(`Expected result value with 'tag' field, got ${typeof jsValue === 'object' ? JSON.stringify(jsValue) : typeof jsValue}`);
    dv.setUint8(0, tag === OK ? 0 : 1);
}

export type VariantStorerPlan = {
    payloadOffset: number,
    nameToIndex: Map<string, number>,
    caseStorers: (MemoryStorer | undefined)[],
};

export function variantStorerDisc1(plan: VariantStorerPlan, ctx: BindingContext, ptr: number, jsValue: JsValue): void {
    if (jsValue == null) throw new TypeError(`expected a variant value, got ${jsValue === null ? 'null' : 'undefined'}`);
    const tag = jsValue[TAG], val = jsValue[VAL];
    if (typeof tag !== 'string') throw new TypeError(`Expected variant value with 'tag' field, got ${typeof jsValue === 'object' ? JSON.stringify(jsValue) : typeof jsValue}`);
    const caseIndex = plan.nameToIndex.get(tag);
    if (caseIndex === undefined) throw new Error(`Unknown variant case: ${tag}`);
    ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize).setUint8(0, caseIndex);
    const storer = plan.caseStorers[caseIndex];
    if (storer && val !== undefined) storer(ctx, ptr + plan.payloadOffset, val);
}

export function variantStorerDisc2(plan: VariantStorerPlan, ctx: BindingContext, ptr: number, jsValue: JsValue): void {
    if (jsValue == null) throw new TypeError(`expected a variant value, got ${jsValue === null ? 'null' : 'undefined'}`);
    const tag = jsValue[TAG], val = jsValue[VAL];
    if (typeof tag !== 'string') throw new TypeError(`Expected variant value with 'tag' field, got ${typeof jsValue === 'object' ? JSON.stringify(jsValue) : typeof jsValue}`);
    const caseIndex = plan.nameToIndex.get(tag);
    if (caseIndex === undefined) throw new Error(`Unknown variant case: ${tag}`);
    ctx.memory.getView(ptr as WasmPointer, 2 as WasmSize).setUint16(0, caseIndex, true);
    const storer = plan.caseStorers[caseIndex];
    if (storer && val !== undefined) storer(ctx, ptr + plan.payloadOffset, val);
}

export function variantStorerDisc4(plan: VariantStorerPlan, ctx: BindingContext, ptr: number, jsValue: JsValue): void {
    if (jsValue == null) throw new TypeError(`expected a variant value, got ${jsValue === null ? 'null' : 'undefined'}`);
    const tag = jsValue[TAG], val = jsValue[VAL];
    if (typeof tag !== 'string') throw new TypeError(`Expected variant value with 'tag' field, got ${typeof jsValue === 'object' ? JSON.stringify(jsValue) : typeof jsValue}`);
    const caseIndex = plan.nameToIndex.get(tag);
    if (caseIndex === undefined) throw new Error(`Unknown variant case: ${tag}`);
    ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setUint32(0, caseIndex, true);
    const storer = plan.caseStorers[caseIndex];
    if (storer && val !== undefined) storer(ctx, ptr + plan.payloadOffset, val);
}

export type EnumStorerPlan = { nameToIndex: Map<string, number> };

export function enumStorerDisc1(plan: EnumStorerPlan, ctx: BindingContext, ptr: number, jsValue: JsValue): void {
    const idx = plan.nameToIndex.get(jsValue as string);
    if (idx === undefined) throw new Error(`Unknown enum value: ${jsValue}`);
    ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize).setUint8(0, idx);
}

export function enumStorerDisc2(plan: EnumStorerPlan, ctx: BindingContext, ptr: number, jsValue: JsValue): void {
    const idx = plan.nameToIndex.get(jsValue as string);
    if (idx === undefined) throw new Error(`Unknown enum value: ${jsValue}`);
    ctx.memory.getView(ptr as WasmPointer, 2 as WasmSize).setUint16(0, idx, true);
}

export function enumStorerDisc4(plan: EnumStorerPlan, ctx: BindingContext, ptr: number, jsValue: JsValue): void {
    const idx = plan.nameToIndex.get(jsValue as string);
    if (idx === undefined) throw new Error(`Unknown enum value: ${jsValue}`);
    ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setUint32(0, idx, true);
}

export type FlagsStorerPlan = { wordCount: number, memberNames: string[] };

export function flagsStorer(plan: FlagsStorerPlan, ctx: BindingContext, ptr: number, jsValue: JsValue): void {
    if (jsValue == null || typeof jsValue !== 'object') throw new TypeError(`expected an object for flags, got ${jsValue === null ? 'null' : typeof jsValue}`);
    const flags = jsValue as Record<string, boolean>;
    for (let w = 0; w < plan.wordCount; w++) {
        let word = 0;
        for (let b = 0; b < 32 && w * 32 + b < plan.memberNames.length; b++) {
            if (flags[plan.memberNames[w * 32 + b]!]) word |= (1 << b);
        }
        const dv = ctx.memory.getView((ptr + w * 4) as WasmPointer, 4 as WasmSize);
        dv.setInt32(0, word, true);
    }
}

export type TupleStorerPlan = { members: { offset: number, storer: MemoryStorer }[] };

export function tupleStorer(plan: TupleStorerPlan, ctx: BindingContext, ptr: number, jsValue: JsValue): void {
    if (jsValue == null) throw new TypeError(`expected an array for tuple, got ${jsValue === null ? 'null' : 'undefined'}`);
    if (jsValue.length !== plan.members.length) {
        throw new Error(`Expected tuple of ${plan.members.length} elements, got ${jsValue.length}`);
    }
    for (let i = 0; i < plan.members.length; i++) {
        const m = plan.members[i]!;
        m.storer(ctx, ptr + m.offset, jsValue[i]);
    }
}

// --- Resource memory storers ---

export type OwnResourceStorerPlan = { resourceTypeIdx: number };

export function ownResourceStorer(plan: OwnResourceStorerPlan, ctx: BindingContext, ptr: number, jsValue: JsValue): void {
    const handle = ctx.resources.add(plan.resourceTypeIdx, jsValue);
    ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setInt32(0, handle, true);
}

export function borrowResourceStorer(plan: OwnResourceStorerPlan, ctx: BindingContext, ptr: number, jsValue: JsValue): void {
    const handle = ctx.resources.add(plan.resourceTypeIdx, jsValue);
    ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setInt32(0, handle, true);
}

export function borrowResourceDirectStorer(_plan: OwnResourceStorerPlan, ctx: BindingContext, ptr: number, jsValue: JsValue): void {
    ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setInt32(0, jsValue as number, true);
}

// --- Stream/Future/ErrorContext memory storers ---

export function streamStorer(ctx: BindingContext, ptr: number, jsValue: JsValue): void {
    const handle = ctx.streams.addReadable(0, jsValue);
    ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setInt32(0, handle, true);
}

export type FutureStorerPlan = { futureStorer?: (ctx: BindingContext, ptr: number, value: unknown, rejected?: boolean) => void };

export function futureMemStorer(plan: FutureStorerPlan, ctx: BindingContext, ptr: number, jsValue: JsValue): void {
    const handle = ctx.futures.addReadable(0, jsValue, plan.futureStorer);
    ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setInt32(0, handle, true);
}

export function errorContextStorer(ctx: BindingContext, ptr: number, jsValue: JsValue): void {
    const handle = ctx.errorContexts.add(jsValue);
    ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setInt32(0, handle, true);
}
