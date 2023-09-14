import { BindingContext } from '../binding/types';
import { ModelTag } from '../model/tags';
import { cacheFactory } from './context';
import { ResolverContext, JsInterface, ImplComponentFunction } from './types';

export function prepareComponentFunction(rctx: ResolverContext, componentFunctionIndex: number): ImplComponentFunction {
    //console.log('prepareComponentFunction', componentFunctionIndex);
    function createComponentFunction(ctx: BindingContext): JsInterface {
        //console.log('createComponentFunction', index, section);
        return {};
    }

    let factory: ImplComponentFunction;
    const section = rctx.componentFunctions[componentFunctionIndex];
    switch (section.tag) {
        case ModelTag.CanonicalFunctionLift: {
            factory = cacheFactory(rctx.implComponentFunction, componentFunctionIndex, () => (ctx) => {
                return createComponentFunction(ctx);
            });
            break;
        }
        case ModelTag.ComponentAliasInstanceExport:
        default:
            throw new Error(`${section.tag} not implemented`);
    }
    return factory;
}

