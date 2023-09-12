import { ComponentAlias } from '../model/aliases';
import { CanonicalFunction } from '../model/canonicals';
import { ComponentExport } from '../model/exports';
import { ComponentImport } from '../model/imports';
import { ComponentInstance, Instance } from '../model/instances';
import { ComponentType } from '../model/types';
import { WITModel } from '../parser';
import { CoreModule, WITSection } from '../parser/types';

export type ComponentFactoryOptions = {
    useNumberForInt64?: boolean
    wasmInstantiate?: typeof WebAssembly.instantiate
}

export type JsInterface = Record<string, Function>;
export type JsInterfaceCollection = Record<string, JsInterface>;

export type JsExports<TJSExports extends JsInterfaceCollection> = TJSExports
export type JsImports = JsInterfaceCollection

export type ComponentFactory<TJSExports extends JsInterfaceCollection> = (imports?: JsImports, options?: ComponentFactoryOptions) => Promise<JsExports<TJSExports>>

export type ComponentFactoryInput = WITModel
    | string
    | ArrayLike<number>
    | ReadableStream<Uint8Array>
    | Response
    | PromiseLike<Response>


export type WITModelByType = {
    componentExports: ComponentExport[]
    componentImports: ComponentImport[]
    modules: CoreModule[]
    aliases: ComponentAlias[]
    coreInstances: Instance[]
    instances: ComponentInstance[]
    cannon: CanonicalFunction[]
    other: WITSection[]

    // this is the same thing ?
    type: ComponentType[]
    component: ComponentType[]
}
