import { ModelTag } from '../model/tags';
import { memoizePrepare } from './context';
import { prepareCoreFunction } from './core-function';
import { ResolverContext, ImplFactory } from './types';
import { createImportLifting } from '../binding';
import { jsco_assert } from '../utils/assert';

export function prepareComponentFunction(rctx: ResolverContext, componentFunctionIndex: number): Promise<ImplFactory> {
    const section = rctx.indexes.componentFunctions[componentFunctionIndex];
    return memoizePrepare<ImplFactory>(rctx, section, async () => {
        switch (section.tag) {
            case ModelTag.CanonicalFunctionLift: {
                const coreFunctionFactory = await prepareCoreFunction(rctx, section.core_func_index);
                const sectionFunType = rctx.indexes.componentTypes[section.type_index];
                jsco_assert(sectionFunType.tag === ModelTag.ComponentTypeFunc, () => `expected ComponentTypeFunc, got ${sectionFunType.tag}`);

                const trampoline = createImportLifting(rctx, sectionFunType);
                return async (ctx, imports) => {
                    const coreFn = await coreFunctionFactory(ctx, imports);
                    return trampoline(ctx, coreFn);
                };
            }
            case ModelTag.ComponentAliasInstanceExport: {
                return async (ctx, imports) => {
                    return {
                        TODO: section.tag
                    };
                };
            }
            default:
                throw new Error(`${(section as any).tag} not implemented`);
        }
    });
}
