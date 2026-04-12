import isDebug from 'env:isDebug';
import { ComponentTypeIndex } from '../../model/indices';
import { ModelTag } from '../../model/tags';
import { ComponentTypeDefinedRecord, ComponentTypeDefinedList, ComponentTypeDefinedOption, ComponentTypeDefinedResult, ComponentTypeDefinedVariant, ComponentTypeDefinedEnum, ComponentTypeDefinedFlags, ComponentTypeDefinedTuple, ComponentTypeFunc, ComponentValType, PrimitiveValType, ComponentTypeDefinedOwn, ComponentTypeDefinedBorrow } from '../../model/types';
import { BindingContext, ResolvedContext, StringEncoding } from '../types';
import { jsco_assert, LogLevel } from '../../utils/assert';
import { callingConventionName } from '../../utils/debug-names';
import type { ResolvedType } from '../type-resolution';
import { getCanonicalResourceId } from '../context';
import { CallingConvention, determineFunctionCallingConvention, sizeOf, alignOf, alignOfValType, resolveValType, resolveValTypePure, deepResolveType, discriminantSize, FlatType, flattenType, flattenValType, flattenVariant } from '../calling-convention';
import { memoize } from './cache';
import { createLifting, createMemoryStorer } from './to-abi';
import { LoweringToJs, FnLoweringCallToJs, WasmFunction, WasmPointer, JsFunction, WasmSize, WasmValue } from './types';
import { validatePointerAlignment, validateUtf16 } from './validation';
import camelCase from 'just-camel-case';
import { TAG, VAL, OK, ERR } from '../../constants';

// Canonical NaN values per spec (CANONICAL_FLOAT32_NAN = 0x7fc00000, CANONICAL_FLOAT64_NAN = 0x7ff8000000000000)
const _f32 = new Float32Array(1);
const _i32 = new Int32Array(_f32.buffer);
_i32[0] = 0x7fc00000;
const canonicalNaN32: number = _f32[0];
const _f64 = new Float64Array(1);
const _i64 = new BigInt64Array(_f64.buffer);
_i64[0] = 0x7ff8000000000000n;
const canonicalNaN64: number = _f64[0];

function bigIntReplacer(_key: string, value: unknown): unknown {
    return typeof value === 'bigint' ? value.toString() + 'n' : value;
}


export function createFunctionLowering(rctx: ResolvedContext, exportModel: ComponentTypeFunc): FnLoweringCallToJs {
    return memoize(rctx.loweringCache, exportModel, () => {
        const callingConvention = determineFunctionCallingConvention(deepResolveType(rctx, exportModel) as ComponentTypeFunc);
        // Pre-resolve param/result types for spilled path — deep-resolve ensures
        // storeToMemory/loadFromMemory can work without rctx.resolvedTypes lookups
        const paramResolvedTypes = exportModel.params.map(p => deepResolveType(rctx, resolveValType(rctx, p.type)));
        let resultType: ResolvedType | undefined;
        if (exportModel.results.tag === ModelTag.ComponentFuncResultUnnamed) {
            resultType = deepResolveType(rctx, resolveValType(rctx, exportModel.results.type));
        }

        // Pre-create lowerers/lifters at resolution time (matches createFunctionLifting pattern)
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

        // Pre-capture rctx properties needed at call time — after this, rctx is not captured
        const stringEncoding = rctx.stringEncoding;
        const canonicalResourceIds = rctx.canonicalResourceIds;

        // Pre-create memory loaders/storer for spilled calling convention
        const paramLoaders = paramResolvedTypes.map(pt => createMemoryLoader(pt, stringEncoding, canonicalResourceIds, rctx.ownInstanceResources));
        const resultStorer = resultType !== undefined ? createMemoryStorer(resultType, stringEncoding, canonicalResourceIds) : undefined;

        // Pre-compute spilled parameter offsets
        const spilledParamOffsets: number[] = [];
        {
            let off = 0;
            for (const pt of paramResolvedTypes) {
                const a = alignOf(pt);
                off = alignUp(off, a);
                spilledParamOffsets.push(off);
                off += sizeOf(pt);
            }
        }

        // Pre-allocate result buffer for flat result path (MAX_FLAT_RESULTS=1, so always 1 value)
        const resultBuf: WasmValue[] = [0];

        if (isDebug && (rctx.verbose?.binder ?? 0) >= LogLevel.Summary) {
            const paramNames = exportModel.params.map(p => p.name).join(', ');
            rctx.logger!('binder', LogLevel.Summary,
                `createFunctionLowering: params=[${paramNames}] count=${exportModel.params.length} results=${resultLifters.length}` +
                ` convention: params=${callingConventionName(callingConvention.params)} results=${callingConventionName(callingConvention.results)}`);
        }

        return (ctx: BindingContext, jsFunction: JsFunction): WasmFunction => {

            function loweringTrampoline(...args: any[]): any {
                const convertedArgs = new Array(paramLoaders.length);
                if (callingConvention.params === CallingConvention.Spilled) {
                    // Spill: WASM passes single pointer, read params from memory
                    const ptr = args[0] as number;
                    for (let i = 0; i < paramLoaders.length; i++) {
                        convertedArgs[i] = paramLoaders[i](ctx, ptr + spilledParamOffsets[i]);
                    }
                } else {
                    // Flat/Scalar: read each param using lowerers
                    let flatOffset = 0;
                    for (let i = 0; i < paramLowerers.length; i++) {
                        const spill = (paramLowerers[i] as any).spill;
                        convertedArgs[i] = paramLowerers[i](ctx, ...args.slice(flatOffset, flatOffset + spill));
                        flatOffset += spill;
                    }
                }

                if (isDebug && (ctx.verbose?.executor ?? 0) >= LogLevel.Summary) {
                    ctx.logger!('executor', LogLevel.Summary, `→ lowering args=${JSON.stringify(convertedArgs, bigIntReplacer)}`);
                }

                if (callingConvention.results === CallingConvention.Spilled) {
                    // canon_lower: WASM passed retptr as last flat arg
                    const retptr = args[args.length - 1] as number;
                    const resJs = jsFunction(...convertedArgs);
                    if (isDebug && (ctx.verbose?.executor ?? 0) >= LogLevel.Summary) {
                        ctx.logger!('executor', LogLevel.Summary, `← lowering result=${JSON.stringify(resJs, bigIntReplacer)}`);
                    }
                    if (resultStorer !== undefined) {
                        resultStorer(ctx, retptr, resJs);
                    }
                    // No return value - WASM reads from retptr
                } else {
                    const resJs = jsFunction(...convertedArgs);
                    if (isDebug && (ctx.verbose?.executor ?? 0) >= LogLevel.Summary) {
                        ctx.logger!('executor', LogLevel.Summary, `← lowering result=${JSON.stringify(resJs, bigIntReplacer)}`);
                    }
                    if (resultLifters.length === 1) {
                        resultLifters[0](ctx, resJs, resultBuf, 0);
                        return resultBuf[0];
                    }
                }
            }
            return loweringTrampoline as WasmFunction;
        };
    });
}

export function createLowering(rctx: ResolvedContext, typeModel: ComponentValType | ResolvedType): LoweringToJs {
    return memoize(rctx.loweringCache, typeModel, () => {
        switch (typeModel.tag) {
            case ModelTag.ComponentValTypePrimitive:
            case ModelTag.ComponentTypeDefinedPrimitive:
                switch (typeModel.value) {
                    case PrimitiveValType.String:
                        return createStringLowering(rctx.stringEncoding);
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
            case ModelTag.ComponentValTypeResolved:
                return createLowering(rctx, (typeModel as any).resolved);
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

function createRecordLowering(rctx: ResolvedContext, recordModel: ComponentTypeDefinedRecord): LoweringToJs {
    const fieldLowerers: { name: string, lowerer: LoweringToJs }[] = [];
    for (const member of recordModel.members) {
        const lowerer = createLowering(rctx, member.type);
        fieldLowerers.push({ name: camelCase(member.name), lowerer });
    }
    let totalSpill = 0;
    for (const fl of fieldLowerers) {
        totalSpill += (fl.lowerer as any).spill;
    }
    const fn = (ctx: BindingContext, ...args: WasmValue[]) => {
        const result: Record<string, unknown> = {};
        let offset = 0;
        for (let i = 0; i < fieldLowerers.length; i++) {
            const spill = (fieldLowerers[i].lowerer as any).spill;
            result[fieldLowerers[i].name] = fieldLowerers[i].lowerer(ctx, ...args.slice(offset, offset + spill));
            offset += spill;
        }
        return result;
    };
    fn.spill = totalSpill;
    return fn;
}

function createStringLowering(encoding: StringEncoding): LoweringToJs {
    if (encoding === StringEncoding.Utf16) {
        return createStringLoweringUtf16();
    }
    if (encoding === StringEncoding.CompactUtf16) {
        throw new Error('CompactUTF-16 (latin1+utf16) string encoding not yet supported');
    }
    return createStringLoweringUtf8();
}

function createStringLoweringUtf8(): LoweringToJs {
    const fn = (ctx: BindingContext, ...args: WasmValue[]) => {
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
    };
    fn.spill = 2;
    return fn;
}

function createStringLoweringUtf16(): LoweringToJs {
    const fn = (ctx: BindingContext, ...args: WasmValue[]) => {
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
    };
    fn.spill = 2;
    return fn;
}

// --- Memory load helpers (for list element loading) ---

function alignUp(offset: number, align: number): number {
    return (offset + align - 1) & ~(align - 1);
}

export type MemoryLoader = (ctx: BindingContext, ptr: number) => any;

function createPrimitiveLoader(prim: PrimitiveValType, encoding: StringEncoding): MemoryLoader {
    switch (prim) {
        case PrimitiveValType.Bool:
            return (ctx, ptr) => ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize).getUint8(0) !== 0;
        case PrimitiveValType.S8:
            return (ctx, ptr) => ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize).getInt8(0);
        case PrimitiveValType.U8:
            return (ctx, ptr) => ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize).getUint8(0);
        case PrimitiveValType.S16:
            return (ctx, ptr) => ctx.memory.getView(ptr as WasmPointer, 2 as WasmSize).getInt16(0, true);
        case PrimitiveValType.U16:
            return (ctx, ptr) => ctx.memory.getView(ptr as WasmPointer, 2 as WasmSize).getUint16(0, true);
        case PrimitiveValType.S32:
            return (ctx, ptr) => ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).getInt32(0, true);
        case PrimitiveValType.U32:
            return (ctx, ptr) => ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).getUint32(0, true);
        case PrimitiveValType.S64:
            return (ctx, ptr) => ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize).getBigInt64(0, true);
        case PrimitiveValType.U64:
            return (ctx, ptr) => ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize).getBigUint64(0, true);
        case PrimitiveValType.Float32:
            return (ctx, ptr) => ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).getFloat32(0, true);
        case PrimitiveValType.Float64:
            return (ctx, ptr) => ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize).getFloat64(0, true);
        case PrimitiveValType.Char:
            return (ctx, ptr) => {
                const i = ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).getUint32(0, true);
                if (i >= 0x110000) throw new Error(`Invalid char codepoint: ${i} >= 0x110000`);
                if (i >= 0xD800 && i <= 0xDFFF) throw new Error(`Invalid char codepoint: surrogate ${i}`);
                return String.fromCodePoint(i);
            };
        case PrimitiveValType.String: {
            if (encoding === StringEncoding.Utf16) {
                return (ctx, ptr) => {
                    const dv = ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize);
                    const strPtr = dv.getUint32(0, true);
                    const strLen = dv.getUint32(4, true);
                    if (strLen > 0) {
                        const byteLen = strLen * 2;
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
                };
            }
            return (ctx, ptr) => {
                const dv = ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize);
                const strPtr = dv.getUint32(0, true);
                const strLen = dv.getUint32(4, true);
                if (strLen > 0) {
                    const memorySize = ctx.memory.getMemory().buffer.byteLength;
                    if (strPtr + strLen > memorySize) {
                        throw new Error(`string pointer out of bounds: ptr=${strPtr} len=${strLen} memory_size=${memorySize}`);
                    }
                }
                // TextDecoder with fatal:true validates UTF-8 and decodes in a single native pass
                const strView = ctx.memory.getView(strPtr as WasmPointer, strLen as WasmSize);
                return ctx.utf8Decoder.decode(strView);
            };
        }
        default:
            throw new Error('createPrimitiveLoader not implemented for ' + prim);
    }
}

export function createMemoryLoader(type: ResolvedType, stringEncoding: StringEncoding, canonicalResourceIds: Map<number, number>, ownInstanceResources?: Set<number>): MemoryLoader {
    switch (type.tag) {
        case ModelTag.ComponentValTypePrimitive:
        case ModelTag.ComponentTypeDefinedPrimitive:
            return createPrimitiveLoader(type.value, stringEncoding);
        case ModelTag.ComponentTypeDefinedRecord: {
            const fieldLoaders: { name: string, offset: number, loader: MemoryLoader }[] = [];
            let offset = 0;
            for (const member of type.members) {
                const fieldType = resolveValTypePure(member.type);
                const fieldAlign = alignOf(fieldType);
                offset = alignUp(offset, fieldAlign);
                fieldLoaders.push({
                    name: camelCase(member.name),
                    offset,
                    loader: createMemoryLoader(fieldType, stringEncoding, canonicalResourceIds, ownInstanceResources)
                });
                offset += sizeOf(fieldType);
            }
            return (ctx, ptr) => {
                const result: Record<string, unknown> = {};
                for (let i = 0; i < fieldLoaders.length; i++) {
                    result[fieldLoaders[i].name] = fieldLoaders[i].loader(ctx, ptr + fieldLoaders[i].offset);
                }
                return result;
            };
        }
        case ModelTag.ComponentTypeDefinedList: {
            const elemType = resolveValTypePure(type.value);
            const elemSize = sizeOf(elemType);
            const elemAlign = alignOf(elemType);
            const elemLoader = createMemoryLoader(elemType, stringEncoding, canonicalResourceIds, ownInstanceResources);
            return (ctx, ptr) => {
                const dv = ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize);
                const listPtr = dv.getUint32(0, true);
                const len = dv.getUint32(4, true);
                if (len > 0) {
                    validatePointerAlignment(listPtr, elemAlign, 'list');
                    const memorySize = ctx.memory.getMemory().buffer.byteLength;
                    if (listPtr + len * elemSize > memorySize) {
                        throw new Error(`list pointer out of bounds: ptr=${listPtr} len=${len} elem_size=${elemSize} memory_size=${memorySize}`);
                    }
                }
                const result = new Array(len);
                for (let i = 0; i < len; i++) {
                    result[i] = elemLoader(ctx, listPtr + i * elemSize);
                }
                return result;
            };
        }
        case ModelTag.ComponentTypeDefinedOption: {
            const payloadType = resolveValTypePure(type.value);
            const payloadAlign = alignOf(payloadType);
            const payloadOffset = alignUp(1, payloadAlign);
            const payloadLoader = createMemoryLoader(payloadType, stringEncoding, canonicalResourceIds, ownInstanceResources);
            return (ctx, ptr) => {
                const dv = ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize);
                const disc = dv.getUint8(0);
                if (disc > 1) throw new Error(`Invalid option discriminant: ${disc}`);
                if (disc === 0) return null;
                return payloadLoader(ctx, ptr + payloadOffset);
            };
        }
        case ModelTag.ComponentTypeDefinedResult: {
            let payloadAlign = 1;
            if (type.ok !== undefined) payloadAlign = Math.max(payloadAlign, alignOfValType(type.ok));
            if (type.err !== undefined) payloadAlign = Math.max(payloadAlign, alignOfValType(type.err));
            const payloadOffset = alignUp(1, payloadAlign);
            const okLoader = type.ok !== undefined ? createMemoryLoader(resolveValTypePure(type.ok), stringEncoding, canonicalResourceIds, ownInstanceResources) : undefined;
            const errLoader = type.err !== undefined ? createMemoryLoader(resolveValTypePure(type.err), stringEncoding, canonicalResourceIds, ownInstanceResources) : undefined;
            return (ctx, ptr) => {
                const dv = ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize);
                const disc = dv.getUint8(0);
                if (disc > 1) throw new Error(`Invalid result discriminant: ${disc}`);
                if (disc === 0) {
                    const val = okLoader ? okLoader(ctx, ptr + payloadOffset) : undefined;
                    return { [TAG]: OK, [VAL]: val };
                } else {
                    const val = errLoader ? errLoader(ctx, ptr + payloadOffset) : undefined;
                    return { [TAG]: ERR, [VAL]: val };
                }
            };
        }
        case ModelTag.ComponentTypeDefinedVariant: {
            const discSize = discriminantSize(type.variants.length);
            let maxPayloadAlign = 1;
            for (const c of type.variants) {
                if (c.ty !== undefined) maxPayloadAlign = Math.max(maxPayloadAlign, alignOfValType(c.ty));
            }
            const payloadOffset = alignUp(discSize, maxPayloadAlign);
            const caseLoaders = type.variants.map(c =>
                c.ty !== undefined ? createMemoryLoader(resolveValTypePure(c.ty), stringEncoding, canonicalResourceIds, ownInstanceResources) : undefined
            );
            const caseNames = type.variants.map(c => c.name);
            const numCases = type.variants.length;
            return (ctx, ptr) => {
                const dv = ctx.memory.getView(ptr as WasmPointer, discSize as WasmSize);
                let disc: number;
                if (discSize === 1) disc = dv.getUint8(0);
                else if (discSize === 2) disc = dv.getUint16(0, true);
                else disc = dv.getUint32(0, true);
                if (disc >= numCases) throw new Error(`Invalid variant discriminant: ${disc} >= ${numCases}`);
                const loader = caseLoaders[disc];
                if (loader) {
                    return { [TAG]: caseNames[disc], [VAL]: loader(ctx, ptr + payloadOffset) };
                }
                return { [TAG]: caseNames[disc] };
            };
        }
        case ModelTag.ComponentTypeDefinedEnum: {
            const discSize = discriminantSize(type.members.length);
            const memberNames = type.members;
            const numMembers = type.members.length;
            return (ctx, ptr) => {
                const dv = ctx.memory.getView(ptr as WasmPointer, discSize as WasmSize);
                let disc: number;
                if (discSize === 1) disc = dv.getUint8(0);
                else if (discSize === 2) disc = dv.getUint16(0, true);
                else disc = dv.getUint32(0, true);
                if (disc >= numMembers) throw new Error(`Invalid enum discriminant: ${disc} >= ${numMembers}`);
                return memberNames[disc];
            };
        }
        case ModelTag.ComponentTypeDefinedFlags: {
            const wordCount = Math.max(1, Math.ceil(type.members.length / 32));
            const memberNames = type.members.map(m => camelCase(m));
            return (ctx, ptr) => {
                const result: Record<string, boolean> = {};
                for (let w = 0; w < wordCount; w++) {
                    const dv = ctx.memory.getView((ptr + w * 4) as WasmPointer, 4 as WasmSize);
                    const word = dv.getInt32(0, true);
                    for (let b = 0; b < 32 && w * 32 + b < memberNames.length; b++) {
                        result[memberNames[w * 32 + b]] = !!(word & (1 << b));
                    }
                }
                return result;
            };
        }
        case ModelTag.ComponentTypeDefinedTuple: {
            const memberLoaders: { offset: number, loader: MemoryLoader }[] = [];
            let offset = 0;
            for (const member of type.members) {
                const memberType = resolveValTypePure(member);
                const memberAlign = alignOf(memberType);
                offset = alignUp(offset, memberAlign);
                memberLoaders.push({ offset, loader: createMemoryLoader(memberType, stringEncoding, canonicalResourceIds, ownInstanceResources) });
                offset += sizeOf(memberType);
            }
            return (ctx, ptr) => {
                const result = new Array(memberLoaders.length);
                for (let i = 0; i < memberLoaders.length; i++) {
                    result[i] = memberLoaders[i].loader(ctx, ptr + memberLoaders[i].offset);
                }
                return result;
            };
        }
        case ModelTag.ComponentTypeDefinedOwn: {
            const resourceTypeIdx = canonicalResourceIds?.get(type.value) ?? type.value;
            return (ctx, ptr) => {
                const handle = ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).getInt32(0, true);
                return ctx.resources.remove(resourceTypeIdx, handle);
            };
        }
        case ModelTag.ComponentTypeDefinedBorrow: {
            const resourceTypeIdx = canonicalResourceIds?.get(type.value) ?? type.value;
            // Canonical ABI: lift_borrow — if own-instance resource, value is rep directly
            if (ownInstanceResources?.has(resourceTypeIdx)) {
                return (ctx, ptr) => {
                    return ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).getInt32(0, true);
                };
            }
            return (ctx, ptr) => {
                const handle = ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).getInt32(0, true);
                return ctx.resources.get(resourceTypeIdx, handle);
            };
        }
        default:
            throw new Error('createMemoryLoader not implemented for tag ' + type.tag);
    }
}

// --- List lowering ---

function createListLowering(rctx: ResolvedContext, listModel: ComponentTypeDefinedList): LoweringToJs {
    const elementType = deepResolveType(rctx, resolveValType(rctx, listModel.value));
    const elemSize = sizeOf(elementType);
    const elemAlign = alignOf(elementType);
    const elemLoader = createMemoryLoader(elementType, rctx.stringEncoding, rctx.canonicalResourceIds, rctx.ownInstanceResources);

    const fn = (ctx: BindingContext, ...args: WasmValue[]) => {
        const ptr = (args[0] as number) >>> 0;
        const len = (args[1] as number) >>> 0;
        if (len > 0) {
            // Validate list pointer alignment
            validatePointerAlignment(ptr, elemAlign, 'list');
            // Validate bounds
            const memorySize = ctx.memory.getMemory().buffer.byteLength;
            if (ptr + len * elemSize > memorySize) {
                throw new Error(`list pointer out of bounds: ptr=${ptr} len=${len} elem_size=${elemSize} memory_size=${memorySize}`);
            }
        }
        const result = new Array(len);
        for (let i = 0; i < len; i++) {
            result[i] = elemLoader(ctx, ptr + i * elemSize);
        }
        return result;
    };
    fn.spill = 2;
    return fn;
}

// --- Option lowering ---

function createOptionLowering(rctx: ResolvedContext, optionModel: ComponentTypeDefinedOption): LoweringToJs {
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

function createResultLowering(rctx: ResolvedContext, resultModel: ComponentTypeDefinedResult): LoweringToJs {
    const okLowerer = resultModel.ok ? createLowering(rctx, resultModel.ok) : undefined;
    const errLowerer = resultModel.err ? createLowering(rctx, resultModel.err) : undefined;

    // Compute joined flat types for the result
    const resolved = deepResolveType(rctx, resultModel) as ComponentTypeDefinedResult;
    const joinedFlatTypes = flattenType(resolved);
    const payloadJoined = joinedFlatTypes.slice(1);
    const totalSpill = joinedFlatTypes.length;

    const okFlatTypes = resolved.ok ? flattenValType(resolved.ok) : [];
    const errFlatTypes = resolved.err ? flattenValType(resolved.err) : [];
    const okNeedsCoercion = okFlatTypes.some((ct, i) => ct !== payloadJoined[i]);
    const errNeedsCoercion = errFlatTypes.some((ct, i) => ct !== payloadJoined[i]);

    const fn = (ctx: BindingContext, ...args: WasmValue[]) => {
        const discriminant = args[0] as number;
        if (discriminant > 1) throw new Error(`Invalid result discriminant: ${discriminant}`);
        const payload = args.slice(1, 1 + payloadJoined.length);
        if (discriminant === 0) {
            if (okNeedsCoercion) {
                for (let i = 0; i < okFlatTypes.length; i++) {
                    if (payloadJoined[i] !== okFlatTypes[i]) {
                        payload[i] = coerceFlatLower(payload[i], payloadJoined[i], okFlatTypes[i]);
                    }
                }
            }
            const val = okLowerer ? okLowerer(ctx, ...payload.slice(0, okFlatTypes.length)) : undefined;
            return { [TAG]: OK, [VAL]: val };
        } else {
            if (errNeedsCoercion) {
                for (let i = 0; i < errFlatTypes.length; i++) {
                    if (payloadJoined[i] !== errFlatTypes[i]) {
                        payload[i] = coerceFlatLower(payload[i], payloadJoined[i], errFlatTypes[i]);
                    }
                }
            }
            const val = errLowerer ? errLowerer(ctx, ...payload.slice(0, errFlatTypes.length)) : undefined;
            return { [TAG]: ERR, [VAL]: val };
        }
    };
    fn.spill = totalSpill;
    return fn;
}

// --- Variant lowering ---

function createVariantLowering(rctx: ResolvedContext, variantModel: ComponentTypeDefinedVariant): LoweringToJs {
    // Compute the joined flat types per the spec's flatten_variant
    const joinedFlatTypes = flattenVariant(deepResolveType(rctx, variantModel) as ComponentTypeDefinedVariant);
    const payloadJoined = joinedFlatTypes.slice(1);
    const totalSpill = joinedFlatTypes.length;

    const cases = variantModel.variants.map((c) => {
        const resolved = c.ty ? deepResolveType(rctx, resolveValType(rctx, c.ty)) : undefined;
        const caseFlatTypes = resolved ? flattenType(resolved) : [];
        const needsCoercion = caseFlatTypes.some((ct, si) => ct !== payloadJoined[si]);
        return {
            name: c.name,
            lowerer: c.ty ? createLowering(rctx, c.ty) : undefined,
            caseFlatTypes,
            needsCoercion,
        };
    });

    const fn = (ctx: BindingContext, ...args: WasmValue[]) => {
        const disc = args[0] as number;
        const c = cases[disc];
        if (!c) throw new Error(`Invalid variant discriminant: ${disc}`);
        if (c.lowerer) {
            // Coerce payload args from joined flat types to case's natural flat types
            const payload = args.slice(1, 1 + c.caseFlatTypes.length);
            if (c.needsCoercion) {
                for (let i = 0; i < c.caseFlatTypes.length; i++) {
                    const have = payloadJoined[i];
                    const want = c.caseFlatTypes[i];
                    if (have !== want) {
                        payload[i] = coerceFlatLower(payload[i], have, want);
                    }
                }
            }
            return { [TAG]: c.name, [VAL]: c.lowerer(ctx, ...payload) };
        }
        return { [TAG]: c.name };
    };
    fn.spill = totalSpill;
    return fn;
}

/**
 * Coerce a value from the joined flat type to the case's natural flat type during lowering (WASM→JS).
 * Follows the spec's lift_flat_variant CoerceValueIter.
 */
function coerceFlatLower(value: WasmValue, have: FlatType, want: FlatType): WasmValue {
    // (i32, f32): decode_i32_as_float
    if (have === FlatType.I32 && want === FlatType.F32) {
        _i32[0] = value as number;
        return _f32[0];
    }
    // (i64, i32): wrap_i64_to_i32
    if (have === FlatType.I64 && want === FlatType.I32) {
        return Number(BigInt.asUintN(32, value as bigint));
    }
    // (i64, f32): wrap_i64_to_i32 then decode_i32_as_float
    if (have === FlatType.I64 && want === FlatType.F32) {
        _i32[0] = Number(BigInt.asUintN(32, value as bigint));
        return _f32[0];
    }
    // (i64, f64): decode_i64_as_float
    if (have === FlatType.I64 && want === FlatType.F64) {
        _i64[0] = value as bigint;
        return _f64[0];
    }
    return value;
}

// --- Enum lowering ---

function createEnumLowering(_rctx: ResolvedContext, enumModel: ComponentTypeDefinedEnum): LoweringToJs {
    const fn = (_ctx: BindingContext, ...args: WasmValue[]) => {
        const disc = args[0] as number;
        if (disc >= enumModel.members.length) throw new Error(`Invalid enum discriminant: ${disc} >= ${enumModel.members.length}`);
        return enumModel.members[disc];
    };
    fn.spill = 1;
    return fn;
}

// --- Flags lowering ---

function createFlagsLowering(_rctx: ResolvedContext, flagsModel: ComponentTypeDefinedFlags): LoweringToJs {
    const wordCount = Math.max(1, Math.ceil(flagsModel.members.length / 32));
    const memberNames = flagsModel.members.map(m => camelCase(m));

    const fn = (_ctx: BindingContext, ...args: WasmValue[]) => {
        const result: Record<string, boolean> = {};
        for (let i = 0; i < memberNames.length; i++) {
            const word = args[i >>> 5] as number;
            result[memberNames[i]] = !!(word & (1 << (i & 31)));
        }
        return result;
    };
    fn.spill = wordCount;
    return fn;
}

// --- Tuple lowering ---

function createTupleLowering(rctx: ResolvedContext, tupleModel: ComponentTypeDefinedTuple): LoweringToJs {
    const elementLowerers = tupleModel.members.map(m => createLowering(rctx, m));

    let totalSpill = 0;
    for (const l of elementLowerers) totalSpill += (l as any).spill;

    const fn = (ctx: BindingContext, ...args: WasmValue[]) => {
        const result = new Array(elementLowerers.length);
        let offset = 0;
        for (let i = 0; i < elementLowerers.length; i++) {
            const spill = (elementLowerers[i] as any).spill;
            result[i] = elementLowerers[i](ctx, ...args.slice(offset, offset + spill));
            offset += spill;
        }
        return result;
    };
    fn.spill = totalSpill;
    return fn;
}

// --- Resource handle lowering ---

function createOwnLowering(rctx: ResolvedContext, ownModel: ComponentTypeDefinedOwn): LoweringToJs {
    const resourceTypeIdx = getCanonicalResourceId(rctx, ownModel.value);
    jsco_assert(typeof resourceTypeIdx === 'number' && resourceTypeIdx >= 0,
        () => `Invalid canonical resource ID ${resourceTypeIdx} for own<${ownModel.value}>`);
    const fn = (ctx: BindingContext, ...args: WasmValue[]) => {
        const handle = args[0] as number;
        return ctx.resources.remove(resourceTypeIdx, handle);
    };
    fn.spill = 1;
    return fn;
}

function createBorrowLowering(rctx: ResolvedContext, borrowModel: ComponentTypeDefinedBorrow): LoweringToJs {
    const resourceTypeIdx = getCanonicalResourceId(rctx, borrowModel.value);
    jsco_assert(typeof resourceTypeIdx === 'number' && resourceTypeIdx >= 0,
        () => `Invalid canonical resource ID ${resourceTypeIdx} for borrow<${borrowModel.value}>`);
    // Canonical ABI: lift_borrow — if cx.inst is t.rt.impl (own-instance resource),
    // the value is already the rep, not a handle.
    if (rctx.ownInstanceResources.has(resourceTypeIdx)) {
        const fn = (_ctx: BindingContext, ...args: WasmValue[]) => {
            return args[0];
        };
        fn.spill = 1;
        return fn;
    }
    const fn = (ctx: BindingContext, ...args: WasmValue[]) => {
        const handle = args[0] as number;
        return ctx.resources.get(resourceTypeIdx, handle);
    };
    fn.spill = 1;
    return fn;
}
