import { BindingContext } from '../binding/types';
import { ModelTag } from '../model/tags';
import { cacheFactory } from './context';
import { prepareCoreInstance } from './core-instance';
import { ResolverContext, JsInterface, ImplCoreFunction } from './types';

export function prepareCoreFunction(rctx: ResolverContext, coreFunctionIndex: number): Promise<ImplCoreFunction> {
    return cacheFactory<ImplCoreFunction>(rctx.implComponentFunction, coreFunctionIndex, async () => {
        //console.log('prepareCoreFunction', coreFunctionIndex);
        async function createCoreFunction(ctx: BindingContext): Promise<JsInterface> {
            console.log('createCoreFunction');
            return {};
        }

        let factory: ImplCoreFunction;
        const section = rctx.indexes.coreFunctions[coreFunctionIndex];
        switch (section.tag) {
            case ModelTag.ComponentAliasCoreInstanceExport: {
                console.log('prepareCoreFunction', section);

                const instanceFactory = await prepareCoreInstance(rctx, section.instance_index);

                factory = async (ctx) => {
                    instanceFactory(ctx, {
                        // TODO processed imports
                    });
                    return createCoreFunction(ctx);
                };
                break;
            }
            case ModelTag.CanonicalFunctionLower:
            default:
                throw new Error(`${(section as any).tag} not implemented`);
        }
        return factory;
    });
}