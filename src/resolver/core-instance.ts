import { Export, ExternalKind } from '../model/core';
import { CoreInstanceIndex } from '../model/indices';
import { CoreInstance, CoreInstanceFromExports, CoreInstanceInstantiate, InstantiationArg, InstantiationArgKind } from '../model/instances';
import { ModelTag, TaggedElement } from '../model/tags';
import { debugStack, withDebugTrace, jsco_assert } from '../utils/assert';
import { TCabiRealloc } from './binding/types';
import { resolveCoreFunction } from './core-functions';
import { resolveCoreModule } from './core-module';
import { getCoreInstance, getCoreModule } from './indices';
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
                const exportResolution = resolveCoreFunction(rctx, { element: func, callerElement: exp as unknown as TaggedElement });
                exportResolutions.push(exportResolution);
                break;
            }
            case ExternalKind.Table: {
                const table = rctx.indexes.coreTables[exp.index];
                const exportResolution = resolveCoreFunction(rctx, { element: table, callerElement: exp as unknown as TaggedElement });
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
        binder: withDebugTrace(async (bctx, bargs) => {
            const exports: Record<string, unknown> = {};
            for (const exportResolution of exportResolutions) {
                const callerElement = exportResolution.callerElement as unknown as Export;
                const args = {
                    arguments: bargs.arguments,
                    imports: bargs.imports,
                    callerArgs: bargs,
                    debugStack: bargs.debugStack,
                };
                debugStack(args, args, callerElement.kind + ':' + callerElement.name);

                const argResult = await exportResolution.binder(bctx, args);
                exports[callerElement.name] = argResult.result;
            }
            const binderResult: BinderRes = {
                result: exports
            };
            return binderResult;
        }, rargs.element.tag + ':' + rargs.element.selfSortIndex)
    };
};

export const resolveCoreInstanceInstantiate: Resolver<CoreInstanceInstantiate> = (rctx, rargs) => {
    const coreInstanceInstantiate = rargs.element;
    const coreInstanceIndex = coreInstanceInstantiate.selfSortIndex!;
    jsco_assert(coreInstanceInstantiate && coreInstanceInstantiate.tag == ModelTag.CoreInstanceInstantiate, () => `Wrong element type '${coreInstanceInstantiate?.tag}'`);
    const coreModule = getCoreModule(rctx, coreInstanceInstantiate.module_index);
    const coreModuleResolution = resolveCoreModule(rctx, { element: coreModule, callerElement: coreInstanceInstantiate });
    const argResolutions: ResolverRes[] = [];
    for (const arg of coreInstanceInstantiate.args) {
        switch (arg.kind) {
            case InstantiationArgKind.Instance: {
                const argInstance = getCoreInstance(rctx, arg.index as CoreInstanceIndex);
                const resolution = resolveCoreInstance(rctx, {
                    callerElement: arg as unknown as TaggedElement,
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
        binder: withDebugTrace(async (bctx, bargs): Promise<BinderRes> => {
            let binderResult = bctx.instances.coreInstances[coreInstanceIndex];
            if (binderResult) {
                // Core instances are deduplicated by index — multiple references to the same
                // core instance return the cached result. The canonical ABI guarantees that
                // a given core instance index is always instantiated with the same arguments.
                return binderResult;
            }
            binderResult = {} as BinderRes;
            bctx.instances.coreInstances[coreInstanceIndex] = binderResult;

            const wasmImports: Record<string, WebAssembly.ModuleImports> = {};
            for (const argResolution of argResolutions) {
                const callerElement = argResolution.callerElement as unknown as InstantiationArg;

                const args = {
                    arguments: bargs.arguments,
                    imports: bargs.imports,
                    callerArgs: bargs,
                    debugStack: bargs.debugStack,
                };
                debugStack(args, args, callerElement.index + ':' + callerElement.name);

                const argResult = await argResolution.binder(bctx, args);
                wasmImports[callerElement.name] = argResult.result as WebAssembly.ModuleImports;
            }

            const args: BinderArgs = {
                callerArgs: bargs,
                debugStack: bargs.debugStack,
            };
            const moduleResult = await coreModuleResolution.binder(bctx, args);
            const module = moduleResult.result as WebAssembly.Module;
            const instance = await rctx.wasmInstantiate(module, wasmImports);
            // console.log('rctx.wasmInstantiate ' + coreInstanceIndex, Object.keys(instance.exports));
            const exports = instance.exports;

            // The canonical ABI specifies memory and realloc via CanonicalOption entries
            // (CanonicalOptionMemory, CanonicalOptionRealloc) on each lift/lower function.
            // Here we initialize from well-known export names as a fallback; per-function
            // options are plumbed through the canonical options in the resolver.
            const memory = exports['memory'] as WebAssembly.Memory;
            if (memory) {
                bctx.memory.initialize(memory);
            }
            const cabi_realloc = exports['cabi_realloc'] as TCabiRealloc | undefined;
            if (cabi_realloc) {
                bctx.allocator.initialize(cabi_realloc);
            }

            binderResult.result = exports;
            return binderResult;
        }, rargs.element.tag + ':' + rargs.element.selfSortIndex)
    };
};

