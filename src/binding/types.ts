export type WasmPointer = number;
export type WasmNumber = number;
export type WasmSize = number;
export type WasmFunction = Function;
export type WasmValue = WasmPointer | WasmSize | WasmNumber;
export type JsFunction = Function;
export type JsString = string;
export type JsBoolean = boolean;
export type JsNumber = number | bigint;
export type JsValue = JsNumber | JsString | JsBoolean;

export type BindingContext = {
    useNumberForInt64: boolean; // TODO
    utf8Decoder: TextDecoder;
    utf8Encoder: TextEncoder;
    getMemory: () => WebAssembly.Memory;
    getView: (ptr: WasmPointer, len: WasmSize) => DataView;
    getViewU8: (ptr: WasmPointer, len: WasmSize) => Uint8Array;
    alloc: (newSize: WasmSize, align: WasmSize) => WasmPointer;
    realloc: (oldPtr: WasmPointer, oldSize: WasmSize, align: WasmSize, newSize: WasmSize) => WasmPointer;
    readI32: (ptr: WasmPointer) => number;
    writeI32: (ptr: WasmPointer, value: number) => void;
}

export type FnLoweringToJs = (ctx: BindingContext, abiExport: WasmFunction) => Function;
export type FnLiftingFromJs = (ctx: BindingContext, jsFunction: JsFunction) => WasmFunction;

export type LoweringToJs = (ctx: BindingContext, srcPointer: WasmPointer, ...args: WasmValue[]) => JsValue;
export type LiftingFromJs = (ctx: BindingContext, srcJsValue: JsValue) => WasmValue[];

// TODO is this correct signature ?
export type Tcabi_realloc = (oldPtr: WasmPointer, oldSize: WasmSize, align: WasmSize, newSize: WasmSize) => WasmPointer;
