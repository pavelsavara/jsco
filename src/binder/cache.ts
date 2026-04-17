// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import isDebug from 'env:isDebug';
import { LogLevel } from '../utils/assert';
import { modelTagName } from '../utils/debug-names';
import type { LogFn, Verbosity } from '../utils/assert';

function describeKey(key: unknown): string {
    if (key && typeof key === 'object' && 'tag' in key) {
        const tag = (key as { tag: number }).tag;
        const idx = (key as { selfSortIndex?: number }).selfSortIndex;
        return idx !== undefined ? `${modelTagName(tag)}[${idx}]` : modelTagName(tag);
    }
    return String(key);
}

export function memoize<K, V>(cache: Map<unknown, unknown>, key: K, factory: () => V, verbose?: Verbosity, logger?: LogFn): V {
    const res = cache.get(key);
    if (res !== undefined) {
        if (isDebug && verbose && logger && verbose.binder >= LogLevel.Detailed) {
            logger('binder', LogLevel.Detailed, `cache HIT for ${describeKey(key)}`);
        }
        return res as V;
    }
    if (isDebug && verbose && logger && verbose.binder >= LogLevel.Detailed) {
        logger('binder', LogLevel.Detailed, `cache MISS for ${describeKey(key)}`);
    }
    const value = factory();
    cache.set(key, value!);
    return value!;
}
