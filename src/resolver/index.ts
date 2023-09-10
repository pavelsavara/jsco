import { WITModel, parse } from "../parser";
import { createImportLifting, createExportLowering } from "../binding";
import { AbiImports, AbiPointer, AbiSize, BindingContext, ComponentFactory, FnLiftingFromJs, FnLoweringToJs, JsExports, JsImports, WasmInstantiate } from "../binding/types";
import { Tcabi_realloc } from "./types";

export async function createComponent(modelOrComponentOrUrl: WITModel | string | ArrayLike<number>
    | ReadableStream<Uint8Array>
    | Response
    | PromiseLike<Response>,
) {
    let input = modelOrComponentOrUrl as any;
    if (typeof input === "object" && input.tag === "model") {
        input = await parse(input);
    }
    return createComponentFactory(input)();
}

// TODO this logic is very wrong so far, just a placeholder
export function createComponentFactory(model: WITModel): ComponentFactory {
    const exportLowering: FnLoweringToJs[] = [];
    const importLifing: FnLiftingFromJs[] = [];
    /*for (const exportModel of model.componentExports) {
        const lowering = createExportLowering(exportModel);
        exportLowering.push(lowering);
    }
    for (const importModel of model.componentImports) {
        const lifting = createImportLifting(importModel);
        importLifing.push(lifting);
    }*/

    return async (imports?: WebAssembly.Imports, wasmInstantiate?: WasmInstantiate) => {
        wasmInstantiate = wasmInstantiate ?? WebAssembly.instantiate;
        const jsImports: JsImports = (imports ? imports : {}) as any as JsImports;
        const ctx: BindingContext = {
            utf8Decoder: new TextDecoder(),
            utf8Encoder: new TextEncoder(),
            getView: () => {
                return new DataView(memory.buffer);
            },
            getMemory: () => {
                return memory;
            },
            realloc(oldPtr, oldSize, align, newSize) {
                return cabi_realloc(oldPtr, oldSize, align, newSize);
            },
            alloc: (newSize: AbiSize, align: AbiSize) => {
                return cabi_realloc(0 as any, 0 as any, align, newSize);
            },
            readI32: (ptr: AbiPointer) => {
                return dataView.getInt32(ptr);
            },
            writeI32: (ptr: AbiPointer, value: number) => {
                return dataView.setInt32(ptr, value);
            }
        };
        /*for (const lifting of importLifing) {
            abiImports[lifting.name] = function (...args: any[]) {
                const ptr = lifting(ctx, ...args);
                return ptr;
            };
        }*/
        const abiImports = {} as any as AbiImports;
        const module0 = model.modules[0].module!;
        const instance0 = await wasmInstantiate(module0, abiImports as any);
        const memory = instance0.exports.memory as WebAssembly.Memory;
        const dataView = new DataView(memory.buffer); // TODO stale on memory growth!!!
        const cabi_realloc = instance0.exports.cabi_realloc as Tcabi_realloc;

        const exports = {} as any as JsExports;

        return exports;
    };
}

