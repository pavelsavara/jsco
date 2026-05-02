// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import type { LiftingFromJs, LoweringToJs, WasmValue, MemoryStorer } from './types';
import type { MemoryLoader } from '../../binder/to-js';
import type { FlatType } from '../../resolver/calling-convention';
import type { MarshalingContext } from '../../resolver/types';

export type ResourceLowerPlan = { resourceTypeIdx: number };
export type EnumLowerPlan = { members: string[] };
export type FlagsLowerPlan = { wordCount: number, memberNames: string[] };
export type RecordLowerPlan = { fields: { name: string, lowerer: LoweringToJs, spill: number }[] };
export type TupleLowerPlan = { elements: { lowerer: LoweringToJs, spill: number }[] };
export type ListLowerPlan = { elemSize: number, elemAlign: number, elemLoader: MemoryLoader };
export type OptionLowerPlan = { innerLowerer: LoweringToJs, innerSpill: number };
export type ResultLowerPlan = {
    okLowerer?: LoweringToJs, errLowerer?: LoweringToJs,
    payloadJoined: FlatType[],
    okFlatTypes: FlatType[], errFlatTypes: FlatType[],
};
export type VariantCaseLowerPlan = {
    name: string, lowerer?: LoweringToJs,
    caseFlatTypes: FlatType[], needsCoercion: boolean,
};
export type VariantLowerPlan = {
    cases: VariantCaseLowerPlan[], payloadJoined: FlatType[],
};
export type FutureLowerPlan = { storer?: (ctx: MarshalingContext, ptr: number, value: unknown, rejected?: boolean) => void };
export type StreamLowerPlan = { elementStorer?: (ctx: MarshalingContext, ptr: number, value: unknown) => void, elementSize?: number };

export type FunctionLowerPlan = {
    paramLowerers: Function[],
    paramLoaders: MemoryLoader[],
    resultLifters: LiftingFromJs[],
    resultStorer: MemoryStorer | undefined,
    spilledParamOffsets: number[],
    resultBuf: WasmValue[],
    resultIsI64: boolean,
    /** When true, the JS function may return a Promise that IS the future/stream value
     *  (not a Promise to be awaited). Pass it directly to the result lifter. */
    hasFutureOrStreamReturn: boolean,
};
