import { createExportLowering } from './binding';
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

                return async (ctx, args) => {
                    const instance = await instanceFactory(ctx, args);
                    return instance.exports[section.name] as Function;
                };
            }
            case ModelTag.CanonicalFunctionLower: {
                const componentFunctionFactory = await prepareCoreFunction(rctx, section.func_index);
                // TODO section.options: CanonicalOption
                //const sectionFunType = rctx.indexes.coreFunctions[section.func_index];
                //jsco_assert(sectionFunType.tag === ModelTag.ComponentTypeFunc, () => `expected ComponentTypeFunc, got ${sectionFunType.tag}`);
                //sectionFunType.tag === ModelTag.ComponentTypeFunc;

                const trampoline = createExportLowering(rctx, {
                    TODO: section.tag,
                    params: [],
                    results: {
                        tag: ModelTag.ComponentFuncResultNamed,
                        values: [],
                    }
                } as any);
                return async (ctx, args) => {
                    const componentFn = await componentFunctionFactory(ctx, args);
                    return trampoline(ctx, componentFn);
                };
            }
            default:
                throw new Error(`${(section as any).tag} not implemented`);
        }
    });
}