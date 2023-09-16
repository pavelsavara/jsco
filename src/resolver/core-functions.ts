import { CoreFunction } from '../model/aliases';
import { CanonicalFunctionLower } from '../model/canonicals';
import { ModelTag } from '../model/tags';
import { ComponentTypeFunc, ComponentTypeInstance, InstanceTypeDeclarationType } from '../model/types';
import { debugStack, isDebug, jsco_assert } from '../utils/assert';
import { createFunctionLowering } from './binding';
import { resolveComponentFunction } from './component-functions';
import { resolveComponentAliasCoreInstanceExport } from './core-exports';
import { Resolver, BinderRes, ResolverRes } from './types';


export const resolveCoreFunction: Resolver<CoreFunction, any, Function> = (rctx, rargs) => {
    const coreInstance = rargs.element;
    switch (coreInstance.tag) {
        case ModelTag.ComponentAliasCoreInstanceExport: return resolveComponentAliasCoreInstanceExport(rctx, rargs as any) as ResolverRes<CoreFunction, any, Function>;
        case ModelTag.CanonicalFunctionLower: return resolveCanonicalFunctionLower(rctx, rargs as any);
        default: throw new Error(`"${(coreInstance as any).tag}" not implemented`);
    }
};

export const resolveCanonicalFunctionLower: Resolver<CanonicalFunctionLower, any, Function> = (rctx, rargs) => {
    const canonicalFunctionLowerElem = rargs.element;
    jsco_assert(canonicalFunctionLowerElem && canonicalFunctionLowerElem.tag == ModelTag.CanonicalFunctionLower, () => `Wrong element type '${canonicalFunctionLowerElem?.tag}'`);

    const componentFuntion = rctx.indexes.componentFunctions[canonicalFunctionLowerElem.func_index];
    const componentFunctionResolution = resolveComponentFunction(rctx, { element: componentFuntion, callerElement: canonicalFunctionLowerElem });

    // this is very fake
    const componentType = rctx.indexes.componentInstances[0] as ComponentTypeInstance;
    const instanceFunType = componentType.declarations[2] as InstanceTypeDeclarationType;
    const funcType = instanceFunType.value as ComponentTypeFunc;

    //TODO canonicalFunctionLowerElem.options
    const loweringBinder = createFunctionLowering(rctx, funcType);

    return {
        callerElement: rargs.callerElement,
        element: canonicalFunctionLowerElem,
        binder: async (bctx, bargs): Promise<BinderRes<Function>> => {
            const args = {
                arguments: bargs.arguments,
                callerArgs: bargs,
            };
            debugStack(bargs, args, rargs.element.tag + ':' + rargs.element.selfSortIndex);
            debugStack(args, args, componentFuntion.tag + ':' + componentFuntion.selfSortIndex);
            const functionResult = await componentFunctionResolution.binder(bctx, args);

            const wasmFunction = loweringBinder(bctx, functionResult.result);

            const binderResult = {
                // missingRes: rargs.element.tag,
                result: wasmFunction
            };
            if (isDebug) (binderResult as any)['bargs'] = bargs;
            return binderResult;
        }
    };
};
