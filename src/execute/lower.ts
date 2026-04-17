// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { BindingContext } from '../resolver/types';
import type { WasmValue, JsValue } from './types';
import { canonicalNaN32, canonicalNaN64 } from '../utils/shared';

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
