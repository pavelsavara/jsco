// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import isDebug from 'env:isDebug';
import { ComponentAliasInstanceExport, ComponentFunction } from '../parser/model/aliases';
import { CanonicalFunctionLift } from '../parser/model/canonicals';
import { ComponentExport, ComponentExternalKind } from '../parser/model/exports';
import { CoreFuncIndex } from '../parser/model/indices';
import { ModelTag } from '../parser/model/tags';
import { withDebugTrace, jsco_assert, LogLevel } from '../utils/assert';
import { createFunctionLifting } from '../binder';
import { WasmFunction } from '../marshal/model/types';
import { resolveComponentInstance } from './component-instances';
import { resolveComponentImport } from './component-imports';
import { resolveCoreFunction } from './core-functions';
import { getCoreFunction, getComponentType, getComponentInstance } from './indices';
import { Resolver, ResolvedContext, ResolverRes, BindingContext, resolveCanonicalOptions } from './types';
import type { WasmPointer, WasmSize } from '../marshal/model/types';
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
    const isAsyncWithCallback = canonOpts.async === true && canonOpts.callbackIndex !== undefined;

    // For async canon.lift with callback: resolve the callback core function
    let callbackResolution: ResolverRes | undefined;
    if (isAsyncWithCallback) {
        const callbackFunc = getCoreFunction(rctx, canonOpts.callbackIndex as CoreFuncIndex);
        callbackResolution = resolveCoreFunction(rctx, { element: callbackFunc, callerElement: canonicalFunctionLift });
    }

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

            if (isAsyncWithCallback && callbackResolution) {
                const cbResult = await callbackResolution.binder(bctx, {
                    callerArgs: bargs,
                    debugStack: bargs.debugStack,
                });
                let callbackWasm = cbResult.result as WasmFunction;
                // Wrap both core function and callback with JSPI Promising
                // so that inner WASM calls to Suspending host functions work.
                // We await the Promise to extract the i32 status code.
                if (wrapLift) {
                    coreFn = wrapLift(coreFn, exportName) as WasmFunction;
                    callbackWasm = wrapLift(callbackWasm) as WasmFunction;
                }
                const jsFunction = createAsyncLiftWrapper(bctx, coreFn, callbackWasm, liftingBinder);
                return { result: jsFunction };
            }

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

/**
 * Create a JS wrapper for an async canon.lift export with callback.
 *
 * The WASM guest:
 *   1. Calls start_task() which invokes callback(EVENT_NONE=0, 0, 0)
 *   2. The callback return code encodes status:
 *      - 0 = exit (task done)
 *      - 1 = yield (call callback again immediately)
 *      - 2 | (waitable_set_id << 4) = wait on the waitable set
 *   3. The host waits for events, then calls callback(event_code, handle, return_code)
 *   4. Repeat until callback returns 0
 *
 * The core function signature: (...flat_params) → i32 status
 * The status is the initial callback return (from start_task).
 */
function createAsyncLiftWrapper(
    bctx: BindingContext,
    coreFn: WasmFunction,
    callbackWasm: WasmFunction,
    _syncLiftingBinder: (ctx: BindingContext, fn: WasmFunction) => Function,
): Function {
    // Callback return code constants
    const EXIT = 0;
    const YIELD = 1;
    // 2 | (ws_id << 4) = WAIT

    const EVENT_BUF_EVENTS = 16;
    const EVENT_BUF_SIZE = 12 * EVENT_BUF_EVENTS;

    // Create the sync lifting wrapper for the core function. This handles
    // JS→WASM parameter conversion and WASM→JS result conversion.
    // For async functions, the core function returns a status i32, not the
    // actual result. The sync wrapper will interpret that i32 as the "result"
    // — we intercept it before the result conversion path runs.
    // Actually, we call coreFn directly for async since the return semantics differ.

    return async function asyncLiftTrampoline(...args: unknown[]) {
        // For now, call coreFn directly (async exports may not have params in
        // the standard lifting sense — the core function takes flat params + returns status).
        // TODO: properly lift parameters for async functions with arguments
        // coreFn may be JSPI Promising-wrapped, so await to extract the i32 status.
        let status: number = await coreFn(...args) as number;

        // Async event loop
        let eventPtr = 0;
        let eventBufAllocated = false;

        while (status !== EXIT) {
            if (status === YIELD) {
                // Yield: immediately call callback again
                status = await callbackWasm(0, 0, 0) as number;
                continue;
            }

            // WAIT: status = 2 | (ws_id << 4)
            const waitableSetId = status >>> 4;

            // Allocate event buffer if not yet done
            if (!eventBufAllocated && bctx.allocator.isInitialized()) {
                eventPtr = bctx.allocator.alloc(EVENT_BUF_SIZE as WasmSize, 4 as WasmSize) as number;
                eventBufAllocated = true;
            }

            // Wait for events on the waitable set
            const numEvents = await bctx.waitableSets.wait(waitableSetId, eventPtr);
            if (numEvents === 0) {
                // No events — break out (shouldn't happen normally)
                break;
            }

            // Deliver events to the callback one at a time
            const view = bctx.memory.getView(eventPtr as WasmPointer, numEvents * 12 as WasmSize);
            for (let i = 0; i < numEvents; i++) {
                const eventCode = view.getInt32(i * 12, true);
                const handle = view.getInt32(i * 12 + 4, true);
                const returnCode = view.getInt32(i * 12 + 8, true);
                status = await callbackWasm(eventCode, handle, returnCode) as number;
                if (status === EXIT) break;
            }
        }
        // Await any background tasks from sync canon.lower with stream/future params.
        // These are host functions (e.g. writeViaStream) that consume streams
        // in the background while the WASM continues writing to them.
        if (bctx.pendingBackgroundTasks.length > 0) {
            await Promise.all(bctx.pendingBackgroundTasks);
            bctx.pendingBackgroundTasks.length = 0;
        }
    };
}

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
