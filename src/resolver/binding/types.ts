import { BindingContext } from '../types';

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


export type FnLoweringCallToJs = (ctx: BindingContext, jsExport: JsFunction) => WasmFunction;
export type FnLiftingCallFromJs = (ctx: BindingContext, wasmFunction: WasmFunction) => JsFunction;

export type LoweringToJs = (ctx: BindingContext, ...args: WasmValue[]) => JsValue;
export type LiftingFromJs = (ctx: BindingContext, srcJsValue: JsValue) => WasmValue[];

export type Tcabi_realloc = (oldPtr: WasmPointer, oldSize: WasmSize, align: WasmSize, newSize: WasmSize) => WasmPointer;
