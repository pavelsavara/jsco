// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

// Canonical ABI limits
export const MAX_FLAT_PARAMS = 16;
export const MAX_FLAT_RESULTS = 1;

export const enum CallingConvention {
    /** Single register value (i32, i64, f32, f64) */
    Scalar,
    /** Multiple register values within MAX_FLAT_PARAMS/MAX_FLAT_RESULTS */
    Flat,
    /** Spilled to linear memory, represented by a pointer */
    Spilled,
}

export const CallingConvention_Count = CallingConvention.Spilled + 1;

/**
 * Core wasm value types for flat representation.
 * Follows the component model spec's flatten_type/join functions.
 */
export const enum FlatType {
    I32,
    I64,
    F32,
    F64,
}

export type FunctionCallingConvention = {
    params: CallingConvention;
    results: CallingConvention;
    paramFlatCount: number;
    resultFlatCount: number;
}
