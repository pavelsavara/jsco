// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import isDebug from 'env:isDebug';
import { ComponentAliasInstanceExport, ComponentFunction } from '../model/aliases';
import { CanonicalFunctionLift } from '../model/canonicals';
import { ComponentExport, ComponentExternalKind } from '../model/exports';
import { CoreFuncIndex } from '../model/indices';
import { ModelTag } from '../model/tags';
import { withDebugTrace, jsco_assert, LogLevel } from '../utils/assert';
import { createFunctionLifting } from './binding';
import { WasmFunction } from './binding/types';
import { resolveComponentInstance } from './component-instances';
import { resolveComponentImport } from './component-imports';
import { resolveCoreFunction } from './core-functions';
import { getCoreFunction, getComponentType, getComponentInstance } from './indices';
import { Resolver, ResolvedContext, ResolverRes, resolveCanonicalOptions } from './types';
import camelCase from 'just-camel-case';

export const resolveComponentFunction: Resolver<ComponentFunction> = (rctx, rargs) => {
    const cached = rctx.componentFunctionCache.get(rargs.element);
    if (cached) {
        if (isDebug && rctx.resolved.stats) rctx.resolved.stats.componentFunctionCacheHits++;
        return { ...cached, callerElement: rargs.callerElement };
    }
    const coreInstance = rargs.element;
    let result: ResolverRes;
    switch (coreInstance.tag) {
        case ModelTag.CanonicalFunctionLift: result = resolveCanonicalFunctionLift(rctx, rargs as any); break;
        case ModelTag.ComponentAliasInstanceExport: result = resolveComponentAliasInstanceExport(rctx, rargs as any); break;
        case ModelTag.ComponentImport: result = resolveComponentImport(rctx, rargs as any); break;
        default: throw new Error(`"${(coreInstance as any).tag}" not implemented`);
    }
    rctx.componentFunctionCache.set(rargs.element, result);
    return result;
};

export const resolveCanonicalFunctionLift: Resolver<CanonicalFunctionLift> = (rctx, rargs) => {
    const canonicalFunctionLift = rargs.element;
    jsco_assert(canonicalFunctionLift && canonicalFunctionLift.tag == ModelTag.CanonicalFunctionLift, () => `Wrong element type '${canonicalFunctionLift?.tag}'`);

    const coreFuntion = getCoreFunction(rctx, canonicalFunctionLift.core_func_index);
    const coreFunctionResolution = resolveCoreFunction(rctx, { element: coreFuntion, callerElement: canonicalFunctionLift });

    const sectionFunType = getComponentType(rctx, canonicalFunctionLift.type_index);
    jsco_assert(sectionFunType.tag === ModelTag.ComponentTypeFunc, () => `expected ComponentTypeFunc, got ${sectionFunType.tag}`);

    if (isDebug && (rctx.resolved.verbose?.binder ?? 0) >= LogLevel.Summary) {
        const chain = `canon.lift[${canonicalFunctionLift.selfSortIndex}] → core_func[${canonicalFunctionLift.core_func_index}]`;
        rctx.resolved.logger!('binder', LogLevel.Summary,
            `type chain: ${chain} → ComponentTypeFunc[${canonicalFunctionLift.type_index}]`);
    }

    const canonOpts = resolveCanonicalOptions(canonicalFunctionLift.options);

    // Create a shallow copy of resolved context with the canonical string encoding.
    // If this function uses Number-mode for int64, also swap to separate caches
    // so that Number-mode and BigInt-mode type compilations don't collide.
    let localResolved: ResolvedContext = {
        ...rctx.resolved,
        stringEncoding: canonOpts.stringEncoding,
    };

    // Resolve the post-return core function if specified in canonical options
    let postReturnResolution: ResolverRes | undefined;
    if (canonOpts.postReturnIndex !== undefined) {
        const postReturnFunc = getCoreFunction(rctx, canonOpts.postReturnIndex as CoreFuncIndex);
        postReturnResolution = resolveCoreFunction(rctx, { element: postReturnFunc, callerElement: canonicalFunctionLift });
    }

    // When useNumberForInt64 is string[], check if this function's export name
    // matches and temporarily switch to Number-mode with separate caches.
    const numberForMethods = rctx.resolved.useNumberForInt64Methods;
    if (numberForMethods) {
        const callerExport = rargs.callerElement;
        const exportName = callerExport && callerExport.tag === ModelTag.ComponentExport
            ? (callerExport as ComponentExport).name.name : undefined;
        const useNumber = exportName !== undefined && numberForMethods.includes(exportName);
        if (useNumber) {
            const nmLiftingCache = rctx.resolved.numberModeLiftingCache;
            const nmLoweringCache = rctx.resolved.numberModeLoweringCache;
            if (!nmLiftingCache || !nmLoweringCache) throw new Error('numberMode caches not initialized');
            localResolved = {
                ...localResolved,
                usesNumberForInt64: true,
                liftingCache: nmLiftingCache,
                loweringCache: nmLoweringCache,
            };
        }
    }

    const liftingBinder = createFunctionLifting(localResolved, sectionFunType);

    const wrapLift = rctx.resolved.wrapLift;

    return {
        callerElement: rargs.callerElement,
        element: canonicalFunctionLift,
        binder: withDebugTrace(async (bctx, bargs) => {
            // Wire up post-return function from canonical options
            if (postReturnResolution) {
                const postReturnResult = await postReturnResolution.binder(bctx, {
                    callerArgs: bargs,
                    debugStack: bargs.debugStack,
                });
                const postReturnWasm = postReturnResult.result as Function;
                bctx.postReturnFn = postReturnWasm;
            }

            const args = {
                arguments: bargs.arguments,
                imports: bargs.imports,
                callerArgs: bargs,
                debugStack: bargs.debugStack,
            };
            const functionResult = await coreFunctionResolution.binder(bctx, args);

            let coreFn = functionResult.result as WasmFunction;
            const exportName = bargs.arguments?.[0] as string | undefined;
            if (wrapLift) {
                coreFn = wrapLift(coreFn, exportName) as WasmFunction;
            }

            const jsFunction = liftingBinder(bctx, coreFn);

            const binderResult = {
                result: jsFunction
            };
            return binderResult;
        }, rargs.element.tag + ':' + rargs.element.selfSortIndex)
    };
};

export const resolveComponentAliasInstanceExport: Resolver<ComponentAliasInstanceExport> = (rctx, rargs) => {
    const componentAliasInstanceExport = rargs.element;
    jsco_assert(componentAliasInstanceExport && componentAliasInstanceExport.tag == ModelTag.ComponentAliasInstanceExport, () => `Wrong element type '${componentAliasInstanceExport?.tag}'`);

    if (componentAliasInstanceExport.kind === ComponentExternalKind.Type) {
        // Type aliases from an instance export. These establish entries in the
        // component's type index space but have no runtime behavior — they are
        // structural declarations used for type-checking. We resolve the instance
        // to expose its type declarations in case downstream consumers need them.
        const instance = getComponentInstance(rctx, componentAliasInstanceExport.instance_index);
        const instanceResolution = resolveComponentInstance(rctx, { element: instance, callerElement: componentAliasInstanceExport });
        return {
            callerElement: rargs.callerElement,
            element: componentAliasInstanceExport,
            binder: async (bctx, bargs) => {
                const instanceResult = await instanceResolution.binder(bctx, {
                    arguments: bargs.arguments,
                    imports: bargs.imports,
                    callerArgs: bargs,
                    debugStack: bargs.debugStack,
                });
                const instanceData = instanceResult.result as { exports: Record<string, unknown>; types: Record<string, unknown> };
                // Return the type from the instance's type declarations
                const typeValue = instanceData.types?.[componentAliasInstanceExport.name]
                    ?? instanceData.exports?.[componentAliasInstanceExport.name];
                return { result: typeValue };
            }
        };
    }
    if (componentAliasInstanceExport.kind !== ComponentExternalKind.Func) {
        throw new Error(`"${componentAliasInstanceExport.kind}" not implemented`);
    }

    const instance = getComponentInstance(rctx, componentAliasInstanceExport.instance_index);
    const instanceResolution = resolveComponentInstance(rctx, { element: instance, callerElement: componentAliasInstanceExport });

    return {
        callerElement: rargs.callerElement,
        element: componentAliasInstanceExport,
        binder: withDebugTrace(async (bctx, bargs) => {
            const args = {
                arguments: bargs.arguments,
                imports: bargs.imports,
                callerArgs: bargs,
                debugStack: bargs.debugStack,
            };
            const instanceResult = await instanceResolution.binder(bctx, args);
            const instanceData = instanceResult.result as { exports: Record<string, unknown>; imports: Record<string, unknown> };

            // TODO resolve type as well
            let fn;
            const askedName = args.arguments?.[0] as string;
            if (askedName) {
                fn = instanceData.exports[askedName];
            }
            if (fn === undefined) {
                // Try the original name first (kebab-case, e.g., '[method]output-stream.blocking-write-and-flush')
                fn = instanceData.exports[componentAliasInstanceExport.name];
            }
            if (fn === undefined) {
                // Try camelCase conversion (e.g., 'get-stdout' → 'getStdout')
                const ccName = camelCase(componentAliasInstanceExport.name);
                fn = instanceData.exports[ccName];
            }

            if (fn === undefined) {
                // Function not found in any naming convention
                throw new Error(`Export '${componentAliasInstanceExport.name}' not found in instance ${componentAliasInstanceExport.instance_index}`);
            }

            const binderResult = {
                result: fn
            };
            return binderResult;
        }, rargs.element.tag + ':' + rargs.element.selfSortIndex)
    };
};
