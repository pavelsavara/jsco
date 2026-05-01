// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import type { MarshalingContext, LiftingFromJs, MemoryStorer } from './types';

export type StringStorerPlan = { lifter: LiftingFromJs };
export type RecordStorerPlan = { fields: { name: string, offset: number, storer: MemoryStorer }[] };
export type ListStorerPlan = { elemSize: number, elemAlign: number, elemStorer: MemoryStorer };
export type OptionStorerPlan = { payloadOffset: number, payloadStorer: MemoryStorer };
export type ResultStorerPlan = { payloadOffset: number, okStorer?: MemoryStorer, errStorer?: MemoryStorer };
export type VariantStorerPlan = {
    payloadOffset: number,
    nameToIndex: Map<string, number>,
    caseStorers: (MemoryStorer | undefined)[],
};
export type EnumStorerPlan = { nameToIndex: Map<string, number> };
export type FlagsStorerPlan = { byteSize: number, memberNames: string[] };
export type TupleStorerPlan = { members: { offset: number, storer: MemoryStorer }[] };
export type OwnResourceStorerPlan = { resourceTypeIdx: number };
export type StreamStorerPlan = { elementStorer?: MemoryStorer, elementSize?: number };
export type FutureStorerPlan = { futureStorer?: (ctx: MarshalingContext, ptr: number, value: unknown, rejected?: boolean) => void };
