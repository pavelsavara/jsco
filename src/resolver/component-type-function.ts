import { BindingContext } from '../binding/types';
import { ModelTag } from '../model/tags';
import { cacheFactory } from './context';
import { ResolverContext, JsInterface, ImplComponentTypeFunction } from './types';

export function prepareComponentTypeFunction(rctx: ResolverContext, componentTypeFunctionIndex: number): Promise<ImplComponentTypeFunction> {
    const section = rctx.indexes.componentTypes[componentTypeFunctionIndex];
    return cacheFactory<ImplComponentTypeFunction>(rctx, section, async () => {
        //console.log('prepareComponentTypeFunction', componentTypeFunctionIndex);
        async function createComponentTypeFunction(ctx: BindingContext): Promise<JsInterface> {
            //console.log('createComponentTypeFunction');
            return {};
        }

        switch (section.tag) {
            case ModelTag.ComponentTypeFunc:
                //console.log('prepareComponentTypeFunction', section.tag);
                return (ctx) => createComponentTypeFunction(ctx);
            default:
                throw new Error(`${section.tag} not implemented`);
        }
    });
}
