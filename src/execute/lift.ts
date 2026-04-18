// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { BindingContext } from '../resolver/types';
import type { LiftingFromJs, WasmPointer, WasmSize, WasmValue, JsValue } from './types';
import type { MemoryStorer } from '../resolver/binding/to-abi';
import { FlatType } from '../resolver/calling-convention';
import { canonicalNaN32, canonicalNaN64, _f32, _i32, _f64, _i64 } from '../utils/shared';
import { validateAllocResult } from './validation';
import { TAG, VAL, OK } from '../utils/constants';

// --- Primitive lifting functions (JS → WASM flat args) ---
// These are stateless top-level functions with no captured state.
// Signature: (ctx: BindingContext, srcJsValue: JsValue, out: WasmValue[], offset: number) => number

export function boolLifting(_: BindingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    out[offset] = srcJsValue ? 1 : 0;
    return 1;
}

export function s8Lifting(_: BindingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    const num = srcJsValue as number;
    out[offset] = (num << 24) >> 24;
    return 1;
}

export function u8Lifting(_: BindingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    const num = srcJsValue as number;
    out[offset] = num & 0xFF;
    return 1;
}

export function s16Lifting(_: BindingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    const num = srcJsValue as number;
    out[offset] = (num << 16) >> 16;
    return 1;
}

export function u16Lifting(_: BindingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    const num = srcJsValue as number;
    out[offset] = num & 0xFFFF;
    return 1;
}

export function s32Lifting(_: BindingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    const num = srcJsValue as number;
    out[offset] = num | 0;
    return 1;
}

export function u32Lifting(_: BindingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    const num = srcJsValue as number;
    out[offset] = num >>> 0;
    return 1;
}

export function s64LiftingNumber(_: BindingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    out[offset] = srcJsValue;
    return 1;
}

export function s64LiftingBigInt(_: BindingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    out[offset] = srcJsValue;
    return 1;
}

export function u64LiftingNumber(_: BindingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    out[offset] = srcJsValue;
    return 1;
}

export function u64LiftingBigInt(_: BindingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    out[offset] = srcJsValue;
    return 1;
}

export function f32Lifting(_: BindingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    if (typeof srcJsValue !== 'number') throw new TypeError(`expected a number for f32, got ${typeof srcJsValue}`);
    const num = Math.fround(srcJsValue);
    // Spec: canonicalize_nan32 — replace any NaN with canonical NaN
    out[offset] = num !== num ? canonicalNaN32 : num;
    return 1;
}

export function f64Lifting(_: BindingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    if (typeof srcJsValue !== 'number') throw new TypeError(`expected a number for f64, got ${typeof srcJsValue}`);
    const num = +srcJsValue;
    // Spec: canonicalize_nan64 — replace any NaN with canonical NaN
    out[offset] = num !== num ? canonicalNaN64 : num;
    return 1;
}

export function charLifting(_: BindingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    if (typeof srcJsValue !== 'string') throw new TypeError(`expected a string for char, got ${typeof srcJsValue}`);
    const cp = srcJsValue.codePointAt(0)!;
    // Spec: char_to_i32 — surrogates are not valid Unicode scalar values
    if (cp >= 0xD800 && cp <= 0xDFFF) throw new Error(`Invalid char: surrogate codepoint ${cp}`);
    out[offset] = cp;
    return 1;
}

export function stringLiftingUtf8(ctx: BindingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    const str = srcJsValue as string;
    if (typeof str !== 'string') throw new TypeError('expected a string');
    if (str.length === 0) {
        out[offset] = 0;
        out[offset + 1] = 0;
        return 2;
    }
    // Pre-compute exact UTF-8 byte length to avoid growing realloc calls.
    // The WASI preview1 adapter's cabi_import_realloc only supports shrinking,
    // and also expects adjacent string allocations (e.g., for "key=value\0"
    // env vars), so we must allocate the exact size in a single call.
    const encoded = ctx.utf8Encoder.encode(str);
    const byteLen = encoded.byteLength;
    const ptr = ctx.allocator.realloc(0 as WasmPointer, 0 as WasmSize, 1, byteLen);
    validateAllocResult(ctx, ptr, 1, byteLen);
    ctx.memory.getViewU8(ptr, byteLen as WasmSize).set(encoded);
    out[offset] = ptr;
    out[offset + 1] = byteLen;
    return 2;
}

export function stringLiftingUtf16(ctx: BindingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    const str = srcJsValue as string;
    if (typeof str !== 'string') throw new TypeError('expected a string');
    if (str.length === 0) {
        out[offset] = 0;
        out[offset + 1] = 0;
        return 2;
    }
    // UTF-16: each code unit is 2 bytes, alignment = 2
    const codeUnits = str.length;
    const byteLen = codeUnits * 2;
    const ptr = ctx.allocator.realloc(0 as WasmPointer, 0 as WasmSize, 2, byteLen);
    validateAllocResult(ctx, ptr, 2, byteLen);
    const view = ctx.memory.getViewU8(ptr, byteLen as WasmSize);
    for (let i = 0; i < codeUnits; i++) {
        const cu = str.charCodeAt(i);
        view[i * 2] = cu & 0xFF;
        view[i * 2 + 1] = (cu >> 8) & 0xFF;
    }
    // Return pointer and code unit count (not byte count)
    out[offset] = ptr;
    out[offset + 1] = codeUnits;
    return 2;
}

// --- Resource lifting functions ---

export type ResourceLiftPlan = { resourceTypeIdx: number };

export function ownLifting(plan: ResourceLiftPlan, ctx: BindingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    out[offset] = ctx.resources.add(plan.resourceTypeIdx, srcJsValue);
    return 1;
}

export function borrowLifting(plan: ResourceLiftPlan, ctx: BindingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    out[offset] = ctx.resources.add(plan.resourceTypeIdx, srcJsValue);
    return 1;
}

export function borrowLiftingDirect(_plan: ResourceLiftPlan, _ctx: BindingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    out[offset] = srcJsValue;
    return 1;
}

// --- Enum lifting ---

export type EnumLiftPlan = { nameToIndex: Map<string, number> };

export function enumLifting(plan: EnumLiftPlan, _ctx: BindingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    const idx = plan.nameToIndex.get(srcJsValue as string);
    if (idx === undefined) throw new Error(`Unknown enum value: ${srcJsValue}`);
    out[offset] = idx;
    return 1;
}

// --- Flags lifting ---

export type FlagsLiftPlan = { wordCount: number, memberNames: string[] };

export function flagsLifting(plan: FlagsLiftPlan, _ctx: BindingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    if (srcJsValue == null || typeof srcJsValue !== 'object') throw new TypeError(`expected an object for flags, got ${srcJsValue === null ? 'null' : typeof srcJsValue}`);
    const flags = srcJsValue as Record<string, boolean>;
    for (let w = 0; w < plan.wordCount; w++) {
        let word = 0;
        for (let b = 0; b < 32 && w * 32 + b < plan.memberNames.length; b++) {
            if (flags[plan.memberNames[w * 32 + b]!]) word |= (1 << (b & 31));
        }
        out[offset + w] = word;
    }
    return plan.wordCount;
}

// --- Record lifting ---

export type RecordLiftPlan = { fields: { name: string, lifter: LiftingFromJs }[] };

export function recordLifting(plan: RecordLiftPlan, ctx: BindingContext, srcJsRecord: JsValue, out: WasmValue[], offset: number): number {
    if (srcJsRecord == null || typeof srcJsRecord !== 'object') throw new TypeError(`expected an object for record, got ${srcJsRecord === null ? 'null' : typeof srcJsRecord}`);
    let pos = 0;
    for (let i = 0; i < plan.fields.length; i++) {
        const l = plan.fields[i]!;
        pos += l.lifter(ctx, srcJsRecord[l.name], out, offset + pos);
    }
    return pos;
}

// --- Tuple lifting ---

export type TupleLiftPlan = { elementLifters: LiftingFromJs[] };

export function tupleLifting(plan: TupleLiftPlan, ctx: BindingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    if (srcJsValue == null) throw new TypeError(`expected an array for tuple, got ${srcJsValue === null ? 'null' : 'undefined'}`);
    if (srcJsValue.length !== plan.elementLifters.length) {
        throw new Error(`Expected tuple of ${plan.elementLifters.length} elements, got ${srcJsValue.length}`);
    }
    let pos = 0;
    for (let i = 0; i < plan.elementLifters.length; i++) {
        const lifter = plan.elementLifters[i]!;
        pos += lifter(ctx, srcJsValue[i], out, offset + pos);
    }
    return pos;
}

// --- List lifting ---

export type ListLiftPlan = { elemSize: number, elemAlign: number, elemStorer: MemoryStorer };

export function listLifting(plan: ListLiftPlan, ctx: BindingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    if (srcJsValue == null) throw new TypeError(`expected an array for list, got ${srcJsValue === null ? 'null' : 'undefined'}`);
    const len = srcJsValue.length;
    if (len === 0) {
        out[offset] = 0;
        out[offset + 1] = 0;
        return 2;
    }

    const totalSize = len * plan.elemSize;
    const ptr = ctx.allocator.realloc(0 as WasmPointer, 0 as WasmSize, plan.elemAlign as WasmSize, totalSize as WasmSize);
    validateAllocResult(ctx, ptr, plan.elemAlign, totalSize);

    for (let i = 0; i < len; i++) {
        plan.elemStorer(ctx, ptr + i * plan.elemSize, srcJsValue[i]);
    }

    out[offset] = ptr;
    out[offset + 1] = len;
    return 2;
}

// --- Option lifting ---

export type OptionLiftPlan = { innerLifter: LiftingFromJs, totalSize: number };

export function optionLifting(plan: OptionLiftPlan, ctx: BindingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    out.fill(0, offset, offset + plan.totalSize);
    if (srcJsValue === null || srcJsValue === undefined) {
        return plan.totalSize;
    }
    out[offset] = 1;
    plan.innerLifter(ctx, srcJsValue, out, offset + 1);
    return plan.totalSize;
}

// --- Result lifting ---

export type ResultLiftPlan = {
    okLifter?: LiftingFromJs, errLifter?: LiftingFromJs,
    totalSize: number, payloadJoined: FlatType[],
    okFlatTypes: FlatType[], errFlatTypes: FlatType[],
    okNeedsCoercion: boolean, errNeedsCoercion: boolean,
};

export function resultLifting(plan: ResultLiftPlan, ctx: BindingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    if (srcJsValue == null) throw new TypeError(`expected a result value, got ${srcJsValue === null ? 'null' : 'undefined'}`);
    const tag = srcJsValue[TAG], val = srcJsValue[VAL];
    if (typeof tag !== 'string') throw new TypeError(`Expected result value with 'tag' field, got ${typeof srcJsValue === 'object' ? JSON.stringify(srcJsValue) : typeof srcJsValue}`);
    out.fill(0, offset, offset + plan.totalSize);
    if (tag === OK) {
        if (plan.okLifter) plan.okLifter(ctx, val, out, offset + 1);
        if (plan.okNeedsCoercion) {
            for (let i = 0; i < plan.okFlatTypes.length; i++) {
                const okFT = plan.okFlatTypes[i];
                const joinedFT = plan.payloadJoined[i];
                if (okFT !== undefined && joinedFT !== undefined && okFT !== joinedFT) {
                    out[offset + 1 + i] = coerceFlatLift(out[offset + 1 + i] as number, okFT, joinedFT);
                }
            }
        }
    } else {
        out[offset] = 1;
        if (plan.errLifter) plan.errLifter(ctx, val, out, offset + 1);
        if (plan.errNeedsCoercion) {
            for (let i = 0; i < plan.errFlatTypes.length; i++) {
                const errFT = plan.errFlatTypes[i];
                const joinedFT = plan.payloadJoined[i];
                if (errFT !== undefined && joinedFT !== undefined && errFT !== joinedFT) {
                    out[offset + 1 + i] = coerceFlatLift(out[offset + 1 + i] as number, errFT, joinedFT);
                }
            }
        }
    }
    return plan.totalSize;
}

// --- Variant lifting ---

export type VariantCaseLiftPlan = {
    index: number, lifter?: LiftingFromJs,
    caseFlatTypes: FlatType[], needsCoercion: boolean,
};

export type VariantLiftPlan = {
    totalSize: number, payloadJoined: FlatType[],
    nameToCase: Map<string, VariantCaseLiftPlan>,
};

export function variantLifting(plan: VariantLiftPlan, ctx: BindingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    if (srcJsValue == null) throw new TypeError(`expected a variant value, got ${srcJsValue === null ? 'null' : 'undefined'}`);
    const tag = srcJsValue[TAG], val = srcJsValue[VAL];
    if (typeof tag !== 'string') throw new TypeError(`Expected variant value with 'tag' field, got ${typeof srcJsValue === 'object' ? JSON.stringify(srcJsValue) : typeof srcJsValue}`);
    const c = plan.nameToCase.get(tag);
    if (!c) throw new Error(`Unknown variant case: ${tag}`);
    out.fill(0, offset, offset + plan.totalSize);
    out[offset] = c.index;
    if (c.lifter && val !== undefined) {
        c.lifter(ctx, val, out, offset + 1);
    }
    // Coerce from case's natural flat types to the joined flat types
    if (c.needsCoercion) {
        for (let i = 0; i < c.caseFlatTypes.length; i++) {
            const have = c.caseFlatTypes[i];
            const want = plan.payloadJoined[i];
            if (have !== undefined && want !== undefined && have !== want) {
                out[offset + 1 + i] = coerceFlatLift(out[offset + 1 + i] as number, have, want);
            }
        }
    }
    return plan.totalSize;
}

// --- Stream lifting (JS AsyncIterable → i32 handle) ---

export function streamLifting(ctx: BindingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    out[offset] = ctx.streams.addReadable(0, srcJsValue);
    return 1;
}

// --- Future lifting (JS Promise → i32 handle) ---

export type FutureLiftPlan = { storer?: (ctx: BindingContext, ptr: number, value: unknown, rejected?: boolean) => void };

export function futureLifting(plan: FutureLiftPlan, ctx: BindingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    out[offset] = ctx.futures.addReadable(0, srcJsValue, plan.storer);
    return 1;
}

// --- Error-context lifting (JS Error → i32 handle) ---

export function errorContextLifting(ctx: BindingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    out[offset] = ctx.errorContexts.add(srcJsValue);
    return 1;
}

/**
 * Coerce a value from one flat type to another during lifting (JS→WASM).
 * Follows the spec's lower_flat_variant coercion table.
 */
export function coerceFlatLift(value: number, have: FlatType, want: FlatType): WasmValue {
    // (f32, i32): reinterpret f32 as i32
    if (have === FlatType.F32 && want === FlatType.I32) {
        _f32[0] = value;
        return _i32[0] as number;
    }
    // (i32, i64): widen i32 to i64 — keep as Number, trampoline converts to BigInt
    if (have === FlatType.I32 && want === FlatType.I64) {
        return value >>> 0;
    }
    // (f32, i64): reinterpret f32 as i32, then widen to i64 — keep as Number
    if (have === FlatType.F32 && want === FlatType.I64) {
        _f32[0] = value;
        return (_i32[0] as number) >>> 0;
    }
    // (f64, i64): reinterpret f64 as i64
    if (have === FlatType.F64 && want === FlatType.I64) {
        _f64[0] = value;
        return _i64[0] as bigint;
    }
    return value;
}
