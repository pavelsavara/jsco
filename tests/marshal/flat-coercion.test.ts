// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { coerceFlatLift } from '../../src/marshal/lift';
import { coerceFlatLower } from '../../src/marshal/lower';
import { FlatType } from '../../src/resolver/calling-convention';

/**
 * Tests for the flat-type coercion functions used in variant lifting/lowering.
 * These implement the CM spec's lower_flat_variant / lift_flat_variant coercion tables.
 *
 * lift coercion (JS→WASM):  f32→i32, i32→i64, f32→i64, f64→i64
 * lower coercion (WASM→JS): i32→f32, i64→i32, i64→f32, i64→f64
 */
describe('coerceFlatLift', () => {
    test('f32→i32: reinterpret float bits as integer', () => {
        // 1.0f has bit pattern 0x3F800000 = 1065353216
        const result = coerceFlatLift(1.0, FlatType.F32, FlatType.I32);
        expect(result).toBe(1065353216);
    });

    test('f32→i32: negative float', () => {
        const result = coerceFlatLift(-1.0, FlatType.F32, FlatType.I32);
        // -1.0f = 0xBF800000, returned as signed i32 = -1082130432
        expect(result).toBe(-1082130432);
    });

    test('i32→i64: widen unsigned', () => {
        const result = coerceFlatLift(42, FlatType.I32, FlatType.I64);
        expect(result).toBe(42);
    });

    test('i32→i64: negative treated as unsigned via >>> 0', () => {
        const result = coerceFlatLift(-1, FlatType.I32, FlatType.I64);
        expect(result).toBe(4294967295); // 0xFFFFFFFF
    });

    test('f32→i64: reinterpret f32 as i32, then widen', () => {
        const result = coerceFlatLift(1.0, FlatType.F32, FlatType.I64);
        expect(result).toBe(1065353216); // 0x3F800000 unsigned
    });

    test('f64→i64: reinterpret f64 bits as BigInt', () => {
        const result = coerceFlatLift(1.0, FlatType.F64, FlatType.I64);
        expect(result).toBe(4607182418800017408n); // 0x3FF0000000000000
    });

    test('same types: identity', () => {
        expect(coerceFlatLift(42, FlatType.I32, FlatType.I32)).toBe(42);
        expect(coerceFlatLift(3.14, FlatType.F64, FlatType.F64)).toBe(3.14);
    });
});

describe('coerceFlatLower', () => {
    test('i32→f32: decode integer bits as float', () => {
        // 0x3F800000 = 1065353216 → 1.0f
        const result = coerceFlatLower(1065353216, FlatType.I32, FlatType.F32);
        expect(result).toBeCloseTo(1.0);
    });

    test('i64→i32: wrap BigInt to 32-bit unsigned', () => {
        const result = coerceFlatLower(BigInt(0x1_0000_002A), FlatType.I64, FlatType.I32);
        expect(result).toBe(42); // low 32 bits
    });

    test('i64→f32: wrap to i32 then decode as float', () => {
        // BigInt whose low 32 bits are 0x3F800000 (1.0f pattern)
        const result = coerceFlatLower(BigInt(0x3F800000), FlatType.I64, FlatType.F32);
        expect(result).toBeCloseTo(1.0);
    });

    test('i64→f64: decode BigInt bits as double', () => {
        // 0x3FF0000000000000 = 1.0
        const result = coerceFlatLower(4607182418800017408n, FlatType.I64, FlatType.F64);
        expect(result).toBeCloseTo(1.0);
    });

    test('same types: identity', () => {
        expect(coerceFlatLower(42, FlatType.I32, FlatType.I32)).toBe(42);
        expect(coerceFlatLower(3.14, FlatType.F64, FlatType.F64)).toBe(3.14);
    });
});

// Spec: variant coercion paths must canonicalize NaN per
// canonicalize_nan{32,64} (lower / WASM→JS) and maybe_scramble_nan{32,64}
// under DETERMINISTIC_PROFILE (lift / JS→WASM).
// Canonical NaN bit patterns: f32 = 0x7fc00000, f64 = 0x7ff8000000000000.
describe('coerceFlatLift NaN canonicalization', () => {
    test('f32→i32: NaN → canonical 0x7fc00000', () => {
        expect(coerceFlatLift(NaN, FlatType.F32, FlatType.I32)).toBe(0x7fc00000);
    });

    test('f32→i32: non-NaN unaffected', () => {
        // 1.0f → 0x3F800000
        expect(coerceFlatLift(1.0, FlatType.F32, FlatType.I32)).toBe(0x3F800000);
    });

    test('f32→i64: NaN → canonical 0x7fc00000 (zero-extended)', () => {
        expect(coerceFlatLift(NaN, FlatType.F32, FlatType.I64)).toBe(0x7fc00000);
    });

    test('f64→i64: NaN → canonical 0x7ff8000000000000n', () => {
        expect(coerceFlatLift(NaN, FlatType.F64, FlatType.I64)).toBe(0x7ff8000000000000n);
    });

    test('f64→i64: non-NaN unaffected', () => {
        // 1.0 → 0x3FF0000000000000
        expect(coerceFlatLift(1.0, FlatType.F64, FlatType.I64)).toBe(4607182418800017408n);
    });
});

describe('coerceFlatLower NaN canonicalization', () => {
    // A signaling/non-canonical f32 NaN bit pattern: 0x7fa00001
    // (exponent all-ones, fraction non-zero, MSB of fraction = 0 → sNaN).
    const nonCanonicalNaN32_bits = 0x7fa00001 | 0;

    test('i32→f32: non-canonical NaN bits → JS canonical NaN value', () => {
        const result = coerceFlatLower(nonCanonicalNaN32_bits, FlatType.I32, FlatType.F32) as number;
        expect(Number.isNaN(result)).toBe(true);
        // Bit pattern of result must be the canonical f32 quiet NaN (0x7fc00000).
        const buf = new ArrayBuffer(4);
        new Float32Array(buf)[0] = result;
        expect(new Uint32Array(buf)[0]).toBe(0x7fc00000);
    });

    test('i32→f32: regular value unaffected', () => {
        // 0x3F800000 → 1.0
        expect(coerceFlatLower(0x3F800000, FlatType.I32, FlatType.F32)).toBeCloseTo(1.0);
    });

    test('i64→f32: low-32 bits non-canonical NaN → canonical NaN', () => {
        // Place sNaN bits in low 32; high 32 ignored by wrap_i64_to_i32
        const result = coerceFlatLower(BigInt(nonCanonicalNaN32_bits >>> 0) | 0xDEAD_BEEFn << 32n, FlatType.I64, FlatType.F32) as number;
        expect(Number.isNaN(result)).toBe(true);
        const buf = new ArrayBuffer(4);
        new Float32Array(buf)[0] = result;
        expect(new Uint32Array(buf)[0]).toBe(0x7fc00000);
    });

    test('i64→f64: non-canonical f64 NaN bits → canonical NaN', () => {
        // 0x7ff4_0000_0000_0001 — sNaN-ish double
        const result = coerceFlatLower(0x7ff4_0000_0000_0001n, FlatType.I64, FlatType.F64) as number;
        expect(Number.isNaN(result)).toBe(true);
        const buf = new ArrayBuffer(8);
        new Float64Array(buf)[0] = result;
        const u32 = new Uint32Array(buf);
        // Little-endian: low word at index 0, high word at index 1.
        expect(u32[0]).toBe(0x00000000);
        expect(u32[1]).toBe(0x7ff80000);
    });

    test('i64→f64: regular value unaffected', () => {
        // 0x3FF0000000000000 → 1.0
        expect(coerceFlatLower(4607182418800017408n, FlatType.I64, FlatType.F64)).toBeCloseTo(1.0);
    });
});
