import { ComponentFunction, CoreFunction } from '../model/aliases';
import { CanonicalFunctionLower } from '../model/canonicals';
import { ModelTag } from '../model/tags';
import { ComponentTypeFunc, ComponentTypeInstance } from '../model/types';
import { debugStack, withDebugTrace, jsco_assert } from '../utils/assert';
import { createFunctionLowering } from './binding';
import { JsFunction } from './binding/types';
import { resolveComponentFunction } from './component-functions';
import { resolveComponentAliasCoreInstanceExport } from './core-exports';
import { getComponentFunction, getComponentType } from './indices';
import { Resolver, BinderRes, ResolverRes, resolveCanonicalOptions, StringEncoding } from './types';


export const resolveCoreFunction: Resolver<CoreFunction> = (rctx, rargs) => {
    const coreInstance = rargs.element;
    switch (coreInstance.tag) {
        case ModelTag.ComponentAliasCoreInstanceExport: return resolveComponentAliasCoreInstanceExport(rctx, rargs as any) as ResolverRes;
        case ModelTag.CanonicalFunctionLower: return resolveCanonicalFunctionLower(rctx, rargs as any);
        default: throw new Error(`"${(coreInstance as any).tag}" not implemented`);
    }
};

export const resolveCanonicalFunctionLower: Resolver<CanonicalFunctionLower> = (rctx, rargs) => {
    const canonicalFunctionLowerElem = rargs.element;
    jsco_assert(canonicalFunctionLowerElem && canonicalFunctionLowerElem.tag == ModelTag.CanonicalFunctionLower, () => `Wrong element type '${canonicalFunctionLowerElem?.tag}'`);

    const componentFuntion = getComponentFunction(rctx, canonicalFunctionLowerElem.func_index);
    const componentFunctionResolution = resolveComponentFunction(rctx, { element: componentFuntion, callerElement: canonicalFunctionLowerElem });

    // Resolve function type by following the component function chain:
    // CanonicalFunctionLower.func_index → componentFunction →
    //   CanonicalFunctionLift.type_index → ComponentTypeFunc
    //   ComponentAliasInstanceExport → resolvedTypes lookup
    const funcType = resolveLoweredFuncType(rctx, componentFuntion);

    const canonOpts = resolveCanonicalOptions(canonicalFunctionLowerElem.options);
    jsco_assert(canonOpts.stringEncoding === StringEncoding.Utf8,
        () => `String encoding '${canonOpts.stringEncoding}' not yet supported, only UTF-8`);

    const loweringBinder = createFunctionLowering(rctx, funcType);

    return {
        callerElement: rargs.callerElement,
        element: canonicalFunctionLowerElem,
        binder: withDebugTrace(async (bctx, bargs): Promise<BinderRes> => {
            const args = {
                arguments: bargs.arguments,
                imports: bargs.imports,
                callerArgs: bargs,
                debugStack: bargs.debugStack,
            };
            debugStack(args, args, componentFuntion.tag + ':' + componentFuntion.selfSortIndex);
            const functionResult = await componentFunctionResolution.binder(bctx, args);

            const wasmFunction = loweringBinder(bctx, functionResult.result as JsFunction);

            const binderResult = {
                result: wasmFunction
            };
            return binderResult;
        }, rargs.element.tag + ':' + rargs.element.selfSortIndex)
    };
};

function resolveLoweredFuncType(rctx: import('./types').ResolverContext, componentFunction: ComponentFunction): ComponentTypeFunc {
    // If the component function is a CanonicalFunctionLift, it has type_index directly
    if (componentFunction.tag === ModelTag.CanonicalFunctionLift) {
        const sectionFunType = getComponentType(rctx, componentFunction.type_index);
        jsco_assert(sectionFunType.tag === ModelTag.ComponentTypeFunc,
            () => `expected ComponentTypeFunc from lift type_index, got ${sectionFunType.tag}`);
        return sectionFunType as ComponentTypeFunc;
    }

    // If the component function is a ComponentAliasInstanceExport, trace through the instance
    if (componentFunction.tag === ModelTag.ComponentAliasInstanceExport) {
        const instance = rctx.indexes.componentInstances[componentFunction.instance_index];
        if (instance.tag === ModelTag.ComponentTypeInstance) {
            // Find the export declaration matching the alias name
            for (const decl of (instance as ComponentTypeInstance).declarations) {
                if (decl.tag === ModelTag.InstanceTypeDeclarationExport &&
                    decl.name.name === componentFunction.name) {
                    // The ty.value is a local type index into the instance's declarations
                    if (decl.ty.tag === ModelTag.ComponentTypeRefFunc) {
                        const typeDecl = (instance as ComponentTypeInstance).declarations[decl.ty.value];
                        if (typeDecl.tag === ModelTag.InstanceTypeDeclarationType &&
                            typeDecl.value.tag === ModelTag.ComponentTypeFunc) {
                            return typeDecl.value as ComponentTypeFunc;
                        }
                    }
                }
            }
        }

        // Fallback: try resolvedTypes map
        const typeIndex = componentFunction.selfSortIndex;
        if (typeIndex !== undefined) {
            const resolved = rctx.resolvedTypes.get(typeIndex as import('../model/indices').ComponentTypeIndex);
            if (resolved && resolved.tag === ModelTag.ComponentTypeFunc) {
                return resolved;
            }
        }
        // TODO: trace alias chain through instances for more complex cases
        throw new Error(`Could not resolve function type for ComponentAliasInstanceExport '${componentFunction.name}'`);
    }

    throw new Error(`Cannot resolve function type for component function tag '${componentFunction.tag}'`);
}
