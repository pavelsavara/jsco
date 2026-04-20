// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { ComponentTypeIndex } from '../parser/model/indices';
import { ModelTag } from '../parser/model/tags';
import { ComponentTypeDefinedResult, ComponentTypeDefinedVariant, ComponentTypeFunc, ComponentValType, PrimitiveValType_Count } from '../parser/model/types';
import type { ResolvedType } from './type-resolution';
import type { ResolvedContext } from './types';
import { CallingConvention, FlatType, MAX_FLAT_PARAMS, MAX_FLAT_RESULTS } from './model/calling-convention';
import type { FunctionCallingConvention } from './model/calling-convention';
export { MAX_FLAT_PARAMS, MAX_FLAT_RESULTS, CallingConvention, CallingConvention_Count, FlatType } from './model/calling-convention';
export type { FunctionCallingConvention } from './model/calling-convention';

// --- Primitive size/alignment/flat tables (indexed by PrimitiveValType) ---
// PrimitiveValType: Bool=0, S8=1, U8=2, S16=3, U16=4, S32=5, U32=6, S64=7, U64=8, Float32=9, Float64=10, Char=11, String=12

// Bool=0, S8=1, U8=2, S16=3, U16=4, S32=5, U32=6, S64=7, U64=8, Float32=9, Float64=10, Char=11, String=12
const _primSize: number[] = [1, 1, 1, 2, 2, 4, 4, 8, 8, 4, 8, 4, 8];
const _primAlign: number[] = [1, 1, 1, 2, 2, 4, 4, 8, 8, 4, 8, 4, 4];
const _primFC: number[] = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2];
const _I32: FlatType[] = [FlatType.I32];
const _I64: FlatType[] = [FlatType.I64];
const _F32: FlatType[] = [FlatType.F32];
const _F64: FlatType[] = [FlatType.F64];
const _I32I32: FlatType[] = [FlatType.I32, FlatType.I32];
const _primFT: FlatType[][] = [_I32, _I32, _I32, _I32, _I32, _I32, _I32, _I64, _I64, _F32, _F64, _I32, _I32I32];

function primIdx(v: number): number {
    if (v < 0 || v >= PrimitiveValType_Count) throw new Error(`PrimitiveValType out of range: ${v}`);
    return v;
}

function primSize(v: number): number {
    const idx = primIdx(v);
    const result = _primSize[idx];
    if (result === undefined) throw new Error(`primSize: missing size for PrimitiveValType ${v}`);
    return result;
}

function primAlign(v: number): number {
    const idx = primIdx(v);
    const result = _primAlign[idx];
    if (result === undefined) throw new Error(`primAlign: missing alignment for PrimitiveValType ${v}`);
    return result;
}

function primFlatCount(v: number): number {
    const idx = primIdx(v);
    const result = _primFC[idx];
    if (result === undefined) throw new Error(`primFlatCount: missing flat count for PrimitiveValType ${v}`);
    return result;
}

function primFlatTypes(v: number): FlatType[] {
    const idx = primIdx(v);
    const result = _primFT[idx];
    if (result === undefined) throw new Error(`primFlatTypes: missing flat types for PrimitiveValType ${v}`);
    return result;
}

// --- Composite type calculations ---

export function alignUp(offset: number, align: number): number {
    return (offset + align - 1) & ~(align - 1);
}

export function sizeOf(type: ResolvedType): number {
    switch (type.tag) {
        case ModelTag.ComponentValTypePrimitive:
        case ModelTag.ComponentTypeDefinedPrimitive:
            return primSize(type.value);

        case ModelTag.ComponentTypeDefinedRecord: {
            let size = 0;
            for (const member of type.members) {
                const fieldAlign = alignOfValType(member.type);
                size = alignUp(size, fieldAlign);
                size += sizeOfValType(member.type);
            }
            const recordAlign = alignOf(type);
            return alignUp(size, recordAlign);
        }

        case ModelTag.ComponentTypeDefinedTuple: {
            let size = 0;
            for (const member of type.members) {
                const fieldAlign = alignOfValType(member);
                size = alignUp(size, fieldAlign);
                size += sizeOfValType(member);
            }
            const tupleAlign = alignOf(type);
            return alignUp(size, tupleAlign);
        }

        case ModelTag.ComponentTypeDefinedList:
            return 8; // pointer + length

        case ModelTag.ComponentTypeDefinedOption: {
            const payloadAlign = alignOfValType(type.value);
            const payloadSize = sizeOfValType(type.value);
            // discriminant (1 byte) + padding to payload alignment + payload
            const totalAlign = Math.max(1, payloadAlign);
            return alignUp(alignUp(1, payloadAlign) + payloadSize, totalAlign);
        }

        case ModelTag.ComponentTypeDefinedResult: {
            let payloadSize = 0;
            let payloadAlign = 1;
            if (type.ok !== undefined) {
                payloadSize = Math.max(payloadSize, sizeOfValType(type.ok));
                payloadAlign = Math.max(payloadAlign, alignOfValType(type.ok));
            }
            if (type.err !== undefined) {
                payloadSize = Math.max(payloadSize, sizeOfValType(type.err));
                payloadAlign = Math.max(payloadAlign, alignOfValType(type.err));
            }
            const totalAlign = Math.max(1, payloadAlign);
            return alignUp(alignUp(1, payloadAlign) + payloadSize, totalAlign);
        }

        case ModelTag.ComponentTypeDefinedVariant: {
            const discSize = discriminantSize(type.variants.length);
            const discAlign = discSize; // discriminant alignment = its size
            let maxPayloadSize = 0;
            let maxPayloadAlign = 1;
            for (const c of type.variants) {
                if (c.ty !== undefined) {
                    maxPayloadSize = Math.max(maxPayloadSize, sizeOfValType(c.ty));
                    maxPayloadAlign = Math.max(maxPayloadAlign, alignOfValType(c.ty));
                }
            }
            const totalAlign = Math.max(discAlign, maxPayloadAlign);
            return alignUp(alignUp(discSize, maxPayloadAlign) + maxPayloadSize, totalAlign);
        }

        case ModelTag.ComponentTypeDefinedEnum:
            return discriminantSize(type.members.length);

        case ModelTag.ComponentTypeDefinedFlags:
            return Math.ceil(type.members.length / 32) * 4 || 4; // minimum 4 bytes (1 i32) for 0 flags

        case ModelTag.ComponentTypeDefinedOwn:
        case ModelTag.ComponentTypeDefinedBorrow:
        case ModelTag.ComponentTypeDefinedStream:
        case ModelTag.ComponentTypeDefinedFuture:
        case ModelTag.ComponentTypeDefinedErrorContext:
            return 4; // i32 handle

        case ModelTag.ComponentTypeFunc:
            // Function types don't have a linear memory representation
            return 0;
    }
}

export function alignOf(type: ResolvedType): number {
    switch (type.tag) {
        case ModelTag.ComponentValTypePrimitive:
        case ModelTag.ComponentTypeDefinedPrimitive:
            return primAlign(type.value);

        case ModelTag.ComponentTypeDefinedRecord: {
            let maxAlign = 1;
            for (const member of type.members) {
                maxAlign = Math.max(maxAlign, alignOfValType(member.type));
            }
            return maxAlign;
        }

        case ModelTag.ComponentTypeDefinedTuple: {
            let maxAlign = 1;
            for (const member of type.members) {
                maxAlign = Math.max(maxAlign, alignOfValType(member));
            }
            return maxAlign;
        }

        case ModelTag.ComponentTypeDefinedList:
            return 4; // pointer alignment

        case ModelTag.ComponentTypeDefinedOption:
            return Math.max(1, alignOfValType(type.value));

        case ModelTag.ComponentTypeDefinedResult: {
            let maxAlign = 1;
            if (type.ok !== undefined) maxAlign = Math.max(maxAlign, alignOfValType(type.ok));
            if (type.err !== undefined) maxAlign = Math.max(maxAlign, alignOfValType(type.err));
            return maxAlign;
        }

        case ModelTag.ComponentTypeDefinedVariant: {
            const disc = discriminantSize(type.variants.length);
            let maxAlign = disc;
            for (const c of type.variants) {
                if (c.ty !== undefined) {
                    maxAlign = Math.max(maxAlign, alignOfValType(c.ty));
                }
            }
            return maxAlign;
        }

        case ModelTag.ComponentTypeDefinedEnum:
            return discriminantSize(type.members.length);

        case ModelTag.ComponentTypeDefinedFlags:
            return 4;

        case ModelTag.ComponentTypeDefinedOwn:
        case ModelTag.ComponentTypeDefinedBorrow:
        case ModelTag.ComponentTypeDefinedStream:
        case ModelTag.ComponentTypeDefinedFuture:
        case ModelTag.ComponentTypeDefinedErrorContext:
            return 4;

        case ModelTag.ComponentTypeFunc:
            return 0;
    }
}

export function flatCount(type: ResolvedType): number {
    switch (type.tag) {
        case ModelTag.ComponentValTypePrimitive:
        case ModelTag.ComponentTypeDefinedPrimitive:
            return primFlatCount(type.value);

        case ModelTag.ComponentTypeDefinedRecord: {
            let count = 0;
            for (const member of type.members) {
                count += flatCountForValType(member.type);
            }
            return count;
        }

        case ModelTag.ComponentTypeDefinedTuple: {
            let count = 0;
            for (const member of type.members) {
                count += flatCountForValType(member);
            }
            return count;
        }

        case ModelTag.ComponentTypeDefinedList:
            return 2; // pointer + length

        case ModelTag.ComponentTypeDefinedOption:
            return 1 + flatCountForValType(type.value); // discriminant + payload

        case ModelTag.ComponentTypeDefinedResult: {
            let maxPayloadFlat = 0;
            if (type.ok !== undefined) maxPayloadFlat = Math.max(maxPayloadFlat, flatCountForValType(type.ok));
            if (type.err !== undefined) maxPayloadFlat = Math.max(maxPayloadFlat, flatCountForValType(type.err));
            return 1 + maxPayloadFlat; // discriminant + max(ok, err)
        }

        case ModelTag.ComponentTypeDefinedVariant: {
            let maxCaseFlat = 0;
            for (const c of type.variants) {
                if (c.ty !== undefined) {
                    maxCaseFlat = Math.max(maxCaseFlat, flatCountForValType(c.ty));
                }
            }
            return 1 + maxCaseFlat; // discriminant + max case
        }

        case ModelTag.ComponentTypeDefinedEnum:
            return 1; // single i32 discriminant

        case ModelTag.ComponentTypeDefinedFlags:
            return Math.ceil(type.members.length / 32) || 1; // one i32 per 32 flags, minimum 1

        case ModelTag.ComponentTypeDefinedOwn:
        case ModelTag.ComponentTypeDefinedBorrow:
        case ModelTag.ComponentTypeDefinedStream:
        case ModelTag.ComponentTypeDefinedFuture:
        case ModelTag.ComponentTypeDefinedErrorContext:
            return 1; // i32 handle

        case ModelTag.ComponentTypeFunc:
            return 0;
    }
}

// --- Helpers for ComponentValType (which may be primitive or a type reference) ---

export function resolveValType(rctx: ResolvedContext, valType: ComponentValType): ResolvedType {
    if (valType.tag === ModelTag.ComponentValTypePrimitive) {
        return valType;
    }
    if (valType.tag === ModelTag.ComponentValTypeResolved) {
        return valType.resolved as ResolvedType;
    }
    // ComponentValTypeType — follow the reference
    const resolved = rctx.resolvedTypes.get(valType.value as ComponentTypeIndex);
    if (resolved === undefined) {
        throw new Error(`Unresolved type at index ${valType.value}`);
    }
    return resolved;
}

/**
 * Resolve a ComponentValType without rctx — only handles Primitive and Resolved.
 * Throws on ComponentValTypeType, which indicates a missing deep-resolve step.
 * Use this in call-time paths where rctx must not be captured.
 */
export function resolveValTypePure(valType: ComponentValType): ResolvedType {
    if (valType.tag === ModelTag.ComponentValTypePrimitive) {
        return valType;
    }
    if (valType.tag === ModelTag.ComponentValTypeResolved) {
        return valType.resolved as ResolvedType;
    }
    throw new Error(`resolveValTypePure: unexpected ComponentValTypeType(${(valType as any).value}) — type was not deep-resolved`);
}

/**
 * Deep-resolve a ResolvedType: recursively replace all nested ComponentValTypeType
 * references with ComponentValTypeResolved carrying the resolved type inline.
 * This allows storeToMemory/loadFromMemory/sizeOf/alignOf to work without
 * looking up rctx.resolvedTypes at call time.
 */
export function deepResolveType(rctx: ResolvedContext, type: ResolvedType): ResolvedType {
    return _deepResolve(rctx, type, new Map());
}

function _deepResolveValType(rctx: ResolvedContext, valType: ComponentValType, cache: Map<unknown, ResolvedType>): ComponentValType {
    if (valType.tag === ModelTag.ComponentValTypePrimitive) {
        return valType; // primitives are self-contained
    }
    if (valType.tag === ModelTag.ComponentValTypeResolved) {
        // Still need to deep-resolve the inner type — it may contain
        // unresolved ComponentValTypeType references from partial resolution
        const deepInner = _deepResolve(rctx, valType.resolved as ResolvedType, cache);
        if (deepInner === valType.resolved) return valType;
        return { tag: ModelTag.ComponentValTypeResolved, resolved: deepInner };
    }
    // ComponentValTypeType — resolve and wrap inline
    const resolved = rctx.resolvedTypes.get(valType.value as ComponentTypeIndex);
    if (resolved === undefined) {
        // Type index not found in current scope — may reference a type in a nested
        // or parent scope. Leave it as-is; it will be resolved when the correct scope runs.
        return valType;
    }
    const deepResolved = _deepResolve(rctx, resolved, cache);
    return { tag: ModelTag.ComponentValTypeResolved, resolved: deepResolved };
}

function _deepResolve(rctx: ResolvedContext, type: ResolvedType, cache: Map<unknown, ResolvedType>): ResolvedType {
    // Guard against infinite recursion from circular type references.
    // Use a cache Map instead of a Set so that shared type references
    // return the already-deep-resolved copy, not the original.
    const cached = cache.get(type);
    if (cached !== undefined) return cached;
    // Insert a placeholder to break cycles — will be overwritten with the real result
    cache.set(type, type);

    let result: ResolvedType;

    switch (type.tag) {
        case ModelTag.ComponentValTypePrimitive:
        case ModelTag.ComponentTypeDefinedPrimitive:
        case ModelTag.ComponentTypeDefinedEnum:
        case ModelTag.ComponentTypeDefinedFlags:
        case ModelTag.ComponentTypeDefinedOwn:
        case ModelTag.ComponentTypeDefinedBorrow:
        case ModelTag.ComponentTypeDefinedErrorContext:
            // No nested ComponentValType references needing resolution
            result = type;
            break;

        case ModelTag.ComponentTypeDefinedStream:
            result = type.value !== undefined
                ? { ...type, value: _deepResolveValType(rctx, type.value, cache) }
                : type;
            break;

        case ModelTag.ComponentTypeDefinedFuture:
            result = type.value !== undefined
                ? { ...type, value: _deepResolveValType(rctx, type.value, cache) }
                : type;
            break;

        case ModelTag.ComponentTypeDefinedRecord:
            result = {
                ...type,
                members: type.members.map(m => ({
                    name: m.name,
                    type: _deepResolveValType(rctx, m.type, cache),
                })),
            };
            break;

        case ModelTag.ComponentTypeDefinedTuple:
            result = {
                ...type,
                members: type.members.map(m => _deepResolveValType(rctx, m, cache)),
            };
            break;

        case ModelTag.ComponentTypeDefinedList:
            result = {
                ...type,
                value: _deepResolveValType(rctx, type.value, cache),
            };
            break;

        case ModelTag.ComponentTypeDefinedOption:
            result = {
                ...type,
                value: _deepResolveValType(rctx, type.value, cache),
            };
            break;

        case ModelTag.ComponentTypeDefinedResult:
            result = {
                ...type,
                ok: type.ok !== undefined ? _deepResolveValType(rctx, type.ok, cache) : undefined,
                err: type.err !== undefined ? _deepResolveValType(rctx, type.err, cache) : undefined,
            };
            break;

        case ModelTag.ComponentTypeDefinedVariant:
            result = {
                ...type,
                variants: type.variants.map(c => ({
                    ...c,
                    ty: c.ty !== undefined ? _deepResolveValType(rctx, c.ty, cache) : undefined,
                })),
            };
            break;

        case ModelTag.ComponentTypeFunc:
            result = {
                ...type,
                params: type.params.map(p => ({
                    name: p.name,
                    type: _deepResolveValType(rctx, p.type, cache),
                })),
                results: type.results.tag === ModelTag.ComponentFuncResultUnnamed
                    ? { tag: ModelTag.ComponentFuncResultUnnamed, type: _deepResolveValType(rctx, type.results.type, cache) }
                    : {
                        tag: ModelTag.ComponentFuncResultNamed,
                        values: type.results.values.map(v => ({
                            name: v.name,
                            type: _deepResolveValType(rctx, v.type, cache),
                        })),
                    },
            };
            break;

        default:
            result = type;
            break;
    }

    cache.set(type, result);
    return result;
}

export function sizeOfValType(valType: ComponentValType): number {
    return sizeOf(resolveValTypePure(valType));
}

export function alignOfValType(valType: ComponentValType): number {
    return alignOf(resolveValTypePure(valType));
}

export function flatCountForValType(valType: ComponentValType): number {
    return flatCount(resolveValTypePure(valType));
}

// --- Discriminant sizing per canonical ABI ---

export function discriminantSize(caseCount: number): number {
    if (caseCount <= 0) return 1;
    // Number of bytes needed: 1 for up to 256 cases, 2 for up to 65536, 4 beyond
    if (caseCount <= 0xFF) return 1;
    if (caseCount <= 0xFFFF) return 2;
    return 4;
}

// --- Flat type representation per canonical ABI ---

/** Spec: join(a, b) — find the common flat type for two slots */
export function joinFlatType(a: FlatType, b: FlatType): FlatType {
    if (a === b) return a;
    if ((a === FlatType.I32 && b === FlatType.F32) || (a === FlatType.F32 && b === FlatType.I32)) return FlatType.I32;
    return FlatType.I64;
}

/** Join two flat arrays in-place: for each slot, join the types; extend if source is longer */
function joinFlatArrays(target: FlatType[], source: FlatType[]): void {
    for (let i = 0; i < source.length; i++) {
        const s = source[i];
        if (s === undefined) throw new Error(`joinFlatArrays: source[${i}] is undefined`);
        if (i < target.length) {
            const t = target[i];
            if (t === undefined) throw new Error(`joinFlatArrays: target[${i}] is undefined`);
            target[i] = joinFlatType(t, s);
        } else {
            target.push(s);
        }
    }
}

/** Spec: flatten_type(t) — return the flat representation of a resolved type */
export function flattenType(type: ResolvedType): FlatType[] {
    switch (type.tag) {
        case ModelTag.ComponentValTypePrimitive:
        case ModelTag.ComponentTypeDefinedPrimitive:
            return primFlatTypes(type.value);

        case ModelTag.ComponentTypeDefinedRecord: {
            const flat: FlatType[] = [];
            for (const member of type.members) {
                flat.push(...flattenValType(member.type));
            }
            return flat;
        }

        case ModelTag.ComponentTypeDefinedTuple: {
            const flat: FlatType[] = [];
            for (const member of type.members) {
                flat.push(...flattenValType(member));
            }
            return flat;
        }

        case ModelTag.ComponentTypeDefinedList:
            return [FlatType.I32, FlatType.I32]; // pointer + length

        case ModelTag.ComponentTypeDefinedOption:
            return [FlatType.I32, ...flattenValType(type.value)]; // discriminant + payload

        case ModelTag.ComponentTypeDefinedResult:
            return flattenResult(type);

        case ModelTag.ComponentTypeDefinedVariant:
            return flattenVariant(type);

        case ModelTag.ComponentTypeDefinedEnum:
            return [FlatType.I32]; // single i32 discriminant

        case ModelTag.ComponentTypeDefinedFlags:
            return new Array(Math.ceil(type.members.length / 32) || 1).fill(FlatType.I32);

        case ModelTag.ComponentTypeDefinedOwn:
        case ModelTag.ComponentTypeDefinedBorrow:
        case ModelTag.ComponentTypeDefinedStream:
        case ModelTag.ComponentTypeDefinedFuture:
        case ModelTag.ComponentTypeDefinedErrorContext:
            return [FlatType.I32]; // i32 handle

        case ModelTag.ComponentTypeFunc:
            return [];
    }
}

/** Spec: flatten_variant(cases) with type joining */
export function flattenVariant(type: ComponentTypeDefinedVariant): FlatType[] {
    const flat: FlatType[] = [];
    for (const c of type.variants) {
        if (c.ty !== undefined) {
            const caseFlatTypes = flattenValType(c.ty);
            joinFlatArrays(flat, caseFlatTypes);
        }
    }
    // discriminant (i32) + joined payload
    return [FlatType.I32, ...flat];
}

/** Flatten a result type (despecialized as variant with ok/error cases) */
function flattenResult(type: ComponentTypeDefinedResult): FlatType[] {
    const flat: FlatType[] = [];
    if (type.ok !== undefined) {
        joinFlatArrays(flat, flattenValType(type.ok));
    }
    if (type.err !== undefined) {
        joinFlatArrays(flat, flattenValType(type.err));
    }
    return [FlatType.I32, ...flat];
}

export function flattenValType(valType: ComponentValType): FlatType[] {
    return flattenType(resolveValTypePure(valType));
}

// --- Function-level calling convention decision ---

export function determineFunctionCallingConvention(
    funcType: ComponentTypeFunc
): FunctionCallingConvention {
    let paramFlatCount = 0;
    for (const param of funcType.params) {
        paramFlatCount += flatCountForValType(param.type);
    }

    let resultFlatCount = 0;
    switch (funcType.results.tag) {
        case ModelTag.ComponentFuncResultNamed: {
            for (const res of funcType.results.values) {
                resultFlatCount += flatCountForValType(res.type);
            }
            break;
        }
        case ModelTag.ComponentFuncResultUnnamed: {
            resultFlatCount = flatCountForValType(funcType.results.type);
            break;
        }
    }

    const paramsConvention = paramFlatCount === 0
        ? CallingConvention.Flat
        : paramFlatCount === 1
            ? CallingConvention.Scalar
            : paramFlatCount <= MAX_FLAT_PARAMS
                ? CallingConvention.Flat
                : CallingConvention.Spilled;

    const resultsConvention = resultFlatCount === 0
        ? CallingConvention.Flat
        : resultFlatCount === 1
            ? CallingConvention.Scalar
            : resultFlatCount <= MAX_FLAT_RESULTS
                ? CallingConvention.Flat
                : CallingConvention.Spilled;

    return {
        params: paramsConvention,
        results: resultsConvention,
        paramFlatCount,
        resultFlatCount,
    };
}
