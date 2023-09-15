import { Tcabi_realloc, WasmPointer, WasmSize } from './binding/types';
import { ComponentAliasCoreInstanceExport, ComponentAliasInstanceExport } from '../model/aliases';
import { CanonicalFunctionLift, CanonicalFunctionLower } from '../model/canonicals';
import { ComponentExport } from '../model/exports';
import { ComponentImport } from '../model/imports';
import { ComponentInstance, CoreInstance as CoreInstance } from '../model/instances';
import { ModelTag } from '../model/tags';
import { ComponentTypeDefined, ComponentTypeFunc, ComponentTypeInstance, ComponentTypeResource } from '../model/types';
import { WITModel } from '../parser';
import { ComponentSection, CoreModule } from '../parser/types';

export type ComponentFactoryOptions = {
    useNumberForInt64?: boolean
    wasmInstantiate?: typeof WebAssembly.instantiate
}

export type JsInterface = Record<string, Function>;
export type JsInterfaceCollection = Record<string, JsInterface>;

export type WasmComponentInstance<TJSExports> = {
    exports: JsExports<TJSExports>
    abort: () => void
}
export type JsExports<TJSExports> = TJSExports & JsInterfaceCollection
export type JsImports = JsInterfaceCollection

export type WasmComponent<TJSExports> = {
    resolverContext: any; // ResolverContext is not public type
    instantiate: WasmComponentFactory<TJSExports>
}
export type WasmComponentFactory<TJSExports> = (imports?: JsImports) => Promise<WasmComponentInstance<TJSExports>>

export type ImplComponentFactory = () => Promise<WasmComponentInstance<any>>
export type ImplFactory = (ctx: BindingContext, imports: any) => Promise<any>
export type NamedImplFactory = { name: string, factory: ImplFactory }

export type ComponentFactoryInput = WITModel
    | string
    | ArrayLike<number>
    | ReadableStream<Uint8Array>
    | Response
    | PromiseLike<Response>


export type IndexedModel = {
    coreModules: CoreModule[]
    coreInstances: CoreInstance[],
    coreFunctions: (ComponentAliasCoreInstanceExport | CanonicalFunctionLower)[]
    coreMemories: (ComponentAliasCoreInstanceExport)[]
    coreGlobals: (ComponentAliasCoreInstanceExport)[]
    coreTables: (ComponentAliasCoreInstanceExport)[]

    componentImports: ComponentImport[]
    componentExports: ComponentExport[]
    componentInstances: (ComponentInstance | ComponentTypeInstance)[],
    componentTypeResource: ComponentTypeResource[],
    componentFunctions: (ComponentAliasInstanceExport | CanonicalFunctionLift)[],
    componentTypes: (ComponentSection | ComponentTypeFunc | ComponentTypeDefined | ComponentAliasInstanceExport)[],
}

export type ResolverContext = {
    indexes: IndexedModel;
    usesNumberForInt64: boolean
    wasmInstantiate: (moduleObject: WebAssembly.Module, importObject?: WebAssembly.Imports) => Promise<WebAssembly.Instance>
    resolveCache: Map<ModelTag, Promise<Function>[]>
    debugStack?: string[]
}

export type BindingContext = {
    rootImports: JsImports
    coreInstances: WebAssembly.Instance[];
    componentInstances: WasmComponentInstance<any>[]
    initialize(memory: WebAssembly.Memory, cabi_realloc: Tcabi_realloc): void;
    utf8Decoder: TextDecoder;
    utf8Encoder: TextEncoder;
    getMemory: () => WebAssembly.Memory;
    getView: (ptr: WasmPointer, len: WasmSize) => DataView;
    getViewU8: (ptr: WasmPointer, len: WasmSize) => Uint8Array;
    alloc: (newSize: WasmSize, align: WasmSize) => WasmPointer;
    realloc: (oldPtr: WasmPointer, oldSize: WasmSize, align: WasmSize, newSize: WasmSize) => WasmPointer;
    readI32: (ptr: WasmPointer) => number;
    writeI32: (ptr: WasmPointer, value: number) => void;
    abort: () => void;
    debugStack?: string[];
}
