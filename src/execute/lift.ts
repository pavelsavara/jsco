// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { BindingContext } from '../resolver/types';
import type { LiftingFromJs, WasmPointer, WasmSize, WasmValue, JsValue } from './types';
import { canonicalNaN32, canonicalNaN64 } from '../utils/shared';
import { validateAllocResult } from './validation';

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
