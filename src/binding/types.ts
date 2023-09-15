import { JsImports } from '../resolver/types';

export type WasmPointer = number;
export type WasmNumber = number | bigint;
export type WasmSize = number;
export type WasmFunction = Function;
export type WasmValue = WasmPointer | WasmSize | WasmNumber;
export type JsFunction = Function;
export type JsString = string;
export type JsBoolean = boolean;
export type JsNumber = number | bigint;
export type JsValue = JsNumber | JsString | JsBoolean | any;

export type BindingContext = {
    rootImports: JsImports
    coreInstances: WebAssembly.Instance[];
    initialize(memory: WebAssembly.Memory, cabi_realloc: Tcabi_realloc): void;
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

export type FnLoweringCallToJs = (ctx: BindingContext, jsExport: JsFunction) => WasmFunction;
export type FnLiftingCallFromJs = (ctx: BindingContext, wasmFunction: WasmFunction) => JsFunction;

export type LoweringToJs = (ctx: BindingContext, ...args: WasmValue[]) => JsValue;
export type LiftingFromJs = (ctx: BindingContext, srcJsValue: JsValue) => WasmValue[];

// TODO is this correct signature ?
export type Tcabi_realloc = (oldPtr: WasmPointer, oldSize: WasmSize, align: WasmSize, newSize: WasmSize) => WasmPointer;
