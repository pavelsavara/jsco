import { FuncType } from '../model/core';
import { ComponentDefinedTypeRecord, ComponentValType, PrimitiveValType } from '../model/types';
import { memoize } from './cache';
import { LoweringToJs, BindingContext, FnLoweringToJs, WasmFunction, WasmPointer, JsFunction, WasmSize } from './types';

export function createExportLowering(exportModel: FuncType): FnLoweringToJs {
    return memoize(exportModel, () => {
        return (ctx: BindingContext, abiExport: WasmFunction): JsFunction => {
            // TODO
            throw new Error('Not implemented');
        };
    });
}

export function createLowering(typeModel: ComponentValType): LoweringToJs {
    return memoize(typeModel, () => {
        switch (typeModel.tag) {
            case 'ComponentValTypePrimitive':
                switch (typeModel.value) {
                    case PrimitiveValType.String:
                        return createStringLowering();
                    default:
                        throw new Error('Not implemented');
                }
            default:
                throw new Error('Not implemented');
        }
    });
}

function createStringLowering(): LoweringToJs {
    return (ctx: BindingContext, pointer: WasmPointer, len: WasmSize) => {
        const view = ctx.getView(pointer, len);
        return ctx.utf8Decoder.decode(view);
    };
}


function createRecordLowering(recordModel: ComponentDefinedTypeRecord): LoweringToJs {
    // receives pointer to record in component model layout
    return (ctx: BindingContext, pointer: WasmPointer) => {
        // return JS record
        throw new Error('Not implemented');
        /* return {
            ... members 
        } as TRecord
        */
    };
}
