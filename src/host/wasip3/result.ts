// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * WASIp3 Result/Error Helpers
 *
 * Standard tagged-union result types and WasiError for WASIp3 host APIs.
 */

/** A tagged result: `{ tag: 'ok', val: T }` or `{ tag: 'err', val: E }`. */
export type WasiResult<T, E> =
    | { tag: 'ok'; val: T }
    | { tag: 'err'; val: E };

/** Construct an `ok` result. */
export function ok<T>(value: T): WasiResult<T, never> {
    return { tag: 'ok', val: value };
}

/** Construct an `err` result. */
export function err<E>(code: E): WasiResult<never, E> {
    return { tag: 'err', val: code };
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
