import { Export, ExternalKind } from '../model/core';
import { CoreInstance, CoreInstanceFromExports, CoreInstanceInstantiate, InstantiationArg, InstantiationArgKind } from '../model/instances';
import { ModelTag } from '../model/tags';
import { debugStack, jsco_assert } from '../utils/assert';
import { resolveCoreFunction } from './core-functions';
import { resolveCoreModule } from './core-module';
import { Resolver, ResolverRes, BinderRes, BinderArgs } from './types';

export const resolveCoreInstance: Resolver<CoreInstance> = (rctx, rargs) => {
    const coreInstance = rargs.element;
    switch (coreInstance.tag) {
        case ModelTag.CoreInstanceFromExports: return resolveCoreInstanceFromExports(rctx, rargs as any);
        case ModelTag.CoreInstanceInstantiate: return resolveCoreInstanceInstantiate(rctx, rargs as any);
        default: throw new Error(`"${(coreInstance as any).tag}" not implemented`);
    }
};

export const resolveCoreInstanceFromExports: Resolver<CoreInstanceFromExports> = (rctx, rargs) => {
    const coreInstanceFromExports = rargs.element;
    jsco_assert(coreInstanceFromExports && coreInstanceFromExports.tag == ModelTag.CoreInstanceFromExports, () => `Wrong element type '${coreInstanceFromExports?.tag}'`);

    const exportResolutions: ResolverRes[] = [];
    for (const exp of coreInstanceFromExports.exports) {
        switch (exp.kind) {
            case ExternalKind.Func: {
                const func = rctx.indexes.coreFunctions[exp.index];
                const exportResolution = resolveCoreFunction(rctx, { element: func, callerElement: exp });
                exportResolutions.push(exportResolution);
                break;
            }
            case ExternalKind.Table: {
                const table = rctx.indexes.coreTables[exp.index];
                const exportResolution = resolveCoreFunction(rctx, { element: table, callerElement: exp });
                exportResolutions.push(exportResolution);
                break;
            }
            default:
                throw new Error(`"${exp.kind}" not implemented`);
        }
    }

    return {
        element: coreInstanceFromExports,
        callerElement: rargs.callerElement,
        binder: async (bctx, bargs) => {
            const exports = {} as WebAssembly.Imports;
            for (const exportResolution of exportResolutions) {
                const callerElement = exportResolution.callerElement as Export;
                const args = {
                    arguments: bargs.arguments,
                    imports: bargs.imports,
                    callerArgs: bargs,
                };
                debugStack(bargs, args, rargs.element.tag + ':' + rargs.element.selfSortIndex);
                debugStack(args, args, callerElement.kind + ':' + callerElement.name);

                const argResult = await exportResolution.binder(bctx, args);
                exports[callerElement.name] = argResult.result as any;
            }
            const binderResult: BinderRes = {
                result: exports as any as WebAssembly.Instance
            };
            return binderResult;
        }
    };
};

export const resolveCoreInstanceInstantiate: Resolver<CoreInstanceInstantiate> = (rctx, rargs) => {
    const coreInstanceInstantiate = rargs.element;
    jsco_assert(coreInstanceInstantiate && coreInstanceInstantiate.tag == ModelTag.CoreInstanceInstantiate, () => `Wrong element type '${coreInstanceInstantiate?.tag}'`);
    const coreModuleIndex = coreInstanceInstantiate.module_index;
    const coreModule = rctx.indexes.coreModules[coreModuleIndex];
    const coreModuleResolution = resolveCoreModule(rctx, { element: coreModule, callerElement: coreInstanceInstantiate });
    const argResolutions: ResolverRes[] = [];
    for (const arg of coreInstanceInstantiate.args) {
        switch (arg.kind) {
            case InstantiationArgKind.Instance: {
                const argInstance = rctx.indexes.coreInstances[arg.index];
                const resolution = resolveCoreInstance(rctx, {
                    callerElement: arg,
                    element: argInstance
                });
                argResolutions.push(resolution);
                break;
            }
            default:
                throw new Error(`"${arg.kind}" not implemented`);
        }
    }

    return {
        element: coreInstanceInstantiate,
        callerElement: rargs.callerElement,
        binder: async (bctx, bargs): Promise<BinderRes> => {
            const wasmImports = {
                debugSource: rargs.element.tag
            } as any as WebAssembly.Imports;
            for (const argResolution of argResolutions) {
                const callerElement = argResolution.callerElement as InstantiationArg;

                const args = {
                    arguments: bargs.arguments,
                    imports: bargs.imports,
                    callerArgs: bargs,
                };
                debugStack(bargs, args, rargs.element.tag + ':' + rargs.element.selfSortIndex);
                debugStack(args, args, callerElement.index + ':' + callerElement.name);

                const argResult = await argResolution.binder(bctx, args);

                const parent = argResolution.callerElement as InstantiationArg;
                wasmImports[parent.name] = argResult.result as any;
            }

            const args: BinderArgs = {
                imports: wasmImports,
                callerArgs: bargs,
            };
            debugStack(bargs, args, rargs.element.tag + ':' + rargs.element.selfSortIndex);
            const moduleResult = await coreModuleResolution.binder(bctx, args);

            const binderResult: BinderRes = {
                result: moduleResult.result
            };
            return binderResult;
        }
    };
};

