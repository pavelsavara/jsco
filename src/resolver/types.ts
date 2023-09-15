import { BindingContext } from '../binding/types';
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
//

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
    wasmInstantiate: typeof WebAssembly.instantiate
    resolveCache: Map<ModelTag, Function[]>
    debugStack?: string[]
}
