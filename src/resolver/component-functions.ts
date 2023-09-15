import { ModelTag } from '../model/tags';
import { memoizePrepare } from './context';
import { prepareCoreFunction } from './core-function';
import { ResolverContext, ImplComponentFunction } from './types';
import { createImportLifting } from '../binding';
import { js } from '../../tests/hello-component';
import { jsco_assert } from '../utils/assert';

export function prepareComponentFunction(rctx: ResolverContext, componentFunctionIndex: number): Promise<ImplComponentFunction> {
    const section = rctx.indexes.componentFunctions[componentFunctionIndex];
    return memoizePrepare<ImplComponentFunction>(rctx, section, async () => {
        switch (section.tag) {
            case ModelTag.CanonicalFunctionLift: {
                const coreFunctionFactory = await prepareCoreFunction(rctx, section.core_func_index);
                /// DELETE const componentTypeFuntionFactory = await prepareComponentTypeFunction(rctx, section.type_index);
                const sectionFunType = rctx.indexes.componentTypes[section.type_index];
                jsco_assert(sectionFunType.tag === ModelTag.ComponentTypeFunc, () => `expected ComponentTypeFunc, got ${sectionFunType.tag}`);

                const trampoline = createImportLifting(rctx, sectionFunType);
                return async (ctx) => {
                    const coreFn = await coreFunctionFactory(ctx);
                    return trampoline(ctx, coreFn);
                };
            }
            case ModelTag.ComponentAliasInstanceExport:
            default:
                throw new Error(`${section.tag} not implemented`);
        }
    });
}

