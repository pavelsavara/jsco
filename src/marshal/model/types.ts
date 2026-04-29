// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { JsImports } from '../../resolver/model/api-types';
import type { InstanceTable, MemoryView, Allocator, ResourceTable, StreamTable, FutureTable, SubtaskTable, ErrorContextTable, WaitableSetTable } from '../../runtime/model/types';
import type { LogFn, Verbosity } from '../../utils/assert';

export type WasmPointer = number;
export type WasmNumber = number | bigint;
export type WasmSize = number;
export type WasmFunction = Function;
export type WasmValue = WasmPointer | WasmSize | WasmNumber;
export type JsFunction = Function;
export type JsString = string;
export type JsBoolean = boolean;
export type JsNumber = number | bigint;
export type JsValue = JsNumber | JsString | JsBoolean | any;

export type MemoryStorer = (ctx: MarshalingContext, ptr: number, jsValue: JsValue) => void;

export type FnLoweringCallToJs = (ctx: MarshalingContext, jsExport: JsFunction) => WasmFunction;
export type FnLiftingCallFromJs = (ctx: MarshalingContext, wasmFunction: WasmFunction) => JsFunction;

export type LoweringToJs = (ctx: MarshalingContext, ...args: WasmValue[]) => JsValue;
export type LiftingFromJs = (ctx: MarshalingContext, srcJsValue: JsValue, out: WasmValue[], offset: number) => number;

export type TCabiRealloc = (oldPtr: WasmPointer, oldSize: WasmSize, align: WasmSize, newSize: WasmSize) => WasmPointer;

export type MarshalingContext = {
    componentImports: JsImports;
    instances: InstanceTable;
    memory: MemoryView;
    allocator: Allocator;
    resources: ResourceTable;
    streams: StreamTable;
    futures: FutureTable;
    subtasks: SubtaskTable;
    errorContexts: ErrorContextTable;
    utf8Decoder: TextDecoder;
    utf8Encoder: TextEncoder;
    abort: (reason?: string) => void;
    dispose: () => void;
    abortSignal: AbortSignal;
    debugStack?: string[];
    poisoned?: boolean;
    inExport?: boolean;
    postReturnFn?: Function;
    verbose?: Verbosity;
    logger?: LogFn;
    waitableSets: WaitableSetTable;
    /** Per-task `context.{get,set}` TLS (canonical ABI). Swapped at every wasm
     *  boundary so reentrant concurrent async exports stay isolated.
     *  Default `[0, 0]` when no task is active. */
    currentTaskSlots: number[];
    /** Backpressure counter for async component model flow control. */
    backpressure: number;
    /** Background tasks from sync canon.lower with stream/future params (fire-and-forget). */
    pendingBackgroundTasks: Promise<unknown>[];
    /** Counter incremented on each call to a throttled canon built-in; reset when a yield is forced. */
    opsSinceYield?: number;
    /** Per-instance linear-memory cap (bytes). 0/undefined disables. */
    maxMemoryBytes?: number;
    /** Canon-op counter; reset on JSPI yield (host-import resume, `waitable-set.wait`
     *  resume, throttle setImmediate). Trips `maxCanonOpsWithoutYield`. */
    canonOpsSinceYield?: number;
    /** Cap for `canonOpsSinceYield`. 0/undefined disables. */
    maxCanonOpsWithoutYield?: number;
    /** Cap (ms) per JSPI suspension. 0/undefined disables. */
    maxBlockingTimeMs?: number;
    /** Cap (bytes) host-heap growth between yields; 3 consecutive over-cap
     *  samples abort. 0/undefined disables. */
    maxHeapGrowthPerYield?: number;
    /** Heap-used at last yield (0 = uninitialized). */
    heapAtLastYield?: number;
    /** Consecutive over-cap heap samples. */
    heapGrowthOverCount?: number;
    /** Set by `createAsyncLiftWrapper` while an async export is in flight; the
     *  bound `task.return` invokes this to deliver the lowered result to the
     *  awaiting JS Promise. Re-installed at every wasm boundary. */
    currentTaskReturn?: (jsResult: unknown) => void;
}
