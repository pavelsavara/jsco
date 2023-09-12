import { WITModel } from '../parser';

export type ComponentFactoryOptions = {
    useNumberForInt64?: boolean
    wasmInstantiate?: typeof WebAssembly.instantiate
}

type ComponentImportInterface = {
    [key: string]: Function
}

type ComponentImportInterfacesByName = {
    [key: string]: ComponentImportInterface
}

export type ComponentImports =
    | ComponentImportInterfacesByName

export type ComponentExports<JSExports> =
    JSExports
    & { [key: string]: JSExports }

export type ComponentFactory<JSExports> = (imports?: ComponentImports, options?: ComponentFactoryOptions) => Promise<ComponentExports<JSExports>>

export type ComponentFactoryInput = WITModel
    | string
    | ArrayLike<number>
    | ReadableStream<Uint8Array>
    | Response
    | PromiseLike<Response>