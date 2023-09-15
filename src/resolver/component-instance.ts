import { ComponentExternalKind } from '../model/exports';
import { ModelTag } from '../model/tags';
import { prepareComponentExports } from './component-exports';
import { prepareComponentFunction } from './component-functions';
import { prepareComponentSection } from './component-section';
import { memoizePrepare } from './context';
import { ResolverContext, ImplFactory, NamedImplFactory } from './types';

export function prepareComponentInstance(rctx: ResolverContext, componentInstanceIndex: number): Promise<ImplFactory> {
    const section = rctx.indexes.componentInstances[componentInstanceIndex];
    return memoizePrepare<ImplFactory>(rctx, section, async () => {
        switch (section.tag) {
            case ModelTag.ComponentInstanceFromExports: {
                const factory = await prepareComponentExports(rctx, section.exports);
                return async (ctx, args) => {
                    const exports = factory(ctx, args);
                    return exports;
                };
            }
            case ModelTag.ComponentInstanceInstantiate: {
                const componentFactory = await prepareComponentSection(rctx, section.component_index);
                const importFactories: NamedImplFactory[] = [];
                for (const arg of section.args) {
                    switch (arg.kind) {
                        case ComponentExternalKind.Func: {
                            const factory = await prepareComponentFunction(rctx, arg.index);
                            importFactories.push({ name: arg.name + '!!2', factory });
                            break;
                        }
                        case ComponentExternalKind.Instance: {
                            const factory = await prepareComponentInstance(rctx, arg.index);
                            importFactories.push({ name: arg.name, factory });
                            break;
                        }
                        case ComponentExternalKind.Type: {
                            //const type = resolveComponentTypeIndex(rctx, arg.index);
                            importFactories.push({
                                name: arg.name, factory: async () => {
                                    return { TODO: section.tag + ' ' + arg.kind + ' ' + (new Error().stack)!.split('\n')[1] };
                                }
                            });
                            break;
                        }
                        case ComponentExternalKind.Component:
                        case ComponentExternalKind.Module:
                        case ComponentExternalKind.Value:
                        default:
                            throw new Error(`"${arg.kind}" not implemented`);
                    }
                }

                return async (ctx, args) => {
                    const componentArgs = {} as any;
                    for (const { name, factory } of importFactories) {
                        const arg = await factory(ctx, args);
                        componentArgs[name] = arg;
                    }
                    const componentInstance = await componentFactory(ctx, componentArgs);
                    //console.log('PAVEL instance componentArgs', componentArgs);
                    console.log('PAVEL instance componentInstance', componentInstance);
                    return componentInstance;
                };
            }
            case ModelTag.ComponentTypeInstance: {
                const exportFactories: NamedImplFactory[] = [];
                for (const declaration of section.declarations) {
                    switch (declaration.tag) {
                        case ModelTag.InstanceTypeDeclarationExport: {
                            //const factory = await prepareComponentTypeRef(rctx, declaration.ty);
                            //exportFactories.push({ name: declaration.name.name, factory });
                            exportFactories.push({
                                name: declaration.name.name, factory: async () => {
                                    return { TODO: section.tag + ' ' + declaration.tag + ' ' + (new Error().stack)!.split('\n')[1] };
                                }
                            });
                            break;
                        }
                        case ModelTag.InstanceTypeDeclarationType: {
                            //const type = resolveComponentType(rctx, declaration.value);
                            exportFactories.push({
                                name: declaration.value.tag, factory: async () => {
                                    return { TODO: section.tag + ' ' + declaration.tag + ' ' + (new Error().stack)!.split('\n')[1] };
                                }
                            });
                            break;
                        }
                        case ModelTag.InstanceTypeDeclarationCoreType:
                        case ModelTag.InstanceTypeDeclarationAlias:
                        default:
                            throw new Error(`"${declaration.tag}" not implemented, ${rctx.debugStack}`);
                    }
                }
                return async (ctx, args) => {
                    let instance = ctx.componentInstances[componentInstanceIndex];
                    if (instance) {
                        return instance;
                    }
                    const exports: any = {
                        TODO: (new Error().stack)!.split('\n')[1],
                    };
                    for (const { name, factory } of exportFactories) {
                        const value = await factory(ctx, args);
                        exports[name] = value;
                    }
                    instance = {
                        TODO: (new Error().stack)!.split('\n')[1],
                        abort: ctx.abort,
                        exports,
                    } as any;
                    ctx.componentInstances[componentInstanceIndex] = instance;
                    return instance;
                };
            }
            default:
                throw new Error(`${(section as any).tag} not implemented`);
        }
    });
}

