import { BindingContext } from '../binding/types';
import { ComponentAlias } from '../model/aliases';
import { CanonicalFunction } from '../model/canonicals';
import { ComponentExport } from '../model/exports';
import { ComponentImport } from '../model/imports';
import { ComponentInstance, CoreInstance as CoreInstance } from '../model/instances';
import { ComponentTypeComponent, ComponentTypeDefined, ComponentTypeFunc, ComponentTypeInstance, ComponentTypeResource } from '../model/types';
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
export type ImplComponentExport = (ctx: BindingContext) => JsInterfaceCollection
export type ImplComponentInstance = (ctx: BindingContext) => JsInterface
export type ImplCoreInstance = (ctx: BindingContext) => WebAssembly.Instance
export type ImplComponentTypeComponent = (ctx: BindingContext) => any
export type ImplComponentTypeFunc = (ctx: BindingContext) => any
export type ImplComponentTypeDefined = (ctx: BindingContext) => any
export type ImplComponentTypeResource = (ctx: BindingContext) => any
export type ImplComponentTypeInstance = (ctx: BindingContext) => any

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

    coreInstances: CoreInstance[], implCoreInstance: ImplCoreInstance[]
    componentInstances: ComponentInstance[], implComponentInstance: ImplComponentInstance[]
    componentExports: ComponentExport[]
    componentTypeDefined: ComponentTypeDefined[], implComponentTypeDefined: ImplComponentTypeDefined[]
    componentTypeInstance: ComponentTypeInstance[], implComponentTypeInstance: ImplComponentTypeInstance[]
    componentTypeResource: ComponentTypeResource[], implComponentTypeResource: ImplComponentTypeResource[]
    componentTypeFunc: ComponentTypeFunc[], implComponentTypeFunc: ImplComponentTypeFunc[]
    componentTypeComponent: ComponentTypeComponent[], implComponentTypeComponent: ImplComponentTypeComponent[]

    bindingContextFactory: (imports: JsImports) => BindingContext
    prepareComponentExports: () => ImplComponentExport[]
    prepareComponentInstance: (componentInstanceIndex: number) => ImplComponentInstance
    prepareImplComponentTypeDefined: (componentInstanceIndex: number) => ImplComponentTypeDefined
    prepareImplComponentTypeComponent: (componentInstanceIndex: number) => ImplComponentTypeComponent

    //prepareImplComponentTypeInstance: (componentInstanceIndex: number) => ImplComponentTypeInstance
    //prepareImplComponentTypeResource: (componentInstanceIndex: number) => ImplComponentTypeResource
    //prepareImplComponentTypeFunc: (componentInstanceIndex: number) => ImplComponentTypeFunc
}
