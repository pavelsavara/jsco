// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import type { MarshalingContext, MemoryStorer } from './model/types';
import type { WasmPointer, WasmSize, WasmValue, JsValue } from './model/types';
import type { StringStorerPlan, RecordStorerPlan, ListStorerPlan, OptionStorerPlan, ResultStorerPlan, VariantStorerPlan, EnumStorerPlan, FlagsStorerPlan, TupleStorerPlan, OwnResourceStorerPlan, StreamStorerPlan, FutureStorerPlan } from './model/store-plans';
export type { StringStorerPlan, RecordStorerPlan, ListStorerPlan, OptionStorerPlan, ResultStorerPlan, VariantStorerPlan, EnumStorerPlan, FlagsStorerPlan, TupleStorerPlan, OwnResourceStorerPlan, StreamStorerPlan, FutureStorerPlan } from './model/store-plans';
import { validateAllocResult, validateBoundarySize } from './validation';
import { OK, ERR } from './constants';

// --- Primitive memory storers ---

export function boolStorer(ctx: MarshalingContext, ptr: number, val: JsValue): void {
    ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize).setUint8(0, val ? 1 : 0);
}

export function s8Storer(ctx: MarshalingContext, ptr: number, val: JsValue): void {
    ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize).setInt8(0, val as number);
}

export function u8Storer(ctx: MarshalingContext, ptr: number, val: JsValue): void {
    ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize).setUint8(0, (val as number) & 0xFF);
}

export function s16Storer(ctx: MarshalingContext, ptr: number, val: JsValue): void {
    ctx.memory.getView(ptr as WasmPointer, 2 as WasmSize).setInt16(0, val as number, true);
}

export function u16Storer(ctx: MarshalingContext, ptr: number, val: JsValue): void {
    ctx.memory.getView(ptr as WasmPointer, 2 as WasmSize).setUint16(0, (val as number) & 0xFFFF, true);
}

export function s32Storer(ctx: MarshalingContext, ptr: number, val: JsValue): void {
    ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setInt32(0, val as number, true);
}

export function u32Storer(ctx: MarshalingContext, ptr: number, val: JsValue): void {
    ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setUint32(0, (val as number) >>> 0, true);
}

export function s64Storer(ctx: MarshalingContext, ptr: number, val: JsValue): void {
    ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize).setBigInt64(0, BigInt(val), true);
}

export function u64Storer(ctx: MarshalingContext, ptr: number, val: JsValue): void {
    ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize).setBigUint64(0, BigInt(val), true);
}

export function f32Storer(ctx: MarshalingContext, ptr: number, val: JsValue): void {
    if (typeof val !== 'number') throw new TypeError(`expected a number for f32, got ${typeof val}`);
    ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setFloat32(0, val, true);
}

export function f64Storer(ctx: MarshalingContext, ptr: number, val: JsValue): void {
    if (typeof val !== 'number') throw new TypeError(`expected a number for f64, got ${typeof val}`);
    ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize).setFloat64(0, val, true);
}

export function charStorer(ctx: MarshalingContext, ptr: number, val: JsValue): void {
    if (typeof val !== 'string') throw new TypeError(`expected a string for char, got ${typeof val}`);
    ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setUint32(0, val.codePointAt(0)!, true);
}

export function stringStorer(plan: StringStorerPlan, ctx: MarshalingContext, ptr: number, val: JsValue): void {
    const tmp: WasmValue[] = [0, 0];
    plan.lifter(ctx, val, tmp, 0);
    const dv = ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize);
    dv.setInt32(0, tmp[0] as number, true);
    dv.setInt32(4, tmp[1] as number, true);
}

// --- Compound memory storers ---


export function recordStorer(plan: RecordStorerPlan, ctx: MarshalingContext, ptr: number, jsValue: JsValue): void {
    if (jsValue == null || typeof jsValue !== 'object') throw new TypeError(`expected an object for record, got ${jsValue === null ? 'null' : typeof jsValue}`);
    for (let i = 0; i < plan.fields.length; i++) {
        const f = plan.fields[i]!;
        f.storer(ctx, ptr + f.offset, jsValue[f.name]);
    }
}

export function listStorer(plan: ListStorerPlan, ctx: MarshalingContext, ptr: number, jsValue: JsValue): void {
    if (jsValue == null) throw new TypeError(`expected an array for list, got ${jsValue === null ? 'null' : 'undefined'}`);
    const len = jsValue.length;
    const totalSize = len * plan.elemSize;
    validateBoundarySize(ctx, totalSize, 'list');
    // Always call realloc per canonical ABI spec — even for empty lists (totalSize=0).
    // Rust's cabi_realloc returns `align as *mut u8` for size=0, producing the
    // non-null dangling pointer that Vec::from_raw_parts / NonNull::new_unchecked requires.
    const listPtr = ctx.allocator.realloc(0 as WasmPointer, 0 as WasmSize, plan.elemAlign as WasmSize, totalSize as WasmSize);
    if (len > 0) {
        validateAllocResult(ctx, listPtr as WasmPointer, plan.elemAlign, totalSize);
        for (let i = 0; i < len; i++) {
            plan.elemStorer(ctx, listPtr + i * plan.elemSize, jsValue[i]);
        }
    }
    const dv = ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize);
    dv.setInt32(0, listPtr, true);
    dv.setInt32(4, len, true);
}

export function optionStorer(plan: OptionStorerPlan, ctx: MarshalingContext, ptr: number, jsValue: JsValue): void {
    const dv = ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize);
    if (jsValue === null || jsValue === undefined) {
        dv.setUint8(0, 0);
    } else {
        dv.setUint8(0, 1);
        plan.payloadStorer(ctx, ptr + plan.payloadOffset, jsValue);
    }
}

export function resultStorerBoth(plan: ResultStorerPlan, ctx: MarshalingContext, ptr: number, jsValue: JsValue): void {
    const dv = ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize);
    if (jsValue == null) throw new TypeError(`expected a result value, got ${jsValue === null ? 'null' : 'undefined'}`);
    const tag = jsValue.tag, val = jsValue.val;
    if (typeof tag !== 'string') throw new TypeError(`Expected result value with 'tag' field, got ${typeof jsValue === 'object' ? JSON.stringify(jsValue) : typeof jsValue}`);
    if (tag === OK) {
        dv.setUint8(0, 0);
        plan.okStorer!(ctx, ptr + plan.payloadOffset, val);
    } else {
        dv.setUint8(0, 1);
        plan.errStorer!(ctx, ptr + plan.payloadOffset, val);
    }
}

export function resultStorerOkOnly(plan: ResultStorerPlan, ctx: MarshalingContext, ptr: number, jsValue: JsValue): void {
    const dv = ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize);
    if (jsValue == null) throw new TypeError(`expected a result value, got ${jsValue === null ? 'null' : 'undefined'}`);
    const tag = jsValue.tag, val = jsValue.val;
    if (typeof tag !== 'string') throw new TypeError(`Expected result value with 'tag' field, got ${typeof jsValue === 'object' ? JSON.stringify(jsValue) : typeof jsValue}`);
    if (tag === OK) {
        dv.setUint8(0, 0);
        plan.okStorer!(ctx, ptr + plan.payloadOffset, val);
    } else {
        dv.setUint8(0, 1);
    }
}

export function resultStorerErrOnly(plan: ResultStorerPlan, ctx: MarshalingContext, ptr: number, jsValue: JsValue): void {
    const dv = ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize);
    if (jsValue == null) throw new TypeError(`expected a result value, got ${jsValue === null ? 'null' : 'undefined'}`);
    const tag = jsValue.tag, val = jsValue.val;
    if (typeof tag !== 'string') throw new TypeError(`Expected result value with 'tag' field, got ${typeof jsValue === 'object' ? JSON.stringify(jsValue) : typeof jsValue}`);
    if (tag === OK) {
        dv.setUint8(0, 0);
    } else {
        dv.setUint8(0, 1);
        plan.errStorer!(ctx, ptr + plan.payloadOffset, val);
    }
}

export function resultStorerVoid(_plan: ResultStorerPlan, ctx: MarshalingContext, ptr: number, jsValue: JsValue): void {
    const dv = ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize);
    if (jsValue == null) throw new TypeError(`expected a result value, got ${jsValue === null ? 'null' : 'undefined'}`);
    const tag = jsValue.tag;
    if (typeof tag !== 'string') throw new TypeError(`Expected result value with 'tag' field, got ${typeof jsValue === 'object' ? JSON.stringify(jsValue) : typeof jsValue}`);
    dv.setUint8(0, tag === OK ? 0 : 1);
}

export function variantStorerDisc1(plan: VariantStorerPlan, ctx: MarshalingContext, ptr: number, jsValue: JsValue): void {
    if (jsValue == null) throw new TypeError(`expected a variant value, got ${jsValue === null ? 'null' : 'undefined'}`);
    const tag = jsValue.tag, val = jsValue.val;
    if (typeof tag !== 'string') throw new TypeError(`Expected variant value with 'tag' field, got ${typeof jsValue === 'object' ? JSON.stringify(jsValue) : typeof jsValue}`);
    const caseIndex = plan.nameToIndex.get(tag);
    if (caseIndex === undefined) throw new Error(`Unknown variant case: ${tag}`);
    ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize).setUint8(0, caseIndex);
    const storer = plan.caseStorers[caseIndex];
    if (storer && val !== undefined) storer(ctx, ptr + plan.payloadOffset, val);
}

export function variantStorerDisc2(plan: VariantStorerPlan, ctx: MarshalingContext, ptr: number, jsValue: JsValue): void {
    if (jsValue == null) throw new TypeError(`expected a variant value, got ${jsValue === null ? 'null' : 'undefined'}`);
    const tag = jsValue.tag, val = jsValue.val;
    if (typeof tag !== 'string') throw new TypeError(`Expected variant value with 'tag' field, got ${typeof jsValue === 'object' ? JSON.stringify(jsValue) : typeof jsValue}`);
    const caseIndex = plan.nameToIndex.get(tag);
    if (caseIndex === undefined) throw new Error(`Unknown variant case: ${tag}`);
    ctx.memory.getView(ptr as WasmPointer, 2 as WasmSize).setUint16(0, caseIndex, true);
    const storer = plan.caseStorers[caseIndex];
    if (storer && val !== undefined) storer(ctx, ptr + plan.payloadOffset, val);
}

export function variantStorerDisc4(plan: VariantStorerPlan, ctx: MarshalingContext, ptr: number, jsValue: JsValue): void {
    if (jsValue == null) throw new TypeError(`expected a variant value, got ${jsValue === null ? 'null' : 'undefined'}`);
    const tag = jsValue.tag, val = jsValue.val;
    if (typeof tag !== 'string') throw new TypeError(`Expected variant value with 'tag' field, got ${typeof jsValue === 'object' ? JSON.stringify(jsValue) : typeof jsValue}`);
    const caseIndex = plan.nameToIndex.get(tag);
    if (caseIndex === undefined) throw new Error(`Unknown variant case: ${tag}`);
    ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setUint32(0, caseIndex, true);
    const storer = plan.caseStorers[caseIndex];
    if (storer && val !== undefined) storer(ctx, ptr + plan.payloadOffset, val);
}

export function enumStorerDisc1(plan: EnumStorerPlan, ctx: MarshalingContext, ptr: number, jsValue: JsValue): void {
    const idx = plan.nameToIndex.get(jsValue as string);
    if (idx === undefined) throw new Error(`Unknown enum value: ${jsValue}`);
    ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize).setUint8(0, idx);
}

export function enumStorerDisc2(plan: EnumStorerPlan, ctx: MarshalingContext, ptr: number, jsValue: JsValue): void {
    const idx = plan.nameToIndex.get(jsValue as string);
    if (idx === undefined) throw new Error(`Unknown enum value: ${jsValue}`);
    ctx.memory.getView(ptr as WasmPointer, 2 as WasmSize).setUint16(0, idx, true);
}

export function enumStorerDisc4(plan: EnumStorerPlan, ctx: MarshalingContext, ptr: number, jsValue: JsValue): void {
    const idx = plan.nameToIndex.get(jsValue as string);
    if (idx === undefined) throw new Error(`Unknown enum value: ${jsValue}`);
    ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setUint32(0, idx, true);
}

export function flagsStorer(plan: FlagsStorerPlan, ctx: MarshalingContext, ptr: number, jsValue: JsValue): void {
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

export function tupleStorer(plan: TupleStorerPlan, ctx: MarshalingContext, ptr: number, jsValue: JsValue): void {
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

export function ownResourceStorer(plan: OwnResourceStorerPlan, ctx: MarshalingContext, ptr: number, jsValue: JsValue): void {
    const handle = ctx.resources.add(plan.resourceTypeIdx, jsValue);
    ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setInt32(0, handle, true);
}

export function borrowResourceStorer(plan: OwnResourceStorerPlan, ctx: MarshalingContext, ptr: number, jsValue: JsValue): void {
    const handle = ctx.resources.add(plan.resourceTypeIdx, jsValue);
    ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setInt32(0, handle, true);
}

export function borrowResourceDirectStorer(_plan: OwnResourceStorerPlan, ctx: MarshalingContext, ptr: number, jsValue: JsValue): void {
    ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setInt32(0, jsValue as number, true);
}

// --- Stream/Future/ErrorContext memory storers ---

export function streamStorer(plan: StreamStorerPlan, ctx: MarshalingContext, ptr: number, jsValue: JsValue): void {
    const handle = ctx.streams.addReadable(0, jsValue, plan.elementStorer, plan.elementSize, ctx);
    ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setInt32(0, handle, true);
}

export function futureMemStorer(plan: FutureStorerPlan, ctx: MarshalingContext, ptr: number, jsValue: JsValue): void {
    const handle = ctx.futures.addReadable(0, jsValue, plan.futureStorer);
    ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setInt32(0, handle, true);
}

/**
 * Wrap a MemoryStorer so that resolved/rejected values are tagged as result ok/err
 * before being stored. Used for future<result<T, E>> types where the CM convention
 * maps ok → Promise resolve, err → Promise reject.
 */
export function createResultWrappingStorer(memStorer: MemoryStorer): (ctx: MarshalingContext, ptr: number, value: unknown, rejected?: boolean) => void {
    return (ctx, ptr, value, rejected) => {
        const wrapped = rejected
            ? { tag: ERR, val: value }
            : { tag: OK, val: value };
        memStorer(ctx, ptr, wrapped);
    };
}

export function errorContextStorer(ctx: MarshalingContext, ptr: number, jsValue: JsValue): void {
    const handle = ctx.errorContexts.add(jsValue);
    ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setInt32(0, handle, true);
}
