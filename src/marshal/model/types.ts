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
    /** Currently-active task's async context slots (used by context.get/set canonical builtins).
     * Per the canonical ABI, `context.{get,set}` are per-task TLS. To support reentrant
     * concurrent async-lifted exports on a single instance, every export trampoline
     * (sync lift, async lift) and every host-import return path swaps this pointer to
     * the calling task's own array. The default value `[0, 0]` applies when no task is
     * active (idle instance). */
    currentTaskSlots: number[];
    /** Backpressure counter for async component model flow control. */
    backpressure: number;
    /** Background tasks from sync canon.lower with stream/future params (fire-and-forget). */
    pendingBackgroundTasks: Promise<unknown>[];
    /** Counter incremented on each call to a throttled canon built-in; reset when a yield is forced. */
    opsSinceYield?: number;
    /** Per-instance linear-memory cap in bytes. When the WASM grows past this, the next canon op traps. 0/undefined disables the check. */
    maxMemoryBytes?: number;
    /** Counter incremented on every canon built-in invocation; reset on each legitimate JSPI yield (host-import resume, `waitable-set.wait` resume, throttle setImmediate). When it crosses `maxCanonOpsWithoutYield` the next canon op aborts the instance. */
    canonOpsSinceYield?: number;
    /** Cap for `canonOpsSinceYield`. 0/undefined disables the check. */
    maxCanonOpsWithoutYield?: number;
    /** Cap (ms) on any single JSPI suspension. Wired into `waitable-set.wait` resume
     *  and host-import Promise resume in trampoline-lower. 0/undefined disables. */
    maxBlockingTimeMs?: number;
    /** Cap (bytes) on host-process heap growth between two consecutive JSPI yield
     *  resume points. 3 consecutive over-cap samples abort the instance. 0/undefined disables. */
    maxHeapGrowthPerYield?: number;
    /** Heap-used reading captured at the previous yield resume; 0 = uninitialized. */
    heapAtLastYield?: number;
    /** Number of consecutive over-cap heap samples since the last under-cap one. */
    heapGrowthOverCount?: number;
    /** Slot set by `createAsyncLiftWrapper` while an async-lifted export is in flight.
     * The bound `task.return` core function (see `resolveCanonicalFunctionTaskReturn`)
     * lowers its WASM-flat result to JS and invokes this callback to deliver the value
     * to the awaiting JS-side Promise. Cleared on EXIT. Single-slot — sequential async
     * exports only; concurrent on-instance handlers will need a per-task lookup. */
    currentTaskReturn?: (jsResult: unknown) => void;
}
