import { ComponentExternalKind } from '../model/exports';
import { ComponentInstance, ComponentInstanceInstantiate, ComponentInstantiationArg } from '../model/instances';
import { ModelTag } from '../model/tags';
import { ComponentTypeInstance } from '../model/types';
import { debugStack, jsco_assert } from '../utils/assert';
import { JsInterfaceCollection } from './api-types';
import { resolveComponentFunction } from './component-functions';
import { resolveComponentType } from './component-types';
import { BinderRes, Resolver, ResolverRes } from './types';

export const resolveComponentInstance: Resolver<ComponentInstance> = (rctx, rargs) => {
    const coreInstance = rargs.element;
    switch (coreInstance.tag) {
        case ModelTag.ComponentInstanceInstantiate: return resolveComponentInstanceInstantiate(rctx, rargs as any);
        // case ModelTag.ComponentInstanceFromExports: return resolveComponentInstanceFromExports(rctx, rargs as any);
        case ModelTag.ComponentTypeInstance: return resolveComponentTypeInstance(rctx, rargs as any);
        default: throw new Error(`"${(coreInstance as any).tag}" not implemented`);
    }
};

export const resolveComponentInstanceInstantiate: Resolver<ComponentInstanceInstantiate> = (rctx, rargs) => {
    const componentInstanceInstantiate = rargs.element;
    jsco_assert(componentInstanceInstantiate && componentInstanceInstantiate.tag == ModelTag.ComponentInstanceInstantiate, () => `Wrong element type '${componentInstanceInstantiate?.tag}'`);
    const componentSectionIndex = componentInstanceInstantiate.component_index;
    const componentSection = rctx.indexes.componentTypes[componentSectionIndex];
    const componentSectionResolution = resolveComponentType(rctx, { element: componentSection, callerElement: componentInstanceInstantiate });
    const argResolutions: ResolverRes[] = [];
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
                // TODO types
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
            if (bctx.componentInstances[componentInstanceInstantiate.selfSortIndex!]) {
                throw new Error(`Component instance already instantiated: ${componentInstanceInstantiate.selfSortIndex}`);
            }
            const binderResult: BinderRes = {} as any;
            bctx.componentInstances[componentInstanceInstantiate.selfSortIndex!] = binderResult;

            const componentArgs = {} as any;
            for (const argResolution of argResolutions) {
                const callerElement = argResolution.callerElement as ComponentInstantiationArg;

                const args = {
                    arguments: bargs.arguments,
                    imports: bargs.imports,
                    callerArgs: bargs,
                };
                debugStack(bargs, args, rargs.element.tag + ':' + rargs.element.selfSortIndex);
                debugStack(args, args, 'ComponentInstantiationArg:' + callerElement.index + ':' + callerElement.name);
                const argResult = await argResolution.binder(bctx, args);
                componentArgs[callerElement.name] = argResult.result;
            }

            const args = {
                imports: componentArgs,
                callerArgs: bargs,
            };
            debugStack(bargs, args, rargs.element.tag + ':' + rargs.element.selfSortIndex);
            const componentSectionResult = await componentSectionResolution.binder(bctx, args);

            binderResult.result = componentSectionResult.result as JsInterfaceCollection;
            return binderResult;
        }
    };
};

export const resolveComponentTypeInstance: Resolver<ComponentTypeInstance> = (rctx, rargs) => {
    const componentTypeInstance = rargs.element;
    jsco_assert(componentTypeInstance && componentTypeInstance.tag == ModelTag.ComponentTypeInstance, () => `Wrong element type '${componentTypeInstance?.tag}'`);

    // TODO componentTypeInstance.declarations

    return {
        callerElement: rargs.callerElement,
        element: componentTypeInstance,
        binder: async (bctx, bargs) => {
            const binderResult = {
                missingRes: rargs.element.tag,
                result: {}
            };
            return binderResult;
        }
    };
};

