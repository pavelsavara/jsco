// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import type { MemoryLoader } from '../../binder/to-js';

export type RecordLoaderPlan = { fields: { name: string, offset: number, loader: MemoryLoader }[] };
export type ListLoaderPlan = { elemSize: number, elemAlign: number, elemLoader: MemoryLoader };
export type OptionLoaderPlan = { payloadOffset: number, payloadLoader: MemoryLoader };
export type ResultLoaderPlan = { payloadOffset: number, okLoader?: MemoryLoader, errLoader?: MemoryLoader };
export type VariantLoaderPlan = {
    payloadOffset: number,
    caseLoaders: (MemoryLoader | undefined)[],
    caseNames: string[], numCases: number,
};
export type EnumLoaderPlan = { memberNames: string[], numMembers: number };
export type FlagsLoaderPlan = { byteSize: number, memberNames: string[] };
export type TupleLoaderPlan = { members: { offset: number, loader: MemoryLoader }[] };
export type OwnResourceLoaderPlan = { resourceTypeIdx: number };
