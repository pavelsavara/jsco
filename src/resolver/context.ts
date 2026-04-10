import { WITModel } from '../parser';
import { IndexedElement, ModelTag, TaggedElement } from '../model/tags';
import { ComponentOuterAliasKind } from '../model/aliases';
import { ExternalKind } from '../model/core';
import { ComponentExternalKind } from '../model/exports';
import { configuration } from '../utils/assert';
import { BindingContext, ComponentFactoryOptions, MemoryView, Allocator, InstanceTable, ResolverContext, ResourceTable } from './types';
import { TCabiRealloc, WasmPointer, WasmSize } from './binding/types';
import { JsImports } from './api-types';
import { buildResolvedTypeMap } from './type-resolution';

export function createResolverContext(sections: WITModel, options: ComponentFactoryOptions): ResolverContext {
    const rctx: ResolverContext = {
        usesNumberForInt64: (options.useNumberForInt64 === true) ? true : false,
        wasmInstantiate: options.wasmInstantiate ?? ((module, importObject) => WebAssembly.instantiate(module, importObject)),
        memoizeCache: new Map(),
        resolvedTypes: new Map(),
        importToInstanceIndex: new Map(),
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

        // ComponentImport with Instance kind creates an entry in the instance sort.
        // The instance sort is built from imports (instance kind) + instance sections,
        // in binary order. The imported instance's type definition (ComponentTypeInstance)
        // is looked up from componentTypes and pushed to componentInstances.
        if (section.tag === ModelTag.ComponentImport) {
            const imp = section as import('../model/imports').ComponentImport;
            if (imp.ty.tag === ModelTag.ComponentTypeRefInstance) {
                // The ty.value is a type sort index pointing to a ComponentTypeInstance
                const instanceType = indexes.componentTypes[imp.ty.value];
                if (instanceType) {
                    const instanceIndex = indexes.componentInstances.length;
                    // Shallow clone: the same object lives in componentTypes[] too.
                    // setSelfIndex runs on both arrays, so a shared reference would
                    // get its selfSortIndex clobbered by whichever array runs last.
                    // Cloning lets each array track its own position.
                    indexes.componentInstances.push({ ...instanceType } as import('../model/types').ComponentTypeInstance);
                    // Track import→instance mapping: import's position in componentImports
                    // may differ from its position in componentInstances when there are
                    // non-instance imports or other entries in the instance sort.
                    const importIndex = indexes.componentImports.length - 1;
                    rctx.importToInstanceIndex.set(importIndex, instanceIndex);
                }
            }
            // Func imports contribute to the component function index space.
            // CanonicalFunctionLower.func_index may reference imported functions.
            if (imp.ty.tag === ModelTag.ComponentTypeRefFunc) {
                indexes.componentFunctions.push(imp);
            }
        }
    }

    // componentSections (section id 4) are in the COMPONENT sort — separate from TYPE sort.
    // Previously merged into componentTypes, but this is incorrect: the TYPE sort should
    // only contain entries from section id 7 (type definitions) and type aliases.
    // ComponentInstanceInstantiate.component_index references componentSections (COMPONENT sort),
    // while type_index references componentTypes (TYPE sort).
    setSelfIndex(rctx);
    rctx.resolvedTypes = buildResolvedTypeMap(rctx);
    return rctx;
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

export function createResourceTable(): ResourceTable {
    let nextHandle = 1;

    // Resource handle table — handles are globally unique (monotonic counter).
    // We store the resourceTypeIdx alongside each handle for validation.
    // Lookups use the flat handle map because own<T>/borrow<T> local type indices
    // may differ across function type contexts even when referencing the same
    // canonical resource. Full resource identity resolution (local→canonical mapping)
    // would enable strict per-type isolation.
    const handles = new Map<number, { typeIdx: number; obj: unknown }>();

    return {
        add(resourceTypeIdx: number, obj: unknown): number {
            const handle = nextHandle++;
            handles.set(handle, { typeIdx: resourceTypeIdx, obj });
            return handle;
        },
        get(_resourceTypeIdx: number, handle: number): unknown {
            const entry = handles.get(handle);
            if (entry === undefined) throw new Error(`Invalid resource handle: ${handle}`);
            return entry.obj;
        },
        remove(_resourceTypeIdx: number, handle: number): unknown {
            const entry = handles.get(handle);
            if (entry === undefined) throw new Error(`Invalid resource handle: ${handle}`);
            handles.delete(handle);
            return entry.obj;
        },
        has(_resourceTypeIdx: number, handle: number): boolean {
            return handles.has(handle);
        }
    };
}

export function createBindingContext(rctx: ResolverContext, componentImports: JsImports): BindingContext {
    const memory = createMemoryView();
    const allocator = createAllocator();
    const instances = createInstanceTable();
    const resources = createResourceTable();

    const ctx: BindingContext = {
        componentImports,
        instances,
        memory,
        allocator,
        resources,
        utf8Decoder: new TextDecoder(),
        utf8Encoder: new TextEncoder(),
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
                case ComponentExternalKind.Module:
                case ComponentExternalKind.Value:
                case ComponentExternalKind.Instance:
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
            return rctx.indexes.componentTypeResource;
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
