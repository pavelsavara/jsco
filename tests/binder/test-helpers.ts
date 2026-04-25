// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { ResolvedType } from '../resolver/type-resolution';
import { MarshalingContext, StringEncoding } from '../resolver/types';
import { createMemoryStorer } from './to-abi';
import { createMemoryLoader } from './to-js';
import type { JsValue } from '../marshal/model/types';

export function storeToMemory(ctx: MarshalingContext, ptr: number, type: ResolvedType, jsValue: JsValue, stringEncoding: StringEncoding, canonicalResourceIds: Map<number, number>): void {
    createMemoryStorer(type, stringEncoding, canonicalResourceIds)(ctx, ptr, jsValue);
}

export function loadFromMemory(ctx: MarshalingContext, ptr: number, type: ResolvedType, stringEncoding: StringEncoding, canonicalResourceIds: Map<number, number>, usesNumberForInt64 = false): any {
    return createMemoryLoader(type, stringEncoding, canonicalResourceIds, undefined, usesNumberForInt64)(ctx, ptr);
}
