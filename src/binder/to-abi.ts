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
import { CallingConvention, determineFunctionCallingConvention, elemSize, alignment, alignUp, flattenTypeCount, alignmentValType, resolveValType, resolveValTypePure, deepResolveType, discriminantSize, flagsSize, FlatType, flattenType, flattenValType, flattenVariant } from '../resolver/calling-convention';
import { memoize } from './cache';
import { createLowering, createMemoryLoader } from './to-js';
import { LiftingFromJs, FnLiftingCallFromJs, LoweringToJs, WasmFunction, JsFunction, MemoryStorer } from '../marshal/model/types';
import { liftFlatFlat, liftFlatSpilled, liftSpilledFlat, liftSpilledSpilled } from '../marshal/trampoline-lift';
import type { FunctionLiftPlan } from '../marshal/trampoline-lift';
import { liftBool, liftS8, liftU8, liftS16, liftU16, liftS32, liftU32, liftS64Number, liftS64BigInt, liftU64Number, liftU64BigInt, liftF32, liftF64, liftChar, liftStringUtf8, liftStringUtf16, liftOwn, liftBorrow, liftBorrowDirect, liftEnum, liftFlags, liftRecord, liftTuple, liftList, liftOption, liftResult, liftResultCoerced, liftVariant } from '../marshal/lift';
import { lowerStream, lowerFuture, lowerErrorContext } from '../marshal/lower';
import { storeBool, storeS8, storeU8, storeS16, storeU16, storeS32, storeU32, storeS64, storeU64, storeF32, storeF64, storeChar, storeString, storeRecord, storeList, storeOption, storeResultBoth, storeResultOkOnly, storeResultErrOnly, storeResultVoid, storeVariantDisc1, storeVariantDisc2, storeVariantDisc4, storeEnumDisc1, storeEnumDisc2, storeEnumDisc4, storeFlags, storeTuple, storeOwnResource, storeBorrowResource, storeBorrowResourceDirect, storeStream, storeFuture, storeErrorContext, createResultWrappingStorer, } from '../marshal/memory-store';
import camelCase from 'just-camel-case';

/** Memoized per-function lift plan + calling convention + binder factory. */
export type FunctionLiftingArtifacts = {
    plan: FunctionLiftPlan;
    callingConvention: import('../resolver/calling-convention').FunctionCallingConvention;
    lifter: FnLiftingCallFromJs;
};

export function createFunctionLiftingArtifacts(rctx: ResolvedContext, importModel: ComponentTypeFunc): FunctionLiftingArtifacts {
    return memoize(rctx.liftingCache, importModel, () => {
        const callingConvention = determineFunctionCallingConvention(deepResolveType(rctx, importModel) as ComponentTypeFunc);
        const paramLifters: LiftingFromJs[] = [];
        for (const param of importModel.params) {
            const lifter = createLifting(rctx, param.type);
            paramLifters.push(lifter);
        }
        const resultLowerers: LoweringToJs[] = [];
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
            const a = alignment(pt);
            spilledParamsTotalSize = alignUp(spilledParamsTotalSize, a);
            spilledParamOffsets.push(spilledParamsTotalSize);
            spilledParamsTotalSize += elemSize(pt);
            spilledParamsMaxAlign = Math.max(spilledParamsMaxAlign, a);
        }
        const totalFlatParams = paramResolvedTypes.reduce((sum, pt) => sum + flattenTypeCount(pt), 0);

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

        const plan: FunctionLiftPlan = {
            paramLifters,
            paramStorers,
            resultLowerers,
            resultLoader,
            spilledParamOffsets,
            spilledParamsTotalSize,
            spilledParamsMaxAlign,
            totalFlatParams,
            i64ParamPositions,
        };
        const trampoline = callingConvention.params === CallingConvention.Spilled
            ? (callingConvention.results === CallingConvention.Spilled ? liftSpilledSpilled : liftSpilledFlat)
            : (callingConvention.results === CallingConvention.Spilled ? liftFlatSpilled : liftFlatFlat);
        const lifter: FnLiftingCallFromJs = (ctx: MarshalingContext, wasmFunction: WasmFunction): JsFunction =>
            trampoline.bind(null, plan, ctx, wasmFunction) as JsFunction;
        return { plan, callingConvention, lifter };
    });
}

export function createFunctionLifting(rctx: ResolvedContext, importModel: ComponentTypeFunc): FnLiftingCallFromJs {
    return createFunctionLiftingArtifacts(rctx, importModel).lifter;
}


export function createLifting(rctx: ResolvedContext, typeModel: ComponentValType | ResolvedType): LiftingFromJs {
    return memoize(rctx.liftingCache, typeModel, () => {
        switch (typeModel.tag) {
            case ModelTag.ComponentValTypePrimitive:
            case ModelTag.ComponentTypeDefinedPrimitive:
                switch (typeModel.value) {
                    case PrimitiveValType.String:
                        return createLiftString(rctx.stringEncoding);
                    case PrimitiveValType.Bool:
                        return createLiftBool();
                    case PrimitiveValType.S8:
                        return createLiftS8();
                    case PrimitiveValType.U8:
                        return createLiftU8();
                    case PrimitiveValType.S16:
                        return createLiftS16();
                    case PrimitiveValType.U16:
                        return createLiftU16();
                    case PrimitiveValType.S32:
                        return createLiftS32();
                    case PrimitiveValType.U32:
                        return createLiftU32();
                    case PrimitiveValType.S64:
                        return rctx.usesNumberForInt64
                            ? createLiftS64Number()
                            : createLiftS64BigInt();
                    case PrimitiveValType.U64:
                        return rctx.usesNumberForInt64
                            ? createLiftU64Number()
                            : createLiftU64BigInt();
                    case PrimitiveValType.Float32:
                        return createLiftF32();
                    case PrimitiveValType.Float64:
                        return createLiftF64();
                    case PrimitiveValType.Char:
                        return createLiftChar();
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
                return createLiftRecord(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedList:
                return createLiftList(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedOption:
                return createLiftOption(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedResult:
                return createLiftResult(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedVariant:
                return createLiftVariant(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedEnum:
                return createLiftEnum(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedFlags:
                return createLiftFlags(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedTuple:
                return createLiftTuple(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedOwn:
                return createLiftOwn(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedBorrow:
                return createLiftBorrow(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedStream:
                return createLiftStream(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedFuture:
                return createLiftFuture(rctx, typeModel);
            case ModelTag.ComponentTypeDefinedErrorContext:
                return createLiftErrorContext();
            default:
                throw new Error('Not implemented ' + typeModel.tag);
        }
    });
}

function createLiftRecord(rctx: ResolvedContext, recordModel: ComponentTypeDefinedRecord): LiftingFromJs {
    const fields: { name: string, lifter: LiftingFromJs }[] = [];
    for (const member of recordModel.members) {
        const lifter = createLifting(rctx, member.type);
        fields.push({ name: camelCase(member.name), lifter });
    }
    return liftRecord.bind(null, { fields });
}

function createLiftBool(): LiftingFromJs {
    return liftBool;
}

function createLiftS8(): LiftingFromJs {
    return liftS8;
}

function createLiftU8(): LiftingFromJs {
    return liftU8;
}

function createLiftS16(): LiftingFromJs {
    return liftS16;
}

function createLiftU16(): LiftingFromJs {
    return liftU16;
}

function createLiftS32(): LiftingFromJs {
    return liftS32;
}

function createLiftU32(): LiftingFromJs {
    return liftU32;
}

function createLiftS64Number(): LiftingFromJs {
    return liftS64Number;
}

function createLiftS64BigInt(): LiftingFromJs {
    return liftS64BigInt;
}

function createLiftU64Number(): LiftingFromJs {
    return liftU64Number;
}

function createLiftU64BigInt(): LiftingFromJs {
    return liftU64BigInt;
}

function createLiftF32(): LiftingFromJs {
    return liftF32;
}

function createLiftF64(): LiftingFromJs {
    return liftF64;
}

function createLiftChar(): LiftingFromJs {
    return liftChar;
}

function createLiftString(encoding: StringEncoding): LiftingFromJs {
    if (encoding === StringEncoding.Utf16) {
        return createLiftStringUtf16();
    }
    if (encoding === StringEncoding.CompactUtf16) {
        throw new Error('CompactUTF-16 (latin1+utf16) string encoding not yet supported');
    }
    return createLiftStringUtf8();
}

function createLiftStringUtf8(): LiftingFromJs {
    return liftStringUtf8;
}

function createLiftStringUtf16(): LiftingFromJs {
    return liftStringUtf16;
}

// --- Memory store helpers (for list element storage) ---

function createPrimitiveStorer(prim: PrimitiveValType, encoding: StringEncoding): MemoryStorer {
    switch (prim) {
        case PrimitiveValType.Bool: return storeBool;
        case PrimitiveValType.S8: return storeS8;
        case PrimitiveValType.U8: return storeU8;
        case PrimitiveValType.S16: return storeS16;
        case PrimitiveValType.U16: return storeU16;
        case PrimitiveValType.S32: return storeS32;
        case PrimitiveValType.U32: return storeU32;
        case PrimitiveValType.S64: return storeS64;
        case PrimitiveValType.U64: return storeU64;
        case PrimitiveValType.Float32: return storeF32;
        case PrimitiveValType.Float64: return storeF64;
        case PrimitiveValType.Char: return storeChar;
        case PrimitiveValType.String:
            return storeString.bind(null, { lifter: createLiftString(encoding) });
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
            const fields: { name: string, offset: number, storer: MemoryStorer }[] = [];
            let offset = 0;
            for (const member of type.members) {
                const fieldType = resolveValTypePure(member.type);
                const fieldAlign = alignment(fieldType);
                offset = alignUp(offset, fieldAlign);
                const storer = createMemoryStorer(fieldType, stringEncoding, canonicalResourceIds, ownInstanceResources);
                fields.push({ name: camelCase(member.name), offset, storer });
                offset += elemSize(fieldType);
            }
            return storeRecord.bind(null, { fields });
        }
        case ModelTag.ComponentTypeDefinedList: {
            const elemType = resolveValTypePure(type.value);
            const elemStorer = createMemoryStorer(elemType, stringEncoding, canonicalResourceIds, ownInstanceResources);
            return storeList.bind(null, { elemSize: elemSize(elemType), elemAlign: alignment(elemType), elemStorer });
        }
        case ModelTag.ComponentTypeDefinedOption: {
            const payloadType = resolveValTypePure(type.value);
            const payloadAlign = alignment(payloadType);
            const payloadOffset = alignUp(1, payloadAlign);
            const payloadStorer = createMemoryStorer(payloadType, stringEncoding, canonicalResourceIds, ownInstanceResources);
            return storeOption.bind(null, { payloadOffset, payloadStorer });
        }
        case ModelTag.ComponentTypeDefinedResult: {
            let payloadAlign = 1;
            if (type.ok !== undefined) payloadAlign = Math.max(payloadAlign, alignmentValType(type.ok));
            if (type.err !== undefined) payloadAlign = Math.max(payloadAlign, alignmentValType(type.err));
            const payloadOffset = alignUp(1, payloadAlign);
            const okStorer = type.ok !== undefined ? createMemoryStorer(resolveValTypePure(type.ok), stringEncoding, canonicalResourceIds, ownInstanceResources) : undefined;
            const errStorer = type.err !== undefined ? createMemoryStorer(resolveValTypePure(type.err), stringEncoding, canonicalResourceIds, ownInstanceResources) : undefined;
            const resultStorerFn = okStorer && errStorer ? storeResultBoth : okStorer ? storeResultOkOnly : errStorer ? storeResultErrOnly : storeResultVoid;
            return resultStorerFn.bind(null, { payloadOffset, okStorer, errStorer });
        }
        case ModelTag.ComponentTypeDefinedVariant: {
            const discSize = discriminantSize(type.variants.length);
            let maxPayloadAlign = 1;
            for (const c of type.variants) {
                if (c.ty !== undefined) {
                    maxPayloadAlign = Math.max(maxPayloadAlign, alignment(resolveValTypePure(c.ty)));
                }
            }
            const payloadOffset = alignUp(discSize, maxPayloadAlign);
            const caseStorers = type.variants.map(c =>
                c.ty !== undefined ? createMemoryStorer(resolveValTypePure(c.ty), stringEncoding, canonicalResourceIds, ownInstanceResources) : undefined
            );
            const nameToIndex = new Map(type.variants.map((c, i) => [c.name, i]));
            const variantStorerFn = discSize === 1 ? storeVariantDisc1 : discSize === 2 ? storeVariantDisc2 : storeVariantDisc4;
            return variantStorerFn.bind(null, { payloadOffset, nameToIndex, caseStorers });
        }
        case ModelTag.ComponentTypeDefinedEnum: {
            const discSize = discriminantSize(type.members.length);
            const nameToIndex = new Map(type.members.map((name, i) => [name, i]));
            const enumStorerFn = discSize === 1 ? storeEnumDisc1 : discSize === 2 ? storeEnumDisc2 : storeEnumDisc4;
            return enumStorerFn.bind(null, { nameToIndex });
        }
        case ModelTag.ComponentTypeDefinedFlags: {
            const byteSize = flagsSize(type.members.length);
            const memberNames = type.members.map(m => camelCase(m));
            return storeFlags.bind(null, { byteSize, memberNames });
        }
        case ModelTag.ComponentTypeDefinedTuple: {
            const members: { offset: number, storer: MemoryStorer }[] = [];
            let offset = 0;
            for (const member of type.members) {
                const memberType = resolveValTypePure(member);
                const memberAlign = alignment(memberType);
                offset = alignUp(offset, memberAlign);
                members.push({ offset, storer: createMemoryStorer(memberType, stringEncoding, canonicalResourceIds, ownInstanceResources) });
                offset += elemSize(memberType);
            }
            return storeTuple.bind(null, { members });
        }
        case ModelTag.ComponentTypeDefinedOwn: {
            const resourceTypeIdx = canonicalResourceIds?.get(type.value) ?? type.value;
            return storeOwnResource.bind(null, { resourceTypeIdx });
        }
        case ModelTag.ComponentTypeDefinedBorrow: {
            const resourceTypeIdx = canonicalResourceIds?.get(type.value) ?? type.value;
            if (ownInstanceResources?.has(resourceTypeIdx)) {
                return storeBorrowResourceDirect.bind(null, { resourceTypeIdx });
            }
            return storeBorrowResource.bind(null, { resourceTypeIdx });
        }
        case ModelTag.ComponentTypeDefinedStream: {
            // Create a storer for the stream's element type so the stream table
            // can encode each JS value into WASM linear memory when read.
            let elemStorer: MemoryStorer | undefined;
            let elementSize: number | undefined;
            if (type.value !== undefined) {
                const innerType = resolveValTypePure(type.value);
                const isU8 = (innerType.tag === ModelTag.ComponentValTypePrimitive || innerType.tag === ModelTag.ComponentTypeDefinedPrimitive)
                    && innerType.value === PrimitiveValType.U8;
                if (!isU8) {
                    elemStorer = createMemoryStorer(innerType, stringEncoding, canonicalResourceIds, ownInstanceResources);
                    elementSize = elemSize(innerType);
                }
            }
            return storeStream.bind(null, { elementStorer: elemStorer, elementSize });
        }
        case ModelTag.ComponentTypeDefinedFuture: {
            // Create a storer for the future's inner type so future.read can
            // encode the resolved JS value into WASM linear memory.
            let futureInnerStorer: ((ctx: MarshalingContext, ptr: number, value: unknown, rejected?: boolean) => void) | undefined;
            if (type.value !== undefined) {
                const innerType = resolveValTypePure(type.value);
                const innerMemStorer = createMemoryStorer(innerType, stringEncoding, canonicalResourceIds, ownInstanceResources);
                futureInnerStorer = innerType.tag === ModelTag.ComponentTypeDefinedResult
                    ? createResultWrappingStorer(innerMemStorer)
                    : innerMemStorer;
            }
            return storeFuture.bind(null, { futureStorer: futureInnerStorer });
        }
        case ModelTag.ComponentTypeDefinedErrorContext:
            return storeErrorContext;
        default:
            throw new Error('createMemoryStorer not implemented for tag ' + type.tag);
    }
}

// --- List lifting ---

function createLiftList(rctx: ResolvedContext, listModel: ComponentTypeDefinedList): LiftingFromJs {
    const elementType = deepResolveType(rctx, resolveValType(rctx, listModel.value));
    const elemStorer = createMemoryStorer(elementType, rctx.stringEncoding, rctx.canonicalResourceIds, rctx.ownInstanceResources);
    return liftList.bind(null, { elemSize: elemSize(elementType), elemAlign: alignment(elementType), elemStorer });
}

// --- Option lifting ---

function createLiftOption(rctx: ResolvedContext, optionModel: ComponentTypeDefinedOption): LiftingFromJs {
    const innerLifter = createLifting(rctx, optionModel.value);
    const innerType = resolveValType(rctx, optionModel.value);
    const innerFlatN = flattenTypeCount(deepResolveType(rctx, innerType));
    const totalSize = 1 + innerFlatN;
    return liftOption.bind(null, { innerLifter, totalSize });
}

// --- Result lifting ---

function createLiftResult(rctx: ResolvedContext, resultModel: ComponentTypeDefinedResult): LiftingFromJs {
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

    const resultLiftingFn = okNeedsCoercion || errNeedsCoercion ? liftResultCoerced : liftResult;
    return resultLiftingFn.bind(null, { okLifter, errLifter, totalSize, payloadJoined, okFlatTypes, errFlatTypes });
}

// --- Variant lifting ---

function createLiftVariant(rctx: ResolvedContext, variantModel: ComponentTypeDefinedVariant): LiftingFromJs {
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

    return liftVariant.bind(null, { totalSize, payloadJoined, nameToCase });
}

// --- Enum lifting ---

function createLiftEnum(_rctx: ResolvedContext, enumModel: ComponentTypeDefinedEnum): LiftingFromJs {
    const nameToIndex = new Map(enumModel.members.map((name, i) => [name, i]));
    return liftEnum.bind(null, { nameToIndex });
}

// --- Flags lifting ---

function createLiftFlags(_rctx: ResolvedContext, flagsModel: ComponentTypeDefinedFlags): LiftingFromJs {
    const wordCount = Math.max(1, Math.ceil(flagsModel.members.length / 32));
    const memberNames = flagsModel.members.map(m => camelCase(m));
    return liftFlags.bind(null, { wordCount, memberNames });
}

// --- Tuple lifting ---

function createLiftTuple(rctx: ResolvedContext, tupleModel: ComponentTypeDefinedTuple): LiftingFromJs {
    const elementLifters = tupleModel.members.map(m => createLifting(rctx, m));
    return liftTuple.bind(null, { elementLifters });
}

// --- Resource handle lifting ---

function createLiftOwn(rctx: ResolvedContext, ownModel: ComponentTypeDefinedOwn): LiftingFromJs {
    const resourceTypeIdx = getCanonicalResourceId(rctx, ownModel.value);
    jsco_assert(typeof resourceTypeIdx === 'number' && resourceTypeIdx >= 0,
        () => `Invalid canonical resource ID ${resourceTypeIdx} for own<${ownModel.value}>`);
    return liftOwn.bind(null, { resourceTypeIdx });
}

function createLiftBorrow(rctx: ResolvedContext, borrowModel: ComponentTypeDefinedBorrow): LiftingFromJs {
    const resourceTypeIdx = getCanonicalResourceId(rctx, borrowModel.value);
    jsco_assert(typeof resourceTypeIdx === 'number' && resourceTypeIdx >= 0,
        () => `Invalid canonical resource ID ${resourceTypeIdx} for borrow<${borrowModel.value}>`);
    // Canonical ABI: lower_borrow — if cx.inst is t.rt.impl (own-instance resource),
    // pass the rep directly without creating a handle.
    if (rctx.ownInstanceResources.has(resourceTypeIdx)) {
        return liftBorrowDirect.bind(null, { resourceTypeIdx });
    }
    return liftBorrow.bind(null, { resourceTypeIdx });
}

// --- Stream lowering (JS AsyncIterable → i32 handle) ---

function createLiftStream(rctx: ResolvedContext, streamModel: ComponentTypeDefinedStream): LiftingFromJs {
    // For typed streams (non-u8), create an element storer so the stream table
    // can encode each JS value into WASM linear memory when read.
    if (streamModel.value !== undefined) {
        const innerType = deepResolveType(rctx, resolveValType(rctx, streamModel.value));
        // stream<u8> uses byte-copy fast path — no element storer needed
        const isU8 = (innerType.tag === ModelTag.ComponentValTypePrimitive || innerType.tag === ModelTag.ComponentTypeDefinedPrimitive)
            && innerType.value === PrimitiveValType.U8;
        if (!isU8) {
            const elemStorer = createMemoryStorer(innerType, rctx.stringEncoding, rctx.canonicalResourceIds, rctx.ownInstanceResources);
            const plan = { elementStorer: elemStorer, elementSize: elemSize(innerType) };
            return (ctx, srcJsValue, out, offset) => lowerStream(plan, ctx, srcJsValue, out, offset);
        }
    }
    const plan = {};
    return (ctx, srcJsValue, out, offset) => lowerStream(plan, ctx, srcJsValue, out, offset);
}

// --- Future lowering (JS Promise → i32 handle) ---

function createLiftFuture(rctx: ResolvedContext, futureModel: ComponentTypeDefinedFuture): LiftingFromJs {
    // Create a storer for the future's inner type so future.read can
    // encode the resolved JS value into WASM linear memory.
    let storer: ((ctx: MarshalingContext, ptr: number, value: unknown, rejected?: boolean) => void) | undefined;
    if (futureModel.value !== undefined) {
        const innerType = deepResolveType(rctx, resolveValType(rctx, futureModel.value));
        const memStorer = createMemoryStorer(innerType, rctx.stringEncoding, rctx.canonicalResourceIds, rctx.ownInstanceResources);
        // When the inner type is a result, the CM convention maps
        // ok → Promise resolve, err → Promise reject.
        // We reconstruct the result object from the resolve/reject outcome.
        storer = innerType.tag === ModelTag.ComponentTypeDefinedResult
            ? createResultWrappingStorer(memStorer)
            : memStorer;
    }
    return lowerFuture.bind(null, { storer });
}

// --- Error-context lowering (JS Error → i32 handle) ---

function createLiftErrorContext(): LiftingFromJs {
    return lowerErrorContext;
}
