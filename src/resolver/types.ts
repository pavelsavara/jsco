import { BindingContext } from '../binding/types';
import { ComponentAlias } from '../model/aliases';
import { CanonicalFunction } from '../model/canonicals';
import { ComponentExport } from '../model/exports';
import { ComponentImport } from '../model/imports';
import { ComponentInstance, Instance as CoreInstance } from '../model/instances';
import { ComponentType, ComponentTypeComponent, ComponentTypeDefined, ComponentTypeFunc, ComponentTypeInstance, ComponentTypeResource } from '../model/types';
import { WITModel } from '../parser';
import { CoreModule, WITSection } from '../parser/types';

export type ComponentFactoryOptions = {
    useNumberForInt64?: boolean
    wasmInstantiate?: typeof WebAssembly.instantiate
}

export type JsInterface = Record<string, Function>;
export type JsInterfaceCollection = Record<string, JsInterface>;

export type WasmComponent<TJSExports> = {
    exports: JsExports<TJSExports>
    abort: () => void
}
export type JsExports<TJSExports> = TJSExports & JsInterfaceCollection
export type JsImports = JsInterfaceCollection

export type ComponentFactory<TJSExports> = (imports?: JsImports) => WasmComponent<TJSExports>

export type WasmComponentFactory = () => WasmComponent<any>
export type ImplComponentExportFactory = (ctx: BindingContext) => JsInterfaceCollection
export type ImplComponentInstanceFactory = (ctx: BindingContext) => JsInterface
export type ImplCoreInstanceFactory = (ctx: BindingContext) => WebAssembly.Instance
export type ImplComponentTypeFactory = (ctx: BindingContext) => any
export type ImplFunctionTypeFactory = (ctx: BindingContext) => any
export type ImplDefinedTypeFactory = (ctx: BindingContext) => any
export type ImplInstanceTypeFactory = (ctx: BindingContext) => any
export type ImplResourceTypeFactory = (ctx: BindingContext) => any

export type ComponentFactoryInput = WITModel
    | string
    | ArrayLike<number>
    | ReadableStream<Uint8Array>
    | Response
    | PromiseLike<Response>


export type ResolverContext = {

    usesNumberForInt64: boolean
    componentImports: ComponentImport[]
    modules: CoreModule[]
    aliases: ComponentAlias[]
    cannon: CanonicalFunction[]
    other: WITSection[]

    coreInstances: CoreInstance[], coreInstanceFactories: ImplCoreInstanceFactory[]

    definedType: ComponentTypeDefined[], definedTypeFactories: ImplDefinedTypeFactory[]
    functionType: ComponentTypeFunc[], functionTypeFactories: ImplFunctionTypeFactory[]
    componentType: ComponentTypeComponent[], componentTypeFactories: ImplComponentTypeFactory[]
    instanceType: ComponentTypeInstance[], instanceTypeFactories: ImplInstanceTypeFactory[]
    resourceType: ComponentTypeResource[], resourceTypeFactories: ImplResourceTypeFactory[]
    componentInstances: ComponentInstance[], componentInstanceFactories: ImplComponentInstanceFactory[]
    componentExports: ComponentExport[]

    // this is the same thing ?
    bindingContextFactory: (imports: JsImports) => BindingContext

    prepareComponentExports: () => ImplComponentExportFactory[]
    prepareComponentInstance: (componentInstanceIndex: number) => ImplComponentInstanceFactory
    prepareComponentType: (componentInstanceIndex: number) => ImplComponentTypeFactory
    prepareDefinedType: (componentInstanceIndex: number) => ImplDefinedTypeFactory
    prepareFunctionType: (functionIndex: number) => ImplFunctionTypeFactory
}
