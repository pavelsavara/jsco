import { ComponentExternalKind } from '../model/exports';
import { ComponentInstance, ComponentInstanceFromExports, ComponentInstanceInstantiate, ComponentInstantiationArg } from '../model/instances';
import { ModelTag } from '../model/tags';
import { ComponentTypeInstance } from '../model/types';
import { debugStack, isDebug, jsco_assert } from '../utils/assert';
import { JsInterfaceCollection } from './api-types';
import { resolveComponentFunction } from './component-functions';
import { resolveComponentType } from './component-types';
import { Resolver, ResolverRes } from './types';

export const resolveComponentInstance: Resolver<ComponentInstance, any, any> = (rctx, rargs) => {
    const coreInstance = rargs.element;
    switch (coreInstance.tag) {
        case ModelTag.ComponentInstanceInstantiate: return resolveComponentInstanceInstantiate(rctx, rargs as any);
        case ModelTag.ComponentInstanceFromExports: return resolveComponentInstanceFromExports(rctx, rargs as any);
        case ModelTag.ComponentTypeInstance: return resolveComponentTypeInstance(rctx, rargs as any);
        default: throw new Error(`"${(coreInstance as any).tag}" not implemented`);
    }
};

export const resolveComponentInstanceInstantiate: Resolver<ComponentInstanceInstantiate, any, JsInterfaceCollection> = (rctx, rargs) => {
    const componentInstanceInstantiate = rargs.element;
    jsco_assert(componentInstanceInstantiate && componentInstanceInstantiate.tag == ModelTag.ComponentInstanceInstantiate, () => `Wrong element type '${componentInstanceInstantiate?.tag}'`);
    const componentSectionIndex = componentInstanceInstantiate.component_index;
    const componentSection = rctx.indexes.componentTypes[componentSectionIndex];
    const componentSectionResolution = resolveComponentType(rctx, { element: componentSection, callerElement: componentInstanceInstantiate });
    const argResolutions: ResolverRes<any, any, any>[] = [];
    for (const arg of componentInstanceInstantiate.args) {
        switch (arg.kind) {
            case ComponentExternalKind.Func: {
                const componentFunction = rctx.indexes.componentFunctions[arg.index];
                const resolver = resolveComponentFunction(rctx, { element: componentFunction, callerElement: arg });
                argResolutions.push(resolver as any);
                break;
            }
            case ComponentExternalKind.Instance: {
                const componentInstance = rctx.indexes.componentInstances[arg.index];
                const resolver = resolveComponentInstance(rctx, { element: componentInstance, callerElement: arg });
                argResolutions.push(resolver as any);
                break;
            }
            case ComponentExternalKind.Type: {
                // const componentType = rctx.indexes.componentTypes[arg.index];
                // TODO types
                //const resolver = resolveComponentType(rctx, { element: componentType, callerElement: arg });
                //resolvers.push(resolver as any);
                break;
            }
            case ComponentExternalKind.Component:
            case ComponentExternalKind.Module:
            case ComponentExternalKind.Value:
            default:
                throw new Error(`"${arg.kind}" not implemented`);
        }
    }


    return {
        callerElement: rargs.callerElement,
        element: componentInstanceInstantiate,
        binder: async (bctx, bargs) => {
            const componentArgs = {} as any;
            for (const argResolution of argResolutions) {
                const callerElement = argResolution.callerElement as ComponentInstantiationArg;

                const args = {
                    arguments: bargs.arguments,
                    callerArgs: bargs,
                };
                debugStack(bargs, args, rargs.element.tag + ':' + rargs.element.selfSortIndex);
                debugStack(args, args, 'ComponentInstantiationArg:' + callerElement.index + ':' + callerElement.name);
                const argResult = await argResolution.binder(bctx, args);

                componentArgs[callerElement.name] = argResult.result as any;
                if (isDebug) (componentArgs as any)['arguments-of:' + callerElement.name] = bargs;
            }

            const args = {
                arguments: componentArgs,
                callerArgs: bargs,
            };
            debugStack(bargs, args, rargs.element.tag + ':' + rargs.element.selfSortIndex);
            const componentSectionResult = await componentSectionResolution.binder(bctx, args);

            const binderResult = {
                result: componentSectionResult.result as JsInterfaceCollection
            };
            if (isDebug) (binderResult as any)['bargs'] = bargs;
            return binderResult;
        }
    };
};

export const resolveComponentInstanceFromExports: Resolver<ComponentInstanceFromExports, any, JsInterfaceCollection> = (rctx, rargs) => {
    const componentInstanceFromExports = rargs.element;
    jsco_assert(componentInstanceFromExports && componentInstanceFromExports.tag == ModelTag.ComponentInstanceFromExports, () => `Wrong element type '${componentInstanceFromExports?.tag}'`);

    throw new Error('TODO');

    /*
        const exportResolutions: ResolverRes<ComponentExport, any, JsInterfaceCollection>[] = [];
        for (const exp of componentInstanceFromExports.exports) {
            switch (exp.kind) {
                case ComponentExternalKind.Func: {
                    const exportResolution = resolveComponentExport(rctx, { element: exp, callerElement: exp });
                    exportResolutions.push(exportResolution);
                    break;
                }
                default:
                    throw new Error(`"${exp.kind}" not implemented`);
            }
        }
    
        return {
            callerElement: rargs.callerElement,
            element: componentInstanceFromExports,
            binder: async (bctx, bargs) => {
                const exports = {} as JsInterfaceCollection;
                for (const exportResolution of exportResolutions) {
                    const callerElement = exportResolution.callerElement as ComponentExport;
                    const args = {
                        arguments: { missingArgxx: rargs.element.tag },
                        callerArgs: bargs,
                    };
                    debugStack(bargs, args, rargs.element.tag + ':' + rargs.element.selfSortIndex);
                    debugStack(args, args, 'ComponentInstanceFromExports:'+callerElement.index + ':' + callerElement.name);

                    const argResult = await exportResolution.binder(bctx, args);
                    exports[callerElement.name.name] = argResult.result as any;
                }
                const binderResult: BinderRes<JsInterfaceCollection> = {
                    result: {
                        ...exports,
                        missingRes: rargs.element.tag
                    } as any as JsInterfaceCollection
                };
                if (isDebug) (binderResult as any)['arguments'] = bargs;
                return binderResult;
    
            }
        };*/
};

export const resolveComponentTypeInstance: Resolver<ComponentTypeInstance, any, any> = (rctx, rargs) => {
    const componentTypeInstance = rargs.element;
    jsco_assert(componentTypeInstance && componentTypeInstance.tag == ModelTag.ComponentTypeInstance, () => `Wrong element type '${componentTypeInstance?.tag}'`);

    for (const decl of componentTypeInstance.declarations) {
        switch (decl.tag) {
            case ModelTag.InstanceTypeDeclarationType: {
                // TODO types
                break;
            }
            case ModelTag.InstanceTypeDeclarationExport: {
                switch (decl.ty.tag) {
                    case ModelTag.ComponentTypeRefType: {
                        // TODO types
                        break;
                    }
                    case ModelTag.ComponentTypeRefFunc: {
                        // TODO types
                        //decl.name;
                        //decl.ty;
                        //decl.ty.value;
                        break;
                    }
                    default: throw new Error(`"${decl.ty.tag}" not implemented`);
                }
                break;
            }
            case ModelTag.InstanceTypeDeclarationCoreType:
            case ModelTag.InstanceTypeDeclarationAlias:
            default: throw new Error(`"${decl.tag}" not implemented`);
        }
    }

    return {
        callerElement: rargs.callerElement,
        element: componentTypeInstance,
        binder: async (bctx, bargs) => {
            const binderResult = {
                missingRes: rargs.element.tag,
                result: {
                    missingResRes: rargs.element.tag,
                    confused: 2
                } as any
            };
            if (isDebug) (binderResult as any)['bargs'] = bargs;
            return binderResult;
        }
    };
};

