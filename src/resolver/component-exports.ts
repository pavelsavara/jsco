import { ComponentExport, ComponentExternalKind } from '../model/exports';
import { ComponentFuncIndex, ComponentInstanceIndex } from '../model/indices';
import { ModelTag } from '../model/tags';
import { withDebugTrace, jsco_assert } from '../utils/assert';
import { resolveComponentFunction } from './component-functions';
import { resolveComponentInstance } from './component-instances';
import { getComponentFunction, getComponentInstance } from './indices';
import { Resolver } from './types';

export const resolveComponentExport: Resolver<ComponentExport> = (rctx, rargs) => {
    const componentExport = rargs.element;
    jsco_assert(componentExport && componentExport.tag == ModelTag.ComponentExport, () => `Wrong element type '${componentExport?.tag}'`);

    // TODO componentExport.ty ?
    switch (componentExport.kind) {
        case ComponentExternalKind.Func: {
            const func = getComponentFunction(rctx, componentExport.index as ComponentFuncIndex);
            const functionResolution = resolveComponentFunction(rctx, { element: func, callerElement: componentExport });
            return {
                callerElement: rargs.callerElement,
                element: componentExport,
                binder: withDebugTrace(async (bctx, bargs) => {
                    const args = {
                        arguments: [componentExport.name.name],
                        imports: bargs.imports,
                        callerArgs: bargs,
                        debugStack: bargs.debugStack,
                    };

                    const exportResult = await functionResolution.binder(bctx, args);
                    const binderResult = {
                        result: exportResult.result
                    };
                    return binderResult;
                }, rargs.element.tag + ':' + rargs.element.name.name + ':' + rargs.element.kind)
            };
        }
        case ComponentExternalKind.Instance: {
            const instance = getComponentInstance(rctx, componentExport.index as ComponentInstanceIndex);
            const instanceResolution = resolveComponentInstance(rctx, { element: instance, callerElement: componentExport });
            return {
                callerElement: rargs.callerElement,
                element: componentExport,
                binder: withDebugTrace(async (bctx, bargs) => {
                    const args = {
                        arguments: bargs.arguments,
                        imports: bargs.imports,
                        callerArgs: bargs,
                        debugStack: bargs.debugStack,
                    };

                    const instanceResult = await instanceResolution.binder(bctx, args);
                    const ifc: Record<string, unknown> = {};
                    ifc[componentExport.name.name] = instanceResult.result;
                    const binderResult = {
                        result: ifc
                    };
                    return binderResult;
                }, rargs.element.tag + ':' + rargs.element.name.name + ':' + rargs.element.kind)
            };
        }
        case ComponentExternalKind.Type: {
            throw new Error('TODO types');
        }
        case ComponentExternalKind.Component:
        case ComponentExternalKind.Module:
        case ComponentExternalKind.Value:
        default:
            throw new Error(`${componentExport.kind} not implemented`);
    }
};