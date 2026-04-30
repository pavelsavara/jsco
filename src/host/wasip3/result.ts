// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

/**
 * WASIp3 Result/Error Helpers
 *
 * Standard tagged-union result types and WasiError for WASIp3 host APIs.
 */

/** A tagged result: `{ tag: 'ok', val: T }` or `{ tag: 'err', val: E }`. */
export type WasiResult<T, E> =
    | { tag: 'ok'; val: T }
    | { tag: 'err'; val: E };

/** Construct an `ok` result. Pass no argument for the void payload case. */
export function ok(): WasiResult<void, never>;
export function ok<T>(value: T): WasiResult<T, never>;
export function ok<T>(value?: T): WasiResult<T | void, never> {
    return { tag: 'ok', val: value as T };
}

/** Construct an `err` result. Pass no argument for the void payload case. */
export function err(): WasiResult<never, void>;
export function err<E>(code: E): WasiResult<never, E>;
export function err<E>(code?: E): WasiResult<never, E | void> {
    return { tag: 'err', val: code as E };
}

/**
 * A throwable WASI error with an error code, phase, and interface context.
 */
export class WasiError extends Error {
    readonly code: string;
    readonly phase: string;
    readonly iface: string;

    constructor(code: string, phase: string, iface: string, message?: string) {
        super(message ?? `WasiError: ${code} in ${phase}/${iface}`);
        this.name = 'WasiError';
        this.code = code;
        this.phase = phase;
        this.iface = iface;
    }
}
