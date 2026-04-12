import { WITModel } from '../parser';
import { IndexedElement, ModelTag, TaggedElement } from '../model/tags';
import { ComponentAliasInstanceExport, ComponentOuterAliasKind } from '../model/aliases';
import { ExternalKind } from '../model/core';
import { ComponentExport, ComponentExternalKind } from '../model/exports';
import { configuration, defaultVerbosity, isDebug, LogLevel } from '../utils/assert';
import type { LogFn, Verbosity } from '../utils/assert';
import { BindingContext, ComponentFactoryOptions, MemoryView, Allocator, InstanceTable, ResolvedContext, ResolverContext, ResourceTable, StringEncoding } from './types';
import { TCabiRealloc, WasmPointer, WasmSize } from './binding/types';
import { JsImports } from './api-types';
import { buildResolvedTypeMap } from './type-resolution';
import type { ComponentImport } from '../model/imports';
import type { ComponentTypeInstance } from '../model/types';

export function createResolverContext(sections: WITModel, options: ComponentFactoryOptions): ResolverContext {
    // eslint-disable-next-line no-console
    const defaultLogger: LogFn = (phase, _level, ...args) => console.log(`[${phase}]`, ...args);
    const verbose = { ...defaultVerbosity, ...options.verbose };
    const logger = options.logger ?? defaultLogger;
    const rctx: ResolverContext = {
        resolved: {
            jspi: options.jspi === true,
            usesNumberForInt64: (options.useNumberForInt64 === true) ? true : false,
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

    const indexes = rctx.indexes;
    for (const section of sections) {
        const bucket = bucketByTag(rctx, section.tag, false, (section as any).kind);
        bucket.push(section);

        if (section.tag === ModelTag.ComponentTypeResource) {
            rctx.indexes.componentTypeResource.push({ ...section } as any);
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
                    indexes.componentInstances.push({ tag: ModelTag.ComponentTypeInstance, declarations: [] } as any);
                }
                indexes.componentSections.push(imp as any);
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
                    indexes.componentInstances.push(exp as any);
                    break;
                case ComponentExternalKind.Func:
                    indexes.componentFunctions.push(exp as any);
                    break;
                case ComponentExternalKind.Type:
                    indexes.componentTypes.push(exp as any);
                    break;
                case ComponentExternalKind.Component:
                    indexes.componentSections.push(exp as any);
                    break;
            }
        }
    }
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

    const indexes = scopedRctx.indexes;
    for (const section of sections) {
        const bucket = bucketByTag(scopedRctx, section.tag, false, (section as any).kind);
        bucket.push(section);

        if (section.tag === ModelTag.ComponentTypeResource) {
            indexes.componentTypeResource.push({ ...section } as any);
        }

        if (section.tag === ModelTag.ComponentImport) {
            const imp = section as ComponentImport;
            if (imp.ty.tag === ModelTag.ComponentTypeRefInstance) {
                const instanceType = indexes.componentTypes[imp.ty.value];
                if (instanceType) {
                    const instanceIndex = indexes.componentInstances.length;
                    indexes.componentInstances.push({ ...instanceType } as ComponentTypeInstance);
                    const importIndex = indexes.componentImports.length - 1;
                    scopedRctx.importToInstanceIndex.set(importIndex, instanceIndex);
                }
            }
            if (imp.ty.tag === ModelTag.ComponentTypeRefComponent) {
                const instanceIndex = indexes.componentInstances.length;
                const componentType = indexes.componentTypes[imp.ty.value];
                if (componentType) {
                    indexes.componentInstances.push({ ...componentType } as ComponentTypeInstance);
                } else {
                    indexes.componentInstances.push({ tag: ModelTag.ComponentTypeInstance, declarations: [] } as any);
                }
                indexes.componentSections.push(imp as any);
                const importIndex = indexes.componentImports.length - 1;
                scopedRctx.importToInstanceIndex.set(importIndex, instanceIndex);
            }
            if (imp.ty.tag === ModelTag.ComponentTypeRefFunc) {
                indexes.componentFunctions.push(imp);
            }
        }

        // Component model spec: export definitions extend the index space of their kind.
        if (section.tag === ModelTag.ComponentExport) {
            const exp = section as ComponentExport;
            switch (exp.kind) {
                case ComponentExternalKind.Instance:
                    indexes.componentInstances.push(exp as any);
                    break;
                case ComponentExternalKind.Func:
                    indexes.componentFunctions.push(exp as any);
                    break;
                case ComponentExternalKind.Type:
                    indexes.componentTypes.push(exp as any);
                    break;
                case ComponentExternalKind.Component:
                    indexes.componentSections.push(exp as any);
                    break;
            }
        }
    }

    setSelfIndex(scopedRctx);
    buildCanonicalResourceIds(scopedRctx);
    scopedRctx.resolved.resolvedTypes = buildResolvedTypeMap(scopedRctx);
    return scopedRctx;
}

export function setSelfIndex(rctx: ResolverContext) {
    function setSelfIndex(sort: IndexedElement[]) {
        for (let i = 0; i < sort.length; i++) {
            sort[i].selfSortIndex = i;
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

export function createMemoryView(): MemoryView {
    let memory: WebAssembly.Memory = undefined as any;

    function initialize(m: WebAssembly.Memory) {
        memory = m;
    }
    function getView(pointer?: number, len?: number) {
        return new DataView(memory.buffer, pointer, len);
    }
    function getViewU8(pointer?: number, len?: number) {
        return new Uint8Array(memory.buffer, pointer, len);
    }
    function getMemory() {
        return memory;
    }
    function readI32(ptr: WasmPointer) {
        return getView().getInt32(ptr);
    }
    function writeI32(ptr: WasmPointer, value: number) {
        return getView().setInt32(ptr, value);
    }
    return { initialize, getMemory, getView, getViewU8, readI32, writeI32 };
}

export function createAllocator(): Allocator {
    let cabi_realloc: TCabiRealloc = undefined as any;

    function initialize(realloc: TCabiRealloc) {
        cabi_realloc = realloc;
    }
    function realloc(oldPtr: WasmPointer, oldSize: WasmSize, align: WasmSize, newSize: WasmSize) {
        return cabi_realloc(oldPtr, oldSize, align, newSize);
    }
    function alloc(newSize: WasmSize, align: WasmSize) {
        return cabi_realloc(0 as any, 0 as any, align, newSize);
    }
    return { initialize, alloc, realloc };
}

export function createInstanceTable(): InstanceTable {
    return {
        coreInstances: [],
        componentInstances: [],
    };
}

export function createResourceTable(verbose?: Verbosity, logger?: LogFn): ResourceTable {
    let nextHandle = 1;

    // Resource handle table — handles are globally unique (monotonic counter).
    // Each handle stores the canonical resource type index (the unified type
    // index of the ComponentTypeResource definition). own<T>/borrow<T> both
    // use the same canonical index (their .value field), so per-type isolation
    // is enforced: get/remove/has validate that the requested type matches.
    const handles = new Map<number, { typeIdx: number; obj: unknown; numLends: number }>();

    function getEntry(resourceTypeIdx: number, handle: number) {
        const entry = handles.get(handle);
        if (entry === undefined) throw new Error(`Invalid resource handle: ${handle}`);
        if (entry.typeIdx !== resourceTypeIdx) throw new Error(`Resource handle ${handle} belongs to type ${entry.typeIdx}, not ${resourceTypeIdx}`);
        return entry;
    }

    return {
        add(resourceTypeIdx: number, obj: unknown): number {
            const handle = nextHandle++;
            handles.set(handle, { typeIdx: resourceTypeIdx, obj, numLends: 0 });
            if (isDebug && (verbose?.executor ?? 0) >= LogLevel.Detailed) {
                logger!('executor', LogLevel.Detailed, `resource.add(typeIdx=${resourceTypeIdx}, handle=${handle})`);
            }
            return handle;
        },
        get(resourceTypeIdx: number, handle: number): unknown {
            const entry = getEntry(resourceTypeIdx, handle);
            if (isDebug && (verbose?.executor ?? 0) >= LogLevel.Detailed) {
                logger!('executor', LogLevel.Detailed, `resource.get(typeIdx=${resourceTypeIdx}, handle=${handle})`);
            }
            return entry.obj;
        },
        remove(resourceTypeIdx: number, handle: number): unknown {
            const entry = getEntry(resourceTypeIdx, handle);
            if (entry.numLends !== 0) throw new Error(`Cannot drop resource handle ${handle}: ${entry.numLends} outstanding borrow(s)`);
            handles.delete(handle);
            if (isDebug && (verbose?.executor ?? 0) >= LogLevel.Detailed) {
                logger!('executor', LogLevel.Detailed, `resource.remove(typeIdx=${resourceTypeIdx}, handle=${handle})`);
            }
            return entry.obj;
        },
        has(resourceTypeIdx: number, handle: number): boolean {
            const entry = handles.get(handle);
            return entry !== undefined && entry.typeIdx === resourceTypeIdx;
        },
        lend(resourceTypeIdx: number, handle: number): void {
            const entry = getEntry(resourceTypeIdx, handle);
            entry.numLends++;
            if (isDebug && (verbose?.executor ?? 0) >= LogLevel.Detailed) {
                logger!('executor', LogLevel.Detailed, `resource.lend(typeIdx=${resourceTypeIdx}, handle=${handle}, numLends=${entry.numLends})`);
            }
        },
        unlend(resourceTypeIdx: number, handle: number): void {
            const entry = getEntry(resourceTypeIdx, handle);
            if (entry.numLends <= 0) throw new Error(`Cannot unlend resource handle ${handle}: no outstanding borrows`);
            entry.numLends--;
            if (isDebug && (verbose?.executor ?? 0) >= LogLevel.Detailed) {
                logger!('executor', LogLevel.Detailed, `resource.unlend(typeIdx=${resourceTypeIdx}, handle=${handle}, numLends=${entry.numLends})`);
            }
        },
        lendCount(resourceTypeIdx: number, handle: number): number {
            const entry = getEntry(resourceTypeIdx, handle);
            return entry.numLends;
        }
    };
}

export function createBindingContext(componentImports: JsImports, resolved: ResolvedContext): BindingContext {
    const memory = createMemoryView();
    const allocator = createAllocator();
    const instances = createInstanceTable();
    const resources = createResourceTable(resolved.verbose, resolved.logger);

    const ctx: BindingContext = {
        componentImports,
        instances,
        memory,
        allocator,
        resources,
        utf8Decoder: new TextDecoder('utf-8', { fatal: true }),
        utf8Encoder: new TextEncoder(),
        verbose: resolved.verbose,
        logger: resolved.logger,
        abort: () => {
            // Per Component Model spec: poisoning the instance prevents all future
            // export calls from executing. checkNotPoisoned() in the lifting
            // trampoline enforces this.
            ctx.poisoned = true;
        },
    };
    if (configuration === 'Debug') {
        ctx.debugStack = [];
    }
    return ctx;
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
        case ModelTag.ComponentTypeDefinedFlags:
        case ModelTag.ComponentTypeDefinedList:
        case ModelTag.ComponentTypeDefinedOption:
        case ModelTag.ComponentTypeDefinedOwn:
        case ModelTag.ComponentTypeDefinedPrimitive:
        case ModelTag.ComponentTypeDefinedRecord:
        case ModelTag.ComponentTypeDefinedResult:
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
            return rctx.indexes.coreFunctions;
        default:
            throw new Error(`unexpected section tag: ${tag}`);
    }
}

export function elementByIndex<TTag extends ModelTag, TResult extends { tag: TTag, kind?: ComponentExternalKind | ExternalKind }>(rctx: ResolverContext, template: TResult, index: number): TResult {
    const bucket = bucketByTag(rctx, template.tag, true, template.kind);
    return bucket[index] as TResult;
}
