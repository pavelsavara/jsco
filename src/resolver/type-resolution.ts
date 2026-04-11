import { ComponentTypeIndex } from '../model/indices';
import { ModelTag } from '../model/tags';
import {
    ComponentValTypePrimitive, ComponentTypeDefinedPrimitive, ComponentTypeDefinedRecord,
    ComponentTypeDefinedVariant, ComponentTypeDefinedList, ComponentTypeDefinedTuple,
    ComponentTypeDefinedFlags, ComponentTypeDefinedEnum, ComponentTypeDefinedOption,
    ComponentTypeDefinedResult, ComponentTypeDefinedOwn, ComponentTypeDefinedBorrow,
    ComponentTypeFunc, ComponentType, ComponentTypeResource, ComponentTypeInstance,
} from '../model/types';
import { ComponentExternalKind } from '../model/exports';
import type { ResolverContext, ResolvedContext } from './types';
import { StringEncoding } from './types';
import { deepResolveType } from './calling-convention';
import { defaultVerbosity } from '../utils/assert';
import type { LogFn } from '../utils/assert';

const _noopLogger: LogFn = () => { /* noop */ };

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

        // Alias to instance export — find the named export in the instance type
        case ModelTag.ComponentAliasInstanceExport: {
            if (type.kind !== ComponentExternalKind.Type) return undefined;
            const instance = rctx.indexes.componentInstances[type.instance_index];
            if (instance && instance.tag === ModelTag.ComponentTypeInstance) {
                // Find the InstanceTypeDeclarationExport with matching name
                for (const decl of instance.declarations) {
                    if (decl.tag === ModelTag.InstanceTypeDeclarationExport) {
                        const exportName = (decl.name as any)?.name ?? decl.name;
                        if (exportName === type.name && decl.ty?.tag === ModelTag.ComponentTypeRefType && decl.ty.value.tag === ModelTag.TypeBoundsEq) {
                            // ty.value.value is the local type index (position in declarations[])
                            const localIndex = decl.ty.value.value;
                            const targetDecl = instance.declarations[localIndex];
                            if (targetDecl?.tag === ModelTag.InstanceTypeDeclarationType) {
                                return resolveType(rctx, targetDecl.value, visited);
                            }
                        }
                    }
                }
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

    // Phase 2: deep-resolve entries that came from instance type aliases.
    // Records/lists/etc. from instance types may reference local type indexes
    // (via ComponentValTypeType) that don't exist in the global map. Build a
    // temporary local→resolved mapping for each instance type, then deep-resolve
    // the global entries so they become self-contained (ComponentValTypeResolved).
    const instanceLocalMaps = new Map<number, Map<ComponentTypeIndex, ResolvedType>>();
    for (let i = 0; i < rctx.indexes.componentTypes.length; i++) {
        const type = rctx.indexes.componentTypes[i];
        if (type.tag === ModelTag.ComponentAliasInstanceExport &&
            type.kind === ComponentExternalKind.Type) {
            const instanceIdx = type.instance_index;
            if (!instanceLocalMaps.has(instanceIdx)) {
                const instance = rctx.indexes.componentInstances[instanceIdx];
                if (instance?.tag === ModelTag.ComponentTypeInstance) {
                    instanceLocalMaps.set(instanceIdx, buildInstanceLocalTypeMap(instance));
                }
            }
            const localMap = instanceLocalMaps.get(instanceIdx);
            if (localMap) {
                const resolved = map.get(i as ComponentTypeIndex);
                if (resolved) {
                    // Deep-resolve using the local map so records/lists contain
                    // ComponentValTypeResolved instead of local ComponentValTypeType refs
                    const rctxLocal: ResolvedContext = {
                        resolvedTypes: localMap,
                        // These fields are unused during deep-resolve
                        liftingCache: new Map(),
                        loweringCache: new Map(),
                        canonicalResourceIds: new Map(),
                        componentSectionCache: new Map(),
                        stringEncoding: StringEncoding.Utf8,
                        usesNumberForInt64: false,
                        verbose: defaultVerbosity,
                        logger: _noopLogger,
                    };
                    map.set(i as ComponentTypeIndex, deepResolveType(rctxLocal, resolved));
                }
            }
        }
    }

    // Phase 3: global deep-resolve — replace any remaining ComponentValTypeType
    // references in all resolved types. This covers function types and defined types
    // at the top level that reference other type indices (e.g., a record field whose
    // type is a primitive at another index).
    const globalRctx: ResolvedContext = {
        resolvedTypes: map,
        liftingCache: new Map(),
        loweringCache: new Map(),
        canonicalResourceIds: new Map(),
        componentSectionCache: new Map(),
        stringEncoding: StringEncoding.Utf8,
        usesNumberForInt64: false,
        verbose: defaultVerbosity,
        logger: _noopLogger,
    };
    for (const [idx, resolved] of map) {
        map.set(idx, deepResolveType(globalRctx, resolved));
    }

    return map;
}

/**
 * Build a resolved type map for the local type scope of a ComponentTypeInstance.
 * Instance declarations (InstanceTypeDeclarationType and InstanceTypeDeclarationExport
 * with TypeBoundsEq) each create a local type entry.
 */
function buildInstanceLocalTypeMap(instance: ComponentTypeInstance): Map<ComponentTypeIndex, ResolvedType> {
    const localMap = new Map<ComponentTypeIndex, ResolvedType>();
    const localTypes: (ResolvedType | undefined)[] = [];
    let localTypeIdx = 0;

    for (const decl of instance.declarations) {
        let resolved: ResolvedType | undefined;
        let isTypeCreating = false;

        if (decl.tag === ModelTag.InstanceTypeDeclarationType) {
            resolved = decl.value as ResolvedType;
            isTypeCreating = true;
        } else if (decl.tag === ModelTag.InstanceTypeDeclarationExport &&
            decl.ty?.tag === ModelTag.ComponentTypeRefType) {
            isTypeCreating = true;
            if (decl.ty.value?.tag === ModelTag.TypeBoundsEq) {
                // Eq(N) → same type as local type N
                resolved = localTypes[decl.ty.value.value];
            }
            // TypeBoundsSubResource creates a type entry but no resolved type
        } else if (decl.tag === ModelTag.InstanceTypeDeclarationAlias) {
            isTypeCreating = true;
            // Alias handling would require outer scope context — skip value
        }

        if (!isTypeCreating) continue;

        localTypes.push(resolved);
        if (resolved) {
            localMap.set(localTypeIdx as ComponentTypeIndex, resolved);
        }
        localTypeIdx++;
    }
    return localMap;
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
