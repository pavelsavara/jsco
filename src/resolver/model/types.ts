// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import type { MarshalingContext } from '../../marshal/model/types';
export type { MarshalingContext } from '../../marshal/model/types';
import type { ComponentAliasCoreInstanceExport, ComponentFunction, CoreFunction } from '../../parser/model/aliases';
import type { ComponentExport } from '../../parser/model/exports';
import type { ComponentImport } from '../../parser/model/imports';
import type { CoreInstance, ComponentInstance } from '../../parser/model/instances';
import type { ComponentTypeResource, ComponentType, ComponentTypeDefinedOwn, ComponentTypeDefinedBorrow } from '../../parser/model/types';
import type { CoreModule, ComponentSection } from '../../parser/types';
import type { TaggedElement } from '../../parser/model/tags';
import type { JsImports } from './api-types';
import type { ComponentTypeIndex } from '../../parser/model/indices';
import type { ResolvedType } from './type-resolution';
import type { LogFn, Verbosity } from '../../utils/assert';
import type { ResolutionStats } from './api-types';

export const enum StringEncoding {
    Utf8,
    Utf16,
    CompactUtf16,
}

export type ResolvedCanonicalOptions = {
    stringEncoding: StringEncoding;
    memoryIndex?: number;
    reallocIndex?: number;
    postReturnIndex?: number;
    async?: boolean;
    callbackIndex?: number;
}

export type ComponentFactoryOptions = {
    useNumberForInt64?: boolean | string[]
    noJspi?: boolean | string[]
    validateTypes?: boolean
    yieldThrottle?: number
    wasmInstantiate?: (moduleObject: WebAssembly.Module, importObject?: WebAssembly.Imports) => Promise<WebAssembly.Instance>
}

export type ComponentFactoryInput = string
    | ArrayLike<number>
    | ReadableStream<Uint8Array>
    | Response
    | PromiseLike<Response>


export type IndexedModel = {
    coreModules: CoreModule[]
    coreInstances: CoreInstance[],
    coreFunctions: CoreFunction[]
    coreMemories: ComponentAliasCoreInstanceExport[]
    coreGlobals: ComponentAliasCoreInstanceExport[]
    coreTables: ComponentAliasCoreInstanceExport[]

    componentImports: ComponentImport[]
    componentExports: ComponentExport[]
    componentInstances: (ComponentInstance | ComponentExport)[],
    componentTypeResource: ComponentTypeResource[],
    componentFunctions: (ComponentFunction | ComponentExport)[],
    componentTypes: (ComponentType | ComponentExport)[],
    componentSections: (ComponentSection | ComponentImport | ComponentExport)[]// append to componentTypes
}

/** Subset of ResolverContext retained for binding/call time. Separate object so
 *  binder closures don't keep the heavy IndexedModel alive. */
export type ResolvedContext = {
    /** Optional wrapper for canon.lift exports (e.g. JSPI promising). Applied at bind time. */
    wrapLift?: (fn: Function, exportName?: string) => Function
    /** Optional wrapper for canon.lower imports (e.g. JSPI Suspending). Applied at bind time. */
    wrapLower?: (fn: Function) => Function
    /** Guards against applying own/borrow fixups multiple times when the same instance
     *  type is processed by multiple calls to registerInstanceLocalTypes. */
    fixedUpOwnBorrow: WeakSet<ComponentTypeDefinedOwn | ComponentTypeDefinedBorrow>
    liftingCache: Map<unknown, unknown>
    loweringCache: Map<unknown, unknown>
    resolvedTypes: Map<ComponentTypeIndex, ResolvedType>
    /** Maps type index → canonical resource ID. Multiple type aliases to the same resource share one ID. */
    canonicalResourceIds: Map<number, number>
    /** Canonical resource IDs for resources defined by this component instance (not imported).
     *  Used by canon.lift to pass rep directly for borrow<T> (spec: cx.inst is t.rt.impl). */
    ownInstanceResources: Set<number>
    /** Caches resolution results for ComponentSection objects. Same ComponentSection
     *  (by identity) produces the same resolution — avoids exponential re-resolution
     *  in WAC compositions where the same component type is instantiated multiple times. */
    componentSectionCache: Map<ComponentSection, ResolverRes>
    /** Resolution phase counters for diagnostics and test assertions. Only populated in Debug builds. */
    stats?: ResolutionStats
    /** Current string encoding for the canonical function being resolved. Set per lift/lower. */
    stringEncoding: StringEncoding
    usesNumberForInt64: boolean
    /** When useNumberForInt64 is string[], stores the method name filter. */
    useNumberForInt64Methods?: string[]
    /** Separate cache for Number-mode lifters when per-method filtering is active. */
    numberModeLiftingCache?: Map<unknown, unknown>
    /** Separate cache for Number-mode lowerers when per-method filtering is active. */
    numberModeLoweringCache?: Map<unknown, unknown>
    verbose?: Verbosity
    logger?: LogFn
    yieldThrottle?: number
}

export type ResolverContext = {
    resolved: ResolvedContext;
    indexes: IndexedModel;
    /** Maps componentImports[] index → componentInstances[] index for instance imports */
    importToInstanceIndex: Map<number, number>;
    /** Maps "instanceIndex:exportName" → canonical resource ID for resource type alias deduplication */
    resourceAliasGroups: Map<string, number>;
    /** Per-context resolver caches — prevents duplicate resolution of the same element within one context. */
    componentInstanceCache: Map<ComponentInstance, ResolverRes>;
    coreInstanceCache: Map<CoreInstance, ResolverRes>;
    coreFunctionCache: Map<CoreFunction, ResolverRes>;
    componentFunctionCache: Map<ComponentFunction, ResolverRes>;
    validateTypes: boolean
    wasmInstantiate: (moduleObject: WebAssembly.Module, importObject?: WebAssembly.Imports) => Promise<WebAssembly.Instance>
}

export type Resolver<TModelElement> = (rctx: ResolverContext, args: ResolverArgs<TModelElement>) => ResolverRes
export type Binder = (mctx: MarshalingContext, args: BinderArgs) => Promise<BinderRes>

export type ResolverArgs<TModelElement> = {
    callerElement: TaggedElement | undefined
    element: TModelElement
}

export type ResolverRes = {
    callerElement: TaggedElement | undefined
    element: TaggedElement
    binder: Binder
}

export type BinderArgs = {
    callerArgs?: BinderArgs
    arguments?: unknown[]
    imports?: JsImports
    debugStack?: string[]
}

export type BinderRes<T = unknown> = {
    result: T
}

export type CoreInstanceBinderRes = BinderRes<Record<string, WebAssembly.ExportValue>>
export type FunctionBinderRes = BinderRes<Function>
export type ModuleBinderRes = BinderRes<WebAssembly.Module>
