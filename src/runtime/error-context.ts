// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import isDebug from 'env:isDebug';
import { LogLevel } from '../utils/assert';
import type { LogFn, Verbosity } from '../utils/assert';
import type { ErrorContextTable } from './model/types';

/**
 * Spec: Component-Model `error-context` is a host-managed handle whose
 * referent carries an opaque debug message (see definitions.py L2660
 * `class ErrorContext` and the three canon built-ins
 * `error-context.new` / `.debug-message` / `.drop`).
 *
 * This module implements only the handle table. The resolver wires the
 * canon built-ins to read/write the debug-message string from/to linear
 * memory using the canonical options' string encoding before delegating
 * here — keeping the table free of memory dependencies and identical in
 * shape to the resource / subtask handle tables.
 *
 * Per spec, handles are a per-instance counter; we use a plain monotonic
 * `nextHandle` shared with the lifting paths (which also call `add` when
 * an `error-context` value crosses a function-call boundary).
 */
export function createErrorContextTable(verbose?: Verbosity, logger?: LogFn): ErrorContextTable {
    let nextHandle = 1;
    const handles = new Map<number, unknown>();

    return {
        add(value: unknown): number {
            const handle = nextHandle++;
            handles.set(handle, value);
            if (isDebug && (verbose?.executor ?? 0) >= LogLevel.Detailed) {
                logger!('executor', LogLevel.Detailed, `error-context.add(handle=${handle})`);
            }
            return handle;
        },
        get(handle: number): unknown {
            if (!handles.has(handle)) {
                throw new Error(`Invalid error-context handle: ${handle}`);
            }
            return handles.get(handle);
        },
        remove(handle: number): unknown {
            const entry = handles.get(handle);
            if (!handles.has(handle)) {
                throw new Error(`Invalid error-context handle: ${handle}`);
            }
            handles.delete(handle);
            if (isDebug && (verbose?.executor ?? 0) >= LogLevel.Detailed) {
                logger!('executor', LogLevel.Detailed, `error-context.remove(handle=${handle})`);
            }
            return entry;
        },
        size(): number {
            return handles.size;
        },
    };
}
