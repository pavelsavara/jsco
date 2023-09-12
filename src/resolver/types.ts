import { WITModel } from '../parser';

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