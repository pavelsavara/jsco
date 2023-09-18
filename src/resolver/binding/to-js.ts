import { ModelTag } from '../../model/tags';
import { ComponentTypeFunc, ComponentValType, PrimitiveValType } from '../../model/types';
import { BindingContext, ResolverContext } from '../types';
import { memoize } from './cache';
import { createLifting } from './to-abi';
import { LoweringToJs, FnLoweringCallToJs, WasmFunction, WasmPointer, JsFunction, WasmSize, WasmValue } from './types';


export function createFunctionLowering(rctx: ResolverContext, exportModel: ComponentTypeFunc): FnLoweringCallToJs {
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

            function loweringTrampoline(...args: any[]): any {
                let covertedArgs: any[] = [];
                // TODO do not always read spilled stack
                for (let i = 0; i < paramLowerers.length;) {
                    const lowerer = paramLowerers[i];
                    const spill = (lowerer as any).spill;
                    const values = args.slice(i, i + spill);
                    const converted = lowerer(ctx, ...values);
                    i += spill;
                    covertedArgs = [...covertedArgs, converted];
                }
                const resJs = jsFunction(...covertedArgs);
                if (resultLifters.length === 1) {
                    resultLifters[0](resJs);
                }
            }
            return loweringTrampoline as WasmFunction;
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
    const fn = (ctx: BindingContext, ...args: WasmValue[]) => {
        const pointer = args[0] as WasmPointer;
        const len = args[1] as WasmSize;
        const view = ctx.getView(pointer, len);
        const res = ctx.utf8Decoder.decode(view);
        return res;
    };
    fn.spill = 2;
    return fn;
}
