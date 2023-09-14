import { BindingContext } from '../binding/types';
import { ModelTag } from '../model/tags';
import { prepareComponentTypeFunction } from './component-type-function';
import { cacheFactory } from './context';
import { prepareCoreFunction } from './core-function';
import { ResolverContext, JsInterface, ImplComponentFunction } from './types';

export function prepareComponentFunction(rctx: ResolverContext, componentFunctionIndex: number): ImplComponentFunction {
    //console.log('prepareComponentFunction', componentFunctionIndex);
    async function createComponentFunction(ctx: BindingContext): Promise<JsInterface> {
        console.log('createComponentFunction');
        return {};
    }

    let factory: ImplComponentFunction;
    const section = rctx.indexes.componentFunctions[componentFunctionIndex];
    switch (section.tag) {
        case ModelTag.CanonicalFunctionLift: {

            const coreFunctionFactory = prepareCoreFunction(rctx, section.core_func_index);
            const componentTypeFuntionFactory = prepareComponentTypeFunction(rctx, section.type_index);

            factory = cacheFactory(rctx.implComponentFunction, componentFunctionIndex, () => async (ctx) => {
                const coreFn = await coreFunctionFactory(ctx);
                const componentType = await componentTypeFuntionFactory(ctx);
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

