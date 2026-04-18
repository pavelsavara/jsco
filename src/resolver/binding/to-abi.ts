// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import isDebug from 'env:isDebug';
import { ComponentTypeIndex } from '../../model/indices';
import { ModelTag } from '../../model/tags';
import { ComponentTypeDefinedRecord, ComponentTypeDefinedList, ComponentTypeDefinedOption, ComponentTypeDefinedResult, ComponentTypeDefinedVariant, ComponentTypeDefinedEnum, ComponentTypeDefinedFlags, ComponentTypeDefinedTuple, ComponentTypeFunc, ComponentValType, PrimitiveValType, ComponentTypeDefinedOwn, ComponentTypeDefinedBorrow, ComponentTypeDefinedStream, ComponentTypeDefinedFuture } from '../../model/types';
import { BindingContext, ResolvedContext, StringEncoding } from '../types';
import { jsco_assert, LogLevel } from '../../utils/assert';
import { callingConventionName } from '../../utils/debug-names';
import type { ResolvedType } from '../type-resolution';
import { getCanonicalResourceId } from '../context';
import { CallingConvention, determineFunctionCallingConvention, sizeOf, alignOf, alignUp, flatCount, alignOfValType, resolveValType, resolveValTypePure, deepResolveType, discriminantSize, FlatType, flattenType, flattenValType, flattenVariant } from '../calling-convention';
import { memoize } from './cache';
import { createLowering, createMemoryLoader } from './to-js';
import { LiftingFromJs, WasmPointer, FnLiftingCallFromJs, JsFunction, WasmSize, WasmValue, WasmFunction, JsValue } from './types';
import { validateAllocResult, checkNotPoisoned, checkNotReentrant } from './validation';
import { bigIntReplacer } from '../../utils/shared';
import { boolLifting, s8Lifting, u8Lifting, s16Lifting, u16Lifting, s32Lifting, u32Lifting, s64LiftingNumber, s64LiftingBigInt, u64LiftingNumber, u64LiftingBigInt, f32Lifting, f64Lifting, charLifting, stringLiftingUtf8, stringLiftingUtf16, ownLifting, borrowLifting, borrowLiftingDirect, enumLifting, flagsLifting, recordLifting, tupleLifting, listLifting, optionLifting, resultLifting, variantLifting, streamLifting, futureLifting, errorContextLifting } from '../../execute/lift';
import camelCase from 'just-camel-case';
import { TAG, VAL, OK, ERR } from '../../utils/constants';


export function createFunctionLifting(rctx: ResolvedContext, importModel: ComponentTypeFunc): FnLiftingCallFromJs {
    return memoize(rctx.liftingCache, importModel, () => {
        const callingConvention = determineFunctionCallingConvention(deepResolveType(rctx, importModel) as ComponentTypeFunc);
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
                resultType = deepResolveType(rctx, resolveValType(rctx, importModel.results.type));
            }
        }

        // Pre-resolve param types for spilled path — deep-resolve ensures
        const paramResolvedTypes = importModel.params.map(p => deepResolveType(rctx, resolveValType(rctx, p.type)));

        // Pre-capture rctx properties needed at call time — after this, rctx is not captured
        const stringEncoding = rctx.stringEncoding;
        const canonicalResourceIds = rctx.canonicalResourceIds;

        // Pre-create memory storers/loader for spilled calling convention
        const paramStorers = paramResolvedTypes.map(pt => createMemoryStorer(pt, stringEncoding, canonicalResourceIds, rctx.ownInstanceResources));
        const resultLoader = resultType !== undefined ? createMemoryLoader(resultType, stringEncoding, canonicalResourceIds, rctx.ownInstanceResources, rctx.usesNumberForInt64) : undefined;
        if (callingConvention.results === CallingConvention.Spilled && !resultLoader) {
            throw new Error('Spilled calling convention for results requires a result type (named multi-value results not yet supported)');
        }

        // Pre-compute spilled parameter offsets, total size, and max alignment
        const spilledParamOffsets: number[] = [];
        let spilledParamsTotalSize = 0;
        let spilledParamsMaxAlign = 1;
        for (const pt of paramResolvedTypes) {
            const a = alignOf(pt);
            spilledParamsTotalSize = alignUp(spilledParamsTotalSize, a);
            spilledParamOffsets.push(spilledParamsTotalSize);
            spilledParamsTotalSize += sizeOf(pt);
            spilledParamsMaxAlign = Math.max(spilledParamsMaxAlign, a);
        }
        const totalFlatParams = paramResolvedTypes.reduce((sum, pt) => sum + flatCount(pt), 0);

        // Pre-compute which flat positions are i64 for BigInt conversion at WASM call site
        const i64ParamPositions: number[] = [];
        {
            let pos = 0;
            for (const pt of paramResolvedTypes) {
                const ft = flattenType(pt);
                for (let j = 0; j < ft.length; j++) {
                    if (ft[j] === FlatType.I64) i64ParamPositions.push(pos);
                    pos++;
                }
            }
        }

        if (isDebug && (rctx.verbose?.binder ?? 0) >= LogLevel.Summary) {
            const paramNames = importModel.params.map(p => p.name).join(', ');
            rctx.logger!('binder', LogLevel.Summary,
                `createFunctionLifting: params=[${paramNames}] count=${importModel.params.length} results=${resultLowerers.length}` +
                ` convention: params=${callingConventionName(callingConvention.params)} results=${callingConventionName(callingConvention.results)}` +
                ` flatParams=${totalFlatParams} spilledSize=${spilledParamsTotalSize}`);
        }

        return (ctx: BindingContext, wasmFunction: WasmFunction): JsFunction => {
            function processWasmResult(rawWasm: any): any {
                let result: any;
                if (callingConvention.results === CallingConvention.Spilled) {
                    result = resultLoader!(ctx, rawWasm as number);
                } else if (resultLowerers.length === 1) {
                    result = resultLowerers[0]!(ctx, rawWasm);
                }

                // Post-return cleanup
                if (ctx.postReturnFn) {
                    ctx.postReturnFn();
                    ctx.postReturnFn = undefined;
                }

                if (isDebug && (ctx.verbose?.executor ?? 0) >= LogLevel.Summary) {
                    ctx.logger!('executor', LogLevel.Summary, `← lifting result=${JSON.stringify(result, bigIntReplacer)}`);
                }
                return result;
            }

            function liftingTrampoline(...args: any[]): any {
                // C4: Runtime behavioral guarantees
                checkNotPoisoned(ctx);
                checkNotReentrant(ctx);
                ctx.inExport = true;
                if (isDebug && (ctx.verbose?.executor ?? 0) >= LogLevel.Summary) {
                    ctx.logger!('executor', LogLevel.Summary, `→ lifting args=${JSON.stringify(args, bigIntReplacer)}`);
                }
                try {
                    if (args.length !== paramStorers.length) {
                        throw new Error(`Expected ${paramStorers.length} arguments, got ${args.length}`);
                    }
                    let wasmArgs: any[];
                    if (callingConvention.params === CallingConvention.Spilled) {
                        // Spill: store all params to memory, pass single pointer
                        const ptr = ctx.allocator.realloc(0 as WasmPointer, 0 as WasmSize,
                            spilledParamsMaxAlign as WasmSize, spilledParamsTotalSize as WasmSize);
                        validateAllocResult(ctx, ptr, spilledParamsMaxAlign, spilledParamsTotalSize);
                        for (let i = 0; i < paramStorers.length; i++) {
                            paramStorers[i]!(ctx, ptr + spilledParamOffsets[i]!, args[i]);
                        }
                        wasmArgs = [ptr];
                    } else {
                        // Flat/Scalar: spread as individual args
                        wasmArgs = new Array(totalFlatParams);
                        let pos = 0;
                        for (let i = 0; i < paramLifters.length; i++) {
                            pos += paramLifters[i]!(ctx, args[i], wasmArgs, pos);
                        }
                        // Convert i64 flat slots to BigInt for WASM
                        for (let k = 0; k < i64ParamPositions.length; k++) {
                            const idx = i64ParamPositions[k]!;
                            if (typeof wasmArgs[idx] !== 'bigint') {
                                wasmArgs[idx] = BigInt(wasmArgs[idx] as number);
                            }
                        }
                    }

                    const rawResult = wasmFunction(...wasmArgs);

                    // JSPI: promising()-wrapped functions return a Promise even for
                    // synchronous completions. Defer result processing to its resolution.
                    if (rawResult instanceof Promise) {
                        return rawResult.then(
                            (wasmResult) => {
                                try {
                                    return processWasmResult(wasmResult);
                                } catch (e) {
                                    ctx.poisoned = true;
                                    throw e;
                                } finally {
                                    ctx.inExport = false;
                                }
                            },
                            (e: unknown) => {
                                ctx.poisoned = true;
                                ctx.inExport = false;
                                throw e;
                            },
                        );
                    }

                    return processWasmResult(rawResult);
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


export function createLifting(rctx: ResolvedContext, typeModel: ComponentValType | ResolvedType): LiftingFromJs {
    return memoize(rctx.liftingCache, typeModel, () => {
        switch (typeModel.tag) {
            case ModelTag.ComponentValTypePrimitive:
            case ModelTag.ComponentTypeDefinedPrimitive:
                switch (typeModel.value) {
                    case PrimitiveValType.String:
                        return createStringLifting(rctx.stringEncoding);
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
            case ModelTag.ComponentValTypeResolved:
                return createLifting(rctx, typeModel.resolved as ResolvedType);
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
            case ModelTag.ComponentTypeDefinedStream:
                return createStreamLifting(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedFuture:
                return createFutureLifting(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedErrorContext:
                return createErrorContextLifting();
            default:
                throw new Error('Not implemented ' + typeModel.tag);
        }
    });
}

function createRecordLifting(rctx: ResolvedContext, recordModel: ComponentTypeDefinedRecord): LiftingFromJs {
    const fields: { name: string, lifter: LiftingFromJs }[] = [];
    for (const member of recordModel.members) {
        const lifter = createLifting(rctx, member.type);
        fields.push({ name: camelCase(member.name), lifter });
    }
    return recordLifting.bind(null, { fields });
}

function createBoolLifting(): LiftingFromJs {
    return boolLifting;
}

function createS8Lifting(): LiftingFromJs {
    return s8Lifting;
}

function createU8Lifting(): LiftingFromJs {
    return u8Lifting;
}

function createS16Lifting(): LiftingFromJs {
    return s16Lifting;
}

function createU16Lifting(): LiftingFromJs {
    return u16Lifting;
}

function createS32Lifting(): LiftingFromJs {
    return s32Lifting;
}

function createU32Lifting(): LiftingFromJs {
    return u32Lifting;
}

function createS64LiftingNumber(): LiftingFromJs {
    return s64LiftingNumber;
}

function createS64LiftingBigInt(): LiftingFromJs {
    return s64LiftingBigInt;
}

function createU64LiftingNumber(): LiftingFromJs {
    return u64LiftingNumber;
}

function createU64LiftingBigInt(): LiftingFromJs {
    return u64LiftingBigInt;
}

function createF32Lifting(): LiftingFromJs {
    return f32Lifting;
}

function createF64Lifting(): LiftingFromJs {
    return f64Lifting;
}

function createCharLifting(): LiftingFromJs {
    return charLifting;
}

function createStringLifting(encoding: StringEncoding): LiftingFromJs {
    if (encoding === StringEncoding.Utf16) {
        return createStringLiftingUtf16();
    }
    if (encoding === StringEncoding.CompactUtf16) {
        throw new Error('CompactUTF-16 (latin1+utf16) string encoding not yet supported');
    }
    return createStringLiftingUtf8();
}

function createStringLiftingUtf8(): LiftingFromJs {
    return stringLiftingUtf8;
}

function createStringLiftingUtf16(): LiftingFromJs {
    return stringLiftingUtf16;
}

// --- Memory store helpers (for list element storage) ---

export type MemoryStorer = (ctx: BindingContext, ptr: number, jsValue: JsValue) => void;

function createPrimitiveStorer(prim: PrimitiveValType, encoding: StringEncoding): MemoryStorer {
    switch (prim) {
        case PrimitiveValType.Bool:
            return (ctx, ptr, val) => { ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize).setUint8(0, val ? 1 : 0); };
        case PrimitiveValType.S8:
            return (ctx, ptr, val) => { ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize).setInt8(0, val as number); };
        case PrimitiveValType.U8:
            return (ctx, ptr, val) => { ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize).setUint8(0, (val as number) & 0xFF); };
        case PrimitiveValType.S16:
            return (ctx, ptr, val) => { ctx.memory.getView(ptr as WasmPointer, 2 as WasmSize).setInt16(0, val as number, true); };
        case PrimitiveValType.U16:
            return (ctx, ptr, val) => { ctx.memory.getView(ptr as WasmPointer, 2 as WasmSize).setUint16(0, (val as number) & 0xFFFF, true); };
        case PrimitiveValType.S32:
            return (ctx, ptr, val) => { ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setInt32(0, val as number, true); };
        case PrimitiveValType.U32:
            return (ctx, ptr, val) => { ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setUint32(0, (val as number) >>> 0, true); };
        case PrimitiveValType.S64:
            return (ctx, ptr, val) => { ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize).setBigInt64(0, BigInt(val), true); };
        case PrimitiveValType.U64:
            return (ctx, ptr, val) => { ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize).setBigUint64(0, BigInt(val), true); };
        case PrimitiveValType.Float32:
            return (ctx, ptr, val) => {
                if (typeof val !== 'number') throw new TypeError(`expected a number for f32, got ${typeof val}`);
                ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setFloat32(0, val, true);
            };
        case PrimitiveValType.Float64:
            return (ctx, ptr, val) => {
                if (typeof val !== 'number') throw new TypeError(`expected a number for f64, got ${typeof val}`);
                ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize).setFloat64(0, val, true);
            };
        case PrimitiveValType.Char:
            return (ctx, ptr, val) => {
                if (typeof val !== 'string') throw new TypeError(`expected a string for char, got ${typeof val}`);
                ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setUint32(0, val.codePointAt(0)!, true);
            };
        case PrimitiveValType.String: {
            const lifter = createStringLifting(encoding);
            const tmp: WasmValue[] = [0, 0];
            return (ctx, ptr, val) => {
                lifter(ctx, val, tmp, 0);
                const dv = ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize);
                dv.setInt32(0, tmp[0] as number, true);
                dv.setInt32(4, tmp[1] as number, true);
            };
        }
        default:
            throw new Error('createPrimitiveStorer not implemented for ' + prim);
    }
}

export function createMemoryStorer(type: ResolvedType, stringEncoding: StringEncoding, canonicalResourceIds: Map<number, number>, ownInstanceResources?: Set<number>): MemoryStorer {
    switch (type.tag) {
        case ModelTag.ComponentValTypePrimitive:
        case ModelTag.ComponentTypeDefinedPrimitive:
            return createPrimitiveStorer(type.value, stringEncoding);
        case ModelTag.ComponentTypeDefinedRecord: {
            const fieldStorers: { name: string, offset: number, storer: MemoryStorer }[] = [];
            let offset = 0;
            for (const member of type.members) {
                const fieldType = resolveValTypePure(member.type);
                const fieldAlign = alignOf(fieldType);
                offset = alignUp(offset, fieldAlign);
                const storer = createMemoryStorer(fieldType, stringEncoding, canonicalResourceIds, ownInstanceResources);
                fieldStorers.push({ name: camelCase(member.name), offset, storer });
                offset += sizeOf(fieldType);
            }
            return (ctx, ptr, jsValue) => {
                if (jsValue == null || typeof jsValue !== 'object') throw new TypeError(`expected an object for record, got ${jsValue === null ? 'null' : typeof jsValue}`);
                for (let i = 0; i < fieldStorers.length; i++) {
                    const f = fieldStorers[i]!;
                    f.storer(ctx, ptr + f.offset, jsValue[f.name]);
                }
            };
        }
        case ModelTag.ComponentTypeDefinedList: {
            const elemType = resolveValTypePure(type.value);
            const elemSize = sizeOf(elemType);
            const elemAlign = alignOf(elemType);
            const elemStorer = createMemoryStorer(elemType, stringEncoding, canonicalResourceIds, ownInstanceResources);
            return (ctx, ptr, jsValue) => {
                if (jsValue == null) throw new TypeError(`expected an array for list, got ${jsValue === null ? 'null' : 'undefined'}`);
                const len = jsValue.length;
                let listPtr = 0;
                if (len > 0) {
                    const totalSize = len * elemSize;
                    listPtr = ctx.allocator.realloc(0 as WasmPointer, 0 as WasmSize, elemAlign as WasmSize, totalSize as WasmSize);
                    validateAllocResult(ctx, listPtr as WasmPointer, elemAlign, totalSize);
                    for (let i = 0; i < len; i++) {
                        elemStorer(ctx, listPtr + i * elemSize, jsValue[i]);
                    }
                }
                const dv = ctx.memory.getView(ptr as WasmPointer, 8 as WasmSize);
                dv.setInt32(0, listPtr, true);
                dv.setInt32(4, len, true);
            };
        }
        case ModelTag.ComponentTypeDefinedOption: {
            const payloadType = resolveValTypePure(type.value);
            const payloadAlign = alignOf(payloadType);
            const payloadOffset = alignUp(1, payloadAlign);
            const payloadStorer = createMemoryStorer(payloadType, stringEncoding, canonicalResourceIds, ownInstanceResources);
            return (ctx, ptr, jsValue) => {
                const dv = ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize);
                if (jsValue === null || jsValue === undefined) {
                    dv.setUint8(0, 0);
                } else {
                    dv.setUint8(0, 1);
                    payloadStorer(ctx, ptr + payloadOffset, jsValue);
                }
            };
        }
        case ModelTag.ComponentTypeDefinedResult: {
            let payloadAlign = 1;
            if (type.ok !== undefined) payloadAlign = Math.max(payloadAlign, alignOfValType(type.ok));
            if (type.err !== undefined) payloadAlign = Math.max(payloadAlign, alignOfValType(type.err));
            const payloadOffset = alignUp(1, payloadAlign);
            const okStorer = type.ok !== undefined ? createMemoryStorer(resolveValTypePure(type.ok), stringEncoding, canonicalResourceIds, ownInstanceResources) : undefined;
            const errStorer = type.err !== undefined ? createMemoryStorer(resolveValTypePure(type.err), stringEncoding, canonicalResourceIds, ownInstanceResources) : undefined;
            return (ctx, ptr, jsValue) => {
                const dv = ctx.memory.getView(ptr as WasmPointer, 1 as WasmSize);
                if (jsValue == null) throw new TypeError(`expected a result value, got ${jsValue === null ? 'null' : 'undefined'}`);
                const tag = jsValue[TAG], val = jsValue[VAL];
                if (typeof tag !== 'string') throw new TypeError(`Expected result value with 'tag' field, got ${typeof jsValue === 'object' ? JSON.stringify(jsValue) : typeof jsValue}`);
                if (tag === OK) {
                    dv.setUint8(0, 0);
                    if (okStorer) {
                        okStorer(ctx, ptr + payloadOffset, val);
                    }
                } else {
                    dv.setUint8(0, 1);
                    if (errStorer) {
                        errStorer(ctx, ptr + payloadOffset, val);
                    }
                }
            };
        }
        case ModelTag.ComponentTypeDefinedVariant: {
            const discSize = discriminantSize(type.variants.length);
            let maxPayloadAlign = 1;
            for (const c of type.variants) {
                if (c.ty !== undefined) {
                    maxPayloadAlign = Math.max(maxPayloadAlign, alignOf(resolveValTypePure(c.ty)));
                }
            }
            const payloadOffset = alignUp(discSize, maxPayloadAlign);
            const caseStorers = type.variants.map(c =>
                c.ty !== undefined ? createMemoryStorer(resolveValTypePure(c.ty), stringEncoding, canonicalResourceIds, ownInstanceResources) : undefined
            );
            const nameToIndex = new Map(type.variants.map((c, i) => [c.name, i]));
            return (ctx, ptr, jsValue) => {
                if (jsValue == null) throw new TypeError(`expected a variant value, got ${jsValue === null ? 'null' : 'undefined'}`);
                const tag = jsValue[TAG], val = jsValue[VAL];
                if (typeof tag !== 'string') throw new TypeError(`Expected variant value with 'tag' field, got ${typeof jsValue === 'object' ? JSON.stringify(jsValue) : typeof jsValue}`);
                const caseIndex = nameToIndex.get(tag);
                if (caseIndex === undefined) throw new Error(`Unknown variant case: ${tag}`);
                const dv = ctx.memory.getView(ptr as WasmPointer, discSize as WasmSize);
                if (discSize === 1) dv.setUint8(0, caseIndex);
                else if (discSize === 2) dv.setUint16(0, caseIndex, true);
                else dv.setUint32(0, caseIndex, true);
                const storer = caseStorers[caseIndex];
                if (storer && val !== undefined) {
                    storer(ctx, ptr + payloadOffset, val);
                }
            };
        }
        case ModelTag.ComponentTypeDefinedEnum: {
            const discSize = discriminantSize(type.members.length);
            const nameToIndex = new Map(type.members.map((name, i) => [name, i]));
            return (ctx, ptr, jsValue) => {
                const idx = nameToIndex.get(jsValue as string);
                if (idx === undefined) throw new Error(`Unknown enum value: ${jsValue}`);
                const dv = ctx.memory.getView(ptr as WasmPointer, discSize as WasmSize);
                if (discSize === 1) dv.setUint8(0, idx);
                else if (discSize === 2) dv.setUint16(0, idx, true);
                else dv.setUint32(0, idx, true);
            };
        }
        case ModelTag.ComponentTypeDefinedFlags: {
            const wordCount = Math.max(1, Math.ceil(type.members.length / 32));
            const memberNames = type.members.map(m => camelCase(m));
            return (ctx, ptr, jsValue) => {
                if (jsValue == null || typeof jsValue !== 'object') throw new TypeError(`expected an object for flags, got ${jsValue === null ? 'null' : typeof jsValue}`);
                const flags = jsValue as Record<string, boolean>;
                for (let w = 0; w < wordCount; w++) {
                    let word = 0;
                    for (let b = 0; b < 32 && w * 32 + b < memberNames.length; b++) {
                        if (flags[memberNames[w * 32 + b]!]) word |= (1 << b);
                    }
                    const dv = ctx.memory.getView((ptr + w * 4) as WasmPointer, 4 as WasmSize);
                    dv.setInt32(0, word, true);
                }
            };
        }
        case ModelTag.ComponentTypeDefinedTuple: {
            const memberStorers: { offset: number, storer: MemoryStorer }[] = [];
            let offset = 0;
            for (const member of type.members) {
                const memberType = resolveValTypePure(member);
                const memberAlign = alignOf(memberType);
                offset = alignUp(offset, memberAlign);
                memberStorers.push({ offset, storer: createMemoryStorer(memberType, stringEncoding, canonicalResourceIds, ownInstanceResources) });
                offset += sizeOf(memberType);
            }
            return (ctx, ptr, jsValue) => {
                if (jsValue == null) throw new TypeError(`expected an array for tuple, got ${jsValue === null ? 'null' : 'undefined'}`);
                if (jsValue.length !== memberStorers.length) {
                    throw new Error(`Expected tuple of ${memberStorers.length} elements, got ${jsValue.length}`);
                }
                for (let i = 0; i < memberStorers.length; i++) {
                    const m = memberStorers[i]!;
                    m.storer(ctx, ptr + m.offset, jsValue[i]);
                }
            };
        }
        case ModelTag.ComponentTypeDefinedOwn: {
            const resourceTypeIdx = canonicalResourceIds?.get(type.value) ?? type.value;
            return (ctx, ptr, jsValue) => {
                const handle = ctx.resources.add(resourceTypeIdx, jsValue);
                ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setInt32(0, handle, true);
            };
        }
        case ModelTag.ComponentTypeDefinedBorrow: {
            const resourceTypeIdx = canonicalResourceIds?.get(type.value) ?? type.value;
            // Canonical ABI: lower_borrow — if own-instance resource, write rep directly
            if (ownInstanceResources?.has(resourceTypeIdx)) {
                return (_ctx, ptr, jsValue) => {
                    _ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setInt32(0, jsValue as number, true);
                };
            }
            return (ctx, ptr, jsValue) => {
                const handle = ctx.resources.add(resourceTypeIdx, jsValue);
                ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setInt32(0, handle, true);
            };
        }
        case ModelTag.ComponentTypeDefinedStream: {
            return (ctx, ptr, jsValue) => {
                const handle = ctx.streams.addReadable(0, jsValue);
                ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setInt32(0, handle, true);
            };
        }
        case ModelTag.ComponentTypeDefinedFuture: {
            // Create a storer for the future's inner type so future.read can
            // encode the resolved JS value into WASM linear memory.
            let futureStorer: ((ctx: BindingContext, ptr: number, value: unknown, rejected?: boolean) => void) | undefined;
            if (type.value !== undefined) {
                const innerType = resolveValTypePure(type.value);
                const innerMemStorer = createMemoryStorer(innerType, stringEncoding, canonicalResourceIds, ownInstanceResources);
                if (innerType.tag === ModelTag.ComponentTypeDefinedResult) {
                    futureStorer = (ctx, ptr, value, rejected) => {
                        const wrapped = rejected
                            ? { [TAG]: ERR, [VAL]: value }
                            : { [TAG]: OK, [VAL]: value };
                        innerMemStorer(ctx, ptr, wrapped);
                    };
                } else {
                    futureStorer = innerMemStorer;
                }
            }
            return (ctx, ptr, jsValue) => {
                const handle = ctx.futures.addReadable(0, jsValue, futureStorer);
                ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setInt32(0, handle, true);
            };
        }
        case ModelTag.ComponentTypeDefinedErrorContext: {
            return (ctx, ptr, jsValue) => {
                const handle = ctx.errorContexts.add(jsValue);
                ctx.memory.getView(ptr as WasmPointer, 4 as WasmSize).setInt32(0, handle, true);
            };
        }
        default:
            throw new Error('createMemoryStorer not implemented for tag ' + type.tag);
    }
}

// --- List lifting ---

function createListLifting(rctx: ResolvedContext, listModel: ComponentTypeDefinedList): LiftingFromJs {
    const elementType = deepResolveType(rctx, resolveValType(rctx, listModel.value));
    const elemSize = sizeOf(elementType);
    const elemAlign = alignOf(elementType);
    const elemStorer = createMemoryStorer(elementType, rctx.stringEncoding, rctx.canonicalResourceIds, rctx.ownInstanceResources);
    return listLifting.bind(null, { elemSize, elemAlign, elemStorer });
}

// --- Option lifting ---

function createOptionLifting(rctx: ResolvedContext, optionModel: ComponentTypeDefinedOption): LiftingFromJs {
    const innerLifter = createLifting(rctx, optionModel.value);
    const innerType = resolveValType(rctx, optionModel.value);
    const innerFlatN = flatCount(deepResolveType(rctx, innerType));
    const totalSize = 1 + innerFlatN;
    return optionLifting.bind(null, { innerLifter, totalSize });
}

// --- Result lifting ---

function createResultLifting(rctx: ResolvedContext, resultModel: ComponentTypeDefinedResult): LiftingFromJs {
    const okLifter = resultModel.ok ? createLifting(rctx, resultModel.ok) : undefined;
    const errLifter = resultModel.err ? createLifting(rctx, resultModel.err) : undefined;

    const resolved = deepResolveType(rctx, resultModel) as ComponentTypeDefinedResult;
    const joinedFlatTypes = flattenType(resolved);
    const payloadJoined = joinedFlatTypes.slice(1);
    const totalSize = joinedFlatTypes.length;

    const okFlatTypes = resolved.ok ? flattenValType(resolved.ok) : [];
    const errFlatTypes = resolved.err ? flattenValType(resolved.err) : [];
    const okNeedsCoercion = okFlatTypes.some((ct, i) => ct !== payloadJoined[i]);
    const errNeedsCoercion = errFlatTypes.some((ct, i) => ct !== payloadJoined[i]);

    return resultLifting.bind(null, { okLifter, errLifter, totalSize, payloadJoined, okFlatTypes, errFlatTypes, okNeedsCoercion, errNeedsCoercion });
}

// --- Variant lifting ---

function createVariantLifting(rctx: ResolvedContext, variantModel: ComponentTypeDefinedVariant): LiftingFromJs {
    const joinedFlatTypes = flattenVariant(deepResolveType(rctx, variantModel) as ComponentTypeDefinedVariant);
    const payloadJoined = joinedFlatTypes.slice(1);
    const totalSize = joinedFlatTypes.length;

    const cases = variantModel.variants.map((c, i) => {
        const resolved = c.ty ? deepResolveType(rctx, resolveValType(rctx, c.ty)) : undefined;
        const caseFlatTypes = resolved ? flattenType(resolved) : [];
        const needsCoercion = caseFlatTypes.some((ct, si) => ct !== payloadJoined[si]);
        return {
            name: c.name,
            index: i,
            lifter: c.ty ? createLifting(rctx, c.ty) : undefined,
            caseFlatTypes,
            needsCoercion,
        };
    });
    const nameToCase = new Map(cases.map(c => [c.name, c]));

    return variantLifting.bind(null, { totalSize, payloadJoined, nameToCase });
}

// --- Enum lifting ---

function createEnumLifting(_rctx: ResolvedContext, enumModel: ComponentTypeDefinedEnum): LiftingFromJs {
    const nameToIndex = new Map(enumModel.members.map((name, i) => [name, i]));
    return enumLifting.bind(null, { nameToIndex });
}

// --- Flags lifting ---

function createFlagsLifting(_rctx: ResolvedContext, flagsModel: ComponentTypeDefinedFlags): LiftingFromJs {
    const wordCount = Math.max(1, Math.ceil(flagsModel.members.length / 32));
    const memberNames = flagsModel.members.map(m => camelCase(m));
    return flagsLifting.bind(null, { wordCount, memberNames });
}

// --- Tuple lifting ---

function createTupleLifting(rctx: ResolvedContext, tupleModel: ComponentTypeDefinedTuple): LiftingFromJs {
    const elementLifters = tupleModel.members.map(m => createLifting(rctx, m));
    return tupleLifting.bind(null, { elementLifters });
}

// --- Resource handle lifting ---

function createOwnLifting(rctx: ResolvedContext, ownModel: ComponentTypeDefinedOwn): LiftingFromJs {
    const resourceTypeIdx = getCanonicalResourceId(rctx, ownModel.value);
    jsco_assert(typeof resourceTypeIdx === 'number' && resourceTypeIdx >= 0,
        () => `Invalid canonical resource ID ${resourceTypeIdx} for own<${ownModel.value}>`);
    return ownLifting.bind(null, { resourceTypeIdx });
}

function createBorrowLifting(rctx: ResolvedContext, borrowModel: ComponentTypeDefinedBorrow): LiftingFromJs {
    const resourceTypeIdx = getCanonicalResourceId(rctx, borrowModel.value);
    jsco_assert(typeof resourceTypeIdx === 'number' && resourceTypeIdx >= 0,
        () => `Invalid canonical resource ID ${resourceTypeIdx} for borrow<${borrowModel.value}>`);
    // Canonical ABI: lower_borrow — if cx.inst is t.rt.impl (own-instance resource),
    // pass the rep directly without creating a handle.
    if (rctx.ownInstanceResources.has(resourceTypeIdx)) {
        return borrowLiftingDirect.bind(null, { resourceTypeIdx });
    }
    return borrowLifting.bind(null, { resourceTypeIdx });
}

// --- Stream lifting (JS AsyncIterable → i32 handle) ---

function createStreamLifting(_rctx: ResolvedContext, _streamModel: ComponentTypeDefinedStream): LiftingFromJs {
    return streamLifting;
}

// --- Future lifting (JS Promise → i32 handle) ---

function createFutureLifting(rctx: ResolvedContext, futureModel: ComponentTypeDefinedFuture): LiftingFromJs {
    // Create a storer for the future's inner type so future.read can
    // encode the resolved JS value into WASM linear memory.
    let storer: ((ctx: BindingContext, ptr: number, value: unknown, rejected?: boolean) => void) | undefined;
    if (futureModel.value !== undefined) {
        const innerType = deepResolveType(rctx, resolveValType(rctx, futureModel.value));
        const memStorer = createMemoryStorer(innerType, rctx.stringEncoding, rctx.canonicalResourceIds, rctx.ownInstanceResources);
        // When the inner type is a result, the CM convention maps
        // ok → Promise resolve, err → Promise reject.
        // We reconstruct the result object from the resolve/reject outcome.
        if (innerType.tag === ModelTag.ComponentTypeDefinedResult) {
            storer = (ctx, ptr, value, rejected) => {
                const wrapped = rejected
                    ? { [TAG]: ERR, [VAL]: value }
                    : { [TAG]: OK, [VAL]: value };
                memStorer(ctx, ptr, wrapped);
            };
        } else {
            storer = memStorer;
        }
    }
    return futureLifting.bind(null, { storer });
}

// --- Error-context lifting (JS Error → i32 handle) ---

function createErrorContextLifting(): LiftingFromJs {
    return errorContextLifting;
}
