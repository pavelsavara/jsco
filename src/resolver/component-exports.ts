// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { ComponentExport, ComponentExternalKind } from '../parser/model/exports';
import { ComponentFuncIndex, ComponentInstanceIndex } from '../parser/model/indices';
import { ModelTag } from '../parser/model/tags';
import { withDebugTrace, jsco_assert } from '../utils/assert';
import { resolveComponentFunction } from './component-functions';
import { resolveComponentInstance } from './component-instances';
import { getComponentFunction, getComponentInstance } from './indices';
import { validateExportType } from './type-validation';
import { Resolver } from './types';

export const resolveComponentExport: Resolver<ComponentExport> = (rctx, rargs) => {
    const componentExport = rargs.element;
    jsco_assert(componentExport && componentExport.tag == ModelTag.ComponentExport, () => `Wrong element type '${componentExport?.tag}'`);

    // Validate the optional type annotation on the export if type checking is enabled.
    // Only validate top-level exports (callerElement is undefined) — nested exports
    // inside component sections use section-local type indices that don't map to
    // the global componentTypes array.
    if (rctx.validateTypes && componentExport.ty && !rargs.callerElement) {
        validateExportType(rctx, componentExport);
    }

    switch (componentExport.kind) {
        case ComponentExternalKind.Func: {
            const func = getComponentFunction(rctx, componentExport.index as ComponentFuncIndex);
            const functionResolution = resolveComponentFunction(rctx, { element: func, callerElement: componentExport });
            return {
                callerElement: rargs.callerElement,
                element: componentExport,
                binder: withDebugTrace(async (mctx, bargs) => {
                    const args = {
                        arguments: [componentExport.name.name],
                        imports: bargs.imports,
                        callerArgs: bargs,
                        debugStack: bargs.debugStack,
                    };

                    const exportResult = await functionResolution.binder(mctx, args);
                    const binderResult = {
                        result: { [componentExport.name.name]: exportResult.result }
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
                binder: withDebugTrace(async (mctx, bargs) => {
                    const args = {
                        arguments: [componentExport.name.name],
                        imports: bargs.imports,
                        callerArgs: bargs,
                        debugStack: bargs.debugStack,
                    };

                    const instanceResult = await instanceResolution.binder(mctx, args) as { result: { exports: Record<string, unknown> } };
                    const ifc: Record<string, unknown> = {};
                    ifc[componentExport.name.name] = instanceResult.result.exports;
                    const binderResult = {
                        result: ifc
                    };
                    return binderResult;
                }, rargs.element.tag + ':' + rargs.element.name.name + ':' + rargs.element.kind)
            };
        }
        case ComponentExternalKind.Type: {
            // Type exports are structural — they make a type visible to the
            // host/consumer but don't produce a runtime value. Return a
            // no-op binder that records the type export exists.
            return {
                callerElement: rargs.callerElement,
                element: componentExport,
                binder: withDebugTrace(async (_mctx, _bargs) => {
                    return { result: undefined };
                }, rargs.element.tag + ':' + rargs.element.name.name + ':Type')
            };
        }
        case ComponentExternalKind.Component:
        case ComponentExternalKind.Module:
        case ComponentExternalKind.Value:
        default:
            throw new Error(`${componentExport.kind} not implemented`);
    }
};