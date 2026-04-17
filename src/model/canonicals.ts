// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { u32 } from './core';
import { CoreFuncIndex, ComponentFuncIndex, ComponentTypeIndex } from './indices';
import { IndexedElement, ModelTag } from './tags';
import type { ComponentValType } from './types';

/// Represents options for component functions.
export type CanonicalOption =
    | CanonicalOptionUTF8
    | CanonicalOptionUTF16
    | CanonicalOptionCompactUTF16
    | CanonicalOptionMemory
    | CanonicalOptionRealloc
    | CanonicalOptionPostReturn
    | CanonicalOptionAsync
    | CanonicalOptionCallback

/// The string types in the function signature are UTF-8 encoded.
export type CanonicalOptionUTF8 = {
    tag: ModelTag.CanonicalOptionUTF8
}

/// The string types in the function signature are UTF-16 encoded.
export type CanonicalOptionUTF16 = {
    tag: ModelTag.CanonicalOptionUTF16
}

/// The string types in the function signature are compact UTF-16 encoded.
export type CanonicalOptionCompactUTF16 = {
    tag: ModelTag.CanonicalOptionCompactUTF16
}

/// The memory to use if the lifting or lowering of a function requires memory access.
///
/// The value is an index to a core memory.
export type CanonicalOptionMemory = {
    tag: ModelTag.CanonicalOptionMemory
    value: u32
}
/// The realloc function to use if the lifting or lowering of a function requires memory
/// allocation.
///
/// The value is an index to a core function of type `(func (param i32 i32 i32 i32) (result i32))`.
export type CanonicalOptionRealloc = {
    tag: ModelTag.CanonicalOptionRealloc
    value: u32
}

/// The post-return function to use if the lifting of a function requires
/// cleanup after the function returns.
export type CanonicalOptionPostReturn = {
    tag: ModelTag.CanonicalOptionPostReturn
    value: u32
}

/// The function is async.
export type CanonicalOptionAsync = {
    tag: ModelTag.CanonicalOptionAsync
}

/// The callback function for async operations.
export type CanonicalOptionCallback = {
    tag: ModelTag.CanonicalOptionCallback
    value: u32
}

/// Represents a canonical function in a WebAssembly component.
export type CanonicalFunction =
    | CanonicalFunctionLift // this is component function
    | CanonicalFunctionLower // this is core function
    | CanonicalFunctionResourceNew
    | CanonicalFunctionResourceDrop
    | CanonicalFunctionResourceRep
    | CanonicalFunctionBackpressureSet
    | CanonicalFunctionBackpressureInc
    | CanonicalFunctionBackpressureDec
    | CanonicalFunctionTaskReturn
    | CanonicalFunctionTaskCancel
    | CanonicalFunctionContextGet
    | CanonicalFunctionContextSet
    | CanonicalFunctionThreadYield
    | CanonicalFunctionSubtaskCancel
    | CanonicalFunctionSubtaskDrop
    | CanonicalFunctionStreamNew
    | CanonicalFunctionStreamRead
    | CanonicalFunctionStreamWrite
    | CanonicalFunctionStreamCancelRead
    | CanonicalFunctionStreamCancelWrite
    | CanonicalFunctionStreamDropReadable
    | CanonicalFunctionStreamDropWritable
    | CanonicalFunctionFutureNew
    | CanonicalFunctionFutureRead
    | CanonicalFunctionFutureWrite
    | CanonicalFunctionFutureCancelRead
    | CanonicalFunctionFutureCancelWrite
    | CanonicalFunctionFutureDropReadable
    | CanonicalFunctionFutureDropWritable
    | CanonicalFunctionErrorContextNew
    | CanonicalFunctionErrorContextDebugMessage
    | CanonicalFunctionErrorContextDrop
    | CanonicalFunctionWaitableSetNew
    | CanonicalFunctionWaitableSetWait
    | CanonicalFunctionWaitableSetPoll
    | CanonicalFunctionWaitableSetDrop
    | CanonicalFunctionWaitableJoin

/// The function lifts a core WebAssembly function to the canonical ABI.
export type CanonicalFunctionLift = IndexedElement & {
    tag: ModelTag.CanonicalFunctionLift
    /// The index of the core WebAssembly function to lift.
    core_func_index: CoreFuncIndex,
    /// The index of the lifted function's type.
    type_index: ComponentTypeIndex,
    /// The canonical options for the function.
    options: CanonicalOption[],
}

/// The function lowers a canonical ABI function to a core WebAssembly function.
export type CanonicalFunctionLower = IndexedElement & {
    tag: ModelTag.CanonicalFunctionLower
    /// The index of the function to lower.
    func_index: ComponentFuncIndex,
    /// The canonical options for the function.
    options: CanonicalOption[],
}

/// A function which creates a new owned handle to a resource.
export type CanonicalFunctionResourceNew = IndexedElement & {
    tag: ModelTag.CanonicalFunctionResourceNew
    /// The type index of the resource that's being created.
    resource: u32,
}

/// A function which is used to drop resource handles of the specified type.
export type CanonicalFunctionResourceDrop = IndexedElement & {
    tag: ModelTag.CanonicalFunctionResourceDrop
    /// The type index of the resource that's being dropped.
    resource: u32,
}

/// A function which returns the underlying i32-based representation of the
/// specified resource.
export type CanonicalFunctionResourceRep = IndexedElement & {
    tag: ModelTag.CanonicalFunctionResourceRep
    /// The type index of the resource that's being accessed.
    resource: u32,
}

/// canon backpressure.set
export type CanonicalFunctionBackpressureSet = IndexedElement & {
    tag: ModelTag.CanonicalFunctionBackpressureSet
}

/// canon backpressure.inc
export type CanonicalFunctionBackpressureInc = IndexedElement & {
    tag: ModelTag.CanonicalFunctionBackpressureInc
}

/// canon backpressure.dec
export type CanonicalFunctionBackpressureDec = IndexedElement & {
    tag: ModelTag.CanonicalFunctionBackpressureDec
}

/// canon task.return
export type CanonicalFunctionTaskReturn = IndexedElement & {
    tag: ModelTag.CanonicalFunctionTaskReturn
    results: TaskReturnResults,
    options: CanonicalOption[],
}

export type TaskReturnResults = {
    type?: ComponentValType,
}

/// canon task.cancel
export type CanonicalFunctionTaskCancel = IndexedElement & {
    tag: ModelTag.CanonicalFunctionTaskCancel
}

/// canon context.get
export type CanonicalFunctionContextGet = IndexedElement & {
    tag: ModelTag.CanonicalFunctionContextGet
    valtype: u32,
    index: u32,
}

/// canon context.set
export type CanonicalFunctionContextSet = IndexedElement & {
    tag: ModelTag.CanonicalFunctionContextSet
    valtype: u32,
    index: u32,
}

/// canon thread.yield
export type CanonicalFunctionThreadYield = IndexedElement & {
    tag: ModelTag.CanonicalFunctionThreadYield
    cancellable: boolean,
}

/// canon subtask.cancel
export type CanonicalFunctionSubtaskCancel = IndexedElement & {
    tag: ModelTag.CanonicalFunctionSubtaskCancel
    async: boolean,
}

/// canon subtask.drop
export type CanonicalFunctionSubtaskDrop = IndexedElement & {
    tag: ModelTag.CanonicalFunctionSubtaskDrop
}

/// canon stream.new
export type CanonicalFunctionStreamNew = IndexedElement & {
    tag: ModelTag.CanonicalFunctionStreamNew
    type: u32,
}

/// canon stream.read
export type CanonicalFunctionStreamRead = IndexedElement & {
    tag: ModelTag.CanonicalFunctionStreamRead
    type: u32,
    options: CanonicalOption[],
}

/// canon stream.write
export type CanonicalFunctionStreamWrite = IndexedElement & {
    tag: ModelTag.CanonicalFunctionStreamWrite
    type: u32,
    options: CanonicalOption[],
}

/// canon stream.cancel-read
export type CanonicalFunctionStreamCancelRead = IndexedElement & {
    tag: ModelTag.CanonicalFunctionStreamCancelRead
    type: u32,
    async: boolean,
}

/// canon stream.cancel-write
export type CanonicalFunctionStreamCancelWrite = IndexedElement & {
    tag: ModelTag.CanonicalFunctionStreamCancelWrite
    type: u32,
    async: boolean,
}

/// canon stream.drop-readable
export type CanonicalFunctionStreamDropReadable = IndexedElement & {
    tag: ModelTag.CanonicalFunctionStreamDropReadable
    type: u32,
}

/// canon stream.drop-writable
export type CanonicalFunctionStreamDropWritable = IndexedElement & {
    tag: ModelTag.CanonicalFunctionStreamDropWritable
    type: u32,
}

/// canon future.new
export type CanonicalFunctionFutureNew = IndexedElement & {
    tag: ModelTag.CanonicalFunctionFutureNew
    type: u32,
}

/// canon future.read
export type CanonicalFunctionFutureRead = IndexedElement & {
    tag: ModelTag.CanonicalFunctionFutureRead
    type: u32,
    options: CanonicalOption[],
}

/// canon future.write
export type CanonicalFunctionFutureWrite = IndexedElement & {
    tag: ModelTag.CanonicalFunctionFutureWrite
    type: u32,
    options: CanonicalOption[],
}

/// canon future.cancel-read
export type CanonicalFunctionFutureCancelRead = IndexedElement & {
    tag: ModelTag.CanonicalFunctionFutureCancelRead
    type: u32,
    async: boolean,
}

/// canon future.cancel-write
export type CanonicalFunctionFutureCancelWrite = IndexedElement & {
    tag: ModelTag.CanonicalFunctionFutureCancelWrite
    type: u32,
    async: boolean,
}

/// canon future.drop-readable
export type CanonicalFunctionFutureDropReadable = IndexedElement & {
    tag: ModelTag.CanonicalFunctionFutureDropReadable
    type: u32,
}

/// canon future.drop-writable
export type CanonicalFunctionFutureDropWritable = IndexedElement & {
    tag: ModelTag.CanonicalFunctionFutureDropWritable
    type: u32,
}

/// canon error-context.new
export type CanonicalFunctionErrorContextNew = IndexedElement & {
    tag: ModelTag.CanonicalFunctionErrorContextNew
    options: CanonicalOption[],
}

/// canon error-context.debug-message
export type CanonicalFunctionErrorContextDebugMessage = IndexedElement & {
    tag: ModelTag.CanonicalFunctionErrorContextDebugMessage
    options: CanonicalOption[],
}

/// canon error-context.drop
export type CanonicalFunctionErrorContextDrop = IndexedElement & {
    tag: ModelTag.CanonicalFunctionErrorContextDrop
}

/// canon waitable-set.new
export type CanonicalFunctionWaitableSetNew = IndexedElement & {
    tag: ModelTag.CanonicalFunctionWaitableSetNew
}

/// canon waitable-set.wait
export type CanonicalFunctionWaitableSetWait = IndexedElement & {
    tag: ModelTag.CanonicalFunctionWaitableSetWait
    cancellable: boolean,
    memory: u32,
}

/// canon waitable-set.poll
export type CanonicalFunctionWaitableSetPoll = IndexedElement & {
    tag: ModelTag.CanonicalFunctionWaitableSetPoll
    cancellable: boolean,
    memory: u32,
}

/// canon waitable-set.drop
export type CanonicalFunctionWaitableSetDrop = IndexedElement & {
    tag: ModelTag.CanonicalFunctionWaitableSetDrop
}

/// canon waitable.join
export type CanonicalFunctionWaitableJoin = IndexedElement & {
    tag: ModelTag.CanonicalFunctionWaitableJoin
}