import { ModelTag } from '../../model/tags';
import { ComponentTypeDefinedRecord, ComponentTypeFunc, ComponentValType, PrimitiveValType } from '../../model/types';
import { BindingContext, ResolverContext } from '../types';
import { memoize } from './cache';
import { createLifting } from './to-abi';
import { LoweringToJs, FnLoweringCallToJs, WasmFunction, WasmPointer, JsFunction, WasmSize, WasmValue } from './types';


export function createExportLowering(rctx: ResolverContext, exportModel: ComponentTypeFunc): FnLoweringCallToJs {
    return memoize(exportModel, () => {
        return (ctx: BindingContext, jsFunction: JsFunction): WasmFunction => {

            const paramLowerers: Function[] = [];
            for (const param of exportModel.params) {
                const lowerer = createLowering(rctx, param.type);
                paramLowerers.push(lowerer);
            }
            const resultLifters: Function[] = [];
            switch (exportModel.results.tag) {
                case ModelTag.ComponentFuncResultNamed: {
                    for (const res of exportModel.results.values) {
                        const lifter = createLifting(rctx, res.type);
                        resultLifters.push(lifter);
                    }
                    break;
                }
                case ModelTag.ComponentFuncResultUnnamed: {
                    const lifter = createLifting(rctx, exportModel.results.type);
                    resultLifters.push(lifter);
                }
            }


            return (ctx: BindingContext, wasmFunction: JsFunction): WasmFunction => {
                function loweringTrampoline(...args: any[]): any {
                    let covertedArgs: any[] = [];
                    for (let i = 0; i < paramLowerers.length; i++) {
                        const lifter = paramLowerers[i];
                        const value = args[i];
                        const converted = lifter(ctx, value);
                        // TODO do not alwas spill into stack
                        covertedArgs = [...covertedArgs, ...converted];
                    }
                    const resJs = wasmFunction(...covertedArgs);
                    if (resultLifters.length === 1) {
                        resultLifters[0](resJs);
                    }
                }
                return loweringTrampoline as WasmFunction;
            };


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
