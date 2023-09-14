import { WITModel } from '../parser';
import { ComponentFactoryOptions, JsImports, ResolverContext } from './types';
import { WasmPointer, WasmSize, BindingContext, Tcabi_realloc } from '../binding/types';
import { ModelTag } from '../model/tags';
import { ExternalKind } from '../model/core';
import { ComponentExternalKind } from '../model/exports';
import { ComponentTypeComponent } from '../model/types';

export function produceResolverContext(sections: WITModel, options: ComponentFactoryOptions): ResolverContext {

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
        },

        implComponentInstance: [],
        implComponentTypes: [],
        implComponentFunction: [],
        implComponentResource: [],
        implCoreInstance: [],
        implCoreFunction: [],

    };

    const componentTypeDefinitions: (ComponentTypeComponent)[] = [];
    const indexes = rctx.indexes;
    for (const section of sections) {
        // TODO: process all sections into model
        switch (section.tag) {
            case ModelTag.CoreModule:
                indexes.coreModules.push(section);
                break;
            case ModelTag.ComponentExport:
                indexes.componentExports.push(section);
                break;
            case ModelTag.ComponentImport:
                indexes.componentImports.push(section);
                break;
            case ModelTag.ComponentAliasCoreInstanceExport: {
                switch (section.kind) {
                    case ExternalKind.Func:
                        indexes.coreFunctions.push(section);
                        break;
                    case ExternalKind.Table:
                        indexes.coreTables.push(section);
                        break;
                    case ExternalKind.Memory:
                        indexes.coreMemories.push(section);
                        break;
                    case ExternalKind.Global:
                        indexes.coreGlobals.push(section);
                        break;
                    case ExternalKind.Tag:
                    default:
                        throw new Error(`unexpected section tag: ${section.kind}`);
                }
                break;
            }
            case ModelTag.ComponentAliasInstanceExport: {
                switch (section.kind) {
                    case ComponentExternalKind.Func:
                        indexes.componentFunctions.push(section);
                        break;
                    case ComponentExternalKind.Component:
                        indexes.componentTypes.push(section);
                        break;
                    case ComponentExternalKind.Type:
                        indexes.componentTypes.push(section);
                        break;
                    case ComponentExternalKind.Module:
                    case ComponentExternalKind.Value:
                    case ComponentExternalKind.Instance:
                    default:
                        throw new Error(`unexpected section tag: ${section.kind}`);
                }
                break;
            }
            case ModelTag.CoreInstanceFromExports:
            case ModelTag.CoreInstanceInstantiate:
                indexes.coreInstances.push(section);
                break;
            case ModelTag.ComponentInstanceFromExports:
            case ModelTag.ComponentInstanceInstantiate:
                indexes.componentInstances.push(section);
                break;
            case ModelTag.ComponentTypeFunc:
                indexes.componentTypes.push(section);
                break;
            case ModelTag.ComponentTypeComponent:
                componentTypeDefinitions.push(section);//append later
                break;
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
                indexes.componentTypes.push(section);
                break;
            case ModelTag.ComponentTypeInstance:
                indexes.componentInstances.push(section);
                break;
            case ModelTag.ComponentTypeResource:
                indexes.componentTypeResource.push(section);
                break;
            case ModelTag.CanonicalFunctionLower: {
                indexes.coreFunctions.push(section);
                break;
            }
            case ModelTag.CanonicalFunctionLift: {
                indexes.componentFunctions.push(section);
                break;
            }

            case ModelTag.SkippedSection:
            case ModelTag.CustomSection:
                //drop
                break;
            case ModelTag.ComponentAliasOuter:
            case ModelTag.CanonicalFunctionResourceDrop:
            case ModelTag.CanonicalFunctionResourceNew:
            case ModelTag.CanonicalFunctionResourceRep:
            default:
                throw new Error(`unexpected section tag: ${(section as any).tag}`);
        }
    }

    // indexed with imports first and then function definitions next
    // See https://github.com/bytecodealliance/wasm-interface-types/blob/main/BINARY.md
    indexes.componentTypes = [...componentTypeDefinitions, ...indexes.componentTypes];

    return rctx;
}


export function bindingContextFactory(rctx: ResolverContext, imports: JsImports): BindingContext {
    let memory: WebAssembly.Memory = undefined as any;// TODO
    let cabi_realloc: Tcabi_realloc = undefined as any;// TODO

    function initialize(m: WebAssembly.Memory, cr: Tcabi_realloc) {
        memory = m;
        cabi_realloc = cr;
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
        rootImports: imports,
        utf8Decoder: new TextDecoder(),
        utf8Encoder: new TextEncoder(),
        initialize,
        getView,
        getViewU8,
        getMemory,
        realloc,
        alloc,
        readI32,
        writeI32,
        abort,
    };
    return ctx;
}

export function cacheFactory<TFactory extends Function>(cache: TFactory[], cacheIndex: number, ff: () => TFactory): TFactory {
    if (cache[cacheIndex] !== undefined) {
        return cache[cacheIndex];
    }
    const factory = ff();
    cache[cacheIndex] = factory;
    return factory;
}