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
                    const componentType = await componentFactory(ctx, args);
                    return componentType;
                };
            }
            /*
            case ModelTag.ComponentTypeInstance: {
                const typeFactories: NamesImplFactory[] = [];
                for (const declaration of section.declarations) {
                    switch (declaration.tag) {
                        case ModelTag.InstanceTypeDeclarationType: {
                            const type = await prepareComponentType(rctx, declaration.value);
                            typeFactories.push(type);
                            break;
                        }
                        case ModelTag.InstanceTypeDeclarationExport: {
                            const ref = await prepareComponentTypeReference(rctx, declaration.ty);
                            typeFactories.push(ref);
                            break;
                        }
                        case ModelTag.InstanceTypeDeclarationCoreType:
                        case ModelTag.InstanceTypeDeclarationAlias:
                        default:
                            throw new Error(`"${declaration.tag}" not implemented, ${rctx.debugStack}`);
                    }
                }

                return async (ctx, imports) => {
                    const exports = [];
                    for (const { name, factory } of typeFactories) {
                        const value = await factory(ctx, imports);
                        exports.push(value);
                    }
                    return exports;
                };
                break;
            }*/
            default:
                throw new Error(`${(section as any).tag} not implemented`);
        }
    });
}

