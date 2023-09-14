import { BindingContext } from '../binding/types';
import { ModelTag } from '../model/tags';
import { cacheFactory } from './context';
import { ResolverContext, JsInterface, ImplCoreFunction } from './types';

export function prepareCoreFunction(rctx: ResolverContext, coreFunctionIndex: number): ImplCoreFunction {
    //console.log('prepareCoreFunction', coreFunctionIndex);
    async function createCoreFunction(ctx: BindingContext): Promise<JsInterface> {
        console.log('createCoreFunction');
        return {};
    }

    let factory: ImplCoreFunction;
    const section = rctx.indexes.coreFunctions[coreFunctionIndex];
    switch (section.tag) {
        case ModelTag.CanonicalFunctionLower:
        case ModelTag.ComponentAliasCoreInstanceExport: {
            console.log('prepareCoreFunction', section.tag);
            factory = cacheFactory(rctx.implComponentFunction, coreFunctionIndex, () => async (ctx) => {
                return createCoreFunction(ctx);
            });
            break;
        }
        default:
            throw new Error(`${(section as any).tag} not implemented`);
    }
    return factory;
}

