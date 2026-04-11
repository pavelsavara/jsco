import type { ResolvedType } from '../type-resolution';
import { BindingContext, StringEncoding } from '../types';
import { createMemoryStorer } from './to-abi';
import { createMemoryLoader } from './to-js';
import type { JsValue } from './types';

export function storeToMemory(ctx: BindingContext, ptr: number, type: ResolvedType, jsValue: JsValue, stringEncoding: StringEncoding, canonicalResourceIds: Map<number, number>): void {
    createMemoryStorer(type, stringEncoding, canonicalResourceIds)(ctx, ptr, jsValue);
}

export function loadFromMemory(ctx: BindingContext, ptr: number, type: ResolvedType, stringEncoding: StringEncoding, canonicalResourceIds: Map<number, number>): any {
    return createMemoryLoader(type, stringEncoding, canonicalResourceIds)(ctx, ptr);
}
