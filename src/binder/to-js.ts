// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import isDebug from 'env:isDebug';
import { ComponentTypeIndex } from '../parser/model/indices';
import { ModelTag } from '../parser/model/tags';
import { ComponentTypeDefinedRecord, ComponentTypeDefinedList, ComponentTypeDefinedOption, ComponentTypeDefinedResult, ComponentTypeDefinedVariant, ComponentTypeDefinedEnum, ComponentTypeDefinedFlags, ComponentTypeDefinedTuple, ComponentTypeFunc, ComponentValType, PrimitiveValType, ComponentTypeDefinedOwn, ComponentTypeDefinedBorrow, ComponentTypeDefinedStream, ComponentTypeDefinedFuture } from '../parser/model/types';
import { MarshalingContext, ResolvedContext, StringEncoding } from '../resolver/types';
import { jsco_assert, LogLevel } from '../utils/assert';
import { callingConventionName } from '../utils/debug-names';
import type { ResolvedType } from '../resolver/type-resolution';
import { getCanonicalResourceId } from '../resolver/context';
import { CallingConvention, determineFunctionCallingConvention, elemSize, alignment, alignUp, alignmentValType, resolveValType, resolveValTypePure, deepResolveType, discriminantSize, flagsSize, FlatType, flattenType, flattenValType, flattenVariant } from '../resolver/calling-convention';
import { memoize } from './cache';
import { createLifting, createMemoryStorer } from './to-abi';
import { LoweringToJs, FnLoweringCallToJs, LiftingFromJs, WasmValue, WasmFunction, JsFunction } from '../marshal/model/types';
import { lowerFlatFlat, lowerFlatSpilled, lowerSpilledFlat, lowerSpilledSpilled } from '../marshal/trampoline-lower';
import type { FunctionLowerPlan } from '../marshal/trampoline-lower';
import { lowerBool, lowerS8, lowerU8, lowerS16, lowerU16, lowerS32, lowerU32, lowerS64BigInt, lowerS64Number, lowerU64BigInt, lowerU64Number, lowerF32, lowerF64, lowerChar, lowerStringUtf8, lowerStringUtf16, lowerOwn, lowerBorrow, lowerBorrowDirect, lowerEnum, lowerFlags, lowerRecord, lowerTuple, lowerList, lowerOption, lowerResult, lowerResultCoerced, lowerVariant, lowerStream, lowerFuture, lowerErrorContext } from '../marshal/lower';
import { loadBool, loadS8, loadU8, loadS16, loadU16, loadS32, loadU32, loadS64BigInt, loadS64Number, loadU64BigInt, loadU64Number, loadF32, loadF64, loadChar, loadStringUtf8, loadStringUtf16, loadRecord, loadList, loadOption, loadResultBoth, loadResultOkOnly, loadResultErrOnly, loadResultVoid, loadVariantDisc1, loadVariantDisc2, loadVariantDisc4, loadEnumDisc1, loadEnumDisc2, loadEnumDisc4, loadFlags, loadTuple, loadOwnResource, loadBorrowResource, loadBorrowResourceDirect, loadStream, loadFuture, loadErrorContext, } from '../marshal/memory-load';
import camelCase from 'just-camel-case';


export function createFunctionLowering(rctx: ResolvedContext, exportModel: ComponentTypeFunc, isAsync?: boolean): FnLoweringCallToJs {
    return memoize(rctx.loweringCache, exportModel, () => {
        const callingConvention = determineFunctionCallingConvention(deepResolveType(rctx, exportModel) as ComponentTypeFunc, isAsync);
        // Pre-resolve param/result types for spilled path — deep-resolve ensures
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
        const resultLifters: LiftingFromJs[] = [];
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
        const paramLoaders = paramResolvedTypes.map(pt => createMemoryLoader(pt, stringEncoding, canonicalResourceIds, rctx.ownInstanceResources, rctx.usesNumberForInt64));
        const resultStorer = resultType !== undefined ? createMemoryStorer(resultType, stringEncoding, canonicalResourceIds) : undefined;

        // Pre-compute spilled parameter offsets
        const spilledParamOffsets: number[] = [];
        {
            let off = 0;
            for (const pt of paramResolvedTypes) {
                const a = alignment(pt);
                off = alignUp(off, a);
                spilledParamOffsets.push(off);
                off += elemSize(pt);
            }
        }

        // Pre-allocate result buffer for flat result path (MAX_FLAT_RESULTS=1, so always 1 value)
        const resultBuf: WasmValue[] = [0];

        // Pre-compute whether the flat result is i64 (needs BigInt conversion for WASM)
        const resultFlatTypes = resultType ? flattenType(resultType) : [];
        const resultIsI64 = resultFlatTypes.length === 1 && resultFlatTypes[0] === FlatType.I64;

        // When the return type is a future or stream, the JS function returns a Promise
        // that IS the future/stream value — it should be passed to the lifter, not awaited.
        const hasFutureOrStreamReturn = resultType !== undefined && (
            resultType.tag === ModelTag.ComponentTypeDefinedFuture
            || resultType.tag === ModelTag.ComponentTypeDefinedStream
        );

        if (isDebug && (rctx.verbose?.binder ?? 0) >= LogLevel.Summary) {
            const paramNames = exportModel.params.map(p => p.name).join(', ');
            rctx.logger!('binder', LogLevel.Summary,
                `createFunctionLowering: params=[${paramNames}] count=${exportModel.params.length} results=${resultLifters.length}` +
                ` convention: params=${callingConventionName(callingConvention.params)} results=${callingConventionName(callingConvention.results)}`);
        }

        const plan: FunctionLowerPlan = {
            paramLowerers,
            paramLoaders,
            resultLifters,
            resultStorer,
            spilledParamOffsets,
            resultBuf,
            resultIsI64,
            hasFutureOrStreamReturn,
        };
        const trampoline = callingConvention.params === CallingConvention.Spilled
            ? (callingConvention.results === CallingConvention.Spilled ? lowerSpilledSpilled : lowerSpilledFlat)
            : (callingConvention.results === CallingConvention.Spilled ? lowerFlatSpilled : lowerFlatFlat);
        return (ctx: MarshalingContext, jsFunction: JsFunction): WasmFunction =>
            trampoline.bind(null, plan, ctx, jsFunction) as WasmFunction;
    });
}

export function createLowering(rctx: ResolvedContext, typeModel: ComponentValType | ResolvedType): LoweringToJs {
    return memoize(rctx.loweringCache, typeModel, () => {
        switch (typeModel.tag) {
            case ModelTag.ComponentValTypePrimitive:
            case ModelTag.ComponentTypeDefinedPrimitive:
                switch (typeModel.value) {
                    case PrimitiveValType.String:
                        return createLowerString(rctx.stringEncoding);
                    case PrimitiveValType.Bool:
                        return createLowerBool();
                    case PrimitiveValType.S8:
                        return createLowerS8();
                    case PrimitiveValType.U8:
                        return createLowerU8();
                    case PrimitiveValType.S16:
                        return createLowerS16();
                    case PrimitiveValType.U16:
                        return createLowerU16();
                    case PrimitiveValType.S32:
                        return createLowerS32();
                    case PrimitiveValType.U32:
                        return createLowerU32();
                    case PrimitiveValType.S64:
                        return rctx.usesNumberForInt64
                            ? createLowerS64Number()
                            : createLowerS64BigInt();
                    case PrimitiveValType.U64:
                        return rctx.usesNumberForInt64
                            ? createLowerU64Number()
                            : createLowerU64BigInt();
                    case PrimitiveValType.Float32:
                        return createLowerF32();
                    case PrimitiveValType.Float64:
                        return createLowerF64();
                    case PrimitiveValType.Char:
                        return createLowerChar();
                    default:
                        throw new Error('Not implemented');
                }
            case ModelTag.ComponentValTypeType: {
                const resolved = rctx.resolvedTypes.get(typeModel.value as ComponentTypeIndex);
                jsco_assert(resolved !== undefined, () => `Unresolved type at index ${typeModel.value}`);
                return createLowering(rctx, resolved!);
            }
            case ModelTag.ComponentValTypeResolved:
                return createLowering(rctx, typeModel.resolved as ResolvedType);
            case ModelTag.ComponentTypeDefinedRecord:
                return createLowerRecord(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedList:
                return createLowerList(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedOption:
                return createLowerOption(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedResult:
                return createLowerResult(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedVariant:
                return createLowerVariant(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedEnum:
                return createLowerEnum(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedFlags:
                return createLowerFlags(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedTuple:
                return createLowerTuple(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedOwn:
                return createLowerOwn(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedBorrow:
                return createLowerBorrow(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedStream:
                return createLowerStream(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedFuture:
                return createLowerFuture(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedErrorContext:
                return createLowerErrorContext();
            default:
                throw new Error('Not implemented');
        }
    });
}

function createLowerBool(): LoweringToJs {
    (lowerBool as any).spill = 1;
    return lowerBool;
}

function createLowerS8(): LoweringToJs {
    (lowerS8 as any).spill = 1;
    return lowerS8;
}

function createLowerU8(): LoweringToJs {
    (lowerU8 as any).spill = 1;
    return lowerU8;
}

function createLowerS16(): LoweringToJs {
    (lowerS16 as any).spill = 1;
    return lowerS16;
}

function createLowerU16(): LoweringToJs {
    (lowerU16 as any).spill = 1;
    return lowerU16;
}

function createLowerS32(): LoweringToJs {
    (lowerS32 as any).spill = 1;
    return lowerS32;
}

function createLowerU32(): LoweringToJs {
    (lowerU32 as any).spill = 1;
    return lowerU32;
}

function createLowerS64BigInt(): LoweringToJs {
    (lowerS64BigInt as any).spill = 1;
    return lowerS64BigInt;
}

function createLowerS64Number(): LoweringToJs {
    (lowerS64Number as any).spill = 1;
    return lowerS64Number;
}

function createLowerU64BigInt(): LoweringToJs {
    (lowerU64BigInt as any).spill = 1;
    return lowerU64BigInt;
}

function createLowerU64Number(): LoweringToJs {
    (lowerU64Number as any).spill = 1;
    return lowerU64Number;
}

function createLowerF32(): LoweringToJs {
    (lowerF32 as any).spill = 1;
    return lowerF32;
}

function createLowerF64(): LoweringToJs {
    (lowerF64 as any).spill = 1;
    return lowerF64;
}

function createLowerChar(): LoweringToJs {
    (lowerChar as any).spill = 1;
    return lowerChar;
}

function createLowerRecord(rctx: ResolvedContext, recordModel: ComponentTypeDefinedRecord): LoweringToJs {
    const fields: { name: string, lowerer: LoweringToJs, spill: number }[] = [];
    for (const member of recordModel.members) {
        const lowerer = createLowering(rctx, member.type);
        fields.push({ name: camelCase(member.name), lowerer, spill: (lowerer as any).spill });
    }
    let totalSpill = 0;
    for (const fl of fields) {
        totalSpill += fl.spill;
    }
    const fn = lowerRecord.bind(null, { fields });
    (fn as any).spill = totalSpill;
    return fn;
}

function createLowerString(encoding: StringEncoding): LoweringToJs {
    if (encoding === StringEncoding.Utf16) {
        return createLowerStringUtf16();
    }
    if (encoding === StringEncoding.CompactUtf16) {
        throw new Error('CompactUTF-16 (latin1+utf16) string encoding not yet supported');
    }
    return createLowerStringUtf8();
}

function createLowerStringUtf8(): LoweringToJs {
    (lowerStringUtf8 as any).spill = 2;
    return lowerStringUtf8;
}

function createLowerStringUtf16(): LoweringToJs {
    (lowerStringUtf16 as any).spill = 2;
    return lowerStringUtf16;
}

// --- Memory load helpers (for list element loading) ---

export type MemoryLoader = (ctx: MarshalingContext, ptr: number) => any;

function createPrimitiveLoader(prim: PrimitiveValType, encoding: StringEncoding, usesNumberForInt64: boolean): MemoryLoader {
    switch (prim) {
        case PrimitiveValType.Bool: return loadBool;
        case PrimitiveValType.S8: return loadS8;
        case PrimitiveValType.U8: return loadU8;
        case PrimitiveValType.S16: return loadS16;
        case PrimitiveValType.U16: return loadU16;
        case PrimitiveValType.S32: return loadS32;
        case PrimitiveValType.U32: return loadU32;
        case PrimitiveValType.S64: return usesNumberForInt64 ? loadS64Number : loadS64BigInt;
        case PrimitiveValType.U64: return usesNumberForInt64 ? loadU64Number : loadU64BigInt;
        case PrimitiveValType.Float32: return loadF32;
        case PrimitiveValType.Float64: return loadF64;
        case PrimitiveValType.Char: return loadChar;
        case PrimitiveValType.String:
            return encoding === StringEncoding.Utf16 ? loadStringUtf16 : loadStringUtf8;
        default:
            throw new Error('createPrimitiveLoader not implemented for ' + prim);
    }
}

export function createMemoryLoader(type: ResolvedType, stringEncoding: StringEncoding, canonicalResourceIds: Map<number, number>, ownInstanceResources: Set<number> | undefined, usesNumberForInt64: boolean): MemoryLoader {
    switch (type.tag) {
        case ModelTag.ComponentValTypePrimitive:
        case ModelTag.ComponentTypeDefinedPrimitive:
            return createPrimitiveLoader(type.value, stringEncoding, usesNumberForInt64);
        case ModelTag.ComponentTypeDefinedRecord: {
            const fields: { name: string, offset: number, loader: MemoryLoader }[] = [];
            let offset = 0;
            for (const member of type.members) {
                const fieldType = resolveValTypePure(member.type);
                const fieldAlign = alignment(fieldType);
                offset = alignUp(offset, fieldAlign);
                fields.push({
                    name: camelCase(member.name),
                    offset,
                    loader: createMemoryLoader(fieldType, stringEncoding, canonicalResourceIds, ownInstanceResources, usesNumberForInt64)
                });
                offset += elemSize(fieldType);
            }
            return loadRecord.bind(null, { fields });
        }
        case ModelTag.ComponentTypeDefinedList: {
            const elemType = resolveValTypePure(type.value);
            const elemLoader = createMemoryLoader(elemType, stringEncoding, canonicalResourceIds, ownInstanceResources, usesNumberForInt64);
            return loadList.bind(null, { elemSize: elemSize(elemType), elemAlign: alignment(elemType), elemLoader });
        }
        case ModelTag.ComponentTypeDefinedOption: {
            const payloadType = resolveValTypePure(type.value);
            const payloadAlign = alignment(payloadType);
            const payloadOffset = alignUp(1, payloadAlign);
            const payloadLoader = createMemoryLoader(payloadType, stringEncoding, canonicalResourceIds, ownInstanceResources, usesNumberForInt64);
            return loadOption.bind(null, { payloadOffset, payloadLoader });
        }
        case ModelTag.ComponentTypeDefinedResult: {
            let payloadAlign = 1;
            if (type.ok !== undefined) payloadAlign = Math.max(payloadAlign, alignmentValType(type.ok));
            if (type.err !== undefined) payloadAlign = Math.max(payloadAlign, alignmentValType(type.err));
            const payloadOffset = alignUp(1, payloadAlign);
            const okLdr = type.ok !== undefined ? createMemoryLoader(resolveValTypePure(type.ok), stringEncoding, canonicalResourceIds, ownInstanceResources, usesNumberForInt64) : undefined;
            const errLdr = type.err !== undefined ? createMemoryLoader(resolveValTypePure(type.err), stringEncoding, canonicalResourceIds, ownInstanceResources, usesNumberForInt64) : undefined;
            const resultLoaderFn = okLdr && errLdr ? loadResultBoth : okLdr ? loadResultOkOnly : errLdr ? loadResultErrOnly : loadResultVoid;
            return resultLoaderFn.bind(null, { payloadOffset, okLoader: okLdr, errLoader: errLdr });
        }
        case ModelTag.ComponentTypeDefinedVariant: {
            const discSize = discriminantSize(type.variants.length);
            let maxPayloadAlign = 1;
            for (const c of type.variants) {
                if (c.ty !== undefined) maxPayloadAlign = Math.max(maxPayloadAlign, alignmentValType(c.ty));
            }
            const payloadOffset = alignUp(discSize, maxPayloadAlign);
            const caseLoaders = type.variants.map(c =>
                c.ty !== undefined ? createMemoryLoader(resolveValTypePure(c.ty), stringEncoding, canonicalResourceIds, ownInstanceResources, usesNumberForInt64) : undefined
            );
            const caseNames = type.variants.map(c => c.name);
            const numCases = type.variants.length;
            const variantLoaderFn = discSize === 1 ? loadVariantDisc1 : discSize === 2 ? loadVariantDisc2 : loadVariantDisc4;
            return variantLoaderFn.bind(null, { payloadOffset, caseLoaders, caseNames, numCases });
        }
        case ModelTag.ComponentTypeDefinedEnum: {
            const discSize = discriminantSize(type.members.length);
            const memberNames = type.members;
            const numMembers = type.members.length;
            const enumLoaderFn = discSize === 1 ? loadEnumDisc1 : discSize === 2 ? loadEnumDisc2 : loadEnumDisc4;
            return enumLoaderFn.bind(null, { memberNames, numMembers });
        }
        case ModelTag.ComponentTypeDefinedFlags: {
            const byteSize = flagsSize(type.members.length);
            const memberNames = type.members.map(m => camelCase(m));
            return loadFlags.bind(null, { byteSize, memberNames });
        }
        case ModelTag.ComponentTypeDefinedTuple: {
            const members: { offset: number, loader: MemoryLoader }[] = [];
            let offset = 0;
            for (const member of type.members) {
                const memberType = resolveValTypePure(member);
                const memberAlign = alignment(memberType);
                offset = alignUp(offset, memberAlign);
                members.push({ offset, loader: createMemoryLoader(memberType, stringEncoding, canonicalResourceIds, ownInstanceResources, usesNumberForInt64) });
                offset += elemSize(memberType);
            }
            return loadTuple.bind(null, { members });
        }
        case ModelTag.ComponentTypeDefinedOwn: {
            const resourceTypeIdx = canonicalResourceIds?.get(type.value) ?? type.value;
            return loadOwnResource.bind(null, { resourceTypeIdx });
        }
        case ModelTag.ComponentTypeDefinedBorrow: {
            const resourceTypeIdx = canonicalResourceIds?.get(type.value) ?? type.value;
            if (ownInstanceResources?.has(resourceTypeIdx)) {
                return loadBorrowResourceDirect.bind(null, { resourceTypeIdx });
            }
            return loadBorrowResource.bind(null, { resourceTypeIdx });
        }
        case ModelTag.ComponentTypeDefinedStream:
            return loadStream;
        case ModelTag.ComponentTypeDefinedFuture:
            return loadFuture;
        case ModelTag.ComponentTypeDefinedErrorContext:
            return loadErrorContext;
        default:
            throw new Error('createMemoryLoader not implemented for tag ' + type.tag);
    }
}

// --- List lowering ---

function createLowerList(rctx: ResolvedContext, listModel: ComponentTypeDefinedList): LoweringToJs {
    const elementType = deepResolveType(rctx, resolveValType(rctx, listModel.value));
    const elemLoader = createMemoryLoader(elementType, rctx.stringEncoding, rctx.canonicalResourceIds, rctx.ownInstanceResources, rctx.usesNumberForInt64);
    const fn = lowerList.bind(null, { elemSize: elemSize(elementType), elemAlign: alignment(elementType), elemLoader });
    (fn as any).spill = 2;
    return fn;
}

// --- Option lowering ---

function createLowerOption(rctx: ResolvedContext, optionModel: ComponentTypeDefinedOption): LoweringToJs {
    const innerLowerer = createLowering(rctx, optionModel.value);
    const innerSpill = (innerLowerer as any).spill as number;
    const fn = lowerOption.bind(null, { innerLowerer, innerSpill });
    (fn as any).spill = 1 + innerSpill;
    return fn;
}

// --- Result lowering ---

function createLowerResult(rctx: ResolvedContext, resultModel: ComponentTypeDefinedResult): LoweringToJs {
    const okLowerer = resultModel.ok ? createLowering(rctx, resultModel.ok) : undefined;
    const errLowerer = resultModel.err ? createLowering(rctx, resultModel.err) : undefined;

    const resolved = deepResolveType(rctx, resultModel) as ComponentTypeDefinedResult;
    const joinedFlatTypes = flattenType(resolved);
    const payloadJoined = joinedFlatTypes.slice(1);
    const totalSpill = joinedFlatTypes.length;

    const okFlatTypes = resolved.ok ? flattenValType(resolved.ok) : [];
    const errFlatTypes = resolved.err ? flattenValType(resolved.err) : [];
    const okNeedsCoercion = okFlatTypes.some((ct, i) => ct !== payloadJoined[i]);
    const errNeedsCoercion = errFlatTypes.some((ct, i) => ct !== payloadJoined[i]);

    const resultLoweringFn = okNeedsCoercion || errNeedsCoercion ? lowerResultCoerced : lowerResult;
    const fn = resultLoweringFn.bind(null, { okLowerer, errLowerer, payloadJoined, okFlatTypes, errFlatTypes });
    (fn as any).spill = totalSpill;
    return fn;
}

// --- Variant lowering ---

function createLowerVariant(rctx: ResolvedContext, variantModel: ComponentTypeDefinedVariant): LoweringToJs {
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

    const fn = lowerVariant.bind(null, { cases, payloadJoined });
    (fn as any).spill = totalSpill;
    return fn;
}

// --- Enum lowering ---

function createLowerEnum(_rctx: ResolvedContext, enumModel: ComponentTypeDefinedEnum): LoweringToJs {
    const fn = lowerEnum.bind(null, { members: enumModel.members });
    (fn as any).spill = 1;
    return fn;
}

// --- Flags lowering ---

function createLowerFlags(_rctx: ResolvedContext, flagsModel: ComponentTypeDefinedFlags): LoweringToJs {
    const wordCount = Math.max(1, Math.ceil(flagsModel.members.length / 32));
    const memberNames = flagsModel.members.map(m => camelCase(m));
    const fn = lowerFlags.bind(null, { wordCount, memberNames });
    (fn as any).spill = wordCount;
    return fn;
}

// --- Tuple lowering ---

function createLowerTuple(rctx: ResolvedContext, tupleModel: ComponentTypeDefinedTuple): LoweringToJs {
    const elements = tupleModel.members.map(m => {
        const lowerer = createLowering(rctx, m);
        return { lowerer, spill: (lowerer as any).spill as number };
    });

    let totalSpill = 0;
    for (const el of elements) totalSpill += el.spill;

    const fn = lowerTuple.bind(null, { elements });
    (fn as any).spill = totalSpill;
    return fn;
}

// --- Resource handle lowering ---

function createLowerOwn(rctx: ResolvedContext, ownModel: ComponentTypeDefinedOwn): LoweringToJs {
    const resourceTypeIdx = getCanonicalResourceId(rctx, ownModel.value);
    jsco_assert(typeof resourceTypeIdx === 'number' && resourceTypeIdx >= 0,
        () => `Invalid canonical resource ID ${resourceTypeIdx} for own<${ownModel.value}>`);
    const fn = lowerOwn.bind(null, { resourceTypeIdx });
    (fn as any).spill = 1;
    return fn;
}

function createLowerBorrow(rctx: ResolvedContext, borrowModel: ComponentTypeDefinedBorrow): LoweringToJs {
    const resourceTypeIdx = getCanonicalResourceId(rctx, borrowModel.value);
    jsco_assert(typeof resourceTypeIdx === 'number' && resourceTypeIdx >= 0,
        () => `Invalid canonical resource ID ${resourceTypeIdx} for borrow<${borrowModel.value}>`);
    // Canonical ABI: lift_borrow — if cx.inst is t.rt.impl (own-instance resource),
    // the value is already the rep, not a handle.
    if (rctx.ownInstanceResources.has(resourceTypeIdx)) {
        const fn = lowerBorrowDirect.bind(null, { resourceTypeIdx });
        (fn as any).spill = 1;
        return fn;
    }
    const fn = lowerBorrow.bind(null, { resourceTypeIdx });
    (fn as any).spill = 1;
    return fn;
}

// --- Stream lowering (i32 handle → JS AsyncIterable) ---

function createLowerStream(_rctx: ResolvedContext, _streamModel: ComponentTypeDefinedStream): LoweringToJs {
    const fn = lowerStream;
    (fn as any).spill = 1;
    return fn;
}

// --- Future lowering (i32 handle → JS Promise) ---

function createLowerFuture(_rctx: ResolvedContext, _futureModel: ComponentTypeDefinedFuture): LoweringToJs {
    const fn = lowerFuture;
    (fn as any).spill = 1;
    return fn;
}

// --- Error-context lowering (i32 handle → JS Error) ---

function createLowerErrorContext(): LoweringToJs {
    const fn = lowerErrorContext;
    (fn as any).spill = 1;
    return fn;
}
