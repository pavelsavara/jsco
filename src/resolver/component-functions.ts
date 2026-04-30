// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

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
import { checkNotPoisoned } from '../marshal/validation';
import { pushTask } from '../marshal/task-state';
import type { FunctionLiftPlan } from '../marshal/model/lift-plans';
import { resolveComponentInstance } from './component-instances';
import { resolveComponentImport } from './component-imports';
import { resolveCoreFunction } from './core-functions';
import { getCoreFunction, getComponentType, getComponentInstance } from './indices';
import { Resolver, ResolvedContext, ResolverRes, MarshalingContext, BinderRes, resolveCanonicalOptions } from './types';
import type { TaskState } from '../marshal/model/types';
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

    // Sync exports use the lifting trampoline; async exports skip it and lift
    // params manually before invoking the core function (which returns a
    // status code; the result is delivered out-of-band via task.return).
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
 * Guest protocol: `start_task()` invokes `callback(EVENT_NONE, 0, 0)`; the i32
 * return encodes status (0=EXIT, 1=YIELD, `2 | (ws_id << 4)`=WAIT). The host
 * loops until EXIT, delivering events from the waitable set.
 *
 * The function result is delivered out-of-band via `task.return` (installed
 * into `mctx.currentTask.taskReturn`); this trampoline resolves as soon as that
 * fires, so post-return spawned subtasks (e.g. body-stream forwarders) can
 * continue draining while the host already consumes the value.
 *
 * Only the Flat-params path is supported (async exports cap at
 * MAX_FLAT_ASYNC_PARAMS=4); spilled params throw.
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

    return async function asyncLiftTrampoline(...args: unknown[]) {
        // Refuse re-entry on a poisoned instance (mirrors sync lift trampoline).
        checkNotPoisoned(mctx);

        // The trampoline resolves on `task.return`, not on EXIT — lets the host
        // consume the result while post-return subtasks continue running.
        let taskReturnSettle: ((v: { ok: true; value: unknown } | { ok: false; error: unknown }) => void) | undefined;
        const taskReturnPromise = new Promise<unknown>((resolve, reject) => {
            taskReturnSettle = (r): void => {
                if (r.ok) resolve(r.value); else reject(r.error);
            };
        });
        // Spec: a task may resolve at most once via `task.return`. A second call
        // poisons the instance and throws (matches Wasmtime
        // `Trap::TaskCancelOrReturnTwice`).
        let taskReturned = false;
        const taskReturnHandler = (value: unknown): void => {
            if (taskReturned) {
                const msg = 'task.return called more than once on the same task';
                mctx.abort(msg);
                throw new WebAssembly.RuntimeError(msg);
            }
            taskReturned = true;
            if (taskReturnSettle) {
                taskReturnSettle({ ok: true, value });
                taskReturnSettle = undefined;
            }
        };

        // All per-task state lives on a single TaskState pointer. JS is
        // single-threaded, so re-installing this one field synchronously
        // before each wasm-boundary `await` is sufficient to keep concurrent
        // reentrant async exports isolated; canon built-ins (context.{get,set},
        // task.return, …) read everything they need through `mctx.currentTask`.
        const task: TaskState = { slots: [0, 0], taskReturn: taskReturnHandler };
        const previousTask = pushTask(mctx, task);

        // Lift JS args → WASM flat args (resources → i32 handles).
        const wasmArgs = liftAsyncFlatParams(liftPlan, mctx, args);

        // Background driver: runs until callback returns EXIT. Errors before
        // task.return surface to the caller; errors after are swallowed.
        const eventLoop = (async (): Promise<void> => {
            // coreFn may be JSPI Promising-wrapped; await to extract i32 status.
            mctx.currentTask = task;
            let status = await coreFn(...wasmArgs) as number;

            while (status !== EXIT) {
                if (status === YIELD) {
                    // Yield: immediately call callback again
                    mctx.currentTask = task;
                    status = await callbackWasm(0, 0, 0) as number;
                    continue;
                }

                // WAIT: status = 2 | (ws_id << 4)
                const waitableSetId = status >>> 4;

                // Wait for events. Callback-form async lifts deliver events
                // directly as i32 callback args, so we don't need a host
                // memory buffer (and the guest may not even export
                // cabi_realloc — see waitJs()).
                const events = await mctx.waitableSets.waitJs(waitableSetId);
                if (events.length === 0) {
                    // No events — break out (shouldn't happen normally)
                    break;
                }

                // Deliver events to the callback one at a time.
                for (let i = 0; i < events.length; i++) {
                    const ev = events[i]!;
                    mctx.currentTask = task;
                    status = await callbackWasm(ev.eventCode, ev.handle, ev.returnCode) as number;
                    if (status === EXIT) break;
                }
            }

            // Drain background tasks from sync canon.lower stream/future params.
            if (mctx.pendingBackgroundTasks.length > 0) {
                await Promise.all(mctx.pendingBackgroundTasks);
                mctx.pendingBackgroundTasks.length = 0;
            }
        })();

        eventLoop.then(
            () => {
                // EXIT without task.return → resolve to undefined (void result).
                if (taskReturnSettle) {
                    taskReturnSettle({ ok: true, value: undefined });
                    taskReturnSettle = undefined;
                }
                mctx.currentTask = previousTask;
            },
            (e: unknown) => {
                // Throw before task.return → propagate; after → swallow
                // (caller already has its value; swallow to avoid unhandled rejection).
                if (taskReturnSettle) {
                    taskReturnSettle({ ok: false, error: e });
                    taskReturnSettle = undefined;
                }
                mctx.currentTask = previousTask;
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
