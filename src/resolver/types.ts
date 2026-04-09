import { TCabiRealloc, WasmPointer, WasmSize } from './binding/types';
import { ComponentAliasCoreInstanceExport, ComponentFunction, CoreFunction } from '../model/aliases';
import { ComponentExport } from '../model/exports';
import { ComponentImport } from '../model/imports';
import { CoreInstance, ComponentInstance } from '../model/instances';
import { ComponentTypeResource, ComponentType } from '../model/types';
import { WITModel } from '../parser';
import { CoreModule, ComponentSection } from '../parser/types';
import { TaggedElement } from '../model/tags';
import { JsImports, WasmComponentInstance } from './api-types';
import type { ComponentTypeIndex } from '../model/indices';
import type { ResolvedType } from './type-resolution';
import type { CanonicalOption } from '../model/canonicals';
import { ModelTag } from '../model/tags';
import { jsco_assert } from '../utils/assert';

export const enum StringEncoding {
    Utf8 = 'utf-8',
    Utf16 = 'utf-16',
    CompactUtf16 = 'compact-utf-16',
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
    wasmInstantiate?: (moduleObject: WebAssembly.Module, importObject?: WebAssembly.Imports) => Promise<WebAssembly.Instance>
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

export type ResolverContext = {
    indexes: IndexedModel;
    /** Maps componentImports[] index → componentInstances[] index for instance imports */
    importToInstanceIndex: Map<number, number>;
    usesNumberForInt64: boolean
    wasmInstantiate: (moduleObject: WebAssembly.Module, importObject?: WebAssembly.Imports) => Promise<WebAssembly.Instance>
    memoizeCache: Map<unknown, unknown>
    resolvedTypes: Map<ComponentTypeIndex, ResolvedType>
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
