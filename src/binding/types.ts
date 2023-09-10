export type JsValue =
    | JsRecord
    | JsI32
    | JsString

export type JsRecord = any & {
    _brand: "js-record"
};

export type JsI32 = number & {
    _brand: "js-i32"
};

export type JsString = string & {
    _brand: "js-string"
};

export type JsFunction = Function & {
    _brand: "js-function"
};

export type JsImports = { [key: string]: JsFunction } & {
    _brand: "js-imports"
};

export type JsExports = { [key: string]: JsFunction } & {
    _brand: "js-exports"
};

export type AbiSize = number & {
    _brand: "abi-size"
};

export type AbiImports = { [key: string]: AbiFunction } & {
    _brand: "abi-imports"
};

export type AbiExports = { [key: string]: AbiFunction } & {
    _brand: "abi-exports"
};

export type AbiPointer = number & {
    _brand: "abi-pointer"
};

export type AbiFunction = Function & {
    _brand: "abi-function"
};


export type BindingContext = {
    utf8Decoder: TextDecoder;
    utf8Encoder: TextEncoder;
    getMemory: () => WebAssembly.Memory;
    getView: () => DataView;//TODO from , to
    alloc: (newSize: AbiSize, align: AbiSize) => AbiPointer;
    realloc: (oldPtr: AbiPointer, oldSize: AbiSize, align: AbiSize, newSize: AbiSize) => AbiPointer;
    readI32: (ptr: AbiPointer) => number;
    writeI32: (ptr: AbiPointer, value: number) => void;
}

export type FnLoweringToJs = (ctx: BindingContext, abiExport: AbiFunction) => JsFunction;
export type FnLiftingFromJs = (ctx: BindingContext, jsFunction: JsFunction) => AbiFunction;

export type LoweringToJs = (ctx: BindingContext, srcPointer: AbiPointer) => JsValue;
export type LiftingFromJs = (ctx: BindingContext, srcJsValue: JsValue, tgtPointer: AbiPointer) => AbiPointer;

export type WasmInstantiate = (module: WebAssembly.Module, importObject?: WebAssembly.Imports) => Promise<WebAssembly.Instance>;
export type ComponentFactory = (imports?: WebAssembly.Imports, wasmInstantiate?: WasmInstantiate) => Promise<JsExports>