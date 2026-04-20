// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

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
