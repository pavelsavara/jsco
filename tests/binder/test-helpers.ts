// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import type { ResolvedType } from '../../src/resolver/type-resolution';
import { MarshalingContext, StringEncoding } from '../../src/resolver/types';
import { createMemoryStorer } from '../../src/binder/to-abi';
import { createMemoryLoader } from '../../src/binder/to-js';
import type { JsValue } from '../../src/marshal/model/types';

export function storeToMemory(ctx: MarshalingContext, ptr: number, type: ResolvedType, jsValue: JsValue, stringEncoding: StringEncoding, canonicalResourceIds: Map<number, number>): void {
    createMemoryStorer(type, stringEncoding, canonicalResourceIds)(ctx, ptr, jsValue);
}

export function loadFromMemory(ctx: MarshalingContext, ptr: number, type: ResolvedType, stringEncoding: StringEncoding, canonicalResourceIds: Map<number, number>, usesNumberForInt64 = false): any {
    return createMemoryLoader(type, stringEncoding, canonicalResourceIds, undefined, usesNumberForInt64)(ctx, ptr);
}
