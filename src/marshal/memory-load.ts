// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { MarshalingContext } from '../resolver/types';
import type { WasmPointer, WasmSize, JsValue } from './model/types';
import type { RecordLoaderPlan, ListLoaderPlan, OptionLoaderPlan, ResultLoaderPlan, VariantLoaderPlan, EnumLoaderPlan, FlagsLoaderPlan, TupleLoaderPlan, OwnResourceLoaderPlan } from './model/load-plans';
export type { RecordLoaderPlan, ListLoaderPlan, OptionLoaderPlan, ResultLoaderPlan, VariantLoaderPlan, EnumLoaderPlan, FlagsLoaderPlan, TupleLoaderPlan, OwnResourceLoaderPlan } from './model/load-plans';
import { validatePointerAlignment, validateUtf16, validateBoundarySize } from './validation';
import { OK, ERR } from './constants';

// --- Primitive memory loaders ---

export function boolLoader(ctx: MarshalingContext, ptr: number): boolean {
    return ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize).getUint8(0) !== 0;
}

export function s8Loader(ctx: MarshalingContext, ptr: number): number {
    return ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize).getInt8(0);
}

export function u8Loader(ctx: MarshalingContext, ptr: number): number {
    return ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize).getUint8(0);
}

export function s16Loader(ctx: MarshalingContext, ptr: number): number {
    return ctx.memory.getView(ptr as WasmPointer, 2 as WasmSize).getInt16(0, true);
}

export function u16Loader(ctx: MarshalingContext, ptr: number): number {
    return ctx.memory.getView(ptr as WasmPointer, 2 as WasmSize).getUint16(0, true);
}

export function s32Loader(ctx: MarshalingContext, ptr: number): number {
    return ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).getInt32(0, true);
}

export function u32Loader(ctx: MarshalingContext, ptr: number): number {
    return ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).getUint32(0, true);
}

export function s64LoaderBigInt(ctx: MarshalingContext, ptr: number): bigint {
    return ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize).getBigInt64(0, true);
}

export function s64LoaderNumber(ctx: MarshalingContext, ptr: number): number {
    return Number(ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize).getBigInt64(0, true));
}

export function u64LoaderBigInt(ctx: MarshalingContext, ptr: number): bigint {
    return ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize).getBigUint64(0, true);
}

export function u64LoaderNumber(ctx: MarshalingContext, ptr: number): number {
    return Number(ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize).getBigUint64(0, true));
}

export function f32Loader(ctx: MarshalingContext, ptr: number): number {
    return ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).getFloat32(0, true);
}

export function f64Loader(ctx: MarshalingContext, ptr: number): number {
    return ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize).getFloat64(0, true);
}

export function charLoader(ctx: MarshalingContext, ptr: number): string {
    const i = ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).getUint32(0, true);
    if (i >= 0x110000) throw new Error(`Invalid char codepoint: ${i} >= 0x110000`);
    if (i >= 0xD800 && i <= 0xDFFF) throw new Error(`Invalid char codepoint: surrogate ${i}`);
    return String.fromCodePoint(i);
}

export function stringLoaderUtf16(ctx: MarshalingContext, ptr: number): string {
    const dv = ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize);
    const strPtr = dv.getUint32(0, true);
    const strLen = dv.getUint32(4, true);
    if (strLen > 0) {
        const byteLen = strLen * 2;
        validateBoundarySize(ctx, byteLen, 'string<utf16>');
        if (strPtr & 1) {
            throw new Error(`UTF-16 string pointer not aligned: ptr=${strPtr}`);
        }
        const memorySize = ctx.memory.getMemory().buffer.byteLength;
        if (strPtr + byteLen > memorySize) {
            throw new Error(`string pointer out of bounds: ptr=${strPtr} byte_len=${byteLen} memory_size=${memorySize}`);
        }
        const strView = ctx.memory.getView(strPtr as WasmPointer, byteLen as WasmSize);
        const u16 = new Uint16Array(strView.buffer, strView.byteOffset, strLen);
        validateUtf16(u16);
        return String.fromCharCode(...u16);
    }
    return '';
}

export function stringLoaderUtf8(ctx: MarshalingContext, ptr: number): string {
    const dv = ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize);
    const strPtr = dv.getUint32(0, true);
    const strLen = dv.getUint32(4, true);
    if (strLen > 0) {
        validateBoundarySize(ctx, strLen, 'string<utf8>');
        const memorySize = ctx.memory.getMemory().buffer.byteLength;
        if (strPtr + strLen > memorySize) {
            throw new Error(`string pointer out of bounds: ptr=${strPtr} len=${strLen} memory_size=${memorySize}`);
        }
    }
    // TextDecoder with fatal:true validates UTF-8 and decodes in a single native pass
    const strView = ctx.memory.getView(strPtr as WasmPointer, strLen as WasmSize);
    return ctx.utf8Decoder.decode(strView);
}

// --- Compound memory loaders ---

export function recordLoader(plan: RecordLoaderPlan, ctx: MarshalingContext, ptr: number): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (let i = 0; i < plan.fields.length; i++) {
        const fl = plan.fields[i]!;
        result[fl.name] = fl.loader(ctx, ptr + fl.offset);
    }
    return result;
}

export function listLoader(plan: ListLoaderPlan, ctx: MarshalingContext, ptr: number): unknown[] {
    const dv = ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize);
    const listPtr = dv.getUint32(0, true);
    const len = dv.getUint32(4, true);
    if (len > 0) {
        validatePointerAlignment(listPtr, plan.elemAlign, 'list');
        const totalBytes = len * plan.elemSize;
        validateBoundarySize(ctx, totalBytes, 'list');
        const memorySize = ctx.memory.getMemory().buffer.byteLength;
        if (listPtr + totalBytes > memorySize) {
            throw new Error(`list pointer out of bounds: ptr=${listPtr} len=${len} elem_size=${plan.elemSize} memory_size=${memorySize}`);
        }
    }
    const result = new Array(len);
    for (let i = 0; i < len; i++) {
        result[i] = plan.elemLoader(ctx, listPtr + i * plan.elemSize);
    }
    return result;
}

export function optionLoader(plan: OptionLoaderPlan, ctx: MarshalingContext, ptr: number): unknown {
    const dv = ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize);
    const disc = dv.getUint8(0);
    if (disc > 1) throw new Error(`Invalid option discriminant: ${disc}`);
    if (disc === 0) return null;
    return plan.payloadLoader(ctx, ptr + plan.payloadOffset);
}

export function resultLoaderBoth(plan: ResultLoaderPlan, ctx: MarshalingContext, ptr: number): JsValue {
    const disc = ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize).getUint8(0);
    if (disc > 1) throw new Error(`Invalid result discriminant: ${disc}`);
    if (disc === 0) return { tag: OK, val: plan.okLoader!(ctx, ptr + plan.payloadOffset) };
    return { tag: ERR, val: plan.errLoader!(ctx, ptr + plan.payloadOffset) };
}

export function resultLoaderOkOnly(plan: ResultLoaderPlan, ctx: MarshalingContext, ptr: number): JsValue {
    const disc = ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize).getUint8(0);
    if (disc > 1) throw new Error(`Invalid result discriminant: ${disc}`);
    if (disc === 0) return { tag: OK, val: plan.okLoader!(ctx, ptr + plan.payloadOffset) };
    return { tag: ERR, val: undefined };
}

export function resultLoaderErrOnly(plan: ResultLoaderPlan, ctx: MarshalingContext, ptr: number): JsValue {
    const disc = ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize).getUint8(0);
    if (disc > 1) throw new Error(`Invalid result discriminant: ${disc}`);
    if (disc === 0) return { tag: OK, val: undefined };
    return { tag: ERR, val: plan.errLoader!(ctx, ptr + plan.payloadOffset) };
}

export function resultLoaderVoid(plan: ResultLoaderPlan, ctx: MarshalingContext, ptr: number): JsValue {
    const disc = ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize).getUint8(0);
    if (disc > 1) throw new Error(`Invalid result discriminant: ${disc}`);
    return disc === 0 ? { tag: OK, val: undefined } : { tag: ERR, val: undefined };
}

export function variantLoaderDisc1(plan: VariantLoaderPlan, ctx: MarshalingContext, ptr: number): JsValue {
    const disc = ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize).getUint8(0);
    if (disc >= plan.numCases) throw new Error(`Invalid variant discriminant: ${disc} >= ${plan.numCases}`);
    const loader = plan.caseLoaders[disc];
    if (loader) return { tag: plan.caseNames[disc], val: loader(ctx, ptr + plan.payloadOffset) };
    return { tag: plan.caseNames[disc] };
}

export function variantLoaderDisc2(plan: VariantLoaderPlan, ctx: MarshalingContext, ptr: number): JsValue {
    const disc = ctx.memory.getView(ptr as WasmPointer, 2 as WasmSize).getUint16(0, true);
    if (disc >= plan.numCases) throw new Error(`Invalid variant discriminant: ${disc} >= ${plan.numCases}`);
    const loader = plan.caseLoaders[disc];
    if (loader) return { tag: plan.caseNames[disc], val: loader(ctx, ptr + plan.payloadOffset) };
    return { tag: plan.caseNames[disc] };
}

export function variantLoaderDisc4(plan: VariantLoaderPlan, ctx: MarshalingContext, ptr: number): JsValue {
    const disc = ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).getUint32(0, true);
    if (disc >= plan.numCases) throw new Error(`Invalid variant discriminant: ${disc} >= ${plan.numCases}`);
    const loader = plan.caseLoaders[disc];
    if (loader) return { tag: plan.caseNames[disc], val: loader(ctx, ptr + plan.payloadOffset) };
    return { tag: plan.caseNames[disc] };
}

export function enumLoaderDisc1(plan: EnumLoaderPlan, ctx: MarshalingContext, ptr: number): string {
    const disc = ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize).getUint8(0);
    if (disc >= plan.numMembers) throw new Error(`Invalid enum discriminant: ${disc} >= ${plan.numMembers}`);
    return plan.memberNames[disc]!;
}

export function enumLoaderDisc2(plan: EnumLoaderPlan, ctx: MarshalingContext, ptr: number): string {
    const disc = ctx.memory.getView(ptr as WasmPointer, 2 as WasmSize).getUint16(0, true);
    if (disc >= plan.numMembers) throw new Error(`Invalid enum discriminant: ${disc} >= ${plan.numMembers}`);
    return plan.memberNames[disc]!;
}

export function enumLoaderDisc4(plan: EnumLoaderPlan, ctx: MarshalingContext, ptr: number): string {
    const disc = ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).getUint32(0, true);
    if (disc >= plan.numMembers) throw new Error(`Invalid enum discriminant: ${disc} >= ${plan.numMembers}`);
    return plan.memberNames[disc]!;
}

export function flagsLoader(plan: FlagsLoaderPlan, ctx: MarshalingContext, ptr: number): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (let w = 0; w < plan.wordCount; w++) {
        const dv = ctx.memory.getView((ptr + w * 4) as WasmPointer, 4 as WasmSize);
        const word = dv.getInt32(0, true);
        for (let b = 0; b < 32 && w * 32 + b < plan.memberNames.length; b++) {
            result[plan.memberNames[w * 32 + b]!] = !!(word & (1 << b));
        }
    }
    return result;
}

export function tupleLoader(plan: TupleLoaderPlan, ctx: MarshalingContext, ptr: number): unknown[] {
    const result = new Array(plan.members.length);
    for (let i = 0; i < plan.members.length; i++) {
        const ml = plan.members[i]!;
        result[i] = ml.loader(ctx, ptr + ml.offset);
    }
    return result;
}

// --- Resource memory loaders ---

export function ownResourceLoader(plan: OwnResourceLoaderPlan, ctx: MarshalingContext, ptr: number): unknown {
    const handle = ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).getInt32(0, true);
    return ctx.resources.remove(plan.resourceTypeIdx, handle);
}

export function borrowResourceLoader(plan: OwnResourceLoaderPlan, ctx: MarshalingContext, ptr: number): unknown {
    const handle = ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).getInt32(0, true);
    return ctx.resources.get(plan.resourceTypeIdx, handle);
}

export function borrowResourceDirectLoader(_plan: OwnResourceLoaderPlan, ctx: MarshalingContext, ptr: number): number {
    return ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).getInt32(0, true);
}

// --- Stream/Future/ErrorContext memory loaders ---

export function streamLoader(ctx: MarshalingContext, ptr: number): unknown {
    const handle = ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).getInt32(0, true);
    return ctx.streams.removeReadable(0, handle);
}

export function futureLoader(ctx: MarshalingContext, ptr: number): unknown {
    const handle = ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).getInt32(0, true);
    return ctx.futures.removeReadable(0, handle);
}

export function errorContextLoader(ctx: MarshalingContext, ptr: number): unknown {
    const handle = ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).getInt32(0, true);
    return ctx.errorContexts.remove(handle);
}
