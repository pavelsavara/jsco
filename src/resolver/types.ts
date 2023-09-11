import { AbiPointer, AbiSize } from '../binding/types';
import { WITModel } from '../parser';

// TODO is this correct signature ?
export type Tcabi_realloc = (oldPtr: AbiPointer, oldSize: AbiSize, align: AbiSize, newSize: AbiSize) => AbiPointer;

export type ComponentFactoryOptions = {
    wasmInstantiate?: typeof WebAssembly.instantiate
}

type ComponentImportInterface = {
    [key: string]: Function
}

type ComponentImportInterfacesByName = {
    [key: string]: ComponentImportInterface
}

type AbiImportInterfacesByName = {
    abi: { [key: string]: ComponentImportInterface }
}

export type ComponentImports =
    | ComponentImportInterface
    | ComponentImportInterfacesByName
    | AbiImportInterfacesByName

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