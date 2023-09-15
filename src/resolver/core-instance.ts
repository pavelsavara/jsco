import { ExternalKind } from '../model/core';
import { InstantiationArgKind } from '../model/instances';
import { ModelTag } from '../model/tags';
import { memoizePrepare } from './context';
import { prepareCoreFunction } from './core-function';
import { ResolverContext, ImplFactory, NamedImplFactory } from './types';

export async function prepareCoreInstance(rctx: ResolverContext, coreInstanceIndex: number): Promise<ImplFactory> {
    const section = rctx.indexes.coreInstances[coreInstanceIndex];
    return memoizePrepare<ImplFactory>(rctx, section, async () => {
        switch (section.tag) {
            case ModelTag.CoreInstanceInstantiate: {
                console.log('CoreInstanceFromExports', section);
                const moduleSection = rctx.indexes.coreModules[section.module_index];
                // TODO make lazy compilation from moduleSection.data
                const module = await moduleSection.module!;

                const argFactories: NamedImplFactory[] = [];
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

                return async (ctx, args) => {
                    let instance: WebAssembly.Instance = ctx.coreInstances[coreInstanceIndex];
                    if (instance) {
                        // TODO, do I need to validate that all calls got the same args ?
                        // console.log('reusing core instance ' + coreInstanceIndex);
                        return instance;
                    }
                    const instanceArgs = {} as WebAssembly.Imports;
                    for (const { name, factory } of argFactories) {
                        const instance = await factory(ctx, args);
                        instanceArgs[name] = instance;
                    }

                    instance = await rctx.wasmInstantiate(module, instanceArgs);
                    ctx.coreInstances[coreInstanceIndex] = instance;
                    const exports = instance.exports as any;

                    // this is a hack
                    // TODO maybe there are WIT instructions about which memory to use?
                    const memory = exports['memory'];
                    const cabi_realloc = exports['cabi_realloc'];
                    if (memory) {
                        ctx.initialize(memory, cabi_realloc);
                    }

                    const wasmImports = WebAssembly.Module.imports(module);
                    console.log('rctx.wasmInstantiate ' + section.module_index, { wasmImports, instanceArgs, exports: Object.keys(exports), stack: ctx.debugStack });

                    return instance;
                };
            }

            case ModelTag.CoreInstanceFromExports: {
                const exportFactories: NamedImplFactory[] = [];
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

                return async (ctx, args) => {
                    //console.log('CoreInstanceFromExports', section);
                    const exports = {} as any;
                    for (const { name, factory } of exportFactories) {
                        const value = await factory(ctx, args);
                        exports[name] = value;
                    }
                    //console.log('CoreInstanceFromExports exports', exports);
                    return exports;
                };
            }
            default:
                throw new Error(`${(section as any).tag} not implemented`);
        }
    });
}

