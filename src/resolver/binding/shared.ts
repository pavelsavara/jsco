// Shared typed-array buffers for float↔int bit reinterpretation (used by coerceFlatLift/Lower and NaN canonicalization)
export const _f32 = new Float32Array(1);
export const _i32 = new Int32Array(_f32.buffer);
export const _f64 = new Float64Array(1);
export const _i64 = new BigInt64Array(_f64.buffer);

// Canonical NaN values per spec (CANONICAL_FLOAT32_NAN = 0x7fc00000, CANONICAL_FLOAT64_NAN = 0x7ff8000000000000)
_i32[0] = 0x7fc00000;
export const canonicalNaN32: number = _f32[0];
_i64[0] = 0x7ff8000000000000n;
export const canonicalNaN64: number = _f64[0];

export function bigIntReplacer(_key: string, value: unknown): unknown {
    return typeof value === 'bigint' ? value.toString() + 'n' : value;
}
