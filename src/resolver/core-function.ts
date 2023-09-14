import { BindingContext } from '../binding/types';
import { ModelTag } from '../model/tags';
import { cacheFactory } from './context';
import { prepareCoreInstance } from './core-instance';
import { ResolverContext, ImplCoreFunction } from './types';

export function prepareCoreFunction(rctx: ResolverContext, coreFunctionIndex: number): Promise<ImplCoreFunction> {
    const section = rctx.indexes.coreFunctions[coreFunctionIndex];
    return cacheFactory<ImplCoreFunction>(rctx, section, async () => {
        async function createCoreFunction(ctx: BindingContext, instance: WebAssembly.Instance, name: string): Promise<Function> {
            return instance.exports[name] as Function;
        }

        switch (section.tag) {
            case ModelTag.ComponentAliasCoreInstanceExport: {
                const instanceFactory = await prepareCoreInstance(rctx, section.instance_index);

                return async (ctx) => {
                    const instance = await instanceFactory(ctx, {
                        // TODO processed imports
                    });
                    return createCoreFunction(ctx, instance, section.name);
                };
            }
            case ModelTag.CanonicalFunctionLower:
            default:
                throw new Error(`${(section as any).tag} not implemented`);
        }
    });
}