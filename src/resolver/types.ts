import { BindingContext } from '../binding/types';
import { ComponentAlias } from '../model/aliases';
import { CanonicalFunction } from '../model/canonicals';
import { ComponentExport } from '../model/exports';
import { ComponentImport } from '../model/imports';
import { ComponentInstance, Instance as CoreInstance } from '../model/instances';
import { ComponentType } from '../model/types';
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

export type ComponentFactoryImpl = () => WasmComponent<any>
export type ExportFactory = (ctx: BindingContext) => JsInterfaceCollection
export type InstanceFactory = (ctx: BindingContext) => JsInterface

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

    componentExports: ComponentExport[]
    componentInstances: ComponentInstance[], componentInstanceFactories: InstanceFactory[]
    coreInstances: CoreInstance[], coreInstanceFactories: Function[]


    // this is the same thing ?
    type: ComponentType[]
    component: ComponentType[]
    bindingContextFactory: (imports: JsImports) => BindingContext

    prepareComponentExports: () => ExportFactory[]
    prepareComponentInstance: (componentInstanceIndex: number) => InstanceFactory
}
