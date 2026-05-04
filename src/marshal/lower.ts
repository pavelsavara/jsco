// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import type { MarshalingContext } from '../resolver/types';
import type { WasmPointer, WasmSize, WasmValue, JsValue } from './model/types';
import type { ResourceLowerPlan, EnumLowerPlan, FlagsLowerPlan, RecordLowerPlan, TupleLowerPlan, ListLowerPlan, OptionLowerPlan, ResultLowerPlan, VariantLowerPlan, StreamLowerPlan, FutureLowerPlan } from './model/lower-plans';
export type { ResourceLowerPlan, EnumLowerPlan, FlagsLowerPlan, RecordLowerPlan, TupleLowerPlan, ListLowerPlan, OptionLowerPlan, ResultLowerPlan, VariantCaseLowerPlan, VariantLowerPlan, StreamLowerPlan, FutureLowerPlan } from './model/lower-plans';
import { FlatType } from '../resolver/calling-convention';
import { canonicalNaN32, canonicalNaN64, _f32, _i32, _f64, _i64, _i32_64 } from '../utils/shared';
import { validateUtf16, validatePointerAlignment, validateBoundarySize } from './validation';
import { OK, ERR } from './constants';

// --- Primitive lowering functions (WASM flat args → JS values) ---
// These are stateless top-level functions with no captured state.
// Signature: (ctx: MarshalingContext, ...args: WasmValue[]) => JsValue

export function lowerBool(_: MarshalingContext, ...args: WasmValue[]): JsValue {
    return args[0] !== 0;
}

export function lowerS8(_: MarshalingContext, ...args: WasmValue[]): JsValue {
    const num = args[0] as number;
    return (num << 24) >> 24;
}

export function lowerU8(_: MarshalingContext, ...args: WasmValue[]): JsValue {
    const num = args[0] as number;
    return num & 0xFF;
}

export function lowerS16(_: MarshalingContext, ...args: WasmValue[]): JsValue {
    const num = args[0] as number;
    return (num << 16) >> 16;
}

export function lowerU16(_: MarshalingContext, ...args: WasmValue[]): JsValue {
    const num = args[0] as number;
    return num & 0xFFFF;
}

export function lowerS32(_: MarshalingContext, ...args: WasmValue[]): JsValue {
    const num = args[0] as number;
    return num | 0;
}

export function lowerU32(_: MarshalingContext, ...args: WasmValue[]): JsValue {
    const num = args[0] as number;
    return num >>> 0;
}

export function lowerS64BigInt(_: MarshalingContext, ...args: WasmValue[]): JsValue {
    return args[0];
}

export function lowerS64Number(_: MarshalingContext, ...args: WasmValue[]): JsValue {
    return Number(args[0] as bigint);
}

export function lowerU64BigInt(_: MarshalingContext, ...args: WasmValue[]): JsValue {
    // WASM returns i64 as signed BigInt — reinterpret as unsigned
    return BigInt.asUintN(64, args[0] as bigint);
}

export function lowerU64Number(_: MarshalingContext, ...args: WasmValue[]): JsValue {
    return Number(args[0] as bigint);
}

export function lowerF32(_: MarshalingContext, ...args: WasmValue[]): JsValue {
    const v = Math.fround(args[0] as number);
    // Spec: canonicalize_nan32 — replace any NaN with canonical NaN
    if (v !== v) return canonicalNaN32;
    return v;
}

export function lowerF64(_: MarshalingContext, ...args: WasmValue[]): JsValue {
    const v = +(args[0] as number);
    // Spec: canonicalize_nan64 — replace any NaN with canonical NaN
    if (v !== v) return canonicalNaN64;
    return v;
}

export function lowerChar(_: MarshalingContext, ...args: WasmValue[]): JsValue {
    const i = args[0] as number;
    if (i >= 0x110000) throw new Error(`Invalid char codepoint: ${i} >= 0x110000`);
    if (i >= 0xD800 && i <= 0xDFFF) throw new Error(`Invalid char codepoint: surrogate ${i}`);
    return String.fromCodePoint(i);
}

export function lowerStringUtf8(ctx: MarshalingContext, ...args: WasmValue[]): JsValue {
    const pointer = (args[0] as number) >>> 0 as WasmPointer;
    const len = (args[1] as number) >>> 0 as WasmSize;
    if (len as number > 0) {
        validateBoundarySize(ctx, len as number, 'string<utf8>');
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

export function lowerStringUtf16(ctx: MarshalingContext, ...args: WasmValue[]): JsValue {
    const pointer = (args[0] as number) >>> 0 as WasmPointer;
    const codeUnits = (args[1] as number) >>> 0 as WasmSize;
    if (codeUnits as number > 0) {
        const byteLen = (codeUnits as number) * 2;
        validateBoundarySize(ctx, byteLen, 'string<utf16>');
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

export function lowerOwn(plan: ResourceLowerPlan, ctx: MarshalingContext, ...args: WasmValue[]): JsValue {
    const handle = args[0] as number;
    return ctx.resources.remove(plan.resourceTypeIdx, handle);
}

export function lowerBorrow(plan: ResourceLowerPlan, ctx: MarshalingContext, ...args: WasmValue[]): JsValue {
    const handle = args[0] as number;
    return ctx.resources.get(plan.resourceTypeIdx, handle);
}

export function lowerBorrowDirect(_plan: ResourceLowerPlan, _ctx: MarshalingContext, ...args: WasmValue[]): JsValue {
    return args[0];
}

// --- Enum lowering ---

export function lowerEnum(plan: EnumLowerPlan, _ctx: MarshalingContext, ...args: WasmValue[]): JsValue {
    const disc = args[0] as number;
    if (disc >= plan.members.length) throw new Error(`Invalid enum discriminant: ${disc} >= ${plan.members.length}`);
    return plan.members[disc];
}

// --- Flags lowering ---

export function lowerFlags(plan: FlagsLowerPlan, _ctx: MarshalingContext, ...args: WasmValue[]): JsValue {
    const result: Record<string, boolean> = {};
    for (let i = 0; i < plan.memberNames.length; i++) {
        const word = args[i >>> 5] as number;
        result[plan.memberNames[i]!] = !!(word & (1 << (i & 31)));
    }
    return result;
}

// --- Record lowering ---

export function lowerRecord(plan: RecordLowerPlan, ctx: MarshalingContext, ...args: WasmValue[]): JsValue {
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

export function lowerTuple(plan: TupleLowerPlan, ctx: MarshalingContext, ...args: WasmValue[]): JsValue {
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

export function lowerList(plan: ListLowerPlan, ctx: MarshalingContext, ...args: WasmValue[]): JsValue {
    const ptr = (args[0] as number) >>> 0;
    const len = (args[1] as number) >>> 0;
    if (len > 0) {
        // Validate list pointer alignment
        validatePointerAlignment(ptr, plan.elemAlign, 'list');
        const totalBytes = len * plan.elemSize;
        validateBoundarySize(ctx, totalBytes, 'list');
        // Validate bounds
        const memorySize = ctx.memory.getMemory().buffer.byteLength;
        if (ptr + totalBytes > memorySize) {
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

export function lowerOption(plan: OptionLowerPlan, ctx: MarshalingContext, ...args: WasmValue[]): JsValue {
    const discriminant = args[0] as number;
    if (discriminant > 1) throw new Error(`Invalid option discriminant: ${discriminant}`);
    if (discriminant === 0) return null;
    const payload = args.slice(1, 1 + plan.innerSpill);
    return plan.innerLowerer(ctx, ...payload);
}

// --- Result lowering ---

export function lowerResult(plan: ResultLowerPlan, ctx: MarshalingContext, ...args: WasmValue[]): JsValue {
    const discriminant = args[0] as number;
    if (discriminant > 1) throw new Error(`Invalid result discriminant: ${discriminant}`);
    const payload = args.slice(1, 1 + plan.payloadJoined.length);
    if (discriminant === 0) {
        const val = plan.okLowerer ? plan.okLowerer(ctx, ...payload.slice(0, plan.okFlatTypes.length)) : undefined;
        return { tag: OK, val: val };
    } else {
        const val = plan.errLowerer ? plan.errLowerer(ctx, ...payload.slice(0, plan.errFlatTypes.length)) : undefined;
        return { tag: ERR, val: val };
    }
}

export function lowerResultCoerced(plan: ResultLowerPlan, ctx: MarshalingContext, ...args: WasmValue[]): JsValue {
    const discriminant = args[0] as number;
    if (discriminant > 1) throw new Error(`Invalid result discriminant: ${discriminant}`);
    const payload = args.slice(1, 1 + plan.payloadJoined.length);
    if (discriminant === 0) {
        for (let i = 0; i < plan.okFlatTypes.length; i++) {
            const joinedFT = plan.payloadJoined[i];
            const okFT = plan.okFlatTypes[i];
            if (joinedFT !== undefined && okFT !== undefined && joinedFT !== okFT) {
                payload[i] = lowerFlatCoerce(payload[i] as WasmValue, joinedFT, okFT);
            }
        }
        const val = plan.okLowerer ? plan.okLowerer(ctx, ...payload.slice(0, plan.okFlatTypes.length)) : undefined;
        return { tag: OK, val: val };
    } else {
        for (let i = 0; i < plan.errFlatTypes.length; i++) {
            const joinedFT = plan.payloadJoined[i];
            const errFT = plan.errFlatTypes[i];
            if (joinedFT !== undefined && errFT !== undefined && joinedFT !== errFT) {
                payload[i] = lowerFlatCoerce(payload[i] as WasmValue, joinedFT, errFT);
            }
        }
        const val = plan.errLowerer ? plan.errLowerer(ctx, ...payload.slice(0, plan.errFlatTypes.length)) : undefined;
        return { tag: ERR, val: val };
    }
}

// --- Variant lowering ---

export function lowerVariant(plan: VariantLowerPlan, ctx: MarshalingContext, ...args: WasmValue[]): JsValue {
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
                    payload[i] = lowerFlatCoerce(payload[i] as WasmValue, have, want);
                }
            }
        }
        return { tag: c.name, val: c.lowerer(ctx, ...payload) };
    }
    return { tag: c.name };
}

// --- Stream lowering (JS AsyncIterable → i32 handle) ---

export function lowerStream(plan: StreamLowerPlan, ctx: MarshalingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    out[offset] = ctx.streams.addReadable(0, srcJsValue, plan.elementStorer, plan.elementSize, ctx);
    return 1;
}

// --- Future lowering (JS Promise → i32 handle) ---

export function lowerFuture(plan: FutureLowerPlan, ctx: MarshalingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    out[offset] = ctx.futures.addReadable(0, srcJsValue, plan.storer);
    return 1;
}

// --- Error-context lowering (JS Error → i32 handle) ---

export function lowerErrorContext(ctx: MarshalingContext, srcJsValue: JsValue, out: WasmValue[], offset: number): number {
    out[offset] = ctx.errorContexts.add(srcJsValue);
    return 1;
}

/**
 * Coerce a value from the joined flat type to the case's natural flat type during lowering (WASM→JS).
 * Follows the spec's lift_flat_variant CoerceValueIter (definitions.py L1894).
 * Reinterpret-as-float results are passed through canonicalize_nan{32,64}.
 */
export function lowerFlatCoerce(value: WasmValue, have: FlatType, want: FlatType): WasmValue {
    // (i32, f32): decode_i32_as_float = canonicalize_nan32(reinterpret)
    if (have === FlatType.I32 && want === FlatType.F32) {
        _i32[0] = value as number;
        const f = _f32[0] as number;
        return f !== f ? canonicalNaN32 : f;
    }
    // (i64, i32): wrap_i64_to_i32 — use shared buffer to avoid BigInt.asUintN allocation
    if (have === FlatType.I64 && want === FlatType.I32) {
        _i64[0] = value as bigint;
        return _i32_64[0]! >>> 0;
    }
    // (i64, f32): wrap_i64_to_i32 then decode_i32_as_float — canonicalize NaN
    if (have === FlatType.I64 && want === FlatType.F32) {
        _i64[0] = value as bigint;
        _i32[0] = _i32_64[0]!;
        const f = _f32[0] as number;
        return f !== f ? canonicalNaN32 : f;
    }
    // (i64, f64): decode_i64_as_float = canonicalize_nan64(reinterpret)
    if (have === FlatType.I64 && want === FlatType.F64) {
        _i64[0] = value as bigint;
        const f = _f64[0] as number;
        return f !== f ? canonicalNaN64 : f;
    }
    return value;
}
