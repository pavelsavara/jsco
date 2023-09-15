import { ModelTag } from '../model/tags';
import { memoizePrepare } from './context';
import { prepareCoreFunction } from './core-function';
import { ResolverContext, ImplFactory } from './types';
import { createImportLifting } from './binding';
import { jsco_assert } from '../utils/assert';
import { prepareComponentInstance } from './component-instance';
import { ComponentExternalKind } from '../model/exports';
import { prepareCoreInstance } from './core-instance';

export function prepareComponentFunction(rctx: ResolverContext, componentFunctionIndex: number): Promise<ImplFactory> {
    const section = rctx.indexes.componentFunctions[componentFunctionIndex];
    return memoizePrepare<ImplFactory>(rctx, section, async () => {
        switch (section.tag) {
            case ModelTag.CanonicalFunctionLift: {
                const coreFunctionFactory = await prepareCoreFunction(rctx, section.core_func_index);
                // TODO section.options: CanonicalOption
                const sectionFunType = rctx.indexes.componentTypes[section.type_index];
                jsco_assert(sectionFunType.tag === ModelTag.ComponentTypeFunc, () => `expected ComponentTypeFunc, got ${sectionFunType.tag}`);

                const trampoline = createImportLifting(rctx, sectionFunType);
                return async (ctx, args) => {
                    const coreFn = await coreFunctionFactory(ctx, args);
                    return trampoline(ctx, coreFn);
                };
            }
            case ModelTag.ComponentAliasInstanceExport: {
                switch (section.kind) {
                    case ComponentExternalKind.Instance: {
                        const factory = await prepareComponentInstance(rctx, section.instance_index);
                        return async (ctx, args) => {
                            return factory(ctx, args);
                        };
                    }
                    case ComponentExternalKind.Func: {
                        //console.log('TODO ' + section.kind, section.name, rctx.debugStack);
                        // TODO it's not clear to me if this should be function from core module
                        //const factory = await prepareCoreInstance(rctx, section.instance_index);
                        //const factory = await prepareCoreFunction(rctx, section.instance_index);

                        return async (ctx, args) => {
                            //console.log('TODO ' + section.kind, section.name, args, rctx.debugStack);
                            //const coreInstance: WebAssembly.Instance = await factory(ctx, args);
                            //const xxx = await factory(ctx, args);
                            return {
                                TODO: section.tag + '< ' + section.kind + '< ' + (new Error().stack)!.split('\n')[1],
                                //coreInstance,
                                //exports: coreInstance.exports,
                                instance_index: section.instance_index,
                                name: section.name + '!!3',

                            };
                        };
                    }
                    case ComponentExternalKind.Component:
                    case ComponentExternalKind.Module:
                    case ComponentExternalKind.Type:
                    case ComponentExternalKind.Value:
                    default:
                        throw new Error(`${(section as any).kind} not implemented`);
                }
            }
            default:
                throw new Error(`${(section as any).tag} not implemented`);
        }
    });
}
