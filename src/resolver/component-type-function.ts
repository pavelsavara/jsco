import { BindingContext } from '../binding/types';
import { ModelTag } from '../model/tags';
import { cacheFactory } from './context';
import { ResolverContext, JsInterface, ImplComponentTypeFunction } from './types';

export function prepareComponentTypeFunction(rctx: ResolverContext, componentTypeFunctionIndex: number): ImplComponentTypeFunction {
    //console.log('prepareComponentTypeFunction', componentTypeFunctionIndex);
    function createComponentTypeFunction(ctx: BindingContext): JsInterface {
        console.log('createComponentTypeFunction');
        return {};
    }

    let factory: ImplComponentTypeFunction;
    const section = rctx.indexes.componentTypes[componentTypeFunctionIndex];
    switch (section.tag) {
        case ModelTag.ComponentTypeFunc:
            console.log('prepareComponentTypeFunction', section.tag);
            factory = cacheFactory(rctx.implComponentFunction, componentTypeFunctionIndex, () => async (ctx) => {
                return createComponentTypeFunction(ctx);
            });
            break;
        default:
            throw new Error(`${section.tag} not implemented`);
    }
    return factory;
}

