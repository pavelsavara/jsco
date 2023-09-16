import { TCabiRealloc, WasmPointer, WasmSize } from './binding/types';
import { ComponentAliasCoreInstanceExport, ComponentAliasInstanceExport, ComponentFunction, CoreFunction } from '../model/aliases';
import { CanonicalFunctionLower, CanonicalFunctionLift } from '../model/canonicals';
import { ComponentExport } from '../model/exports';
import { ComponentImport } from '../model/imports';
import { CoreInstance, ComponentInstance } from '../model/instances';
import { ComponentTypeInstance, ComponentTypeResource, ComponentTypeFunc, ComponentTypeDefined, ComponentType } from '../model/types';
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
    coreInstances: BinderRes<WebAssembly.Instance>[];
    componentInstances: BinderRes<WasmComponentInstance<any>>[]
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

export type Resolver<TModelElement, TBinderArguments, TBinderResult> = (rctx: ResolverContext, args: ResolverArgs<TModelElement>) => ResolverRes<TModelElement, TBinderArguments, TBinderResult>
export type Binder<TArguments, TResult> = (bctx: BindingContext, args: BinderArgs<TArguments>) => Promise<BinderRes<TResult>>

export type ResolverArgs<TModelElement> = {
    callerElement: ModelElement
    element: TModelElement
}

export type ResolverRes<TModelElement, TBinderArguments, TBinderResult> = {
    callerElement: ModelElement
    element: TModelElement
    binder: Binder<TBinderArguments, TBinderResult>
}

export type BinderArgs<TArguments> = {
    callerArgs?: BinderArgs<any>
    arguments: TArguments
    imports?: any
    debugStack?: string[]
}

export type BinderRes<TResult> = {
    result: TResult
}
