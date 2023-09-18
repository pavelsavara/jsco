import { ComponentAliasInstanceExport, ComponentFunction } from '../model/aliases';
import { CanonicalFunctionLift } from '../model/canonicals';
import { ComponentExternalKind } from '../model/exports';
import { ModelTag } from '../model/tags';
import { debugStack, jsco_assert } from '../utils/assert';
import { createFunctionLifting } from './binding';
import { resolveComponentInstance } from './component-instances';
import { resolveCoreFunction } from './core-functions';
import { Resolver } from './types';
import camelCase from 'just-camel-case';
import kebabCase from 'just-kebab-case';

export const resolveComponentFunction: Resolver<ComponentFunction> = (rctx, rargs) => {
    const coreInstance = rargs.element;
    switch (coreInstance.tag) {
        case ModelTag.CanonicalFunctionLift: return resolveCanonicalFunctionLift(rctx, rargs as any);
        case ModelTag.ComponentAliasInstanceExport: return resolveComponentAliasInstanceExport(rctx, rargs as any);
        default: throw new Error(`"${(coreInstance as any).tag}" not implemented`);
    }
};

export const resolveCanonicalFunctionLift: Resolver<CanonicalFunctionLift> = (rctx, rargs) => {
    const canonicalFunctionLift = rargs.element;
    jsco_assert(canonicalFunctionLift && canonicalFunctionLift.tag == ModelTag.CanonicalFunctionLift, () => `Wrong element type '${canonicalFunctionLift?.tag}'`);

    const coreFuntion = rctx.indexes.coreFunctions[canonicalFunctionLift.core_func_index];
    const coreFunctionResolution = resolveCoreFunction(rctx, { element: coreFuntion, callerElement: canonicalFunctionLift });

    const sectionFunType = rctx.indexes.componentTypes[canonicalFunctionLift.type_index];
    jsco_assert(sectionFunType.tag === ModelTag.ComponentTypeFunc, () => `expected ComponentTypeFunc, got ${sectionFunType.tag}`);

    // TODO canonicalFunctionLift.options
    const liftingBinder = createFunctionLifting(rctx, sectionFunType);

    return {
        callerElement: rargs.callerElement,
        element: canonicalFunctionLift,
        binder: async (bctx, bargs) => {
            const args = {
                arguments: bargs.arguments,
                imports: bargs.imports,
                callerArgs: bargs,
            };
            debugStack(bargs, args, rargs.element.tag + ':' + rargs.element.selfSortIndex);
            const functionResult = await coreFunctionResolution.binder(bctx, args);

            const jsFunction = liftingBinder(bctx, functionResult.result);

            const binderResult = {
                // missingRes: rargs.element.tag,
                result: jsFunction
            };
            return binderResult;
        }
    };
};

export const resolveComponentAliasInstanceExport: Resolver<ComponentAliasInstanceExport> = (rctx, rargs) => {
    const componentAliasInstanceExport = rargs.element;
    jsco_assert(componentAliasInstanceExport && componentAliasInstanceExport.tag == ModelTag.ComponentAliasInstanceExport, () => `Wrong element type '${componentAliasInstanceExport?.tag}'`);

    if (componentAliasInstanceExport.kind === ComponentExternalKind.Type) {
        // TODO types
        return {
            callerElement: rargs.callerElement,
            element: componentAliasInstanceExport,
            binder: async (bctx, bargs) => {
                const binderResult = {
                    missingRes: rargs.element.tag,
                    confused: 1,
                    result: {
                        missingResTypes: rargs.element.tag,
                    }
                };
                return binderResult;
            }
        };
    }
    if (componentAliasInstanceExport.kind !== ComponentExternalKind.Func) {
        throw new Error(`"${componentAliasInstanceExport.kind}" not implemented`);
    }

    const instance = rctx.indexes.componentInstances[componentAliasInstanceExport.instance_index];
    const instanceResolution = resolveComponentInstance(rctx, { element: instance, callerElement: componentAliasInstanceExport });

    return {
        callerElement: rargs.callerElement,
        element: componentAliasInstanceExport,
        binder: async (bctx, bargs) => {
            //console.log('componentAliasInstanceExport', componentAliasInstanceExport, bargs.arguments);
            const args = {
                arguments: bargs.arguments,
                imports: bargs.imports,
                callerArgs: bargs,
            };
            debugStack(bargs, args, rargs.element.tag + ':' + rargs.element.selfSortIndex);
            const instanceResult = await instanceResolution.binder(bctx, args);

            let fn;
            // TODO this is very fake, how do it know this ?
            const askedName = args.arguments?.[0] as string;
            if (askedName) {
                const kbName = kebabCase(askedName);
                fn = instanceResult.result['import-func-' + kbName];
            } else {
                const ccName = camelCase(componentAliasInstanceExport.name);
                fn = instanceResult.result['hello:city/city'][ccName];
            }

            const binderResult = {
                result: fn
            };
            return binderResult;
        }
    };
};
