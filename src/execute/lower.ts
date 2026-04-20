// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { BindingContext } from '../resolver/types';
import type { LoweringToJs, WasmPointer, WasmSize, WasmValue, JsValue } from './types';
import type { MemoryLoader } from '../resolver/binding/to-js';
import { FlatType } from '../resolver/calling-convention';
import { canonicalNaN32, canonicalNaN64, _f32, _i32, _f64, _i64, _i32_64 } from '../utils/shared';
import { validateUtf16, validatePointerAlignment } from './validation';
import { TAG, VAL, OK, ERR } from '../utils/constants';

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

// --- List lowering ---

export type ListLowerPlan = { elemSize: number, elemAlign: number, elemLoader: MemoryLoader };

export function listLowering(plan: ListLowerPlan, ctx: BindingContext, ...args: WasmValue[]): JsValue {
    const ptr = (args[0] as number) >>> 0;
    const len = (args[1] as number) >>> 0;
    if (len > 0) {
        // Validate list pointer alignment
        validatePointerAlignment(ptr, plan.elemAlign, 'list');
        // Validate bounds
        const memorySize = ctx.memory.getMemory().buffer.byteLength;
        if (ptr + len * plan.elemSize > memorySize) {
            throw new Error(`list pointer out of bounds: ptr=${ptr} len=${len} elem_size=${plan.elemSize} memory_size=${memorySize}`);
        }
    }
    const result = new Array(len);
    for (let i = 0; i < len; i++) {
        result[i] = plan.elemLoader(ctx, ptr + i * plan.elemSize);
    }
    return result;
}

// --- Option lowering ---

export type OptionLowerPlan = { innerLowerer: LoweringToJs, innerSpill: number };

export function optionLowering(plan: OptionLowerPlan, ctx: BindingContext, ...args: WasmValue[]): JsValue {
    const discriminant = args[0] as number;
    if (discriminant > 1) throw new Error(`Invalid option discriminant: ${discriminant}`);
    if (discriminant === 0) return null;
    const payload = args.slice(1, 1 + plan.innerSpill);
    return plan.innerLowerer(ctx, ...payload);
}

// --- Result lowering ---

export type ResultLowerPlan = {
    okLowerer?: LoweringToJs, errLowerer?: LoweringToJs,
    payloadJoined: FlatType[],
    okFlatTypes: FlatType[], errFlatTypes: FlatType[],
};

export function resultLowering(plan: ResultLowerPlan, ctx: BindingContext, ...args: WasmValue[]): JsValue {
    const discriminant = args[0] as number;
    if (discriminant > 1) throw new Error(`Invalid result discriminant: ${discriminant}`);
    const payload = args.slice(1, 1 + plan.payloadJoined.length);
    if (discriminant === 0) {
        const val = plan.okLowerer ? plan.okLowerer(ctx, ...payload.slice(0, plan.okFlatTypes.length)) : undefined;
        return { [TAG]: OK, [VAL]: val };
    } else {
        const val = plan.errLowerer ? plan.errLowerer(ctx, ...payload.slice(0, plan.errFlatTypes.length)) : undefined;
        return { [TAG]: ERR, [VAL]: val };
    }
}

export function resultLoweringCoerced(plan: ResultLowerPlan, ctx: BindingContext, ...args: WasmValue[]): JsValue {
    const discriminant = args[0] as number;
    if (discriminant > 1) throw new Error(`Invalid result discriminant: ${discriminant}`);
    const payload = args.slice(1, 1 + plan.payloadJoined.length);
    if (discriminant === 0) {
        for (let i = 0; i < plan.okFlatTypes.length; i++) {
            const joinedFT = plan.payloadJoined[i];
            const okFT = plan.okFlatTypes[i];
            if (joinedFT !== undefined && okFT !== undefined && joinedFT !== okFT) {
                payload[i] = coerceFlatLower(payload[i] as WasmValue, joinedFT, okFT);
            }
        }
        const val = plan.okLowerer ? plan.okLowerer(ctx, ...payload.slice(0, plan.okFlatTypes.length)) : undefined;
        return { [TAG]: OK, [VAL]: val };
    } else {
        for (let i = 0; i < plan.errFlatTypes.length; i++) {
            const joinedFT = plan.payloadJoined[i];
            const errFT = plan.errFlatTypes[i];
            if (joinedFT !== undefined && errFT !== undefined && joinedFT !== errFT) {
                payload[i] = coerceFlatLower(payload[i] as WasmValue, joinedFT, errFT);
            }
        }
        const val = plan.errLowerer ? plan.errLowerer(ctx, ...payload.slice(0, plan.errFlatTypes.length)) : undefined;
        return { [TAG]: ERR, [VAL]: val };
    }
}

// --- Variant lowering ---

export type VariantCaseLowerPlan = {
    name: string, lowerer?: LoweringToJs,
    caseFlatTypes: FlatType[], needsCoercion: boolean,
};

export type VariantLowerPlan = {
    cases: VariantCaseLowerPlan[], payloadJoined: FlatType[],
};

export function variantLowering(plan: VariantLowerPlan, ctx: BindingContext, ...args: WasmValue[]): JsValue {
    const disc = args[0] as number;
    const c = plan.cases[disc];
    if (!c) throw new Error(`Invalid variant discriminant: ${disc}`);
    if (c.lowerer) {
        // Coerce payload args from joined flat types to case's natural flat types
        const payload = args.slice(1, 1 + c.caseFlatTypes.length);
        if (c.needsCoercion) {
            for (let i = 0; i < c.caseFlatTypes.length; i++) {
                const have = plan.payloadJoined[i];
                const want = c.caseFlatTypes[i];
                if (have !== undefined && want !== undefined && have !== want) {
                    payload[i] = coerceFlatLower(payload[i] as WasmValue, have, want);
                }
            }
        }
        return { [TAG]: c.name, [VAL]: c.lowerer(ctx, ...payload) };
    }
    return { [TAG]: c.name };
}

// --- Stream lowering (i32 handle → JS AsyncIterable) ---

export function streamLowering(ctx: BindingContext, ...args: WasmValue[]): unknown {
    const handle = args[0] as number;
    return ctx.streams.removeReadable(0, handle);
}

// --- Future lowering (i32 handle → JS Promise) ---

export function futureLowering(ctx: BindingContext, ...args: WasmValue[]): unknown {
    const handle = args[0] as number;
    return ctx.futures.removeReadable(0, handle);
}

// --- Error-context lowering (i32 handle → JS Error) ---

export function errorContextLowering(ctx: BindingContext, ...args: WasmValue[]): unknown {
    const handle = args[0] as number;
    return ctx.errorContexts.remove(handle);
}

/**
 * Coerce a value from the joined flat type to the case's natural flat type during lowering (WASM→JS).
 * Follows the spec's lift_flat_variant CoerceValueIter.
 */
export function coerceFlatLower(value: WasmValue, have: FlatType, want: FlatType): WasmValue {
    // (i32, f32): decode_i32_as_float
    if (have === FlatType.I32 && want === FlatType.F32) {
        _i32[0] = value as number;
        return _f32[0] as number;
    }
    // (i64, i32): wrap_i64_to_i32 — use shared buffer to avoid BigInt.asUintN allocation
    if (have === FlatType.I64 && want === FlatType.I32) {
        _i64[0] = value as bigint;
        return _i32_64[0]! >>> 0;
    }
    // (i64, f32): wrap_i64_to_i32 then decode_i32_as_float
    if (have === FlatType.I64 && want === FlatType.F32) {
        _i64[0] = value as bigint;
        _i32[0] = _i32_64[0]!;
        return _f32[0] as number;
    }
    // (i64, f64): decode_i64_as_float
    if (have === FlatType.I64 && want === FlatType.F64) {
        _i64[0] = value as bigint;
        return _f64[0] as number;
    }
    return value;
}
