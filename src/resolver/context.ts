import { WITModel } from '../parser';
import { IndexedElement, ModelTag, TaggedElement } from '../model/tags';
import { ExternalKind } from '../model/core';
import { ComponentExternalKind } from '../model/exports';
import { configuration } from '../utils/assert';
import { BindingContext, ComponentFactoryOptions, ResolverContext } from './types';
import { TCabiRealloc, WasmPointer, WasmSize } from './binding/types';
import { JsImports } from './api-types';

export function createResolverContext(sections: WITModel, options: ComponentFactoryOptions): ResolverContext {
    const rctx: ResolverContext = {
        usesNumberForInt64: (options.useNumberForInt64 === true) ? true : false,
        wasmInstantiate: options.wasmInstantiate ?? WebAssembly.instantiate,
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
        // TODO: process all sections into model
        const bucket = bucketByTag(rctx, section.tag, false, (section as any).kind);
        bucket.push(section);
    }

    // indexed with imports first and then function definitions next
    // See https://github.com/bytecodealliance/wasm-interface-types/blob/main/BINARY.md
    rctx.indexes.componentTypes = [...rctx.indexes.componentSections, ...indexes.componentTypes];
    setSelfIndex(rctx);
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

export function createBindingContext(rctx: ResolverContext, componentImports: JsImports): BindingContext {
    let memory: WebAssembly.Memory = undefined as any;
    let cabi_realloc: TCabiRealloc = undefined as any;

    function initializeMemory(m: WebAssembly.Memory) {
        memory = m;
    }
    function initializeRealloc(realloc: TCabiRealloc) {
        cabi_realloc = realloc;
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
    function realloc(oldPtr: WasmPointer, oldSize: WasmSize, align: WasmSize, newSize: WasmSize) {
        return cabi_realloc(oldPtr, oldSize, align, newSize);
    }
    function alloc(newSize: WasmSize, align: WasmSize) {
        return cabi_realloc(0 as any, 0 as any, align, newSize);
    }
    function readI32(ptr: WasmPointer) {
        return getView().getInt32(ptr);
    }
    function writeI32(ptr: WasmPointer, value: number) {
        return getView().setInt32(ptr, value);
    }
    function abort() {
        throw new Error('not implemented');
    }
    const ctx: BindingContext = {
        componentImports,
        coreInstances: [],
        componentInstances: [],
        utf8Decoder: new TextDecoder(),
        utf8Encoder: new TextEncoder(),
        initializeMemory,
        initializeRealloc,
        getView,
        getViewU8,
        getMemory,
        realloc,
        alloc,
        readI32,
        writeI32,
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
            break;
        case ModelTag.ComponentExport:
            return rctx.indexes.componentExports;
            break;
        case ModelTag.ComponentImport:
            return rctx.indexes.componentImports;
            break;
        case ModelTag.ComponentAliasCoreInstanceExport: {
            switch (kind) {
                case ExternalKind.Func:
                    return rctx.indexes.coreFunctions;
                    break;
                case ExternalKind.Table:
                    return rctx.indexes.coreTables;
                    break;
                case ExternalKind.Memory:
                    return rctx.indexes.coreMemories;
                    break;
                case ExternalKind.Global:
                    return rctx.indexes.coreGlobals;
                    break;
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
                    break;
                case ComponentExternalKind.Component:
                    return rctx.indexes.componentTypes;
                    break;
                case ComponentExternalKind.Type:
                    return rctx.indexes.componentTypes;
                    break;
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
