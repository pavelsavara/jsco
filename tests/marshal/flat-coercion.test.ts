// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

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
