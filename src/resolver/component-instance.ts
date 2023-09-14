import { BindingContext } from '../binding/types';
import { ComponentExternalKind } from '../model/exports';
import { ModelTag } from '../model/tags';
import { prepareComponentFunction } from './component-functions';
import { prepareComponentTypeComponent } from './component-type-component';
import { prepareComponentTypeDefined } from './component-type-defined';
import { cacheFactory } from './context';
import { ResolverContext, JsInterface, ImplComponentInstance, ImplComponentFunction } from './types';

export function prepareComponentInstance(rctx: ResolverContext, componentInstanceIndex: number): Promise<ImplComponentInstance> {
    const section = rctx.indexes.componentInstances[componentInstanceIndex];
    return cacheFactory<ImplComponentInstance>(rctx, section, async () => {

        //console.log('prepareComponentInstance', componentInstanceIndex);
        async function createComponentInstance(ctx: BindingContext, componentType: JsInterface): Promise<JsInterface> {
            //console.log('createComponentInstance', index, section);
            return componentType;
        }

        switch (section.tag) {
            case ModelTag.ComponentInstanceInstantiate: {
                section.component_index;
                const typeFactory = await prepareComponentTypeComponent(rctx, section.component_index);
                const argFactories: ((ctx: BindingContext) => Promise<any>)[] = [];
                for (const arg of section.args) {
                    switch (arg.kind) {
                        case ComponentExternalKind.Func: {
                            const func = await prepareComponentFunction(rctx, arg.index);
                            argFactories.push(func);
                            break;
                        }
                        case ComponentExternalKind.Type: {
                            const type = await prepareComponentTypeDefined(rctx, arg.index);
                            argFactories.push(type);
                            break;
                        }
                        case ComponentExternalKind.Instance: {
                            const instance = await prepareComponentInstance(rctx, arg.index);
                            argFactories.push(instance);
                            break;
                        }
                        case ComponentExternalKind.Component:
                        case ComponentExternalKind.Module:
                        case ComponentExternalKind.Value:
                        default:
                            throw new Error(`"${arg.kind}" not implemented`);
                    }
                }

                return async (ctx) => {
                    const args = [];
                    for (const argFactory of argFactories) {
                        const arg = await argFactory(ctx);
                        args.push(arg);
                    }
                    //console.log('createComponentInstance', section, argFactories.length);
                    const componentType = await typeFactory(ctx, args);
                    return createComponentInstance(ctx, componentType);
                };
            }
            case ModelTag.ComponentInstanceFromExports: {
                const exportFactories: ({ name: string, factory: ImplComponentFunction })[] = [];
                for (const exp of section.exports) {
                    switch (exp.kind) {
                        case ComponentExternalKind.Func: {
                            const func = await prepareComponentFunction(rctx, exp.index);
                            // TODO: handle name kinds
                            exportFactories.push({ name: exp.name.name, factory: func });
                            break;
                        }
                        case ComponentExternalKind.Type: {
                            const type = await prepareComponentTypeDefined(rctx, exp.index);
                            exportFactories.push({ name: exp.name.name, factory: type });
                            break;
                        }
                        case ComponentExternalKind.Instance: {
                            const instance = await prepareComponentInstance(rctx, exp.index);
                            exportFactories.push({ name: exp.name.name, factory: instance });
                            break;
                        }
                        case ComponentExternalKind.Component:
                        case ComponentExternalKind.Module:
                        case ComponentExternalKind.Value:
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
            case ModelTag.ComponentTypeInstance: {
                for (const declaration of section.declarations) {
                    switch (declaration.tag) {
                        case ModelTag.InstanceTypeDeclarationType: {
                            // console.log('TODO ComponentTypeInstance', declaration);
                            break;
                        }
                        case ModelTag.InstanceTypeDeclarationExport: {
                            // console.log('TODO ComponentTypeInstance', declaration);
                            break;
                        }
                        case ModelTag.InstanceTypeDeclarationCoreType:
                        case ModelTag.InstanceTypeDeclarationAlias:
                        default:
                            throw new Error(`"${declaration.tag}" not implemented`);
                    }
                }

                return async (ctx) => {
                    return {} as any;
                };
                break;
            }
            default:
                throw new Error(`${(section as any).tag} not implemented`);
        }
    });
}

