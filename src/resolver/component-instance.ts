import { ComponentExternalKind } from '../model/exports';
import { ModelTag } from '../model/tags';
import { prepareComponentExports } from './component-exports';
import { prepareComponentFunction } from './component-functions';
import { prepareComponentSection } from './component-section';
import { prepareComponentType, prepareComponentTypeRef } from './component-type-ref';
import { memoizePrepare } from './context';
import { ResolverContext, ImplFactory, NamedImplFactory } from './types';

export function prepareComponentInstance(rctx: ResolverContext, componentInstanceIndex: number): Promise<ImplFactory> {
    const section = rctx.indexes.componentInstances[componentInstanceIndex];
    return memoizePrepare<ImplFactory>(rctx, section, async () => {
        switch (section.tag) {
            case ModelTag.ComponentInstanceFromExports: {
                const factory = await prepareComponentExports(rctx, section.exports);
                return async (ctx, imports) => {
                    const exports = factory(ctx, imports);
                    return exports;
                };
            }
            case ModelTag.ComponentInstanceInstantiate: {
                section.component_index;
                const componentFactory = await prepareComponentSection(rctx, section.component_index);
                const importFactories: NamedImplFactory[] = [];
                for (const arg of section.args) {
                    switch (arg.kind) {
                        case ComponentExternalKind.Func: {
                            const factory = await prepareComponentFunction(rctx, arg.index);
                            importFactories.push({ name: arg.name, factory });
                            break;
                        }
                        case ComponentExternalKind.Instance: {
                            const factory = await prepareComponentInstance(rctx, arg.index);
                            importFactories.push({ name: arg.name, factory });
                            break;
                        }
                        case ComponentExternalKind.Type: {
                            //const factory = await prepareComponentTypeDefined(rctx, arg.index);
                            //importFactories.push({ name: arg.name, factory });

                            const factory = async () => {
                                return {
                                    TODO: arg.kind
                                };
                            };
                            importFactories.push({ name: arg.name, factory });
                            break;
                        }
                        case ComponentExternalKind.Component:
                        case ComponentExternalKind.Module:
                        case ComponentExternalKind.Value:
                        default:
                            throw new Error(`"${arg.kind}" not implemented`);
                    }
                }

                return async (ctx, imports) => {
                    const args = {} as any;
                    for (const { name, factory } of importFactories) {
                        const arg = await factory(ctx, imports);
                        args[name] = arg;
                    }
                    const componentInstance = await componentFactory(ctx, args);
                    console.log('PAVEL in', args);
                    console.log('PAVEL out', componentInstance);
                    return componentInstance;
                };
            }
            case ModelTag.ComponentTypeInstance: {
                const typeFactories: ImplFactory[] = [];
                const exportFactories: NamedImplFactory[] = [];
                for (const declaration of section.declarations) {
                    switch (declaration.tag) {
                        case ModelTag.InstanceTypeDeclarationExport: {
                            const factory = await prepareComponentTypeRef(rctx, declaration.ty);
                            exportFactories.push({ name: declaration.name.name, factory });
                            break;
                        }
                        case ModelTag.InstanceTypeDeclarationType: {
                            const factory = await prepareComponentType(rctx, declaration.value);
                            typeFactories.push(factory);
                            break;
                        }
                        case ModelTag.InstanceTypeDeclarationCoreType:
                        case ModelTag.InstanceTypeDeclarationAlias:
                        default:
                            throw new Error(`"${declaration.tag}" not implemented, ${rctx.debugStack}`);
                    }
                }

                return async (ctx, imports) => {
                    const exports: any = {};
                    for (const { name, factory } of exportFactories) {
                        const value = await factory(ctx, imports);
                        exports[name] = value;
                    }
                    for (const [i, factory] of typeFactories.entries()) {
                        const value = await factory(ctx, imports);
                        exports['__type' + i] = value;
                    }
                    return exports;
                };
            }
            default:
                throw new Error(`${(section as any).tag} not implemented`);
        }
    });
}

