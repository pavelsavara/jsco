import { ComponentTypeIndex } from '../model/indices';
import { ModelTag } from '../model/tags';
import {
    ComponentValTypePrimitive, ComponentTypeDefinedPrimitive, ComponentTypeDefinedRecord,
    ComponentTypeDefinedVariant, ComponentTypeDefinedList, ComponentTypeDefinedTuple,
    ComponentTypeDefinedFlags, ComponentTypeDefinedEnum, ComponentTypeDefinedOption,
    ComponentTypeDefinedResult, ComponentTypeDefinedOwn, ComponentTypeDefinedBorrow,
    ComponentTypeFunc, ComponentType, ComponentTypeInstance, ComponentTypeResource,
} from '../model/types';
import type { ResolverContext } from './types';

// A resolved type is a concrete type with no further indirection
export type ResolvedType =
    | ComponentValTypePrimitive
    | ComponentTypeDefinedPrimitive
    | ComponentTypeDefinedRecord
    | ComponentTypeDefinedVariant
    | ComponentTypeDefinedList
    | ComponentTypeDefinedTuple
    | ComponentTypeDefinedFlags
    | ComponentTypeDefinedEnum
    | ComponentTypeDefinedOption
    | ComponentTypeDefinedResult
    | ComponentTypeDefinedOwn
    | ComponentTypeDefinedBorrow
    | ComponentTypeFunc;

function resolveType(rctx: ResolverContext, type: ComponentType, visited: Set<ComponentType>): ResolvedType | undefined {
    if (visited.has(type)) return undefined;
    visited.add(type);

    switch (type.tag) {
        // Concrete defined types — return directly
        case ModelTag.ComponentTypeDefinedPrimitive:
        case ModelTag.ComponentTypeDefinedRecord:
        case ModelTag.ComponentTypeDefinedVariant:
        case ModelTag.ComponentTypeDefinedList:
        case ModelTag.ComponentTypeDefinedTuple:
        case ModelTag.ComponentTypeDefinedFlags:
        case ModelTag.ComponentTypeDefinedEnum:
        case ModelTag.ComponentTypeDefinedOption:
        case ModelTag.ComponentTypeDefinedResult:
        case ModelTag.ComponentTypeDefinedOwn:
        case ModelTag.ComponentTypeDefinedBorrow:
        case ModelTag.ComponentTypeFunc:
            return type;

        // Instance type — find type declarations inside
        case ModelTag.ComponentTypeInstance: {
            for (const decl of type.declarations) {
                if (decl.tag === ModelTag.InstanceTypeDeclarationType) {
                    return resolveType(rctx, decl.value, visited);
                }
            }
            return undefined;
        }

        // Alias to instance export — follow the instance
        case ModelTag.ComponentAliasInstanceExport: {
            const instance = rctx.indexes.componentInstances[type.instance_index];
            if (instance && instance.tag === ModelTag.ComponentTypeInstance) {
                return resolveType(rctx, instance, visited);
            }
            return undefined;
        }

        // Non-type entries — skip
        case ModelTag.ComponentSection:
        case ModelTag.ComponentTypeComponent:
        case ModelTag.ComponentTypeResource:
            return undefined;

        default:
            return undefined;
    }
}

export function buildResolvedTypeMap(rctx: ResolverContext): Map<ComponentTypeIndex, ResolvedType> {
    const map = new Map<ComponentTypeIndex, ResolvedType>();
    for (let i = 0; i < rctx.indexes.componentTypes.length; i++) {
        const type = rctx.indexes.componentTypes[i];
        const resolved = resolveType(rctx, type, new Set());
        if (resolved) {
            map.set(i as ComponentTypeIndex, resolved);
        }
    }
    return map;
}

/// Resolves the canonical resource type for an own<T> or borrow<T> definition.
/// The `value` field on ComponentTypeDefinedOwn/Borrow is a unified type index
/// pointing to the ComponentTypeResource declaration.
export function resolveCanonicalResourceType(rctx: ResolverContext, ownOrBorrow: ComponentTypeDefinedOwn | ComponentTypeDefinedBorrow): ComponentTypeResource {
    const type = rctx.indexes.componentTypes[ownOrBorrow.value];
    if (!type || type.tag !== ModelTag.ComponentTypeResource) {
        throw new Error(`Type index ${ownOrBorrow.value} does not resolve to a resource type (got ${type?.tag})`);
    }
    return type as ComponentTypeResource;
}
