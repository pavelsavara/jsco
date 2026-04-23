// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import isDebug from 'env:isDebug';
import { WITModel } from '../parser';
import { IndexedElement, ModelTag, TaggedElement } from '../parser/model/tags';
import { ComponentAliasInstanceExport, ComponentOuterAliasKind } from '../parser/model/aliases';
import { ExternalKind } from '../parser/model/core';
import { ComponentExport, ComponentExternalKind } from '../parser/model/exports';
import { defaultVerbosity, LogLevel } from '../utils/assert';
import type { LogFn } from '../utils/assert';
import { ComponentFactoryOptions, ResolvedContext, ResolverContext, StringEncoding } from './types';
import { buildResolvedTypeMap } from './type-resolution';
import type { ComponentImport } from '../parser/model/imports';
import type { ComponentTypeInstance, ComponentTypeResource } from '../parser/model/types';
import { hasJspi } from '../utils/jspi';

function createJspiWrappers(noJspi?: boolean | string[]): { wrapLift?: (fn: Function, exportName?: string) => Function; wrapLower?: (fn: Function) => Function } {
    if (!hasJspi() || noJspi === true) return {};
    return {
        wrapLift: (fn, exportName) => {
            const shouldWrap = Array.isArray(noJspi)
                ? (exportName !== undefined && !noJspi.includes(exportName))
                : true;
            return shouldWrap ? (WebAssembly as any).promising(fn) : fn;
        },
        wrapLower: (fn) => new (WebAssembly as any).Suspending(fn),
    };
}

export function createResolverContext(sections: WITModel, options: ComponentFactoryOptions): ResolverContext {
    // eslint-disable-next-line no-console
    const defaultLogger: LogFn = (phase, _level, ...args) => console.log(`[${phase}]`, ...args);
    const verbose = { ...defaultVerbosity, ...(options as any).verbose };
    const logger = (options as any).logger ?? defaultLogger;
    const jspiWrappers = createJspiWrappers(options.noJspi);
    const rctx: ResolverContext = {
        resolved: {
            wrapLift: jspiWrappers.wrapLift,
            wrapLower: jspiWrappers.wrapLower,
            fixedUpOwnBorrow: new WeakSet(),
            usesNumberForInt64: options.useNumberForInt64 === true,
            useNumberForInt64Methods: Array.isArray(options.useNumberForInt64) ? options.useNumberForInt64 : undefined,
            numberModeLiftingCache: Array.isArray(options.useNumberForInt64) ? new Map() : undefined,
            numberModeLoweringCache: Array.isArray(options.useNumberForInt64) ? new Map() : undefined,
            stringEncoding: StringEncoding.Utf8,
            liftingCache: new Map(),
            loweringCache: new Map(),
            resolvedTypes: new Map(),
            canonicalResourceIds: new Map(),
            ownInstanceResources: new Set(),
            componentSectionCache: new Map(),
            stats: isDebug ? { resolveComponentSection: 0, resolveComponentInstanceInstantiate: 0, createScopedResolverContext: 0, componentSectionCacheHits: 0, componentInstanceCacheHits: 0, coreInstanceCacheHits: 0, coreFunctionCacheHits: 0, componentFunctionCacheHits: 0 } : undefined,
            verbose,
            logger,
        },
        validateTypes: (options.validateTypes === false) ? false : true,
        wasmInstantiate: options.wasmInstantiate ?? ((module, importObject) => WebAssembly.instantiate(module, importObject)),
        importToInstanceIndex: new Map(),
        resourceAliasGroups: new Map(),
        componentInstanceCache: new Map(),
        coreInstanceCache: new Map(),
        coreFunctionCache: new Map(),
        componentFunctionCache: new Map(),
        indexes: {
            componentExports: [],
            componentImports: [],
            componentFunctions: [],
            componentInstances: [],
            componentTypes: [], // this is 2 phase
            componentTypeResource: [],

            coreModules: [],
            coreInstances: [],
            coreFunctions: [],
            coreMemories: [],
            coreTables: [],
            coreGlobals: [],
            componentSections: [],
        },
    };

    populateIndexes(rctx, sections);
    // Previously merged into componentTypes, but this is incorrect: the TYPE sort should
    // only contain entries from section id 7 (type definitions) and type aliases.
    // ComponentInstanceInstantiate.component_index references componentSections (COMPONENT sort),
    // while type_index references componentTypes (TYPE sort).
    setSelfIndex(rctx);
    buildCanonicalResourceIds(rctx);
    rctx.resolved.resolvedTypes = buildResolvedTypeMap(rctx);
    return rctx;
}

/// Creates a scoped ResolverContext for a nested ComponentSection.
/// Nested ComponentSections define their own local index spaces — sort indices
/// within the section reference elements declared inside it, not the parent scope.
/// This function builds local indexes from the section's declarations so that
/// lookups (e.g., component_index in ComponentInstanceInstantiate) resolve correctly.
export function createScopedResolverContext(parentRctx: ResolverContext, sections: TaggedElement[]): ResolverContext {
    if (isDebug && parentRctx.resolved.stats) parentRctx.resolved.stats.createScopedResolverContext++;
    const scopedRctx: ResolverContext = {
        resolved: {
            ...parentRctx.resolved,
            resolvedTypes: new Map(),
            liftingCache: new Map(),
            loweringCache: new Map(),
            canonicalResourceIds: new Map(),
            ownInstanceResources: new Set(),
            verbose: parentRctx.resolved.verbose,
            logger: parentRctx.resolved.logger,
        },
        validateTypes: parentRctx.validateTypes,
        wasmInstantiate: parentRctx.wasmInstantiate,
        importToInstanceIndex: new Map(),
        resourceAliasGroups: new Map(),
        componentInstanceCache: new Map(),
        coreInstanceCache: new Map(),
        coreFunctionCache: new Map(),
        componentFunctionCache: new Map(),
        indexes: {
            componentExports: [],
            componentImports: [],
            componentFunctions: [],
            componentInstances: [],
            componentTypes: [],
            componentTypeResource: [],

            coreModules: [],
            coreInstances: [],
            coreFunctions: [],
            coreMemories: [],
            coreTables: [],
            coreGlobals: [],
            componentSections: [],
        },
    };

    populateIndexes(scopedRctx, sections);
    setSelfIndex(scopedRctx);
    buildCanonicalResourceIds(scopedRctx);
    scopedRctx.resolved.resolvedTypes = buildResolvedTypeMap(scopedRctx);
    return scopedRctx;
}

/** Populate index spaces from parsed sections. Shared by createResolverContext and createScopedResolverContext. */
function populateIndexes(rctx: ResolverContext, sections: Iterable<TaggedElement>): void {
    const indexes = rctx.indexes;
    for (const section of sections) {
        const bucket = bucketByTag(rctx, section.tag, false, (section as any).kind);
        bucket.push(section);

        if (section.tag === ModelTag.ComponentTypeResource) {
            indexes.componentTypeResource.push({ ...section } as ComponentTypeResource);
        }

        // ComponentImport contributions to sort index spaces.
        // Each import kind contributes to its respective sort, and we track the
        // mapping from import index → sort index for kinds that need it at bind time.
        if (section.tag === ModelTag.ComponentImport) {
            const imp = section as ComponentImport;
            if (imp.ty.tag === ModelTag.ComponentTypeRefInstance) {
                // Instance import → instance sort.
                // The ty.value is a type sort index pointing to a ComponentTypeInstance.
                const instanceType = indexes.componentTypes[imp.ty.value];
                if (instanceType) {
                    const instanceIndex = indexes.componentInstances.length;
                    // Shallow clone: the same object lives in componentTypes[] too.
                    // setSelfIndex runs on both arrays, so a shared reference would
                    // get its selfSortIndex clobbered by whichever array runs last.
                    indexes.componentInstances.push({ ...instanceType } as ComponentTypeInstance);
                    const importIndex = indexes.componentImports.length - 1;
                    rctx.importToInstanceIndex.set(importIndex, instanceIndex);
                }
            }
            if (imp.ty.tag === ModelTag.ComponentTypeRefComponent) {
                // Component import → instance sort (for JS binding, imported components
                // are provided as objects with exports, equivalent to instances).
                // Also pushed to componentSections (component sort) so
                // ComponentInstanceInstantiate.component_index can reference it.
                const instanceIndex = indexes.componentInstances.length;
                const componentType = indexes.componentTypes[imp.ty.value];
                if (componentType) {
                    indexes.componentInstances.push({ ...componentType } as ComponentTypeInstance);
                } else {
                    // No type definition found — create a placeholder instance entry
                    indexes.componentInstances.push({ tag: ModelTag.ComponentTypeInstance, declarations: [] } as ComponentTypeInstance);
                }
                indexes.componentSections.push(imp);
                const importIndex = indexes.componentImports.length - 1;
                rctx.importToInstanceIndex.set(importIndex, instanceIndex);
            }
            // Func imports contribute to the component function index space.
            // CanonicalFunctionLower.func_index references imported functions by index.
            if (imp.ty.tag === ModelTag.ComponentTypeRefFunc) {
                indexes.componentFunctions.push(imp);
            }
        }

        // Component model spec: export definitions extend the index space of their kind.
        // An (export "name" (instance N)) creates a new entry in the instance index space, etc.
        if (section.tag === ModelTag.ComponentExport) {
            const exp = section as ComponentExport;
            switch (exp.kind) {
                case ComponentExternalKind.Instance:
                    indexes.componentInstances.push(exp);
                    break;
                case ComponentExternalKind.Func:
                    indexes.componentFunctions.push(exp);
                    break;
                case ComponentExternalKind.Type:
                    indexes.componentTypes.push(exp);
                    break;
                case ComponentExternalKind.Component:
                    indexes.componentSections.push(exp);
                    break;
            }
        }
    }
}

export function setSelfIndex(rctx: ResolverContext) {
    function setSelfIndex(sort: IndexedElement[]) {
        for (let i = 0; i < sort.length; i++) {
            const elem = sort[i];
            if (!elem) throw new Error(`setSelfIndex: missing element at index ${i}`);
            elem.selfSortIndex = i;
        }
    }
    setSelfIndex(rctx.indexes.componentExports);
    setSelfIndex(rctx.indexes.componentImports);
    setSelfIndex(rctx.indexes.componentFunctions);
    setSelfIndex(rctx.indexes.componentInstances);
    setSelfIndex(rctx.indexes.componentTypes);
    setSelfIndex(rctx.indexes.componentTypeResource);

    setSelfIndex(rctx.indexes.coreModules);
    setSelfIndex(rctx.indexes.coreInstances);
    setSelfIndex(rctx.indexes.coreFunctions);
    setSelfIndex(rctx.indexes.coreMemories);
    setSelfIndex(rctx.indexes.coreTables);
    setSelfIndex(rctx.indexes.coreGlobals);
}

/// Builds a map from type index → canonical resource ID.
/// Multiple type aliases to the same resource (from the same instance export)
/// share one canonical ID, ensuring ResourceTable per-type isolation works
/// correctly across different aliases to the same underlying resource.
function buildCanonicalResourceIds(rctx: ResolverContext): void {
    const types = rctx.indexes.componentTypes;
    const map = rctx.resolved.canonicalResourceIds;

    // Phase 1: Assign canonical IDs to resource source types.
    // For ComponentTypeResource: the type index IS the canonical ID.
    //   These are own-instance resources (defined by this component).
    // For ComponentAliasInstanceExport (Type kind): group by (instance_index, name).
    //   First occurrence defines the canonical ID; subsequent aliases get the same ID.

    for (let i = 0; i < types.length; i++) {
        const t = types[i];
        if (!t) throw new Error(`buildCanonicalResourceIds: missing type at index ${i}`);
        if (t.tag === ModelTag.ComponentTypeResource) {
            map.set(i, i);
            rctx.resolved.ownInstanceResources.add(i);
        } else if (t.tag === ModelTag.ComponentAliasInstanceExport) {
            const alias = t as ComponentAliasInstanceExport;
            if (alias.kind === ComponentExternalKind.Type) {
                const key = `${alias.instance_index}:${alias.name}`;
                const existing = rctx.resourceAliasGroups.get(key);
                if (existing !== undefined) {
                    map.set(i, existing);
                } else {
                    rctx.resourceAliasGroups.set(key, i);
                    map.set(i, i);
                }
            }
        }
    }

    if (isDebug && (rctx.resolved.verbose?.resolver ?? 0) >= LogLevel.Summary) {
        const entries: string[] = [];
        for (const [typeIdx, canonicalId] of map) {
            const t = types[typeIdx];
            if (!t) {
                rctx.resolved.logger!('resolver', LogLevel.Summary, `WARNING: canonicalResourceIds references missing type at index ${typeIdx}`);
                continue;
            }
            const label = t.tag === ModelTag.ComponentTypeResource
                ? 'resource'
                : t.tag === ModelTag.ComponentAliasInstanceExport
                    ? `alias(instance=${(t as ComponentAliasInstanceExport).instance_index}, name="${(t as ComponentAliasInstanceExport).name}")`
                    : `tag=${t.tag}`;
            entries.push(`  type[${typeIdx}] → canonical ${canonicalId} (${label})`);
        }
        rctx.resolved.logger!('resolver', LogLevel.Summary,
            `canonicalResourceIds (${map.size} entries): ${entries.join(' | ')}`);
    }
}

/// Resolves a type index to its canonical resource ID.
/// Handles own<T>/borrow<T> (follows .value) and direct resource/alias references.
export function getCanonicalResourceId(rctx: ResolvedContext, resourceTypeIdx: number): number {
    return rctx.canonicalResourceIds?.get(resourceTypeIdx) ?? resourceTypeIdx;
}

export function bucketByTag(rctx: ResolverContext, tag: ModelTag, read: boolean, kind?: ComponentExternalKind | ExternalKind): TaggedElement[] {
    switch (tag) {
        case ModelTag.CoreModule:
            return rctx.indexes.coreModules;
        case ModelTag.ComponentExport:
            return rctx.indexes.componentExports;
        case ModelTag.ComponentImport:
            return rctx.indexes.componentImports;
        case ModelTag.ComponentAliasCoreInstanceExport: {
            switch (kind) {
                case ExternalKind.Func:
                    return rctx.indexes.coreFunctions;
                case ExternalKind.Table:
                    return rctx.indexes.coreTables;
                case ExternalKind.Memory:
                    return rctx.indexes.coreMemories;
                case ExternalKind.Global:
                    return rctx.indexes.coreGlobals;
                case ExternalKind.Tag:
                default:
                    throw new Error(`unexpected section tag: ${kind}`);
            }
            break;
        }
        case ModelTag.ComponentAliasInstanceExport: {
            switch (kind) {
                case ComponentExternalKind.Func:
                    return rctx.indexes.componentFunctions;
                case ComponentExternalKind.Component:
                    return rctx.indexes.componentTypes;
                case ComponentExternalKind.Type:
                    return rctx.indexes.componentTypes;
                case ComponentExternalKind.Instance:
                    return rctx.indexes.componentInstances;
                case ComponentExternalKind.Module:
                case ComponentExternalKind.Value:
                default:
                    throw new Error(`unexpected section tag: ${kind}`);
            }
        }
        case ModelTag.CoreInstanceFromExports:
        case ModelTag.CoreInstanceInstantiate:
            return rctx.indexes.coreInstances;
        case ModelTag.ComponentInstanceFromExports:
        case ModelTag.ComponentInstanceInstantiate:
            return rctx.indexes.componentInstances;
        case ModelTag.ComponentTypeFunc:
            return rctx.indexes.componentTypes;
        case ModelTag.ComponentSection:
            return read
                ? rctx.indexes.componentTypes
                : rctx.indexes.componentSections;//append later
        case ModelTag.ComponentTypeDefinedBorrow:
        case ModelTag.ComponentTypeDefinedEnum:
        case ModelTag.ComponentTypeDefinedErrorContext:
        case ModelTag.ComponentTypeDefinedFlags:
        case ModelTag.ComponentTypeDefinedFuture:
        case ModelTag.ComponentTypeDefinedList:
        case ModelTag.ComponentTypeDefinedOption:
        case ModelTag.ComponentTypeDefinedOwn:
        case ModelTag.ComponentTypeDefinedPrimitive:
        case ModelTag.ComponentTypeDefinedRecord:
        case ModelTag.ComponentTypeDefinedResult:
        case ModelTag.ComponentTypeDefinedStream:
        case ModelTag.ComponentTypeDefinedTuple:
        case ModelTag.ComponentTypeDefinedVariant:
            return rctx.indexes.componentTypes;
        case ModelTag.ComponentTypeInstance:
            return rctx.indexes.componentTypes;
        case ModelTag.ComponentTypeResource:
            // Resource types participate in the unified TYPE sort (section 7).
            // own<T>/borrow<T> reference resources by type index in this unified space.
            // componentTypeResource is populated separately at the call site.
            return rctx.indexes.componentTypes;
        case ModelTag.CanonicalFunctionLower: {
            return rctx.indexes.coreFunctions;
        }
        case ModelTag.CanonicalFunctionLift: {
            return rctx.indexes.componentFunctions;
        }

        case ModelTag.SkippedSection:
        case ModelTag.CustomSection:
            return [];//drop
        case ModelTag.ComponentAliasOuter: {
            // Outer aliases go to the bucket matching their outer alias kind
            switch (kind as unknown as ComponentOuterAliasKind) {
                case ComponentOuterAliasKind.Type:
                    return rctx.indexes.componentTypes;
                case ComponentOuterAliasKind.CoreModule:
                    return rctx.indexes.coreModules;
                case ComponentOuterAliasKind.CoreType:
                    return rctx.indexes.componentTypes;// core types share the type index
                case ComponentOuterAliasKind.Component:
                    return rctx.indexes.componentTypes;
                default:
                    throw new Error(`unexpected outer alias kind: ${kind}`);
            }
        }
        case ModelTag.CanonicalFunctionResourceDrop:
        case ModelTag.CanonicalFunctionResourceNew:
        case ModelTag.CanonicalFunctionResourceRep:
        case ModelTag.CanonicalFunctionBackpressureSet:
        case ModelTag.CanonicalFunctionBackpressureInc:
        case ModelTag.CanonicalFunctionBackpressureDec:
        case ModelTag.CanonicalFunctionTaskReturn:
        case ModelTag.CanonicalFunctionTaskCancel:
        case ModelTag.CanonicalFunctionContextGet:
        case ModelTag.CanonicalFunctionContextSet:
        case ModelTag.CanonicalFunctionThreadYield:
        case ModelTag.CanonicalFunctionSubtaskCancel:
        case ModelTag.CanonicalFunctionSubtaskDrop:
        case ModelTag.CanonicalFunctionStreamNew:
        case ModelTag.CanonicalFunctionStreamRead:
        case ModelTag.CanonicalFunctionStreamWrite:
        case ModelTag.CanonicalFunctionStreamCancelRead:
        case ModelTag.CanonicalFunctionStreamCancelWrite:
        case ModelTag.CanonicalFunctionStreamDropReadable:
        case ModelTag.CanonicalFunctionStreamDropWritable:
        case ModelTag.CanonicalFunctionFutureNew:
        case ModelTag.CanonicalFunctionFutureRead:
        case ModelTag.CanonicalFunctionFutureWrite:
        case ModelTag.CanonicalFunctionFutureCancelRead:
        case ModelTag.CanonicalFunctionFutureCancelWrite:
        case ModelTag.CanonicalFunctionFutureDropReadable:
        case ModelTag.CanonicalFunctionFutureDropWritable:
        case ModelTag.CanonicalFunctionErrorContextNew:
        case ModelTag.CanonicalFunctionErrorContextDebugMessage:
        case ModelTag.CanonicalFunctionErrorContextDrop:
        case ModelTag.CanonicalFunctionWaitableSetNew:
        case ModelTag.CanonicalFunctionWaitableSetWait:
        case ModelTag.CanonicalFunctionWaitableSetPoll:
        case ModelTag.CanonicalFunctionWaitableSetDrop:
        case ModelTag.CanonicalFunctionWaitableJoin:
            return rctx.indexes.coreFunctions;
        default:
            throw new Error(`unexpected section tag: ${tag}`);
    }
}

export function elementByIndex<TTag extends ModelTag, TResult extends { tag: TTag, kind?: ComponentExternalKind | ExternalKind }>(rctx: ResolverContext, template: TResult, index: number): TResult {
    const bucket = bucketByTag(rctx, template.tag, true, template.kind);
    return bucket[index] as TResult;
}
