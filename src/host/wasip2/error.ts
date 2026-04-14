// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * wasi:io/error — Opaque error resource
 *
 * Wraps an underlying error with a debug string representation.
 */

/** wasi:io/error — error resource */
export interface WasiError {
    toDebugString(): string;
}

export function createWasiError(message: string): WasiError {
    return {
        toDebugString: () => message,
    };
}
