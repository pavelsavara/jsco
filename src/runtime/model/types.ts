// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

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
    /** True after dropReadable has fired; second drop traps. */
    readableDropped?: boolean;
    /** True after dropWritable has fired; second drop traps. */
    writableDropped?: boolean;
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
    /** Mark subtask RETURNED, fire onResolve, return the new state.
     *  Traps if the handle is unknown. */
    cancel(handle: number): number;
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
    /**
     * Insert a JS-side error value (typically `{ debugMessage: string }` for
     * guest-created contexts or an `Error` instance for host-created ones)
     * and return a fresh i32 handle. Used both by `canon error-context.new`
     * (after the resolver has decoded the debug message from linear memory)
     * and by lifting an `error-context` value across a function call.
     */
    add(value: unknown): number;
    /** Read back a stored value without changing the table. Throws on unknown handle. */
    get(handle: number): unknown;
    /** Drop a handle and return its value. Throws on unknown handle. */
    remove(handle: number): unknown;
    /** Number of live handles (for diagnostics / leak detection in tests). */
    size(): number;
}

export interface WaitableSetTable {
    newSet(): number;
    wait(setId: number, ptr: number): number | Promise<number>;
    /**
     * Like `wait`, but returns events as a JS array instead of writing to
     * linear memory. Used by the callback-form async-lift trampoline, which
     * delivers events directly to the guest's callback as i32 params and so
     * does not need (and may not have) a host-allocated memory buffer.
     */
    waitJs(setId: number): { eventCode: number; handle: number; returnCode: number }[] | Promise<{ eventCode: number; handle: number; returnCode: number }[]>;
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
    /**
     * Maximum aggregate bytes flowing through the HTTP boundary of a single
     * request across a `linkHandler` chain. Counts request body bytes read
     * by `serve()` plus response body bytes written back. Exceeding the cap
     * aborts the response with an error. Default: 16_777_216 (16 MiB).
     * 0 disables.
     */
    maxAggregateInflightBytes?: number;
}

export const NETWORK_DEFAULTS = {
    maxHttpBodyBytes: 2_097_152,
    maxHttpHeadersBytes: 204_800,
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
    maxAggregateInflightBytes: 16_777_216,
} as const;

/** Allocation and size limits. */
export interface AllocationLimits {
    /** Maximum single allocation size in bytes. Default: 16MB */
    maxAllocationSize?: number;
    /** Maximum number of live resource handles per table. Default: 10_000 */
    maxHandles?: number;
    /** Maximum filesystem path length in bytes. Default: 4_096 */
    maxPathLength?: number;
    /**
     * Max WASM linear-memory size (bytes) per instance. Enforced lazily on
     * canon-op transitions: if the guest grew past the cap, the next canon
     * built-in traps. Default: 268_435_456 (256 MB). 0 disables.
     */
    maxMemoryBytes?: number;
    /**
     * Max canonical built-in calls (`stream.*`, `future.*`, `waitable-set.poll`,
     * etc.) between two legitimate JSPI yield points. Mitigates the
     * `stream.read → stream.cancel-read` spin pattern and similar event-loop
     * starvation. Default: 1_000_000. 0 disables.
     */
    maxCanonOpsWithoutYield?: number;
    /**
     * Max ms any single JSPI suspension may block before the instance is
     * aborted with a `WebAssembly.RuntimeError`. Watched at `waitable-set.wait`
     * resume (plan.md E1) and host-import Promise resume.
     * Default 0 (disabled). Recommended for CI: 10_000.
     */
    maxBlockingTimeMs?: number;
    /**
     * Max host-process heap growth (bytes) between two JSPI yield points.
     * Three consecutive over-cap samples abort the instance (filters GC lag).
     * Complements `maxMemoryBytes` by catching host-side state DOS (e.g.
     * socket recv buffers grown inside a yield window).
     *
     * Browser fallback uses `performance.memory.usedJSHeapSize` where exposed;
     * otherwise the watchdog is a no-op. Default 0 (disabled).
     */
    maxHeapGrowthPerYield?: number;
    /**
     * Maximum size in bytes of any single host-side network buffer used by
     * the WASI host adapters. Caps:
     *  - the P2 outbound HTTP body collector (`createOutputStream`)
     *  - the P3→P2 stdout/stderr/file forward (`createOutputStreamFromP3`)
     *  - guest-set TCP/UDP `set-receive-buffer-size` / `set-send-buffer-size`
     *    (calls above the cap trap with `invalid-argument`)
     * Default: 1_048_576 (1 MiB).
     */
    maxNetworkBufferSize?: number;
}

export const LIMIT_DEFAULTS = {
    maxAllocationSize: 16_777_216,
    maxHandles: 10_000,
    maxPathLength: 4_096,
    maxMemoryBytes: 268_435_456,
    maxCanonOpsWithoutYield: 1_000_000,
    maxBlockingTimeMs: 0,
    maxHeapGrowthPerYield: 0,
    maxNetworkBufferSize: 1_048_576,
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
    /** Stream backpressure threshold in bytes (byte streams). Default: 65536 (64 KB). */
    streamBackpressureBytes?: number;
    /** Stream backpressure threshold in chunks (typed/non-byte streams). Default: 1024. */
    streamBackpressureChunks?: number;
}
