// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { initializeAsserts } from '../../src/utils/assert';
initializeAsserts();

import type { WasmPointer, WasmSize, WasmValue } from '../../src/marshal/model/types';
import type { MarshalingContext } from '../../src/resolver/types';
import {
    lowerU64Number,
    lowerStringUtf16,
    lowerStringUtf8,
    lowerEnum,
    lowerFlags,
    lowerRecord,
    lowerTuple,
    lowerList,
    lowerOption,
    lowerResult,
    lowerVariant,
    lowerOwn,
    lowerBorrow,
    lowerBorrowDirect,
    lowerChar,
    lowerF32,
    lowerF64,
} from '../../src/marshal/lower';
import { liftStream, liftFuture, liftErrorContext } from '../../src/marshal/lift';
import { _f32, _i32, _f64, _i64 } from '../../src/utils/shared';

function createMockCtx(bufferSize = 4096): { ctx: MarshalingContext, buffer: ArrayBuffer, dv: DataView } {
    const buffer = new ArrayBuffer(bufferSize);
    const dv = new DataView(buffer);

    const memory = {
        getMemory: () => ({ buffer } as WebAssembly.Memory),
        getView(ptr: WasmPointer, len: WasmSize): DataView {
            return new DataView(buffer, ptr as number, len as number);
        },
        getViewU8(ptr: WasmPointer, len: WasmSize): Uint8Array {
            return new Uint8Array(buffer, ptr as number, len as number);
        },
    };

    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

    const resources = {
        get(_typeIdx: number, _handle: number): unknown { return { id: _handle }; },
        remove(_typeIdx: number, _handle: number): unknown { return { id: _handle }; },
    };

    const streams = {
        removeReadable(_typeIdx: number, handle: number): unknown { return { streamHandle: handle }; },
    };

    const futures = {
        removeReadable(_typeIdx: number, handle: number): unknown { return { futureHandle: handle }; },
    };

    const errorContexts = {
        remove(handle: number): unknown { return { errorHandle: handle }; },
    };

    const ctx = { memory, utf8Decoder, resources, streams, futures, errorContexts } as any as MarshalingContext;
    return { ctx, buffer, dv };
}

describe('lower.ts primitive lowering', () => {
    test('u64LoweringNumber converts bigint to number', () => {
        const { ctx } = createMockCtx();
        expect(lowerU64Number(ctx, 42n)).toBe(42);
    });

    test('charLowering rejects codepoint >= 0x110000', () => {
        const { ctx } = createMockCtx();
        expect(() => lowerChar(ctx, 0x110000)).toThrow('Invalid char codepoint');
    });

    test('charLowering rejects surrogate codepoints', () => {
        const { ctx } = createMockCtx();
        expect(() => lowerChar(ctx, 0xD800)).toThrow('surrogate');
        expect(() => lowerChar(ctx, 0xDFFF)).toThrow('surrogate');
    });

    test('charLowering accepts max valid codepoint 0x10FFFF', () => {
        const { ctx } = createMockCtx();
        const result = lowerChar(ctx, 0x10FFFF);
        expect(result).toBe(String.fromCodePoint(0x10FFFF));
    });

    test('charLowering accepts ASCII codepoint', () => {
        const { ctx } = createMockCtx();
        expect(lowerChar(ctx, 0x41)).toBe('A');
    });

    test('f32Lowering canonicalizes NaN to canonical bit pattern (0x7fc00000)', () => {
        const { ctx } = createMockCtx();
        const result = lowerF32(ctx, NaN) as number;
        expect(result).toBeNaN();
        _f32[0] = result;
        expect(_i32[0]).toBe(0x7fc00000);
    });

    test('f64Lowering canonicalizes NaN to canonical bit pattern (0x7ff8000000000000)', () => {
        const { ctx } = createMockCtx();
        const result = lowerF64(ctx, NaN) as number;
        expect(result).toBeNaN();
        _f64[0] = result;
        expect(_i64[0]).toBe(0x7ff8000000000000n);
    });

    test('f32Lowering preserves normal values', () => {
        const { ctx } = createMockCtx();
        expect(lowerF32(ctx, 3.14)).toBe(Math.fround(3.14));
    });

    test('f64Lowering preserves normal values', () => {
        const { ctx } = createMockCtx();
        expect(lowerF64(ctx, 3.14)).toBe(3.14);
    });
});

describe('lower.ts stringLoweringUtf16', () => {
    test('decodes empty UTF-16 string', () => {
        const { ctx } = createMockCtx();
        const result = lowerStringUtf16(ctx, 0, 0);
        expect(result).toBe('');
    });

    test('decodes BMP characters', () => {
        const { ctx, dv } = createMockCtx();
        // Write "Hi" in UTF-16LE at offset 100
        dv.setUint16(100, 0x0048, true); // 'H'
        dv.setUint16(102, 0x0069, true); // 'i'
        const result = lowerStringUtf16(ctx, 100, 2);
        expect(result).toBe('Hi');
    });

    test('throws on misaligned pointer', () => {
        const { ctx, dv } = createMockCtx();
        dv.setUint16(100, 0x0041, true);
        expect(() => lowerStringUtf16(ctx, 101, 1)).toThrow('not aligned');
    });

    test('throws on out of bounds', () => {
        const { ctx } = createMockCtx(128);
        expect(() => lowerStringUtf16(ctx, 100, 100)).toThrow('out of bounds');
    });
});

describe('lower.ts stringLoweringUtf8', () => {
    test('decodes empty UTF-8 string', () => {
        const { ctx } = createMockCtx();
        const result = lowerStringUtf8(ctx, 0, 0);
        expect(result).toBe('');
    });

    test('decodes ASCII string', () => {
        const { ctx, buffer } = createMockCtx();
        const bytes = new TextEncoder().encode('hello');
        new Uint8Array(buffer, 200, bytes.length).set(bytes);
        const result = lowerStringUtf8(ctx, 200, bytes.length);
        expect(result).toBe('hello');
    });

    test('throws on out of bounds', () => {
        const { ctx } = createMockCtx(128);
        expect(() => lowerStringUtf8(ctx, 100, 100)).toThrow('out of bounds');
    });
});

describe('lower.ts enum/flags/record/tuple lowering', () => {
    test('enumLowering returns named member', () => {
        const { ctx } = createMockCtx();
        const plan = { members: ['red', 'green', 'blue'] };
        expect(lowerEnum(plan, ctx, 1)).toBe('green');
    });

    test('enumLowering throws on invalid discriminant', () => {
        const { ctx } = createMockCtx();
        const plan = { members: ['red'] };
        expect(() => lowerEnum(plan, ctx, 5)).toThrow('Invalid enum discriminant');
    });

    test('flagsLowering decodes bitfield', () => {
        const { ctx } = createMockCtx();
        const plan = { wordCount: 1, memberNames: ['a', 'b', 'c', 'd'] };
        const result = lowerFlags(plan, ctx, 0b0101) as Record<string, boolean>;
        expect(result.a).toBe(true);
        expect(result.b).toBe(false);
        expect(result.c).toBe(true);
        expect(result.d).toBe(false);
    });

    test('recordLowering returns named fields', () => {
        const { ctx } = createMockCtx();
        const plan = {
            fields: [
                { name: 'x', spill: 1, lowerer: (_c: MarshalingContext, ...a: WasmValue[]) => a[0] as number },
                { name: 'y', spill: 1, lowerer: (_c: MarshalingContext, ...a: WasmValue[]) => a[0] as number },
            ],
        };
        const result = lowerRecord(plan, ctx, 10, 20) as Record<string, number>;
        expect(result.x).toBe(10);
        expect(result.y).toBe(20);
    });

    test('tupleLowering returns array', () => {
        const { ctx } = createMockCtx();
        const plan = {
            elements: [
                { spill: 1, lowerer: (_c: MarshalingContext, ...a: WasmValue[]) => a[0] as number },
                { spill: 1, lowerer: (_c: MarshalingContext, ...a: WasmValue[]) => a[0] as number },
            ],
        };
        const result = lowerTuple(plan, ctx, 42, 99) as number[];
        expect(result).toEqual([42, 99]);
    });
});

describe('lower.ts list/option/result/variant lowering', () => {
    test('listLowering with elements', () => {
        const { ctx, dv } = createMockCtx();
        dv.setUint32(100, 10, true);
        dv.setUint32(104, 20, true);
        const plan = {
            elemSize: 4,
            elemAlign: 4,
            elemLoader: (c: MarshalingContext, ptr: number) => new DataView(c.memory.getMemory().buffer, ptr, 4).getUint32(0, true),
        };
        // ptr=100, len=2
        const result = lowerList(plan as any, ctx, 100, 2) as number[];
        expect(result).toEqual([10, 20]);
    });

    test('listLowering empty list', () => {
        const { ctx } = createMockCtx();
        const plan = { elemSize: 4, elemAlign: 4, elemLoader: () => 0 };
        const result = lowerList(plan as any, ctx, 0, 0) as number[];
        expect(result).toEqual([]);
    });

    test('optionLowering returns null for disc 0', () => {
        const { ctx } = createMockCtx();
        const plan = { innerSpill: 1, innerLowerer: (_c: MarshalingContext, ...a: WasmValue[]) => a[0] };
        expect(lowerOption(plan, ctx, 0, 42)).toBeNull();
    });

    test('optionLowering returns value for disc 1', () => {
        const { ctx } = createMockCtx();
        const plan = { innerSpill: 1, innerLowerer: (_c: MarshalingContext, ...a: WasmValue[]) => a[0] };
        expect(lowerOption(plan, ctx, 1, 42)).toBe(42);
    });

    test('optionLowering throws on invalid disc', () => {
        const { ctx } = createMockCtx();
        const plan = { innerSpill: 1, innerLowerer: () => null };
        expect(() => lowerOption(plan, ctx, 2)).toThrow('Invalid option discriminant');
    });

    test('resultLowering returns ok', () => {
        const { ctx } = createMockCtx();
        const plan = {
            payloadJoined: [0],
            okFlatTypes: [0],
            errFlatTypes: [],
            okLowerer: (_c: MarshalingContext, ...a: WasmValue[]) => a[0],
            errLowerer: null,
        };
        const result = lowerResult(plan as any, ctx, 0, 42) as { tag: string; val: unknown };
        expect(result.tag).toBe('ok');
        expect(result.val).toBe(42);
    });

    test('resultLowering returns err', () => {
        const { ctx } = createMockCtx();
        const plan = {
            payloadJoined: [0],
            okFlatTypes: [],
            errFlatTypes: [0],
            okLowerer: null,
            errLowerer: (_c: MarshalingContext, ...a: WasmValue[]) => a[0],
        };
        const result = lowerResult(plan as any, ctx, 1, -1) as { tag: string; val: unknown };
        expect(result.tag).toBe('err');
        expect(result.val).toBe(-1);
    });

    test('variantLowering returns named case with val', () => {
        const { ctx } = createMockCtx();
        const plan = {
            payloadJoined: [0],
            cases: [
                { name: 'a', lowerer: (_c: MarshalingContext, ...a: WasmValue[]) => a[0], caseFlatTypes: [0], needsCoercion: false },
                { name: 'b', lowerer: null, caseFlatTypes: [], needsCoercion: false },
            ],
        };
        const result = lowerVariant(plan as any, ctx, 0, 42) as { tag: string; val: unknown };
        expect(result.tag).toBe('a');
        expect(result.val).toBe(42);
    });

    test('variantLowering returns named case without val', () => {
        const { ctx } = createMockCtx();
        const plan = {
            payloadJoined: [],
            cases: [
                { name: 'a', lowerer: null, caseFlatTypes: [], needsCoercion: false },
            ],
        };
        const result = lowerVariant(plan as any, ctx, 0) as { tag: string };
        expect(result.tag).toBe('a');
        expect(result).not.toHaveProperty('val');
    });

    test('variantLowering throws on invalid disc', () => {
        const { ctx } = createMockCtx();
        const plan = { payloadJoined: [], cases: [] };
        expect(() => lowerVariant(plan as any, ctx, 5)).toThrow('Invalid variant discriminant');
    });
});

describe('lower.ts resource/stream/future/errorContext lowering', () => {
    test('ownLowering removes from table by handle', () => {
        const { ctx } = createMockCtx();
        const plan = { resourceTypeIdx: 0 };
        const result = lowerOwn(plan, ctx, 42) as { id: number };
        expect(result.id).toBe(42);
    });

    test('borrowLowering gets from table by handle', () => {
        const { ctx } = createMockCtx();
        const plan = { resourceTypeIdx: 0 };
        const result = lowerBorrow(plan, ctx, 7) as { id: number };
        expect(result.id).toBe(7);
    });

    test('borrowLoweringDirect returns handle directly', () => {
        const { ctx } = createMockCtx();
        const plan = { resourceTypeIdx: 0 };
        expect(lowerBorrowDirect(plan, ctx, 99)).toBe(99);
    });

    test('streamLifting removes readable by handle', () => {
        const { ctx } = createMockCtx();
        const result = liftStream(ctx, 5) as { streamHandle: number };
        expect(result.streamHandle).toBe(5);
    });

    test('futureLifting removes readable by handle', () => {
        const { ctx } = createMockCtx();
        const result = liftFuture(ctx, 8) as { futureHandle: number };
        expect(result.futureHandle).toBe(8);
    });

    test('errorContextLifting removes by handle', () => {
        const { ctx } = createMockCtx();
        const result = liftErrorContext(ctx, 3) as { errorHandle: number };
        expect(result.errorHandle).toBe(3);
    });
});
