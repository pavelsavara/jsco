import { BindingContext } from '../binding/types';
import { ComponentAliasCoreInstanceExport, ComponentAliasInstanceExport } from '../model/aliases';
import { CanonicalFunctionLift, CanonicalFunctionLower } from '../model/canonicals';
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
export type ImplComponentTypeComponent = (ctx: BindingContext, args: any[]) => JsInterface
export type ImplComponentFunction = (ctx: BindingContext) => any
export type ImplComponentType = (ctx: BindingContext) => any
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
    coreModules: CoreModule[]
    other: WITSection[]

    coreInstances: CoreInstance[], implCoreInstance: ImplCoreInstance[]
    coreFunctions: (ComponentAliasCoreInstanceExport | CanonicalFunctionLower)[]
    coreMemories: (ComponentAliasCoreInstanceExport)[]
    coreGlobals: (ComponentAliasCoreInstanceExport)[]
    coreTables: (ComponentAliasCoreInstanceExport)[]

    componentExports: ComponentExport[]
    componentInstances: (ComponentInstance | ComponentTypeInstance)[],
    componentTypeResource: ComponentTypeResource[],
    componentFunctions: (ComponentAliasInstanceExport | CanonicalFunctionLift)[],
    componentTypes: (ComponentTypeComponent | ComponentTypeFunc | ComponentTypeDefined | ComponentAliasInstanceExport)[],

    implComponentInstance: ImplComponentInstance[]
    implComponentResource: ImplComponentTypeResource[]
    implComponentFunction: ImplComponentFunction[]
    implComponentTypes: ImplComponentType[]
}
