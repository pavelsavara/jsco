import { ComponentTypeIndex } from '../../model/indices';
import { ModelTag } from '../../model/tags';
import { ComponentTypeDefinedRecord, ComponentTypeDefinedList, ComponentTypeDefinedOption, ComponentTypeDefinedResult, ComponentTypeDefinedVariant, ComponentTypeDefinedEnum, ComponentTypeDefinedFlags, ComponentTypeDefinedTuple, ComponentTypeFunc, ComponentValType, PrimitiveValType, ComponentTypeDefinedOwn, ComponentTypeDefinedBorrow } from '../../model/types';
import { BindingContext, ResolverContext } from '../types';
import { jsco_assert } from '../../utils/assert';
import type { ResolvedType } from '../type-resolution';
import { getCanonicalResourceId } from '../context';
import { CallingConvention, determineFunctionCallingConvention, sizeOf, alignOf, flatCount, alignOfValType, flatCountForValType, resolveValType, sizeOfValType, discriminantSize } from '../calling-convention';
import { memoize } from './cache';
import { createLowering, loadFromMemory } from './to-js';
import { LiftingFromJs, WasmPointer, FnLiftingCallFromJs, JsFunction, WasmSize, WasmValue, WasmFunction, JsValue } from './types';
import { validateAllocResult, validatePointerAlignment, checkNotPoisoned, checkNotReentrant } from './validation';

// Canonical NaN values per spec (CANONICAL_FLOAT32_NAN = 0x7fc00000, CANONICAL_FLOAT64_NAN = 0x7ff8000000000000)
const _f32 = new Float32Array(1);
const _i32 = new Int32Array(_f32.buffer);
_i32[0] = 0x7fc00000;
const canonicalNaN32: number = _f32[0];
const _f64 = new Float64Array(1);
const _i64 = new BigInt64Array(_f64.buffer);
_i64[0] = 0x7ff8000000000000n;
const canonicalNaN64: number = _f64[0];


export function createFunctionLifting(rctx: ResolverContext, importModel: ComponentTypeFunc): FnLiftingCallFromJs {
    return memoize(rctx.memoizeCache, importModel, () => {
        const callingConvention = determineFunctionCallingConvention(rctx, importModel);
        const paramLifters: Function[] = [];
        for (const param of importModel.params) {
            const lifter = createLifting(rctx, param.type);
            paramLifters.push(lifter);
        }
        const resultLowerers: Function[] = [];
        let resultType: ResolvedType | undefined;
        switch (importModel.results.tag) {
            case ModelTag.ComponentFuncResultNamed: {
                for (const res of importModel.results.values) {
                    const lowerer = createLowering(rctx, res.type);
                    resultLowerers.push(lowerer);
                }
                break;
            }
            case ModelTag.ComponentFuncResultUnnamed: {
                const lowerer = createLowering(rctx, importModel.results.type);
                resultLowerers.push(lowerer);
                resultType = resolveValType(rctx, importModel.results.type);
            }
        }

        // Pre-resolve param types for spilled path
        const paramResolvedTypes = importModel.params.map(p => resolveValType(rctx, p.type));

        return (ctx: BindingContext, wasmFunction: WasmFunction): JsFunction => {
            function liftingTrampoline(...args: any[]): any {
                // C4: Runtime behavioral guarantees
                checkNotPoisoned(ctx);
                checkNotReentrant(ctx);
                ctx.inExport = true;
                try {
                    let wasmArgs: any[];
                    if (callingConvention.params === CallingConvention.Spilled) {
                        // Spill: store all params to memory, pass single pointer
                        let totalSize = 0;
                        let maxAlign = 1;
                        for (const pt of paramResolvedTypes) {
                            const a = alignOf(rctx, pt);
                            totalSize = alignUp(totalSize, a);
                            totalSize += sizeOf(rctx, pt);
                            maxAlign = Math.max(maxAlign, a);
                        }
                        const ptr = ctx.allocator.realloc(0 as WasmPointer, 0 as WasmSize,
                            maxAlign as WasmSize, totalSize as WasmSize);
                        validateAllocResult(ctx, ptr, maxAlign, totalSize);
                        let offset = 0;
                        for (let i = 0; i < args.length; i++) {
                            const pt = paramResolvedTypes[i];
                            const a = alignOf(rctx, pt);
                            offset = alignUp(offset, a);
                            storeToMemory(ctx, rctx, ptr + offset, pt, args[i]);
                            offset += sizeOf(rctx, pt);
                        }
                        wasmArgs = [ptr];
                    } else {
                        // Flat/Scalar: spread as individual args
                        wasmArgs = [];
                        for (let i = 0; i < paramLifters.length; i++) {
                            const converted = paramLifters[i](ctx, args[i]);
                            wasmArgs = [...wasmArgs, ...converted];
                        }
                    }

                    let result: any;
                    if (callingConvention.results === CallingConvention.Spilled) {
                        // canon_lift: WASM returns a pointer to results in memory
                        const resPtr = wasmFunction(...wasmArgs) as number;
                        result = loadFromMemory(ctx, rctx, resPtr, resultType!);
                    } else {
                        const resWasm = wasmFunction(...wasmArgs);
                        if (resultLowerers.length === 1) {
                            result = resultLowerers[0](ctx, resWasm);
                        }
                    }

                    // Post-return cleanup
                    if (ctx.postReturnFn) {
                        ctx.postReturnFn();
                        ctx.postReturnFn = undefined;
                    }

                    return result;
                } catch (e) {
                    // Poison the instance on trap
                    ctx.poisoned = true;
                    throw e;
                } finally {
                    ctx.inExport = false;
                }
            }
            return liftingTrampoline as JsFunction;
        };
    });
}


export function createLifting(rctx: ResolverContext, typeModel: ComponentValType | ResolvedType): LiftingFromJs {
    return memoize(rctx.memoizeCache, typeModel, () => {
        switch (typeModel.tag) {
            case ModelTag.ComponentValTypePrimitive:
            case ModelTag.ComponentTypeDefinedPrimitive:
                switch (typeModel.value) {
                    case PrimitiveValType.String:
                        return createStringLifting();
                    case PrimitiveValType.Bool:
                        return createBoolLifting();
                    case PrimitiveValType.S8:
                        return createS8Lifting();
                    case PrimitiveValType.U8:
                        return createU8Lifting();
                    case PrimitiveValType.S16:
                        return createS16Lifting();
                    case PrimitiveValType.U16:
                        return createU16Lifting();
                    case PrimitiveValType.S32:
                        return createS32Lifting();
                    case PrimitiveValType.U32:
                        return createU32Lifting();
                    case PrimitiveValType.S64:
                        return rctx.usesNumberForInt64
                            ? createS64LiftingNumber()
                            : createS64LiftingBigInt();
                    case PrimitiveValType.U64:
                        return rctx.usesNumberForInt64
                            ? createU64LiftingNumber()
                            : createU64LiftingBigInt();
                    case PrimitiveValType.Float32:
                        return createF32Lifting();
                    case PrimitiveValType.Float64:
                        return createF64Lifting();
                    case PrimitiveValType.Char:
                        return createCharLifting();
                    default:
                        throw new Error('Not implemented');
                }
            case ModelTag.ComponentValTypeType: {
                const resolved = rctx.resolvedTypes.get(typeModel.value as ComponentTypeIndex);
                jsco_assert(resolved !== undefined, () => `Unresolved type at index ${typeModel.value}`);
                return createLifting(rctx, resolved!);
            }
            case ModelTag.ComponentTypeDefinedRecord:
                return createRecordLifting(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedList:
                return createListLifting(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedOption:
                return createOptionLifting(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedResult:
                return createResultLifting(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedVariant:
                return createVariantLifting(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedEnum:
                return createEnumLifting(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedFlags:
                return createFlagsLifting(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedTuple:
                return createTupleLifting(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedOwn:
                return createOwnLifting(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedBorrow:
                return createBorrowLifting(rctx, typeModel);
            default:
                throw new Error('Not implemented ' + typeModel.tag);
        }
    });
}

function createRecordLifting(rctx: ResolverContext, recordModel: ComponentTypeDefinedRecord): LiftingFromJs {
    const lifters: { name: string, lifter: LiftingFromJs }[] = [];
    for (const member of recordModel.members) {
        const lifter = createLifting(rctx, member.type);
        lifters.push({ name: member.name, lifter });
    }
    return (ctx: BindingContext, srcJsRecord: JsValue): WasmValue[] => {
        // Flatten all record fields into a flat array of WASM values.
        // This is used in the Flat calling convention path. When the function's
        // total param flat count exceeds MAX_FLAT_PARAMS, the Spilled convention
        // is used instead and storeToMemory() handles memory layout directly.
        let args: any = [];
        for (const { name, lifter } of lifters) {
            const jsValue = srcJsRecord[name];
            const wasmValue = lifter(ctx, jsValue);
            args = [...args, ...wasmValue];
        }
        return args;
    };
}

function createBoolLifting(): LiftingFromJs {
    return (_: BindingContext, srcJsValue: JsValue): WasmValue[] => {
        return [srcJsValue ? 1 : 0];
    };
}

function createS8Lifting(): LiftingFromJs {
    return (_: BindingContext, srcJsValue: JsValue): WasmValue[] => {
        const num = srcJsValue as number;
        return [(num << 24) >> 24];
    };
}

function createU8Lifting(): LiftingFromJs {
    return (_: BindingContext, srcJsValue: JsValue): WasmValue[] => {
        const num = srcJsValue as number;
        return [num & 0xFF];
    };
}

function createS16Lifting(): LiftingFromJs {
    return (_: BindingContext, srcJsValue: JsValue): WasmValue[] => {
        const num = srcJsValue as number;
        return [(num << 16) >> 16];
    };
}

function createU16Lifting(): LiftingFromJs {
    return (_: BindingContext, srcJsValue: JsValue): WasmValue[] => {
        const num = srcJsValue as number;
        return [num & 0xFFFF];
    };
}

function createS32Lifting(): LiftingFromJs {
    return (_: BindingContext, srcJsValue: JsValue): WasmValue[] => {
        const num = srcJsValue as number;
        return [num | 0];
    };
}

function createU32Lifting(): LiftingFromJs {
    return (_: BindingContext, srcJsValue: JsValue): WasmValue[] => {
        const num = srcJsValue as number;
        return [num >>> 0];
    };
}

function createS64LiftingNumber(): LiftingFromJs {
    return (ctx: BindingContext, srcJsValue: JsValue): WasmValue[] => {
        const num = srcJsValue as bigint;
        return [Number(BigInt.asIntN(52, num))];
    };
}

function createS64LiftingBigInt(): LiftingFromJs {
    return (ctx: BindingContext, srcJsValue: JsValue): WasmValue[] => {
        const num = srcJsValue as bigint;
        return [BigInt.asIntN(52, num)];
    };
}

function createU64LiftingNumber(): LiftingFromJs {
    return (_: BindingContext, srcJsValue: JsValue): WasmValue[] => {
        const num = BigInt(srcJsValue as number | bigint);
        return [Number(BigInt.asUintN(64, num))];
    };
}

function createU64LiftingBigInt(): LiftingFromJs {
    return (_: BindingContext, srcJsValue: JsValue): WasmValue[] => {
        const num = BigInt(srcJsValue as number | bigint);
        return [BigInt.asUintN(64, num)];
    };
}

function createF32Lifting(): LiftingFromJs {
    return (_: BindingContext, srcJsValue: JsValue): WasmValue[] => {
        const num = Math.fround(srcJsValue as number);
        // Spec: canonicalize_nan32 — replace any NaN with canonical NaN
        if (num !== num) return [canonicalNaN32];
        return [num];
    };
}

function createF64Lifting(): LiftingFromJs {
    return (_: BindingContext, srcJsValue: JsValue): WasmValue[] => {
        const num = +(srcJsValue as number);
        // Spec: canonicalize_nan64 — replace any NaN with canonical NaN
        if (num !== num) return [canonicalNaN64];
        return [num];
    };
}

function createCharLifting(): LiftingFromJs {
    return (_: BindingContext, srcJsValue: JsValue): WasmValue[] => {
        const str = srcJsValue as string;
        const cp = str.codePointAt(0)!;
        // Spec: char_to_i32 — surrogates are not valid Unicode scalar values
        if (cp >= 0xD800 && cp <= 0xDFFF) throw new Error(`Invalid char: surrogate codepoint ${cp}`);
        return [cp];
    };
}

function createStringLifting(): LiftingFromJs {
    return (ctx: BindingContext, srcJsValue: JsValue): any[] => {
        let str = srcJsValue as string;
        if (typeof str !== 'string') throw new TypeError('expected a string');
        if (str.length === 0) {
            return [0, 0];
        }
        let allocLen: WasmSize = 0 as any;
        let ptr: WasmPointer = 0 as any;
        let writtenTotal = 0;
        while (str.length > 0) {
            ptr = ctx.allocator.realloc(ptr, allocLen, 1 as any, allocLen + str.length as any);
            validateAllocResult(ctx, ptr, 1, (allocLen as number) + str.length);
            allocLen += str.length as any;
            const { read, written } = ctx.utf8Encoder.encodeInto(
                str,
                ctx.memory.getViewU8(ptr + writtenTotal, allocLen - writtenTotal)
            );
            writtenTotal += written;
            str = str.slice(read);
        }
        if (allocLen > writtenTotal) {
            ptr = ctx.allocator.realloc(ptr, allocLen, 1 as any, writtenTotal as any);
            validateAllocResult(ctx, ptr, 1, writtenTotal);
        }
        return [ptr, writtenTotal];
    };
}

// --- Memory store helpers (for list element storage) ---

function alignUp(offset: number, align: number): number {
    return (offset + align - 1) & ~(align - 1);
}

function storePrimitive(ctx: BindingContext, ptr: number, prim: PrimitiveValType, val: JsValue): void {
    switch (prim) {
        case PrimitiveValType.Bool: {
            const dv = ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize);
            dv.setUint8(0, val ? 1 : 0);
            break;
        }
        case PrimitiveValType.S8: {
            const dv = ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize);
            dv.setInt8(0, val as number);
            break;
        }
        case PrimitiveValType.U8: {
            const dv = ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize);
            dv.setUint8(0, (val as number) & 0xFF);
            break;
        }
        case PrimitiveValType.S16: {
            const dv = ctx.memory.getView(ptr as WasmPointer, 2 as WasmSize);
            dv.setInt16(0, val as number, true);
            break;
        }
        case PrimitiveValType.U16: {
            const dv = ctx.memory.getView(ptr as WasmPointer, 2 as WasmSize);
            dv.setUint16(0, (val as number) & 0xFFFF, true);
            break;
        }
        case PrimitiveValType.S32: {
            const dv = ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize);
            dv.setInt32(0, val as number, true);
            break;
        }
        case PrimitiveValType.U32: {
            const dv = ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize);
            dv.setUint32(0, (val as number) >>> 0, true);
            break;
        }
        case PrimitiveValType.S64: {
            const dv = ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize);
            dv.setBigInt64(0, BigInt(val as any), true);
            break;
        }
        case PrimitiveValType.U64: {
            const dv = ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize);
            dv.setBigUint64(0, BigInt(val as any), true);
            break;
        }
        case PrimitiveValType.Float32: {
            const dv = ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize);
            dv.setFloat32(0, val as number, true);
            break;
        }
        case PrimitiveValType.Float64: {
            const dv = ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize);
            dv.setFloat64(0, val as number, true);
            break;
        }
        case PrimitiveValType.Char: {
            const dv = ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize);
            dv.setUint32(0, (val as string).codePointAt(0)!, true);
            break;
        }
        case PrimitiveValType.String: {
            // Store string as pointer + length in memory
            const lifter = createStringLifting();
            const [strPtr, strLen] = lifter(ctx, val);
            const dv = ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize);
            dv.setInt32(0, strPtr as number, true);
            dv.setInt32(4, strLen as number, true);
            break;
        }
    }
}

export function storeToMemory(ctx: BindingContext, rctx: ResolverContext, ptr: number, type: ResolvedType, jsValue: JsValue): void {
    switch (type.tag) {
        case ModelTag.ComponentValTypePrimitive:
        case ModelTag.ComponentTypeDefinedPrimitive:
            storePrimitive(ctx, ptr, type.value, jsValue);
            break;
        case ModelTag.ComponentTypeDefinedRecord: {
            let offset = 0;
            for (const member of type.members) {
                const fieldType = resolveValType(rctx, member.type);
                const fieldAlign = alignOf(rctx, fieldType);
                offset = alignUp(offset, fieldAlign);
                storeToMemory(ctx, rctx, ptr + offset, fieldType, jsValue[member.name]);
                offset += sizeOf(rctx, fieldType);
            }
            break;
        }
        case ModelTag.ComponentTypeDefinedList: {
            const elemType = resolveValType(rctx, type.value);
            const elemSize = sizeOf(rctx, elemType);
            const elemAlign = alignOf(rctx, elemType);
            const arr = jsValue as any[];
            const len = arr.length;
            let listPtr = 0;
            if (len > 0) {
                const totalSize = len * elemSize;
                listPtr = ctx.allocator.realloc(0 as WasmPointer, 0 as WasmSize, elemAlign as WasmSize, totalSize as WasmSize);
                validateAllocResult(ctx, listPtr as WasmPointer, elemAlign, totalSize);
                for (let i = 0; i < len; i++) {
                    storeToMemory(ctx, rctx, listPtr + i * elemSize, elemType, arr[i]);
                }
            }
            const dv = ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize);
            dv.setInt32(0, listPtr, true);
            dv.setInt32(4, len, true);
            break;
        }
        case ModelTag.ComponentTypeDefinedOption: {
            const payloadType = resolveValType(rctx, type.value);
            const payloadAlign = alignOf(rctx, payloadType);
            const payloadOffset = alignUp(1, payloadAlign);
            const dv = ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize);
            if (jsValue === null || jsValue === undefined) {
                dv.setUint8(0, 0);
            } else {
                dv.setUint8(0, 1);
                storeToMemory(ctx, rctx, ptr + payloadOffset, payloadType, jsValue);
            }
            break;
        }
        case ModelTag.ComponentTypeDefinedResult: {
            let payloadAlign = 1;
            if (type.ok !== undefined) payloadAlign = Math.max(payloadAlign, alignOfValType(rctx, type.ok));
            if (type.err !== undefined) payloadAlign = Math.max(payloadAlign, alignOfValType(rctx, type.err));
            const payloadOffset = alignUp(1, payloadAlign);
            const dv = ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize);
            const { tag, val } = jsValue as { tag: string, val?: any };
            if (tag === 'ok') {
                dv.setUint8(0, 0);
                if (type.ok !== undefined && val !== undefined) {
                    storeToMemory(ctx, rctx, ptr + payloadOffset, resolveValType(rctx, type.ok), val);
                }
            } else {
                dv.setUint8(0, 1);
                if (type.err !== undefined && val !== undefined) {
                    storeToMemory(ctx, rctx, ptr + payloadOffset, resolveValType(rctx, type.err), val);
                }
            }
            break;
        }
        case ModelTag.ComponentTypeDefinedVariant: {
            const discSize = discriminantSize(type.variants.length);
            let maxPayloadSize = 0;
            let maxPayloadAlign = 1;
            for (const c of type.variants) {
                if (c.ty !== undefined) {
                    const ct = resolveValType(rctx, c.ty);
                    maxPayloadSize = Math.max(maxPayloadSize, sizeOf(rctx, ct));
                    maxPayloadAlign = Math.max(maxPayloadAlign, alignOf(rctx, ct));
                }
            }
            const payloadOffset = alignUp(discSize, maxPayloadAlign);
            const { tag, val } = jsValue as { tag: string, val?: any };
            const caseIndex = type.variants.findIndex(c => c.name === tag);
            const dv = ctx.memory.getView(ptr as WasmPointer, discSize as WasmSize);
            if (discSize === 1) dv.setUint8(0, caseIndex);
            else if (discSize === 2) dv.setUint16(0, caseIndex, true);
            else dv.setUint32(0, caseIndex, true);
            const c = type.variants[caseIndex];
            if (c.ty !== undefined && val !== undefined) {
                storeToMemory(ctx, rctx, ptr + payloadOffset, resolveValType(rctx, c.ty), val);
            }
            break;
        }
        case ModelTag.ComponentTypeDefinedEnum: {
            const discSize = discriminantSize(type.members.length);
            const idx = type.members.indexOf(jsValue as string);
            const dv = ctx.memory.getView(ptr as WasmPointer, discSize as WasmSize);
            if (discSize === 1) dv.setUint8(0, idx);
            else if (discSize === 2) dv.setUint16(0, idx, true);
            else dv.setUint32(0, idx, true);
            break;
        }
        case ModelTag.ComponentTypeDefinedFlags: {
            const wordCount = Math.max(1, Math.ceil(type.members.length / 32));
            const flags = jsValue as Record<string, boolean>;
            for (let w = 0; w < wordCount; w++) {
                let word = 0;
                for (let b = 0; b < 32 && w * 32 + b < type.members.length; b++) {
                    if (flags[type.members[w * 32 + b]]) word |= (1 << b);
                }
                const dv = ctx.memory.getView((ptr + w * 4) as WasmPointer, 4 as WasmSize);
                dv.setInt32(0, word, true);
            }
            break;
        }
        case ModelTag.ComponentTypeDefinedTuple: {
            let offset = 0;
            for (let i = 0; i < type.members.length; i++) {
                const memberType = resolveValType(rctx, type.members[i]);
                const memberAlign = alignOf(rctx, memberType);
                offset = alignUp(offset, memberAlign);
                storeToMemory(ctx, rctx, ptr + offset, memberType, (jsValue as any[])[i]);
                offset += sizeOf(rctx, memberType);
            }
            break;
        }
        case ModelTag.ComponentTypeDefinedOwn:
        case ModelTag.ComponentTypeDefinedBorrow: {
            const handle = ctx.resources.add(getCanonicalResourceId(rctx, type.value), jsValue);
            const dv = ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize);
            dv.setInt32(0, handle, true);
            break;
        }
        default:
            throw new Error('storeToMemory not implemented for tag ' + type.tag);
    }
}

// --- List lifting ---

function createListLifting(rctx: ResolverContext, listModel: ComponentTypeDefinedList): LiftingFromJs {
    const elementType = resolveValType(rctx, listModel.value);
    const elemSize = sizeOf(rctx, elementType);
    const elemAlign = alignOf(rctx, elementType);

    return (ctx: BindingContext, srcJsValue: JsValue): WasmValue[] => {
        const arr = srcJsValue as any[];
        const len = arr.length;
        if (len === 0) return [0, 0];

        const totalSize = len * elemSize;
        const ptr = ctx.allocator.realloc(0 as WasmPointer, 0 as WasmSize, elemAlign as WasmSize, totalSize as WasmSize);
        validateAllocResult(ctx, ptr, elemAlign, totalSize);

        for (let i = 0; i < len; i++) {
            storeToMemory(ctx, rctx, ptr + i * elemSize, elementType, arr[i]);
        }

        return [ptr, len];
    };
}

// --- Option lifting ---

function createOptionLifting(rctx: ResolverContext, optionModel: ComponentTypeDefinedOption): LiftingFromJs {
    const innerLifter = createLifting(rctx, optionModel.value);
    const innerType = resolveValType(rctx, optionModel.value);
    const innerFlatN = flatCount(rctx, innerType);

    return (ctx: BindingContext, srcJsValue: JsValue): WasmValue[] => {
        if (srcJsValue === null || srcJsValue === undefined) {
            return [0, ...new Array(innerFlatN).fill(0)];
        }
        const lifted = innerLifter(ctx, srcJsValue);
        return [1, ...lifted];
    };
}

// --- Result lifting ---

function createResultLifting(rctx: ResolverContext, resultModel: ComponentTypeDefinedResult): LiftingFromJs {
    const okLifter = resultModel.ok ? createLifting(rctx, resultModel.ok) : undefined;
    const errLifter = resultModel.err ? createLifting(rctx, resultModel.err) : undefined;

    const okFlatN = resultModel.ok ? flatCountForValType(rctx, resultModel.ok) : 0;
    const errFlatN = resultModel.err ? flatCountForValType(rctx, resultModel.err) : 0;
    const maxPayloadFlat = Math.max(okFlatN, errFlatN);

    return (ctx: BindingContext, srcJsValue: JsValue): WasmValue[] => {
        const { tag, val } = srcJsValue as { tag: string, val?: any };
        if (tag === 'ok') {
            const lifted = okLifter ? okLifter(ctx, val) : [];
            const padded = [...lifted, ...new Array(maxPayloadFlat - lifted.length).fill(0)];
            return [0, ...padded];
        } else {
            const lifted = errLifter ? errLifter(ctx, val) : [];
            const padded = [...lifted, ...new Array(maxPayloadFlat - lifted.length).fill(0)];
            return [1, ...padded];
        }
    };
}

// --- Variant lifting ---

function createVariantLifting(rctx: ResolverContext, variantModel: ComponentTypeDefinedVariant): LiftingFromJs {
    const cases = variantModel.variants.map((c, i) => ({
        name: c.name,
        index: i,
        lifter: c.ty ? createLifting(rctx, c.ty) : undefined,
        flatCount: c.ty ? flatCountForValType(rctx, c.ty) : 0,
    }));
    const maxPayloadFlat = Math.max(0, ...cases.map(c => c.flatCount));
    const nameToCase = new Map(cases.map(c => [c.name, c]));

    return (ctx: BindingContext, srcJsValue: JsValue): WasmValue[] => {
        const { tag, val } = srcJsValue as { tag: string, val?: any };
        const c = nameToCase.get(tag);
        if (!c) throw new Error(`Unknown variant case: ${tag}`);
        let payload: WasmValue[] = [];
        if (c.lifter && val !== undefined) {
            payload = c.lifter(ctx, val);
        }
        while (payload.length < maxPayloadFlat) payload.push(0);
        return [c.index, ...payload];
    };
}

// --- Enum lifting ---

function createEnumLifting(_rctx: ResolverContext, enumModel: ComponentTypeDefinedEnum): LiftingFromJs {
    const nameToIndex = new Map(enumModel.members.map((name, i) => [name, i]));
    return (_ctx: BindingContext, srcJsValue: JsValue): WasmValue[] => {
        const idx = nameToIndex.get(srcJsValue as string);
        if (idx === undefined) throw new Error(`Unknown enum value: ${srcJsValue}`);
        return [idx];
    };
}

// --- Flags lifting ---

function createFlagsLifting(_rctx: ResolverContext, flagsModel: ComponentTypeDefinedFlags): LiftingFromJs {
    const wordCount = Math.max(1, Math.ceil(flagsModel.members.length / 32));

    return (_ctx: BindingContext, srcJsValue: JsValue): WasmValue[] => {
        const flags = srcJsValue as Record<string, boolean>;
        const words = new Array(wordCount).fill(0);
        for (let i = 0; i < flagsModel.members.length; i++) {
            if (flags[flagsModel.members[i]]) {
                words[i >>> 5] |= (1 << (i & 31));
            }
        }
        return words;
    };
}

// --- Tuple lifting ---

function createTupleLifting(rctx: ResolverContext, tupleModel: ComponentTypeDefinedTuple): LiftingFromJs {
    const elementLifters = tupleModel.members.map(m => createLifting(rctx, m));

    return (ctx: BindingContext, srcJsValue: JsValue): WasmValue[] => {
        const arr = srcJsValue as any[];
        let result: WasmValue[] = [];
        for (let i = 0; i < elementLifters.length; i++) {
            result = [...result, ...elementLifters[i](ctx, arr[i])];
        }
        return result;
    };
}

// --- Resource handle lifting ---

function createOwnLifting(rctx: ResolverContext, ownModel: ComponentTypeDefinedOwn): LiftingFromJs {
    const resourceTypeIdx = getCanonicalResourceId(rctx, ownModel.value);
    return (ctx: BindingContext, srcJsValue: JsValue): WasmValue[] => {
        const handle = ctx.resources.add(resourceTypeIdx, srcJsValue);
        return [handle];
    };
}

function createBorrowLifting(rctx: ResolverContext, borrowModel: ComponentTypeDefinedBorrow): LiftingFromJs {
    const resourceTypeIdx = getCanonicalResourceId(rctx, borrowModel.value);
    return (ctx: BindingContext, srcJsValue: JsValue): WasmValue[] => {
        const handle = ctx.resources.add(resourceTypeIdx, srcJsValue);
        return [handle];
    };
}
