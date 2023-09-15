import { ModelTag } from '../model/tags';
import { memoizePrepare } from './context';
import { prepareCoreInstance } from './core-instance';
import { ResolverContext, ImplFactory } from './types';

export function prepareCoreFunction(rctx: ResolverContext, coreFunctionIndex: number): Promise<ImplFactory> {
    const section = rctx.indexes.coreFunctions[coreFunctionIndex];
    return memoizePrepare<ImplFactory>(rctx, section, async () => {
        switch (section.tag) {
            case ModelTag.ComponentAliasCoreInstanceExport: {
                const instanceFactory = await prepareCoreInstance(rctx, section.instance_index);
                return async (ctx, imports) => {
                    const instance = await instanceFactory(ctx, imports);
                    return instance.exports[section.name] as Function;
                };
            }
            case ModelTag.CanonicalFunctionLower:
            default:
                throw new Error(`${(section as any).tag} not implemented`);
        }
    });
}