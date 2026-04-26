// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import isDebug from 'env:isDebug';
import { ComponentFunction, CoreFunction, ComponentAliasInstanceExport as ComponentAliasInstanceExportType } from '../parser/model/aliases';
import {
    CanonicalFunctionLower, CanonicalFunctionResourceDrop, CanonicalFunctionResourceNew, CanonicalFunctionResourceRep,
    CanonicalFunctionStreamNew, CanonicalFunctionStreamRead, CanonicalFunctionStreamWrite,
    CanonicalFunctionStreamCancelRead, CanonicalFunctionStreamCancelWrite,
    CanonicalFunctionStreamDropReadable, CanonicalFunctionStreamDropWritable,
    CanonicalFunctionFutureNew, CanonicalFunctionFutureRead, CanonicalFunctionFutureWrite,
    CanonicalFunctionFutureCancelRead, CanonicalFunctionFutureCancelWrite,
    CanonicalFunctionFutureDropReadable, CanonicalFunctionFutureDropWritable,
    CanonicalFunctionErrorContextNew, CanonicalFunctionErrorContextDebugMessage, CanonicalFunctionErrorContextDrop,
    CanonicalFunctionContextGet, CanonicalFunctionContextSet,
} from '../parser/model/canonicals';
import { ComponentExternalKind } from '../parser/model/exports';
import { ComponentImport } from '../parser/model/imports';
import { ComponentTypeIndex, CoreFuncIndex } from '../parser/model/indices';
import { ModelTag } from '../parser/model/tags';
import { ComponentType, ComponentTypeFunc, ComponentTypeInstance, InstanceTypeDeclaration, ComponentTypeDefinedOwn, ComponentTypeDefinedBorrow } from '../parser/model/types';
import { debugStack, withDebugTrace, jsco_assert, LogLevel } from '../utils/assert';
import { createFunctionLowering } from '../binder';
import { JsFunction } from '../marshal/model/types';
import type { MarshalingContext } from '../marshal/model/types';
import { resolveComponentFunction } from './component-functions';
import { resolveComponentAliasCoreInstanceExport } from './core-exports';
import type { ResolvedType } from './type-resolution';
import { getCanonicalResourceId } from './context';
import { createAllocator } from '../runtime';
import { getComponentFunction, getComponentType, getCoreFunction } from './indices';
import type { TCabiRealloc } from '../marshal/model/types';
import { Resolver, BinderRes, ResolverRes, ResolvedContext, ResolverContext, resolveCanonicalOptions } from './types';
import { SubtaskState } from '../runtime/model/types';


export const resolveCoreFunction: Resolver<CoreFunction> = (rctx, rargs) => {
    const cached = rctx.coreFunctionCache.get(rargs.element);
    if (cached) {
        if (isDebug && rctx.resolved.stats) rctx.resolved.stats.coreFunctionCacheHits++;
        return { ...cached, callerElement: rargs.callerElement };
    }
    const coreInstance = rargs.element;
    let result: ResolverRes;
    switch (coreInstance.tag) {
        case ModelTag.ComponentAliasCoreInstanceExport: result = resolveComponentAliasCoreInstanceExport(rctx, rargs as any) as ResolverRes; break;
        case ModelTag.CanonicalFunctionLower: result = resolveCanonicalFunctionLower(rctx, rargs as any); break;
        case ModelTag.CanonicalFunctionResourceDrop: result = resolveCanonicalFunctionResourceDrop(rctx, rargs as any); break;
        case ModelTag.CanonicalFunctionResourceNew: result = resolveCanonicalFunctionResourceNew(rctx, rargs as any); break;
        case ModelTag.CanonicalFunctionResourceRep: result = resolveCanonicalFunctionResourceRep(rctx, rargs as any); break;
        case ModelTag.CanonicalFunctionStreamNew: result = resolveCanonicalFunctionStreamNew(rctx, rargs as any); break;
        case ModelTag.CanonicalFunctionStreamRead: result = resolveCanonicalFunctionStreamRead(rctx, rargs as any); break;
        case ModelTag.CanonicalFunctionStreamWrite: result = resolveCanonicalFunctionStreamWrite(rctx, rargs as any); break;
        case ModelTag.CanonicalFunctionStreamCancelRead: result = resolveCanonicalFunctionStreamCancelRead(rctx, rargs as any); break;
        case ModelTag.CanonicalFunctionStreamCancelWrite: result = resolveCanonicalFunctionStreamCancelWrite(rctx, rargs as any); break;
        case ModelTag.CanonicalFunctionStreamDropReadable: result = resolveCanonicalFunctionStreamDropReadable(rctx, rargs as any); break;
        case ModelTag.CanonicalFunctionStreamDropWritable: result = resolveCanonicalFunctionStreamDropWritable(rctx, rargs as any); break;
        case ModelTag.CanonicalFunctionFutureNew: result = resolveCanonicalFunctionFutureNew(rctx, rargs as any); break;
        case ModelTag.CanonicalFunctionFutureRead: result = resolveCanonicalFunctionFutureRead(rctx, rargs as any); break;
        case ModelTag.CanonicalFunctionFutureWrite: result = resolveCanonicalFunctionFutureWrite(rctx, rargs as any); break;
        case ModelTag.CanonicalFunctionFutureCancelRead: result = resolveCanonicalFunctionFutureCancelRead(rctx, rargs as any); break;
        case ModelTag.CanonicalFunctionFutureCancelWrite: result = resolveCanonicalFunctionFutureCancelWrite(rctx, rargs as any); break;
        case ModelTag.CanonicalFunctionFutureDropReadable: result = resolveCanonicalFunctionFutureDropReadable(rctx, rargs as any); break;
        case ModelTag.CanonicalFunctionFutureDropWritable: result = resolveCanonicalFunctionFutureDropWritable(rctx, rargs as any); break;
        case ModelTag.CanonicalFunctionErrorContextNew: result = resolveCanonicalFunctionErrorContextNew(rctx, rargs as any); break;
        case ModelTag.CanonicalFunctionErrorContextDebugMessage: result = resolveCanonicalFunctionErrorContextDebugMessage(rctx, rargs as any); break;
        case ModelTag.CanonicalFunctionErrorContextDrop: result = resolveCanonicalFunctionErrorContextDrop(rctx, rargs as any); break;
        case ModelTag.CanonicalFunctionBackpressureSet:
        case ModelTag.CanonicalFunctionBackpressureInc:
        case ModelTag.CanonicalFunctionBackpressureDec:
            result = resolveCanonicalFunctionBackpressure(rctx, rargs); break;
        case ModelTag.CanonicalFunctionTaskReturn:
            result = resolveCanonicalFunctionTaskReturn(rctx, rargs); break;
        case ModelTag.CanonicalFunctionContextGet:
            result = resolveCanonicalFunctionContextGet(rctx, rargs as any); break;
        case ModelTag.CanonicalFunctionContextSet:
            result = resolveCanonicalFunctionContextSet(rctx, rargs as any); break;
        case ModelTag.CanonicalFunctionTaskCancel:
        case ModelTag.CanonicalFunctionThreadYield:
        case ModelTag.CanonicalFunctionSubtaskCancel:
            result = resolveCanonicalFunctionNotImplemented(rctx, rargs); break;
        case ModelTag.CanonicalFunctionSubtaskDrop:
            result = resolveCanonicalFunctionSubtaskDrop(rctx, rargs); break;
        case ModelTag.CanonicalFunctionWaitableSetNew:
            result = resolveCanonicalFunctionWaitableSetNew(rctx, rargs); break;
        case ModelTag.CanonicalFunctionWaitableSetWait:
            result = resolveCanonicalFunctionWaitableSetWait(rctx, rargs); break;
        case ModelTag.CanonicalFunctionWaitableSetPoll:
            result = resolveCanonicalFunctionWaitableSetPoll(rctx, rargs); break;
        case ModelTag.CanonicalFunctionWaitableSetDrop:
            result = resolveCanonicalFunctionWaitableSetDrop(rctx, rargs); break;
        case ModelTag.CanonicalFunctionWaitableJoin:
            result = resolveCanonicalFunctionWaitableJoin(rctx, rargs); break;
        default: throw new Error(`"${(coreInstance as any).tag}" not implemented`);
    }
    rctx.coreFunctionCache.set(rargs.element, result);
    return result;
};

export const resolveCanonicalFunctionLower: Resolver<CanonicalFunctionLower> = (rctx, rargs) => {
    const canonicalFunctionLowerElem = rargs.element;
    jsco_assert(canonicalFunctionLowerElem && canonicalFunctionLowerElem.tag == ModelTag.CanonicalFunctionLower, () => `Wrong element type '${canonicalFunctionLowerElem?.tag}'`);

    const componentFunction = getComponentFunction(rctx, canonicalFunctionLowerElem.func_index);
    const componentFunctionResolution = resolveComponentFunction(rctx, { element: componentFunction, callerElement: canonicalFunctionLowerElem });

    // Resolve function type by following the component function chain:
    // CanonicalFunctionLower.func_index → componentFunction →
    //   CanonicalFunctionLift.type_index → ComponentTypeFunc
    //   ComponentAliasInstanceExport → resolvedTypes lookup
    //
    // Instance-local type isolation: resolveLoweredFuncType may call
    // registerInstanceLocalTypes, which overwrites resolvedTypes entries
    // with instance-local types. createFunctionLowering deep-resolves all nested
    // ComponentValTypeType references at creation time, so after it runs the
    // local types are no longer needed. Use a shallow copy of resolved with a
    // cloned resolvedTypes map so the original context stays untouched.
    const canonOpts = resolveCanonicalOptions(canonicalFunctionLowerElem.options);
    const localResolved: ResolvedContext = {
        ...rctx.resolved,
        resolvedTypes: new Map(rctx.resolved.resolvedTypes),
        stringEncoding: canonOpts.stringEncoding,
    };
    const localRctx: ResolverContext = { ...rctx, resolved: localResolved };

    const funcType = resolveLoweredFuncType(localRctx, componentFunction);

    if (isDebug && (localResolved.verbose?.binder ?? 0) >= LogLevel.Summary) {
        const chain = `canon.lower[${canonicalFunctionLowerElem.selfSortIndex}] → ${componentFunction.tag}[${componentFunction.selfSortIndex}]`;
        const funcName = (componentFunction as any).name ?? '';
        localResolved.logger!('binder', LogLevel.Summary,
            `type chain: ${chain}${funcName ? ` name="${funcName}"` : ''} → ComponentTypeFunc[${funcType.selfSortIndex ?? '?'}]`);
    }

    const loweringBinder = createFunctionLowering(localResolved, funcType, canonOpts.async);

    // If the canon.lower specifies a per-function realloc, resolve it now.
    // The resolved binder will be called at bind time to get the actual function.
    const reallocResolution = canonOpts.reallocIndex !== undefined
        ? resolveCoreFunction(rctx, { element: getCoreFunction(rctx, canonOpts.reallocIndex as CoreFuncIndex), callerElement: canonicalFunctionLowerElem })
        : undefined;

    const wrapLower = rctx.resolved.wrapLower;
    const isAsyncLower = canonOpts.async;

    return {
        callerElement: rargs.callerElement,
        element: canonicalFunctionLowerElem,
        binder: withDebugTrace(async (mctx, bargs): Promise<BinderRes> => {
            const args = {
                arguments: bargs.arguments,
                imports: bargs.imports,
                callerArgs: bargs,
                debugStack: bargs.debugStack,
            };
            debugStack(args, args, componentFunction.tag + ':' + componentFunction.selfSortIndex);
            const functionResult = await componentFunctionResolution.binder(mctx, args);

            // Use per-canon realloc if specified, otherwise use the global allocator
            let effectivemctx = mctx;
            if (reallocResolution) {
                const reallocResult = await reallocResolution.binder(mctx, args);
                const reallocFn = reallocResult.result as TCabiRealloc;
                const customAllocator = createAllocator();
                customAllocator.initialize(reallocFn);
                effectivemctx = { ...mctx, allocator: customAllocator };
            }

            if (isAsyncLower) {
                // Async canon.lower: the lowering trampoline already handles Promises
                // (via handleLowerResult/handleLowerResultSpilled), returning a Promise
                // when the JS host function is async. We detect that and create a subtask.
                const jsFunction = functionResult.result as JsFunction;
                const wasmFunction = loweringBinder(effectivemctx, jsFunction);

                const asyncLowerTrampoline = (...wasmArgs: unknown[]): number => {
                    const result = wasmFunction(...wasmArgs);
                    if (result instanceof Promise) {
                        // Async: create a subtask, return packed state|handle
                        const handle = effectivemctx.subtasks.create(result);
                        return SubtaskState.STARTED | (handle << 4);
                    }
                    // Synchronous completion (host returned non-Promise)
                    return SubtaskState.RETURNED;
                };

                return { result: asyncLowerTrampoline };
            }

            const wasmFunction = loweringBinder(effectivemctx, functionResult.result as JsFunction);

            const finalFunction = wrapLower ? wrapLower(wasmFunction) : wasmFunction;

            const binderResult = {
                result: finalFunction
            };
            return binderResult;
        }, rargs.element.tag + ':' + rargs.element.selfSortIndex)
    };
};

function resolveLoweredFuncType(rctx: ResolverContext, componentFunction: ComponentFunction): ComponentTypeFunc {
    // If the component function is a CanonicalFunctionLift, it has type_index directly
    if (componentFunction.tag === ModelTag.CanonicalFunctionLift) {
        const sectionFunType = getComponentType(rctx, componentFunction.type_index);
        jsco_assert(sectionFunType.tag === ModelTag.ComponentTypeFunc,
            () => `expected ComponentTypeFunc from lift type_index, got ${sectionFunType.tag}`);
        return sectionFunType as ComponentTypeFunc;
    }

    // If the component function is a ComponentAliasInstanceExport, trace through the instance.
    // This may involve following chains of aliases: the instance at instance_index may itself
    // reference another instance, etc. We follow the chain with a bounded depth to prevent
    // infinite loops.
    if (componentFunction.tag === ModelTag.ComponentAliasInstanceExport) {
        const result = resolveAliasedFuncType(rctx, componentFunction, 10);
        if (result) return result;

        throw new Error(`Could not resolve function type for ComponentAliasInstanceExport '${componentFunction.name}'`);
    }

    // If the component function is an imported function, look up its type from the import's type ref.
    if (componentFunction.tag === ModelTag.ComponentImport) {
        const imp = componentFunction as ComponentImport;
        jsco_assert(imp.ty.tag === ModelTag.ComponentTypeRefFunc,
            () => `Expected ComponentTypeRefFunc for imported function, got ${imp.ty.tag}`);
        const funcType = getComponentType(rctx, imp.ty.value as ComponentTypeIndex);
        jsco_assert(funcType.tag === ModelTag.ComponentTypeFunc,
            () => `Expected ComponentTypeFunc from import type ref, got ${funcType.tag}`);
        return funcType as ComponentTypeFunc;
    }

    throw new Error(`Cannot resolve function type for component function tag '${(componentFunction as any).tag}'`);
}

/**
 * Recursively trace through alias chains to find the ComponentTypeFunc for
 * a ComponentAliasInstanceExport. The alias may point to:
 *   - ComponentTypeInstance → look up export declaration by name
 *   - ComponentInstanceFromExports → find the named export, follow if it's another alias
 *   - ComponentInstanceInstantiate → check the component section for the export type
 * maxDepth prevents infinite loops in pathological cases.
 */
function resolveAliasedFuncType(
    rctx: ResolverContext,
    alias: ComponentAliasInstanceExportType,
    maxDepth: number
): ComponentTypeFunc | undefined {
    if (maxDepth <= 0) return undefined;

    jsco_assert(alias.instance_index < rctx.indexes.componentInstances.length,
        () => `instance_index ${alias.instance_index} out of bounds (${rctx.indexes.componentInstances.length} instances)`);
    const instance = rctx.indexes.componentInstances[alias.instance_index];
    if (!instance) throw new Error(`instance_index ${alias.instance_index} out of bounds`);

    if (instance.tag === ModelTag.ComponentTypeInstance) {
        const instanceType = instance as ComponentTypeInstance;

        // Register instance-local types in resolvedTypes so that
        // createFunctionLowering can resolve Type(localIdx) references
        registerInstanceLocalTypes(rctx, instanceType, alias.instance_index);

        // Find the export declaration matching the alias name
        for (const decl of instanceType.declarations) {
            if (decl.tag === ModelTag.InstanceTypeDeclarationExport &&
                decl.name.name === alias.name) {
                if (decl.ty.tag === ModelTag.ComponentTypeRefFunc) {
                    const funcType = findLocalType(instanceType.declarations, decl.ty.value);
                    if (funcType && funcType.tag === ModelTag.ComponentTypeFunc) {
                        return funcType as ComponentTypeFunc;
                    }
                }
            }
        }
    }

    if (instance.tag === ModelTag.ComponentInstanceFromExports) {
        // The instance is a bag of exports. Find the export matching our name
        // and trace through it if it's a function alias.
        for (const exp of instance.exports) {
            if (exp.name.name === alias.name && exp.kind === ComponentExternalKind.Func) {
                const targetFunc = rctx.indexes.componentFunctions[exp.index];
                if (targetFunc && targetFunc.tag !== ModelTag.ComponentExport) {
                    // Recurse: the target may be a CanonicalFunctionLift (terminal)
                    // or another ComponentAliasInstanceExport (chain continues)
                    return resolveLoweredFuncType(rctx, targetFunc);
                }
            }
        }
    }

    // Fallback: try resolvedTypes map
    const typeIndex = alias.selfSortIndex;
    if (typeIndex !== undefined) {
        const resolved = rctx.resolved.resolvedTypes.get(typeIndex as ComponentTypeIndex);
        if (resolved && resolved.tag === ModelTag.ComponentTypeFunc) {
            return resolved;
        }
    }

    return undefined;
}

/**
 * Find the Nth type-creating declaration in an instance's declarations.
 * Type-creating declarations are: InstanceTypeDeclarationType, InstanceTypeDeclarationAlias,
 * and InstanceTypeDeclarationExport with a Type bound (SubResource or Eq).
 */
function findLocalType(declarations: InstanceTypeDeclaration[], localTypeIndex: number): ComponentType | undefined {
    let typeIdx = 0;
    for (const decl of declarations) {
        if (isTypeCreatingDeclaration(decl)) {
            if (typeIdx === localTypeIndex) {
                if (decl.tag === ModelTag.InstanceTypeDeclarationType) {
                    return decl.value;
                }
                // For export or alias type-creating declarations, we don't have a direct
                // ComponentType object, but the local type is registered in resolvedTypes
                return undefined;
            }
            typeIdx++;
        }
    }
    return undefined;
}

/**
 * Check if an instance type declaration creates a local type index entry.
 */
function isTypeCreatingDeclaration(decl: InstanceTypeDeclaration): boolean {
    switch (decl.tag) {
        case ModelTag.InstanceTypeDeclarationType:
            return true;
        case ModelTag.InstanceTypeDeclarationAlias:
            return true;
        case ModelTag.InstanceTypeDeclarationExport:
            // Exports with type bounds (Type(SubResource), Type(Eq(N))) create type entries
            return decl.ty.tag === ModelTag.ComponentTypeRefType;
        case ModelTag.InstanceTypeDeclarationCoreType:
            return false;
        default:
            return false;
    }
}

/**
 * Register instance-local types in rctx.resolved.resolvedTypes so that resolveValType
 * can resolve Type(localIdx) references within function types from this instance.
 *
 * Instance type declarations create a local type index space. Function types
 * inside the instance reference these local indices. Local types are written
 * to resolvedTypes at their local indices, which may overwrite global entries.
 *
 */
// Guard against applying own/borrow fixups multiple times when the same instance
// type is processed by multiple calls to registerInstanceLocalTypes (which happens
// when multiple functions alias from the same instance).

function registerInstanceLocalTypes(rctx: ResolverContext, instance: ComponentTypeInstance, instanceIndex: number): void {
    if (isDebug && (rctx.resolved.verbose?.resolver ?? 0) >= LogLevel.Detailed) {
        rctx.resolved.logger!('resolver', LogLevel.Detailed,
            `registerInstanceLocalTypes: instance=${instanceIndex} declarations=${instance.declarations.length}`);
    }

    // Snapshot global resolved types before local overwrites. Outer alias lookups must
    // read original global types, not local types that were written earlier
    // in this same loop (which may share the same numeric index).
    const globalResolvedTypes = new Map(rctx.resolved.resolvedTypes);

    const localTypes: (ResolvedType | undefined)[] = [];
    // LOCAL canonical resource ID map — maps local type indices to canonical IDs.
    // This avoids polluting the global canonicalResourceIds with local indices
    // that would collide across different instance type definitions.
    const localCanonicalIds = new Map<number, number>();
    // Track which local indices are resources, keyed by export name
    const localResourceNames = new Map<number, string>();
    // Track own/borrow types that need their .value rewritten to canonical IDs.
    // Only collect types that haven't been fixed up yet (guard against multiple calls
    // to registerInstanceLocalTypes for the same instance type sharing the same objects).
    const ownBorrowFixups: { type: ComponentTypeDefinedOwn | ComponentTypeDefinedBorrow; localValueIdx: number }[] = [];
    let localTypeIdx = 0;

    for (const decl of instance.declarations) {
        if (!isTypeCreatingDeclaration(decl)) {
            continue;
        }

        let resolved: ResolvedType | undefined;

        switch (decl.tag) {
            case ModelTag.InstanceTypeDeclarationType: {
                // Direct type definition (Record, Variant, Borrow, Own, List, etc.)
                const value = decl.value;
                switch (value.tag) {
                    case ModelTag.ComponentTypeDefinedRecord:
                    case ModelTag.ComponentTypeDefinedVariant:
                    case ModelTag.ComponentTypeDefinedList:
                    case ModelTag.ComponentTypeDefinedTuple:
                    case ModelTag.ComponentTypeDefinedFlags:
                    case ModelTag.ComponentTypeDefinedEnum:
                    case ModelTag.ComponentTypeDefinedOption:
                    case ModelTag.ComponentTypeDefinedResult:
                    case ModelTag.ComponentTypeDefinedPrimitive:
                    case ModelTag.ComponentTypeDefinedStream:
                    case ModelTag.ComponentTypeDefinedFuture:
                    case ModelTag.ComponentTypeDefinedErrorContext:
                    case ModelTag.ComponentTypeFunc:
                        resolved = value;
                        break;
                    case ModelTag.ComponentTypeDefinedOwn:
                    case ModelTag.ComponentTypeDefinedBorrow:
                        resolved = value;
                        // Track for Phase 2 fixup — .value references a local type index.
                        // Skip if already fixed up by a previous call for the same instance.
                        if (!rctx.resolved.fixedUpOwnBorrow.has(value as ComponentTypeDefinedOwn | ComponentTypeDefinedBorrow)) {
                            ownBorrowFixups.push({ type: value as ComponentTypeDefinedOwn | ComponentTypeDefinedBorrow, localValueIdx: value.value });
                        }
                        break;
                    default:
                        // ComponentTypeInstance, ComponentTypeComponent, etc. — skip
                        break;
                }
                break;
            }
            case ModelTag.InstanceTypeDeclarationAlias: {
                const alias = decl.value;
                if (alias.tag === ModelTag.ComponentAliasOuter) {
                    // Outer alias: look up the referenced type in the snapshot of global types,
                    // not the live map which may have been overwritten by earlier local types.
                    const outerResolved = globalResolvedTypes.get(alias.index as ComponentTypeIndex);
                    if (outerResolved) {
                        resolved = outerResolved;
                    }
                    // Propagate canonical resource ID from the outer scope into LOCAL map.
                    const outerCanonicalId = rctx.resolved.canonicalResourceIds?.get(alias.index);
                    if (outerCanonicalId !== undefined) {
                        localCanonicalIds.set(localTypeIdx, outerCanonicalId);
                    }
                }
                break;
            }
            case ModelTag.InstanceTypeDeclarationExport: {
                // Export with type bound
                if (decl.ty.tag === ModelTag.ComponentTypeRefType) {
                    if (decl.ty.value.tag === ModelTag.TypeBoundsEq) {
                        // Eq(N) → same type as local type N
                        const eqIdx = decl.ty.value.value;
                        resolved = localTypes[eqIdx];
                        // Inherit canonical resource ID from the equal type via LOCAL map.
                        const eqCanonicalId = localCanonicalIds.get(eqIdx);
                        if (eqCanonicalId !== undefined) {
                            localCanonicalIds.set(localTypeIdx, eqCanonicalId);
                        }
                    }
                    if (decl.ty.value.tag === ModelTag.TypeBoundsSubResource) {
                        // SubResource → this local type index is a resource.
                        // Track its name for canonical resource ID mapping.
                        localResourceNames.set(localTypeIdx, decl.name.name);
                    }
                }
                break;
            }
        }

        localTypes.push(resolved);
        if (resolved) {
            rctx.resolved.resolvedTypes.set(localTypeIdx as ComponentTypeIndex, resolved);
        }
        localTypeIdx++;
    }

    // Phase 2a: Register canonical resource IDs for local resource indices (SubResource exports).
    for (const [localIdx, resourceName] of localResourceNames) {
        const key = `${instanceIndex}:${resourceName}`;
        const canonicalId = rctx.resourceAliasGroups?.get(key);
        if (canonicalId !== undefined) {
            localCanonicalIds.set(localIdx, canonicalId);
        }
    }

    // Phase 2b: Rewrite own<T>/borrow<T> .value fields from local type indices
    // to global canonical resource IDs. This ensures getCanonicalResourceId()
    // returns the correct ID regardless of which instance type was processed last.
    for (const fixup of ownBorrowFixups) {
        const canonicalId = localCanonicalIds.get(fixup.localValueIdx);
        if (canonicalId !== undefined) {
            fixup.type.value = canonicalId;
            rctx.resolved.fixedUpOwnBorrow.add(fixup.type);
        }
    }

    if (isDebug && (rctx.resolved.verbose?.resolver ?? 0) >= LogLevel.Detailed) {
        const canonicalEntries = [...localCanonicalIds.entries()].map(([k, v]) => `${k}→${v}`).join(', ');
        const fixupEntries = ownBorrowFixups.map(f => `${f.type.tag}(local=${f.localValueIdx}→canonical=${f.type.value})`).join(', ');
        rctx.resolved.logger!('resolver', LogLevel.Detailed,
            `registerInstanceLocalTypes done: localTypes=${localTypes.length} canonicalIds=[${canonicalEntries}] fixups=[${fixupEntries}]`);
    }
}

/**
 * resource.drop — produces a core function that drops a resource handle.
 * The core module calls this to release an imported resource (e.g. output-stream).
 *
 * For imported (host) resources, the returned object may have a `drop()` method
 * which serves as the destructor. We call it after removing the handle so the
 * host can release underlying OS resources (sockets, file handles, etc.).
 */
export const resolveCanonicalFunctionResourceDrop: Resolver<CanonicalFunctionResourceDrop> = (rctx, rargs) => {
    const elem = rargs.element;
    const resourceTypeIdx = getCanonicalResourceId(rctx.resolved, elem.resource);

    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (mctx, _bargs): Promise<BinderRes> => {
            const dropFn = (handle: number): void => {
                const obj = mctx.resources.remove(resourceTypeIdx, handle);
                // Call host destructor if the resource object has one.
                if (obj && typeof (obj as any).drop === 'function') {
                    (obj as any).drop();
                }
            };
            return { result: dropFn };
        }, `resource.drop:${elem.selfSortIndex}`)
    };
};

/**
 * resource.new — produces a core function that creates a new resource handle.
 * The core module calls this to create an owned handle to a resource.
 */
export const resolveCanonicalFunctionResourceNew: Resolver<CanonicalFunctionResourceNew> = (rctx, rargs) => {
    const elem = rargs.element;
    const resourceTypeIdx = getCanonicalResourceId(rctx.resolved, elem.resource);

    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (mctx, _bargs): Promise<BinderRes> => {
            const newFn = (rep: number): number => {
                return mctx.resources.add(resourceTypeIdx, rep);
            };
            return { result: newFn };
        }, `resource.new:${elem.selfSortIndex}`)
    };
};

/**
 * resource.rep — produces a core function that returns the i32 representation of a resource handle.
 */
export const resolveCanonicalFunctionResourceRep: Resolver<CanonicalFunctionResourceRep> = (rctx, rargs) => {
    const elem = rargs.element;
    const resourceTypeIdx = getCanonicalResourceId(rctx.resolved, elem.resource);

    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (mctx, _bargs): Promise<BinderRes> => {
            const repFn = (handle: number): unknown => {
                return mctx.resources.get(resourceTypeIdx, handle);
            };
            return { result: repFn };
        }, `resource.rep:${elem.selfSortIndex}`)
    };
};

// --- Stream canonical built-ins ---

/**
 * When `yieldThrottle` is set AND JSPI is enabled,
 * wrap a sync canon built-in `fn` with `WebAssembly.Suspending` and force a
 * macrotask round-trip every Nth call. The non-throttled path is the
 * original sync function — zero overhead when the option is unset or
 * JSPI unavailable.
 *
 * In addition, when `mctx.maxMemoryBytes` is set, every wrapped call
 * verifies the WASM linear-memory size before invoking the built-in.
 * When the guest has grown its memory past the cap (via memory.grow),
 * the next canon op aborts the instance — preventing a malicious or
 * runaway component from OOM'ing the JS process. The check is `mctx`-
 * scoped and bypassed entirely when the cap is unset or zero.
 */
function wrapWithThrottle<TArgs extends unknown[], TRet>(
    fn: (...args: TArgs) => TRet,
    mctx: MarshalingContext,
    yieldThrottle: number | undefined,
    jspiEnabled: boolean,
): (...args: TArgs) => TRet | Promise<TRet> {
    const memCap = mctx.maxMemoryBytes;
    const checkEnabled = memCap !== undefined && memCap > 0;
    const throttleEnabled = yieldThrottle !== undefined && jspiEnabled;
    if (!checkEnabled && !throttleEnabled) return fn;

    const enforceMemCap = checkEnabled
        ? (): void => {
            const buf = mctx.memory.getMemory().buffer;
            if (buf.byteLength > (memCap as number)) {
                mctx.abort(`memory cap exceeded: ${buf.byteLength} > ${memCap}`);
                throw new WebAssembly.RuntimeError(`memory cap exceeded: ${buf.byteLength} > ${memCap}`);
            }
        }
        : (): void => { /* no-op */ };

    if (!throttleEnabled) {
        // Pure memory-cap wrapper — no JSPI, no Promise return, no Suspending wrap.
        return (...args: TArgs): TRet => {
            enforceMemCap();
            return fn(...args);
        };
    }

    const throttled = (...args: TArgs): TRet | Promise<TRet> => {
        enforceMemCap();
        const result = fn(...args);
        const n = (mctx.opsSinceYield ?? 0) + 1;
        if (n >= (yieldThrottle as number)) {
            mctx.opsSinceYield = 0;
            return new Promise<TRet>((resolve) => {
                setImmediate(() => resolve(result));
            });
        }
        mctx.opsSinceYield = n;
        return result;
    };
    return new (WebAssembly as unknown as { Suspending: new (fn: Function) => Function }).Suspending(throttled) as (...args: TArgs) => TRet | Promise<TRet>;
}

export const resolveCanonicalFunctionStreamNew: Resolver<CanonicalFunctionStreamNew> = (rctx, rargs) => {
    const elem = rargs.element;
    const yieldThrottle = rctx.resolved.yieldThrottle;
    const jspiEnabled = rctx.resolved.wrapLower !== undefined;
    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (mctx, _bargs): Promise<BinderRes> => {
            const streamNewFn = (): bigint => {
                return mctx.streams.newStream(elem.type);
            };
            return { result: wrapWithThrottle(streamNewFn, mctx, yieldThrottle, jspiEnabled) };
        }, `stream.new:${elem.selfSortIndex}`)
    };
};

export const resolveCanonicalFunctionStreamRead: Resolver<CanonicalFunctionStreamRead> = (rctx, rargs) => {
    const elem = rargs.element;
    const yieldThrottle = rctx.resolved.yieldThrottle;
    const jspiEnabled = rctx.resolved.wrapLower !== undefined;
    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (mctx, _bargs): Promise<BinderRes> => {
            const streamReadFn = (handle: number, ptr: number, len: number): number => {
                return mctx.streams.read(elem.type, handle, ptr, len);
            };
            return { result: wrapWithThrottle(streamReadFn, mctx, yieldThrottle, jspiEnabled) };
        }, `stream.read:${elem.selfSortIndex}`)
    };
};

export const resolveCanonicalFunctionStreamWrite: Resolver<CanonicalFunctionStreamWrite> = (rctx, rargs) => {
    const elem = rargs.element;
    const yieldThrottle = rctx.resolved.yieldThrottle;
    const jspiEnabled = rctx.resolved.wrapLower !== undefined;
    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (mctx, _bargs): Promise<BinderRes> => {
            const streamWriteFn = (handle: number, ptr: number, len: number): number => {
                return mctx.streams.write(elem.type, handle, ptr, len);
            };
            return { result: wrapWithThrottle(streamWriteFn, mctx, yieldThrottle, jspiEnabled) };
        }, `stream.write:${elem.selfSortIndex}`)
    };
};

export const resolveCanonicalFunctionStreamCancelRead: Resolver<CanonicalFunctionStreamCancelRead> = (rctx, rargs) => {
    const elem = rargs.element;
    const yieldThrottle = rctx.resolved.yieldThrottle;
    const jspiEnabled = rctx.resolved.wrapLower !== undefined;
    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (mctx, _bargs): Promise<BinderRes> => {
            const fn = (handle: number): number => {
                return mctx.streams.cancelRead(elem.type, handle);
            };
            return { result: wrapWithThrottle(fn, mctx, yieldThrottle, jspiEnabled) };
        }, `stream.cancel-read:${elem.selfSortIndex}`)
    };
};

export const resolveCanonicalFunctionStreamCancelWrite: Resolver<CanonicalFunctionStreamCancelWrite> = (rctx, rargs) => {
    const elem = rargs.element;
    const yieldThrottle = rctx.resolved.yieldThrottle;
    const jspiEnabled = rctx.resolved.wrapLower !== undefined;
    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (mctx, _bargs): Promise<BinderRes> => {
            const fn = (handle: number): number => {
                return mctx.streams.cancelWrite(elem.type, handle);
            };
            return { result: wrapWithThrottle(fn, mctx, yieldThrottle, jspiEnabled) };
        }, `stream.cancel-write:${elem.selfSortIndex}`)
    };
};

export const resolveCanonicalFunctionStreamDropReadable: Resolver<CanonicalFunctionStreamDropReadable> = (rctx, rargs) => {
    const elem = rargs.element;
    const yieldThrottle = rctx.resolved.yieldThrottle;
    const jspiEnabled = rctx.resolved.wrapLower !== undefined;
    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (mctx, _bargs): Promise<BinderRes> => {
            const fn = (handle: number): void => {
                mctx.streams.dropReadable(elem.type, handle);
            };
            return { result: wrapWithThrottle(fn, mctx, yieldThrottle, jspiEnabled) };
        }, `stream.drop-readable:${elem.selfSortIndex}`)
    };
};

export const resolveCanonicalFunctionStreamDropWritable: Resolver<CanonicalFunctionStreamDropWritable> = (rctx, rargs) => {
    const elem = rargs.element;
    const yieldThrottle = rctx.resolved.yieldThrottle;
    const jspiEnabled = rctx.resolved.wrapLower !== undefined;
    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (mctx, _bargs): Promise<BinderRes> => {
            const fn = (handle: number): void => {
                mctx.streams.dropWritable(elem.type, handle);
            };
            return { result: wrapWithThrottle(fn, mctx, yieldThrottle, jspiEnabled) };
        }, `stream.drop-writable:${elem.selfSortIndex}`)
    };
};

// --- Future canonical built-ins ---

export const resolveCanonicalFunctionFutureNew: Resolver<CanonicalFunctionFutureNew> = (rctx, rargs) => {
    const elem = rargs.element;
    const yieldThrottle = rctx.resolved.yieldThrottle;
    const jspiEnabled = rctx.resolved.wrapLower !== undefined;
    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (mctx, _bargs): Promise<BinderRes> => {
            const fn = (): bigint => {
                return mctx.futures.newFuture(elem.type);
            };
            return { result: wrapWithThrottle(fn, mctx, yieldThrottle, jspiEnabled) };
        }, `future.new:${elem.selfSortIndex}`)
    };
};

export const resolveCanonicalFunctionFutureRead: Resolver<CanonicalFunctionFutureRead> = (rctx, rargs) => {
    const elem = rargs.element;
    const yieldThrottle = rctx.resolved.yieldThrottle;
    const jspiEnabled = rctx.resolved.wrapLower !== undefined;
    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (mctx, _bargs): Promise<BinderRes> => {
            const fn = (handle: number, ptr: number): number => {
                return mctx.futures.read(elem.type, handle, ptr, mctx);
            };
            return { result: wrapWithThrottle(fn, mctx, yieldThrottle, jspiEnabled) };
        }, `future.read:${elem.selfSortIndex}`)
    };
};

export const resolveCanonicalFunctionFutureWrite: Resolver<CanonicalFunctionFutureWrite> = (rctx, rargs) => {
    const elem = rargs.element;
    const yieldThrottle = rctx.resolved.yieldThrottle;
    const jspiEnabled = rctx.resolved.wrapLower !== undefined;
    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (mctx, _bargs): Promise<BinderRes> => {
            const fn = (handle: number, ptr: number): number => {
                return mctx.futures.write(elem.type, handle, ptr);
            };
            return { result: wrapWithThrottle(fn, mctx, yieldThrottle, jspiEnabled) };
        }, `future.write:${elem.selfSortIndex}`)
    };
};

export const resolveCanonicalFunctionFutureCancelRead: Resolver<CanonicalFunctionFutureCancelRead> = (rctx, rargs) => {
    const elem = rargs.element;
    const yieldThrottle = rctx.resolved.yieldThrottle;
    const jspiEnabled = rctx.resolved.wrapLower !== undefined;
    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (mctx, _bargs): Promise<BinderRes> => {
            const fn = (handle: number): number => {
                return mctx.futures.cancelRead(elem.type, handle);
            };
            return { result: wrapWithThrottle(fn, mctx, yieldThrottle, jspiEnabled) };
        }, `future.cancel-read:${elem.selfSortIndex}`)
    };
};

export const resolveCanonicalFunctionFutureCancelWrite: Resolver<CanonicalFunctionFutureCancelWrite> = (rctx, rargs) => {
    const elem = rargs.element;
    const yieldThrottle = rctx.resolved.yieldThrottle;
    const jspiEnabled = rctx.resolved.wrapLower !== undefined;
    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (mctx, _bargs): Promise<BinderRes> => {
            const fn = (handle: number): number => {
                return mctx.futures.cancelWrite(elem.type, handle);
            };
            return { result: wrapWithThrottle(fn, mctx, yieldThrottle, jspiEnabled) };
        }, `future.cancel-write:${elem.selfSortIndex}`)
    };
};

export const resolveCanonicalFunctionFutureDropReadable: Resolver<CanonicalFunctionFutureDropReadable> = (rctx, rargs) => {
    const elem = rargs.element;
    const yieldThrottle = rctx.resolved.yieldThrottle;
    const jspiEnabled = rctx.resolved.wrapLower !== undefined;
    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (mctx, _bargs): Promise<BinderRes> => {
            const fn = (handle: number): void => {
                mctx.futures.dropReadable(elem.type, handle);
            };
            return { result: wrapWithThrottle(fn, mctx, yieldThrottle, jspiEnabled) };
        }, `future.drop-readable:${elem.selfSortIndex}`)
    };
};

export const resolveCanonicalFunctionFutureDropWritable: Resolver<CanonicalFunctionFutureDropWritable> = (rctx, rargs) => {
    const elem = rargs.element;
    const yieldThrottle = rctx.resolved.yieldThrottle;
    const jspiEnabled = rctx.resolved.wrapLower !== undefined;
    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (mctx, _bargs): Promise<BinderRes> => {
            const fn = (handle: number): void => {
                mctx.futures.dropWritable(elem.type, handle);
            };
            return { result: wrapWithThrottle(fn, mctx, yieldThrottle, jspiEnabled) };
        }, `future.drop-writable:${elem.selfSortIndex}`)
    };
};

// --- Error-context canonical built-ins ---

export const resolveCanonicalFunctionErrorContextNew: Resolver<CanonicalFunctionErrorContextNew> = (_rctx, rargs) => {
    const elem = rargs.element;
    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (mctx, _bargs): Promise<BinderRes> => {
            const fn = (ptr: number, len: number): number => {
                return mctx.errorContexts.newErrorContext(ptr, len);
            };
            return { result: fn };
        }, `error-context.new:${elem.selfSortIndex}`)
    };
};

export const resolveCanonicalFunctionErrorContextDebugMessage: Resolver<CanonicalFunctionErrorContextDebugMessage> = (_rctx, rargs) => {
    const elem = rargs.element;
    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (mctx, _bargs): Promise<BinderRes> => {
            const fn = (handle: number, ptr: number): void => {
                mctx.errorContexts.debugMessage(handle, ptr);
            };
            return { result: fn };
        }, `error-context.debug-message:${elem.selfSortIndex}`)
    };
};

export const resolveCanonicalFunctionErrorContextDrop: Resolver<CanonicalFunctionErrorContextDrop> = (_rctx, rargs) => {
    const elem = rargs.element;
    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (mctx, _bargs): Promise<BinderRes> => {
            const fn = (handle: number): void => {
                mctx.errorContexts.drop(handle);
            };
            return { result: fn };
        }, `error-context.drop:${elem.selfSortIndex}`)
    };
};

// --- Async task canonical built-ins ---

/** context.get — returns the value in the Nth context slot (per-task TLS). */
const resolveCanonicalFunctionContextGet: Resolver<CanonicalFunctionContextGet> = (_rctx, rargs) => {
    const elem = rargs.element;
    const slotIndex = elem.index;
    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (mctx, _bargs): Promise<BinderRes> => {
            const fn = (): number => {
                return mctx.taskContextSlots[slotIndex] ?? 0;
            };
            return { result: fn };
        }, `context.get:${elem.selfSortIndex}`)
    };
};

/** context.set — stores a value in the Nth context slot (per-task TLS). */
const resolveCanonicalFunctionContextSet: Resolver<CanonicalFunctionContextSet> = (_rctx, rargs) => {
    const elem = rargs.element;
    const slotIndex = elem.index;
    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (mctx, _bargs): Promise<BinderRes> => {
            const fn = (value: number): void => {
                mctx.taskContextSlots[slotIndex] = value;
            };
            return { result: fn };
        }, `context.set:${elem.selfSortIndex}`)
    };
};

/** backpressure — inc/dec/set the backpressure counter (no-op for now). */
const resolveCanonicalFunctionBackpressure: Resolver<CoreFunction> = (_rctx, rargs) => {
    const elem = rargs.element;
    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (mctx, _bargs): Promise<BinderRes> => {
            let fn: Function;
            if (elem.tag === ModelTag.CanonicalFunctionBackpressureInc) {
                fn = (): void => { mctx.backpressure++; };
            } else if (elem.tag === ModelTag.CanonicalFunctionBackpressureDec) {
                fn = (): void => { mctx.backpressure--; };
            } else {
                // backpressure.set (legacy) — treat 0 as dec, non-0 as inc
                fn = (value: number): void => { mctx.backpressure += value ? 1 : -1; };
            }
            return { result: fn };
        }, `backpressure:${elem.selfSortIndex}`)
    };
};

/** task.return — delivers the result of an async export to the caller. For now, a no-op stub. */
const resolveCanonicalFunctionTaskReturn: Resolver<CoreFunction> = (_rctx, rargs) => {
    const elem = rargs.element;
    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (): Promise<BinderRes> => {
            const fn = (..._args: number[]): void => {
                // task.return delivers the result. In our synchronous-ish execution model,
                // the result is returned via the normal lifting path. This is a no-op.
            };
            return { result: fn };
        }, `task.return:${elem.selfSortIndex}`)
    };
};

// --- Waitable-set canonical built-ins ---

const resolveCanonicalFunctionWaitableSetNew: Resolver<CoreFunction> = (rctx, rargs) => {
    const elem = rargs.element;
    const yieldThrottle = rctx.resolved.yieldThrottle;
    const jspiEnabled = rctx.resolved.wrapLower !== undefined;
    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (mctx, _bargs): Promise<BinderRes> => {
            const fn = (): number => mctx.waitableSets.newSet();
            return { result: wrapWithThrottle(fn, mctx, yieldThrottle, jspiEnabled) };
        }, `waitable-set.new:${elem.selfSortIndex}`)
    };
};

const resolveCanonicalFunctionWaitableSetWait: Resolver<CoreFunction> = (_rctx, rargs) => {
    const elem = rargs.element;
    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (mctx, _bargs): Promise<BinderRes> => {
            const fn = (setId: number, ptr: number): number | Promise<number> => mctx.waitableSets.wait(setId, ptr);
            return { result: fn };
        }, `waitable-set.wait:${elem.selfSortIndex}`)
    };
};

const resolveCanonicalFunctionWaitableSetPoll: Resolver<CoreFunction> = (rctx, rargs) => {
    const elem = rargs.element;
    const yieldThrottle = rctx.resolved.yieldThrottle;
    const jspiEnabled = rctx.resolved.wrapLower !== undefined;
    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (mctx, _bargs): Promise<BinderRes> => {
            const fn = (setId: number, ptr: number): number => mctx.waitableSets.poll(setId, ptr);
            return { result: wrapWithThrottle(fn, mctx, yieldThrottle, jspiEnabled) };
        }, `waitable-set.poll:${elem.selfSortIndex}`)
    };
};

const resolveCanonicalFunctionWaitableSetDrop: Resolver<CoreFunction> = (rctx, rargs) => {
    const elem = rargs.element;
    const yieldThrottle = rctx.resolved.yieldThrottle;
    const jspiEnabled = rctx.resolved.wrapLower !== undefined;
    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (mctx, _bargs): Promise<BinderRes> => {
            const fn = (setId: number): void => mctx.waitableSets.drop(setId);
            return { result: wrapWithThrottle(fn, mctx, yieldThrottle, jspiEnabled) };
        }, `waitable-set.drop:${elem.selfSortIndex}`)
    };
};

const resolveCanonicalFunctionWaitableJoin: Resolver<CoreFunction> = (rctx, rargs) => {
    const elem = rargs.element;
    const yieldThrottle = rctx.resolved.yieldThrottle;
    const jspiEnabled = rctx.resolved.wrapLower !== undefined;
    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (mctx, _bargs): Promise<BinderRes> => {
            const fn = (waitableHandle: number, setId: number): void => mctx.waitableSets.join(waitableHandle, setId);
            return { result: wrapWithThrottle(fn, mctx, yieldThrottle, jspiEnabled) };
        }, `waitable.join:${elem.selfSortIndex}`)
    };
};

const resolveCanonicalFunctionSubtaskDrop: Resolver<CoreFunction> = (rctx, rargs) => {
    const elem = rargs.element;
    const yieldThrottle = rctx.resolved.yieldThrottle;
    const jspiEnabled = rctx.resolved.wrapLower !== undefined;
    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (mctx, _bargs): Promise<BinderRes> => {
            const fn = (handle: number): void => {
                mctx.waitableSets.join(handle, 0); // disjoin from any waitable-set
                mctx.subtasks.drop(handle);
            };
            return { result: wrapWithThrottle(fn, mctx, yieldThrottle, jspiEnabled) };
        }, `subtask.drop:${elem.selfSortIndex}`)
    };
};

// --- Placeholder resolver for not-yet-implemented async built-ins ---

const resolveCanonicalFunctionNotImplemented: Resolver<CoreFunction> = (_rctx, rargs) => {
    const elem = rargs.element;
    return {
        callerElement: rargs.callerElement,
        element: elem,
        binder: withDebugTrace(async (): Promise<BinderRes> => {
            const fn = (): void => {
                throw new Error(`Canonical built-in "${elem.tag}" is not yet implemented`);
            };
            return { result: fn };
        }, `not-implemented:${elem.selfSortIndex}`)
    };
};
