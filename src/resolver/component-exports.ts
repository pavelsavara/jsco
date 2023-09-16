import { ComponentExport, ComponentExternalKind } from '../model/exports';
import { ModelTag } from '../model/tags';
import { debugStack, isDebug, jsco_assert } from '../utils/assert';
import { JsInterfaceCollection } from './api-types';
import { resolveComponentFunction } from './component-functions';
import { resolveComponentInstance } from './component-instances';
import { resolveComponentType } from './component-types';
import { Resolver } from './types';

export const resolveComponentExport: Resolver<ComponentExport, any, JsInterfaceCollection> = (rctx, rargs) => {
    const componentExport = rargs.element;
    jsco_assert(componentExport && componentExport.tag == ModelTag.ComponentExport, () => `Wrong element type '${componentExport?.tag}'`);

    // TODO componentExport.ty ?
    switch (componentExport.kind) {
        case ComponentExternalKind.Func: {
            const func = rctx.indexes.componentFunctions[componentExport.index];
            const functionResolution = resolveComponentFunction(rctx, { element: func, callerElement: componentExport });
            return {
                callerElement: rargs.callerElement,
                element: componentExport,
                binder: async (bctx, bargs) => {
                    const args = {
                        arguments: bargs.arguments,
                        callerArgs: bargs,
                    };
                    debugStack(bargs, args, rargs.element.tag + ':' + rargs.element.name.name + ':' + rargs.element.kind);

                    const exportResult = await functionResolution.binder(bctx, args);
                    const binderResult = {
                        // missingRes: rargs.element.tag,
                        result: exportResult.result
                    };
                    if (isDebug) (binderResult as any)['bargs'] = bargs;
                    if (isDebug) (binderResult as any)['exportResult'] = exportResult;
                    return binderResult;
                }
            };
        }
        case ComponentExternalKind.Instance: {
            const instance = rctx.indexes.componentInstances[componentExport.index];
            const instanceResolution = resolveComponentInstance(rctx, { element: instance, callerElement: componentExport });
            return {
                callerElement: rargs.callerElement,
                element: componentExport,
                binder: async (bctx, bargs) => {
                    const args = {
                        arguments: bargs.arguments,
                        callerArgs: bargs,
                    };
                    debugStack(bargs, args, rargs.element.tag + ':' + rargs.element.name.name + ':' + rargs.element.kind);

                    const instanceResult = await instanceResolution.binder(bctx, args);
                    const ifc: any = {};
                    ifc[componentExport.name.name] = instanceResult.result;
                    const binderResult = {
                        // missingRes: rargs.element.tag,
                        result: ifc
                    };
                    if (isDebug) (binderResult as any)['bargs'] = bargs;
                    if (isDebug) (binderResult as any)['exportResult'] = instanceResult;
                    return binderResult;
                }
            };
        }
        case ComponentExternalKind.Type: {
            const type = rctx.indexes.componentTypes[componentExport.index];
            const typeResolution = resolveComponentType(rctx, { element: type, callerElement: componentExport });
            return {
                callerElement: rargs.callerElement,
                element: componentExport,
                binder: async (bctx, bargs) => {
                    const args = {
                        arguments: bargs.arguments,
                        callerArgs: bargs,
                    };
                    debugStack(bargs, args, rargs.element.tag + ':' + rargs.element.name.name + ':' + rargs.element.kind);
                    const exportResult = await typeResolution.binder(bctx, args);
                    const ifc: any = {};
                    ifc[componentExport.name.name] = exportResult.result;
                    const binderResult = {
                        // missingRes: rargs.element.tag,
                        result: ifc
                    };
                    if (isDebug) (binderResult as any)['bargs'] = bargs;
                    if (isDebug) (binderResult as any)['exportResult'] = exportResult;
                    return binderResult;
                }
            };
        }
        case ComponentExternalKind.Component:
        case ComponentExternalKind.Module:
        case ComponentExternalKind.Value:
        default:
            throw new Error(`${componentExport.kind} not implemented`);
    }
};