import { WITType, WITTypeFunction, WITTypeRecord } from "../parser/types";
import { memoize } from "./cache";
import { LoweringToJs, BindingContext, FnLoweringToJs, AbiFunction, AbiPointer, JsFunction } from "./types";

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
            case "i32":
            default:
                throw new Error("Not implemented");
        }
    });
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
