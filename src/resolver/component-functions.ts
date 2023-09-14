import { ModelTag } from '../model/tags';
import { prepareComponentTypeFunction } from './component-type-function';
import { cacheFactory } from './context';
import { prepareCoreFunction } from './core-function';
import { ResolverContext, ImplComponentFunction } from './types';

export function prepareComponentFunction(rctx: ResolverContext, componentFunctionIndex: number): Promise<ImplComponentFunction> {
    const section = rctx.indexes.componentFunctions[componentFunctionIndex];
    return cacheFactory<ImplComponentFunction>(rctx, section, async () => {
        switch (section.tag) {
            case ModelTag.CanonicalFunctionLift: {
                const coreFunctionFactory = await prepareCoreFunction(rctx, section.core_func_index);
                const componentTypeFuntionFactory = await prepareComponentTypeFunction(rctx, section.type_index);
                return async (ctx) => {
                    const coreFn = await coreFunctionFactory(ctx);
                    const componentType = await componentTypeFuntionFactory(ctx);
                    return {};
                };
            }
            case ModelTag.ComponentAliasInstanceExport:
            default:
                throw new Error(`${section.tag} not implemented`);
        }
    });
}

