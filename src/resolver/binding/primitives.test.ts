import { initializeAsserts } from '../../utils/assert';
initializeAsserts();

import { ModelTag } from '../../model/tags';
import { ComponentValType, PrimitiveValType } from '../../model/types';
import { ResolverContext, BindingContext } from '../types';
import { createLifting as _createLifting } from './to-abi';
import { createLowering } from './to-js';
import type { WasmValue } from './types';
import { describeDebugOnly } from '../../test-utils/debug-only';

// Wrap BYO-buffer lifters to return arrays for test convenience
function createLifting(rctx: any, model: any): (ctx: BindingContext, value: any) => WasmValue[] {
    const lifter = _createLifting(rctx, model);
    return (ctx: BindingContext, value: any) => {
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

function createMinimalBctx(): BindingContext {
    return {} as any as BindingContext;
}

function prim(value: PrimitiveValType): ComponentValType {
    return { tag: ModelTag.ComponentValTypePrimitive, value };
}

describeDebugOnly('primitive lifting (JS → WASM)', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    describe('bool', () => {
        test('true lifts to [1]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Bool));
            expect(lifter(bctx, true)).toEqual([1]);
        });
        test('false lifts to [0]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Bool));
            expect(lifter(bctx, false)).toEqual([0]);
        });
        test('0 lifts to [0]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Bool));
            expect(lifter(bctx, 0)).toEqual([0]);
        });
        test('1 lifts to [1]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Bool));
            expect(lifter(bctx, 1)).toEqual([1]);
        });
    });

    describe('s8', () => {
        test('127 lifts to [127]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.S8));
            expect(lifter(bctx, 127)).toEqual([127]);
        });
        test('-128 lifts to [-128]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.S8));
            expect(lifter(bctx, -128)).toEqual([-128]);
        });
        test('255 wraps to [-1]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.S8));
            expect(lifter(bctx, 255)).toEqual([-1]);
        });
    });

    describe('u8', () => {
        test('255 lifts to [255]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.U8));
            expect(lifter(bctx, 255)).toEqual([255]);
        });
        test('0 lifts to [0]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.U8));
            expect(lifter(bctx, 0)).toEqual([0]);
        });
        test('256 truncates to [0]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.U8));
            expect(lifter(bctx, 256)).toEqual([0]);
        });
    });

    describe('s16', () => {
        test('32767 lifts to [32767]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.S16));
            expect(lifter(bctx, 32767)).toEqual([32767]);
        });
        test('-32768 lifts to [-32768]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.S16));
            expect(lifter(bctx, -32768)).toEqual([-32768]);
        });
    });

    describe('u16', () => {
        test('65535 lifts to [65535]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.U16));
            expect(lifter(bctx, 65535)).toEqual([65535]);
        });
        test('0 lifts to [0]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.U16));
            expect(lifter(bctx, 0)).toEqual([0]);
        });
    });

    describe('s32', () => {
        test('2147483647 lifts to [2147483647]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.S32));
            expect(lifter(bctx, 2147483647)).toEqual([2147483647]);
        });
        test('-1 lifts to [-1]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.S32));
            expect(lifter(bctx, -1)).toEqual([-1]);
        });
    });

    describe('u32', () => {
        test('0 lifts to [0]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.U32));
            expect(lifter(bctx, 0)).toEqual([0]);
        });
        test('4294967295 lifts to [4294967295]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.U32));
            expect(lifter(bctx, 4294967295)).toEqual([4294967295]);
        });
        test('-1 lifts to [4294967295]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.U32));
            expect(lifter(bctx, -1)).toEqual([4294967295]);
        });
    });

    describe('s64 (BigInt mode)', () => {
        test('0n lifts to [0n]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.S64));
            expect(lifter(bctx, 0n)).toEqual([0n]);
        });
        test('-1n lifts to [-1n]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.S64));
            expect(lifter(bctx, -1n)).toEqual([-1n]);
        });
    });

    describe('u64 (BigInt mode)', () => {
        test('0n lifts to [0n]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.U64));
            expect(lifter(bctx, 0n)).toEqual([0n]);
        });
        test('max u64 lifts correctly', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.U64));
            const maxU64 = BigInt(2) ** BigInt(64) - 1n;
            expect(lifter(bctx, maxU64)).toEqual([18446744073709551615n]);
        });
    });

    describe('f32', () => {
        test('3.14 lifts to [Math.fround(3.14)]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Float32));
            expect(lifter(bctx, 3.14)).toEqual([Math.fround(3.14)]);
        });
        test('0 lifts to [0]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Float32));
            expect(lifter(bctx, 0)).toEqual([0]);
        });
    });

    describe('f64', () => {
        test('pi lifts to [pi]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Float64));
            expect(lifter(bctx, 3.141592653589793)).toEqual([3.141592653589793]);
        });
        test('0 lifts to [0]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Float64));
            expect(lifter(bctx, 0)).toEqual([0]);
        });
    });

    describe('char', () => {
        test('\'A\' lifts to [65]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Char));
            expect(lifter(bctx, 'A')).toEqual([65]);
        });
        test('\'€\' lifts to [8364]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Char));
            expect(lifter(bctx, '€')).toEqual([8364]);
        });
        test('\'🎉\' lifts to [127881]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Char));
            expect(lifter(bctx, '🎉')).toEqual([127881]);
        });
    });
});

describeDebugOnly('primitive lowering (WASM → JS)', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    describe('bool', () => {
        test('1 lowers to true', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Bool));
            expect(lowerer(bctx, 1)).toBe(true);
        });
        test('0 lowers to false', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Bool));
            expect(lowerer(bctx, 0)).toBe(false);
        });
        test('42 lowers to true', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Bool));
            expect(lowerer(bctx, 42)).toBe(true);
        });
    });

    describe('s8', () => {
        test('127 lowers to 127', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.S8));
            expect(lowerer(bctx, 127)).toBe(127);
        });
        test('0xFF lowers to -1', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.S8));
            expect(lowerer(bctx, 0xFF)).toBe(-1);
        });
    });

    describe('u8', () => {
        test('255 lowers to 255', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.U8));
            expect(lowerer(bctx, 255)).toBe(255);
        });
        test('0x1FF masks to 255', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.U8));
            expect(lowerer(bctx, 0x1FF)).toBe(255);
        });
    });

    describe('s16', () => {
        test('0xFFFF lowers to -1', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.S16));
            expect(lowerer(bctx, 0xFFFF)).toBe(-1);
        });
        test('32767 lowers to 32767', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.S16));
            expect(lowerer(bctx, 32767)).toBe(32767);
        });
    });

    describe('u16', () => {
        test('0x1FFFF masks to 65535', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.U16));
            expect(lowerer(bctx, 0x1FFFF)).toBe(65535);
        });
    });

    describe('s32', () => {
        test('0xFFFFFFFF lowers to -1', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.S32));
            expect(lowerer(bctx, 0xFFFFFFFF)).toBe(-1);
        });
    });

    describe('u32', () => {
        test('-1 lowers to 4294967295', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.U32));
            expect(lowerer(bctx, -1)).toBe(4294967295);
        });
    });

    describe('s64 (BigInt mode)', () => {
        test('0n lowers to 0n', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.S64));
            expect(lowerer(bctx, 0n)).toBe(0n);
        });
        test('-1n lowers to -1n', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.S64));
            expect(lowerer(bctx, -1n)).toBe(-1n);
        });
    });

    describe('u64 (BigInt mode)', () => {
        test('0n lowers to 0n', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.U64));
            expect(lowerer(bctx, 0n)).toBe(0n);
        });
    });

    describe('f32', () => {
        test('3.14 lowers to Math.fround(3.14)', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Float32));
            expect(lowerer(bctx, 3.14)).toBe(Math.fround(3.14));
        });
    });

    describe('f64', () => {
        test('Math.PI lowers to Math.PI', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Float64));
            expect(lowerer(bctx, Math.PI)).toBe(Math.PI);
        });
    });

    describe('char', () => {
        test('65 lowers to \'A\'', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Char));
            expect(lowerer(bctx, 65)).toBe('A');
        });
        test('8364 lowers to \'€\'', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Char));
            expect(lowerer(bctx, 8364)).toBe('€');
        });
        test('127881 lowers to \'🎉\'', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Char));
            expect(lowerer(bctx, 127881)).toBe('🎉');
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
