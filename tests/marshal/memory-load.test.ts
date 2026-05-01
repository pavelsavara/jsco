// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { initializeAsserts } from '../../src/utils/assert';
initializeAsserts();

import type { WasmPointer, WasmSize } from '../../src/marshal/model/types';
import type { MarshalingContext } from '../../src/resolver/types';
import {
    boolLoader, s8Loader, u8Loader, s16Loader, u16Loader, s32Loader, u32Loader,
    s64LoaderBigInt, s64LoaderNumber, u64LoaderBigInt, u64LoaderNumber,
    f32Loader, f64Loader, charLoader,
    stringLoaderUtf8, stringLoaderUtf16,
    recordLoader, listLoader, optionLoader,
    resultLoaderBoth, resultLoaderOkOnly, resultLoaderErrOnly, resultLoaderVoid,
    variantLoaderDisc1, variantLoaderDisc2, variantLoaderDisc4,
    enumLoaderDisc1, enumLoaderDisc2, enumLoaderDisc4,
    flagsLoader, tupleLoader,
    ownResourceLoader, borrowResourceLoader, borrowResourceDirectLoader,
    streamLoader, futureLoader, errorContextLoader,
} from '../../src/marshal/memory-load';

function createMockCtx(bufferSize = 4096): { ctx: MarshalingContext, buffer: ArrayBuffer, dv: DataView } {
    const buffer = new ArrayBuffer(bufferSize);
    const dv = new DataView(buffer);

    const memory = {
        getMemory: () => ({ buffer } as any),
        getView(ptr: WasmPointer, len: WasmSize): DataView {
            return new DataView(buffer, ptr as number, len as number);
        },
        getViewU8(ptr: WasmPointer, len: WasmSize): Uint8Array {
            return new Uint8Array(buffer, ptr as number, len as number);
        },
    };

    const resources = {
        remove(_typeIdx: number, handle: number): unknown {
            return { __handle: handle };
        },
        get(_typeIdx: number, handle: number): unknown {
            return { __handle: handle };
        },
    };

    const streams = {
        removeReadable(_typeIdx: number, handle: number): unknown {
            return { __streamHandle: handle };
        },
    };

    const futures = {
        removeReadable(_typeIdx: number, handle: number): unknown {
            return { __futureHandle: handle };
        },
    };

    const errorContexts = {
        remove(handle: number): unknown {
            return { __errorContextHandle: handle };
        },
    };

    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

    const ctx = { memory, resources, streams, futures, errorContexts, utf8Decoder } as any as MarshalingContext;

    return { ctx, buffer, dv };
}

// ─── Primitive loaders ───

describe('memory-load primitive loaders', () => {
    test('boolLoader: 0 → false, 1 → true, 2 → true', () => {
        const { ctx, dv } = createMockCtx();
        dv.setUint8(0, 0);
        expect(boolLoader(ctx, 0)).toBe(false);
        dv.setUint8(0, 1);
        expect(boolLoader(ctx, 0)).toBe(true);
        dv.setUint8(0, 2);
        expect(boolLoader(ctx, 0)).toBe(true);
    });

    test('s8Loader reads signed byte', () => {
        const { ctx, dv } = createMockCtx();
        dv.setInt8(0, -128);
        expect(s8Loader(ctx, 0)).toBe(-128);
        dv.setInt8(0, 127);
        expect(s8Loader(ctx, 0)).toBe(127);
    });

    test('u8Loader reads unsigned byte', () => {
        const { ctx, dv } = createMockCtx();
        dv.setUint8(0, 255);
        expect(u8Loader(ctx, 0)).toBe(255);
    });

    test('s16Loader reads signed 16-bit', () => {
        const { ctx, dv } = createMockCtx();
        dv.setInt16(0, -32768, true);
        expect(s16Loader(ctx, 0)).toBe(-32768);
    });

    test('u16Loader reads unsigned 16-bit', () => {
        const { ctx, dv } = createMockCtx();
        dv.setUint16(0, 65535, true);
        expect(u16Loader(ctx, 0)).toBe(65535);
    });

    test('s32Loader reads signed 32-bit', () => {
        const { ctx, dv } = createMockCtx();
        dv.setInt32(0, -2147483648, true);
        expect(s32Loader(ctx, 0)).toBe(-2147483648);
    });

    test('u32Loader reads unsigned 32-bit', () => {
        const { ctx, dv } = createMockCtx();
        dv.setUint32(0, 4294967295, true);
        expect(u32Loader(ctx, 0)).toBe(4294967295);
    });

    test('s64LoaderBigInt reads signed 64-bit as bigint', () => {
        const { ctx, dv } = createMockCtx();
        dv.setBigInt64(0, -9007199254740991n, true);
        expect(s64LoaderBigInt(ctx, 0)).toBe(-9007199254740991n);
    });

    test('s64LoaderNumber reads signed 64-bit as number', () => {
        const { ctx, dv } = createMockCtx();
        dv.setBigInt64(0, 42n, true);
        expect(s64LoaderNumber(ctx, 0)).toBe(42);
    });

    test('u64LoaderBigInt reads unsigned 64-bit as bigint', () => {
        const { ctx, dv } = createMockCtx();
        dv.setBigUint64(0, 18446744073709551615n, true);
        expect(u64LoaderBigInt(ctx, 0)).toBe(18446744073709551615n);
    });

    test('u64LoaderNumber reads unsigned 64-bit as number', () => {
        const { ctx, dv } = createMockCtx();
        dv.setBigUint64(0, 42n, true);
        expect(u64LoaderNumber(ctx, 0)).toBe(42);
    });

    test('f32Loader reads float32', () => {
        const { ctx, dv } = createMockCtx();
        dv.setFloat32(0, 3.14, true);
        expect(f32Loader(ctx, 0)).toBeCloseTo(3.14, 5);
    });

    test('f64Loader reads float64', () => {
        const { ctx, dv } = createMockCtx();
        dv.setFloat64(0, Math.PI, true);
        expect(f64Loader(ctx, 0)).toBe(Math.PI);
    });

    test('charLoader reads valid codepoints', () => {
        const { ctx, dv } = createMockCtx();
        dv.setUint32(0, 65, true); // 'A'
        expect(charLoader(ctx, 0)).toBe('A');
        dv.setUint32(0, 128512, true); // 😀
        expect(charLoader(ctx, 0)).toBe('😀');
        dv.setUint32(0, 0x10FFFF, true);
        expect(charLoader(ctx, 0)).toBe(String.fromCodePoint(0x10FFFF));
    });

    test('charLoader throws on invalid codepoints', () => {
        const { ctx, dv } = createMockCtx();
        dv.setUint32(0, 0x110000, true);
        expect(() => charLoader(ctx, 0)).toThrow('0x110000');
        dv.setUint32(0, 0xD800, true);
        expect(() => charLoader(ctx, 0)).toThrow('surrogate');
        dv.setUint32(0, 0xDFFF, true);
        expect(() => charLoader(ctx, 0)).toThrow('surrogate');
    });
});

// ─── String loaders ───

describe('memory-load string loaders', () => {
    test('stringLoaderUtf8 reads empty string', () => {
        const { ctx, dv } = createMockCtx();
        dv.setUint32(0, 100, true); // ptr
        dv.setUint32(4, 0, true); // len
        expect(stringLoaderUtf8(ctx, 0)).toBe('');
    });

    test('stringLoaderUtf8 reads ASCII string', () => {
        const { ctx, buffer, dv } = createMockCtx();
        const text = 'Hello';
        const encoded = new TextEncoder().encode(text);
        new Uint8Array(buffer, 100, encoded.length).set(encoded);
        dv.setUint32(0, 100, true);
        dv.setUint32(4, encoded.length, true);
        expect(stringLoaderUtf8(ctx, 0)).toBe(text);
    });

    test('stringLoaderUtf16 reads empty string', () => {
        const { ctx, dv } = createMockCtx();
        dv.setUint32(0, 100, true);
        dv.setUint32(4, 0, true);
        expect(stringLoaderUtf16(ctx, 0)).toBe('');
    });

    test('stringLoaderUtf16 reads BMP string', () => {
        const { ctx, buffer, dv } = createMockCtx();
        const text = 'Hi';
        const ptr = 100;
        // Write UTF-16 code units
        const u16view = new Uint16Array(buffer, ptr, text.length);
        for (let i = 0; i < text.length; i++) {
            u16view[i] = text.charCodeAt(i);
        }
        dv.setUint32(0, ptr, true);
        dv.setUint32(4, text.length, true); // code unit count
        expect(stringLoaderUtf16(ctx, 0)).toBe(text);
    });

    test('stringLoaderUtf16 throws on misaligned pointer', () => {
        const { ctx, dv } = createMockCtx();
        dv.setUint32(0, 101, true); // odd ptr
        dv.setUint32(4, 2, true);
        expect(() => stringLoaderUtf16(ctx, 0)).toThrow('not aligned');
    });

    test('stringLoaderUtf16 throws on out-of-bounds', () => {
        const { ctx, dv } = createMockCtx(256);
        dv.setUint32(0, 200, true);
        dv.setUint32(4, 100, true); // 200 bytes past a 256 byte buffer
        expect(() => stringLoaderUtf16(ctx, 0)).toThrow('out of bounds');
    });
});

// ─── Compound loaders ───

describe('memory-load compound loaders', () => {
    test('recordLoader loads fields at offsets', () => {
        const { ctx, dv } = createMockCtx();
        const plan = {
            fields: [
                { name: 'x', offset: 0, loader: (c: MarshalingContext, p: number) => u32Loader(c, p) },
                { name: 'y', offset: 4, loader: (c: MarshalingContext, p: number) => u32Loader(c, p) },
            ],
        };
        dv.setUint32(100, 10, true);
        dv.setUint32(104, 20, true);
        const result = recordLoader(plan, ctx, 100);
        expect(result).toEqual({ x: 10, y: 20 });
    });

    test('listLoader loads element array', () => {
        const { ctx, dv } = createMockCtx();
        const plan = {
            elemSize: 4,
            elemAlign: 4,
            elemLoader: (c: MarshalingContext, p: number) => u32Loader(c, p),
        };
        // list ptr at offset 200, length 3
        dv.setUint32(200, 300, true); // ptr to elements
        dv.setUint32(204, 3, true); // length
        dv.setUint32(300, 1, true);
        dv.setUint32(304, 2, true);
        dv.setUint32(308, 3, true);
        const result = listLoader(plan, ctx, 200);
        expect(result).toEqual([1, 2, 3]);
    });

    test('listLoader validates pointer alignment', () => {
        const { ctx, dv } = createMockCtx();
        const plan = {
            elemSize: 4,
            elemAlign: 4,
            elemLoader: (c: MarshalingContext, p: number) => u32Loader(c, p),
        };
        dv.setUint32(200, 301, true); // misaligned ptr
        dv.setUint32(204, 1, true);
        expect(() => listLoader(plan, ctx, 200)).toThrow();
    });

    test('optionLoader: disc=0 → null, disc=1 → value', () => {
        const { ctx, dv } = createMockCtx();
        const plan = {
            payloadOffset: 4,
            payloadLoader: (c: MarshalingContext, p: number) => u32Loader(c, p),
        };
        dv.setUint8(100, 0);
        expect(optionLoader(plan, ctx, 100)).toBeNull();
        dv.setUint8(100, 1);
        dv.setUint32(104, 42, true);
        expect(optionLoader(plan, ctx, 100)).toBe(42);
    });

    test('optionLoader: invalid discriminant throws', () => {
        const { ctx, dv } = createMockCtx();
        const plan = { payloadOffset: 4, payloadLoader: () => null };
        dv.setUint8(100, 2);
        expect(() => optionLoader(plan, ctx, 100)).toThrow('Invalid option discriminant');
    });

    test('resultLoaderBoth loads ok and err cases', () => {
        const { ctx, dv } = createMockCtx();
        const plan = {
            payloadOffset: 4,
            okLoader: (c: MarshalingContext, p: number) => u32Loader(c, p),
            errLoader: (c: MarshalingContext, p: number) => s32Loader(c, p),
        };
        dv.setUint8(100, 0); // ok
        dv.setUint32(104, 42, true);
        expect(resultLoaderBoth(plan, ctx, 100)).toEqual({ tag: 'ok', val: 42 });

        dv.setUint8(100, 1); // err
        dv.setInt32(104, -1, true);
        expect(resultLoaderBoth(plan, ctx, 100)).toEqual({ tag: 'err', val: -1 });
    });

    test('resultLoaderOkOnly: err case has undefined val', () => {
        const { ctx, dv } = createMockCtx();
        const plan = { payloadOffset: 4, okLoader: () => 'value' };
        dv.setUint8(100, 0);
        expect(resultLoaderOkOnly(plan as any, ctx, 100)).toEqual({ tag: 'ok', val: 'value' });
        dv.setUint8(100, 1);
        expect(resultLoaderOkOnly(plan as any, ctx, 100)).toEqual({ tag: 'err', val: undefined });
    });

    test('resultLoaderErrOnly: ok case has undefined val', () => {
        const { ctx, dv } = createMockCtx();
        const plan = { payloadOffset: 4, errLoader: () => 'error-msg' };
        dv.setUint8(100, 0);
        expect(resultLoaderErrOnly(plan as any, ctx, 100)).toEqual({ tag: 'ok', val: undefined });
        dv.setUint8(100, 1);
        expect(resultLoaderErrOnly(plan as any, ctx, 100)).toEqual({ tag: 'err', val: 'error-msg' });
    });

    test('resultLoaderVoid: both cases have undefined val', () => {
        const { ctx, dv } = createMockCtx();
        const plan = { payloadOffset: 4 };
        dv.setUint8(100, 0);
        expect(resultLoaderVoid(plan as any, ctx, 100)).toEqual({ tag: 'ok', val: undefined });
        dv.setUint8(100, 1);
        expect(resultLoaderVoid(plan as any, ctx, 100)).toEqual({ tag: 'err', val: undefined });
    });

    test('result loader: invalid discriminant throws', () => {
        const { ctx, dv } = createMockCtx();
        const plan = { payloadOffset: 4, okLoader: () => null, errLoader: () => null };
        dv.setUint8(100, 2);
        expect(() => resultLoaderBoth(plan, ctx, 100)).toThrow('Invalid result discriminant');
    });
});

// ─── Variant and enum loaders ───

describe('memory-load variant/enum loaders', () => {
    const plan = {
        numCases: 3,
        caseNames: ['a', 'b', 'c'],
        payloadOffset: 4,
        caseLoaders: [
            (c: MarshalingContext, p: number) => u32Loader(c, p),
            null,
            (c: MarshalingContext, p: number) => s32Loader(c, p),
        ],
    };

    test('variantLoaderDisc1 reads 1-byte discriminant', () => {
        const { ctx, dv } = createMockCtx();
        dv.setUint8(100, 0);
        dv.setUint32(104, 42, true);
        expect(variantLoaderDisc1(plan, ctx, 100)).toEqual({ tag: 'a', val: 42 });
        dv.setUint8(100, 1);
        expect(variantLoaderDisc1(plan, ctx, 100)).toEqual({ tag: 'b' }); // no loader → no val
    });

    test('variantLoaderDisc2 reads 2-byte discriminant', () => {
        const { ctx, dv } = createMockCtx();
        dv.setUint16(100, 2, true);
        dv.setInt32(104, -5, true);
        expect(variantLoaderDisc2(plan, ctx, 100)).toEqual({ tag: 'c', val: -5 });
    });

    test('variantLoaderDisc4 reads 4-byte discriminant', () => {
        const { ctx, dv } = createMockCtx();
        dv.setUint32(100, 0, true);
        dv.setUint32(104, 99, true);
        expect(variantLoaderDisc4(plan, ctx, 100)).toEqual({ tag: 'a', val: 99 });
    });

    test('variant loader: invalid discriminant throws', () => {
        const { ctx, dv } = createMockCtx();
        dv.setUint8(100, 3);
        expect(() => variantLoaderDisc1(plan, ctx, 100)).toThrow('Invalid variant discriminant');
    });

    const enumPlan = {
        numMembers: 3,
        memberNames: ['red', 'green', 'blue'],
    };

    test('enumLoaderDisc1 reads 1-byte enum', () => {
        const { ctx, dv } = createMockCtx();
        dv.setUint8(100, 1);
        expect(enumLoaderDisc1(enumPlan, ctx, 100)).toBe('green');
    });

    test('enumLoaderDisc2 reads 2-byte enum', () => {
        const { ctx, dv } = createMockCtx();
        dv.setUint16(100, 2, true);
        expect(enumLoaderDisc2(enumPlan, ctx, 100)).toBe('blue');
    });

    test('enumLoaderDisc4 reads 4-byte enum', () => {
        const { ctx, dv } = createMockCtx();
        dv.setUint32(100, 0, true);
        expect(enumLoaderDisc4(enumPlan, ctx, 100)).toBe('red');
    });

    test('enum loader: invalid discriminant throws', () => {
        const { ctx, dv } = createMockCtx();
        dv.setUint8(100, 3);
        expect(() => enumLoaderDisc1(enumPlan, ctx, 100)).toThrow('Invalid enum discriminant');
    });
});

// ─── Flags and tuple loaders ───

describe('memory-load flags/tuple loaders', () => {
    test('flagsLoader reads small flags (≤8) from 1 byte', () => {
        const { ctx, dv } = createMockCtx();
        const plan = {
            byteSize: 1,
            memberNames: ['a', 'b', 'c', 'd'],
        };
        dv.setUint8(100, 0b0101); // a=true, b=false, c=true, d=false
        const result = flagsLoader(plan, ctx, 100);
        expect(result).toEqual({ a: true, b: false, c: true, d: false });
    });

    test('flagsLoader does not read past byteSize=1 boundary', () => {
        // Spec: 1-8 flags occupy exactly 1 byte; bytes after must NOT influence the result.
        const { ctx, dv } = createMockCtx();
        const names = Array.from({ length: 8 }, (_, i) => `f${i}`);
        const plan = { byteSize: 1, memberNames: names };
        dv.setUint8(100, 0xFF);
        // Poison the next 3 bytes; they must not be observed.
        dv.setUint8(101, 0xAA);
        dv.setUint8(102, 0xBB);
        dv.setUint8(103, 0xCC);
        const result = flagsLoader(plan, ctx, 100);
        expect(Object.values(result).every(v => v === true)).toBe(true);
        expect(Object.keys(result).length).toBe(8);
    });

    test('flagsLoader reads 9-16 flags from 2 bytes', () => {
        const { ctx, dv } = createMockCtx();
        const names = Array.from({ length: 12 }, (_, i) => `f${i}`);
        const plan = { byteSize: 2, memberNames: names };
        dv.setUint16(100, 0b0000_1010_0000_0001, true); // bits 0, 9, 11 set
        dv.setUint8(102, 0xFF); // poison: must not be read
        const result = flagsLoader(plan, ctx, 100);
        expect(result['f0']).toBe(true);
        expect(result['f9']).toBe(true);
        expect(result['f11']).toBe(true);
        expect(result['f1']).toBe(false);
        expect(result['f8']).toBe(false);
        expect(result['f10']).toBe(false);
    });

    test('flagsLoader reads 17-32 flags from 4 bytes', () => {
        const { ctx, dv } = createMockCtx();
        const names = Array.from({ length: 24 }, (_, i) => `f${i}`);
        const plan = { byteSize: 4, memberNames: names };
        dv.setUint32(100, (1 << 0) | (1 << 16) | (1 << 23), true);
        const result = flagsLoader(plan, ctx, 100);
        expect(result['f0']).toBe(true);
        expect(result['f16']).toBe(true);
        expect(result['f23']).toBe(true);
        expect(result['f1']).toBe(false);
    });

    test('tupleLoader reads tuple members', () => {
        const { ctx, dv } = createMockCtx();
        const plan = {
            members: [
                { offset: 0, loader: (c: MarshalingContext, p: number) => u32Loader(c, p) },
                { offset: 4, loader: (c: MarshalingContext, p: number) => boolLoader(c, p) },
            ],
        };
        dv.setUint32(100, 42, true);
        dv.setUint8(104, 1);
        const result = tupleLoader(plan, ctx, 100);
        expect(result).toEqual([42, true]);
    });
});

// ─── Resource/stream/future/error-context loaders ───

describe('memory-load resource/stream/future loaders', () => {
    test('ownResourceLoader reads handle and removes from table', () => {
        const { ctx, dv } = createMockCtx();
        const plan = { resourceTypeIdx: 0 };
        dv.setInt32(100, 7, true);
        const result = ownResourceLoader(plan, ctx, 100) as any;
        expect(result.__handle).toBe(7);
    });

    test('borrowResourceLoader reads handle and gets from table', () => {
        const { ctx, dv } = createMockCtx();
        const plan = { resourceTypeIdx: 0 };
        dv.setInt32(100, 3, true);
        const result = borrowResourceLoader(plan, ctx, 100) as any;
        expect(result.__handle).toBe(3);
    });

    test('borrowResourceDirectLoader reads handle as raw number', () => {
        const { ctx, dv } = createMockCtx();
        const plan = { resourceTypeIdx: 0 };
        dv.setInt32(100, 5, true);
        expect(borrowResourceDirectLoader(plan, ctx, 100)).toBe(5);
    });

    test('streamLoader reads handle and removes readable', () => {
        const { ctx, dv } = createMockCtx();
        dv.setInt32(100, 11, true);
        const result = streamLoader(ctx, 100) as any;
        expect(result.__streamHandle).toBe(11);
    });

    test('futureLoader reads handle and removes readable', () => {
        const { ctx, dv } = createMockCtx();
        dv.setInt32(100, 13, true);
        const result = futureLoader(ctx, 100) as any;
        expect(result.__futureHandle).toBe(13);
    });

    test('errorContextLoader reads handle and removes', () => {
        const { ctx, dv } = createMockCtx();
        dv.setInt32(100, 17, true);
        const result = errorContextLoader(ctx, 100) as any;
        expect(result.__errorContextHandle).toBe(17);
    });
});
