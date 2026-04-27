// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import isDebug from 'env:isDebug';
import { ComponentAliasInstanceExport, ComponentFunction } from '../parser/model/aliases';
import { CanonicalFunctionLift } from '../parser/model/canonicals';
import { ComponentExport, ComponentExternalKind } from '../parser/model/exports';
import { CoreFuncIndex } from '../parser/model/indices';
import { ModelTag } from '../parser/model/tags';
import { withDebugTrace, jsco_assert, LogLevel } from '../utils/assert';
import { createFunctionLiftingArtifacts } from '../binder';
import { WasmFunction } from '../marshal/model/types';
import { liftAsyncFlatParams } from '../marshal/trampoline-lift';
import type { FunctionLiftPlan } from '../marshal/model/lift-plans';
import { resolveComponentInstance } from './component-instances';
import { resolveComponentImport } from './component-imports';
import { resolveCoreFunction } from './core-functions';
import { getCoreFunction, getComponentType, getComponentInstance } from './indices';
import { Resolver, ResolvedContext, ResolverRes, MarshalingContext, BinderRes, resolveCanonicalOptions } from './types';
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

    // Compute the lifting artifacts for sync exports + the param plan for async
    // exports. Async-lifted exports skip the trampoline and instead lift their
    // params manually before calling the core function (which returns a status
    // code, not the function result — the result is delivered via task.return).
    const liftingArtifacts = createFunctionLiftingArtifacts(localResolved, sectionFunType);
    const liftingBinder = liftingArtifacts.lifter;

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
        binder: withDebugTrace(async (mctx, bargs) => {
            // Wire up post-return function from canonical options
            if (postReturnResolution) {
                const postReturnResult = await postReturnResolution.binder(mctx, {
                    callerArgs: bargs,
                    debugStack: bargs.debugStack,
                });
                const postReturnWasm = postReturnResult.result as Function;
                mctx.postReturnFn = postReturnWasm;
            }

            const args = {
                arguments: bargs.arguments,
                imports: bargs.imports,
                callerArgs: bargs,
                debugStack: bargs.debugStack,
            };
            const functionResult = await coreFunctionResolution.binder(mctx, args);

            let coreFn = functionResult.result as WasmFunction;
            const exportName = bargs.arguments?.[0] as string | undefined;

            if (isAsyncWithCallback && callbackResolution) {
                const cbResult = await callbackResolution.binder(mctx, {
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
                const jsFunction = createAsyncLiftWrapper(mctx, coreFn, callbackWasm, liftingArtifacts.plan);
                return { result: jsFunction };
            }

            if (wrapLift) {
                coreFn = wrapLift(coreFn, exportName) as WasmFunction;
            }

            const jsFunction = liftingBinder(mctx, coreFn);

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
 *
 * Param lifting: this wrapper invokes the lift plan's `paramLifters` to convert
 * JS args to WASM-flat values *before* calling the core function (resources
 * become i32 handles via `ctx.resources.add`, etc.).
 *
 * Result delivery: the function result is passed back via the `task.return`
 * canon built-in. We install `mctx.currentTaskReturn` for the duration of the
 * task so that `resolveCanonicalFunctionTaskReturn`'s bound function can route
 * the lifted JS value into our pending Deferred.
 *
 * NOTE: only the Flat-params path is supported (async exports cap at
 * MAX_FLAT_ASYNC_PARAMS=4 flat values; spilled async params are extremely rare).
 * If a Spilled-params plan is encountered an explicit error is thrown.
 */
function createAsyncLiftWrapper(
    mctx: MarshalingContext,
    coreFn: WasmFunction,
    callbackWasm: WasmFunction,
    liftPlan: FunctionLiftPlan,
): Function {
    // Callback return code constants
    const EXIT = 0;
    const YIELD = 1;
    // 2 | (ws_id << 4) = WAIT

    const EVENT_BUF_EVENTS = 16;
    const EVENT_BUF_SIZE = 12 * EVENT_BUF_EVENTS;

    return async function asyncLiftTrampoline(...args: unknown[]) {
        // Lift JS args → WASM flat args. Resources become integer handles via
        // ctx.resources.add (typeIdx, jsValue). This is the fix for the
        // handle=0 bug where async exports previously bypassed lifting.
        const wasmArgs = liftAsyncFlatParams(liftPlan, mctx, args);

        // Install the task.return target. The trampoline returns a Promise
        // that resolves as soon as the guest invokes `task.return`, NOT when
        // the entire event loop reaches EXIT. This lets the host start
        // consuming the returned value (e.g. drain a response body stream)
        // concurrently with post-return spawned subtasks. Without this,
        // patterns like p3_http_echo's wit_bindgen::spawn forwarder deadlock
        // when the response body is larger than the stream backpressure
        // threshold: the forwarder blocks writing to the pipe, the host is
        // stuck in `await handler.handle()`, and no one drains the pipe.
        let taskReturnSettle: ((v: { ok: true; value: unknown } | { ok: false; error: unknown }) => void) | undefined;
        const taskReturnPromise = new Promise<unknown>((resolve, reject) => {
            taskReturnSettle = (r): void => {
                if (r.ok) resolve(r.value); else reject(r.error);
            };
        });
        const previousTaskReturn = mctx.currentTaskReturn;
        mctx.currentTaskReturn = (value: unknown): void => {
            if (taskReturnSettle) {
                taskReturnSettle({ ok: true, value });
                taskReturnSettle = undefined;
            }
        };

        // Background event-loop driver. Runs until the guest callback returns
        // EXIT. Drives post-return spawned subtasks (e.g. wit_stream forwarders).
        // Errors thrown before task.return surface to the caller; errors after
        // task.return are swallowed (the host already received its result and
        // there's no caller awaiting them).
        const eventLoop = (async (): Promise<void> => {
            // For now, call coreFn directly (async exports may not have params in
            // the standard lifting sense — the core function takes flat params + returns status).
            // coreFn may be JSPI Promising-wrapped, so await to extract the i32 status.
            let status = await coreFn(...wasmArgs) as number;

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
                if (!eventBufAllocated && mctx.allocator.isInitialized()) {
                    eventPtr = mctx.allocator.alloc(EVENT_BUF_SIZE as WasmSize, 4 as WasmSize) as number;
                    eventBufAllocated = true;
                }

                // Wait for events on the waitable set
                const numEvents = await mctx.waitableSets.wait(waitableSetId, eventPtr);
                if (numEvents === 0) {
                    // No events — break out (shouldn't happen normally)
                    break;
                }

                // Deliver events to the callback one at a time
                const view = mctx.memory.getView(eventPtr as WasmPointer, numEvents * 12 as WasmSize);
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
            if (mctx.pendingBackgroundTasks.length > 0) {
                await Promise.all(mctx.pendingBackgroundTasks);
                mctx.pendingBackgroundTasks.length = 0;
            }
        })();

        eventLoop.then(
            () => {
                // Event loop finished. If task.return was never called, surface
                // `undefined` (matches pre-F2 behaviour for void-result tests).
                if (taskReturnSettle) {
                    taskReturnSettle({ ok: true, value: undefined });
                    taskReturnSettle = undefined;
                }
                mctx.currentTaskReturn = previousTaskReturn;
            },
            (e: unknown) => {
                // Event loop threw. If task.return was never called, propagate
                // the error to the caller. If task.return was already called,
                // the caller has already received its value; swallow to avoid
                // an unhandled rejection (the failure is in post-return work).
                if (taskReturnSettle) {
                    taskReturnSettle({ ok: false, error: e });
                    taskReturnSettle = undefined;
                }
                mctx.currentTaskReturn = previousTaskReturn;
            },
        );

        return taskReturnPromise;
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
            binder: async (mctx, bargs): Promise<BinderRes> => {
                const instanceResult = await instanceResolution.binder(mctx, {
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
        binder: withDebugTrace(async (mctx, bargs) => {
            const args = {
                arguments: bargs.arguments,
                imports: bargs.imports,
                callerArgs: bargs,
                debugStack: bargs.debugStack,
            };
            const instanceResult = await instanceResolution.binder(mctx, args);
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
