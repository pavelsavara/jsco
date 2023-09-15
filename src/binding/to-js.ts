import { FuncType } from '../model/core';
import { ModelTag } from '../model/tags';
import { ComponentTypeDefinedRecord, ComponentValType, PrimitiveValType } from '../model/types';
import { ResolverContext } from '../resolver/types';
import { memoize } from './cache';
import { LoweringToJs, BindingContext, FnLoweringToJs, WasmFunction, WasmPointer, JsFunction, WasmSize, WasmValue } from './types';


export function createExportLowering(rctx: ResolverContext, exportModel: FuncType): FnLoweringToJs {
    return memoize(exportModel, () => {
        return (ctx: BindingContext, jsImport: JsFunction): WasmFunction => {
            // TODO
            throw new Error('Not implemented');
        };
    });
}

export function createLowering(rctx: ResolverContext, typeModel: ComponentValType): LoweringToJs {
    return memoize(typeModel, () => {
        switch (typeModel.tag) {
            case ModelTag.ComponentValTypePrimitive:
                switch (typeModel.value) {
                    case PrimitiveValType.String:
                        return createStringLowering(rctx);
                    default:
                        throw new Error('Not implemented');
                }
            default:
                throw new Error('Not implemented');
        }
    });
}

function createStringLowering(rctx: ResolverContext): LoweringToJs {
    return (ctx: BindingContext, ...args: WasmValue[]) => {
        const pointer = args[0] as WasmPointer;
        const len = args[1] as WasmSize;
        const view = ctx.getView(pointer, len);
        return ctx.utf8Decoder.decode(view);
    };
}

function createRecordLowering(recordModel: ComponentTypeDefinedRecord): LoweringToJs {
    // receives pointer to record in component model layout
    return (ctx: BindingContext, ...args: WasmValue[]) => {
        // return JS record
        throw new Error('Not implemented');
        /* return {
            ... members 
        } as TRecord
        */
    };
}
