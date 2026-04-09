import { ComponentTypeIndex } from '../model/indices';
import { ModelTag } from '../model/tags';
import { ComponentTypeFunc, ComponentValType, PrimitiveValType } from '../model/types';
import type { ResolvedType } from './type-resolution';
import type { ResolverContext } from './types';

// Canonical ABI limits
export const MAX_FLAT_PARAMS = 16;
export const MAX_FLAT_RESULTS = 1;

export const enum CallingConvention {
    /** Single register value (i32, i64, f32, f64) */
    Scalar = 'scalar',
    /** Multiple register values within MAX_FLAT_PARAMS/MAX_FLAT_RESULTS */
    Flat = 'flat',
    /** Spilled to linear memory, represented by a pointer */
    Spilled = 'spilled',
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

export function sizeOf(rctx: ResolverContext, type: ResolvedType): number {
    switch (type.tag) {
        case ModelTag.ComponentValTypePrimitive:
        case ModelTag.ComponentTypeDefinedPrimitive:
            return primitiveSizeOf(type.value);

        case ModelTag.ComponentTypeDefinedRecord: {
            let size = 0;
            for (const member of type.members) {
                const fieldAlign = alignOfValType(rctx, member.type);
                size = alignUp(size, fieldAlign);
                size += sizeOfValType(rctx, member.type);
            }
            const recordAlign = alignOf(rctx, type);
            return alignUp(size, recordAlign);
        }

        case ModelTag.ComponentTypeDefinedTuple: {
            let size = 0;
            for (const member of type.members) {
                const fieldAlign = alignOfValType(rctx, member);
                size = alignUp(size, fieldAlign);
                size += sizeOfValType(rctx, member);
            }
            const tupleAlign = alignOf(rctx, type);
            return alignUp(size, tupleAlign);
        }

        case ModelTag.ComponentTypeDefinedList:
            return 8; // pointer + length

        case ModelTag.ComponentTypeDefinedOption: {
            const payloadAlign = alignOfValType(rctx, type.value);
            const payloadSize = sizeOfValType(rctx, type.value);
            // discriminant (1 byte) + padding to payload alignment + payload
            const totalAlign = Math.max(1, payloadAlign);
            return alignUp(alignUp(1, payloadAlign) + payloadSize, totalAlign);
        }

        case ModelTag.ComponentTypeDefinedResult: {
            let payloadSize = 0;
            let payloadAlign = 1;
            if (type.ok !== undefined) {
                payloadSize = Math.max(payloadSize, sizeOfValType(rctx, type.ok));
                payloadAlign = Math.max(payloadAlign, alignOfValType(rctx, type.ok));
            }
            if (type.err !== undefined) {
                payloadSize = Math.max(payloadSize, sizeOfValType(rctx, type.err));
                payloadAlign = Math.max(payloadAlign, alignOfValType(rctx, type.err));
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
                    maxPayloadSize = Math.max(maxPayloadSize, sizeOfValType(rctx, c.ty));
                    maxPayloadAlign = Math.max(maxPayloadAlign, alignOfValType(rctx, c.ty));
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

export function alignOf(rctx: ResolverContext, type: ResolvedType): number {
    switch (type.tag) {
        case ModelTag.ComponentValTypePrimitive:
        case ModelTag.ComponentTypeDefinedPrimitive:
            return primitiveAlignOf(type.value);

        case ModelTag.ComponentTypeDefinedRecord: {
            let maxAlign = 1;
            for (const member of type.members) {
                maxAlign = Math.max(maxAlign, alignOfValType(rctx, member.type));
            }
            return maxAlign;
        }

        case ModelTag.ComponentTypeDefinedTuple: {
            let maxAlign = 1;
            for (const member of type.members) {
                maxAlign = Math.max(maxAlign, alignOfValType(rctx, member));
            }
            return maxAlign;
        }

        case ModelTag.ComponentTypeDefinedList:
            return 4; // pointer alignment

        case ModelTag.ComponentTypeDefinedOption:
            return Math.max(1, alignOfValType(rctx, type.value));

        case ModelTag.ComponentTypeDefinedResult: {
            let maxAlign = 1;
            if (type.ok !== undefined) maxAlign = Math.max(maxAlign, alignOfValType(rctx, type.ok));
            if (type.err !== undefined) maxAlign = Math.max(maxAlign, alignOfValType(rctx, type.err));
            return maxAlign;
        }

        case ModelTag.ComponentTypeDefinedVariant: {
            const disc = discriminantSize(type.variants.length);
            let maxAlign = disc;
            for (const c of type.variants) {
                if (c.ty !== undefined) {
                    maxAlign = Math.max(maxAlign, alignOfValType(rctx, c.ty));
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

export function flatCount(rctx: ResolverContext, type: ResolvedType): number {
    switch (type.tag) {
        case ModelTag.ComponentValTypePrimitive:
        case ModelTag.ComponentTypeDefinedPrimitive:
            return primitiveFlatCount(type.value);

        case ModelTag.ComponentTypeDefinedRecord: {
            let count = 0;
            for (const member of type.members) {
                count += flatCountForValType(rctx, member.type);
            }
            return count;
        }

        case ModelTag.ComponentTypeDefinedTuple: {
            let count = 0;
            for (const member of type.members) {
                count += flatCountForValType(rctx, member);
            }
            return count;
        }

        case ModelTag.ComponentTypeDefinedList:
            return 2; // pointer + length

        case ModelTag.ComponentTypeDefinedOption:
            return 1 + flatCountForValType(rctx, type.value); // discriminant + payload

        case ModelTag.ComponentTypeDefinedResult: {
            let maxPayloadFlat = 0;
            if (type.ok !== undefined) maxPayloadFlat = Math.max(maxPayloadFlat, flatCountForValType(rctx, type.ok));
            if (type.err !== undefined) maxPayloadFlat = Math.max(maxPayloadFlat, flatCountForValType(rctx, type.err));
            return 1 + maxPayloadFlat; // discriminant + max(ok, err)
        }

        case ModelTag.ComponentTypeDefinedVariant: {
            let maxCaseFlat = 0;
            for (const c of type.variants) {
                if (c.ty !== undefined) {
                    maxCaseFlat = Math.max(maxCaseFlat, flatCountForValType(rctx, c.ty));
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

export function resolveValType(rctx: ResolverContext, valType: ComponentValType): ResolvedType {
    if (valType.tag === ModelTag.ComponentValTypePrimitive) {
        return valType;
    }
    // ComponentValTypeType — follow the reference
    const resolved = rctx.resolvedTypes.get(valType.value as ComponentTypeIndex);
    if (resolved === undefined) {
        throw new Error(`Unresolved type at index ${valType.value}`);
    }
    return resolved;
}

export function sizeOfValType(rctx: ResolverContext, valType: ComponentValType): number {
    return sizeOf(rctx, resolveValType(rctx, valType));
}

export function alignOfValType(rctx: ResolverContext, valType: ComponentValType): number {
    return alignOf(rctx, resolveValType(rctx, valType));
}

export function flatCountForValType(rctx: ResolverContext, valType: ComponentValType): number {
    return flatCount(rctx, resolveValType(rctx, valType));
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
    rctx: ResolverContext,
    funcType: ComponentTypeFunc
): FunctionCallingConvention {
    let paramFlatCount = 0;
    for (const param of funcType.params) {
        paramFlatCount += flatCountForValType(rctx, param.type);
    }

    let resultFlatCount = 0;
    switch (funcType.results.tag) {
        case ModelTag.ComponentFuncResultNamed: {
            for (const res of funcType.results.values) {
                resultFlatCount += flatCountForValType(rctx, res.type);
            }
            break;
        }
        case ModelTag.ComponentFuncResultUnnamed: {
            resultFlatCount = flatCountForValType(rctx, funcType.results.type);
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
