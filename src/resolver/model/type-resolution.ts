// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import type {
    ComponentValTypePrimitive, ComponentTypeDefinedPrimitive, ComponentTypeDefinedRecord,
    ComponentTypeDefinedVariant, ComponentTypeDefinedList, ComponentTypeDefinedTuple,
    ComponentTypeDefinedFlags, ComponentTypeDefinedEnum, ComponentTypeDefinedOption,
    ComponentTypeDefinedResult, ComponentTypeDefinedOwn, ComponentTypeDefinedBorrow,
    ComponentTypeDefinedStream, ComponentTypeDefinedFuture, ComponentTypeDefinedErrorContext,
    ComponentTypeFunc,
} from '../../parser/model/types';

export type ResolvedType =
    | ComponentValTypePrimitive
    | ComponentTypeDefinedPrimitive
    | ComponentTypeDefinedRecord
    | ComponentTypeDefinedVariant
    | ComponentTypeDefinedList
    | ComponentTypeDefinedTuple
    | ComponentTypeDefinedFlags
    | ComponentTypeDefinedEnum
    | ComponentTypeDefinedOption
    | ComponentTypeDefinedResult
    | ComponentTypeDefinedOwn
    | ComponentTypeDefinedBorrow
    | ComponentTypeDefinedStream
    | ComponentTypeDefinedFuture
    | ComponentTypeDefinedErrorContext
    | ComponentTypeFunc;
