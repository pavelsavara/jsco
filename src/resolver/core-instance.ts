import { ExternalKind } from '../model/core';
import { InstantiationArgKind } from '../model/instances';
import { ModelTag } from '../model/tags';
import { memoizePrepare } from './context';
import { prepareCoreFunction } from './core-function';
import { ResolverContext, ImplCoreInstance, ImplCoreFunction } from './types';

export function prepareCoreInstance(rctx: ResolverContext, coreInstanceIndex: number): Promise<ImplCoreInstance> {
    const section = rctx.indexes.coreInstances[coreInstanceIndex];
    return memoizePrepare<ImplCoreInstance>(rctx, section, async () => {
        switch (section.tag) {
            case ModelTag.CoreInstanceInstantiate: {
                const moduleSection = rctx.indexes.coreModules[section.module_index];
                // TODO make lazy compilation from moduleSection.data
                const module = await moduleSection.module!;

                const argFactories: ({ name: string, factory: ImplCoreInstance })[] = [];
                for (const arg of section.args) {
                    switch (arg.kind) {
                        case InstantiationArgKind.Instance: {
                            const factory = await prepareCoreInstance(rctx, arg.index);
                            argFactories.push({ name: arg.name, factory: factory });
                            break;
                        }
                        default:
                            throw new Error(`"${arg.kind}" not implemented`);
                    }
                }

                const todoArgs = {}; // TODO where do the imports come from?
                return async (ctx) => {
                    const args = {} as WebAssembly.Imports;
                    for (const { name, factory } of argFactories) {
                        const instance = await factory(ctx, todoArgs);
                        args[name] = instance as any;
                    }
                    //console.log('TODO wasmInstantiate', ctx.debugStack);
                    return rctx.wasmInstantiate(module, args);
                };
            }
            case ModelTag.CoreInstanceFromExports: {
                const exportFactories: ({ name: string, factory: ImplCoreFunction })[] = [];
                for (const exp of section.exports) {
                    switch (exp.kind) {
                        case ExternalKind.Func: {
                            const factory = await prepareCoreFunction(rctx, exp.index);
                            exportFactories.push({ name: exp.name, factory: factory });
                            break;
                        }
                        default:
                            throw new Error(`"${exp.kind}" not implemented`);
                    }
                }

                return async (ctx) => {
                    const exports = {} as any;
                    for (const { name, factory } of exportFactories) {
                        const value = await factory(ctx);
                        exports[name] = value as any;
                    }
                    return exports;
                };
            }
            default:
                throw new Error(`${(section as any).tag} not implemented`);
        }
    });
}

