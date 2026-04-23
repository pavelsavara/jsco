// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { TCabiRealloc, WasmPointer, WasmSize, MarshalingContext } from '../../marshal/model/types';
import type { BinderRes } from '../../resolver/model/types';

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
    /** Dispose host-owned resources: call destructors for entries whose typeIdx is in the set, then delete them. */
    disposeOwned(ownTypeIds: Set<number>): void;
}

export type InstanceTable = {
    coreInstances: BinderRes[];
    componentInstances: BinderRes[];
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
    /** Dispose all streams: close entries, resolve waiting readers, clear maps. */
    dispose(): void;
}

export type StreamEntry = {
    chunks: unknown[];
    closed: boolean;
    /** Resolve function when an async reader is waiting for data/close. */
    waitingReader?: (chunk: unknown | null) => void;
    /** Callbacks to invoke when data arrives or stream closes (for waitable-set integration). */
    onReady?: (() => void)[];
    /** Deferred read: guest buffer awaiting data after stream.read returned BLOCKED. */
    pendingRead?: { ptr: number, len: number };
    /** For typed streams (non-u8): size of one element in WASM memory. */
    elementSize?: number;
    /** For typed streams (non-u8): storer to encode one JS value into WASM memory. */
    elementStorer?: (ctx: MarshalingContext, ptr: number, value: unknown) => void;
    /** For typed streams: the marshaling context needed by elementStorer. */
    mctx?: MarshalingContext;
    /** Total bytes buffered in chunks (for backpressure). */
    bufferedBytes?: number;
    /** Callbacks to invoke when buffer drains below backpressure threshold. */
    onWriteReady?: (() => void)[];
    /** Callback invoked when the readable end is dropped (dropReadable). */
    onReadableDrop?: () => void;
};

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
    /** Dispose all futures: clear onResolve, null pendingRead, clear maps. */
    dispose(): void;
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
    /** Dispose all subtasks: clear onResolve, clear entries. */
    dispose(): void;
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
    /** Dispose all waitable sets: reject pending resolvers, clear maps. */
    dispose(): void;
}

/** Host FS mount point (Node.js only). */
export interface MountConfig {
    /** Path on the host filesystem */
    hostPath: string;
    /** Path visible to the guest component */
    guestPath: string;
    /** If true, writes are rejected */
    readOnly?: boolean;
}

/** Networking limits and timeouts. */
export interface NetworkConfig {
    /** Maximum HTTP body size in bytes (request and response). Default: 2MB */
    maxHttpBodyBytes?: number;
    /** Maximum HTTP headers total size in bytes. Default: 200KB */
    maxHttpHeadersBytes?: number;
    /** Per-connection socket read buffer size in bytes. Default: 200KB */
    socketBufferBytes?: number;
    /** Maximum pending TCP connections (backlog). Default: 500 */
    maxTcpPendingConnections?: number;
    /** TCP idle timeout in milliseconds. Default: 120_000 (2 min) */
    tcpIdleTimeoutMs?: number;
    /** HTTP server request timeout in milliseconds. Default: 30_000 */
    httpRequestTimeoutMs?: number;
    /** Maximum queued UDP datagrams per socket. Default: 1_000 */
    maxUdpDatagrams?: number;
    /** DNS lookup timeout in milliseconds. Default: 5_000 */
    dnsTimeoutMs?: number;
    /** Maximum concurrent DNS lookups. Default: 100 */
    maxConcurrentDnsLookups?: number;
    /** Maximum concurrent HTTP connections. Default: 1_000 */
    maxHttpConnections?: number;
    /** Maximum request URL length in bytes. Default: 8_192 */
    maxRequestUrlBytes?: number;
    /** HTTP server headersTimeout in ms (Slowloris protection). Default: 60_000 */
    httpHeadersTimeoutMs?: number;
    /** HTTP server keepAliveTimeout in ms. Default: 5_000 */
    httpKeepAliveTimeoutMs?: number;
}

export const NETWORK_DEFAULTS = {
    maxHttpBodyBytes: 2_097_152,
    maxHttpHeadersBytes: 204_800,
    socketBufferBytes: 204_800,
    maxTcpPendingConnections: 500,
    tcpIdleTimeoutMs: 120_000,
    httpRequestTimeoutMs: 30_000,
    maxUdpDatagrams: 1_000,
    dnsTimeoutMs: 5_000,
    maxConcurrentDnsLookups: 100,
    maxHttpConnections: 1_000,
    maxRequestUrlBytes: 8_192,
    httpHeadersTimeoutMs: 60_000,
    httpKeepAliveTimeoutMs: 5_000,
} as const;

/** Allocation and size limits. */
export interface AllocationLimits {
    /** Maximum single allocation size in bytes. Default: 16MB */
    maxAllocationSize?: number;
    /** Maximum number of live resource handles per table. Default: 10_000 */
    maxHandles?: number;
    /** Maximum filesystem path length in bytes. Default: 4_096 */
    maxPathLength?: number;
}

export const ALLOCATION_DEFAULTS = {
    maxAllocationSize: 16_777_216,
    maxHandles: 10_000,
    maxPathLength: 4_096,
} as const;

/** WASI-specific host configuration. */
export interface HostConfig {
    /** Environment variables as [key, value] pairs */
    env?: [string, string][];
    /** Command-line arguments */
    args?: string[];
    /** Initial working directory */
    cwd?: string;
    /** Stdin as a web ReadableStream */
    stdin?: ReadableStream<Uint8Array>;
    /** Stdout as a web WritableStream */
    stdout?: WritableStream<Uint8Array>;
    /** Stderr as a web WritableStream */
    stderr?: WritableStream<Uint8Array>;
    /** In-memory VFS files: full unix paths → content (bytes or UTF-8 string) */
    fs?: Map<string, Uint8Array | string>;
    /** Host FS mount points (Node.js only) */
    mounts?: MountConfig[];
    /** Networking limits and timeouts */
    network?: NetworkConfig;
    /** Allocation and size limits */
    limits?: AllocationLimits;
    /**
     * WASI interface prefixes to enable (e.g. ['wasi:cli', 'wasi:http']).
     * Default: all interfaces enabled. When set, only matching prefixes are registered.
     */
    enabledInterfaces?: string[];
}

/** Runtime configuration extending host config with runtime-generic fields. */
export interface RuntimeConfig extends HostConfig {
    /** Stream backpressure threshold in bytes. Default: 65536 (64 KB). */
    streamBackpressureBytes?: number;
}
