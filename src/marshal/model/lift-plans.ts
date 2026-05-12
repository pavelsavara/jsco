// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import type { LiftingFromJs, MemoryStorer } from './types';
import type { MemoryLoader } from '../../binder/to-js';
import type { LoweringToJs } from './types';
import type { FlatType } from '../../resolver/calling-convention';

export type ResourceLiftPlan = { resourceTypeIdx: number };
export type EnumLiftPlan = { nameToIndex: Map<string, number> };
export type FlagsLiftPlan = { wordCount: number, memberNames: string[] };
export type RecordLiftPlan = { fields: { name: string, lifter: LiftingFromJs }[] };
export type TupleLiftPlan = { elementLifters: LiftingFromJs[] };
export type ListLiftPlan = { elemSize: number, elemAlign: number, elemStorer: MemoryStorer };
export type OptionLiftPlan = { innerLifter: LiftingFromJs, totalSize: number };
export type ResultLiftPlan = {
    okLifter?: LiftingFromJs, errLifter?: LiftingFromJs,
    totalSize: number, payloadJoined: FlatType[],
    okFlatTypes: FlatType[], errFlatTypes: FlatType[],
};
export type VariantCaseLiftPlan = {
    index: number, lifter?: LiftingFromJs,
    caseFlatTypes: FlatType[], needsCoercion: boolean,
};
export type VariantLiftPlan = {
    totalSize: number, payloadJoined: FlatType[],
    nameToCase: Map<string, VariantCaseLiftPlan>,
};

export type FunctionLiftPlan = {
    paramLifters: LiftingFromJs[],
    paramStorers: MemoryStorer[],
    resultLowerers: LoweringToJs[],
    resultLoader: MemoryLoader | undefined,
    spilledParamOffsets: number[],
    spilledParamsTotalSize: number,
    spilledParamsMaxAlign: number,
    totalFlatParams: number,
    i64ParamPositions: number[],
};
