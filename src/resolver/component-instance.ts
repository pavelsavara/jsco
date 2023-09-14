import { BindingContext } from '../binding/types';
import { ComponentExternalKind } from '../model/exports';
import { ModelTag } from '../model/tags';
import { prepareComponentFunction } from './component-functions';
import { prepareComponentTypeComponent } from './component-type-component';
import { prepareComponentTypeDefined } from './component-type-defined';
import { prepareComponentType, prepareComponentTypeReference } from './component-type-reference';
import { memoizePrepare } from './context';
import { ResolverContext, ImplComponentInstance, ImplComponentFunction, ImplComponentTypeReference } from './types';

export function prepareComponentInstance(rctx: ResolverContext, componentInstanceIndex: number): Promise<ImplComponentInstance> {
    const section = rctx.indexes.componentInstances[componentInstanceIndex];
    return memoizePrepare<ImplComponentInstance>(rctx, section, async () => {
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
                    return componentType;
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
                const typeFactories: (ImplComponentTypeReference)[] = [];
                for (const declaration of section.declarations) {
                    switch (declaration.tag) {
                        case ModelTag.InstanceTypeDeclarationType: {
                            //console.log('TODO ComponentTypeInstance', declaration, rctx.debugStack);
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
                            throw new Error(`"${declaration.tag}" not implemented`);
                    }
                }

                return async (ctx) => {
                    const exports = [];
                    for (const factory of typeFactories) {
                        const value = await factory(ctx);
                        exports.push(value);
                    }
                    return exports;
                };
                break;
            }
            default:
                throw new Error(`${(section as any).tag} not implemented`);
        }
    });
}

