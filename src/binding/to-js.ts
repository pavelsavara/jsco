import { WITType, WITTypeFunction, WITTypeRecord, WITTypeString } from "../parser/types";
import { memoize } from "./cache";
import { LoweringToJs, BindingContext, FnLoweringToJs, AbiFunction, AbiPointer, JsFunction, AbiSize } from "./types";

export function createExportLowering(exportModel: WITTypeFunction): FnLoweringToJs {
    return memoize(exportModel, () => {
        return (ctx: BindingContext, abiExport: AbiFunction): JsFunction => {
            // TODO
            throw new Error("Not implemented");
        };
    });
}

export function createLowering(typeModel: WITType): LoweringToJs {
    return memoize(typeModel, () => {
        switch (typeModel.tag) {
            case "record":
                return createRecordLowering(typeModel);
            case "string":
                return createStringLowering();
            case "i32":
            default:
                throw new Error("Not implemented");
        }
    });
}

function createStringLowering(): LoweringToJs {
    return (ctx: BindingContext, pointer: AbiPointer, len: AbiSize) => {
        const view = ctx.getView(pointer, len);
        return ctx.utf8Decoder.decode(view);
    };
}


function createRecordLowering(recordModel: WITTypeRecord): LoweringToJs {
    // receives pointer to record in component model layout
    return (ctx: BindingContext, pointer: AbiPointer) => {
        // return JS record
        throw new Error("Not implemented");
        /* return {
            ... members 
        } as TRecord
        */
    };
}
