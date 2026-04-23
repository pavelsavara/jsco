// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { TCabiRealloc, WasmPointer, WasmSize, MarshalingContext } from '../../marshal/model/types';
export type { MarshalingContext as BindingContext } from '../../marshal/model/types';
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

export type InstanceTable = {
    coreInstances: BinderRes[];
    componentInstances: BinderRes[];
}

export type MemoryView = {
    initialize(memory: WebAssembly.Memory): void;
    getMemory: () => WebAssembly.Memory;
    getView: (ptr: WasmPointer, len: WasmSize) => DataView;
    getViewU8: (ptr: WasmPointer, len: WasmSize) => Uint8Array;
    readI32: (ptr: WasmPointer) => number;
    writeI32: (ptr: WasmPointer, value: number) => void;
}

export type Allocator = {
    initialize(cabi_realloc: TCabiRealloc): void;
    isInitialized(): boolean;
    alloc: (newSize: WasmSize, align: WasmSize) => WasmPointer;
    realloc: (oldPtr: WasmPointer, oldSize: WasmSize, align: WasmSize, newSize: WasmSize) => WasmPointer;
}

export type ResourceTable = {
    add(resourceTypeIdx: number, obj: unknown): number;
    get(resourceTypeIdx: number, handle: number): unknown;
    remove(resourceTypeIdx: number, handle: number): unknown;
    has(resourceTypeIdx: number, handle: number): boolean;
    lend(resourceTypeIdx: number, handle: number): void;
    unlend(resourceTypeIdx: number, handle: number): void;
    lendCount(resourceTypeIdx: number, handle: number): number;
}

export interface StreamTable {
    newStream(typeIdx: number): bigint;
    read(typeIdx: number, handle: number, ptr: number, len: number): number;
    write(typeIdx: number, handle: number, ptr: number, len: number): number;
    cancelRead(typeIdx: number, handle: number): number;
    cancelWrite(typeIdx: number, handle: number): number;
    dropReadable(typeIdx: number, handle: number): void;
    dropWritable(typeIdx: number, handle: number): void;
    addReadable(typeIdx: number, value: unknown, elementStorer?: (ctx: MarshalingContext, ptr: number, value: unknown) => void, elementSize?: number, mctx?: MarshalingContext): number;
    getReadable(typeIdx: number, handle: number): unknown;
    removeReadable(typeIdx: number, handle: number): unknown;
    addWritable(typeIdx: number, value: unknown): number;
    getWritable(typeIdx: number, handle: number): unknown;
    removeWritable(typeIdx: number, handle: number): unknown;
    /** Check if a base handle belongs to this stream table. */
    hasStream(baseHandle: number): boolean;
    /** Check if a stream has data available for reading. */
    hasData(baseHandle: number): boolean;
    /** Register a callback for when data arrives or stream closes. */
    onReady(baseHandle: number, callback: () => void): void;
    /** Check if a stream's write buffer has space below the backpressure threshold. */
    hasWriteSpace(baseHandle: number): boolean;
    /** Register a callback for when the write buffer drains below threshold. */
    onWriteReady(baseHandle: number, callback: () => void): void;
    /** Fulfill a deferred read: copy buffered data into the guest buffer and return the packed result. */
    fulfillPendingRead(handle: number): number;
}

export interface FutureTable {
    newFuture(typeIdx: number): bigint;
    read(typeIdx: number, handle: number, ptr: number, mctx?: MarshalingContext): number;
    write(typeIdx: number, handle: number, ptr: number): number;
    cancelRead(typeIdx: number, handle: number): number;
    cancelWrite(typeIdx: number, handle: number): number;
    dropReadable(typeIdx: number, handle: number): void;
    dropWritable(typeIdx: number, handle: number): void;
    addReadable(typeIdx: number, value: unknown, storer?: FutureStorer): number;
    getReadable(typeIdx: number, handle: number): unknown;
    removeReadable(typeIdx: number, handle: number): unknown;
    addWritable(typeIdx: number, value: unknown): number;
    getWritable(typeIdx: number, handle: number): unknown;
    removeWritable(typeIdx: number, handle: number): unknown;
    /** Get the internal entry for waitable-set integration. */
    getEntry(handle: number): { resolved: boolean, onResolve?: (() => void)[] } | undefined;
}

/** Callback to store a resolved future value into WASM memory at the given pointer. */
export type FutureStorer = (ctx: MarshalingContext, ptr: number, value: unknown, rejected?: boolean) => void;

/** Subtask state per the canonical ABI spec. */
export const enum SubtaskState {
    STARTING = 0,
    STARTED = 1,
    RETURNED = 2,
}

export interface SubtaskTable {
    /** Create a subtask from a Promise. Returns the subtask handle. */
    create(promise: Promise<unknown>): number;
    /** Get the subtask entry for waitable-set integration. */
    getEntry(handle: number): SubtaskEntry | undefined;
    /** Drop a completed subtask. */
    drop(handle: number): void;
}

export interface SubtaskEntry {
    state: SubtaskState;
    resolved: boolean;
    /** Callbacks to invoke when this subtask resolves (for waitable-set integration). */
    onResolve?: (() => void)[];
}

export interface ErrorContextTable {
    newErrorContext(ptr: number, len: number): number;
    debugMessage(handle: number, ptr: number): void;
    drop(handle: number): void;
    add(value: unknown): number;
    get(handle: number): unknown;
    remove(handle: number): unknown;
}

export interface WaitableSetTable {
    newSet(): number;
    wait(setId: number, ptr: number): number | Promise<number>;
    poll(setId: number, ptr: number): number;
    drop(setId: number): void;
    join(waitableHandle: number, setId: number): void;
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
