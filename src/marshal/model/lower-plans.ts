// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { LiftingFromJs, LoweringToJs, WasmValue } from './types';
import type { MemoryStorer } from '../../binder/to-abi';
import type { MemoryLoader } from '../../binder/to-js';
import type { FlatType } from '../../resolver/calling-convention';

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
