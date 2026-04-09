import { WITModel } from '../parser';
import { IndexedElement, ModelTag, TaggedElement } from '../model/tags';
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
        wasmInstantiate: options.wasmInstantiate ?? WebAssembly.instantiate,
        memoizeCache: new Map(),
        resolvedTypes: new Map(),
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
    }

    // indexed with imports first and then function definitions next
    // See https://github.com/bytecodealliance/wasm-interface-types/blob/main/BINARY.md
    rctx.indexes.componentTypes = [...rctx.indexes.componentSections, ...indexes.componentTypes];
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
    const tables = new Map<number, Map<number, unknown>>();
    let nextHandle = 1;

    function getTable(resourceTypeIdx: number): Map<number, unknown> {
        let table = tables.get(resourceTypeIdx);
        if (!table) {
            table = new Map();
            tables.set(resourceTypeIdx, table);
        }
        return table;
    }

    return {
        add(resourceTypeIdx: number, obj: unknown): number {
            const table = getTable(resourceTypeIdx);
            const handle = nextHandle++;
            table.set(handle, obj);
            return handle;
        },
        get(resourceTypeIdx: number, handle: number): unknown {
            const table = getTable(resourceTypeIdx);
            const obj = table.get(handle);
            if (obj === undefined) throw new Error(`Invalid resource handle: ${handle} for type ${resourceTypeIdx}`);
            return obj;
        },
        remove(resourceTypeIdx: number, handle: number): unknown {
            const table = getTable(resourceTypeIdx);
            const obj = table.get(handle);
            if (obj === undefined) throw new Error(`Invalid resource handle: ${handle} for type ${resourceTypeIdx}`);
            table.delete(handle);
            return obj;
        },
        has(resourceTypeIdx: number, handle: number): boolean {
            const table = getTable(resourceTypeIdx);
            return table.has(handle);
        }
    };
}

export function createBindingContext(rctx: ResolverContext, componentImports: JsImports): BindingContext {
    const memory = createMemoryView();
    const allocator = createAllocator();
    const instances = createInstanceTable();
    const resources = createResourceTable();

    function abort() {
        throw new Error('not implemented');
    }
    const ctx: BindingContext = {
        componentImports,
        instances,
        memory,
        allocator,
        resources,
        utf8Decoder: new TextDecoder(),
        utf8Encoder: new TextEncoder(),
        abort,
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
            break;
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
            return rctx.indexes.componentInstances;
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
        case ModelTag.ComponentAliasOuter:
        case ModelTag.CanonicalFunctionResourceDrop:
        case ModelTag.CanonicalFunctionResourceNew:
        case ModelTag.CanonicalFunctionResourceRep:
        default:
            throw new Error(`unexpected section tag: ${tag}`);
    }
}

export function elementByIndex<TTag extends ModelTag, TResult extends { tag: TTag, kind?: ComponentExternalKind | ExternalKind }>(rctx: ResolverContext, template: TResult, index: number): TResult {
    const bucket = bucketByTag(rctx, template.tag, true, template.kind);
    return bucket[index] as TResult;
}
