// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { initializeAsserts } from '../../src/utils/assert';
initializeAsserts();

import { ModelTag } from '../../src/parser/model/tags';
import { ComponentValType, PrimitiveValType } from '../../src/parser/model/types';
import { ResolverContext, MarshalingContext } from '../../src/resolver/types';
import { createLifting as _createLifting } from '../../src/binder/to-abi';
import { createLowering } from '../../src/binder/to-js';
import type { WasmValue } from '../../src/marshal/model/types';
import { describeDebugOnly } from '../test-utils/debug-only';

// Wrap BYO-buffer lifters to return arrays for test convenience
function createLifting(rctx: any, model: any): (ctx: MarshalingContext, value: any) => WasmValue[] {
    const lifter = _createLifting(rctx, model);
    return (ctx: MarshalingContext, value: any) => {
        const out = new Array<WasmValue>(64);
        const count = lifter(ctx, value, out, 0);
        return out.slice(0, count);
    };
}

function createMinimalRctx(usesNumberForInt64 = false): ResolverContext {
    return {
        resolved: {
            liftingCache: new Map(), loweringCache: new Map(),
            resolvedTypes: new Map(),
            usesNumberForInt64,
        },
    } as any as ResolverContext;
}

function createMinimalCtx(): MarshalingContext {
    return {} as any as MarshalingContext;
}

function prim(value: PrimitiveValType): ComponentValType {
    return { tag: ModelTag.ComponentValTypePrimitive, value };
}

describeDebugOnly('primitive lifting (JS → WASM)', () => {
    let rctx: ResolverContext;
    let mctx: MarshalingContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
        mctx = createMinimalCtx();
    });

    describe('bool', () => {
        test('true lifts to [1]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Bool));
            expect(lifter(mctx, true)).toEqual([1]);
        });
        test('false lifts to [0]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Bool));
            expect(lifter(mctx, false)).toEqual([0]);
        });
        test('0 lifts to [0]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Bool));
            expect(lifter(mctx, 0)).toEqual([0]);
        });
        test('1 lifts to [1]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Bool));
            expect(lifter(mctx, 1)).toEqual([1]);
        });
    });

    describe('s8', () => {
        test('127 lifts to [127]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.S8));
            expect(lifter(mctx, 127)).toEqual([127]);
        });
        test('-128 lifts to [-128]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.S8));
            expect(lifter(mctx, -128)).toEqual([-128]);
        });
        test('255 wraps to [-1]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.S8));
            expect(lifter(mctx, 255)).toEqual([-1]);
        });
    });

    describe('u8', () => {
        test('255 lifts to [255]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.U8));
            expect(lifter(mctx, 255)).toEqual([255]);
        });
        test('0 lifts to [0]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.U8));
            expect(lifter(mctx, 0)).toEqual([0]);
        });
        test('256 truncates to [0]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.U8));
            expect(lifter(mctx, 256)).toEqual([0]);
        });
    });

    describe('s16', () => {
        test('32767 lifts to [32767]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.S16));
            expect(lifter(mctx, 32767)).toEqual([32767]);
        });
        test('-32768 lifts to [-32768]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.S16));
            expect(lifter(mctx, -32768)).toEqual([-32768]);
        });
    });

    describe('u16', () => {
        test('65535 lifts to [65535]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.U16));
            expect(lifter(mctx, 65535)).toEqual([65535]);
        });
        test('0 lifts to [0]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.U16));
            expect(lifter(mctx, 0)).toEqual([0]);
        });
    });

    describe('s32', () => {
        test('2147483647 lifts to [2147483647]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.S32));
            expect(lifter(mctx, 2147483647)).toEqual([2147483647]);
        });
        test('-1 lifts to [-1]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.S32));
            expect(lifter(mctx, -1)).toEqual([-1]);
        });
    });

    describe('u32', () => {
        test('0 lifts to [0]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.U32));
            expect(lifter(mctx, 0)).toEqual([0]);
        });
        test('4294967295 lifts to [4294967295]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.U32));
            expect(lifter(mctx, 4294967295)).toEqual([4294967295]);
        });
        test('-1 lifts to [4294967295]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.U32));
            expect(lifter(mctx, -1)).toEqual([4294967295]);
        });
    });

    describe('s64 (BigInt mode)', () => {
        test('0n lifts to [0n]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.S64));
            expect(lifter(mctx, 0n)).toEqual([0n]);
        });
        test('-1n lifts to [-1n]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.S64));
            expect(lifter(mctx, -1n)).toEqual([-1n]);
        });
    });

    describe('s64 (Number mode)', () => {
        test('0n lifts to [0n]', () => {
            const nrctx = createMinimalRctx(true);
            const lifter = createLifting(nrctx.resolved, prim(PrimitiveValType.S64));
            const result = lifter(mctx, 0n);
            expect(result).toEqual([0n]);
            expect(typeof result[0]).toBe('bigint');
        });
        test('-1n lifts to [-1n]', () => {
            const nrctx = createMinimalRctx(true);
            const lifter = createLifting(nrctx.resolved, prim(PrimitiveValType.S64));
            const result = lifter(mctx, -1n);
            expect(result).toEqual([-1n]);
            expect(typeof result[0]).toBe('bigint');
        });
        test('42n lifts to [42n]', () => {
            const nrctx = createMinimalRctx(true);
            const lifter = createLifting(nrctx.resolved, prim(PrimitiveValType.S64));
            const result = lifter(mctx, 42n);
            expect(result).toEqual([42n]);
            expect(typeof result[0]).toBe('bigint');
        });
        test('42 (Number input) lifts to [42]', () => {
            const nrctx = createMinimalRctx(true);
            const lifter = createLifting(nrctx.resolved, prim(PrimitiveValType.S64));
            const result = lifter(mctx, 42);
            expect(result).toEqual([42]);
            expect(typeof result[0]).toBe('number');
        });
    });

    describe('u64 (BigInt mode)', () => {
        test('0n lifts to [0n]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.U64));
            expect(lifter(mctx, 0n)).toEqual([0n]);
        });
        test('max u64 lifts correctly', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.U64));
            const maxU64 = BigInt(2) ** BigInt(64) - 1n;
            expect(lifter(mctx, maxU64)).toEqual([18446744073709551615n]);
        });
    });

    describe('u64 (Number mode)', () => {
        test('0n lifts to [0n]', () => {
            const nrctx = createMinimalRctx(true);
            const lifter = createLifting(nrctx.resolved, prim(PrimitiveValType.U64));
            const result = lifter(mctx, 0n);
            expect(result).toEqual([0n]);
            expect(typeof result[0]).toBe('bigint');
        });
        test('100n lifts to [100n]', () => {
            const nrctx = createMinimalRctx(true);
            const lifter = createLifting(nrctx.resolved, prim(PrimitiveValType.U64));
            const result = lifter(mctx, 100n);
            expect(result).toEqual([100n]);
            expect(typeof result[0]).toBe('bigint');
        });
        test('100 (Number input) lifts to [100]', () => {
            const nrctx = createMinimalRctx(true);
            const lifter = createLifting(nrctx.resolved, prim(PrimitiveValType.U64));
            const result = lifter(mctx, 100);
            expect(result).toEqual([100]);
            expect(typeof result[0]).toBe('number');
        });
    });

    describe('f32', () => {
        test('3.14 lifts to [Math.fround(3.14)]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Float32));
            expect(lifter(mctx, 3.14)).toEqual([Math.fround(3.14)]);
        });
        test('0 lifts to [0]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Float32));
            expect(lifter(mctx, 0)).toEqual([0]);
        });
    });

    describe('f64', () => {
        test('pi lifts to [pi]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Float64));
            expect(lifter(mctx, 3.141592653589793)).toEqual([3.141592653589793]);
        });
        test('0 lifts to [0]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Float64));
            expect(lifter(mctx, 0)).toEqual([0]);
        });
    });

    describe('char', () => {
        test('\'A\' lifts to [65]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Char));
            expect(lifter(mctx, 'A')).toEqual([65]);
        });
        test('\'€\' lifts to [8364]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Char));
            expect(lifter(mctx, '€')).toEqual([8364]);
        });
        test('\'🎉\' lifts to [127881]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Char));
            expect(lifter(mctx, '🎉')).toEqual([127881]);
        });
    });
});

describeDebugOnly('primitive lowering (WASM → JS)', () => {
    let rctx: ResolverContext;
    let mctx: MarshalingContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
        mctx = createMinimalCtx();
    });

    describe('bool', () => {
        test('1 lowers to true', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Bool));
            expect(lowerer(mctx, 1)).toBe(true);
        });
        test('0 lowers to false', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Bool));
            expect(lowerer(mctx, 0)).toBe(false);
        });
        test('42 lowers to true', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Bool));
            expect(lowerer(mctx, 42)).toBe(true);
        });
    });

    describe('s8', () => {
        test('127 lowers to 127', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.S8));
            expect(lowerer(mctx, 127)).toBe(127);
        });
        test('0xFF lowers to -1', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.S8));
            expect(lowerer(mctx, 0xFF)).toBe(-1);
        });
    });

    describe('u8', () => {
        test('255 lowers to 255', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.U8));
            expect(lowerer(mctx, 255)).toBe(255);
        });
        test('0x1FF masks to 255', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.U8));
            expect(lowerer(mctx, 0x1FF)).toBe(255);
        });
    });

    describe('s16', () => {
        test('0xFFFF lowers to -1', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.S16));
            expect(lowerer(mctx, 0xFFFF)).toBe(-1);
        });
        test('32767 lowers to 32767', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.S16));
            expect(lowerer(mctx, 32767)).toBe(32767);
        });
    });

    describe('u16', () => {
        test('0x1FFFF masks to 65535', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.U16));
            expect(lowerer(mctx, 0x1FFFF)).toBe(65535);
        });
    });

    describe('s32', () => {
        test('0xFFFFFFFF lowers to -1', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.S32));
            expect(lowerer(mctx, 0xFFFFFFFF)).toBe(-1);
        });
    });

    describe('u32', () => {
        test('-1 lowers to 4294967295', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.U32));
            expect(lowerer(mctx, -1)).toBe(4294967295);
        });
    });

    describe('s64 (BigInt mode)', () => {
        test('0n lowers to 0n', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.S64));
            expect(lowerer(mctx, 0n)).toBe(0n);
        });
        test('-1n lowers to -1n', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.S64));
            expect(lowerer(mctx, -1n)).toBe(-1n);
        });
    });

    describe('s64 (Number mode)', () => {
        test('0n lowers to 0', () => {
            const nrctx = createMinimalRctx(true);
            const lowerer = createLowering(nrctx.resolved, prim(PrimitiveValType.S64));
            const result = lowerer(mctx, 0n);
            expect(result).toBe(0);
            expect(typeof result).toBe('number');
        });
        test('-1n lowers to -1', () => {
            const nrctx = createMinimalRctx(true);
            const lowerer = createLowering(nrctx.resolved, prim(PrimitiveValType.S64));
            const result = lowerer(mctx, -1n);
            expect(result).toBe(-1);
            expect(typeof result).toBe('number');
        });
        test('42n lowers to 42', () => {
            const nrctx = createMinimalRctx(true);
            const lowerer = createLowering(nrctx.resolved, prim(PrimitiveValType.S64));
            const result = lowerer(mctx, 42n);
            expect(result).toBe(42);
            expect(typeof result).toBe('number');
        });
    });

    describe('u64 (BigInt mode)', () => {
        test('0n lowers to 0n', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.U64));
            expect(lowerer(mctx, 0n)).toBe(0n);
        });
    });

    describe('u64 (Number mode)', () => {
        test('0n lowers to 0', () => {
            const nrctx = createMinimalRctx(true);
            const lowerer = createLowering(nrctx.resolved, prim(PrimitiveValType.U64));
            const result = lowerer(mctx, 0n);
            expect(result).toBe(0);
            expect(typeof result).toBe('number');
        });
        test('100n lowers to 100', () => {
            const nrctx = createMinimalRctx(true);
            const lowerer = createLowering(nrctx.resolved, prim(PrimitiveValType.U64));
            const result = lowerer(mctx, 100n);
            expect(result).toBe(100);
            expect(typeof result).toBe('number');
        });
    });

    describe('f32', () => {
        test('3.14 lowers to Math.fround(3.14)', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Float32));
            expect(lowerer(mctx, 3.14)).toBe(Math.fround(3.14));
        });
    });

    describe('f64', () => {
        test('Math.PI lowers to Math.PI', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Float64));
            expect(lowerer(mctx, Math.PI)).toBe(Math.PI);
        });
    });

    describe('char', () => {
        test('65 lowers to \'A\'', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Char));
            expect(lowerer(mctx, 65)).toBe('A');
        });
        test('8364 lowers to \'€\'', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Char));
            expect(lowerer(mctx, 8364)).toBe('€');
        });
        test('127881 lowers to \'🎉\'', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Char));
            expect(lowerer(mctx, 127881)).toBe('🎉');
        });
    });
});

describeDebugOnly('lowerer spill counts', () => {
    let rctx: ResolverContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
    });

    test('all scalar primitives have spill=1', () => {
        const scalarTypes = [
            PrimitiveValType.Bool,
            PrimitiveValType.S8,
            PrimitiveValType.U8,
            PrimitiveValType.S16,
            PrimitiveValType.U16,
            PrimitiveValType.S32,
            PrimitiveValType.U32,
            PrimitiveValType.S64,
            PrimitiveValType.U64,
            PrimitiveValType.Float32,
            PrimitiveValType.Float64,
            PrimitiveValType.Char,
        ];
        for (const t of scalarTypes) {
            const lowerer = createLowering(rctx.resolved, prim(t));
            expect((lowerer as any).spill).toBe(1);
        }
    });

    test('string has spill=2', () => {
        const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.String));
        expect((lowerer as any).spill).toBe(2);
    });
});

describeDebugOnly('useNumberForInt64 option handling', () => {
    test('default (undefined) → usesNumberForInt64 = false', () => {
        const rctx = createMinimalRctx();
        expect(rctx.resolved.usesNumberForInt64).toBe(false);
    });

    test('false → usesNumberForInt64 = false', () => {
        const rctx = createMinimalRctx(false);
        expect(rctx.resolved.usesNumberForInt64).toBe(false);
    });

    test('true → usesNumberForInt64 = true, lifters pass through values (trampoline converts)', () => {
        const rctx = createMinimalRctx(true);
        const mctx = createMinimalCtx();
        expect(rctx.resolved.usesNumberForInt64).toBe(true);

        const s64Lifter = createLifting(rctx.resolved, prim(PrimitiveValType.S64));
        // Accept BigInt input — passes through as BigInt
        const s64Result = s64Lifter(mctx, 42n);
        expect(typeof s64Result[0]).toBe('bigint');
        expect(s64Result[0]).toBe(42n);
        // Accept Number input — passes through as Number
        const s64ResultFromNumber = s64Lifter(mctx, 42);
        expect(typeof s64ResultFromNumber[0]).toBe('number');
        expect(s64ResultFromNumber[0]).toBe(42);

        const u64Lifter = createLifting(rctx.resolved, prim(PrimitiveValType.U64));
        const u64Result = u64Lifter(mctx, 100n);
        expect(typeof u64Result[0]).toBe('bigint');
        expect(u64Result[0]).toBe(100n);
        // Accept Number input — passes through as Number
        const u64ResultFromNumber = u64Lifter(mctx, 100);
        expect(typeof u64ResultFromNumber[0]).toBe('number');
        expect(u64ResultFromNumber[0]).toBe(100);
    });

    test('true → lowerers produce Number', () => {
        const rctx = createMinimalRctx(true);
        const mctx = createMinimalCtx();

        const s64Lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.S64));
        const s64Result = s64Lowerer(mctx, 42n);
        expect(typeof s64Result).toBe('number');
        expect(s64Result).toBe(42);

        const u64Lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.U64));
        const u64Result = u64Lowerer(mctx, 100n);
        expect(typeof u64Result).toBe('number');
        expect(u64Result).toBe(100);
    });

    test('false → lifters and lowerers produce BigInt', () => {
        const rctx = createMinimalRctx(false);
        const mctx = createMinimalCtx();

        const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.S64));
        const liftResult = lifter(mctx, 42n);
        expect(typeof liftResult[0]).toBe('bigint');

        const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.S64));
        const lowerResult = lowerer(mctx, 42n);
        expect(typeof lowerResult).toBe('bigint');
    });

    test('BigInt and Number caches are independent', () => {
        const bigintRctx = createMinimalRctx(false);
        const numberRctx = createMinimalRctx(true);
        const mctx = createMinimalCtx();

        // Same primitive type, but different resolvedContexts
        const bigintLifter = createLifting(bigintRctx.resolved, prim(PrimitiveValType.S64));
        const numberLifter = createLifting(numberRctx.resolved, prim(PrimitiveValType.S64));

        // Different caches, different lifters
        expect(bigintLifter).not.toBe(numberLifter);
        expect(typeof bigintLifter(mctx, 1n)[0]).toBe('bigint');
        expect(typeof numberLifter(mctx, 1n)[0]).toBe('bigint');
    });
});
