// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { CanonicalOption } from '../parser/model/canonicals';
import { ModelTag } from '../parser/model/tags';
import { StringEncoding } from './model/types';
import type { ResolvedCanonicalOptions } from './model/types';

export { StringEncoding } from './model/types';
export type { ResolvedCanonicalOptions, ComponentFactoryOptions, ComponentFactoryInput, IndexedModel, ResolvedContext, ResolverContext, MarshalingContext, Resolver, Binder, ResolverArgs, ResolverRes, BinderArgs, BinderRes, CoreInstanceBinderRes, FunctionBinderRes, ModuleBinderRes } from './model/types';
export type { InstanceTable, MemoryView, Allocator, ResourceTable, StreamTable, FutureTable, FutureStorer, SubtaskTable, SubtaskEntry, ErrorContextTable, WaitableSetTable } from '../runtime/model/types';
export { SubtaskState } from '../runtime/model/types';

export function resolveCanonicalOptions(options: CanonicalOption[]): ResolvedCanonicalOptions {
    let stringEncoding: StringEncoding = StringEncoding.Utf8;
    let memoryIndex: number | undefined;
    let reallocIndex: number | undefined;
    let postReturnIndex: number | undefined;
    let isAsync = false;
    let callbackIndex: number | undefined;

    for (const opt of options) {
        switch (opt.tag) {
            case ModelTag.CanonicalOptionUTF8:
                stringEncoding = StringEncoding.Utf8;
                break;
            case ModelTag.CanonicalOptionUTF16:
                stringEncoding = StringEncoding.Utf16;
                break;
            case ModelTag.CanonicalOptionCompactUTF16:
                stringEncoding = StringEncoding.CompactUtf16;
                break;
            case ModelTag.CanonicalOptionMemory:
                memoryIndex = opt.value;
                break;
            case ModelTag.CanonicalOptionRealloc:
                reallocIndex = opt.value;
                break;
            case ModelTag.CanonicalOptionPostReturn:
                postReturnIndex = opt.value;
                break;
            case ModelTag.CanonicalOptionAsync:
                isAsync = true;
                break;
            case ModelTag.CanonicalOptionCallback:
                callbackIndex = opt.value;
                break;
        }
    }

    return { stringEncoding, memoryIndex, reallocIndex, postReturnIndex, async: isAsync, callbackIndex };
}
