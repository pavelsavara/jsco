import { ComponentTypeIndex } from '../../model/indices';
import { ModelTag } from '../../model/tags';
import { ComponentTypeDefinedRecord, ComponentTypeDefinedList, ComponentTypeDefinedOption, ComponentTypeDefinedResult, ComponentTypeDefinedVariant, ComponentTypeDefinedEnum, ComponentTypeDefinedFlags, ComponentTypeDefinedTuple, ComponentTypeFunc, ComponentValType, PrimitiveValType, ComponentTypeDefinedOwn, ComponentTypeDefinedBorrow } from '../../model/types';
import { BindingContext, ResolverContext } from '../types';
import { jsco_assert } from '../../utils/assert';
import type { ResolvedType } from '../type-resolution';
import { getCanonicalResourceId } from '../context';
import { CallingConvention, determineFunctionCallingConvention, sizeOf, alignOf, alignOfValType, resolveValType, discriminantSize } from '../calling-convention';
import { memoize } from './cache';
import { createLifting, storeToMemory } from './to-abi';
import { LoweringToJs, FnLoweringCallToJs, WasmFunction, WasmPointer, JsFunction, WasmSize, WasmValue } from './types';
import { validatePointerAlignment, validateUtf8 } from './validation';

// Canonical NaN values per spec (CANONICAL_FLOAT32_NAN = 0x7fc00000, CANONICAL_FLOAT64_NAN = 0x7ff8000000000000)
const _f32 = new Float32Array(1);
const _i32 = new Int32Array(_f32.buffer);
_i32[0] = 0x7fc00000;
const canonicalNaN32: number = _f32[0];
const _f64 = new Float64Array(1);
const _i64 = new BigInt64Array(_f64.buffer);
_i64[0] = 0x7ff8000000000000n;
const canonicalNaN64: number = _f64[0];


export function createFunctionLowering(rctx: ResolverContext, exportModel: ComponentTypeFunc): FnLoweringCallToJs {
    return memoize(rctx.memoizeCache, exportModel, () => {
        const callingConvention = determineFunctionCallingConvention(rctx, exportModel);
        // Pre-resolve param/result types for spilled path
        const paramResolvedTypes = exportModel.params.map(p => resolveValType(rctx, p.type));
        let resultType: ResolvedType | undefined;
        if (exportModel.results.tag === ModelTag.ComponentFuncResultUnnamed) {
            resultType = resolveValType(rctx, exportModel.results.type);
        }

        return (ctx: BindingContext, jsFunction: JsFunction): WasmFunction => {

            const paramLowerers: Function[] = [];
            for (const param of exportModel.params) {
                const lowerer = createLowering(rctx, param.type);
                paramLowerers.push(lowerer);
            }
            const resultLifters: Function[] = [];
            switch (exportModel.results.tag) {
                case ModelTag.ComponentFuncResultNamed: {
                    for (const res of exportModel.results.values) {
                        const lifter = createLifting(rctx, res.type);
                        resultLifters.push(lifter);
                    }
                    break;
                }
                case ModelTag.ComponentFuncResultUnnamed: {
                    const lifter = createLifting(rctx, exportModel.results.type);
                    resultLifters.push(lifter);
                }
            }

            function loweringTrampoline(...args: any[]): any {
                let covertedArgs: any[] = [];
                if (callingConvention.params === CallingConvention.Spilled) {
                    // Spill: WASM passes single pointer, read params from memory
                    const ptr = args[0] as number;
                    let memOffset = 0;
                    for (let i = 0; i < paramResolvedTypes.length; i++) {
                        const pt = paramResolvedTypes[i];
                        const a = alignOf(rctx, pt);
                        memOffset = alignUp(memOffset, a);
                        covertedArgs.push(loadFromMemory(ctx, rctx, ptr + memOffset, pt));
                        memOffset += sizeOf(rctx, pt);
                    }
                } else {
                    // Flat/Scalar: read each param using lowerers
                    let flatOffset = 0;
                    for (let i = 0; i < paramLowerers.length; i++) {
                        const lowerer = paramLowerers[i];
                        const spill = (lowerer as any).spill;
                        const values = args.slice(flatOffset, flatOffset + spill);
                        const converted = lowerer(ctx, ...values);
                        flatOffset += spill;
                        covertedArgs = [...covertedArgs, converted];
                    }
                }

                if (callingConvention.results === CallingConvention.Spilled) {
                    // canon_lower: WASM passed retptr as last flat arg
                    const retptr = args[args.length - 1] as number;
                    const resJs = jsFunction(...covertedArgs);
                    if (resultType !== undefined) {
                        storeToMemory(ctx, rctx, retptr, resultType, resJs);
                    }
                    // No return value - WASM reads from retptr
                } else {
                    const resJs = jsFunction(...covertedArgs);
                    if (resultLifters.length === 1) {
                        return resultLifters[0](ctx, resJs);
                    }
                }
            }
            return loweringTrampoline as WasmFunction;
        };
    });
}

export function createLowering(rctx: ResolverContext, typeModel: ComponentValType | ResolvedType): LoweringToJs {
    return memoize(rctx.memoizeCache, typeModel, () => {
        switch (typeModel.tag) {
            case ModelTag.ComponentValTypePrimitive:
            case ModelTag.ComponentTypeDefinedPrimitive:
                switch (typeModel.value) {
                    case PrimitiveValType.String:
                        return createStringLowering(rctx);
                    case PrimitiveValType.Bool:
                        return createBoolLowering();
                    case PrimitiveValType.S8:
                        return createS8Lowering();
                    case PrimitiveValType.U8:
                        return createU8Lowering();
                    case PrimitiveValType.S16:
                        return createS16Lowering();
                    case PrimitiveValType.U16:
                        return createU16Lowering();
                    case PrimitiveValType.S32:
                        return createS32Lowering();
                    case PrimitiveValType.U32:
                        return createU32Lowering();
                    case PrimitiveValType.S64:
                        return rctx.usesNumberForInt64
                            ? createS64LoweringNumber()
                            : createS64LoweringBigInt();
                    case PrimitiveValType.U64:
                        return rctx.usesNumberForInt64
                            ? createU64LoweringNumber()
                            : createU64LoweringBigInt();
                    case PrimitiveValType.Float32:
                        return createF32Lowering();
                    case PrimitiveValType.Float64:
                        return createF64Lowering();
                    case PrimitiveValType.Char:
                        return createCharLowering();
                    default:
                        throw new Error('Not implemented');
                }
            case ModelTag.ComponentValTypeType: {
                const resolved = rctx.resolvedTypes.get(typeModel.value as ComponentTypeIndex);
                jsco_assert(resolved !== undefined, () => `Unresolved type at index ${typeModel.value}`);
                return createLowering(rctx, resolved!);
            }
            case ModelTag.ComponentTypeDefinedRecord:
                return createRecordLowering(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedList:
                return createListLowering(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedOption:
                return createOptionLowering(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedResult:
                return createResultLowering(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedVariant:
                return createVariantLowering(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedEnum:
                return createEnumLowering(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedFlags:
                return createFlagsLowering(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedTuple:
                return createTupleLowering(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedOwn:
                return createOwnLowering(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedBorrow:
                return createBorrowLowering(rctx, typeModel);
            default:
                throw new Error('Not implemented');
        }
    });
}

function createBoolLowering(): LoweringToJs {
    const fn = (_: BindingContext, ...args: WasmValue[]) => {
        return args[0] !== 0;
    };
    fn.spill = 1;
    return fn;
}

function createS8Lowering(): LoweringToJs {
    const fn = (_: BindingContext, ...args: WasmValue[]) => {
        const num = args[0] as number;
        return (num << 24) >> 24;
    };
    fn.spill = 1;
    return fn;
}

function createU8Lowering(): LoweringToJs {
    const fn = (_: BindingContext, ...args: WasmValue[]) => {
        const num = args[0] as number;
        return num & 0xFF;
    };
    fn.spill = 1;
    return fn;
}

function createS16Lowering(): LoweringToJs {
    const fn = (_: BindingContext, ...args: WasmValue[]) => {
        const num = args[0] as number;
        return (num << 16) >> 16;
    };
    fn.spill = 1;
    return fn;
}

function createU16Lowering(): LoweringToJs {
    const fn = (_: BindingContext, ...args: WasmValue[]) => {
        const num = args[0] as number;
        return num & 0xFFFF;
    };
    fn.spill = 1;
    return fn;
}

function createS32Lowering(): LoweringToJs {
    const fn = (_: BindingContext, ...args: WasmValue[]) => {
        const num = args[0] as number;
        return num | 0;
    };
    fn.spill = 1;
    return fn;
}

function createU32Lowering(): LoweringToJs {
    const fn = (_: BindingContext, ...args: WasmValue[]) => {
        const num = args[0] as number;
        return num >>> 0;
    };
    fn.spill = 1;
    return fn;
}

function createS64LoweringBigInt(): LoweringToJs {
    const fn = (_: BindingContext, ...args: WasmValue[]) => {
        return BigInt.asIntN(64, args[0] as bigint);
    };
    fn.spill = 1;
    return fn;
}

function createS64LoweringNumber(): LoweringToJs {
    const fn = (_: BindingContext, ...args: WasmValue[]) => {
        return Number(args[0] as bigint);
    };
    fn.spill = 1;
    return fn;
}

function createU64LoweringBigInt(): LoweringToJs {
    const fn = (_: BindingContext, ...args: WasmValue[]) => {
        return BigInt.asUintN(64, args[0] as bigint);
    };
    fn.spill = 1;
    return fn;
}

function createU64LoweringNumber(): LoweringToJs {
    const fn = (_: BindingContext, ...args: WasmValue[]) => {
        return Number(args[0] as bigint);
    };
    fn.spill = 1;
    return fn;
}

function createF32Lowering(): LoweringToJs {
    const fn = (_: BindingContext, ...args: WasmValue[]) => {
        const v = Math.fround(args[0] as number);
        // Spec: canonicalize_nan32 — replace any NaN with canonical NaN
        if (v !== v) return canonicalNaN32;
        return v;
    };
    fn.spill = 1;
    return fn;
}

function createF64Lowering(): LoweringToJs {
    const fn = (_: BindingContext, ...args: WasmValue[]) => {
        const v = +(args[0] as number);
        // Spec: canonicalize_nan64 — replace any NaN with canonical NaN
        if (v !== v) return canonicalNaN64;
        return v;
    };
    fn.spill = 1;
    return fn;
}

function createCharLowering(): LoweringToJs {
    const fn = (_: BindingContext, ...args: WasmValue[]) => {
        const i = args[0] as number;
        if (i >= 0x110000) throw new Error(`Invalid char codepoint: ${i} >= 0x110000`);
        if (i >= 0xD800 && i <= 0xDFFF) throw new Error(`Invalid char codepoint: surrogate ${i}`);
        return String.fromCodePoint(i);
    };
    fn.spill = 1;
    return fn;
}

function createRecordLowering(rctx: ResolverContext, recordModel: ComponentTypeDefinedRecord): LoweringToJs {
    const fieldLowerers: { name: string, lowerer: LoweringToJs }[] = [];
    for (const member of recordModel.members) {
        const lowerer = createLowering(rctx, member.type);
        fieldLowerers.push({ name: member.name, lowerer });
    }
    let totalSpill = 0;
    for (const fl of fieldLowerers) {
        totalSpill += (fl.lowerer as any).spill;
    }
    const fn = (ctx: BindingContext, ...args: WasmValue[]) => {
        const result: Record<string, unknown> = {};
        let offset = 0;
        for (const { name, lowerer } of fieldLowerers) {
            const spill = (lowerer as any).spill;
            const values = args.slice(offset, offset + spill);
            result[name] = lowerer(ctx, ...values);
            offset += spill;
        }
        return result;
    };
    fn.spill = totalSpill;
    return fn;
}

function createStringLowering(_rctx: ResolverContext): LoweringToJs {
    const fn = (ctx: BindingContext, ...args: WasmValue[]) => {
        const pointer = args[0] as WasmPointer;
        const len = args[1] as WasmSize;
        if (len as number > 0) {
            // Validate pointer alignment (UTF-8 = 1-byte, so always aligned)
            // Validate bounds
            const memorySize = ctx.memory.getMemory().buffer.byteLength;
            if ((pointer as number) + (len as number) > memorySize) {
                throw new Error(`string pointer out of bounds: ptr=${pointer} len=${len} memory_size=${memorySize}`);
            }
            // Validate UTF-8 encoding
            const bytes = ctx.memory.getViewU8(pointer, len);
            validateUtf8(bytes);
        }
        const view = ctx.memory.getView(pointer, len);
        const res = ctx.utf8Decoder.decode(view);
        return res;
    };
    fn.spill = 2;
    return fn;
}

// --- Memory load helpers (for list element loading) ---

function alignUp(offset: number, align: number): number {
    return (offset + align - 1) & ~(align - 1);
}

function loadPrimitive(ctx: BindingContext, ptr: number, prim: PrimitiveValType): any {
    switch (prim) {
        case PrimitiveValType.Bool: {
            const dv = ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize);
            return dv.getUint8(0) !== 0;
        }
        case PrimitiveValType.S8: {
            const dv = ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize);
            return dv.getInt8(0);
        }
        case PrimitiveValType.U8: {
            const dv = ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize);
            return dv.getUint8(0);
        }
        case PrimitiveValType.S16: {
            const dv = ctx.memory.getView(ptr as WasmPointer, 2 as WasmSize);
            return dv.getInt16(0, true);
        }
        case PrimitiveValType.U16: {
            const dv = ctx.memory.getView(ptr as WasmPointer, 2 as WasmSize);
            return dv.getUint16(0, true);
        }
        case PrimitiveValType.S32: {
            const dv = ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize);
            return dv.getInt32(0, true);
        }
        case PrimitiveValType.U32: {
            const dv = ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize);
            return dv.getUint32(0, true);
        }
        case PrimitiveValType.S64: {
            const dv = ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize);
            return dv.getBigInt64(0, true);
        }
        case PrimitiveValType.U64: {
            const dv = ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize);
            return dv.getBigUint64(0, true);
        }
        case PrimitiveValType.Float32: {
            const dv = ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize);
            return dv.getFloat32(0, true);
        }
        case PrimitiveValType.Float64: {
            const dv = ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize);
            return dv.getFloat64(0, true);
        }
        case PrimitiveValType.Char: {
            const dv = ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize);
            return String.fromCodePoint(dv.getUint32(0, true));
        }
        case PrimitiveValType.String: {
            const dv = ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize);
            const strPtr = dv.getInt32(0, true);
            const strLen = dv.getInt32(4, true);
            const strView = ctx.memory.getView(strPtr as WasmPointer, strLen as WasmSize);
            return ctx.utf8Decoder.decode(strView);
        }
    }
}

export function loadFromMemory(ctx: BindingContext, rctx: ResolverContext, ptr: number, type: ResolvedType): any {
    switch (type.tag) {
        case ModelTag.ComponentValTypePrimitive:
        case ModelTag.ComponentTypeDefinedPrimitive:
            return loadPrimitive(ctx, ptr, type.value);
        case ModelTag.ComponentTypeDefinedRecord: {
            const result: Record<string, unknown> = {};
            let offset = 0;
            for (const member of type.members) {
                const fieldType = resolveValType(rctx, member.type);
                const fieldAlign = alignOf(rctx, fieldType);
                offset = alignUp(offset, fieldAlign);
                result[member.name] = loadFromMemory(ctx, rctx, ptr + offset, fieldType);
                offset += sizeOf(rctx, fieldType);
            }
            return result;
        }
        case ModelTag.ComponentTypeDefinedList: {
            const dv = ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize);
            const listPtr = dv.getInt32(0, true);
            const len = dv.getInt32(4, true);
            const elemType = resolveValType(rctx, type.value);
            const elemSize = sizeOf(rctx, elemType);
            const result: any[] = [];
            for (let i = 0; i < len; i++) {
                result.push(loadFromMemory(ctx, rctx, listPtr + i * elemSize, elemType));
            }
            return result;
        }
        case ModelTag.ComponentTypeDefinedOption: {
            const payloadType = resolveValType(rctx, type.value);
            const payloadAlign = alignOf(rctx, payloadType);
            const payloadOffset = alignUp(1, payloadAlign);
            const dv = ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize);
            const disc = dv.getUint8(0);
            if (disc === 0) return null;
            return loadFromMemory(ctx, rctx, ptr + payloadOffset, payloadType);
        }
        case ModelTag.ComponentTypeDefinedResult: {
            let payloadAlign = 1;
            if (type.ok !== undefined) payloadAlign = Math.max(payloadAlign, alignOfValType(rctx, type.ok));
            if (type.err !== undefined) payloadAlign = Math.max(payloadAlign, alignOfValType(rctx, type.err));
            const payloadOffset = alignUp(1, payloadAlign);
            const dv = ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize);
            const disc = dv.getUint8(0);
            if (disc === 0) {
                const val = type.ok !== undefined
                    ? loadFromMemory(ctx, rctx, ptr + payloadOffset, resolveValType(rctx, type.ok))
                    : undefined;
                return { tag: 'ok', val };
            } else {
                const val = type.err !== undefined
                    ? loadFromMemory(ctx, rctx, ptr + payloadOffset, resolveValType(rctx, type.err))
                    : undefined;
                return { tag: 'err', val };
            }
        }
        case ModelTag.ComponentTypeDefinedVariant: {
            const discSize = discriminantSize(type.variants.length);
            let maxPayloadAlign = 1;
            for (const c of type.variants) {
                if (c.ty !== undefined) maxPayloadAlign = Math.max(maxPayloadAlign, alignOfValType(rctx, c.ty));
            }
            const payloadOffset = alignUp(discSize, maxPayloadAlign);
            const dv = ctx.memory.getView(ptr as WasmPointer, discSize as WasmSize);
            let disc: number;
            if (discSize === 1) disc = dv.getUint8(0);
            else if (discSize === 2) disc = dv.getUint16(0, true);
            else disc = dv.getUint32(0, true);
            const c = type.variants[disc];
            if (c.ty !== undefined) {
                return { tag: c.name, val: loadFromMemory(ctx, rctx, ptr + payloadOffset, resolveValType(rctx, c.ty)) };
            }
            return { tag: c.name };
        }
        case ModelTag.ComponentTypeDefinedEnum: {
            const discSize = discriminantSize(type.members.length);
            const dv = ctx.memory.getView(ptr as WasmPointer, discSize as WasmSize);
            let disc: number;
            if (discSize === 1) disc = dv.getUint8(0);
            else if (discSize === 2) disc = dv.getUint16(0, true);
            else disc = dv.getUint32(0, true);
            return type.members[disc];
        }
        case ModelTag.ComponentTypeDefinedFlags: {
            const wordCount = Math.max(1, Math.ceil(type.members.length / 32));
            const result: Record<string, boolean> = {};
            for (let w = 0; w < wordCount; w++) {
                const dv = ctx.memory.getView((ptr + w * 4) as WasmPointer, 4 as WasmSize);
                const word = dv.getInt32(0, true);
                for (let b = 0; b < 32 && w * 32 + b < type.members.length; b++) {
                    result[type.members[w * 32 + b]] = !!(word & (1 << b));
                }
            }
            return result;
        }
        case ModelTag.ComponentTypeDefinedTuple: {
            const result: any[] = [];
            let offset = 0;
            for (const member of type.members) {
                const memberType = resolveValType(rctx, member);
                const memberAlign = alignOf(rctx, memberType);
                offset = alignUp(offset, memberAlign);
                result.push(loadFromMemory(ctx, rctx, ptr + offset, memberType));
                offset += sizeOf(rctx, memberType);
            }
            return result;
        }
        case ModelTag.ComponentTypeDefinedOwn: {
            const dv = ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize);
            const handle = dv.getInt32(0, true);
            return ctx.resources.remove(getCanonicalResourceId(rctx, type.value), handle);
        }
        case ModelTag.ComponentTypeDefinedBorrow: {
            const dv = ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize);
            const handle = dv.getInt32(0, true);
            return ctx.resources.get(getCanonicalResourceId(rctx, type.value), handle);
        }
        default:
            throw new Error('loadFromMemory not implemented for tag ' + type.tag);
    }
}

// --- List lowering ---

function createListLowering(rctx: ResolverContext, listModel: ComponentTypeDefinedList): LoweringToJs {
    const elementType = resolveValType(rctx, listModel.value);
    const elemSize = sizeOf(rctx, elementType);
    const elemAlign = alignOf(rctx, elementType);

    const fn = (ctx: BindingContext, ...args: WasmValue[]) => {
        const ptr = args[0] as number;
        const len = args[1] as number;
        if (len > 0) {
            // Validate list pointer alignment
            validatePointerAlignment(ptr, elemAlign, 'list');
            // Validate bounds
            const memorySize = ctx.memory.getMemory().buffer.byteLength;
            if (ptr + len * elemSize > memorySize) {
                throw new Error(`list pointer out of bounds: ptr=${ptr} len=${len} elem_size=${elemSize} memory_size=${memorySize}`);
            }
        }
        const result: any[] = [];
        for (let i = 0; i < len; i++) {
            result.push(loadFromMemory(ctx, rctx, ptr + i * elemSize, elementType));
        }
        return result;
    };
    fn.spill = 2;
    return fn;
}

// --- Option lowering ---

function createOptionLowering(rctx: ResolverContext, optionModel: ComponentTypeDefinedOption): LoweringToJs {
    const innerLowerer = createLowering(rctx, optionModel.value);
    const innerSpill = (innerLowerer as any).spill as number;

    const fn = (ctx: BindingContext, ...args: WasmValue[]) => {
        const discriminant = args[0] as number;
        if (discriminant > 1) throw new Error(`Invalid option discriminant: ${discriminant}`);
        if (discriminant === 0) return null;
        const payload = args.slice(1, 1 + innerSpill);
        return innerLowerer(ctx, ...payload);
    };
    fn.spill = 1 + innerSpill;
    return fn;
}

// --- Result lowering ---

function createResultLowering(rctx: ResolverContext, resultModel: ComponentTypeDefinedResult): LoweringToJs {
    const okLowerer = resultModel.ok ? createLowering(rctx, resultModel.ok) : undefined;
    const errLowerer = resultModel.err ? createLowering(rctx, resultModel.err) : undefined;
    const okSpill = okLowerer ? (okLowerer as any).spill as number : 0;
    const errSpill = errLowerer ? (errLowerer as any).spill as number : 0;
    const maxPayloadSpill = Math.max(okSpill, errSpill);

    const fn = (ctx: BindingContext, ...args: WasmValue[]) => {
        const discriminant = args[0] as number;
        if (discriminant > 1) throw new Error(`Invalid result discriminant: ${discriminant}`);
        const payload = args.slice(1, 1 + maxPayloadSpill);
        if (discriminant === 0) {
            const val = okLowerer ? okLowerer(ctx, ...payload.slice(0, okSpill)) : undefined;
            return { tag: 'ok', val };
        } else {
            const val = errLowerer ? errLowerer(ctx, ...payload.slice(0, errSpill)) : undefined;
            return { tag: 'err', val };
        }
    };
    fn.spill = 1 + maxPayloadSpill;
    return fn;
}

// --- Variant lowering ---

function createVariantLowering(rctx: ResolverContext, variantModel: ComponentTypeDefinedVariant): LoweringToJs {
    const cases = variantModel.variants.map((c) => ({
        name: c.name,
        lowerer: c.ty ? createLowering(rctx, c.ty) : undefined,
        spill: c.ty ? (createLowering(rctx, c.ty) as any).spill as number : 0,
    }));
    const maxPayloadSpill = Math.max(0, ...cases.map(c => c.spill));

    const fn = (ctx: BindingContext, ...args: WasmValue[]) => {
        const disc = args[0] as number;
        const c = cases[disc];
        if (!c) throw new Error(`Invalid variant discriminant: ${disc}`);
        if (c.lowerer) {
            const payload = args.slice(1, 1 + c.spill);
            return { tag: c.name, val: c.lowerer(ctx, ...payload) };
        }
        return { tag: c.name };
    };
    fn.spill = 1 + maxPayloadSpill;
    return fn;
}

// --- Enum lowering ---

function createEnumLowering(_rctx: ResolverContext, enumModel: ComponentTypeDefinedEnum): LoweringToJs {
    const fn = (_ctx: BindingContext, ...args: WasmValue[]) => {
        const disc = args[0] as number;
        if (disc >= enumModel.members.length) throw new Error(`Invalid enum discriminant: ${disc} >= ${enumModel.members.length}`);
        return enumModel.members[disc];
    };
    fn.spill = 1;
    return fn;
}

// --- Flags lowering ---

function createFlagsLowering(_rctx: ResolverContext, flagsModel: ComponentTypeDefinedFlags): LoweringToJs {
    const wordCount = Math.max(1, Math.ceil(flagsModel.members.length / 32));

    const fn = (_ctx: BindingContext, ...args: WasmValue[]) => {
        const result: Record<string, boolean> = {};
        for (let i = 0; i < flagsModel.members.length; i++) {
            const word = args[i >>> 5] as number;
            result[flagsModel.members[i]] = !!(word & (1 << (i & 31)));
        }
        return result;
    };
    fn.spill = wordCount;
    return fn;
}

// --- Tuple lowering ---

function createTupleLowering(rctx: ResolverContext, tupleModel: ComponentTypeDefinedTuple): LoweringToJs {
    const elementLowerers = tupleModel.members.map(m => createLowering(rctx, m));

    let totalSpill = 0;
    for (const l of elementLowerers) totalSpill += (l as any).spill;

    const fn = (ctx: BindingContext, ...args: WasmValue[]) => {
        const result: any[] = [];
        let offset = 0;
        for (const lowerer of elementLowerers) {
            const spill = (lowerer as any).spill;
            result.push(lowerer(ctx, ...args.slice(offset, offset + spill)));
            offset += spill;
        }
        return result;
    };
    fn.spill = totalSpill;
    return fn;
}

// --- Resource handle lowering ---

function createOwnLowering(rctx: ResolverContext, ownModel: ComponentTypeDefinedOwn): LoweringToJs {
    const resourceTypeIdx = getCanonicalResourceId(rctx, ownModel.value);
    const fn = (ctx: BindingContext, ...args: WasmValue[]) => {
        const handle = args[0] as number;
        return ctx.resources.remove(resourceTypeIdx, handle);
    };
    fn.spill = 1;
    return fn;
}

function createBorrowLowering(rctx: ResolverContext, borrowModel: ComponentTypeDefinedBorrow): LoweringToJs {
    const resourceTypeIdx = getCanonicalResourceId(rctx, borrowModel.value);
    const fn = (ctx: BindingContext, ...args: WasmValue[]) => {
        const handle = args[0] as number;
        return ctx.resources.get(resourceTypeIdx, handle);
    };
    fn.spill = 1;
    return fn;
}
