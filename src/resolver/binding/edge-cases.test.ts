// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { initializeAsserts } from '../../utils/assert';
initializeAsserts();

import { ModelTag } from '../../model/tags';
import { ComponentValType, PrimitiveValType } from '../../model/types';
import { ResolverContext, BindingContext, StringEncoding } from '../types';
import { createResourceTable } from '../context';
import { createLifting as _createLifting, createFunctionLifting } from './to-abi';
import { createLowering, createFunctionLowering } from './to-js';
import { storeToMemory, loadFromMemory } from './test-helpers';
import { WasmPointer, WasmSize, WasmValue } from './types';
import { deepResolveType } from '../calling-convention';
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
            canonicalResourceIds: new Map(),
            ownInstanceResources: new Set(),
            componentSectionCache: new Map(),
            usesNumberForInt64,
            stringEncoding: StringEncoding.Utf8,
        },
    } as any as ResolverContext;
}

function createMinimalBctx(): BindingContext {
    return {} as any as BindingContext;
}

function createMockMemoryContext(bufferSize = 4096): { ctx: BindingContext, buffer: ArrayBuffer } {
    const buffer = new ArrayBuffer(bufferSize);
    let nextAlloc = 16; // start at 16 so ptr is never 0 for valid allocations

    const memory = {
        getMemory() {
            return { buffer } as any;
        },
        getView(ptr: WasmPointer, len: WasmSize): DataView {
            return new DataView(buffer, ptr, len);
        },
        getViewU8(ptr: WasmPointer, len: WasmSize): Uint8Array {
            return new Uint8Array(buffer, ptr, len);
        },
        readI32(ptr: WasmPointer): number {
            return new DataView(buffer).getInt32(ptr, true);
        },
        writeI32(ptr: WasmPointer, value: number): void {
            new DataView(buffer).setInt32(ptr, value, true);
        },
    };

    const allocator = {
        realloc(oldPtr: WasmPointer, oldSize: WasmSize, align: WasmSize, newSize: WasmSize): WasmPointer {
            if (newSize === 0) return 0 as WasmPointer;
            const aligned = ((nextAlloc + (align as number) - 1) & ~((align as number) - 1));
            const ptr = aligned;
            nextAlloc = aligned + (newSize as number);
            if ((oldPtr as number) !== 0 && (oldSize as number) > 0) {
                const copyLen = Math.min(oldSize as number, newSize as number);
                new Uint8Array(buffer, ptr, copyLen).set(
                    new Uint8Array(buffer, oldPtr as number, copyLen)
                );
            }
            return ptr as WasmPointer;
        },
    };

    const ctx = {
        memory,
        allocator,
        utf8Encoder: new TextEncoder(),
        utf8Decoder: new TextDecoder('utf-8', { fatal: true }),
        resources: createResourceTable(),
    } as any as BindingContext;

    return { ctx, buffer };
}

function prim(value: PrimitiveValType): ComponentValType {
    return { tag: ModelTag.ComponentValTypePrimitive, value };
}

// ─── Primitive edge cases ──────────────────────────────────────────────────

describeDebugOnly('primitive lifting edge cases', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    describe('bool coercion', () => {
        test('null coerces to [0]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Bool));
            expect(lifter(bctx, null)).toEqual([0]);
        });

        test('undefined coerces to [0]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Bool));
            expect(lifter(bctx, undefined)).toEqual([0]);
        });

        test('empty string coerces to [0]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Bool));
            expect(lifter(bctx, '')).toEqual([0]);
        });

        test('non-empty string coerces to [1]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Bool));
            expect(lifter(bctx, 'hello')).toEqual([1]);
        });

        test('-1 coerces to [1]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Bool));
            expect(lifter(bctx, -1)).toEqual([1]);
        });
    });

    describe('integer overflow/underflow', () => {
        test('s8: 128 wraps to -128', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.S8));
            expect(lifter(bctx, 128)).toEqual([-128]);
        });

        test('s8: -129 wraps to 127', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.S8));
            expect(lifter(bctx, -129)).toEqual([127]);
        });

        test('u8: -1 wraps to 255', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.U8));
            expect(lifter(bctx, -1)).toEqual([255]);
        });

        test('u8: 512 truncates to 0', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.U8));
            expect(lifter(bctx, 512)).toEqual([0]);
        });

        test('s16: 32768 wraps to -32768', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.S16));
            expect(lifter(bctx, 32768)).toEqual([-32768]);
        });

        test('s16: -32769 wraps to 32767', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.S16));
            expect(lifter(bctx, -32769)).toEqual([32767]);
        });

        test('u16: -1 wraps to 65535', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.U16));
            expect(lifter(bctx, -1)).toEqual([65535]);
        });

        test('u16: 65536 truncates to 0', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.U16));
            expect(lifter(bctx, 65536)).toEqual([0]);
        });

        test('s32: 2147483648 wraps to -2147483648', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.S32));
            expect(lifter(bctx, 2147483648)).toEqual([-2147483648]);
        });

        test('u32: -1 wraps to 4294967295', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.U32));
            expect(lifter(bctx, -1)).toEqual([4294967295]);
        });

        test('u32: 4294967296 wraps to 0', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.U32));
            expect(lifter(bctx, 4294967296)).toEqual([0]);
        });
    });

    describe('floating point special values', () => {
        test('f32: NaN lifts to NaN', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Float32));
            const result = lifter(bctx, NaN);
            expect(result).toHaveLength(1);
            expect(Number.isNaN(result[0])).toBe(true);
        });

        test('f32: Infinity lifts to Infinity', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Float32));
            expect(lifter(bctx, Infinity)).toEqual([Infinity]);
        });

        test('f32: -Infinity lifts to -Infinity', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Float32));
            expect(lifter(bctx, -Infinity)).toEqual([-Infinity]);
        });

        test('f32: -0 lifts to -0', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Float32));
            const result = lifter(bctx, -0);
            expect(Object.is(result[0], -0)).toBe(true);
        });

        test('f32: very small subnormal', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Float32));
            const result = lifter(bctx, 1e-45);
            expect(result).toHaveLength(1);
            expect(result[0]).toBe(Math.fround(1e-45));
        });

        test('f64: NaN lifts to NaN', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Float64));
            const result = lifter(bctx, NaN);
            expect(Number.isNaN(result[0])).toBe(true);
        });

        test('f64: Infinity lifts to Infinity', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Float64));
            expect(lifter(bctx, Infinity)).toEqual([Infinity]);
        });

        test('f64: -0 lifts to -0', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Float64));
            const result = lifter(bctx, -0);
            expect(Object.is(result[0], -0)).toBe(true);
        });

        test('f64: Number.MAX_VALUE lifts correctly', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Float64));
            expect(lifter(bctx, Number.MAX_VALUE)).toEqual([Number.MAX_VALUE]);
        });

        test('f64: Number.MIN_VALUE (smallest positive subnormal) lifts correctly', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Float64));
            expect(lifter(bctx, Number.MIN_VALUE)).toEqual([Number.MIN_VALUE]);
        });

        test('f64: Number.EPSILON lifts correctly', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Float64));
            expect(lifter(bctx, Number.EPSILON)).toEqual([Number.EPSILON]);
        });
    });

    describe('char edge cases', () => {
        test('null character \\0 lifts to [0]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Char));
            expect(lifter(bctx, '\0')).toEqual([0]);
        });

        test('maximum BMP character \\uFFFF lifts to [65535]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Char));
            expect(lifter(bctx, '\uFFFF')).toEqual([65535]);
        });

        test('surrogate pair emoji 😀 lifts to correct codepoint', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Char));
            expect(lifter(bctx, '😀')).toEqual([128512]);
        });

        test('multi-char string only takes first codepoint', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Char));
            expect(lifter(bctx, 'ABC')).toEqual([65]);
        });

        test('lone surrogate traps per spec', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Char));
            // 0xD800 is a lone high surrogate — not a valid Unicode scalar value
            expect(() => lifter(bctx, '\uD800')).toThrow('surrogate');
        });
    });

    describe('s64/u64 edge cases (BigInt mode)', () => {
        test('s64: large positive lifts via asIntN(52)', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.S64));
            // BigInt.asIntN(52, n) — truncates to 52 bits for safe JS number range
            expect(lifter(bctx, 42n)).toEqual([42n]);
        });

        test('u64: negative bigint wraps via asUintN', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.U64));
            expect(lifter(bctx, -1n)).toEqual([18446744073709551615n]);
        });

        test('u64: 0n lifts to [0n]', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.U64));
            expect(lifter(bctx, 0n)).toEqual([0n]);
        });
    });

    describe('s64/u64 edge cases (Number mode)', () => {
        test('s64: number lifts correctly', () => {
            const rctxNum = createMinimalRctx(true);
            const lifter = createLifting(rctxNum.resolved, prim(PrimitiveValType.S64));
            expect(lifter(bctx, 42n)).toEqual([42]);
        });

        test('u64: number lifts correctly', () => {
            const rctxNum = createMinimalRctx(true);
            const lifter = createLifting(rctxNum.resolved, prim(PrimitiveValType.U64));
            expect(lifter(bctx, 42n)).toEqual([42]);
        });
    });
});

describeDebugOnly('primitive lowering edge cases', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    describe('bool edge cases', () => {
        test('-1 lowers to true', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Bool));
            expect(lowerer(bctx, -1)).toBe(true);
        });

        test('0.5 lowers to true (non-zero)', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Bool));
            expect(lowerer(bctx, 0.5)).toBe(true);
        });
    });

    describe('integer overflow in lowering', () => {
        test('s8: 128 wraps to -128', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.S8));
            expect(lowerer(bctx, 128)).toBe(-128);
        });

        test('s8: 256 wraps to 0', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.S8));
            expect(lowerer(bctx, 256)).toBe(0);
        });

        test('u8: -1 wraps to 255', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.U8));
            expect(lowerer(bctx, -1)).toBe(255);
        });

        test('s16: 32768 wraps to -32768', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.S16));
            expect(lowerer(bctx, 32768)).toBe(-32768);
        });

        test('u16: -1 wraps to 65535', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.U16));
            expect(lowerer(bctx, -1)).toBe(65535);
        });

        test('s32: 2147483648.0 wraps to -2147483648', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.S32));
            expect(lowerer(bctx, 2147483648)).toBe(-2147483648);
        });

        test('u32: 4294967296 wraps to 0', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.U32));
            expect(lowerer(bctx, 4294967296)).toBe(0);
        });
    });

    describe('float special values in lowering', () => {
        test('f32: NaN lowers to NaN', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Float32));
            expect(Number.isNaN(lowerer(bctx, NaN))).toBe(true);
        });

        test('f32: Infinity lowers to Infinity', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Float32));
            expect(lowerer(bctx, Infinity)).toBe(Infinity);
        });

        test('f32: -0 lowers to -0', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Float32));
            expect(Object.is(lowerer(bctx, -0), -0)).toBe(true);
        });

        test('f64: NaN lowers to NaN', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Float64));
            expect(Number.isNaN(lowerer(bctx, NaN))).toBe(true);
        });

        test('f64: -0 lowers to -0', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Float64));
            expect(Object.is(lowerer(bctx, -0), -0)).toBe(true);
        });
    });

    describe('char edge cases in lowering', () => {
        test('0 lowers to null character', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Char));
            expect(lowerer(bctx, 0)).toBe('\0');
        });

        test('128512 lowers to 😀', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Char));
            expect(lowerer(bctx, 128512)).toBe('😀');
        });

        test('0x10FFFF (max unicode) lowers to valid char', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Char));
            const result = lowerer(bctx, 0x10FFFF);
            expect(typeof result).toBe('string');
            expect(result.codePointAt(0)).toBe(0x10FFFF);
        });

        test('surrogate codepoint 0xD800 traps per spec', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Char));
            expect(() => lowerer(bctx, 0xD800)).toThrow('surrogate');
        });

        test('surrogate codepoint 0xDFFF traps per spec', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Char));
            expect(() => lowerer(bctx, 0xDFFF)).toThrow('surrogate');
        });

        test('codepoint >= 0x110000 traps per spec', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Char));
            expect(() => lowerer(bctx, 0x110000)).toThrow('0x110000');
        });
    });

    describe('s64/u64 number mode lowering', () => {
        test('s64 number mode returns JS number', () => {
            const rctxNum = createMinimalRctx(true);
            const lowerer = createLowering(rctxNum.resolved, prim(PrimitiveValType.S64));
            expect(lowerer(bctx, 42n)).toBe(42);
            expect(typeof lowerer(bctx, 42n)).toBe('number');
        });

        test('u64 number mode returns JS number', () => {
            const rctxNum = createMinimalRctx(true);
            const lowerer = createLowering(rctxNum.resolved, prim(PrimitiveValType.U64));
            expect(lowerer(bctx, 42n)).toBe(42);
            expect(typeof lowerer(bctx, 42n)).toBe('number');
        });
    });
});

// ─── String edge cases ─────────────────────────────────────────────────────

describeDebugOnly('string edge cases', () => {
    test('empty string lifts to [0, 0]', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();
        const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.String));
        expect(lifter(ctx, '')).toEqual([0, 0]);
    });

    test('non-string throws TypeError', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();
        const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.String));
        expect(() => lifter(ctx, 42 as any)).toThrow('expected a string');
    });

    test('multi-byte UTF-8 string lifts correctly', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();
        const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.String));

        const original = '日本語テスト';
        const [ptr, len] = lifter(ctx, original);
        expect(len).toBeGreaterThan(original.length); // UTF-8 is longer than UTF-16
        expect(ptr).toBeGreaterThan(0);
    });

    test('emoji string lifts correctly', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();
        const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.String));

        const original = '🎉🚀💻';
        const [ptr, len] = lifter(ctx, original);
        // 3 emoji × 4 bytes each = 12 bytes UTF-8
        expect(len).toBe(12);
        expect(ptr).toBeGreaterThan(0);
    });

    test('string with null byte round-trips', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();
        const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.String));
        const rctx2 = createMinimalRctx();
        const lowerer = createLowering(rctx2.resolved, prim(PrimitiveValType.String));

        const original = 'hello\0world';
        const [ptr, len] = lifter(ctx, original);
        const result = lowerer(ctx, ptr, len);
        expect(result).toBe(original);
    });

    test('very long string lifts correctly', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();
        const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.String));
        const original = 'x'.repeat(1000);
        const [ptr, len] = lifter(ctx, original);
        expect(len).toBe(1000);
        expect(ptr).toBeGreaterThan(0);
    });
});

// ─── Compound type edge cases ──────────────────────────────────────────────

describeDebugOnly('option edge cases', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    test('false is Some(false) for option<bool>, not None', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedOption as const,
            value: prim(PrimitiveValType.Bool),
        };
        const lifter = createLifting(rctx.resolved, model);
        expect(lifter(bctx, false)).toEqual([1, 0]); // Some(false)
    });

    test('0 is Some(0) for option<u32>, not None', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedOption as const,
            value: prim(PrimitiveValType.U32),
        };
        const lifter = createLifting(rctx.resolved, model);
        expect(lifter(bctx, 0)).toEqual([1, 0]); // Some(0)
    });

    test('empty string is Some("") for option<string>', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedOption as const,
            value: prim(PrimitiveValType.String),
        };
        const { ctx } = createMockMemoryContext();
        const lifter = createLifting(rctx.resolved, model);
        const result = lifter(ctx, '');
        expect(result[0]).toBe(1); // discriminant = Some
        // ptr=0, len=0 for empty string
        expect(result[1]).toBe(0);
        expect(result[2]).toBe(0);
    });

    test('option<u32> lowering: discriminant > 1 traps per spec', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedOption as const,
            value: prim(PrimitiveValType.U32),
        };
        const lowerer = createLowering(rctx.resolved, model);
        // Per CM spec, option is variant with 2 cases — discriminant must be 0 or 1
        expect(() => lowerer(bctx, 2, 42)).toThrow('Invalid option discriminant');
    });
});

describeDebugOnly('result edge cases', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    test('result with no ok and no err (both undefined)', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedResult as const,
            // neither ok nor err specified
        };
        const lifter = createLifting(rctx.resolved, model);
        // No ok/err → discriminant only, no payload slot
        expect(lifter(bctx, { tag: 'ok' })).toEqual([0]);
        expect(lifter(bctx, { tag: 'err' })).toEqual([1]);
    });

    test('result lowering with neither ok nor err returns undefined vals', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedResult as const,
        };
        const lowerer = createLowering(rctx.resolved, model);
        expect(lowerer(bctx, 0, 0)).toEqual({ tag: 'ok', val: undefined });
        expect(lowerer(bctx, 1, 0)).toEqual({ tag: 'err', val: undefined });
    });

    test('result lowering: discriminant > 1 traps per spec', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedResult as const,
            ok: prim(PrimitiveValType.U32),
        };
        const lowerer = createLowering(rctx.resolved, model);
        expect(() => lowerer(bctx, 2, 0)).toThrow('Invalid result discriminant');
    });
});

describeDebugOnly('variant edge cases', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    test('single-case variant lifts to [0, ...]', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedVariant as const,
            variants: [
                { name: 'only', ty: prim(PrimitiveValType.U32) },
            ],
        };
        const lifter = createLifting(rctx.resolved, model);
        expect(lifter(bctx, { tag: 'only', val: 99 })).toEqual([0, 99]);
    });

    test('variant with no-payload case lifts correctly', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedVariant as const,
            variants: [
                { name: 'nothing' },
                { name: 'something', ty: prim(PrimitiveValType.U32) },
            ],
        };
        const lifter = createLifting(rctx.resolved, model);
        expect(lifter(bctx, { tag: 'nothing' })).toEqual([0, 0]);
    });

    test('variant unknown tag throws', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedVariant as const,
            variants: [
                { name: 'a' },
                { name: 'b' },
            ],
        };
        const lifter = createLifting(rctx.resolved, model);
        expect(() => lifter(bctx, { tag: 'c' })).toThrow('Unknown variant case: c');
    });

    test('variant with many cases uses correct discriminant', () => {
        const cases = Array.from({ length: 300 }, (_, i) => ({ name: `case${i}` }));
        const model = {
            tag: ModelTag.ComponentTypeDefinedVariant as const,
            variants: cases,
        };
        const lifter = createLifting(rctx.resolved, model);
        expect(lifter(bctx, { tag: 'case299' })[0]).toBe(299);
    });
});

describeDebugOnly('enum edge cases', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    test('single-member enum', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedEnum as const,
            members: ['only'],
        };
        const lifter = createLifting(rctx.resolved, model);
        expect(lifter(bctx, 'only')).toEqual([0]);
    });

    test('unknown enum member throws', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedEnum as const,
            members: ['a', 'b'],
        };
        const lifter = createLifting(rctx.resolved, model);
        expect(() => lifter(bctx, 'c')).toThrow('Unknown enum value: c');
    });

    test('many-member enum with index > 255 (needs u16 discriminant)', () => {
        const members = Array.from({ length: 300 }, (_, i) => `val${i}`);
        const model = {
            tag: ModelTag.ComponentTypeDefinedEnum as const,
            members,
        };
        const lifter = createLifting(rctx.resolved, model);
        expect(lifter(bctx, 'val299')).toEqual([299]);
    });

    test('lowering out-of-range discriminant traps per spec', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedEnum as const,
            members: ['a', 'b'],
        };
        const lowerer = createLowering(rctx.resolved, model);
        expect(() => lowerer(bctx, 5)).toThrow('Invalid enum discriminant');
    });
});

describeDebugOnly('flags edge cases', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    test('single flag set', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedFlags as const,
            members: ['a'],
        };
        const lifter = createLifting(rctx.resolved, model);
        expect(lifter(bctx, { a: true })).toEqual([1]);
    });

    test('zero flags (empty members)', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedFlags as const,
            members: [],
        };
        const lifter = createLifting(rctx.resolved, model);
        expect(lifter(bctx, {})).toEqual([0]);
    });

    test('exactly 32 flags uses 1 word', () => {
        const members = Array.from({ length: 32 }, (_, i) => `f${i}`);
        const model = {
            tag: ModelTag.ComponentTypeDefinedFlags as const,
            members,
        };
        const lifter = createLifting(rctx.resolved, model);
        // Use a separate rctx to avoid memoize cache collision with lifter
        const rctx2 = createMinimalRctx();
        const lowerer = createLowering(rctx2.resolved, {
            tag: ModelTag.ComponentTypeDefinedFlags as const,
            members,
        });
        expect((lowerer as any).spill).toBe(1);

        const flags: Record<string, boolean> = {};
        for (const m of members) flags[m] = false;
        flags['f31'] = true;
        const result = lifter(bctx, flags);
        expect(result).toEqual([-2147483648]); // bit 31 set = 0x80000000 as signed i32
    });

    test('exactly 33 flags uses 2 words', () => {
        const members = Array.from({ length: 33 }, (_, i) => `f${i}`);
        const model = {
            tag: ModelTag.ComponentTypeDefinedFlags as const,
            members,
        };
        const lowerer = createLowering(rctx.resolved, model);
        expect((lowerer as any).spill).toBe(2);
    });

    test('flags with extra properties in input are ignored', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedFlags as const,
            members: ['a', 'b'],
        };
        const lifter = createLifting(rctx.resolved, model);
        expect(lifter(bctx, { a: true, b: false, c: true } as any)).toEqual([1]);
    });

    test('lowering 0xFFFFFFFF sets all 32 flags', () => {
        const members = Array.from({ length: 32 }, (_, i) => `f${i}`);
        const model = {
            tag: ModelTag.ComponentTypeDefinedFlags as const,
            members,
        };
        const lowerer = createLowering(rctx.resolved, model);
        const result = lowerer(bctx, -1); // 0xFFFFFFFF as signed i32
        for (const m of members) {
            expect(result[m]).toBe(true);
        }
    });
});

describeDebugOnly('tuple edge cases', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    test('empty tuple lifts to []', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedTuple as const,
            members: [],
        };
        const lifter = createLifting(rctx.resolved, model);
        expect(lifter(bctx, [])).toEqual([]);
    });

    test('empty tuple lowers to []', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedTuple as const,
            members: [],
        };
        const lowerer = createLowering(rctx.resolved, model);
        expect(lowerer(bctx)).toEqual([]);
    });

    test('empty tuple spill is 0', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedTuple as const,
            members: [],
        };
        const lowerer = createLowering(rctx.resolved, model);
        expect((lowerer as any).spill).toBe(0);
    });

    test('single-element tuple', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedTuple as const,
            members: [prim(PrimitiveValType.U32)],
        };
        const lifter = createLifting(rctx.resolved, model);
        expect(lifter(bctx, [42])).toEqual([42]);
    });

    test('tuple with mixed types', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedTuple as const,
            members: [
                prim(PrimitiveValType.Bool),
                prim(PrimitiveValType.U32),
                prim(PrimitiveValType.Bool),
            ],
        };
        const lifter = createLifting(rctx.resolved, model);
        expect(lifter(bctx, [true, 42, false])).toEqual([1, 42, 0]);
    });
});

// ─── Record edge cases ─────────────────────────────────────────────────────

describeDebugOnly('record edge cases', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    test('empty record lifts to []', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedRecord as const,
            members: [],
        };
        const lifter = createLifting(rctx.resolved, model);
        expect(lifter(bctx, {})).toEqual([]);
    });

    test('empty record lowers to {}', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedRecord as const,
            members: [],
        };
        const lowerer = createLowering(rctx.resolved, model);
        expect(lowerer(bctx)).toEqual({});
    });

    test('record with missing field reads undefined', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedRecord as const,
            members: [
                { name: 'a', type: prim(PrimitiveValType.U32) },
                { name: 'b', type: prim(PrimitiveValType.U32) },
            ],
        };
        const lifter = createLifting(rctx.resolved, model);
        // Missing field 'b' → undefined is cast to number → 0 via u32 mask
        const result = lifter(bctx, { a: 42 } as any);
        expect(result).toEqual([42, 0]);
    });

    test('record with extra fields ignores them', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedRecord as const,
            members: [
                { name: 'x', type: prim(PrimitiveValType.U32) },
            ],
        };
        const lifter = createLifting(rctx.resolved, model);
        expect(lifter(bctx, { x: 1, y: 2 })).toEqual([1]);
    });

    test('record round-trip through lowering', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedRecord as const,
            members: [
                { name: 'name', type: prim(PrimitiveValType.U32) },
                { name: 'value', type: prim(PrimitiveValType.Bool) },
            ],
        };
        const lifter = createLifting(rctx.resolved, model);
        const rctx2 = createMinimalRctx();
        const lowerer = createLowering(rctx2.resolved, model);
        const original = { name: 99, value: true };
        const lifted = lifter(bctx, original);
        const lowered = lowerer(bctx, ...lifted);
        expect(lowered).toEqual(original);
    });
});

// ─── List edge cases ───────────────────────────────────────────────────────

describeDebugOnly('list edge cases', () => {
    test('list with single element', () => {
        const rctx = createMinimalRctx();
        const { ctx, buffer } = createMockMemoryContext();
        const model = {
            tag: ModelTag.ComponentTypeDefinedList as const,
            value: prim(PrimitiveValType.U8),
        };
        const lifter = createLifting(rctx.resolved, model);
        const result = lifter(ctx, [255]);
        expect(result).toHaveLength(2);
        const [ptr, len] = result;
        expect(len).toBe(1);
        const view = new Uint8Array(buffer, ptr as number, 1);
        expect(view[0]).toBe(255);
    });

    test('list<bool> with falsy values are all Some', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();
        const model = {
            tag: ModelTag.ComponentTypeDefinedList as const,
            value: prim(PrimitiveValType.Bool),
        };
        const lifter = createLifting(rctx.resolved, model);
        const rctx2 = createMinimalRctx();
        const lowerer = createLowering(rctx2.resolved, model);
        const [ptr, len] = lifter(ctx, [false, false, false]);
        const result = lowerer(ctx, ptr, len);
        expect(result).toEqual([false, false, false]);
    });

    test('list lowering with len=0 gives empty array regardless of ptr', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();
        const model = {
            tag: ModelTag.ComponentTypeDefinedList as const,
            value: prim(PrimitiveValType.U32),
        };
        const lowerer = createLowering(rctx.resolved, model);
        expect(lowerer(ctx, 999, 0)).toEqual([]);
    });

    test('nested list<list<u8>> round-trip', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();
        const innerModel = {
            tag: ModelTag.ComponentTypeDefinedList as const,
            value: prim(PrimitiveValType.U8),
        };
        rctx.resolved.resolvedTypes.set(0 as any, innerModel as any);
        const outerModel = {
            tag: ModelTag.ComponentTypeDefinedList as const,
            value: { tag: ModelTag.ComponentValTypeType, value: 0 } as ComponentValType,
        };
        const lifter = createLifting(rctx.resolved, outerModel);
        const rctx2 = createMinimalRctx();
        rctx2.resolved.resolvedTypes.set(0 as any, innerModel as any);
        const lowerer = createLowering(rctx2.resolved, outerModel);

        const original = [[1, 2], [3, 4, 5], []];
        const [ptr, len] = lifter(ctx, original);
        expect(len).toBe(3);
        const result = lowerer(ctx, ptr, len);
        expect(result).toEqual(original);
    });
});

// ─── Resource edge cases ───────────────────────────────────────────────────

describeDebugOnly('resource edge cases', () => {
    test('own: lifting null/undefined still stores it', () => {
        const rctx = createMinimalRctx();
        const bctx = { resources: createResourceTable() } as any as BindingContext;
        const ownModel = { tag: ModelTag.ComponentTypeDefinedOwn, value: 0 };
        const lifter = createLifting(rctx.resolved, ownModel as any);
        const [handle] = lifter(bctx, null);
        expect(handle).toBeGreaterThan(0);
        expect(bctx.resources.get(0, handle as number)).toBeNull();
    });

    test('own: lifting a primitive value stores it', () => {
        const rctx = createMinimalRctx();
        const bctx = { resources: createResourceTable() } as any as BindingContext;
        const ownModel = { tag: ModelTag.ComponentTypeDefinedOwn, value: 0 };
        const lifter = createLifting(rctx.resolved, ownModel as any);
        const [handle] = lifter(bctx, 42);
        expect(handle).toBeGreaterThan(0);
        expect(bctx.resources.get(0, handle as number)).toBe(42);
    });

    test('borrow: lowering invalid handle throws', () => {
        const rctx = createMinimalRctx();
        const bctx = { resources: createResourceTable() } as any as BindingContext;
        const borrowModel = { tag: ModelTag.ComponentTypeDefinedBorrow, value: 0 };
        const lowerer = createLowering(rctx.resolved, borrowModel as any);
        expect(() => lowerer(bctx, 999)).toThrow('Invalid resource handle');
    });

    test('resource table handles are monotonically increasing', () => {
        const resources = createResourceTable();
        const h1 = resources.add(0, 'a');
        const h2 = resources.add(0, 'b');
        const h3 = resources.add(0, 'c');
        expect(h2).toBeGreaterThan(h1);
        expect(h3).toBeGreaterThan(h2);
    });

    test('resource table: remove then add reuses no old handles', () => {
        const resources = createResourceTable();
        const h1 = resources.add(0, 'a');
        resources.remove(0, h1);
        const h2 = resources.add(0, 'b');
        // Handle should not reuse removed handle (implementation-dependent,
        // but our implementation uses monotonically increasing counters)
        expect(h2).toBeGreaterThan(h1);
    });
});

// ─── Memory round-trip edge cases ──────────────────────────────────────────

describeDebugOnly('storeToMemory/loadFromMemory round-trips', () => {
    test('record with alignment padding round-trips', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();

        // Record { a: u8, b: u32 } — u8 at offset 0, padding 3 bytes, u32 at offset 4
        const model = {
            tag: ModelTag.ComponentTypeDefinedRecord as const,
            members: [
                { name: 'a', type: prim(PrimitiveValType.U8) },
                { name: 'b', type: prim(PrimitiveValType.U32) },
            ],
        };

        const lifter = createLifting(rctx.resolved, model);
        const rctx2 = createMinimalRctx();
        const lowerer = createLowering(rctx2.resolved, model);
        const original = { a: 255, b: 4294967295 };
        const lifted = lifter(ctx, original);
        const lowered = lowerer(ctx, ...lifted);
        expect(lowered).toEqual(original);
    });

    test('option<string> round-trip via memory', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();

        const model = {
            tag: ModelTag.ComponentTypeDefinedOption as const,
            value: prim(PrimitiveValType.String),
        };

        const lifter = createLifting(rctx.resolved, model);
        const rctx2 = createMinimalRctx();
        createLowering(rctx2.resolved, model);

        // Some("hello")
        const liftedSome = lifter(ctx, 'hello');
        expect(liftedSome[0]).toBe(1); // Some discriminant
        // ptr and len should be valid
        expect(liftedSome[1]).toBeGreaterThanOrEqual(0);
        expect(liftedSome[2]).toBe(5); // "hello" is 5 bytes in UTF-8

        // None
        const liftedNone = lifter(ctx, null);
        expect(liftedNone[0]).toBe(0); // None discriminant
    });

    test('variant with mixed payload sizes round-trips via flat args', () => {
        const rctx = createMinimalRctx();
        const bctx = createMinimalBctx();

        const model = {
            tag: ModelTag.ComponentTypeDefinedVariant as const,
            variants: [
                { name: 'tiny', ty: prim(PrimitiveValType.U8) },
                { name: 'big', ty: prim(PrimitiveValType.U32) },
            ],
        };

        const lifter = createLifting(rctx.resolved, model);
        const rctx2 = createMinimalRctx();
        const lowerer = createLowering(rctx2.resolved, model);

        const liftedTiny = lifter(bctx, { tag: 'tiny', val: 42 });
        const loweredTiny = lowerer(bctx, ...liftedTiny);
        // tiny uses u8 lifting but lowered via u32 slot (max payload is u32)
        expect(loweredTiny).toEqual({ tag: 'tiny', val: 42 });

        const liftedBig = lifter(bctx, { tag: 'big', val: 100000 });
        const loweredBig = lowerer(bctx, ...liftedBig);
        expect(loweredBig).toEqual({ tag: 'big', val: 100000 });
    });
});

// ─── ComponentValTypeType (type reference) edge cases ──────────────────────

describeDebugOnly('type reference (ComponentValTypeType) edge cases', () => {
    test('resolves through type reference for primitives', () => {
        const rctx = createMinimalRctx();
        const bctx = createMinimalBctx();
        // Register u32 as type index 5
        rctx.resolved.resolvedTypes.set(5 as any, {
            tag: ModelTag.ComponentTypeDefinedPrimitive,
            value: PrimitiveValType.U32,
        } as any);

        const typeRef = { tag: ModelTag.ComponentValTypeType, value: 5 } as ComponentValType;
        const lifter = createLifting(rctx.resolved, typeRef);
        expect(lifter(bctx, 42)).toEqual([42]);
    });

    test('resolves through type reference for record', () => {
        const rctx = createMinimalRctx();
        const bctx = createMinimalBctx();
        const recordModel = {
            tag: ModelTag.ComponentTypeDefinedRecord,
            members: [
                { name: 'x', type: prim(PrimitiveValType.U32) },
            ],
        };
        rctx.resolved.resolvedTypes.set(10 as any, recordModel as any);

        const typeRef = { tag: ModelTag.ComponentValTypeType, value: 10 } as ComponentValType;
        const lifter = createLifting(rctx.resolved, typeRef);
        expect(lifter(bctx, { x: 7 })).toEqual([7]);
    });
});

// ─── Discriminant size boundary tests ──────────────────────────────────────

describeDebugOnly('discriminant size boundaries', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    describe('variant discriminant boundaries', () => {
        test('255 cases → u8 discriminant, last case = 254', () => {
            const cases = Array.from({ length: 255 }, (_, i) => ({ name: `c${i}` }));
            const model = { tag: ModelTag.ComponentTypeDefinedVariant as const, variants: cases };
            const lifter = createLifting(rctx.resolved, model);
            expect(lifter(bctx, { tag: 'c254' })[0]).toBe(254);
        });

        test('256 cases → u16 discriminant, case 255 correct', () => {
            const cases = Array.from({ length: 256 }, (_, i) => ({ name: `c${i}` }));
            const model = { tag: ModelTag.ComponentTypeDefinedVariant as const, variants: cases };
            const lifter = createLifting(rctx.resolved, model);
            expect(lifter(bctx, { tag: 'c255' })[0]).toBe(255);
        });

        test('256 cases lowering: discriminant 255 round-trips', () => {
            const cases = Array.from({ length: 256 }, (_, i) => ({ name: `c${i}` }));
            const model = { tag: ModelTag.ComponentTypeDefinedVariant as const, variants: cases };
            const lowerer = createLowering(rctx.resolved, model);
            expect(lowerer(bctx, 255)).toEqual({ tag: 'c255' });
        });

        test('65535 cases → u16 discriminant, last case = 65534', () => {
            const cases = Array.from({ length: 65535 }, (_, i) => ({ name: `c${i}` }));
            const model = { tag: ModelTag.ComponentTypeDefinedVariant as const, variants: cases };
            const lifter = createLifting(rctx.resolved, model);
            expect(lifter(bctx, { tag: 'c65534' })[0]).toBe(65534);
        });

        test('65536 cases → u32 discriminant, case 65535 correct', () => {
            const cases = Array.from({ length: 65536 }, (_, i) => ({ name: `c${i}` }));
            const model = { tag: ModelTag.ComponentTypeDefinedVariant as const, variants: cases };
            const lifter = createLifting(rctx.resolved, model);
            expect(lifter(bctx, { tag: 'c65535' })[0]).toBe(65535);
        });

        test('65536 cases lowering: discriminant 65535 round-trips', () => {
            const cases = Array.from({ length: 65536 }, (_, i) => ({ name: `c${i}` }));
            const model = { tag: ModelTag.ComponentTypeDefinedVariant as const, variants: cases };
            const lowerer = createLowering(rctx.resolved, model);
            expect(lowerer(bctx, 65535)).toEqual({ tag: 'c65535' });
        });
    });

    describe('enum discriminant boundaries', () => {
        test('255 members → u8 discriminant, last = 254', () => {
            const members = Array.from({ length: 255 }, (_, i) => `e${i}`);
            const model = { tag: ModelTag.ComponentTypeDefinedEnum as const, members };
            const lifter = createLifting(rctx.resolved, model);
            expect(lifter(bctx, 'e254')).toEqual([254]);
        });

        test('256 members → u16 discriminant, member 255 correct', () => {
            const members = Array.from({ length: 256 }, (_, i) => `e${i}`);
            const model = { tag: ModelTag.ComponentTypeDefinedEnum as const, members };
            const lifter = createLifting(rctx.resolved, model);
            expect(lifter(bctx, 'e255')).toEqual([255]);
        });

        test('256 members lowering: discriminant 255 round-trips', () => {
            const members = Array.from({ length: 256 }, (_, i) => `e${i}`);
            const model = { tag: ModelTag.ComponentTypeDefinedEnum as const, members };
            const lowerer = createLowering(rctx.resolved, model);
            expect(lowerer(bctx, 255)).toBe('e255');
        });

        test('65535 members → u16 discriminant, last = 65534', () => {
            const members = Array.from({ length: 65535 }, (_, i) => `e${i}`);
            const model = { tag: ModelTag.ComponentTypeDefinedEnum as const, members };
            const lifter = createLifting(rctx.resolved, model);
            expect(lifter(bctx, 'e65534')).toEqual([65534]);
        });

        test('65536 members → u32 discriminant', () => {
            const members = Array.from({ length: 65536 }, (_, i) => `e${i}`);
            const model = { tag: ModelTag.ComponentTypeDefinedEnum as const, members };
            const lifter = createLifting(rctx.resolved, model);
            expect(lifter(bctx, 'e65535')).toEqual([65535]);
        });

        test('65536 members lowering: discriminant 65535 round-trips', () => {
            const members = Array.from({ length: 65536 }, (_, i) => `e${i}`);
            const model = { tag: ModelTag.ComponentTypeDefinedEnum as const, members };
            const lowerer = createLowering(rctx.resolved, model);
            expect(lowerer(bctx, 65535)).toBe('e65535');
        });
    });
});

// ─── Nested compound type tests ────────────────────────────────────────────

describeDebugOnly('nested compound types', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    test('option<option<u8>> — Some(Some(42))', () => {
        const innerOption = {
            tag: ModelTag.ComponentTypeDefinedOption as const,
            value: prim(PrimitiveValType.U8),
        };
        rctx.resolved.resolvedTypes.set(0 as any, innerOption as any);
        const innerRef = { tag: ModelTag.ComponentValTypeType, value: 0 } as ComponentValType;
        const outerOption = {
            tag: ModelTag.ComponentTypeDefinedOption as const,
            value: innerRef,
        };
        const lifter = createLifting(rctx.resolved, outerOption as any);
        // Some(Some(42)): outer disc=1, inner disc=1, value=42
        const result = lifter(bctx, 42);
        expect(result[0]).toBe(1); // outer Some
        expect(result[1]).toBe(1); // inner Some
        expect(result[2]).toBe(42);
    });

    test('option<option<u8>> — null means None (outer)', () => {
        const innerOption = {
            tag: ModelTag.ComponentTypeDefinedOption as const,
            value: prim(PrimitiveValType.U8),
        };
        rctx.resolved.resolvedTypes.set(0 as any, innerOption as any);
        const innerRef = { tag: ModelTag.ComponentValTypeType, value: 0 } as ComponentValType;
        const outerOption = {
            tag: ModelTag.ComponentTypeDefinedOption as const,
            value: innerRef,
        };
        const lifter = createLifting(rctx.resolved, outerOption as any);
        // null → outer None (disc=0), because JS null is the sentinel for None
        const result = lifter(bctx, null);
        expect(result[0]).toBe(0); // outer None
    });

    test('option<option<u8>> — None', () => {
        const innerOption = {
            tag: ModelTag.ComponentTypeDefinedOption as const,
            value: prim(PrimitiveValType.U8),
        };
        rctx.resolved.resolvedTypes.set(0 as any, innerOption as any);
        const innerRef = { tag: ModelTag.ComponentValTypeType, value: 0 } as ComponentValType;
        const outerOption = {
            tag: ModelTag.ComponentTypeDefinedOption as const,
            value: innerRef,
        };
        const _lifter = createLifting(rctx.resolved, outerOption as any);
        const rctx2 = createMinimalRctx();
        rctx2.resolved.resolvedTypes.set(0 as any, innerOption as any);
        const lowerer = createLowering(rctx2.resolved, outerOption as any);
        // Lowering None: disc=0, rest padding
        const noneResult = lowerer(bctx, 0, 0, 0);
        expect(noneResult).toBeNull();
    });

    test('option<option<u8>> lowering round-trip: Some(Some(99))', () => {
        const innerOption = {
            tag: ModelTag.ComponentTypeDefinedOption as const,
            value: prim(PrimitiveValType.U8),
        };
        rctx.resolved.resolvedTypes.set(0 as any, innerOption as any);
        const innerRef = { tag: ModelTag.ComponentValTypeType, value: 0 } as ComponentValType;
        const outerOption = {
            tag: ModelTag.ComponentTypeDefinedOption as const,
            value: innerRef,
        };
        const rctx2 = createMinimalRctx();
        rctx2.resolved.resolvedTypes.set(0 as any, innerOption as any);
        const lowerer = createLowering(rctx2.resolved, outerOption as any);
        // Some(Some(99)): disc=1, inner_disc=1, value=99
        const result = lowerer(bctx, 1, 1, 99);
        expect(result).toBe(99); // inner option unwraps to 99
    });

    test('result<result<u8, u8>, u8> — Ok(Ok(42))', () => {
        const innerResult = {
            tag: ModelTag.ComponentTypeDefinedResult as const,
            ok: prim(PrimitiveValType.U8),
            err: prim(PrimitiveValType.U8),
        };
        rctx.resolved.resolvedTypes.set(0 as any, innerResult as any);
        const innerRef = { tag: ModelTag.ComponentValTypeType, value: 0 } as ComponentValType;
        const outerResult = {
            tag: ModelTag.ComponentTypeDefinedResult as const,
            ok: innerRef,
            err: prim(PrimitiveValType.U8),
        };
        const lifter = createLifting(rctx.resolved, outerResult as any);
        const result = lifter(bctx, { tag: 'ok', val: { tag: 'ok', val: 42 } });
        expect(result[0]).toBe(0); // outer ok
    });

    test('result<result<u8, u8>, u8> lowering round-trip', () => {
        const innerResult = {
            tag: ModelTag.ComponentTypeDefinedResult as const,
            ok: prim(PrimitiveValType.U8),
            err: prim(PrimitiveValType.U8),
        };
        rctx.resolved.resolvedTypes.set(0 as any, innerResult as any);
        const innerRef = { tag: ModelTag.ComponentValTypeType, value: 0 } as ComponentValType;
        const outerResult = {
            tag: ModelTag.ComponentTypeDefinedResult as const,
            ok: innerRef,
            err: prim(PrimitiveValType.U8),
        };
        const rctx2 = createMinimalRctx();
        rctx2.resolved.resolvedTypes.set(0 as any, innerResult as any);
        const lowerer = createLowering(rctx2.resolved, outerResult as any);
        // Ok(Err(77)): outer disc=0, inner disc=1, inner payload=77
        const result = lowerer(bctx, 0, 1, 77);
        expect(result).toEqual({ tag: 'ok', val: { tag: 'err', val: 77 } });
    });

    test('tuple<option<u8>, result<u32, bool>>', () => {
        const optU8 = {
            tag: ModelTag.ComponentTypeDefinedOption as const,
            value: prim(PrimitiveValType.U8),
        };
        rctx.resolved.resolvedTypes.set(0 as any, optU8 as any);
        const optRef = { tag: ModelTag.ComponentValTypeType, value: 0 } as ComponentValType;
        const resU32Bool = {
            tag: ModelTag.ComponentTypeDefinedResult as const,
            ok: prim(PrimitiveValType.U32),
            err: prim(PrimitiveValType.Bool),
        };
        rctx.resolved.resolvedTypes.set(1 as any, resU32Bool as any);
        const resRef = { tag: ModelTag.ComponentValTypeType, value: 1 } as ComponentValType;
        const tuple = {
            tag: ModelTag.ComponentTypeDefinedTuple as const,
            members: [optRef, resRef],
        };
        const lifter = createLifting(rctx.resolved, tuple as any);
        const rctx2 = createMinimalRctx();
        rctx2.resolved.resolvedTypes.set(0 as any, optU8 as any);
        rctx2.resolved.resolvedTypes.set(1 as any, resU32Bool as any);
        const lowerer = createLowering(rctx2.resolved, tuple as any);

        const lifted = lifter(bctx, [42, { tag: 'ok', val: 100 }]);
        const lowered = lowerer(bctx, ...lifted);
        expect(lowered).toEqual([42, { tag: 'ok', val: 100 }]);
    });

    test('tuple<option<u8>, result<u32, bool>> with None and Err', () => {
        const optU8 = {
            tag: ModelTag.ComponentTypeDefinedOption as const,
            value: prim(PrimitiveValType.U8),
        };
        rctx.resolved.resolvedTypes.set(0 as any, optU8 as any);
        const optRef = { tag: ModelTag.ComponentValTypeType, value: 0 } as ComponentValType;
        const resU32Bool = {
            tag: ModelTag.ComponentTypeDefinedResult as const,
            ok: prim(PrimitiveValType.U32),
            err: prim(PrimitiveValType.Bool),
        };
        rctx.resolved.resolvedTypes.set(1 as any, resU32Bool as any);
        const resRef = { tag: ModelTag.ComponentValTypeType, value: 1 } as ComponentValType;
        const tuple = {
            tag: ModelTag.ComponentTypeDefinedTuple as const,
            members: [optRef, resRef],
        };
        const lifter = createLifting(rctx.resolved, tuple as any);
        const rctx2 = createMinimalRctx();
        rctx2.resolved.resolvedTypes.set(0 as any, optU8 as any);
        rctx2.resolved.resolvedTypes.set(1 as any, resU32Bool as any);
        const lowerer = createLowering(rctx2.resolved, tuple as any);

        const lifted = lifter(bctx, [null, { tag: 'err', val: true }]);
        const lowered = lowerer(bctx, ...lifted);
        expect(lowered).toEqual([null, { tag: 'err', val: true }]);
    });

    test('variant with option payload', () => {
        const optU32 = {
            tag: ModelTag.ComponentTypeDefinedOption as const,
            value: prim(PrimitiveValType.U32),
        };
        rctx.resolved.resolvedTypes.set(0 as any, optU32 as any);
        const optRef = { tag: ModelTag.ComponentValTypeType, value: 0 } as ComponentValType;
        const variant = {
            tag: ModelTag.ComponentTypeDefinedVariant as const,
            variants: [
                { name: 'none' },
                { name: 'maybe', ty: optRef },
            ],
        };
        const lifter = createLifting(rctx.resolved, variant as any);
        const rctx2 = createMinimalRctx();
        rctx2.resolved.resolvedTypes.set(0 as any, optU32 as any);
        const lowerer = createLowering(rctx2.resolved, variant as any);

        // maybe(Some(42))
        const lifted = lifter(bctx, { tag: 'maybe', val: 42 });
        const lowered = lowerer(bctx, ...lifted);
        expect(lowered).toEqual({ tag: 'maybe', val: 42 });
    });

    test('variant with option payload — maybe(None)', () => {
        const optU32 = {
            tag: ModelTag.ComponentTypeDefinedOption as const,
            value: prim(PrimitiveValType.U32),
        };
        rctx.resolved.resolvedTypes.set(0 as any, optU32 as any);
        const optRef = { tag: ModelTag.ComponentValTypeType, value: 0 } as ComponentValType;
        const variant = {
            tag: ModelTag.ComponentTypeDefinedVariant as const,
            variants: [
                { name: 'none' },
                { name: 'maybe', ty: optRef },
            ],
        };
        const lifter = createLifting(rctx.resolved, variant as any);
        const rctx2 = createMinimalRctx();
        rctx2.resolved.resolvedTypes.set(0 as any, optU32 as any);
        const lowerer = createLowering(rctx2.resolved, variant as any);

        const lifted = lifter(bctx, { tag: 'maybe', val: null });
        const lowered = lowerer(bctx, ...lifted);
        expect(lowered).toEqual({ tag: 'maybe', val: null });
    });

    test('record with nested option and variant fields', () => {
        const optBool = {
            tag: ModelTag.ComponentTypeDefinedOption as const,
            value: prim(PrimitiveValType.Bool),
        };
        rctx.resolved.resolvedTypes.set(0 as any, optBool as any);
        const optRef = { tag: ModelTag.ComponentValTypeType, value: 0 } as ComponentValType;
        const enumModel = {
            tag: ModelTag.ComponentTypeDefinedEnum as const,
            members: ['red', 'green', 'blue'],
        };
        rctx.resolved.resolvedTypes.set(1 as any, enumModel as any);
        const enumRef = { tag: ModelTag.ComponentValTypeType, value: 1 } as ComponentValType;
        const record = {
            tag: ModelTag.ComponentTypeDefinedRecord as const,
            members: [
                { name: 'flag', type: optRef },
                { name: 'color', type: enumRef },
                { name: 'count', type: prim(PrimitiveValType.U32) },
            ],
        };
        const lifter = createLifting(rctx.resolved, record as any);
        const rctx2 = createMinimalRctx();
        rctx2.resolved.resolvedTypes.set(0 as any, optBool as any);
        rctx2.resolved.resolvedTypes.set(1 as any, enumModel as any);
        const lowerer = createLowering(rctx2.resolved, record as any);

        const original = { flag: true, color: 'green', count: 7 };
        const lifted = lifter(bctx, original);
        const lowered = lowerer(bctx, ...lifted);
        expect(lowered).toEqual(original);
    });
});

// ─── Char boundary value tests ─────────────────────────────────────────────

describeDebugOnly('char boundary values (spec-exact)', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    describe('lifting boundaries', () => {
        test('0xD7FF (last valid before surrogate range) lifts correctly', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Char));
            expect(lifter(bctx, String.fromCodePoint(0xD7FF))).toEqual([0xD7FF]);
        });

        test('0xE000 (first valid after surrogate range) lifts correctly', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Char));
            expect(lifter(bctx, String.fromCodePoint(0xE000))).toEqual([0xE000]);
        });

        test('0x10FFFF (maximum valid codepoint) lifts correctly', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Char));
            expect(lifter(bctx, String.fromCodePoint(0x10FFFF))).toEqual([0x10FFFF]);
        });

        test('0x0001 (SOH control char) lifts correctly', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Char));
            expect(lifter(bctx, '\x01')).toEqual([1]);
        });

        test('0x007F (DEL) lifts correctly', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Char));
            expect(lifter(bctx, '\x7F')).toEqual([0x7F]);
        });

        test('0x0080 (first 2-byte UTF-8 char) lifts correctly', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Char));
            expect(lifter(bctx, String.fromCodePoint(0x80))).toEqual([0x80]);
        });

        test('0x10000 (first supplementary plane char) lifts correctly', () => {
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.Char));
            expect(lifter(bctx, String.fromCodePoint(0x10000))).toEqual([0x10000]);
        });
    });

    describe('lowering boundaries', () => {
        test('0xD7FF lowers to valid character', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Char));
            const result = lowerer(bctx, 0xD7FF);
            expect(result.codePointAt(0)).toBe(0xD7FF);
        });

        test('0xD800 (start of surrogate range) traps', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Char));
            expect(() => lowerer(bctx, 0xD800)).toThrow('surrogate');
        });

        test('0xDBFF (last high surrogate) traps', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Char));
            expect(() => lowerer(bctx, 0xDBFF)).toThrow('surrogate');
        });

        test('0xDC00 (first low surrogate) traps', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Char));
            expect(() => lowerer(bctx, 0xDC00)).toThrow('surrogate');
        });

        test('0xDFFF (last low surrogate) traps', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Char));
            expect(() => lowerer(bctx, 0xDFFF)).toThrow('surrogate');
        });

        test('0xE000 (first valid after surrogates) lowers correctly', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Char));
            const result = lowerer(bctx, 0xE000);
            expect(result.codePointAt(0)).toBe(0xE000);
        });

        test('0x10FFFF (max codepoint) lowers correctly', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Char));
            const result = lowerer(bctx, 0x10FFFF);
            expect(result.codePointAt(0)).toBe(0x10FFFF);
        });

        test('0x110000 (just above max) traps', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Char));
            expect(() => lowerer(bctx, 0x110000)).toThrow('0x110000');
        });

        test('0xFFFFFFFF (very large) traps', () => {
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.Char));
            expect(() => lowerer(bctx, 0xFFFFFFFF)).toThrow('0x110000');
        });
    });
});

// ─── Multi-word flags tests ────────────────────────────────────────────────

describeDebugOnly('multi-word flags (>32 members)', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    test('33 flags: flag 32 (first in second word) lifts correctly', () => {
        const members = Array.from({ length: 33 }, (_, i) => `f${i}`);
        const model = { tag: ModelTag.ComponentTypeDefinedFlags as const, members };
        const lifter = createLifting(rctx.resolved, model);
        const flags: Record<string, boolean> = {};
        for (const m of members) flags[m] = false;
        flags['f32'] = true;
        const result = lifter(bctx, flags);
        expect(result).toHaveLength(2);
        expect(result[0]).toBe(0); // first word: no bits set
        expect(result[1]).toBe(1); // second word: bit 0 set (f32)
    });

    test('64 flags: all set in both words', () => {
        const members = Array.from({ length: 64 }, (_, i) => `f${i}`);
        const model = { tag: ModelTag.ComponentTypeDefinedFlags as const, members };
        const lifter = createLifting(rctx.resolved, model);
        const flags: Record<string, boolean> = {};
        for (const m of members) flags[m] = true;
        const result = lifter(bctx, flags);
        expect(result).toHaveLength(2);
        expect(result[0]).toBe(-1); // 0xFFFFFFFF as signed i32
        expect(result[1]).toBe(-1); // 0xFFFFFFFF as signed i32
    });

    test('64 flags lowering round-trip', () => {
        const members = Array.from({ length: 64 }, (_, i) => `f${i}`);
        const model = { tag: ModelTag.ComponentTypeDefinedFlags as const, members };
        const rctx2 = createMinimalRctx();
        const lowerer = createLowering(rctx2.resolved, model);
        // word0: bit 0 and bit 31, word1: bit 0 (f32)
        const result = lowerer(bctx, (1 | (1 << 31)), 1);
        expect(result['f0']).toBe(true);
        expect(result['f1']).toBe(false);
        expect(result['f31']).toBe(true);
        expect(result['f32']).toBe(true);
        expect(result['f33']).toBe(false);
        expect(result['f63']).toBe(false);
    });

    test('33 flags full round-trip', () => {
        const members = Array.from({ length: 33 }, (_, i) => `f${i}`);
        const model = { tag: ModelTag.ComponentTypeDefinedFlags as const, members };
        const lifter = createLifting(rctx.resolved, model);
        const rctx2 = createMinimalRctx();
        const lowerer = createLowering(rctx2.resolved, {
            tag: ModelTag.ComponentTypeDefinedFlags as const, members,
        });

        const flags: Record<string, boolean> = {};
        for (const m of members) flags[m] = false;
        flags['f0'] = true;
        flags['f15'] = true;
        flags['f31'] = true;
        flags['f32'] = true;

        const lifted = lifter(bctx, flags);
        const lowered = lowerer(bctx, ...lifted);
        expect(lowered['f0']).toBe(true);
        expect(lowered['f15']).toBe(true);
        expect(lowered['f31']).toBe(true);
        expect(lowered['f32']).toBe(true);
        expect(lowered['f1']).toBe(false);
        expect(lowered['f16']).toBe(false);
    });

    test('96 flags (3 words): spill is 3', () => {
        const members = Array.from({ length: 96 }, (_, i) => `f${i}`);
        const model = { tag: ModelTag.ComponentTypeDefinedFlags as const, members };
        const lowerer = createLowering(rctx.resolved, model);
        expect((lowerer as any).spill).toBe(3);
    });

    test('96 flags: flag 64 (first in third word) lifts correctly', () => {
        const members = Array.from({ length: 96 }, (_, i) => `f${i}`);
        const model = { tag: ModelTag.ComponentTypeDefinedFlags as const, members };
        const lifter = createLifting(rctx.resolved, model);
        const flags: Record<string, boolean> = {};
        for (const m of members) flags[m] = false;
        flags['f64'] = true;
        const result = lifter(bctx, flags);
        expect(result).toHaveLength(3);
        expect(result[0]).toBe(0);
        expect(result[1]).toBe(0);
        expect(result[2]).toBe(1);
    });
});

// ─── Bool from memory tests ────────────────────────────────────────────────

describeDebugOnly('bool from memory (non-0/1 values)', () => {
    test('loadFromMemory: value 2 reads as true', () => {
        const rctx = createMinimalRctx();
        const { ctx, buffer } = createMockMemoryContext();
        const boolType = {
            tag: ModelTag.ComponentTypeDefinedPrimitive as const,
            value: PrimitiveValType.Bool,
        };
        // Write 2 to memory
        new DataView(buffer).setUint8(100, 2);
        const result = loadFromMemory(ctx, 100, boolType as any, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(result).toBe(true);
    });

    test('loadFromMemory: value 255 reads as true', () => {
        const rctx = createMinimalRctx();
        const { ctx, buffer } = createMockMemoryContext();
        const boolType = {
            tag: ModelTag.ComponentTypeDefinedPrimitive as const,
            value: PrimitiveValType.Bool,
        };
        new DataView(buffer).setUint8(100, 255);
        const result = loadFromMemory(ctx, 100, boolType as any, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(result).toBe(true);
    });

    test('loadFromMemory: value 0 reads as false', () => {
        const rctx = createMinimalRctx();
        const { ctx, buffer } = createMockMemoryContext();
        const boolType = {
            tag: ModelTag.ComponentTypeDefinedPrimitive as const,
            value: PrimitiveValType.Bool,
        };
        new DataView(buffer).setUint8(100, 0);
        const result = loadFromMemory(ctx, 100, boolType as any, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(result).toBe(false);
    });

    test('storeToMemory: true writes 1, false writes 0', () => {
        const rctx = createMinimalRctx();
        const { ctx, buffer } = createMockMemoryContext();
        const boolType = {
            tag: ModelTag.ComponentTypeDefinedPrimitive as const,
            value: PrimitiveValType.Bool,
        };
        storeToMemory(ctx, 200, boolType as any, true, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(new DataView(buffer).getUint8(200)).toBe(1);

        storeToMemory(ctx, 204, boolType as any, false, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(new DataView(buffer).getUint8(204)).toBe(0);
    });
});

// ─── Discriminant memory round-trip tests ──────────────────────────────────

describeDebugOnly('discriminant in memory round-trips', () => {
    test('variant 256 cases via storeToMemory/loadFromMemory', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();
        const cases = Array.from({ length: 256 }, (_, i) => ({ name: `c${i}` }));
        const model = {
            tag: ModelTag.ComponentTypeDefinedVariant as const,
            variants: cases,
        };
        storeToMemory(ctx, 100, model as any, { tag: 'c255' }, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        const result = loadFromMemory(ctx, 100, model as any, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(result).toEqual({ tag: 'c255' });
    });

    test('enum 256 members via storeToMemory/loadFromMemory', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();
        const members = Array.from({ length: 256 }, (_, i) => `e${i}`);
        const model = {
            tag: ModelTag.ComponentTypeDefinedEnum as const,
            members,
        };
        storeToMemory(ctx, 100, model as any, 'e255', rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        const result = loadFromMemory(ctx, 100, model as any, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(result).toBe('e255');
    });

    test('variant with payload via memory round-trip', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();
        const model = {
            tag: ModelTag.ComponentTypeDefinedVariant as const,
            variants: [
                { name: 'small', ty: prim(PrimitiveValType.U8) },
                { name: 'big', ty: prim(PrimitiveValType.U32) },
            ],
        };
        storeToMemory(ctx, 100, model as any, { tag: 'big', val: 100000 }, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        const result = loadFromMemory(ctx, 100, model as any, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(result).toEqual({ tag: 'big', val: 100000 });
    });

    test('enum via memory at 65535 index', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();
        // For memory testing, use a smaller set but write the discriminant manually
        // to test u16 boundary — storeToMemory writes the discriminant
        const members = Array.from({ length: 300 }, (_, i) => `e${i}`);
        const model = {
            tag: ModelTag.ComponentTypeDefinedEnum as const,
            members,
        };
        storeToMemory(ctx, 100, model as any, 'e299', rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        const result = loadFromMemory(ctx, 100, model as any, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(result).toBe('e299');
    });

    test('flags via memory round-trip (single word)', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();
        const members = ['a', 'b', 'c', 'd'];
        const model = {
            tag: ModelTag.ComponentTypeDefinedFlags as const,
            members,
        };
        storeToMemory(ctx, 100, model as any, { a: true, b: false, c: true, d: false }, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        const result = loadFromMemory(ctx, 100, model as any, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(result).toEqual({ a: true, b: false, c: true, d: false });
    });

    test('flags >32 via memory round-trip (multi-word)', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();
        const members = Array.from({ length: 33 }, (_, i) => `f${i}`);
        const model = {
            tag: ModelTag.ComponentTypeDefinedFlags as const,
            members,
        };
        const flags: Record<string, boolean> = {};
        for (const m of members) flags[m] = false;
        flags['f0'] = true;
        flags['f32'] = true;
        storeToMemory(ctx, 100, model as any, flags, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        const result = loadFromMemory(ctx, 100, model as any, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(result['f0']).toBe(true);
        expect(result['f1']).toBe(false);
        expect(result['f32']).toBe(true);
    });

    test('option via memory round-trip', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();
        const model = {
            tag: ModelTag.ComponentTypeDefinedOption as const,
            value: prim(PrimitiveValType.U32),
        };
        storeToMemory(ctx, 100, model as any, 42, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        const some = loadFromMemory(ctx, 100, model as any, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(some).toBe(42);

        storeToMemory(ctx, 200, model as any, null, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        const none = loadFromMemory(ctx, 200, model as any, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(none).toBeNull();
    });

    test('result via memory round-trip', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();
        const model = {
            tag: ModelTag.ComponentTypeDefinedResult as const,
            ok: prim(PrimitiveValType.U32),
            err: prim(PrimitiveValType.U8),
        };
        storeToMemory(ctx, 100, model as any, { tag: 'ok', val: 99 }, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        const okResult = loadFromMemory(ctx, 100, model as any, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(okResult).toEqual({ tag: 'ok', val: 99 });

        storeToMemory(ctx, 200, model as any, { tag: 'err', val: 7 }, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        const errResult = loadFromMemory(ctx, 200, model as any, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(errResult).toEqual({ tag: 'err', val: 7 });
    });

    test('tuple via memory round-trip', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();
        const model = {
            tag: ModelTag.ComponentTypeDefinedTuple as const,
            members: [
                prim(PrimitiveValType.U8),
                prim(PrimitiveValType.U32),
                prim(PrimitiveValType.Bool),
            ],
        };
        storeToMemory(ctx, 100, model as any, [255, 100000, true], rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        const result = loadFromMemory(ctx, 100, model as any, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(result).toEqual([255, 100000, true]);
    });

    test('record via memory round-trip', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();
        const model = {
            tag: ModelTag.ComponentTypeDefinedRecord as const,
            members: [
                { name: 'a', type: prim(PrimitiveValType.U8) },
                { name: 'b', type: prim(PrimitiveValType.U32) },
                { name: 'c', type: prim(PrimitiveValType.Bool) },
            ],
        };
        storeToMemory(ctx, 100, model as any, { a: 42, b: 100000, c: true }, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        const result = loadFromMemory(ctx, 100, model as any, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(result).toEqual({ a: 42, b: 100000, c: true });
    });

    test('nested record via memory round-trip', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();
        const innerRecord = {
            tag: ModelTag.ComponentTypeDefinedRecord as const,
            members: [
                { name: 'x', type: prim(PrimitiveValType.U32) },
                { name: 'y', type: prim(PrimitiveValType.U32) },
            ],
        };
        rctx.resolved.resolvedTypes.set(0 as any, innerRecord as any);
        const outerRecord = deepResolveType(rctx.resolved, {
            tag: ModelTag.ComponentTypeDefinedRecord as const,
            members: [
                { name: 'name', type: prim(PrimitiveValType.U8) },
                { name: 'point', type: { tag: ModelTag.ComponentValTypeType, value: 0 } as ComponentValType },
            ],
        } as any);
        storeToMemory(ctx, 100, outerRecord as any, { name: 5, point: { x: 10, y: 20 } }, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        const result = loadFromMemory(ctx, 100, outerRecord as any, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(result).toEqual({ name: 5, point: { x: 10, y: 20 } });
    });

    test('all primitive types via memory round-trip', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();
        const types: [PrimitiveValType, any][] = [
            [PrimitiveValType.Bool, true],
            [PrimitiveValType.U8, 255],
            [PrimitiveValType.S8, -128],
            [PrimitiveValType.U16, 65535],
            [PrimitiveValType.S16, -32768],
            [PrimitiveValType.U32, 4294967295],
            [PrimitiveValType.S32, -2147483648],
            [PrimitiveValType.Float32, 3.14],
            [PrimitiveValType.Float64, 3.141592653589793],
        ];
        let offset = 100;
        for (const [primType, value] of types) {
            const model = {
                tag: ModelTag.ComponentTypeDefinedPrimitive as const,
                value: primType,
            };
            storeToMemory(ctx, offset, model as any, value, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
            const result = loadFromMemory(ctx, offset, model as any, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
            if (primType === PrimitiveValType.Float32) {
                expect(result).toBeCloseTo(value, 5);
            } else {
                expect(result).toBe(value);
            }
            offset += 16; // enough padding between values
        }
    });
});

// ─── Resource handle edge cases (additional) ───────────────────────────────

describeDebugOnly('resource handle additional edge cases', () => {
    test('own via memory round-trip', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();
        const ownModel = { tag: ModelTag.ComponentTypeDefinedOwn as const, value: 0 };
        // Add a resource and get a handle
        const _handle = ctx.resources.add(0, 'test-resource');
        // Store handle in memory
        storeToMemory(ctx, 100, ownModel as any, 'test-resource', rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        // The handle was stored by lifting (add), not directly
        // Load removes from table (own semantics)
        const result = loadFromMemory(ctx, 100, ownModel as any, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(typeof result).toBe('string');
    });

    test('borrow via memory round-trip', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();
        const borrowModel = { tag: ModelTag.ComponentTypeDefinedBorrow as const, value: 0 };
        // Add a resource to table first
        const handle = ctx.resources.add(0, 'borrowed-data');
        // Write handle to memory
        new DataView(ctx.memory.getView(100 as WasmPointer, 4 as WasmSize).buffer, 100).setInt32(0, handle, true);
        // Load borrow from memory (doesn't remove)
        const result = loadFromMemory(ctx, 100, borrowModel as any, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(result).toBe('borrowed-data');
        // Resource should still be in table (borrow doesn't remove)
        expect(ctx.resources.has(0, handle)).toBe(true);
    });

    test('multiple resource types have independent handle spaces', () => {
        const resources = createResourceTable();
        const h1 = resources.add(0, 'type-0-a');
        const h2 = resources.add(1, 'type-1-a');
        const h3 = resources.add(0, 'type-0-b');
        expect(resources.get(0, h1)).toBe('type-0-a');
        expect(resources.get(1, h2)).toBe('type-1-a');
        expect(resources.get(0, h3)).toBe('type-0-b');
        // Per-type isolation enforced: cross-type lookup throws
        expect(() => resources.get(1, h1)).toThrow('belongs to type');
    });

    test('removed resource handle is invalid', () => {
        const resources = createResourceTable();
        const h = resources.add(0, 'resource');
        resources.remove(0, h);
        expect(() => resources.get(0, h)).toThrow('Invalid resource handle');
        expect(resources.has(0, h)).toBe(false);
    });

    test('double remove throws', () => {
        const resources = createResourceTable();
        const h = resources.add(0, 'resource');
        resources.remove(0, h);
        expect(() => resources.remove(0, h)).toThrow('Invalid resource handle');
    });

    test('resource table with many handles', () => {
        const resources = createResourceTable();
        const handles: number[] = [];
        for (let i = 0; i < 1000; i++) {
            handles.push(resources.add(0, `resource-${i}`));
        }
        // All handles should be unique
        expect(new Set(handles).size).toBe(1000);
        // All should be retrievable
        for (let i = 0; i < 1000; i++) {
            expect(resources.get(0, handles[i])).toBe(`resource-${i}`);
        }
        // Remove every other one
        for (let i = 0; i < 1000; i += 2) {
            resources.remove(0, handles[i]);
        }
        // Odd ones still accessible, even ones gone
        for (let i = 0; i < 1000; i++) {
            if (i % 2 === 0) {
                expect(resources.has(0, handles[i])).toBe(false);
            } else {
                expect(resources.get(0, handles[i])).toBe(`resource-${i}`);
            }
        }
    });
});

// ─── Nested memory round-trips (complex) ──────────────────────────────────

describeDebugOnly('nested types via memory round-trips', () => {
    test('list<record{a: u8, b: u32}> via memory', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();
        const record = {
            tag: ModelTag.ComponentTypeDefinedRecord as const,
            members: [
                { name: 'a', type: prim(PrimitiveValType.U8) },
                { name: 'b', type: prim(PrimitiveValType.U32) },
            ],
        };
        rctx.resolved.resolvedTypes.set(0 as any, record as any);
        const list = {
            tag: ModelTag.ComponentTypeDefinedList as const,
            value: { tag: ModelTag.ComponentValTypeType, value: 0 } as ComponentValType,
        };
        const lifter = createLifting(rctx.resolved, list);
        const rctx2 = createMinimalRctx();
        rctx2.resolved.resolvedTypes.set(0 as any, record as any);
        const lowerer = createLowering(rctx2.resolved, list);

        const original = [{ a: 1, b: 100 }, { a: 2, b: 200 }, { a: 3, b: 300 }];
        const [ptr, len] = lifter(ctx, original);
        expect(len).toBe(3);
        const result = lowerer(ctx, ptr, len);
        expect(result).toEqual(original);
    });

    test('option<u32> via memory storeToMemory/loadFromMemory', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();
        const model = {
            tag: ModelTag.ComponentTypeDefinedOption as const,
            value: prim(PrimitiveValType.U32),
        };
        // Some(42)
        storeToMemory(ctx, 100, model as any, 42, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(loadFromMemory(ctx, 100, model as any, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds)).toBe(42);

        // None
        storeToMemory(ctx, 200, model as any, null, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(loadFromMemory(ctx, 200, model as any, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds)).toBeNull();
    });

    test('result<u32, u8> via memory stores discriminant correctly', () => {
        const rctx = createMinimalRctx();
        const { ctx, buffer } = createMockMemoryContext();
        const model = {
            tag: ModelTag.ComponentTypeDefinedResult as const,
            ok: prim(PrimitiveValType.U32),
            err: prim(PrimitiveValType.U8),
        };

        // Ok(42)
        storeToMemory(ctx, 100, model as any, { tag: 'ok', val: 42 }, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        // discriminant at byte 0 should be 0 (ok)
        expect(new DataView(buffer, 100).getUint8(0)).toBe(0);
        const okResult = loadFromMemory(ctx, 100, model as any, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(okResult).toEqual({ tag: 'ok', val: 42 });

        // Err(7)
        storeToMemory(ctx, 200, model as any, { tag: 'err', val: 7 }, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(new DataView(buffer, 200).getUint8(0)).toBe(1);
        const errResult = loadFromMemory(ctx, 200, model as any, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(errResult).toEqual({ tag: 'err', val: 7 });
    });
});

// ─── Function trampoline edge cases ────────────────────────────────────────

describeDebugOnly('function trampoline edge cases', () => {
    function createFuncRctx(): ResolverContext {
        return {
            resolved: {
                liftingCache: new Map(), loweringCache: new Map(),
                resolvedTypes: new Map(),
                usesNumberForInt64: false,
                stringEncoding: StringEncoding.Utf8,
            },
            indexes: {
                coreModules: [],
                coreInstances: [],
                coreFunctions: [],
                coreMemories: [],
                coreGlobals: [],
                coreTables: [],
                componentImports: [],
                componentExports: [],
                componentInstances: [],
                componentTypeResource: [],
                componentFunctions: [],
                componentTypes: [],
                componentSections: [],
            },
        } as any as ResolverContext;
    }

    function createFuncBctx(): { ctx: BindingContext, buffer: ArrayBuffer } {
        const buffer = new ArrayBuffer(4096);
        let nextAlloc = 64;
        const memory = {
            initialize() { },
            getMemory: () => ({ buffer } as any),
            getView(ptr: WasmPointer, len: WasmSize): DataView { return new DataView(buffer, ptr as number, len as number); },
            getViewU8(ptr: WasmPointer, len: WasmSize): Uint8Array { return new Uint8Array(buffer, ptr as number, len as number); },
            readI32(ptr: WasmPointer): number { return new DataView(buffer).getInt32(ptr as number, true); },
            writeI32(ptr: WasmPointer, val: number): void { new DataView(buffer).setInt32(ptr as number, val, true); },
        };
        const allocator = {
            initialize() { },
            alloc(newSize: WasmSize, align: WasmSize): WasmPointer {
                const aligned = ((nextAlloc + (align as number) - 1) & ~((align as number) - 1));
                nextAlloc = aligned + (newSize as number);
                return aligned as WasmPointer;
            },
            realloc(oldPtr: WasmPointer, oldSize: WasmSize, align: WasmSize, newSize: WasmSize): WasmPointer {
                if ((newSize as number) === 0) return 0 as WasmPointer;
                const aligned = ((nextAlloc + (align as number) - 1) & ~((align as number) - 1));
                nextAlloc = aligned + (newSize as number);
                if ((oldPtr as number) !== 0 && (oldSize as number) > 0) {
                    const copyLen = Math.min(oldSize as number, newSize as number);
                    new Uint8Array(buffer, aligned, copyLen).set(new Uint8Array(buffer, oldPtr as number, copyLen));
                }
                return aligned as WasmPointer;
            },
        };
        const ctx = {
            memory,
            allocator,
            utf8Encoder: new TextEncoder(),
            utf8Decoder: new TextDecoder('utf-8', { fatal: true }),
            instances: { coreInstances: [], componentInstances: [] },
            componentImports: {},
            abort: () => { },
        } as any as BindingContext;
        return { ctx, buffer };
    }

    test('lowering trampoline with named results (empty values = void)', () => {
        const rctx = createFuncRctx();
        const { ctx } = createFuncBctx();
        const func = {
            tag: ModelTag.ComponentTypeFunc,
            params: [{ name: 'a', type: prim(PrimitiveValType.U32) }],
            results: { tag: ModelTag.ComponentFuncResultNamed, values: [] },
        } as any;
        const lowerer = createFunctionLowering(rctx.resolved, func);

        let received: number | undefined;
        const mockJs = (x: number) => { received = x; };
        const wasmFunc = lowerer(ctx, mockJs as any);
        const result = wasmFunc(42);
        expect(received).toBe(42);
        expect(result).toBeUndefined();
    });

    test('lifting trampoline: exception poisons instance', () => {
        const rctx = createFuncRctx();
        const { ctx } = createFuncBctx();
        const func = {
            tag: ModelTag.ComponentTypeFunc,
            params: [],
            results: { tag: ModelTag.ComponentFuncResultUnnamed, type: prim(PrimitiveValType.U32) },
        } as any;
        const lifter = createFunctionLifting(rctx.resolved, func);

        const mockWasm = () => { throw new Error('trap!'); };
        const jsFunc = lifter(ctx, mockWasm as any);
        expect(() => jsFunc()).toThrow('trap!');
        expect(ctx.poisoned).toBe(true);
    });

    test('lifting trampoline: poisoned instance blocks further calls', () => {
        const rctx = createFuncRctx();
        const { ctx } = createFuncBctx();
        const func = {
            tag: ModelTag.ComponentTypeFunc,
            params: [],
            results: { tag: ModelTag.ComponentFuncResultNamed, values: [] },
        } as any;
        const lifter = createFunctionLifting(rctx.resolved, func);

        ctx.poisoned = true;
        const mockWasm = () => { };
        const jsFunc = lifter(ctx, mockWasm as any);
        expect(() => jsFunc()).toThrow('poisoned');
    });

    test('lifting trampoline: reentrant call is trapped', () => {
        const rctx = createFuncRctx();
        const { ctx } = createFuncBctx();
        const func = {
            tag: ModelTag.ComponentTypeFunc,
            params: [],
            results: { tag: ModelTag.ComponentFuncResultNamed, values: [] },
        } as any;
        const lifter = createFunctionLifting(rctx.resolved, func);

        ctx.inExport = true; // simulate already in export
        const mockWasm = () => { };
        const jsFunc = lifter(ctx, mockWasm as any);
        expect(() => jsFunc()).toThrow('reenter');
    });

    test('lowering trampoline with bool params and result', () => {
        const rctx = createFuncRctx();
        const { ctx } = createFuncBctx();
        const func = {
            tag: ModelTag.ComponentTypeFunc,
            params: [
                { name: 'a', type: prim(PrimitiveValType.Bool) },
                { name: 'b', type: prim(PrimitiveValType.Bool) },
            ],
            results: { tag: ModelTag.ComponentFuncResultUnnamed, type: prim(PrimitiveValType.Bool) },
        } as any;
        const lowerer = createFunctionLowering(rctx.resolved, func);

        const mockJs = (a: boolean, b: boolean) => a && b;
        const wasmFunc = lowerer(ctx, mockJs as any);
        // WASM passes i32 values, JS receives booleans
        expect(wasmFunc(1, 1)).toEqual(1); // true && true = true → lifted back to 1
        expect(wasmFunc(1, 0)).toEqual(0); // true && false = false → lifted back to 0
    });

    test('lowering trampoline with 0-param function', () => {
        const rctx = createFuncRctx();
        const { ctx } = createFuncBctx();
        const func = {
            tag: ModelTag.ComponentTypeFunc,
            params: [],
            results: { tag: ModelTag.ComponentFuncResultUnnamed, type: prim(PrimitiveValType.U32) },
        } as any;
        const lowerer = createFunctionLowering(rctx.resolved, func);

        const mockJs = () => 42;
        const wasmFunc = lowerer(ctx, mockJs as any);
        expect(wasmFunc()).toEqual(42);
    });
});

// ─── Variant lowering edge cases ───────────────────────────────────────────

describeDebugOnly('variant lowering validation', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    test('variant lowering with out-of-range discriminant throws', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedVariant as const,
            variants: [
                { name: 'a', ty: prim(PrimitiveValType.U32) },
                { name: 'b' },
            ],
        };
        const lowerer = createLowering(rctx.resolved, model);
        // discriminant 5 is out of range — throws
        expect(() => lowerer(bctx, 5, 42)).toThrow('Invalid variant discriminant');
    });

    test('variant lifting with unknown tag name throws', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedVariant as const,
            variants: [
                { name: 'a', ty: prim(PrimitiveValType.U32) },
                { name: 'b' },
            ],
        };
        const lifter = createLifting(rctx.resolved, model);
        expect(() => lifter(bctx, { tag: 'nonexistent', val: 0 })).toThrow();
    });

    test('variant with no-payload case lifts without val', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedVariant as const,
            variants: [
                { name: 'empty' },
                { name: 'data', ty: prim(PrimitiveValType.U32) },
            ],
        };
        const lifter = createLifting(rctx.resolved, model);
        const rctx2 = createMinimalRctx();
        const lowerer = createLowering(rctx2.resolved, model);
        const lifted = lifter(bctx, { tag: 'empty' });
        const lowered = lowerer(bctx, ...lifted);
        expect(lowered).toEqual({ tag: 'empty' });
    });
});

// ─── CompactUTF-16 encoding error ──────────────────────────────────────────

describeDebugOnly('CompactUTF-16 encoding', () => {
    test('lifting with CompactUTF-16 throws not-supported', () => {
        const rctx = {
            resolved: {
                liftingCache: new Map(), loweringCache: new Map(),
                resolvedTypes: new Map(),
                usesNumberForInt64: false,
                stringEncoding: StringEncoding.CompactUtf16,
            },
        } as any as ResolverContext;
        expect(() => createLifting(rctx.resolved, prim(PrimitiveValType.String)))
            .toThrow('CompactUTF-16');
    });

    test('lowering with CompactUTF-16 throws not-supported', () => {
        const rctx = {
            resolved: {
                liftingCache: new Map(), loweringCache: new Map(),
                resolvedTypes: new Map(),
                usesNumberForInt64: false,
                stringEncoding: StringEncoding.CompactUtf16,
            },
        } as any as ResolverContext;
        expect(() => createLowering(rctx.resolved, prim(PrimitiveValType.String)))
            .toThrow('CompactUTF-16');
    });
});

// ─── UTF-16 string out-of-bounds ───────────────────────────────────────────

describeDebugOnly('UTF-16 string bounds checking', () => {
    test('UTF-16 lowering out-of-bounds traps', () => {
        const rctx = {
            resolved: {
                liftingCache: new Map(), loweringCache: new Map(),
                resolvedTypes: new Map(),
                usesNumberForInt64: false,
                stringEncoding: StringEncoding.Utf16,
            },
        } as any as ResolverContext;
        const { ctx } = createMockMemoryContext(64);
        const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.String));
        // 100 code units = 200 bytes, but buffer is only 64 bytes
        expect(() => (lowerer as any)(ctx, 0, 100))
            .toThrow('out of bounds');
    });

    test('UTF-8 lowering out-of-bounds traps', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext(64);
        const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.String));
        // 100 bytes but buffer is only 64
        expect(() => (lowerer as any)(ctx, 0, 100))
            .toThrow('out of bounds');
    });
});
