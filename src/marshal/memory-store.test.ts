// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { initializeAsserts } from '../utils/assert';
initializeAsserts();

import type { WasmPointer, WasmSize, MarshalingContext, MemoryStorer } from './model/types';
import type { RecordStorerPlan, ListStorerPlan, OptionStorerPlan, ResultStorerPlan, VariantStorerPlan, EnumStorerPlan, FlagsStorerPlan, TupleStorerPlan, OwnResourceStorerPlan, FutureStorerPlan, StringStorerPlan } from './model/store-plans';
import {
    boolStorer, s8Storer, u8Storer, s16Storer, u16Storer, s32Storer, u32Storer,
    s64Storer, u64Storer, f32Storer, f64Storer, charStorer, stringStorer,
    recordStorer, listStorer, optionStorer,
    resultStorerBoth, resultStorerOkOnly, resultStorerErrOnly, resultStorerVoid,
    variantStorerDisc1, variantStorerDisc2, variantStorerDisc4,
    enumStorerDisc1, enumStorerDisc2, enumStorerDisc4,
    flagsStorer, tupleStorer,
    ownResourceStorer, borrowResourceStorer, borrowResourceDirectStorer,
    streamStorer, futureMemStorer, errorContextStorer,
    createResultWrappingStorer,
} from './memory-store';

// --- Mock helpers ---

function createMockCtx(bufferSize = 1024): { ctx: MarshalingContext, buffer: ArrayBuffer } {
    const buffer = new ArrayBuffer(bufferSize);
    let nextAlloc = 16;

    const memory = {
        getMemory: () => ({ buffer } as any),
        getView(ptr: WasmPointer, len: WasmSize): DataView {
            return new DataView(buffer, ptr as number, len as number);
        },
        getViewU8(ptr: WasmPointer, len: WasmSize): Uint8Array {
            return new Uint8Array(buffer, ptr as number, len as number);
        },
    };

    const allocator = {
        realloc(_oldPtr: WasmPointer, _oldSize: WasmSize, align: WasmSize, newSize: WasmSize): WasmPointer {
            if (newSize as number === 0) return align as unknown as WasmPointer; // match Rust cabi_realloc: returns alignment as dangling pointer
            const aligned = ((nextAlloc + (align as number) - 1) & ~((align as number) - 1));
            nextAlloc = aligned + (newSize as number);
            return aligned as WasmPointer;
        },
    };

    const resources = {
        add(_typeIdx: number, _val: any): number {
            return 42; // mock handle
        },
    };

    const streams = {
        addReadable(_typeIdx: number, _val: any): number {
            return 7;
        },
    };

    const futures = {
        addReadable(_typeIdx: number, _val: any, _storer: any): number {
            return 8;
        },
    };

    const errorContexts = {
        add(_val: any): number {
            return 9;
        },
    };

    const ctx = {
        memory,
        allocator,
        resources,
        streams,
        futures,
        errorContexts,
        utf8Encoder: new TextEncoder(),
        utf8Decoder: new TextDecoder('utf-8', { fatal: true }),
    } as any as MarshalingContext;

    return { ctx, buffer };
}

function readI32(buffer: ArrayBuffer, offset: number): number {
    return new DataView(buffer).getInt32(offset, true);
}

function readU32(buffer: ArrayBuffer, offset: number): number {
    return new DataView(buffer).getUint32(offset, true);
}

function readU8(buffer: ArrayBuffer, offset: number): number {
    return new DataView(buffer).getUint8(offset);
}

function readU16(buffer: ArrayBuffer, offset: number): number {
    return new DataView(buffer).getUint16(offset, true);
}

function readF32(buffer: ArrayBuffer, offset: number): number {
    return new DataView(buffer).getFloat32(offset, true);
}

function readF64(buffer: ArrayBuffer, offset: number): number {
    return new DataView(buffer).getFloat64(offset, true);
}

function readBigI64(buffer: ArrayBuffer, offset: number): bigint {
    return new DataView(buffer).getBigInt64(offset, true);
}

function readBigU64(buffer: ArrayBuffer, offset: number): bigint {
    return new DataView(buffer).getBigUint64(offset, true);
}

// --- Tests ---

describe('memory-store.ts', () => {
    describe('primitive storers', () => {
        test('boolStorer stores true as 1', () => {
            const { ctx, buffer } = createMockCtx();
            boolStorer(ctx, 0, true);
            expect(readU8(buffer, 0)).toBe(1);
        });

        test('boolStorer stores false as 0', () => {
            const { ctx, buffer } = createMockCtx();
            boolStorer(ctx, 0, false);
            expect(readU8(buffer, 0)).toBe(0);
        });

        test('boolStorer stores 0 as 0', () => {
            const { ctx, buffer } = createMockCtx();
            boolStorer(ctx, 0, 0);
            expect(readU8(buffer, 0)).toBe(0);
        });

        test('s8Storer stores negative value', () => {
            const { ctx, buffer } = createMockCtx();
            s8Storer(ctx, 0, -5);
            expect(new DataView(buffer).getInt8(0)).toBe(-5);
        });

        test('u8Storer masks to 8 bits', () => {
            const { ctx, buffer } = createMockCtx();
            u8Storer(ctx, 0, 0x1FF);
            expect(readU8(buffer, 0)).toBe(0xFF);
        });

        test('s16Storer stores negative value', () => {
            const { ctx, buffer } = createMockCtx();
            s16Storer(ctx, 0, -1000);
            expect(new DataView(buffer).getInt16(0, true)).toBe(-1000);
        });

        test('u16Storer masks to 16 bits', () => {
            const { ctx, buffer } = createMockCtx();
            u16Storer(ctx, 0, 0x1FFFF);
            expect(readU16(buffer, 0)).toBe(0xFFFF);
        });

        test('s32Storer stores negative value', () => {
            const { ctx, buffer } = createMockCtx();
            s32Storer(ctx, 0, -42);
            expect(readI32(buffer, 0)).toBe(-42);
        });

        test('u32Storer stores max u32', () => {
            const { ctx, buffer } = createMockCtx();
            u32Storer(ctx, 0, 0xFFFFFFFF);
            expect(readU32(buffer, 0)).toBe(0xFFFFFFFF);
        });

        test('s64Storer stores negative bigint', () => {
            const { ctx, buffer } = createMockCtx();
            s64Storer(ctx, 0, -100n);
            expect(readBigI64(buffer, 0)).toBe(-100n);
        });

        test('u64Storer stores large bigint', () => {
            const { ctx, buffer } = createMockCtx();
            u64Storer(ctx, 0, 0xFFFFFFFFFFFFFFFFn);
            expect(readBigU64(buffer, 0)).toBe(0xFFFFFFFFFFFFFFFFn);
        });

        test('f32Storer stores float', () => {
            const { ctx, buffer } = createMockCtx();
            f32Storer(ctx, 0, 3.14);
            expect(readF32(buffer, 0)).toBeCloseTo(3.14, 2);
        });

        test('f32Storer throws on non-number', () => {
            const { ctx } = createMockCtx();
            expect(() => f32Storer(ctx, 0, 'hello')).toThrow(TypeError);
        });

        test('f64Storer stores double', () => {
            const { ctx, buffer } = createMockCtx();
            f64Storer(ctx, 0, 3.141592653589793);
            expect(readF64(buffer, 0)).toBe(3.141592653589793);
        });

        test('f64Storer throws on non-number', () => {
            const { ctx } = createMockCtx();
            expect(() => f64Storer(ctx, 0, true)).toThrow(TypeError);
        });

        test('charStorer stores codepoint', () => {
            const { ctx, buffer } = createMockCtx();
            charStorer(ctx, 0, 'A');
            expect(readU32(buffer, 0)).toBe(65);
        });

        test('charStorer stores emoji codepoint', () => {
            const { ctx, buffer } = createMockCtx();
            charStorer(ctx, 0, '😀');
            expect(readU32(buffer, 0)).toBe(0x1F600);
        });

        test('charStorer throws on non-string', () => {
            const { ctx } = createMockCtx();
            expect(() => charStorer(ctx, 0, 42)).toThrow(TypeError);
        });
    });

    describe('stringStorer', () => {
        test('stores pointer and length', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: StringStorerPlan = {
                lifter: (_ctx, _val, out, offset) => {
                    out[offset] = 100; // ptr
                    out[offset + 1] = 5; // len
                    return 2;
                },
            };
            stringStorer(plan, ctx, 0, 'hello');
            expect(readI32(buffer, 0)).toBe(100);
            expect(readI32(buffer, 4)).toBe(5);
        });
    });

    describe('recordStorer', () => {
        test('stores fields at correct offsets', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: RecordStorerPlan = {
                fields: [
                    { name: 'x', offset: 0, storer: (c, p, v) => u32Storer(c, p, v) },
                    { name: 'y', offset: 4, storer: (c, p, v) => u32Storer(c, p, v) },
                ],
            };
            recordStorer(plan, ctx, 16, { x: 10, y: 20 });
            expect(readU32(buffer, 16)).toBe(10);
            expect(readU32(buffer, 20)).toBe(20);
        });

        test('throws on null input', () => {
            const { ctx } = createMockCtx();
            const plan: RecordStorerPlan = { fields: [] };
            expect(() => recordStorer(plan, ctx, 0, null)).toThrow(TypeError);
        });

        test('throws on undefined input', () => {
            const { ctx } = createMockCtx();
            const plan: RecordStorerPlan = { fields: [] };
            expect(() => recordStorer(plan, ctx, 0, undefined)).toThrow(TypeError);
        });

        test('throws on non-object input', () => {
            const { ctx } = createMockCtx();
            const plan: RecordStorerPlan = { fields: [] };
            expect(() => recordStorer(plan, ctx, 0, 42)).toThrow(TypeError);
        });
    });

    describe('listStorer', () => {
        test('stores empty list — realloc(0,0,align,0) provides dangling pointer', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: ListStorerPlan = { elemSize: 4, elemAlign: 4, elemStorer: u32Storer };
            listStorer(plan, ctx, 0, []);
            // Canonical ABI calls realloc even for empty lists; Rust's cabi_realloc
            // returns `align` as a non-null dangling pointer for size=0.
            expect(readI32(buffer, 0)).toBe(4); // ptr from realloc(0,0,4,0) = 4
            expect(readI32(buffer, 4)).toBe(0); // len
        });

        test('stores non-empty list', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: ListStorerPlan = { elemSize: 4, elemAlign: 4, elemStorer: u32Storer };
            listStorer(plan, ctx, 0, [100, 200, 300]);
            const ptr = readI32(buffer, 0);
            const len = readI32(buffer, 4);
            expect(len).toBe(3);
            expect(ptr).toBeGreaterThan(0);
            expect(readU32(buffer, ptr)).toBe(100);
            expect(readU32(buffer, ptr + 4)).toBe(200);
            expect(readU32(buffer, ptr + 8)).toBe(300);
        });

        test('throws on null input', () => {
            const { ctx } = createMockCtx();
            const plan: ListStorerPlan = { elemSize: 4, elemAlign: 4, elemStorer: u32Storer };
            expect(() => listStorer(plan, ctx, 0, null)).toThrow(TypeError);
        });

        test('throws on undefined input', () => {
            const { ctx } = createMockCtx();
            const plan: ListStorerPlan = { elemSize: 4, elemAlign: 4, elemStorer: u32Storer };
            expect(() => listStorer(plan, ctx, 0, undefined)).toThrow(TypeError);
        });
    });

    describe('optionStorer', () => {
        test('stores none for null', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: OptionStorerPlan = { payloadOffset: 4, payloadStorer: u32Storer };
            optionStorer(plan, ctx, 0, null);
            expect(readU8(buffer, 0)).toBe(0);
        });

        test('stores none for undefined', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: OptionStorerPlan = { payloadOffset: 4, payloadStorer: u32Storer };
            optionStorer(plan, ctx, 0, undefined);
            expect(readU8(buffer, 0)).toBe(0);
        });

        test('stores some with payload', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: OptionStorerPlan = { payloadOffset: 4, payloadStorer: u32Storer };
            optionStorer(plan, ctx, 16, 42);
            expect(readU8(buffer, 16)).toBe(1);
            expect(readU32(buffer, 20)).toBe(42);
        });
    });

    describe('result storers', () => {
        const okStorer: MemoryStorer = (ctx, ptr, val) => u32Storer(ctx, ptr, val);
        const errStorer: MemoryStorer = (ctx, ptr, val) => u32Storer(ctx, ptr, val);

        test('resultStorerBoth stores ok', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4, okStorer, errStorer };
            resultStorerBoth(plan, ctx, 16, { tag: 'ok', val: 99 });
            expect(readU8(buffer, 16)).toBe(0);
            expect(readU32(buffer, 20)).toBe(99);
        });

        test('resultStorerBoth stores err', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4, okStorer, errStorer };
            resultStorerBoth(plan, ctx, 16, { tag: 'err', val: 77 });
            expect(readU8(buffer, 16)).toBe(1);
            expect(readU32(buffer, 20)).toBe(77);
        });

        test('resultStorerBoth throws on null', () => {
            const { ctx } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4, okStorer, errStorer };
            expect(() => resultStorerBoth(plan, ctx, 0, null)).toThrow(TypeError);
        });

        test('resultStorerBoth throws on missing tag', () => {
            const { ctx } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4, okStorer, errStorer };
            expect(() => resultStorerBoth(plan, ctx, 0, { val: 1 })).toThrow(TypeError);
        });

        test('resultStorerOkOnly stores ok with payload', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4, okStorer };
            resultStorerOkOnly(plan, ctx, 16, { tag: 'ok', val: 55 });
            expect(readU8(buffer, 16)).toBe(0);
            expect(readU32(buffer, 20)).toBe(55);
        });

        test('resultStorerOkOnly stores err without payload', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4, okStorer };
            resultStorerOkOnly(plan, ctx, 16, { tag: 'err', val: 55 });
            expect(readU8(buffer, 16)).toBe(1);
        });

        test('resultStorerOkOnly throws on null', () => {
            const { ctx } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4, okStorer };
            expect(() => resultStorerOkOnly(plan, ctx, 0, null)).toThrow(TypeError);
        });

        test('resultStorerOkOnly throws on missing tag', () => {
            const { ctx } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4, okStorer };
            expect(() => resultStorerOkOnly(plan, ctx, 0, {})).toThrow(TypeError);
        });

        test('resultStorerErrOnly stores ok without payload', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4, errStorer };
            resultStorerErrOnly(plan, ctx, 16, { tag: 'ok', val: 55 });
            expect(readU8(buffer, 16)).toBe(0);
        });

        test('resultStorerErrOnly stores err with payload', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4, errStorer };
            resultStorerErrOnly(plan, ctx, 16, { tag: 'err', val: 88 });
            expect(readU8(buffer, 16)).toBe(1);
            expect(readU32(buffer, 20)).toBe(88);
        });

        test('resultStorerErrOnly throws on null', () => {
            const { ctx } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4, errStorer };
            expect(() => resultStorerErrOnly(plan, ctx, 0, null)).toThrow(TypeError);
        });

        test('resultStorerErrOnly throws on missing tag', () => {
            const { ctx } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4, errStorer };
            expect(() => resultStorerErrOnly(plan, ctx, 0, 'not-an-object')).toThrow(TypeError);
        });

        test('resultStorerVoid stores ok tag=0', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4 };
            resultStorerVoid(plan, ctx, 16, { tag: 'ok' });
            expect(readU8(buffer, 16)).toBe(0);
        });

        test('resultStorerVoid stores err tag=1', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4 };
            resultStorerVoid(plan, ctx, 16, { tag: 'err' });
            expect(readU8(buffer, 16)).toBe(1);
        });

        test('resultStorerVoid throws on null', () => {
            const { ctx } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4 };
            expect(() => resultStorerVoid(plan, ctx, 0, null)).toThrow(TypeError);
        });

        test('resultStorerVoid throws on missing tag', () => {
            const { ctx } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4 };
            expect(() => resultStorerVoid(plan, ctx, 0, { val: 1 })).toThrow(TypeError);
        });
    });

    describe('variant storers', () => {
        function makeVariantPlan(): VariantStorerPlan {
            return {
                payloadOffset: 4,
                nameToIndex: new Map([['alpha', 0], ['beta', 1], ['gamma', 2]]),
                caseStorers: [
                    u32Storer,
                    u32Storer,
                    undefined, // gamma has no payload
                ],
            };
        }

        test('variantStorerDisc1 stores discriminant as u8', () => {
            const { ctx, buffer } = createMockCtx();
            variantStorerDisc1(makeVariantPlan(), ctx, 16, { tag: 'beta', val: 99 });
            expect(readU8(buffer, 16)).toBe(1);
            expect(readU32(buffer, 20)).toBe(99);
        });

        test('variantStorerDisc1 stores case without payload', () => {
            const { ctx, buffer } = createMockCtx();
            variantStorerDisc1(makeVariantPlan(), ctx, 16, { tag: 'gamma' });
            expect(readU8(buffer, 16)).toBe(2);
        });

        test('variantStorerDisc1 throws on null', () => {
            const { ctx } = createMockCtx();
            expect(() => variantStorerDisc1(makeVariantPlan(), ctx, 0, null)).toThrow(TypeError);
        });

        test('variantStorerDisc1 throws on missing tag', () => {
            const { ctx } = createMockCtx();
            expect(() => variantStorerDisc1(makeVariantPlan(), ctx, 0, { val: 1 })).toThrow(TypeError);
        });

        test('variantStorerDisc1 throws on unknown case', () => {
            const { ctx } = createMockCtx();
            expect(() => variantStorerDisc1(makeVariantPlan(), ctx, 0, { tag: 'unknown' })).toThrow('Unknown variant case');
        });

        test('variantStorerDisc2 stores discriminant as u16', () => {
            const { ctx, buffer } = createMockCtx();
            variantStorerDisc2(makeVariantPlan(), ctx, 16, { tag: 'alpha', val: 55 });
            expect(readU16(buffer, 16)).toBe(0);
            expect(readU32(buffer, 20)).toBe(55);
        });

        test('variantStorerDisc2 throws on null', () => {
            const { ctx } = createMockCtx();
            expect(() => variantStorerDisc2(makeVariantPlan(), ctx, 0, null)).toThrow(TypeError);
        });

        test('variantStorerDisc2 throws on missing tag', () => {
            const { ctx } = createMockCtx();
            expect(() => variantStorerDisc2(makeVariantPlan(), ctx, 0, {})).toThrow(TypeError);
        });

        test('variantStorerDisc2 throws on unknown case', () => {
            const { ctx } = createMockCtx();
            expect(() => variantStorerDisc2(makeVariantPlan(), ctx, 0, { tag: 'nope' })).toThrow('Unknown variant case');
        });

        test('variantStorerDisc4 stores discriminant as u32', () => {
            const { ctx, buffer } = createMockCtx();
            variantStorerDisc4(makeVariantPlan(), ctx, 16, { tag: 'beta', val: 77 });
            expect(readU32(buffer, 16)).toBe(1);
            expect(readU32(buffer, 20)).toBe(77);
        });

        test('variantStorerDisc4 throws on null', () => {
            const { ctx } = createMockCtx();
            expect(() => variantStorerDisc4(makeVariantPlan(), ctx, 0, null)).toThrow(TypeError);
        });

        test('variantStorerDisc4 throws on missing tag', () => {
            const { ctx } = createMockCtx();
            expect(() => variantStorerDisc4(makeVariantPlan(), ctx, 0, { val: 1 })).toThrow(TypeError);
        });

        test('variantStorerDisc4 throws on unknown case', () => {
            const { ctx } = createMockCtx();
            expect(() => variantStorerDisc4(makeVariantPlan(), ctx, 0, { tag: 'missing' })).toThrow('Unknown variant case');
        });
    });

    describe('enum storers', () => {
        function makeEnumPlan(): EnumStorerPlan {
            return { nameToIndex: new Map([['red', 0], ['green', 1], ['blue', 2]]) };
        }

        test('enumStorerDisc1 stores as u8', () => {
            const { ctx, buffer } = createMockCtx();
            enumStorerDisc1(makeEnumPlan(), ctx, 0, 'green');
            expect(readU8(buffer, 0)).toBe(1);
        });

        test('enumStorerDisc1 throws on unknown value', () => {
            const { ctx } = createMockCtx();
            expect(() => enumStorerDisc1(makeEnumPlan(), ctx, 0, 'yellow')).toThrow('Unknown enum value');
        });

        test('enumStorerDisc2 stores as u16', () => {
            const { ctx, buffer } = createMockCtx();
            enumStorerDisc2(makeEnumPlan(), ctx, 0, 'blue');
            expect(readU16(buffer, 0)).toBe(2);
        });

        test('enumStorerDisc2 throws on unknown value', () => {
            const { ctx } = createMockCtx();
            expect(() => enumStorerDisc2(makeEnumPlan(), ctx, 0, 'yellow')).toThrow('Unknown enum value');
        });

        test('enumStorerDisc4 stores as u32', () => {
            const { ctx, buffer } = createMockCtx();
            enumStorerDisc4(makeEnumPlan(), ctx, 0, 'red');
            expect(readU32(buffer, 0)).toBe(0);
        });

        test('enumStorerDisc4 throws on unknown value', () => {
            const { ctx } = createMockCtx();
            expect(() => enumStorerDisc4(makeEnumPlan(), ctx, 0, 'yellow')).toThrow('Unknown enum value');
        });
    });

    describe('flagsStorer', () => {
        test('stores single word of flags', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: FlagsStorerPlan = { wordCount: 1, memberNames: ['a', 'b', 'c'] };
            flagsStorer(plan, ctx, 0, { a: true, b: false, c: true });
            expect(readI32(buffer, 0)).toBe(0b101);
        });

        test('stores multi-word flags', () => {
            const { ctx, buffer } = createMockCtx();
            const names = Array.from({ length: 33 }, (_, i) => `f${i}`);
            const plan: FlagsStorerPlan = { wordCount: 2, memberNames: names };
            const flags: Record<string, boolean> = {};
            flags['f0'] = true;
            flags['f32'] = true;
            flagsStorer(plan, ctx, 0, flags);
            expect(readI32(buffer, 0)).toBe(1); // f0 in word 0
            expect(readI32(buffer, 4)).toBe(1); // f32 in word 1
        });

        test('throws on null input', () => {
            const { ctx } = createMockCtx();
            const plan: FlagsStorerPlan = { wordCount: 1, memberNames: ['a'] };
            expect(() => flagsStorer(plan, ctx, 0, null)).toThrow(TypeError);
        });

        test('throws on non-object input', () => {
            const { ctx } = createMockCtx();
            const plan: FlagsStorerPlan = { wordCount: 1, memberNames: ['a'] };
            expect(() => flagsStorer(plan, ctx, 0, 42)).toThrow(TypeError);
        });
    });

    describe('tupleStorer', () => {
        test('stores tuple elements at offsets', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: TupleStorerPlan = {
                members: [
                    { offset: 0, storer: u32Storer },
                    { offset: 4, storer: u32Storer },
                ],
            };
            tupleStorer(plan, ctx, 16, [10, 20]);
            expect(readU32(buffer, 16)).toBe(10);
            expect(readU32(buffer, 20)).toBe(20);
        });

        test('throws on null input', () => {
            const { ctx } = createMockCtx();
            const plan: TupleStorerPlan = { members: [{ offset: 0, storer: u32Storer }] };
            expect(() => tupleStorer(plan, ctx, 0, null)).toThrow(TypeError);
        });

        test('throws on wrong length', () => {
            const { ctx } = createMockCtx();
            const plan: TupleStorerPlan = {
                members: [
                    { offset: 0, storer: u32Storer },
                    { offset: 4, storer: u32Storer },
                ],
            };
            expect(() => tupleStorer(plan, ctx, 0, [1])).toThrow('Expected tuple of 2 elements');
        });
    });

    describe('resource storers', () => {
        test('ownResourceStorer stores handle', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: OwnResourceStorerPlan = { resourceTypeIdx: 0 };
            ownResourceStorer(plan, ctx, 0, { someResource: true });
            expect(readI32(buffer, 0)).toBe(42);
        });

        test('borrowResourceStorer stores handle', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: OwnResourceStorerPlan = { resourceTypeIdx: 0 };
            borrowResourceStorer(plan, ctx, 0, { someResource: true });
            expect(readI32(buffer, 0)).toBe(42);
        });

        test('borrowResourceDirectStorer stores raw handle', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: OwnResourceStorerPlan = { resourceTypeIdx: 0 };
            borrowResourceDirectStorer(plan, ctx, 0, 123);
            expect(readI32(buffer, 0)).toBe(123);
        });
    });

    describe('stream/future/errorContext storers', () => {
        test('streamStorer stores handle', () => {
            const { ctx, buffer } = createMockCtx();
            streamStorer({ elementStorer: undefined, elementSize: undefined }, ctx, 0, { readable: true });
            expect(readI32(buffer, 0)).toBe(7);
        });

        test('futureMemStorer stores handle', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: FutureStorerPlan = { futureStorer: undefined };
            futureMemStorer(plan, ctx, 0, Promise.resolve(42));
            expect(readI32(buffer, 0)).toBe(8);
        });

        test('errorContextStorer stores handle', () => {
            const { ctx, buffer } = createMockCtx();
            errorContextStorer(ctx, 0, new Error('test'));
            expect(readI32(buffer, 0)).toBe(9);
        });
    });

    describe('createResultWrappingStorer', () => {
        test('wraps resolved value as ok', () => {
            let captured: any;
            const mockStorer: MemoryStorer = (_ctx, _ptr, val) => { captured = val; };
            const { ctx } = createMockCtx();
            const wrapper = createResultWrappingStorer(mockStorer);
            wrapper(ctx, 0, 42, false);
            expect(captured).toEqual({ tag: 'ok', val: 42 });
        });

        test('wraps rejected value as err', () => {
            let captured: any;
            const mockStorer: MemoryStorer = (_ctx, _ptr, val) => { captured = val; };
            const { ctx } = createMockCtx();
            const wrapper = createResultWrappingStorer(mockStorer);
            wrapper(ctx, 0, 'oops', true);
            expect(captured).toEqual({ tag: 'err', val: 'oops' });
        });
    });
});
