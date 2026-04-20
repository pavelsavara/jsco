// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import isDebug from 'env:isDebug';
import { WITModel } from '../parser';
import { IndexedElement, ModelTag, TaggedElement } from '../model/tags';
import { ComponentAliasInstanceExport, ComponentOuterAliasKind } from '../model/aliases';
import { ExternalKind } from '../model/core';
import { ComponentExport, ComponentExternalKind } from '../model/exports';
import { defaultVerbosity, LogLevel } from '../utils/assert';
import type { LogFn, Verbosity } from '../utils/assert';
import { BindingContext, ComponentFactoryOptions, MemoryView, Allocator, InstanceTable, ResolvedContext, ResolverContext, ResourceTable, StreamTable, FutureTable, FutureStorer, SubtaskTable, SubtaskEntry, SubtaskState, ErrorContextTable, WaitableSetTable, StringEncoding } from './types';
import { TCabiRealloc, WasmPointer, WasmSize } from '../marshal/types';
import { JsImports } from './api-types';
import { buildResolvedTypeMap } from './type-resolution';
import type { ComponentImport } from '../model/imports';
import type { ComponentTypeInstance, ComponentTypeResource } from '../model/types';
import { NO_JSPI, USE_NUMBER_FOR_INT64, VALIDATE_TYPES, WASM_INSTANTIATE, VERBOSE, LOGGER, PROMISING, SUSPENDING } from '../utils/constants';
import { hasJspi } from '../utils/jspi';

function createJspiWrappers(noJspi?: boolean | string[]): { wrapLift?: (fn: Function, exportName?: string) => Function; wrapLower?: (fn: Function) => Function } {
    if (!hasJspi() || noJspi === true) return {};
    return {
        wrapLift: (fn, exportName) => {
            const shouldWrap = Array.isArray(noJspi)
                ? (exportName !== undefined && !noJspi.includes(exportName))
                : true;
            return shouldWrap ? (WebAssembly as any)[PROMISING](fn) : fn;
        },
        wrapLower: (fn) => new (WebAssembly as any)[SUSPENDING](fn),
    };
}

export function createResolverContext(sections: WITModel, options: ComponentFactoryOptions): ResolverContext {
    // eslint-disable-next-line no-console
    const defaultLogger: LogFn = (phase, _level, ...args) => console.log(`[${phase}]`, ...args);
    const verbose = { ...defaultVerbosity, ...(options as any)[VERBOSE] };
    const logger = (options as any)[LOGGER] ?? defaultLogger;
    const jspiWrappers = createJspiWrappers(options[NO_JSPI]);
    const rctx: ResolverContext = {
        resolved: {
            wrapLift: jspiWrappers.wrapLift,
            wrapLower: jspiWrappers.wrapLower,
            fixedUpOwnBorrow: new WeakSet(),
            usesNumberForInt64: options[USE_NUMBER_FOR_INT64] === true,
            useNumberForInt64Methods: Array.isArray(options[USE_NUMBER_FOR_INT64]) ? options[USE_NUMBER_FOR_INT64] : undefined,
            numberModeLiftingCache: Array.isArray(options[USE_NUMBER_FOR_INT64]) ? new Map() : undefined,
            numberModeLoweringCache: Array.isArray(options[USE_NUMBER_FOR_INT64]) ? new Map() : undefined,
            stringEncoding: StringEncoding.Utf8,
            liftingCache: new Map(),
            loweringCache: new Map(),
            resolvedTypes: new Map(),
            canonicalResourceIds: new Map(),
            ownInstanceResources: new Set(),
            componentSectionCache: new Map(),
            stats: isDebug ? { resolveComponentSection: 0, resolveComponentInstanceInstantiate: 0, createScopedResolverContext: 0, componentSectionCacheHits: 0, componentInstanceCacheHits: 0, coreInstanceCacheHits: 0, coreFunctionCacheHits: 0, componentFunctionCacheHits: 0 } : undefined,
            verbose,
            logger,
        },
        validateTypes: (options[VALIDATE_TYPES] === false) ? false : true,
        wasmInstantiate: options[WASM_INSTANTIATE] ?? ((module, importObject) => WebAssembly.instantiate(module, importObject)),
        importToInstanceIndex: new Map(),
        resourceAliasGroups: new Map(),
        componentInstanceCache: new Map(),
        coreInstanceCache: new Map(),
        coreFunctionCache: new Map(),
        componentFunctionCache: new Map(),
        indexes: {
            componentExports: [],
            componentImports: [],
            componentFunctions: [],
            componentInstances: [],
            componentTypes: [], // this is 2 phase
            componentTypeResource: [],

            coreModules: [],
            coreInstances: [],
            coreFunctions: [],
            coreMemories: [],
            coreTables: [],
            coreGlobals: [],
            componentSections: [],
        },
    };

    populateIndexes(rctx, sections);
    // Previously merged into componentTypes, but this is incorrect: the TYPE sort should
    // only contain entries from section id 7 (type definitions) and type aliases.
    // ComponentInstanceInstantiate.component_index references componentSections (COMPONENT sort),
    // while type_index references componentTypes (TYPE sort).
    setSelfIndex(rctx);
    buildCanonicalResourceIds(rctx);
    rctx.resolved.resolvedTypes = buildResolvedTypeMap(rctx);
    return rctx;
}

/// Creates a scoped ResolverContext for a nested ComponentSection.
/// Nested ComponentSections define their own local index spaces — sort indices
/// within the section reference elements declared inside it, not the parent scope.
/// This function builds local indexes from the section's declarations so that
/// lookups (e.g., component_index in ComponentInstanceInstantiate) resolve correctly.
export function createScopedResolverContext(parentRctx: ResolverContext, sections: TaggedElement[]): ResolverContext {
    if (isDebug && parentRctx.resolved.stats) parentRctx.resolved.stats.createScopedResolverContext++;
    const scopedRctx: ResolverContext = {
        resolved: {
            ...parentRctx.resolved,
            resolvedTypes: new Map(),
            liftingCache: new Map(),
            loweringCache: new Map(),
            canonicalResourceIds: new Map(),
            ownInstanceResources: new Set(),
            verbose: parentRctx.resolved.verbose,
            logger: parentRctx.resolved.logger,
        },
        validateTypes: parentRctx.validateTypes,
        wasmInstantiate: parentRctx.wasmInstantiate,
        importToInstanceIndex: new Map(),
        resourceAliasGroups: new Map(),
        componentInstanceCache: new Map(),
        coreInstanceCache: new Map(),
        coreFunctionCache: new Map(),
        componentFunctionCache: new Map(),
        indexes: {
            componentExports: [],
            componentImports: [],
            componentFunctions: [],
            componentInstances: [],
            componentTypes: [],
            componentTypeResource: [],

            coreModules: [],
            coreInstances: [],
            coreFunctions: [],
            coreMemories: [],
            coreTables: [],
            coreGlobals: [],
            componentSections: [],
        },
    };

    populateIndexes(scopedRctx, sections);
    setSelfIndex(scopedRctx);
    buildCanonicalResourceIds(scopedRctx);
    scopedRctx.resolved.resolvedTypes = buildResolvedTypeMap(scopedRctx);
    return scopedRctx;
}

/** Populate index spaces from parsed sections. Shared by createResolverContext and createScopedResolverContext. */
function populateIndexes(rctx: ResolverContext, sections: Iterable<TaggedElement>): void {
    const indexes = rctx.indexes;
    for (const section of sections) {
        const bucket = bucketByTag(rctx, section.tag, false, (section as any).kind);
        bucket.push(section);

        if (section.tag === ModelTag.ComponentTypeResource) {
            indexes.componentTypeResource.push({ ...section } as ComponentTypeResource);
        }

        // ComponentImport contributions to sort index spaces.
        // Each import kind contributes to its respective sort, and we track the
        // mapping from import index → sort index for kinds that need it at bind time.
        if (section.tag === ModelTag.ComponentImport) {
            const imp = section as ComponentImport;
            if (imp.ty.tag === ModelTag.ComponentTypeRefInstance) {
                // Instance import → instance sort.
                // The ty.value is a type sort index pointing to a ComponentTypeInstance.
                const instanceType = indexes.componentTypes[imp.ty.value];
                if (instanceType) {
                    const instanceIndex = indexes.componentInstances.length;
                    // Shallow clone: the same object lives in componentTypes[] too.
                    // setSelfIndex runs on both arrays, so a shared reference would
                    // get its selfSortIndex clobbered by whichever array runs last.
                    indexes.componentInstances.push({ ...instanceType } as ComponentTypeInstance);
                    const importIndex = indexes.componentImports.length - 1;
                    rctx.importToInstanceIndex.set(importIndex, instanceIndex);
                }
            }
            if (imp.ty.tag === ModelTag.ComponentTypeRefComponent) {
                // Component import → instance sort (for JS binding, imported components
                // are provided as objects with exports, equivalent to instances).
                // Also pushed to componentSections (component sort) so
                // ComponentInstanceInstantiate.component_index can reference it.
                const instanceIndex = indexes.componentInstances.length;
                const componentType = indexes.componentTypes[imp.ty.value];
                if (componentType) {
                    indexes.componentInstances.push({ ...componentType } as ComponentTypeInstance);
                } else {
                    // No type definition found — create a placeholder instance entry
                    indexes.componentInstances.push({ tag: ModelTag.ComponentTypeInstance, declarations: [] } as ComponentTypeInstance);
                }
                indexes.componentSections.push(imp);
                const importIndex = indexes.componentImports.length - 1;
                rctx.importToInstanceIndex.set(importIndex, instanceIndex);
            }
            // Func imports contribute to the component function index space.
            // CanonicalFunctionLower.func_index references imported functions by index.
            if (imp.ty.tag === ModelTag.ComponentTypeRefFunc) {
                indexes.componentFunctions.push(imp);
            }
        }

        // Component model spec: export definitions extend the index space of their kind.
        // An (export "name" (instance N)) creates a new entry in the instance index space, etc.
        if (section.tag === ModelTag.ComponentExport) {
            const exp = section as ComponentExport;
            switch (exp.kind) {
                case ComponentExternalKind.Instance:
                    indexes.componentInstances.push(exp);
                    break;
                case ComponentExternalKind.Func:
                    indexes.componentFunctions.push(exp);
                    break;
                case ComponentExternalKind.Type:
                    indexes.componentTypes.push(exp);
                    break;
                case ComponentExternalKind.Component:
                    indexes.componentSections.push(exp);
                    break;
            }
        }
    }
}

export function setSelfIndex(rctx: ResolverContext) {
    function setSelfIndex(sort: IndexedElement[]) {
        for (let i = 0; i < sort.length; i++) {
            const elem = sort[i];
            if (!elem) throw new Error(`setSelfIndex: missing element at index ${i}`);
            elem.selfSortIndex = i;
        }
    }
    setSelfIndex(rctx.indexes.componentExports);
    setSelfIndex(rctx.indexes.componentImports);
    setSelfIndex(rctx.indexes.componentFunctions);
    setSelfIndex(rctx.indexes.componentInstances);
    setSelfIndex(rctx.indexes.componentTypes);
    setSelfIndex(rctx.indexes.componentTypeResource);

    setSelfIndex(rctx.indexes.coreModules);
    setSelfIndex(rctx.indexes.coreInstances);
    setSelfIndex(rctx.indexes.coreFunctions);
    setSelfIndex(rctx.indexes.coreMemories);
    setSelfIndex(rctx.indexes.coreTables);
    setSelfIndex(rctx.indexes.coreGlobals);
}

/// Builds a map from type index → canonical resource ID.
/// Multiple type aliases to the same resource (from the same instance export)
/// share one canonical ID, ensuring ResourceTable per-type isolation works
/// correctly across different aliases to the same underlying resource.
function buildCanonicalResourceIds(rctx: ResolverContext): void {
    const types = rctx.indexes.componentTypes;
    const map = rctx.resolved.canonicalResourceIds;

    // Phase 1: Assign canonical IDs to resource source types.
    // For ComponentTypeResource: the type index IS the canonical ID.
    //   These are own-instance resources (defined by this component).
    // For ComponentAliasInstanceExport (Type kind): group by (instance_index, name).
    //   First occurrence defines the canonical ID; subsequent aliases get the same ID.

    for (let i = 0; i < types.length; i++) {
        const t = types[i];
        if (!t) throw new Error(`buildCanonicalResourceIds: missing type at index ${i}`);
        if (t.tag === ModelTag.ComponentTypeResource) {
            map.set(i, i);
            rctx.resolved.ownInstanceResources.add(i);
        } else if (t.tag === ModelTag.ComponentAliasInstanceExport) {
            const alias = t as ComponentAliasInstanceExport;
            if (alias.kind === ComponentExternalKind.Type) {
                const key = `${alias.instance_index}:${alias.name}`;
                const existing = rctx.resourceAliasGroups.get(key);
                if (existing !== undefined) {
                    map.set(i, existing);
                } else {
                    rctx.resourceAliasGroups.set(key, i);
                    map.set(i, i);
                }
            }
        }
    }

    if (isDebug && (rctx.resolved.verbose?.resolver ?? 0) >= LogLevel.Summary) {
        const entries: string[] = [];
        for (const [typeIdx, canonicalId] of map) {
            const t = types[typeIdx];
            if (!t) {
                rctx.resolved.logger!('resolver', LogLevel.Summary, `WARNING: canonicalResourceIds references missing type at index ${typeIdx}`);
                continue;
            }
            const label = t.tag === ModelTag.ComponentTypeResource
                ? 'resource'
                : t.tag === ModelTag.ComponentAliasInstanceExport
                    ? `alias(instance=${(t as ComponentAliasInstanceExport).instance_index}, name="${(t as ComponentAliasInstanceExport).name}")`
                    : `tag=${t.tag}`;
            entries.push(`  type[${typeIdx}] → canonical ${canonicalId} (${label})`);
        }
        rctx.resolved.logger!('resolver', LogLevel.Summary,
            `canonicalResourceIds (${map.size} entries): ${entries.join(' | ')}`);
    }
}

/// Resolves a type index to its canonical resource ID.
/// Handles own<T>/borrow<T> (follows .value) and direct resource/alias references.
export function getCanonicalResourceId(rctx: ResolvedContext, resourceTypeIdx: number): number {
    return rctx.canonicalResourceIds?.get(resourceTypeIdx) ?? resourceTypeIdx;
}

export function createMemoryView(): MemoryView {
    let memory: WebAssembly.Memory = undefined as any;

    function initialize(m: WebAssembly.Memory) {
        memory = m;
    }
    function getView(pointer?: number, len?: number) {
        return new DataView(memory.buffer, pointer, len);
    }
    function getViewU8(pointer?: number, len?: number) {
        return new Uint8Array(memory.buffer, pointer, len);
    }
    function getMemory() {
        return memory;
    }
    function readI32(ptr: WasmPointer) {
        return getView().getInt32(ptr);
    }
    function writeI32(ptr: WasmPointer, value: number) {
        return getView().setInt32(ptr, value);
    }
    return { initialize, getMemory, getView, getViewU8, readI32, writeI32 };
}

export function createAllocator(): Allocator {
    let cabi_realloc: TCabiRealloc = undefined as any;

    function initialize(realloc: TCabiRealloc) {
        cabi_realloc = realloc;
    }
    function isInitialized() {
        return cabi_realloc !== undefined;
    }
    function realloc(oldPtr: WasmPointer, oldSize: WasmSize, align: WasmSize, newSize: WasmSize) {
        return cabi_realloc(oldPtr, oldSize, align, newSize);
    }
    function alloc(newSize: WasmSize, align: WasmSize) {
        return cabi_realloc(0 as any, 0 as any, align, newSize);
    }
    return { initialize, isInitialized, alloc, realloc };
}

export function createInstanceTable(): InstanceTable {
    return {
        coreInstances: [],
        componentInstances: [],
    };
}

export function createResourceTable(verbose?: Verbosity, logger?: LogFn): ResourceTable {
    let nextHandle = 1;

    // Resource handle table — handles are globally unique (monotonic counter).
    // Each handle stores the canonical resource type index (the unified type
    // index of the ComponentTypeResource definition). own<T>/borrow<T> both
    // use the same canonical index (their .value field), so per-type isolation
    // is enforced: get/remove/has validate that the requested type matches.
    const handles = new Map<number, { typeIdx: number; obj: unknown; numLends: number }>();

    function getEntry(resourceTypeIdx: number, handle: number) {
        const entry = handles.get(handle);
        if (entry === undefined) throw new Error(`Invalid resource handle: ${handle}`);
        if (entry.typeIdx !== resourceTypeIdx) throw new Error(`Resource handle ${handle} belongs to type ${entry.typeIdx}, not ${resourceTypeIdx}`);
        return entry;
    }

    return {
        add(resourceTypeIdx: number, obj: unknown): number {
            const handle = nextHandle++;
            handles.set(handle, { typeIdx: resourceTypeIdx, obj, numLends: 0 });
            if (isDebug && (verbose?.executor ?? 0) >= LogLevel.Detailed) {
                logger!('executor', LogLevel.Detailed, `resource.add(typeIdx=${resourceTypeIdx}, handle=${handle})`);
            }
            return handle;
        },
        get(resourceTypeIdx: number, handle: number): unknown {
            const entry = getEntry(resourceTypeIdx, handle);
            if (isDebug && (verbose?.executor ?? 0) >= LogLevel.Detailed) {
                logger!('executor', LogLevel.Detailed, `resource.get(typeIdx=${resourceTypeIdx}, handle=${handle})`);
            }
            return entry.obj;
        },
        remove(resourceTypeIdx: number, handle: number): unknown {
            const entry = getEntry(resourceTypeIdx, handle);
            if (entry.numLends !== 0) throw new Error(`Cannot drop resource handle ${handle}: ${entry.numLends} outstanding borrow(s)`);
            handles.delete(handle);
            if (isDebug && (verbose?.executor ?? 0) >= LogLevel.Detailed) {
                logger!('executor', LogLevel.Detailed, `resource.remove(typeIdx=${resourceTypeIdx}, handle=${handle})`);
            }
            return entry.obj;
        },
        has(resourceTypeIdx: number, handle: number): boolean {
            const entry = handles.get(handle);
            return entry !== undefined && entry.typeIdx === resourceTypeIdx;
        },
        lend(resourceTypeIdx: number, handle: number): void {
            const entry = getEntry(resourceTypeIdx, handle);
            entry.numLends++;
            if (isDebug && (verbose?.executor ?? 0) >= LogLevel.Detailed) {
                logger!('executor', LogLevel.Detailed, `resource.lend(typeIdx=${resourceTypeIdx}, handle=${handle}, numLends=${entry.numLends})`);
            }
        },
        unlend(resourceTypeIdx: number, handle: number): void {
            const entry = getEntry(resourceTypeIdx, handle);
            if (entry.numLends <= 0) throw new Error(`Cannot unlend resource handle ${handle}: no outstanding borrows`);
            entry.numLends--;
            if (isDebug && (verbose?.executor ?? 0) >= LogLevel.Detailed) {
                logger!('executor', LogLevel.Detailed, `resource.unlend(typeIdx=${resourceTypeIdx}, handle=${handle}, numLends=${entry.numLends})`);
            }
        },
        lendCount(resourceTypeIdx: number, handle: number): number {
            const entry = getEntry(resourceTypeIdx, handle);
            return entry.numLends;
        }
    };
}

function notYetImplemented(name: string): never {
    throw new Error(`${name} is not yet implemented`);
}

// --- Stream/Future status codes per canonical ABI ---
const STREAM_STATUS_COMPLETED = 0;
const STREAM_STATUS_DROPPED = 1;
const STREAM_BLOCKED = 0xFFFFFFFF;

type StreamEntry = {
    chunks: Uint8Array[];
    closed: boolean;
    /** Resolve function when an async reader is waiting for data/close. */
    waitingReader?: (chunk: Uint8Array | null) => void;
    /** Callbacks to invoke when data arrives or stream closes (for waitable-set integration). */
    onReady?: (() => void)[];
    /** Deferred read: guest buffer awaiting data after stream.read returned BLOCKED. */
    pendingRead?: { ptr: number, len: number };
};

function createStreamTable(memory: MemoryView, allocHandle: () => number): StreamTable {
    // Handle numbering: even = readable, odd = writable. Base = handle & ~1.
    const entries = new Map<number, StreamEntry>();
    const jsReadables = new Map<number, unknown>();
    const jsWritables = new Map<number, unknown>();

    function baseHandle(handle: number): number { return handle & ~1; }

    /** Signal that data arrived or stream closed — notify waitable-set watchers. */
    function signalReady(entry: StreamEntry): void {
        if (entry.onReady) {
            for (const cb of entry.onReady) cb();
        }
    }

    /** Pump an async iterable into a stream entry's buffer in the background. */
    function pumpIterable(iterable: AsyncIterable<Uint8Array>, entry: StreamEntry): void {
        const iter = iterable[Symbol.asyncIterator]();
        function pump(): void {
            iter.next().then((result) => {
                if (result.done) {
                    entry.closed = true;
                    if (entry.waitingReader) {
                        entry.waitingReader(null);
                    }
                    signalReady(entry);
                } else {
                    if (entry.waitingReader) {
                        entry.waitingReader(result.value);
                    } else {
                        entry.chunks.push(result.value);
                    }
                    signalReady(entry);
                    pump(); // continue pumping
                }
            }, () => {
                // Error in iterable — close the stream
                entry.closed = true;
                if (entry.waitingReader) {
                    entry.waitingReader(null);
                }
                signalReady(entry);
            });
        }
        pump();
    }

    /** Build an async-iterable backed by the stream entry's internal buffer. */
    function makeAsyncIterable(entry: StreamEntry): AsyncIterable<Uint8Array> {
        return {
            [Symbol.asyncIterator]() {
                return {
                    next(): Promise<IteratorResult<Uint8Array>> {
                        if (entry.chunks.length > 0) {
                            return Promise.resolve({ value: entry.chunks.shift()!, done: false });
                        }
                        if (entry.closed) {
                            return Promise.resolve({ value: undefined as any, done: true });
                        }
                        return new Promise<IteratorResult<Uint8Array>>((resolve) => {
                            entry.waitingReader = (chunk) => {
                                entry.waitingReader = undefined;
                                if (chunk === null) {
                                    resolve({ value: undefined as any, done: true });
                                } else {
                                    resolve({ value: chunk, done: false });
                                }
                            };
                        });
                    },
                };
            },
        };
    }

    return {
        newStream(_typeIdx: number): bigint {
            const readHandle = allocHandle();
            const writHandle = readHandle + 1;
            entries.set(readHandle, { chunks: [], closed: false });
            return BigInt(writHandle) << 32n | BigInt(readHandle);
        },

        read(_typeIdx: number, handle: number, ptr: number, len: number): number {
            const base = baseHandle(handle);
            const entry = entries.get(base);
            if (!entry) return (0 << 4) | STREAM_STATUS_DROPPED;
            // Copy available data into WASM linear memory
            let offset = 0;
            while (entry.chunks.length > 0 && offset < len) {
                const chunk = entry.chunks[0]!;
                const needed = len - offset;
                if (chunk.length <= needed) {
                    memory.getViewU8(ptr + offset, chunk.length).set(chunk);
                    offset += chunk.length;
                    entry.chunks.shift();
                } else {
                    memory.getViewU8(ptr + offset, needed).set(chunk.subarray(0, needed));
                    offset += needed;
                    entry.chunks[0] = chunk.subarray(needed);
                }
            }
            if (offset > 0) {
                return (offset << 4) | STREAM_STATUS_COMPLETED;
            }
            if (entry.closed) return (0 << 4) | STREAM_STATUS_DROPPED;
            entry.pendingRead = { ptr, len };
            return STREAM_BLOCKED;
        },

        write(_typeIdx: number, handle: number, ptr: number, len: number): number {
            const base = baseHandle(handle);
            const entry = entries.get(base);
            if (!entry) return (0 << 4) | STREAM_STATUS_DROPPED;
            if (len > 0) {
                // Copy data from WASM linear memory
                const src = memory.getViewU8(ptr, len);
                const copy = new Uint8Array(src);
                if (entry.waitingReader) {
                    entry.waitingReader(copy);
                } else {
                    entry.chunks.push(copy);
                }
            }
            return (len << 4) | STREAM_STATUS_COMPLETED;
        },

        cancelRead(_typeIdx: number, _handle: number): number {
            return (0 << 4) | STREAM_STATUS_COMPLETED;
        },

        cancelWrite(_typeIdx: number, _handle: number): number {
            return (0 << 4) | STREAM_STATUS_COMPLETED;
        },

        dropReadable(_typeIdx: number, handle: number): void {
            const base = baseHandle(handle);
            jsReadables.delete(handle);
            const entry = entries.get(base);
            if (entry) entry.closed = true;
        },

        dropWritable(_typeIdx: number, handle: number): void {
            const base = baseHandle(handle);
            jsWritables.delete(handle);
            const entry = entries.get(base);
            if (entry) {
                entry.closed = true;
                if (entry.waitingReader) {
                    entry.waitingReader(null);
                }
            }
        },

        addReadable(_typeIdx: number, value: unknown): number {
            const readHandle = allocHandle();
            const entry: StreamEntry = { chunks: [], closed: false };
            entries.set(readHandle, entry);
            jsReadables.set(readHandle, value);
            // If the value is an async iterable, pump it into the buffer
            if (value && typeof (value as any)[Symbol.asyncIterator] === 'function') {
                pumpIterable(value as AsyncIterable<Uint8Array>, entry);
            }
            return readHandle;
        },
        getReadable(_typeIdx: number, handle: number): unknown {
            return jsReadables.get(handle);
        },
        removeReadable(_typeIdx: number, handle: number): unknown {
            const val = jsReadables.get(handle);
            if (val) {
                jsReadables.delete(handle);
                return val;
            }
            // For stream.new()-created handles, create an async iterable from the buffer
            const base = baseHandle(handle);
            const entry = entries.get(base);
            if (entry) return makeAsyncIterable(entry);
            return undefined;
        },
        addWritable(_typeIdx: number, value: unknown): number {
            const writHandle = allocHandle() + 1;
            entries.set(writHandle & ~1, { chunks: [], closed: false });
            jsWritables.set(writHandle, value);
            return writHandle;
        },
        getWritable(_typeIdx: number, handle: number): unknown {
            return jsWritables.get(handle);
        },
        removeWritable(_typeIdx: number, handle: number): unknown {
            const val = jsWritables.get(handle);
            jsWritables.delete(handle);
            return val;
        },

        hasStream(baseHandle: number): boolean {
            return entries.has(baseHandle);
        },

        hasData(baseHandle: number): boolean {
            const entry = entries.get(baseHandle);
            if (!entry) return false;
            return entry.chunks.length > 0 || entry.closed;
        },

        onReady(baseHandle: number, callback: () => void): void {
            const entry = entries.get(baseHandle);
            if (!entry) return;
            if (entry.chunks.length > 0 || entry.closed) {
                callback();
                return;
            }
            if (!entry.onReady) entry.onReady = [];
            entry.onReady.push(callback);
        },

        fulfillPendingRead(handle: number): number {
            const base = baseHandle(handle);
            const entry = entries.get(base);
            if (!entry || !entry.pendingRead) return (0 << 4) | STREAM_STATUS_COMPLETED;
            const { ptr, len } = entry.pendingRead;
            entry.pendingRead = undefined;
            // Copy available data into the guest's deferred buffer
            let offset = 0;
            while (entry.chunks.length > 0 && offset < len) {
                const chunk = entry.chunks[0]!;
                const needed = len - offset;
                if (chunk.length <= needed) {
                    memory.getViewU8(ptr + offset, chunk.length).set(chunk);
                    offset += chunk.length;
                    entry.chunks.shift();
                } else {
                    memory.getViewU8(ptr + offset, needed).set(chunk.subarray(0, needed));
                    offset += needed;
                    entry.chunks[0] = chunk.subarray(needed);
                }
            }
            if (offset > 0) {
                return (offset << 4) | STREAM_STATUS_COMPLETED;
            }
            if (entry.closed) return (0 << 4) | STREAM_STATUS_DROPPED;
            return (0 << 4) | STREAM_STATUS_COMPLETED;
        },
    };
}

type FutureEntry = {
    resolved: boolean;
    /** Whether the Promise was rejected (error case). */
    rejected?: boolean;
    /** Stored bytes from future.write, copied back on future.read. */
    data?: Uint8Array;
    /** Resolved JS value from the Promise (for storer-based encoding). */
    resolvedValue?: unknown;
    /** Storer callback to encode resolved value into WASM memory. */
    storer?: FutureStorer;
    /** Pending read: ptr and bctx saved when future.read returns BLOCKED. */
    pendingRead?: { ptr: number, bctx: BindingContext };
    /** Callbacks to invoke when this future resolves (for waitable-set integration). */
    onResolve?: (() => void)[];
};

function createFutureTable(memory: MemoryView, allocHandle: () => number): FutureTable {
    const entries = new Map<number, FutureEntry>();
    const jsReadables = new Map<number, unknown>();
    const jsWritables = new Map<number, unknown>();

    function resolveEntry(base: number, entry: FutureEntry): void {
        entry.resolved = true;
        // If there's a pending read, write the resolved value to guest memory now
        if (entry.pendingRead && entry.storer) {
            entry.storer(entry.pendingRead.bctx, entry.pendingRead.ptr, entry.resolvedValue, entry.rejected);
            entry.pendingRead = undefined;
        }
        if (entry.onResolve) {
            for (const cb of entry.onResolve) cb();
            entry.onResolve = undefined;
        }
    }

    return {
        newFuture(_typeIdx: number): bigint {
            const readHandle = allocHandle();
            const writHandle = readHandle + 1;
            entries.set(readHandle, { resolved: false });
            return BigInt(writHandle) << 32n | BigInt(readHandle);
        },

        read(_typeIdx: number, handle: number, ptr: number, bctx?: BindingContext): number {
            const base = handle & ~1;
            const entry = entries.get(base);
            if (!entry) return (0 << 4) | STREAM_STATUS_DROPPED;
            if (!entry.resolved) {
                // Save the target pointer and context for deferred writing.
                // When the Promise resolves, resolveEntry will write data to this ptr.
                if (bctx && entry.storer) {
                    entry.pendingRead = { ptr, bctx };
                }
                return STREAM_BLOCKED;
            }
            // Already resolved — write immediately
            if (entry.storer && bctx) {
                entry.storer(bctx, ptr, entry.resolvedValue, entry.rejected);
            } else if (entry.data && entry.data.length > 0) {
                // Fallback: copy stored raw bytes
                memory.getViewU8(ptr, entry.data.length).set(entry.data);
            }
            return (0 << 4) | STREAM_STATUS_COMPLETED;
        },

        write(_typeIdx: number, handle: number, ptr: number): number {
            const base = handle & ~1;
            const entry = entries.get(base);
            if (!entry) return (0 << 4) | STREAM_STATUS_DROPPED;
            // For now, store a reasonable amount of bytes from WASM memory.
            // The exact size depends on the type T, but we store a safe maximum
            // and let future.read copy them back.
            if (ptr !== 0) {
                // Store up to 256 bytes (generous for most future types)
                const copyLen = Math.min(256, memory.getMemory().buffer.byteLength - ptr);
                if (copyLen > 0) {
                    entry.data = new Uint8Array(memory.getViewU8(ptr, copyLen));
                }
            }
            resolveEntry(base, entry);
            return (0 << 4) | STREAM_STATUS_COMPLETED;
        },

        cancelRead(_typeIdx: number, _handle: number): number {
            return (0 << 4) | STREAM_STATUS_COMPLETED;
        },

        cancelWrite(_typeIdx: number, _handle: number): number {
            return (0 << 4) | STREAM_STATUS_COMPLETED;
        },

        dropReadable(_typeIdx: number, handle: number): void {
            jsReadables.delete(handle);
        },

        dropWritable(_typeIdx: number, handle: number): void {
            jsWritables.delete(handle);
            const base = handle & ~1;
            const entry = entries.get(base);
            if (entry && !entry.resolved) {
                resolveEntry(base, entry);
            }
        },

        addReadable(_typeIdx: number, value: unknown, storer?: FutureStorer): number {
            const readHandle = allocHandle();
            const entry: FutureEntry = { resolved: false, storer };
            entries.set(readHandle, entry);
            jsReadables.set(readHandle, value);
            // If the value is a Promise, track its resolution and capture the resolved value
            if (value && typeof (value as any).then === 'function') {
                (value as Promise<unknown>).then(
                    (resolvedValue) => {
                        entry.resolvedValue = resolvedValue;
                        resolveEntry(readHandle, entry);
                    },
                    (rejectedValue) => {
                        entry.resolvedValue = rejectedValue;
                        entry.rejected = true;
                        resolveEntry(readHandle, entry);
                    },
                );
            } else {
                // Non-Promise values are immediately resolved
                entry.resolvedValue = value;
                entry.resolved = true;
            }
            return readHandle;
        },
        getReadable(_typeIdx: number, handle: number): unknown {
            return jsReadables.get(handle);
        },
        removeReadable(_typeIdx: number, handle: number): unknown {
            const val = jsReadables.get(handle);
            jsReadables.delete(handle);
            return val;
        },
        addWritable(_typeIdx: number, value: unknown): number {
            const writHandle = allocHandle() + 1;
            entries.set(writHandle & ~1, { resolved: false });
            jsWritables.set(writHandle, value);
            return writHandle;
        },
        getWritable(_typeIdx: number, handle: number): unknown {
            return jsWritables.get(handle);
        },
        removeWritable(_typeIdx: number, handle: number): unknown {
            const val = jsWritables.get(handle);
            jsWritables.delete(handle);
            return val;
        },
        getEntry(handle: number): FutureEntry | undefined {
            const base = handle & ~1;
            return entries.get(base);
        },
    };
}

function createErrorContextTable(): ErrorContextTable {
    return {
        newErrorContext() { return notYetImplemented('error-context.new'); },
        debugMessage() { notYetImplemented('error-context.debug-message'); },
        drop() { notYetImplemented('error-context.drop'); },
        add() { return notYetImplemented('error-context.add'); },
        get() { return notYetImplemented('error-context.get'); },
        remove() { return notYetImplemented('error-context.remove'); },
    };
}

function createSubtaskTable(allocHandle: () => number): SubtaskTable {
    const entries = new Map<number, SubtaskEntry>();

    return {
        create(promise: Promise<unknown>): number {
            const handle = allocHandle();
            const entry: SubtaskEntry = {
                state: SubtaskState.STARTED,
                resolved: false,
            };
            entries.set(handle, entry);

            promise.then(
                () => {
                    entry.state = SubtaskState.RETURNED;
                    entry.resolved = true;
                    if (entry.onResolve) {
                        for (const cb of entry.onResolve) cb();
                        entry.onResolve = undefined;
                    }
                },
                () => {
                    entry.state = SubtaskState.RETURNED;
                    entry.resolved = true;
                    if (entry.onResolve) {
                        for (const cb of entry.onResolve) cb();
                        entry.onResolve = undefined;
                    }
                }
            );

            return handle;
        },

        getEntry(handle: number): SubtaskEntry | undefined {
            return entries.get(handle);
        },

        drop(handle: number): void {
            entries.delete(handle);
        },
    };
}

// Event codes for waitable-set events: (event_code, payload1, payload2)
const _EVENT_STREAM_READ = 2;
const _EVENT_STREAM_WRITE = 3;
const EVENT_FUTURE_READ = 4;
const EVENT_FUTURE_WRITE = 5;
const EVENT_SUBTASK = 1;

function createWaitableSetTable(memory: MemoryView, streamTable: StreamTable, futureTable: FutureTable, subtaskTable: SubtaskTable): WaitableSetTable {
    let nextSetId = 1; // Must start at 1 — WASM uses NonZeroU32
    // Each set tracks which handles are joined and pending operations
    const sets = new Map<number, Set<number>>();
    // Map handle → { eventCode, resolve callback }
    const pendingWaitables = new Map<number, { eventCode: number, ready: boolean, resolvers: (() => void)[] }>();

    return {
        newSet(): number {
            const id = nextSetId++;
            sets.set(id, new Set());
            return id;
        },

        wait(setId: number, ptr: number): number | Promise<number> {
            const set = sets.get(setId);
            if (!set) return 0;

            // Check for already-ready events
            const readyEvents: { eventCode: number, handle: number, returnCode: number }[] = [];
            for (const handle of set) {
                const waitable = pendingWaitables.get(handle);
                if (waitable && waitable.ready) {
                    readyEvents.push({
                        eventCode: waitable.eventCode,
                        handle,
                        returnCode: returnCodeFor(handle, waitable.eventCode),
                    });
                    waitable.ready = false;
                }
            }
            if (readyEvents.length > 0) {
                return writeEvents(ptr, readyEvents);
            }

            // No events ready — return a Promise that resolves when one becomes ready
            return new Promise<number>((resolve) => {
                let settled = false;
                for (const handle of set) {
                    const waitable = pendingWaitables.get(handle);
                    if (waitable) {
                        waitable.resolvers.push(() => {
                            if (settled) return;
                            settled = true;
                            // Re-check and write events
                            const events: { eventCode: number, handle: number, returnCode: number }[] = [];
                            for (const h of set) {
                                const w = pendingWaitables.get(h);
                                if (w && w.ready) {
                                    events.push({
                                        eventCode: w.eventCode,
                                        handle: h,
                                        returnCode: returnCodeFor(h, w.eventCode),
                                    });
                                    w.ready = false;
                                }
                            }
                            resolve(writeEvents(ptr, events));
                        });
                    }
                }
            });
        },

        poll(setId: number, ptr: number): number {
            const set = sets.get(setId);
            if (!set) return 0;

            const readyEvents: { eventCode: number, handle: number, returnCode: number }[] = [];
            for (const handle of set) {
                const waitable = pendingWaitables.get(handle);
                if (waitable && waitable.ready) {
                    readyEvents.push({
                        eventCode: waitable.eventCode,
                        handle,
                        returnCode: returnCodeFor(handle, waitable.eventCode),
                    });
                    waitable.ready = false;
                }
            }
            return writeEvents(ptr, readyEvents);
        },

        drop(setId: number): void {
            const set = sets.get(setId);
            if (set) {
                for (const handle of set) {
                    pendingWaitables.delete(handle);
                }
                sets.delete(setId);
            }
        },

        join(waitableHandle: number, setId: number): void {
            // setId=0 means "disjoin" — remove handle from any set
            if (setId === 0) {
                for (const [, s] of sets) {
                    s.delete(waitableHandle);
                }
                pendingWaitables.delete(waitableHandle);
                return;
            }
            const set = sets.get(setId);
            if (!set) return;
            set.add(waitableHandle);
            // Register this handle as a pending waitable
            if (!pendingWaitables.has(waitableHandle)) {
                // Check subtask table first (subtask handles use even allocations)
                const subtaskEntry = subtaskTable.getEntry(waitableHandle);

                // Determine event type based on handle parity:
                // Even handles are readable, odd are writable
                const isWritable = (waitableHandle & 1) !== 0;

                // Check both stream and future tables to determine the event type
                // and wire up readiness tracking. Handles are unique across tables
                // thanks to the shared allocator.
                const futureEntry = !subtaskEntry ? futureTable.getEntry(waitableHandle & ~1) : undefined;
                const isStream = !subtaskEntry && !futureEntry && streamTable.hasStream(waitableHandle & ~1);

                let eventCode: number;
                if (subtaskEntry) {
                    eventCode = EVENT_SUBTASK;
                } else if (isStream) {
                    eventCode = isWritable ? _EVENT_STREAM_WRITE : _EVENT_STREAM_READ;
                } else {
                    eventCode = isWritable ? EVENT_FUTURE_WRITE : EVENT_FUTURE_READ;
                }

                const entry: { eventCode: number, ready: boolean, resolvers: (() => void)[] } = {
                    eventCode,
                    ready: false,
                    resolvers: [],
                };
                pendingWaitables.set(waitableHandle, entry);

                // Wire up readiness tracking based on the table type
                if (subtaskEntry) {
                    if (!subtaskEntry.resolved) {
                        if (!subtaskEntry.onResolve) subtaskEntry.onResolve = [];
                        subtaskEntry.onResolve.push(() => {
                            entry.ready = true;
                            for (const cb of entry.resolvers) cb();
                        });
                    } else {
                        entry.ready = true;
                    }
                } else if (futureEntry) {
                    if (!futureEntry.resolved) {
                        if (!futureEntry.onResolve) futureEntry.onResolve = [];
                        futureEntry.onResolve.push(() => {
                            entry.ready = true;
                            for (const cb of entry.resolvers) cb();
                        });
                    } else {
                        entry.ready = true;
                    }
                } else if (isStream) {
                    // Wire up async readiness for streams
                    const streamReady = streamTable.hasData(waitableHandle & ~1);
                    if (streamReady) {
                        entry.ready = true;
                    } else {
                        streamTable.onReady(waitableHandle & ~1, () => {
                            entry.ready = true;
                            for (const cb of entry.resolvers) cb();
                        });
                    }
                }
            }
        },
    };

    function writeEvents(ptr: number, events: { eventCode: number, handle: number, returnCode: number }[]): number {
        if (events.length === 0) return 0;
        const view = memory.getView(ptr, events.length * 12);
        for (let i = 0; i < events.length; i++) {
            const e = events[i]!;
            view.setInt32(i * 12, e.eventCode, true);
            view.setInt32(i * 12 + 4, e.handle, true);
            view.setInt32(i * 12 + 8, e.returnCode, true);
        }
        return events.length;
    }

    function returnCodeFor(handle: number, eventCode: number): number {
        if (eventCode === EVENT_SUBTASK) {
            const se = subtaskTable.getEntry(handle);
            return se ? se.state : 0;
        }
        if (eventCode === _EVENT_STREAM_READ) {
            return streamTable.fulfillPendingRead(handle);
        }
        return (0 << 4) | STREAM_STATUS_COMPLETED;
    }
}

export function createBindingContext(componentImports: JsImports, resolved: ResolvedContext): BindingContext {
    const memory = createMemoryView();
    const allocator = createAllocator();
    const instances = createInstanceTable();
    const resources = createResourceTable(resolved.verbose, resolved.logger);

    // Shared handle allocator: all stream/future handles come from a single
    // counter so they never overlap. This is required by the canonical ABI
    // where stream and future handles share a single "waitables" table.
    // Must start at 2 (first even > 0) — WASM uses NonZeroU32 for handles.
    let sharedNextHandle = 2;
    function allocHandle(): number {
        const h = sharedNextHandle;
        sharedNextHandle += 2; // even = readable, odd = writable
        return h;
    }

    const streamTable = createStreamTable(memory, allocHandle);
    const futureTable = createFutureTable(memory, allocHandle);
    const subtaskTable = createSubtaskTable(allocHandle);

    const ctx: BindingContext = {
        componentImports,
        instances,
        memory,
        allocator,
        resources,
        streams: streamTable,
        futures: futureTable,
        subtasks: subtaskTable,
        errorContexts: createErrorContextTable(),
        waitableSets: createWaitableSetTable(memory, streamTable, futureTable, subtaskTable),
        utf8Decoder: new TextDecoder('utf-8', { fatal: true }),
        utf8Encoder: new TextEncoder(),
        verbose: resolved.verbose,
        logger: resolved.logger,
        taskContextSlots: [0, 0],
        backpressure: 0,
        abort: () => {
            // Per Component Model spec: poisoning the instance prevents all future
            // export calls from executing. checkNotPoisoned() in the lifting
            // trampoline enforces this.
            ctx.poisoned = true;
        },
    };
    if (isDebug) {
        ctx.debugStack = [];
    }
    return ctx;
}

export function bucketByTag(rctx: ResolverContext, tag: ModelTag, read: boolean, kind?: ComponentExternalKind | ExternalKind): TaggedElement[] {
    switch (tag) {
        case ModelTag.CoreModule:
            return rctx.indexes.coreModules;
        case ModelTag.ComponentExport:
            return rctx.indexes.componentExports;
        case ModelTag.ComponentImport:
            return rctx.indexes.componentImports;
        case ModelTag.ComponentAliasCoreInstanceExport: {
            switch (kind) {
                case ExternalKind.Func:
                    return rctx.indexes.coreFunctions;
                case ExternalKind.Table:
                    return rctx.indexes.coreTables;
                case ExternalKind.Memory:
                    return rctx.indexes.coreMemories;
                case ExternalKind.Global:
                    return rctx.indexes.coreGlobals;
                case ExternalKind.Tag:
                default:
                    throw new Error(`unexpected section tag: ${kind}`);
            }
            break;
        }
        case ModelTag.ComponentAliasInstanceExport: {
            switch (kind) {
                case ComponentExternalKind.Func:
                    return rctx.indexes.componentFunctions;
                case ComponentExternalKind.Component:
                    return rctx.indexes.componentTypes;
                case ComponentExternalKind.Type:
                    return rctx.indexes.componentTypes;
                case ComponentExternalKind.Instance:
                    return rctx.indexes.componentInstances;
                case ComponentExternalKind.Module:
                case ComponentExternalKind.Value:
                default:
                    throw new Error(`unexpected section tag: ${kind}`);
            }
        }
        case ModelTag.CoreInstanceFromExports:
        case ModelTag.CoreInstanceInstantiate:
            return rctx.indexes.coreInstances;
        case ModelTag.ComponentInstanceFromExports:
        case ModelTag.ComponentInstanceInstantiate:
            return rctx.indexes.componentInstances;
        case ModelTag.ComponentTypeFunc:
            return rctx.indexes.componentTypes;
        case ModelTag.ComponentSection:
            return read
                ? rctx.indexes.componentTypes
                : rctx.indexes.componentSections;//append later
        case ModelTag.ComponentTypeDefinedBorrow:
        case ModelTag.ComponentTypeDefinedEnum:
        case ModelTag.ComponentTypeDefinedErrorContext:
        case ModelTag.ComponentTypeDefinedFlags:
        case ModelTag.ComponentTypeDefinedFuture:
        case ModelTag.ComponentTypeDefinedList:
        case ModelTag.ComponentTypeDefinedOption:
        case ModelTag.ComponentTypeDefinedOwn:
        case ModelTag.ComponentTypeDefinedPrimitive:
        case ModelTag.ComponentTypeDefinedRecord:
        case ModelTag.ComponentTypeDefinedResult:
        case ModelTag.ComponentTypeDefinedStream:
        case ModelTag.ComponentTypeDefinedTuple:
        case ModelTag.ComponentTypeDefinedVariant:
            return rctx.indexes.componentTypes;
        case ModelTag.ComponentTypeInstance:
            return rctx.indexes.componentTypes;
        case ModelTag.ComponentTypeResource:
            // Resource types participate in the unified TYPE sort (section 7).
            // own<T>/borrow<T> reference resources by type index in this unified space.
            // componentTypeResource is populated separately at the call site.
            return rctx.indexes.componentTypes;
        case ModelTag.CanonicalFunctionLower: {
            return rctx.indexes.coreFunctions;
        }
        case ModelTag.CanonicalFunctionLift: {
            return rctx.indexes.componentFunctions;
        }

        case ModelTag.SkippedSection:
        case ModelTag.CustomSection:
            return [];//drop
        case ModelTag.ComponentAliasOuter: {
            // Outer aliases go to the bucket matching their outer alias kind
            switch (kind as unknown as ComponentOuterAliasKind) {
                case ComponentOuterAliasKind.Type:
                    return rctx.indexes.componentTypes;
                case ComponentOuterAliasKind.CoreModule:
                    return rctx.indexes.coreModules;
                case ComponentOuterAliasKind.CoreType:
                    return rctx.indexes.componentTypes;// core types share the type index
                case ComponentOuterAliasKind.Component:
                    return rctx.indexes.componentTypes;
                default:
                    throw new Error(`unexpected outer alias kind: ${kind}`);
            }
        }
        case ModelTag.CanonicalFunctionResourceDrop:
        case ModelTag.CanonicalFunctionResourceNew:
        case ModelTag.CanonicalFunctionResourceRep:
        case ModelTag.CanonicalFunctionBackpressureSet:
        case ModelTag.CanonicalFunctionBackpressureInc:
        case ModelTag.CanonicalFunctionBackpressureDec:
        case ModelTag.CanonicalFunctionTaskReturn:
        case ModelTag.CanonicalFunctionTaskCancel:
        case ModelTag.CanonicalFunctionContextGet:
        case ModelTag.CanonicalFunctionContextSet:
        case ModelTag.CanonicalFunctionThreadYield:
        case ModelTag.CanonicalFunctionSubtaskCancel:
        case ModelTag.CanonicalFunctionSubtaskDrop:
        case ModelTag.CanonicalFunctionStreamNew:
        case ModelTag.CanonicalFunctionStreamRead:
        case ModelTag.CanonicalFunctionStreamWrite:
        case ModelTag.CanonicalFunctionStreamCancelRead:
        case ModelTag.CanonicalFunctionStreamCancelWrite:
        case ModelTag.CanonicalFunctionStreamDropReadable:
        case ModelTag.CanonicalFunctionStreamDropWritable:
        case ModelTag.CanonicalFunctionFutureNew:
        case ModelTag.CanonicalFunctionFutureRead:
        case ModelTag.CanonicalFunctionFutureWrite:
        case ModelTag.CanonicalFunctionFutureCancelRead:
        case ModelTag.CanonicalFunctionFutureCancelWrite:
        case ModelTag.CanonicalFunctionFutureDropReadable:
        case ModelTag.CanonicalFunctionFutureDropWritable:
        case ModelTag.CanonicalFunctionErrorContextNew:
        case ModelTag.CanonicalFunctionErrorContextDebugMessage:
        case ModelTag.CanonicalFunctionErrorContextDrop:
        case ModelTag.CanonicalFunctionWaitableSetNew:
        case ModelTag.CanonicalFunctionWaitableSetWait:
        case ModelTag.CanonicalFunctionWaitableSetPoll:
        case ModelTag.CanonicalFunctionWaitableSetDrop:
        case ModelTag.CanonicalFunctionWaitableJoin:
            return rctx.indexes.coreFunctions;
        default:
            throw new Error(`unexpected section tag: ${tag}`);
    }
}

export function elementByIndex<TTag extends ModelTag, TResult extends { tag: TTag, kind?: ComponentExternalKind | ExternalKind }>(rctx: ResolverContext, template: TResult, index: number): TResult {
    const bucket = bucketByTag(rctx, template.tag, true, template.kind);
    return bucket[index] as TResult;
}
