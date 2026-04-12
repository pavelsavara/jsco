import { TCabiRealloc, WasmPointer, WasmSize } from './binding/types';
import { ComponentAliasCoreInstanceExport, ComponentFunction, CoreFunction } from '../model/aliases';
import { ComponentExport } from '../model/exports';
import { ComponentImport } from '../model/imports';
import { CoreInstance, ComponentInstance } from '../model/instances';
import { ComponentTypeResource, ComponentType } from '../model/types';
import { WITModel } from '../parser';
import { CoreModule, ComponentSection } from '../parser/types';
import { TaggedElement } from '../model/tags';
import { JsImports } from './api-types';
import type { ComponentTypeIndex } from '../model/indices';
import type { ResolvedType } from './type-resolution';
import type { CanonicalOption } from '../model/canonicals';
import type { LogFn, Verbosity } from '../utils/assert';
import type { ResolutionStats } from './api-types';
import { ModelTag } from '../model/tags';

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
}

export function resolveCanonicalOptions(options: CanonicalOption[]): ResolvedCanonicalOptions {
    let stringEncoding: StringEncoding = StringEncoding.Utf8;
    let memoryIndex: number | undefined;
    let reallocIndex: number | undefined;
    let postReturnIndex: number | undefined;

    for (const opt of options) {
        switch (opt.tag) {
            case ModelTag.CanonicalOptionUTF8:
                stringEncoding = StringEncoding.Utf8;
                break;
            case ModelTag.CanonicalOptionUTF16:
                stringEncoding = StringEncoding.Utf16;
                break;
            case ModelTag.CanonicalOptionCompactUTF16:
                stringEncoding = StringEncoding.CompactUtf16;
                break;
            case ModelTag.CanonicalOptionMemory:
                memoryIndex = opt.value;
                break;
            case ModelTag.CanonicalOptionRealloc:
                reallocIndex = opt.value;
                break;
            case ModelTag.CanonicalOptionPostReturn:
                postReturnIndex = opt.value;
                break;
        }
    }

    return { stringEncoding, memoryIndex, reallocIndex, postReturnIndex };
}

export type ComponentFactoryOptions = {
    useNumberForInt64?: boolean
    validateTypes?: boolean
    jspi?: boolean
    wasmInstantiate?: (moduleObject: WebAssembly.Module, importObject?: WebAssembly.Imports) => Promise<WebAssembly.Instance>
    verbose?: Partial<Verbosity>
    logger?: LogFn
}

export type ComponentFactoryInput = WITModel
    | string
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
    componentInstances: ComponentInstance[],
    componentTypeResource: ComponentTypeResource[],
    componentFunctions: ComponentFunction[],
    componentTypes: ComponentType[],
    componentSections: ComponentSection[]// append to componentTypes
}

/** Subset of ResolverContext retained for binding/call time. Separate object so
 *  binder closures don't keep the heavy IndexedModel alive. */
export type ResolvedContext = {
    jspi?: boolean
    liftingCache: Map<unknown, unknown>
    loweringCache: Map<unknown, unknown>
    resolvedTypes: Map<ComponentTypeIndex, ResolvedType>
    /** Maps type index → canonical resource ID. Multiple type aliases to the same resource share one ID. */
    canonicalResourceIds: Map<number, number>
    /** Caches resolution results for ComponentSection objects. Same ComponentSection
     *  (by identity) produces the same resolution — avoids exponential re-resolution
     *  in WAC compositions where the same component type is instantiated multiple times. */
    componentSectionCache: Map<ComponentSection, ResolverRes>
    /** Resolution phase counters for diagnostics and test assertions. Only populated in Debug builds. */
    stats?: ResolutionStats
    /** Current string encoding for the canonical function being resolved. Set per lift/lower. */
    stringEncoding: StringEncoding
    usesNumberForInt64: boolean
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
    alloc: (newSize: WasmSize, align: WasmSize) => WasmPointer;
    realloc: (oldPtr: WasmPointer, oldSize: WasmSize, align: WasmSize, newSize: WasmSize) => WasmPointer;
}

export type ResourceTable = {
    add(resourceTypeIdx: number, obj: unknown): number;
    get(resourceTypeIdx: number, handle: number): unknown;
    remove(resourceTypeIdx: number, handle: number): unknown;
    has(resourceTypeIdx: number, handle: number): boolean;
}

export type BindingContext = {
    componentImports: JsImports;
    instances: InstanceTable;
    memory: MemoryView;
    allocator: Allocator;
    resources: ResourceTable;
    utf8Decoder: TextDecoder;
    utf8Encoder: TextEncoder;
    abort: () => void;
    debugStack?: string[];
    poisoned?: boolean;
    inExport?: boolean;
    postReturnFn?: Function;
    verbose?: Verbosity;
    logger?: LogFn;
}

export type Resolver<TModelElement> = (rctx: ResolverContext, args: ResolverArgs<TModelElement>) => ResolverRes
export type Binder = (bctx: BindingContext, args: BinderArgs) => Promise<BinderRes>

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

export type BinderRes = {
    result: unknown
}
