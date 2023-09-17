import { TCabiRealloc, WasmPointer, WasmSize } from './binding/types';
import { ComponentAliasCoreInstanceExport, ComponentFunction, CoreFunction } from '../model/aliases';
import { ComponentExport } from '../model/exports';
import { ComponentImport } from '../model/imports';
import { CoreInstance, ComponentInstance } from '../model/instances';
import { ComponentTypeResource, ComponentType } from '../model/types';
import { WITModel } from '../parser';
import { CoreModule, ComponentSection } from '../parser/types';
import { ModelElement } from '../model/tags';
import { JsImports, WasmComponentInstance } from './api-types';

export type ComponentFactoryOptions = {
    useNumberForInt64?: boolean
    wasmInstantiate?: typeof WebAssembly.instantiate
}

export type ComponentFactoryInput = WITModel
    | string
    | ArrayLike<number>
    | ReadableStream<Uint8Array>
    | Response
    | PromiseLike<Response>


export type IndexedModel = {
    coreModules: CoreModule[]
    coreInstances: CoreInstance[],
    coreFunctions: CoreFunction[]
    coreMemories: ComponentAliasCoreInstanceExport[]
    coreGlobals: ComponentAliasCoreInstanceExport[]
    coreTables: ComponentAliasCoreInstanceExport[]

    componentImports: ComponentImport[]
    componentExports: ComponentExport[]
    componentInstances: ComponentInstance[],
    componentTypeResource: ComponentTypeResource[],
    componentFunctions: ComponentFunction[],
    componentTypes: ComponentType[],
    componentSections: ComponentSection[]// append to componentTypes
}

export type ResolverContext = {
    indexes: IndexedModel;
    usesNumberForInt64: boolean
    wasmInstantiate: (moduleObject: WebAssembly.Module, importObject?: WebAssembly.Imports) => Promise<WebAssembly.Instance>
}

export type BindingContext = {
    componentImports: JsImports
    coreInstances: BinderRes[];
    componentInstances: BinderRes[]
    initializeMemory(memory: WebAssembly.Memory): void;
    initializeRealloc(cabi_realloc: TCabiRealloc): void;
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

export type Resolver<TModelElement> = (rctx: ResolverContext, args: ResolverArgs<TModelElement>) => ResolverRes
export type Binder = (bctx: BindingContext, args: BinderArgs) => Promise<BinderRes>

export type ResolverArgs<TModelElement> = {
    callerElement: ModelElement
    element: TModelElement
}

export type ResolverRes = {
    callerElement: ModelElement
    element: ModelElement
    binder: Binder
}

export type BinderArgs = {
    callerArgs?: BinderArgs
    arguments?: any[]
    imports?: any
    debugStack?: string[]
}

export type BinderRes = {
    result: any
}
