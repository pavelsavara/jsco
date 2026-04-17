// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { BindingContext } from '../resolver/types';
import type { LoweringToJs, WasmPointer, WasmSize, WasmValue, JsValue } from './types';
import { canonicalNaN32, canonicalNaN64 } from '../utils/shared';
import { validateUtf16 } from './validation';

// --- Primitive lowering functions (WASM flat args → JS values) ---
// These are stateless top-level functions with no captured state.
// Signature: (ctx: BindingContext, ...args: WasmValue[]) => JsValue

export function boolLowering(_: BindingContext, ...args: WasmValue[]): JsValue {
    return args[0] !== 0;
}

export function s8Lowering(_: BindingContext, ...args: WasmValue[]): JsValue {
    const num = args[0] as number;
    return (num << 24) >> 24;
}

export function u8Lowering(_: BindingContext, ...args: WasmValue[]): JsValue {
    const num = args[0] as number;
    return num & 0xFF;
}

export function s16Lowering(_: BindingContext, ...args: WasmValue[]): JsValue {
    const num = args[0] as number;
    return (num << 16) >> 16;
}

export function u16Lowering(_: BindingContext, ...args: WasmValue[]): JsValue {
    const num = args[0] as number;
    return num & 0xFFFF;
}

export function s32Lowering(_: BindingContext, ...args: WasmValue[]): JsValue {
    const num = args[0] as number;
    return num | 0;
}

export function u32Lowering(_: BindingContext, ...args: WasmValue[]): JsValue {
    const num = args[0] as number;
    return num >>> 0;
}

export function s64LoweringBigInt(_: BindingContext, ...args: WasmValue[]): JsValue {
    return args[0];
}

export function s64LoweringNumber(_: BindingContext, ...args: WasmValue[]): JsValue {
    return Number(args[0] as bigint);
}

export function u64LoweringBigInt(_: BindingContext, ...args: WasmValue[]): JsValue {
    // WASM returns i64 as signed BigInt — reinterpret as unsigned
    return BigInt.asUintN(64, args[0] as bigint);
}

export function u64LoweringNumber(_: BindingContext, ...args: WasmValue[]): JsValue {
    return Number(args[0] as bigint);
}

export function f32Lowering(_: BindingContext, ...args: WasmValue[]): JsValue {
    const v = Math.fround(args[0] as number);
    // Spec: canonicalize_nan32 — replace any NaN with canonical NaN
    if (v !== v) return canonicalNaN32;
    return v;
}

export function f64Lowering(_: BindingContext, ...args: WasmValue[]): JsValue {
    const v = +(args[0] as number);
    // Spec: canonicalize_nan64 — replace any NaN with canonical NaN
    if (v !== v) return canonicalNaN64;
    return v;
}

export function charLowering(_: BindingContext, ...args: WasmValue[]): JsValue {
    const i = args[0] as number;
    if (i >= 0x110000) throw new Error(`Invalid char codepoint: ${i} >= 0x110000`);
    if (i >= 0xD800 && i <= 0xDFFF) throw new Error(`Invalid char codepoint: surrogate ${i}`);
    return String.fromCodePoint(i);
}

export function stringLoweringUtf8(ctx: BindingContext, ...args: WasmValue[]): JsValue {
    const pointer = (args[0] as number) >>> 0 as WasmPointer;
    const len = (args[1] as number) >>> 0 as WasmSize;
    if (len as number > 0) {
        // Validate bounds
        const memorySize = ctx.memory.getMemory().buffer.byteLength;
        if ((pointer as number) + (len as number) > memorySize) {
            throw new Error(`string pointer out of bounds: ptr=${pointer} len=${len} memory_size=${memorySize}`);
        }
    }
    // TextDecoder with fatal:true validates UTF-8 and decodes in a single native pass
    const view = ctx.memory.getView(pointer, len);
    const res = ctx.utf8Decoder.decode(view);
    return res;
}

export function stringLoweringUtf16(ctx: BindingContext, ...args: WasmValue[]): JsValue {
    const pointer = (args[0] as number) >>> 0 as WasmPointer;
    const codeUnits = (args[1] as number) >>> 0 as WasmSize;
    if (codeUnits as number > 0) {
        const byteLen = (codeUnits as number) * 2;
        // Validate pointer alignment (UTF-16 = 2-byte alignment)
        if ((pointer as number) & 1) {
            throw new Error(`UTF-16 string pointer not aligned: ptr=${pointer}`);
        }
        // Validate bounds
        const memorySize = ctx.memory.getMemory().buffer.byteLength;
        if ((pointer as number) + byteLen > memorySize) {
            throw new Error(`string pointer out of bounds: ptr=${pointer} byte_len=${byteLen} memory_size=${memorySize}`);
        }
    }
    const byteLen = (codeUnits as number) * 2;
    const view = ctx.memory.getView(pointer, byteLen as WasmSize);
    const u16 = new Uint16Array(view.buffer, view.byteOffset, codeUnits as number);
    validateUtf16(u16);
    return String.fromCharCode(...u16);
}

// --- Resource lowering functions ---

export type ResourceLowerPlan = { resourceTypeIdx: number };

export function ownLowering(plan: ResourceLowerPlan, ctx: BindingContext, ...args: WasmValue[]): JsValue {
    const handle = args[0] as number;
    return ctx.resources.remove(plan.resourceTypeIdx, handle);
}

export function borrowLowering(plan: ResourceLowerPlan, ctx: BindingContext, ...args: WasmValue[]): JsValue {
    const handle = args[0] as number;
    return ctx.resources.get(plan.resourceTypeIdx, handle);
}

export function borrowLoweringDirect(_plan: ResourceLowerPlan, _ctx: BindingContext, ...args: WasmValue[]): JsValue {
    return args[0];
}

// --- Enum lowering ---

export type EnumLowerPlan = { members: string[] };

export function enumLowering(plan: EnumLowerPlan, _ctx: BindingContext, ...args: WasmValue[]): JsValue {
    const disc = args[0] as number;
    if (disc >= plan.members.length) throw new Error(`Invalid enum discriminant: ${disc} >= ${plan.members.length}`);
    return plan.members[disc];
}

// --- Flags lowering ---

export type FlagsLowerPlan = { wordCount: number, memberNames: string[] };

export function flagsLowering(plan: FlagsLowerPlan, _ctx: BindingContext, ...args: WasmValue[]): JsValue {
    const result: Record<string, boolean> = {};
    for (let i = 0; i < plan.memberNames.length; i++) {
        const word = args[i >>> 5] as number;
        result[plan.memberNames[i]!] = !!(word & (1 << (i & 31)));
    }
    return result;
}

// --- Record lowering ---

export type RecordLowerPlan = { fields: { name: string, lowerer: LoweringToJs, spill: number }[] };

export function recordLowering(plan: RecordLowerPlan, ctx: BindingContext, ...args: WasmValue[]): JsValue {
    const result: Record<string, unknown> = {};
    let offset = 0;
    for (let i = 0; i < plan.fields.length; i++) {
        const fl = plan.fields[i]!;
        result[fl.name] = fl.lowerer(ctx, ...args.slice(offset, offset + fl.spill));
        offset += fl.spill;
    }
    return result;
}

// --- Tuple lowering ---

export type TupleLowerPlan = { elements: { lowerer: LoweringToJs, spill: number }[] };

export function tupleLowering(plan: TupleLowerPlan, ctx: BindingContext, ...args: WasmValue[]): JsValue {
    const result = new Array(plan.elements.length);
    let offset = 0;
    for (let i = 0; i < plan.elements.length; i++) {
        const el = plan.elements[i]!;
        result[i] = el.lowerer(ctx, ...args.slice(offset, offset + el.spill));
        offset += el.spill;
    }
    return result;
}
