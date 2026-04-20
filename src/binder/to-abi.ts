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
import { CallingConvention, determineFunctionCallingConvention, sizeOf, alignOf, alignUp, flatCount, alignOfValType, resolveValType, resolveValTypePure, deepResolveType, discriminantSize, FlatType, flattenType, flattenValType, flattenVariant } from '../resolver/calling-convention';
import { memoize } from './cache';
import { createLowering, createMemoryLoader } from './to-js';
import { LiftingFromJs, FnLiftingCallFromJs, LoweringToJs, JsValue, WasmFunction, JsFunction } from '../marshal/types';
import { liftFlatFlat, liftFlatSpilled, liftSpilledFlat, liftSpilledSpilled } from '../marshal/trampoline-lift';
import type { FunctionLiftPlan } from '../marshal/trampoline-lift';
import { boolLifting, s8Lifting, u8Lifting, s16Lifting, u16Lifting, s32Lifting, u32Lifting, s64LiftingNumber, s64LiftingBigInt, u64LiftingNumber, u64LiftingBigInt, f32Lifting, f64Lifting, charLifting, stringLiftingUtf8, stringLiftingUtf16, ownLifting, borrowLifting, borrowLiftingDirect, enumLifting, flagsLifting, recordLifting, tupleLifting, listLifting, optionLifting, resultLifting, resultLiftingCoerced, variantLifting, streamLifting, futureLifting, errorContextLifting } from '../marshal/lift';
import { boolStorer, s8Storer, u8Storer, s16Storer, u16Storer, s32Storer, u32Storer, s64Storer, u64Storer, f32Storer, f64Storer, charStorer, stringStorer, recordStorer, listStorer, optionStorer, resultStorerBoth, resultStorerOkOnly, resultStorerErrOnly, resultStorerVoid, variantStorerDisc1, variantStorerDisc2, variantStorerDisc4, enumStorerDisc1, enumStorerDisc2, enumStorerDisc4, flagsStorer, tupleStorer, ownResourceStorer, borrowResourceStorer, borrowResourceDirectStorer, streamStorer, futureMemStorer, errorContextStorer } from '../marshal/memory-store';
import camelCase from 'just-camel-case';
import { TAG, VAL, OK, ERR } from '../utils/constants';


export function createFunctionLifting(rctx: ResolvedContext, importModel: ComponentTypeFunc): FnLiftingCallFromJs {
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
        return (ctx: BindingContext, wasmFunction: WasmFunction): JsFunction =>
            trampoline.bind(null, plan, ctx, wasmFunction) as JsFunction;
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
        case PrimitiveValType.Bool: return boolStorer;
        case PrimitiveValType.S8: return s8Storer;
        case PrimitiveValType.U8: return u8Storer;
        case PrimitiveValType.S16: return s16Storer;
        case PrimitiveValType.U16: return u16Storer;
        case PrimitiveValType.S32: return s32Storer;
        case PrimitiveValType.U32: return u32Storer;
        case PrimitiveValType.S64: return s64Storer;
        case PrimitiveValType.U64: return u64Storer;
        case PrimitiveValType.Float32: return f32Storer;
        case PrimitiveValType.Float64: return f64Storer;
        case PrimitiveValType.Char: return charStorer;
        case PrimitiveValType.String:
            return stringStorer.bind(null, { lifter: createStringLifting(encoding) });
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
                const fieldAlign = alignOf(fieldType);
                offset = alignUp(offset, fieldAlign);
                const storer = createMemoryStorer(fieldType, stringEncoding, canonicalResourceIds, ownInstanceResources);
                fields.push({ name: camelCase(member.name), offset, storer });
                offset += sizeOf(fieldType);
            }
            return recordStorer.bind(null, { fields });
        }
        case ModelTag.ComponentTypeDefinedList: {
            const elemType = resolveValTypePure(type.value);
            const elemSize = sizeOf(elemType);
            const elemAlign = alignOf(elemType);
            const elemStorer = createMemoryStorer(elemType, stringEncoding, canonicalResourceIds, ownInstanceResources);
            return listStorer.bind(null, { elemSize, elemAlign, elemStorer });
        }
        case ModelTag.ComponentTypeDefinedOption: {
            const payloadType = resolveValTypePure(type.value);
            const payloadAlign = alignOf(payloadType);
            const payloadOffset = alignUp(1, payloadAlign);
            const payloadStorer = createMemoryStorer(payloadType, stringEncoding, canonicalResourceIds, ownInstanceResources);
            return optionStorer.bind(null, { payloadOffset, payloadStorer });
        }
        case ModelTag.ComponentTypeDefinedResult: {
            let payloadAlign = 1;
            if (type.ok !== undefined) payloadAlign = Math.max(payloadAlign, alignOfValType(type.ok));
            if (type.err !== undefined) payloadAlign = Math.max(payloadAlign, alignOfValType(type.err));
            const payloadOffset = alignUp(1, payloadAlign);
            const okStorer = type.ok !== undefined ? createMemoryStorer(resolveValTypePure(type.ok), stringEncoding, canonicalResourceIds, ownInstanceResources) : undefined;
            const errStorer = type.err !== undefined ? createMemoryStorer(resolveValTypePure(type.err), stringEncoding, canonicalResourceIds, ownInstanceResources) : undefined;
            const resultStorerFn = okStorer && errStorer ? resultStorerBoth : okStorer ? resultStorerOkOnly : errStorer ? resultStorerErrOnly : resultStorerVoid;
            return resultStorerFn.bind(null, { payloadOffset, okStorer, errStorer });
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
            const variantStorerFn = discSize === 1 ? variantStorerDisc1 : discSize === 2 ? variantStorerDisc2 : variantStorerDisc4;
            return variantStorerFn.bind(null, { payloadOffset, nameToIndex, caseStorers });
        }
        case ModelTag.ComponentTypeDefinedEnum: {
            const discSize = discriminantSize(type.members.length);
            const nameToIndex = new Map(type.members.map((name, i) => [name, i]));
            const enumStorerFn = discSize === 1 ? enumStorerDisc1 : discSize === 2 ? enumStorerDisc2 : enumStorerDisc4;
            return enumStorerFn.bind(null, { nameToIndex });
        }
        case ModelTag.ComponentTypeDefinedFlags: {
            const wordCount = Math.max(1, Math.ceil(type.members.length / 32));
            const memberNames = type.members.map(m => camelCase(m));
            return flagsStorer.bind(null, { wordCount, memberNames });
        }
        case ModelTag.ComponentTypeDefinedTuple: {
            const members: { offset: number, storer: MemoryStorer }[] = [];
            let offset = 0;
            for (const member of type.members) {
                const memberType = resolveValTypePure(member);
                const memberAlign = alignOf(memberType);
                offset = alignUp(offset, memberAlign);
                members.push({ offset, storer: createMemoryStorer(memberType, stringEncoding, canonicalResourceIds, ownInstanceResources) });
                offset += sizeOf(memberType);
            }
            return tupleStorer.bind(null, { members });
        }
        case ModelTag.ComponentTypeDefinedOwn: {
            const resourceTypeIdx = canonicalResourceIds?.get(type.value) ?? type.value;
            return ownResourceStorer.bind(null, { resourceTypeIdx });
        }
        case ModelTag.ComponentTypeDefinedBorrow: {
            const resourceTypeIdx = canonicalResourceIds?.get(type.value) ?? type.value;
            if (ownInstanceResources?.has(resourceTypeIdx)) {
                return borrowResourceDirectStorer.bind(null, { resourceTypeIdx });
            }
            return borrowResourceStorer.bind(null, { resourceTypeIdx });
        }
        case ModelTag.ComponentTypeDefinedStream:
            return streamStorer;
        case ModelTag.ComponentTypeDefinedFuture: {
            // Create a storer for the future's inner type so future.read can
            // encode the resolved JS value into WASM linear memory.
            let futureInnerStorer: ((ctx: BindingContext, ptr: number, value: unknown, rejected?: boolean) => void) | undefined;
            if (type.value !== undefined) {
                const innerType = resolveValTypePure(type.value);
                const innerMemStorer = createMemoryStorer(innerType, stringEncoding, canonicalResourceIds, ownInstanceResources);
                if (innerType.tag === ModelTag.ComponentTypeDefinedResult) {
                    futureInnerStorer = (ctx, ptr, value, rejected) => {
                        const wrapped = rejected
                            ? { [TAG]: ERR, [VAL]: value }
                            : { [TAG]: OK, [VAL]: value };
                        innerMemStorer(ctx, ptr, wrapped);
                    };
                } else {
                    futureInnerStorer = innerMemStorer;
                }
            }
            return futureMemStorer.bind(null, { futureStorer: futureInnerStorer });
        }
        case ModelTag.ComponentTypeDefinedErrorContext:
            return errorContextStorer;
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

    const resultLiftingFn = okNeedsCoercion || errNeedsCoercion ? resultLiftingCoerced : resultLifting;
    return resultLiftingFn.bind(null, { okLifter, errLifter, totalSize, payloadJoined, okFlatTypes, errFlatTypes });
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
