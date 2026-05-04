// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { initializeAsserts } from '../../src/utils/assert';
initializeAsserts();

import type { WasmPointer, WasmSize, MarshalingContext, MemoryStorer } from '../../src/marshal/model/types';
import type { RecordStorerPlan, ListStorerPlan, OptionStorerPlan, ResultStorerPlan, VariantStorerPlan, EnumStorerPlan, FlagsStorerPlan, TupleStorerPlan, OwnResourceStorerPlan, FutureStorerPlan, StringStorerPlan } from '../../src/marshal/model/store-plans';
import {
    storeBool,
    storeS8,
    storeU8,
    storeS16,
    storeU16,
    storeS32,
    storeU32,
    storeS64,
    storeU64,
    storeF32,
    storeF64,
    storeChar,
    storeString,
    storeRecord,
    storeList,
    storeOption,
    storeResultBoth,
    storeResultOkOnly,
    storeResultErrOnly,
    storeResultVoid,
    storeVariantDisc1,
    storeVariantDisc2,
    storeVariantDisc4,
    storeEnumDisc1,
    storeEnumDisc2,
    storeEnumDisc4,
    storeFlags,
    storeTuple,
    storeOwnResource,
    storeBorrowResource,
    storeBorrowResourceDirect,
    storeStream,
    storeFuture,
    storeErrorContext,
    createResultWrappingStorer,
} from '../../src/marshal/memory-store';

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
            storeBool(ctx, 0, true);
            expect(readU8(buffer, 0)).toBe(1);
        });

        test('boolStorer stores false as 0', () => {
            const { ctx, buffer } = createMockCtx();
            storeBool(ctx, 0, false);
            expect(readU8(buffer, 0)).toBe(0);
        });

        test('boolStorer stores 0 as 0', () => {
            const { ctx, buffer } = createMockCtx();
            storeBool(ctx, 0, 0);
            expect(readU8(buffer, 0)).toBe(0);
        });

        test('s8Storer stores negative value', () => {
            const { ctx, buffer } = createMockCtx();
            storeS8(ctx, 0, -5);
            expect(new DataView(buffer).getInt8(0)).toBe(-5);
        });

        test('u8Storer masks to 8 bits', () => {
            const { ctx, buffer } = createMockCtx();
            storeU8(ctx, 0, 0x1FF);
            expect(readU8(buffer, 0)).toBe(0xFF);
        });

        test('s16Storer stores negative value', () => {
            const { ctx, buffer } = createMockCtx();
            storeS16(ctx, 0, -1000);
            expect(new DataView(buffer).getInt16(0, true)).toBe(-1000);
        });

        test('u16Storer masks to 16 bits', () => {
            const { ctx, buffer } = createMockCtx();
            storeU16(ctx, 0, 0x1FFFF);
            expect(readU16(buffer, 0)).toBe(0xFFFF);
        });

        test('s32Storer stores negative value', () => {
            const { ctx, buffer } = createMockCtx();
            storeS32(ctx, 0, -42);
            expect(readI32(buffer, 0)).toBe(-42);
        });

        test('u32Storer stores max u32', () => {
            const { ctx, buffer } = createMockCtx();
            storeU32(ctx, 0, 0xFFFFFFFF);
            expect(readU32(buffer, 0)).toBe(0xFFFFFFFF);
        });

        test('s64Storer stores negative bigint', () => {
            const { ctx, buffer } = createMockCtx();
            storeS64(ctx, 0, -100n);
            expect(readBigI64(buffer, 0)).toBe(-100n);
        });

        test('u64Storer stores large bigint', () => {
            const { ctx, buffer } = createMockCtx();
            storeU64(ctx, 0, 0xFFFFFFFFFFFFFFFFn);
            expect(readBigU64(buffer, 0)).toBe(0xFFFFFFFFFFFFFFFFn);
        });

        test('f32Storer stores float', () => {
            const { ctx, buffer } = createMockCtx();
            storeF32(ctx, 0, 3.14);
            expect(readF32(buffer, 0)).toBeCloseTo(3.14, 2);
        });

        test('f32Storer throws on non-number', () => {
            const { ctx } = createMockCtx();
            expect(() => storeF32(ctx, 0, 'hello')).toThrow(TypeError);
        });

        test('f64Storer stores double', () => {
            const { ctx, buffer } = createMockCtx();
            storeF64(ctx, 0, 3.141592653589793);
            expect(readF64(buffer, 0)).toBe(3.141592653589793);
        });

        test('f64Storer throws on non-number', () => {
            const { ctx } = createMockCtx();
            expect(() => storeF64(ctx, 0, true)).toThrow(TypeError);
        });

        test('charStorer stores codepoint', () => {
            const { ctx, buffer } = createMockCtx();
            storeChar(ctx, 0, 'A');
            expect(readU32(buffer, 0)).toBe(65);
        });

        test('charStorer stores emoji codepoint', () => {
            const { ctx, buffer } = createMockCtx();
            storeChar(ctx, 0, '😀');
            expect(readU32(buffer, 0)).toBe(0x1F600);
        });

        test('charStorer throws on non-string', () => {
            const { ctx } = createMockCtx();
            expect(() => storeChar(ctx, 0, 42)).toThrow(TypeError);
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
            storeString(plan, ctx, 0, 'hello');
            expect(readI32(buffer, 0)).toBe(100);
            expect(readI32(buffer, 4)).toBe(5);
        });
    });

    describe('recordStorer', () => {
        test('stores fields at correct offsets', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: RecordStorerPlan = {
                fields: [
                    { name: 'x', offset: 0, storer: (c, p, v) => storeU32(c, p, v) },
                    { name: 'y', offset: 4, storer: (c, p, v) => storeU32(c, p, v) },
                ],
            };
            storeRecord(plan, ctx, 16, { x: 10, y: 20 });
            expect(readU32(buffer, 16)).toBe(10);
            expect(readU32(buffer, 20)).toBe(20);
        });

        test('throws on null input', () => {
            const { ctx } = createMockCtx();
            const plan: RecordStorerPlan = { fields: [] };
            expect(() => storeRecord(plan, ctx, 0, null)).toThrow(TypeError);
        });

        test('throws on undefined input', () => {
            const { ctx } = createMockCtx();
            const plan: RecordStorerPlan = { fields: [] };
            expect(() => storeRecord(plan, ctx, 0, undefined)).toThrow(TypeError);
        });

        test('throws on non-object input', () => {
            const { ctx } = createMockCtx();
            const plan: RecordStorerPlan = { fields: [] };
            expect(() => storeRecord(plan, ctx, 0, 42)).toThrow(TypeError);
        });
    });

    describe('listStorer', () => {
        test('stores empty list — realloc(0,0,align,0) provides dangling pointer', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: ListStorerPlan = { elemSize: 4, elemAlign: 4, elemStorer: storeU32 };
            storeList(plan, ctx, 0, []);
            // Canonical ABI calls realloc even for empty lists; Rust's cabi_realloc
            // returns `align` as a non-null dangling pointer for size=0.
            expect(readI32(buffer, 0)).toBe(4); // ptr from realloc(0,0,4,0) = 4
            expect(readI32(buffer, 4)).toBe(0); // len
        });

        test('stores non-empty list', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: ListStorerPlan = { elemSize: 4, elemAlign: 4, elemStorer: storeU32 };
            storeList(plan, ctx, 0, [100, 200, 300]);
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
            const plan: ListStorerPlan = { elemSize: 4, elemAlign: 4, elemStorer: storeU32 };
            expect(() => storeList(plan, ctx, 0, null)).toThrow(TypeError);
        });

        test('throws on undefined input', () => {
            const { ctx } = createMockCtx();
            const plan: ListStorerPlan = { elemSize: 4, elemAlign: 4, elemStorer: storeU32 };
            expect(() => storeList(plan, ctx, 0, undefined)).toThrow(TypeError);
        });
    });

    describe('optionStorer', () => {
        test('stores none for null', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: OptionStorerPlan = { payloadOffset: 4, payloadStorer: storeU32 };
            storeOption(plan, ctx, 0, null);
            expect(readU8(buffer, 0)).toBe(0);
        });

        test('stores none for undefined', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: OptionStorerPlan = { payloadOffset: 4, payloadStorer: storeU32 };
            storeOption(plan, ctx, 0, undefined);
            expect(readU8(buffer, 0)).toBe(0);
        });

        test('stores some with payload', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: OptionStorerPlan = { payloadOffset: 4, payloadStorer: storeU32 };
            storeOption(plan, ctx, 16, 42);
            expect(readU8(buffer, 16)).toBe(1);
            expect(readU32(buffer, 20)).toBe(42);
        });
    });

    describe('result storers', () => {
        const okStorer: MemoryStorer = (ctx, ptr, val) => storeU32(ctx, ptr, val);
        const errStorer: MemoryStorer = (ctx, ptr, val) => storeU32(ctx, ptr, val);

        test('resultStorerBoth stores ok', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4, okStorer, errStorer };
            storeResultBoth(plan, ctx, 16, { tag: 'ok', val: 99 });
            expect(readU8(buffer, 16)).toBe(0);
            expect(readU32(buffer, 20)).toBe(99);
        });

        test('resultStorerBoth stores err', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4, okStorer, errStorer };
            storeResultBoth(plan, ctx, 16, { tag: 'err', val: 77 });
            expect(readU8(buffer, 16)).toBe(1);
            expect(readU32(buffer, 20)).toBe(77);
        });

        test('resultStorerBoth throws on null', () => {
            const { ctx } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4, okStorer, errStorer };
            expect(() => storeResultBoth(plan, ctx, 0, null)).toThrow(TypeError);
        });

        test('resultStorerBoth throws on missing tag', () => {
            const { ctx } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4, okStorer, errStorer };
            expect(() => storeResultBoth(plan, ctx, 0, { val: 1 })).toThrow(TypeError);
        });

        test('resultStorerOkOnly stores ok with payload', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4, okStorer };
            storeResultOkOnly(plan, ctx, 16, { tag: 'ok', val: 55 });
            expect(readU8(buffer, 16)).toBe(0);
            expect(readU32(buffer, 20)).toBe(55);
        });

        test('resultStorerOkOnly stores err without payload', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4, okStorer };
            storeResultOkOnly(plan, ctx, 16, { tag: 'err', val: 55 });
            expect(readU8(buffer, 16)).toBe(1);
        });

        test('resultStorerOkOnly throws on null', () => {
            const { ctx } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4, okStorer };
            expect(() => storeResultOkOnly(plan, ctx, 0, null)).toThrow(TypeError);
        });

        test('resultStorerOkOnly throws on missing tag', () => {
            const { ctx } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4, okStorer };
            expect(() => storeResultOkOnly(plan, ctx, 0, {})).toThrow(TypeError);
        });

        test('resultStorerErrOnly stores ok without payload', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4, errStorer };
            storeResultErrOnly(plan, ctx, 16, { tag: 'ok', val: 55 });
            expect(readU8(buffer, 16)).toBe(0);
        });

        test('resultStorerErrOnly stores err with payload', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4, errStorer };
            storeResultErrOnly(plan, ctx, 16, { tag: 'err', val: 88 });
            expect(readU8(buffer, 16)).toBe(1);
            expect(readU32(buffer, 20)).toBe(88);
        });

        test('resultStorerErrOnly throws on null', () => {
            const { ctx } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4, errStorer };
            expect(() => storeResultErrOnly(plan, ctx, 0, null)).toThrow(TypeError);
        });

        test('resultStorerErrOnly throws on missing tag', () => {
            const { ctx } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4, errStorer };
            expect(() => storeResultErrOnly(plan, ctx, 0, 'not-an-object')).toThrow(TypeError);
        });

        test('resultStorerVoid stores ok tag=0', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4 };
            storeResultVoid(plan, ctx, 16, { tag: 'ok' });
            expect(readU8(buffer, 16)).toBe(0);
        });

        test('resultStorerVoid stores err tag=1', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4 };
            storeResultVoid(plan, ctx, 16, { tag: 'err' });
            expect(readU8(buffer, 16)).toBe(1);
        });

        test('resultStorerVoid throws on null', () => {
            const { ctx } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4 };
            expect(() => storeResultVoid(plan, ctx, 0, null)).toThrow(TypeError);
        });

        test('resultStorerVoid throws on missing tag', () => {
            const { ctx } = createMockCtx();
            const plan: ResultStorerPlan = { payloadOffset: 4 };
            expect(() => storeResultVoid(plan, ctx, 0, { val: 1 })).toThrow(TypeError);
        });
    });

    describe('variant storers', () => {
        function makeVariantPlan(): VariantStorerPlan {
            return {
                payloadOffset: 4,
                nameToIndex: new Map([['alpha', 0], ['beta', 1], ['gamma', 2]]),
                caseStorers: [
                    storeU32,
                    storeU32,
                    undefined, // gamma has no payload
                ],
            };
        }

        test('variantStorerDisc1 stores discriminant as u8', () => {
            const { ctx, buffer } = createMockCtx();
            storeVariantDisc1(makeVariantPlan(), ctx, 16, { tag: 'beta', val: 99 });
            expect(readU8(buffer, 16)).toBe(1);
            expect(readU32(buffer, 20)).toBe(99);
        });

        test('variantStorerDisc1 stores case without payload', () => {
            const { ctx, buffer } = createMockCtx();
            storeVariantDisc1(makeVariantPlan(), ctx, 16, { tag: 'gamma' });
            expect(readU8(buffer, 16)).toBe(2);
        });

        test('variantStorerDisc1 throws on null', () => {
            const { ctx } = createMockCtx();
            expect(() => storeVariantDisc1(makeVariantPlan(), ctx, 0, null)).toThrow(TypeError);
        });

        test('variantStorerDisc1 throws on missing tag', () => {
            const { ctx } = createMockCtx();
            expect(() => storeVariantDisc1(makeVariantPlan(), ctx, 0, { val: 1 })).toThrow(TypeError);
        });

        test('variantStorerDisc1 throws on unknown case', () => {
            const { ctx } = createMockCtx();
            expect(() => storeVariantDisc1(makeVariantPlan(), ctx, 0, { tag: 'unknown' })).toThrow('Unknown variant case');
        });

        test('variantStorerDisc2 stores discriminant as u16', () => {
            const { ctx, buffer } = createMockCtx();
            storeVariantDisc2(makeVariantPlan(), ctx, 16, { tag: 'alpha', val: 55 });
            expect(readU16(buffer, 16)).toBe(0);
            expect(readU32(buffer, 20)).toBe(55);
        });

        test('variantStorerDisc2 throws on null', () => {
            const { ctx } = createMockCtx();
            expect(() => storeVariantDisc2(makeVariantPlan(), ctx, 0, null)).toThrow(TypeError);
        });

        test('variantStorerDisc2 throws on missing tag', () => {
            const { ctx } = createMockCtx();
            expect(() => storeVariantDisc2(makeVariantPlan(), ctx, 0, {})).toThrow(TypeError);
        });

        test('variantStorerDisc2 throws on unknown case', () => {
            const { ctx } = createMockCtx();
            expect(() => storeVariantDisc2(makeVariantPlan(), ctx, 0, { tag: 'nope' })).toThrow('Unknown variant case');
        });

        test('variantStorerDisc4 stores discriminant as u32', () => {
            const { ctx, buffer } = createMockCtx();
            storeVariantDisc4(makeVariantPlan(), ctx, 16, { tag: 'beta', val: 77 });
            expect(readU32(buffer, 16)).toBe(1);
            expect(readU32(buffer, 20)).toBe(77);
        });

        test('variantStorerDisc4 throws on null', () => {
            const { ctx } = createMockCtx();
            expect(() => storeVariantDisc4(makeVariantPlan(), ctx, 0, null)).toThrow(TypeError);
        });

        test('variantStorerDisc4 throws on missing tag', () => {
            const { ctx } = createMockCtx();
            expect(() => storeVariantDisc4(makeVariantPlan(), ctx, 0, { val: 1 })).toThrow(TypeError);
        });

        test('variantStorerDisc4 throws on unknown case', () => {
            const { ctx } = createMockCtx();
            expect(() => storeVariantDisc4(makeVariantPlan(), ctx, 0, { tag: 'missing' })).toThrow('Unknown variant case');
        });
    });

    describe('enum storers', () => {
        function makeEnumPlan(): EnumStorerPlan {
            return { nameToIndex: new Map([['red', 0], ['green', 1], ['blue', 2]]) };
        }

        test('enumStorerDisc1 stores as u8', () => {
            const { ctx, buffer } = createMockCtx();
            storeEnumDisc1(makeEnumPlan(), ctx, 0, 'green');
            expect(readU8(buffer, 0)).toBe(1);
        });

        test('enumStorerDisc1 throws on unknown value', () => {
            const { ctx } = createMockCtx();
            expect(() => storeEnumDisc1(makeEnumPlan(), ctx, 0, 'yellow')).toThrow('Unknown enum value');
        });

        test('enumStorerDisc2 stores as u16', () => {
            const { ctx, buffer } = createMockCtx();
            storeEnumDisc2(makeEnumPlan(), ctx, 0, 'blue');
            expect(readU16(buffer, 0)).toBe(2);
        });

        test('enumStorerDisc2 throws on unknown value', () => {
            const { ctx } = createMockCtx();
            expect(() => storeEnumDisc2(makeEnumPlan(), ctx, 0, 'yellow')).toThrow('Unknown enum value');
        });

        test('enumStorerDisc4 stores as u32', () => {
            const { ctx, buffer } = createMockCtx();
            storeEnumDisc4(makeEnumPlan(), ctx, 0, 'red');
            expect(readU32(buffer, 0)).toBe(0);
        });

        test('enumStorerDisc4 throws on unknown value', () => {
            const { ctx } = createMockCtx();
            expect(() => storeEnumDisc4(makeEnumPlan(), ctx, 0, 'yellow')).toThrow('Unknown enum value');
        });
    });

    describe('flagsStorer', () => {
        test('stores small flags (≤8) into 1 byte', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: FlagsStorerPlan = { byteSize: 1, memberNames: ['a', 'b', 'c'] };
            storeFlags(plan, ctx, 0, { a: true, b: false, c: true });
            // readI32 reads 4 bytes; only the first byte was written, rest stay 0
            expect(readI32(buffer, 0)).toBe(0b101);
        });

        test('stores 1-byte flags without touching adjacent bytes', () => {
            const { ctx, buffer } = createMockCtx();
            // Pre-fill the whole region with sentinel bytes.
            new Uint8Array(buffer).fill(0xCD);
            const plan: FlagsStorerPlan = { byteSize: 1, memberNames: ['a', 'b'] };
            storeFlags(plan, ctx, 4, { a: true, b: true });
            const u8 = new Uint8Array(buffer);
            expect(u8[3]).toBe(0xCD); // byte before unchanged
            expect(u8[4]).toBe(0b11); // flags byte
            expect(u8[5]).toBe(0xCD); // bytes after unchanged
            expect(u8[6]).toBe(0xCD);
            expect(u8[7]).toBe(0xCD);
        });

        test('stores 9-16 flags into 2 bytes', () => {
            const { ctx, buffer } = createMockCtx();
            new Uint8Array(buffer).fill(0xCD);
            const names = Array.from({ length: 12 }, (_, i) => `f${i}`);
            const plan: FlagsStorerPlan = { byteSize: 2, memberNames: names };
            const flags: Record<string, boolean> = {};
            flags['f0'] = true;
            flags['f11'] = true;
            storeFlags(plan, ctx, 0, flags);
            const u8 = new Uint8Array(buffer);
            // bit 0 + bit 11 → 0x01 0x08
            expect(u8[0]).toBe(0x01);
            expect(u8[1]).toBe(0x08);
            expect(u8[2]).toBe(0xCD); // byte after must remain untouched
        });

        test('stores 17-32 flags into 4 bytes', () => {
            const { ctx, buffer } = createMockCtx();
            const names = Array.from({ length: 24 }, (_, i) => `f${i}`);
            const plan: FlagsStorerPlan = { byteSize: 4, memberNames: names };
            const flags: Record<string, boolean> = {};
            flags['f0'] = true;
            flags['f23'] = true;
            storeFlags(plan, ctx, 0, flags);
            expect(readI32(buffer, 0)).toBe((1 << 0) | (1 << 23));
        });

        test('stores multi-word flags (>32) across i32 words', () => {
            const { ctx, buffer } = createMockCtx();
            const names = Array.from({ length: 33 }, (_, i) => `f${i}`);
            const plan: FlagsStorerPlan = { byteSize: 8, memberNames: names };
            const flags: Record<string, boolean> = {};
            flags['f0'] = true;
            flags['f32'] = true;
            storeFlags(plan, ctx, 0, flags);
            expect(readI32(buffer, 0)).toBe(1); // f0 in word 0
            expect(readI32(buffer, 4)).toBe(1); // f32 in word 1
        });

        test('throws on null input', () => {
            const { ctx } = createMockCtx();
            const plan: FlagsStorerPlan = { byteSize: 1, memberNames: ['a'] };
            expect(() => storeFlags(plan, ctx, 0, null)).toThrow(TypeError);
        });

        test('throws on non-object input', () => {
            const { ctx } = createMockCtx();
            const plan: FlagsStorerPlan = { byteSize: 1, memberNames: ['a'] };
            expect(() => storeFlags(plan, ctx, 0, 42)).toThrow(TypeError);
        });
    });

    describe('tupleStorer', () => {
        test('stores tuple elements at offsets', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: TupleStorerPlan = {
                members: [
                    { offset: 0, storer: storeU32 },
                    { offset: 4, storer: storeU32 },
                ],
            };
            storeTuple(plan, ctx, 16, [10, 20]);
            expect(readU32(buffer, 16)).toBe(10);
            expect(readU32(buffer, 20)).toBe(20);
        });

        test('throws on null input', () => {
            const { ctx } = createMockCtx();
            const plan: TupleStorerPlan = { members: [{ offset: 0, storer: storeU32 }] };
            expect(() => storeTuple(plan, ctx, 0, null)).toThrow(TypeError);
        });

        test('throws on wrong length', () => {
            const { ctx } = createMockCtx();
            const plan: TupleStorerPlan = {
                members: [
                    { offset: 0, storer: storeU32 },
                    { offset: 4, storer: storeU32 },
                ],
            };
            expect(() => storeTuple(plan, ctx, 0, [1])).toThrow('Expected tuple of 2 elements');
        });
    });

    describe('resource storers', () => {
        test('ownResourceStorer stores handle', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: OwnResourceStorerPlan = { resourceTypeIdx: 0 };
            storeOwnResource(plan, ctx, 0, { someResource: true });
            expect(readI32(buffer, 0)).toBe(42);
        });

        test('borrowResourceStorer stores handle', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: OwnResourceStorerPlan = { resourceTypeIdx: 0 };
            storeBorrowResource(plan, ctx, 0, { someResource: true });
            expect(readI32(buffer, 0)).toBe(42);
        });

        test('borrowResourceDirectStorer stores raw handle', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: OwnResourceStorerPlan = { resourceTypeIdx: 0 };
            storeBorrowResourceDirect(plan, ctx, 0, 123);
            expect(readI32(buffer, 0)).toBe(123);
        });
    });

    describe('stream/future/errorContext storers', () => {
        test('streamStorer stores handle', () => {
            const { ctx, buffer } = createMockCtx();
            storeStream({ elementStorer: undefined, elementSize: undefined }, ctx, 0, { readable: true });
            expect(readI32(buffer, 0)).toBe(7);
        });

        test('futureMemStorer stores handle', () => {
            const { ctx, buffer } = createMockCtx();
            const plan: FutureStorerPlan = { futureStorer: undefined };
            storeFuture(plan, ctx, 0, Promise.resolve(42));
            expect(readI32(buffer, 0)).toBe(8);
        });

        test('errorContextStorer stores handle', () => {
            const { ctx, buffer } = createMockCtx();
            storeErrorContext(ctx, 0, new Error('test'));
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
