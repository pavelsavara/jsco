import { ComponentTypeIndex } from '../model/indices';
import { ModelTag } from '../model/tags';
import { ComponentTypeFunc, ComponentValType, PrimitiveValType } from '../model/types';
import type { ResolvedType } from './type-resolution';
import type { ResolvedContext } from './types';

// Canonical ABI limits
export const MAX_FLAT_PARAMS = 16;
export const MAX_FLAT_RESULTS = 1;

export const enum CallingConvention {
    /** Single register value (i32, i64, f32, f64) */
    Scalar,
    /** Multiple register values within MAX_FLAT_PARAMS/MAX_FLAT_RESULTS */
    Flat,
    /** Spilled to linear memory, represented by a pointer */
    Spilled,
}

export type FunctionCallingConvention = {
    params: CallingConvention;
    results: CallingConvention;
    paramFlatCount: number;
    resultFlatCount: number;
}

// --- Primitive size/alignment tables ---

function primitiveSizeOf(prim: PrimitiveValType): number {
    switch (prim) {
        case PrimitiveValType.Bool:
        case PrimitiveValType.S8:
        case PrimitiveValType.U8:
            return 1;
        case PrimitiveValType.S16:
        case PrimitiveValType.U16:
            return 2;
        case PrimitiveValType.S32:
        case PrimitiveValType.U32:
        case PrimitiveValType.Float32:
        case PrimitiveValType.Char:
            return 4;
        case PrimitiveValType.S64:
        case PrimitiveValType.U64:
        case PrimitiveValType.Float64:
            return 8;
        case PrimitiveValType.String:
            return 8; // pointer + length
    }
}

function primitiveAlignOf(prim: PrimitiveValType): number {
    switch (prim) {
        case PrimitiveValType.Bool:
        case PrimitiveValType.S8:
        case PrimitiveValType.U8:
            return 1;
        case PrimitiveValType.S16:
        case PrimitiveValType.U16:
            return 2;
        case PrimitiveValType.S32:
        case PrimitiveValType.U32:
        case PrimitiveValType.Float32:
        case PrimitiveValType.Char:
            return 4;
        case PrimitiveValType.S64:
        case PrimitiveValType.U64:
        case PrimitiveValType.Float64:
            return 8;
        case PrimitiveValType.String:
            return 4; // pointer alignment
    }
}

function primitiveFlatCount(prim: PrimitiveValType): number {
    switch (prim) {
        case PrimitiveValType.String:
            return 2; // pointer + length
        default:
            return 1;
    }
}

// --- Composite type calculations ---

function alignUp(offset: number, align: number): number {
    return (offset + align - 1) & ~(align - 1);
}

export function sizeOf(type: ResolvedType): number {
    switch (type.tag) {
        case ModelTag.ComponentValTypePrimitive:
        case ModelTag.ComponentTypeDefinedPrimitive:
            return primitiveSizeOf(type.value);

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
            return primitiveAlignOf(type.value);

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
            return 4;

        case ModelTag.ComponentTypeFunc:
            return 0;
    }
}

export function flatCount(type: ResolvedType): number {
    switch (type.tag) {
        case ModelTag.ComponentValTypePrimitive:
        case ModelTag.ComponentTypeDefinedPrimitive:
            return primitiveFlatCount(type.value);

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
    return _deepResolve(rctx, type, new Set());
}

function _deepResolveValType(rctx: ResolvedContext, valType: ComponentValType, visited: Set<unknown>): ComponentValType {
    if (valType.tag === ModelTag.ComponentValTypePrimitive) {
        return valType; // primitives are self-contained
    }
    if (valType.tag === ModelTag.ComponentValTypeResolved) {
        return valType; // already resolved
    }
    // ComponentValTypeType — resolve and wrap inline
    const resolved = rctx.resolvedTypes.get(valType.value as ComponentTypeIndex);
    if (resolved === undefined) {
        throw new Error(`Unresolved type at index ${valType.value}`);
    }
    const deepResolved = _deepResolve(rctx, resolved, visited);
    return { tag: ModelTag.ComponentValTypeResolved, resolved: deepResolved };
}

function _deepResolve(rctx: ResolvedContext, type: ResolvedType, visited: Set<unknown>): ResolvedType {
    // Guard against infinite recursion from circular type references
    if (visited.has(type)) return type;
    visited.add(type);

    switch (type.tag) {
        case ModelTag.ComponentValTypePrimitive:
        case ModelTag.ComponentTypeDefinedPrimitive:
        case ModelTag.ComponentTypeDefinedEnum:
        case ModelTag.ComponentTypeDefinedFlags:
        case ModelTag.ComponentTypeDefinedOwn:
        case ModelTag.ComponentTypeDefinedBorrow:
            // No nested ComponentValType references needing resolution
            return type;

        case ModelTag.ComponentTypeDefinedRecord:
            return {
                ...type,
                members: type.members.map(m => ({
                    name: m.name,
                    type: _deepResolveValType(rctx, m.type, visited),
                })),
            };

        case ModelTag.ComponentTypeDefinedTuple:
            return {
                ...type,
                members: type.members.map(m => _deepResolveValType(rctx, m, visited)),
            };

        case ModelTag.ComponentTypeDefinedList:
            return {
                ...type,
                value: _deepResolveValType(rctx, type.value, visited),
            };

        case ModelTag.ComponentTypeDefinedOption:
            return {
                ...type,
                value: _deepResolveValType(rctx, type.value, visited),
            };

        case ModelTag.ComponentTypeDefinedResult:
            return {
                ...type,
                ok: type.ok !== undefined ? _deepResolveValType(rctx, type.ok, visited) : undefined,
                err: type.err !== undefined ? _deepResolveValType(rctx, type.err, visited) : undefined,
            };

        case ModelTag.ComponentTypeDefinedVariant:
            return {
                ...type,
                variants: type.variants.map(c => ({
                    ...c,
                    ty: c.ty !== undefined ? _deepResolveValType(rctx, c.ty, visited) : undefined,
                })),
            };

        case ModelTag.ComponentTypeFunc:
            return {
                ...type,
                params: type.params.map(p => ({
                    name: p.name,
                    type: _deepResolveValType(rctx, p.type, visited),
                })),
                results: type.results.tag === ModelTag.ComponentFuncResultUnnamed
                    ? { tag: ModelTag.ComponentFuncResultUnnamed, type: _deepResolveValType(rctx, type.results.type, visited) }
                    : {
                        tag: ModelTag.ComponentFuncResultNamed,
                        values: type.results.values.map(v => ({
                            name: v.name,
                            type: _deepResolveValType(rctx, v.type, visited),
                        })),
                    },
            };

        default:
            return type;
    }
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
