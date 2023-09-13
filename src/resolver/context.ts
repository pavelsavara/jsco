import { WITModel } from '../parser';
import { ComponentFactoryOptions, JsImports, ResolverContext } from './types';
import { WasmPointer, WasmSize, BindingContext, Tcabi_realloc } from '../binding/types';
import { prepareComponentExports } from './component-exports';
import { prepareComponentInstance } from './component-instance';
import { prepareComponentTypeComponent } from './component-type-component';
import { ModelTag } from '../model/tags';
import { prepareComponentTypeDefined } from './component-type-defined';

export function produceResolverContext(sections: WITModel, options: ComponentFactoryOptions): ResolverContext {
    function bindingContextFactory(imports: JsImports): BindingContext {
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
            imports,
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

    const dummyOnIndexZero = { tag: 'this is dummy on index 0 because references are 1 based' } as any;
    const rctx: ResolverContext = {
        usesNumberForInt64: (options.useNumberForInt64 === true) ? true : false,
        componentImports: [],
        modules: [],
        other: [],
        componentTypeComponent: [], implComponentTypeComponent: [],
        componentTypeDefined: [], implComponentTypeDefined: [],
        componentTypeInstance: [], implComponentTypeInstance: [],
        componentTypeResource: [], implComponentTypeResource: [],
        componentTypeFunc: [], implComponentTypeFunc: [],

        aliases: [],
        cannon: [],

        coreInstances: [], implCoreInstance: [],
        componentInstances: [dummyOnIndexZero], implComponentInstance: [],
        componentExports: [],


        bindingContextFactory,
        prepareComponentExports: () => prepareComponentExports(rctx),
        prepareComponentInstance: (componentIndex: number) => prepareComponentInstance(rctx, componentIndex),
        prepareImplComponentTypeComponent: (componentIndex: number) => prepareComponentTypeComponent(rctx, componentIndex),
        prepareImplComponentTypeDefined: (componentIndex: number) => prepareComponentTypeDefined(rctx, componentIndex),
    };

    for (const section of sections) {
        // TODO: process all sections into model
        switch (section.tag) {
            case ModelTag.CoreModule:
                rctx.modules.push(section);
                break;
            case ModelTag.ComponentExport:
                rctx.componentExports.push(section);
                break;
            case ModelTag.ComponentImport:
                rctx.componentImports.push(section);
                break;
            case ModelTag.ComponentAliasOuter:
            case ModelTag.ComponentAliasCoreInstanceExport:
            case ModelTag.ComponentAliasInstanceExport:
                rctx.aliases.push(section);
                break;
            case ModelTag.CoreInstanceFromExports:
            case ModelTag.CoreInstanceInstantiate:
                rctx.coreInstances.push(section);
                break;
            case ModelTag.ComponentInstanceFromExports:
            case ModelTag.ComponentInstanceInstantiate:
                rctx.componentInstances.push(section);
                break;
            case ModelTag.ComponentTypeFunc:
                rctx.componentTypeFunc.push(section);
                break;
            case ModelTag.ComponentTypeComponent:
                rctx.componentTypeComponent.push(section);
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
                rctx.componentTypeDefined.push(section);
                break;
            case ModelTag.ComponentTypeInstance:
                rctx.componentTypeInstance.push(section);
                break;
            case ModelTag.ComponentTypeResource:
                rctx.componentTypeResource.push(section);
                break;
            case ModelTag.CanonicalFunctionLower:
            case ModelTag.CanonicalFunctionLift:
            case ModelTag.CanonicalFunctionResourceDrop:
            case ModelTag.CanonicalFunctionResourceNew:
            case ModelTag.CanonicalFunctionResourceRep:
                rctx.cannon.push(section);
                break;
            case ModelTag.SkippedSection:
            case ModelTag.CustomSection:
                rctx.other.push(section);
                break;
            default:
                throw new Error(`unexpected section tag: ${(section as any).tag}`);
        }
    }

    return rctx;
}


