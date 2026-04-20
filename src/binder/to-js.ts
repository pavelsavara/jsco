// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import isDebug from 'env:isDebug';
import { ComponentTypeIndex } from '../parser/model/indices';
import { ModelTag } from '../parser/model/tags';
import { ComponentTypeDefinedRecord, ComponentTypeDefinedList, ComponentTypeDefinedOption, ComponentTypeDefinedResult, ComponentTypeDefinedVariant, ComponentTypeDefinedEnum, ComponentTypeDefinedFlags, ComponentTypeDefinedTuple, ComponentTypeFunc, ComponentValType, PrimitiveValType, ComponentTypeDefinedOwn, ComponentTypeDefinedBorrow, ComponentTypeDefinedStream, ComponentTypeDefinedFuture } from '../parser/model/types';
import { BindingContext, ResolvedContext, StringEncoding } from '../resolver/types';
import { jsco_assert, LogLevel } from '../utils/assert';
import { callingConventionName } from '../utils/debug-names';
import type { ResolvedType } from '../resolver/type-resolution';
import { getCanonicalResourceId } from '../resolver/context';
import { CallingConvention, determineFunctionCallingConvention, sizeOf, alignOf, alignUp, alignOfValType, resolveValType, resolveValTypePure, deepResolveType, discriminantSize, FlatType, flattenType, flattenValType, flattenVariant } from '../resolver/calling-convention';
import { memoize } from './cache';
import { createLifting, createMemoryStorer } from './to-abi';
import { LoweringToJs, FnLoweringCallToJs, LiftingFromJs, WasmValue, WasmFunction, JsFunction } from '../marshal/model/types';
import { lowerFlatFlat, lowerFlatSpilled, lowerSpilledFlat, lowerSpilledSpilled } from '../marshal/trampoline-lower';
import type { FunctionLowerPlan } from '../marshal/trampoline-lower';
import { boolLowering, s8Lowering, u8Lowering, s16Lowering, u16Lowering, s32Lowering, u32Lowering, s64LoweringBigInt, s64LoweringNumber, u64LoweringBigInt, u64LoweringNumber, f32Lowering, f64Lowering, charLowering, stringLoweringUtf8, stringLoweringUtf16, ownLowering, borrowLowering, borrowLoweringDirect, enumLowering, flagsLowering, recordLowering, tupleLowering, listLowering, optionLowering, resultLowering, resultLoweringCoerced, variantLowering, streamLowering, futureLowering, errorContextLowering } from '../marshal/lower';
import { boolLoader, s8Loader, u8Loader, s16Loader, u16Loader, s32Loader, u32Loader, s64LoaderBigInt, s64LoaderNumber, u64LoaderBigInt, u64LoaderNumber, f32Loader, f64Loader, charLoader, stringLoaderUtf8, stringLoaderUtf16, recordLoader, listLoader, optionLoader, resultLoaderBoth, resultLoaderOkOnly, resultLoaderErrOnly, resultLoaderVoid, variantLoaderDisc1, variantLoaderDisc2, variantLoaderDisc4, enumLoaderDisc1, enumLoaderDisc2, enumLoaderDisc4, flagsLoader, tupleLoader, ownResourceLoader, borrowResourceLoader, borrowResourceDirectLoader, streamLoader, futureLoader, errorContextLoader } from '../marshal/memory-load';
import camelCase from 'just-camel-case';


export function createFunctionLowering(rctx: ResolvedContext, exportModel: ComponentTypeFunc): FnLoweringCallToJs {
    return memoize(rctx.loweringCache, exportModel, () => {
        const callingConvention = determineFunctionCallingConvention(deepResolveType(rctx, exportModel) as ComponentTypeFunc);
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
                const a = alignOf(pt);
                off = alignUp(off, a);
                spilledParamOffsets.push(off);
                off += sizeOf(pt);
            }
        }

        // Pre-allocate result buffer for flat result path (MAX_FLAT_RESULTS=1, so always 1 value)
        const resultBuf: WasmValue[] = [0];

        // Pre-compute whether the flat result is i64 (needs BigInt conversion for WASM)
        const resultFlatTypes = resultType ? flattenType(resultType) : [];
        const resultIsI64 = resultFlatTypes.length === 1 && resultFlatTypes[0] === FlatType.I64;

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
        };
        const trampoline = callingConvention.params === CallingConvention.Spilled
            ? (callingConvention.results === CallingConvention.Spilled ? lowerSpilledSpilled : lowerSpilledFlat)
            : (callingConvention.results === CallingConvention.Spilled ? lowerFlatSpilled : lowerFlatFlat);
        return (ctx: BindingContext, jsFunction: JsFunction): WasmFunction =>
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
                return createLowering(rctx, typeModel.resolved as ResolvedType);
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
            case ModelTag.ComponentTypeDefinedStream:
                return createStreamLowering(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedFuture:
                return createFutureLowering(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedErrorContext:
                return createErrorContextLowering();
            default:
                throw new Error('Not implemented');
        }
    });
}

function createBoolLowering(): LoweringToJs {
    (boolLowering as any).spill = 1;
    return boolLowering;
}

function createS8Lowering(): LoweringToJs {
    (s8Lowering as any).spill = 1;
    return s8Lowering;
}

function createU8Lowering(): LoweringToJs {
    (u8Lowering as any).spill = 1;
    return u8Lowering;
}

function createS16Lowering(): LoweringToJs {
    (s16Lowering as any).spill = 1;
    return s16Lowering;
}

function createU16Lowering(): LoweringToJs {
    (u16Lowering as any).spill = 1;
    return u16Lowering;
}

function createS32Lowering(): LoweringToJs {
    (s32Lowering as any).spill = 1;
    return s32Lowering;
}

function createU32Lowering(): LoweringToJs {
    (u32Lowering as any).spill = 1;
    return u32Lowering;
}

function createS64LoweringBigInt(): LoweringToJs {
    (s64LoweringBigInt as any).spill = 1;
    return s64LoweringBigInt;
}

function createS64LoweringNumber(): LoweringToJs {
    (s64LoweringNumber as any).spill = 1;
    return s64LoweringNumber;
}

function createU64LoweringBigInt(): LoweringToJs {
    (u64LoweringBigInt as any).spill = 1;
    return u64LoweringBigInt;
}

function createU64LoweringNumber(): LoweringToJs {
    (u64LoweringNumber as any).spill = 1;
    return u64LoweringNumber;
}

function createF32Lowering(): LoweringToJs {
    (f32Lowering as any).spill = 1;
    return f32Lowering;
}

function createF64Lowering(): LoweringToJs {
    (f64Lowering as any).spill = 1;
    return f64Lowering;
}

function createCharLowering(): LoweringToJs {
    (charLowering as any).spill = 1;
    return charLowering;
}

function createRecordLowering(rctx: ResolvedContext, recordModel: ComponentTypeDefinedRecord): LoweringToJs {
    const fields: { name: string, lowerer: LoweringToJs, spill: number }[] = [];
    for (const member of recordModel.members) {
        const lowerer = createLowering(rctx, member.type);
        fields.push({ name: camelCase(member.name), lowerer, spill: (lowerer as any).spill });
    }
    let totalSpill = 0;
    for (const fl of fields) {
        totalSpill += fl.spill;
    }
    const fn = recordLowering.bind(null, { fields });
    (fn as any).spill = totalSpill;
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
    (stringLoweringUtf8 as any).spill = 2;
    return stringLoweringUtf8;
}

function createStringLoweringUtf16(): LoweringToJs {
    (stringLoweringUtf16 as any).spill = 2;
    return stringLoweringUtf16;
}

// --- Memory load helpers (for list element loading) ---

export type MemoryLoader = (ctx: BindingContext, ptr: number) => any;

function createPrimitiveLoader(prim: PrimitiveValType, encoding: StringEncoding, usesNumberForInt64: boolean): MemoryLoader {
    switch (prim) {
        case PrimitiveValType.Bool: return boolLoader;
        case PrimitiveValType.S8: return s8Loader;
        case PrimitiveValType.U8: return u8Loader;
        case PrimitiveValType.S16: return s16Loader;
        case PrimitiveValType.U16: return u16Loader;
        case PrimitiveValType.S32: return s32Loader;
        case PrimitiveValType.U32: return u32Loader;
        case PrimitiveValType.S64: return usesNumberForInt64 ? s64LoaderNumber : s64LoaderBigInt;
        case PrimitiveValType.U64: return usesNumberForInt64 ? u64LoaderNumber : u64LoaderBigInt;
        case PrimitiveValType.Float32: return f32Loader;
        case PrimitiveValType.Float64: return f64Loader;
        case PrimitiveValType.Char: return charLoader;
        case PrimitiveValType.String:
            return encoding === StringEncoding.Utf16 ? stringLoaderUtf16 : stringLoaderUtf8;
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
                const fieldAlign = alignOf(fieldType);
                offset = alignUp(offset, fieldAlign);
                fields.push({
                    name: camelCase(member.name),
                    offset,
                    loader: createMemoryLoader(fieldType, stringEncoding, canonicalResourceIds, ownInstanceResources, usesNumberForInt64)
                });
                offset += sizeOf(fieldType);
            }
            return recordLoader.bind(null, { fields });
        }
        case ModelTag.ComponentTypeDefinedList: {
            const elemType = resolveValTypePure(type.value);
            const elemSize = sizeOf(elemType);
            const elemAlign = alignOf(elemType);
            const elemLoader = createMemoryLoader(elemType, stringEncoding, canonicalResourceIds, ownInstanceResources, usesNumberForInt64);
            return listLoader.bind(null, { elemSize, elemAlign, elemLoader });
        }
        case ModelTag.ComponentTypeDefinedOption: {
            const payloadType = resolveValTypePure(type.value);
            const payloadAlign = alignOf(payloadType);
            const payloadOffset = alignUp(1, payloadAlign);
            const payloadLoader = createMemoryLoader(payloadType, stringEncoding, canonicalResourceIds, ownInstanceResources, usesNumberForInt64);
            return optionLoader.bind(null, { payloadOffset, payloadLoader });
        }
        case ModelTag.ComponentTypeDefinedResult: {
            let payloadAlign = 1;
            if (type.ok !== undefined) payloadAlign = Math.max(payloadAlign, alignOfValType(type.ok));
            if (type.err !== undefined) payloadAlign = Math.max(payloadAlign, alignOfValType(type.err));
            const payloadOffset = alignUp(1, payloadAlign);
            const okLdr = type.ok !== undefined ? createMemoryLoader(resolveValTypePure(type.ok), stringEncoding, canonicalResourceIds, ownInstanceResources, usesNumberForInt64) : undefined;
            const errLdr = type.err !== undefined ? createMemoryLoader(resolveValTypePure(type.err), stringEncoding, canonicalResourceIds, ownInstanceResources, usesNumberForInt64) : undefined;
            const resultLoaderFn = okLdr && errLdr ? resultLoaderBoth : okLdr ? resultLoaderOkOnly : errLdr ? resultLoaderErrOnly : resultLoaderVoid;
            return resultLoaderFn.bind(null, { payloadOffset, okLoader: okLdr, errLoader: errLdr });
        }
        case ModelTag.ComponentTypeDefinedVariant: {
            const discSize = discriminantSize(type.variants.length);
            let maxPayloadAlign = 1;
            for (const c of type.variants) {
                if (c.ty !== undefined) maxPayloadAlign = Math.max(maxPayloadAlign, alignOfValType(c.ty));
            }
            const payloadOffset = alignUp(discSize, maxPayloadAlign);
            const caseLoaders = type.variants.map(c =>
                c.ty !== undefined ? createMemoryLoader(resolveValTypePure(c.ty), stringEncoding, canonicalResourceIds, ownInstanceResources, usesNumberForInt64) : undefined
            );
            const caseNames = type.variants.map(c => c.name);
            const numCases = type.variants.length;
            const variantLoaderFn = discSize === 1 ? variantLoaderDisc1 : discSize === 2 ? variantLoaderDisc2 : variantLoaderDisc4;
            return variantLoaderFn.bind(null, { payloadOffset, caseLoaders, caseNames, numCases });
        }
        case ModelTag.ComponentTypeDefinedEnum: {
            const discSize = discriminantSize(type.members.length);
            const memberNames = type.members;
            const numMembers = type.members.length;
            const enumLoaderFn = discSize === 1 ? enumLoaderDisc1 : discSize === 2 ? enumLoaderDisc2 : enumLoaderDisc4;
            return enumLoaderFn.bind(null, { memberNames, numMembers });
        }
        case ModelTag.ComponentTypeDefinedFlags: {
            const wordCount = Math.max(1, Math.ceil(type.members.length / 32));
            const memberNames = type.members.map(m => camelCase(m));
            return flagsLoader.bind(null, { wordCount, memberNames });
        }
        case ModelTag.ComponentTypeDefinedTuple: {
            const members: { offset: number, loader: MemoryLoader }[] = [];
            let offset = 0;
            for (const member of type.members) {
                const memberType = resolveValTypePure(member);
                const memberAlign = alignOf(memberType);
                offset = alignUp(offset, memberAlign);
                members.push({ offset, loader: createMemoryLoader(memberType, stringEncoding, canonicalResourceIds, ownInstanceResources, usesNumberForInt64) });
                offset += sizeOf(memberType);
            }
            return tupleLoader.bind(null, { members });
        }
        case ModelTag.ComponentTypeDefinedOwn: {
            const resourceTypeIdx = canonicalResourceIds?.get(type.value) ?? type.value;
            return ownResourceLoader.bind(null, { resourceTypeIdx });
        }
        case ModelTag.ComponentTypeDefinedBorrow: {
            const resourceTypeIdx = canonicalResourceIds?.get(type.value) ?? type.value;
            if (ownInstanceResources?.has(resourceTypeIdx)) {
                return borrowResourceDirectLoader.bind(null, { resourceTypeIdx });
            }
            return borrowResourceLoader.bind(null, { resourceTypeIdx });
        }
        case ModelTag.ComponentTypeDefinedStream:
            return streamLoader;
        case ModelTag.ComponentTypeDefinedFuture:
            return futureLoader;
        case ModelTag.ComponentTypeDefinedErrorContext:
            return errorContextLoader;
        default:
            throw new Error('createMemoryLoader not implemented for tag ' + type.tag);
    }
}

// --- List lowering ---

function createListLowering(rctx: ResolvedContext, listModel: ComponentTypeDefinedList): LoweringToJs {
    const elementType = deepResolveType(rctx, resolveValType(rctx, listModel.value));
    const elemSize = sizeOf(elementType);
    const elemAlign = alignOf(elementType);
    const elemLoader = createMemoryLoader(elementType, rctx.stringEncoding, rctx.canonicalResourceIds, rctx.ownInstanceResources, rctx.usesNumberForInt64);
    const fn = listLowering.bind(null, { elemSize, elemAlign, elemLoader });
    (fn as any).spill = 2;
    return fn;
}

// --- Option lowering ---

function createOptionLowering(rctx: ResolvedContext, optionModel: ComponentTypeDefinedOption): LoweringToJs {
    const innerLowerer = createLowering(rctx, optionModel.value);
    const innerSpill = (innerLowerer as any).spill as number;
    const fn = optionLowering.bind(null, { innerLowerer, innerSpill });
    (fn as any).spill = 1 + innerSpill;
    return fn;
}

// --- Result lowering ---

function createResultLowering(rctx: ResolvedContext, resultModel: ComponentTypeDefinedResult): LoweringToJs {
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

    const resultLoweringFn = okNeedsCoercion || errNeedsCoercion ? resultLoweringCoerced : resultLowering;
    const fn = resultLoweringFn.bind(null, { okLowerer, errLowerer, payloadJoined, okFlatTypes, errFlatTypes });
    (fn as any).spill = totalSpill;
    return fn;
}

// --- Variant lowering ---

function createVariantLowering(rctx: ResolvedContext, variantModel: ComponentTypeDefinedVariant): LoweringToJs {
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

    const fn = variantLowering.bind(null, { cases, payloadJoined });
    (fn as any).spill = totalSpill;
    return fn;
}

// --- Enum lowering ---

function createEnumLowering(_rctx: ResolvedContext, enumModel: ComponentTypeDefinedEnum): LoweringToJs {
    const fn = enumLowering.bind(null, { members: enumModel.members });
    (fn as any).spill = 1;
    return fn;
}

// --- Flags lowering ---

function createFlagsLowering(_rctx: ResolvedContext, flagsModel: ComponentTypeDefinedFlags): LoweringToJs {
    const wordCount = Math.max(1, Math.ceil(flagsModel.members.length / 32));
    const memberNames = flagsModel.members.map(m => camelCase(m));
    const fn = flagsLowering.bind(null, { wordCount, memberNames });
    (fn as any).spill = wordCount;
    return fn;
}

// --- Tuple lowering ---

function createTupleLowering(rctx: ResolvedContext, tupleModel: ComponentTypeDefinedTuple): LoweringToJs {
    const elements = tupleModel.members.map(m => {
        const lowerer = createLowering(rctx, m);
        return { lowerer, spill: (lowerer as any).spill as number };
    });

    let totalSpill = 0;
    for (const el of elements) totalSpill += el.spill;

    const fn = tupleLowering.bind(null, { elements });
    (fn as any).spill = totalSpill;
    return fn;
}

// --- Resource handle lowering ---

function createOwnLowering(rctx: ResolvedContext, ownModel: ComponentTypeDefinedOwn): LoweringToJs {
    const resourceTypeIdx = getCanonicalResourceId(rctx, ownModel.value);
    jsco_assert(typeof resourceTypeIdx === 'number' && resourceTypeIdx >= 0,
        () => `Invalid canonical resource ID ${resourceTypeIdx} for own<${ownModel.value}>`);
    const fn = ownLowering.bind(null, { resourceTypeIdx });
    (fn as any).spill = 1;
    return fn;
}

function createBorrowLowering(rctx: ResolvedContext, borrowModel: ComponentTypeDefinedBorrow): LoweringToJs {
    const resourceTypeIdx = getCanonicalResourceId(rctx, borrowModel.value);
    jsco_assert(typeof resourceTypeIdx === 'number' && resourceTypeIdx >= 0,
        () => `Invalid canonical resource ID ${resourceTypeIdx} for borrow<${borrowModel.value}>`);
    // Canonical ABI: lift_borrow — if cx.inst is t.rt.impl (own-instance resource),
    // the value is already the rep, not a handle.
    if (rctx.ownInstanceResources.has(resourceTypeIdx)) {
        const fn = borrowLoweringDirect.bind(null, { resourceTypeIdx });
        (fn as any).spill = 1;
        return fn;
    }
    const fn = borrowLowering.bind(null, { resourceTypeIdx });
    (fn as any).spill = 1;
    return fn;
}

// --- Stream lowering (i32 handle → JS AsyncIterable) ---

function createStreamLowering(_rctx: ResolvedContext, _streamModel: ComponentTypeDefinedStream): LoweringToJs {
    const fn = streamLowering;
    (fn as any).spill = 1;
    return fn;
}

// --- Future lowering (i32 handle → JS Promise) ---

function createFutureLowering(_rctx: ResolvedContext, _futureModel: ComponentTypeDefinedFuture): LoweringToJs {
    const fn = futureLowering;
    (fn as any).spill = 1;
    return fn;
}

// --- Error-context lowering (i32 handle → JS Error) ---

function createErrorContextLowering(): LoweringToJs {
    const fn = errorContextLowering;
    (fn as any).spill = 1;
    return fn;
}
