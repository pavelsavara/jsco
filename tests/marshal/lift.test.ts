// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { initializeAsserts } from '../../src/utils/assert';
initializeAsserts();

import type { WasmPointer, WasmSize, WasmValue } from '../../src/marshal/model/types';
import type { MarshalingContext } from '../../src/resolver/types';
import {
    s64LiftingNumber, u64LiftingNumber,
    stringLiftingUtf16, stringLiftingUtf8,
    f32Lifting, f64Lifting,
    charLifting,
    enumLifting,
    flagsLifting,
    ownLifting, borrowLifting, borrowLiftingDirect,
} from '../../src/marshal/lift';
import { _f32, _i32, _f64, _i64 } from '../../src/utils/shared';

function createMockCtx(bufferSize = 4096): MarshalingContext {
    const buffer = new ArrayBuffer(bufferSize);
    let allocPtr = 1000;

    const memory = {
        getMemory: () => ({ buffer } as WebAssembly.Memory),
        getView(ptr: WasmPointer, len: WasmSize): DataView {
            return new DataView(buffer, ptr as number, len as number);
        },
        getViewU8(ptr: WasmPointer, len: WasmSize): Uint8Array {
            return new Uint8Array(buffer, ptr as number, len as number);
        },
    };

    const allocator = {
        realloc(_oldPtr: number, _oldSize: number, _align: number, newSize: number): number {
            const p = allocPtr;
            allocPtr += newSize;
            return p;
        },
    };

    const utf8Encoder = new TextEncoder();
    let nextHandle = 1;
    const resources = {
        add(_typeIdx: number, _value: unknown): number { return nextHandle++; },
    };

    return { memory, allocator, utf8Encoder, resources } as any as MarshalingContext;
}

describe('lift.ts integer lifting', () => {
    test('s64LiftingNumber passes value through', () => {
        const ctx = createMockCtx();
        const out: WasmValue[] = [0];
        s64LiftingNumber(ctx, 42, out, 0);
        expect(out[0]).toBe(42);
    });

    test('u64LiftingNumber passes value through', () => {
        const ctx = createMockCtx();
        const out: WasmValue[] = [0];
        u64LiftingNumber(ctx, 42, out, 0);
        expect(out[0]).toBe(42);
    });
});

describe('lift.ts f32/f64 NaN canonicalization', () => {
    test('f32Lifting canonicalizes NaN', () => {
        const ctx = createMockCtx();
        const out: WasmValue[] = [0];
        f32Lifting(ctx, NaN, out, 0);
        expect(out[0]).toBeNaN();
    });

    test('f32Lifting produces canonical NaN bit pattern (0x7fc00000)', () => {
        const ctx = createMockCtx();
        const out: WasmValue[] = [0];
        f32Lifting(ctx, NaN, out, 0);
        _f32[0] = out[0] as number;
        expect(_i32[0]).toBe(0x7fc00000);
    });

    test('f64Lifting canonicalizes NaN', () => {
        const ctx = createMockCtx();
        const out: WasmValue[] = [0];
        f64Lifting(ctx, NaN, out, 0);
        expect(out[0]).toBeNaN();
    });

    test('f64Lifting produces canonical NaN bit pattern (0x7ff8000000000000)', () => {
        const ctx = createMockCtx();
        const out: WasmValue[] = [0];
        f64Lifting(ctx, NaN, out, 0);
        _f64[0] = out[0] as number;
        expect(_i64[0]).toBe(0x7ff8000000000000n);
    });

    test('f32Lifting throws for non-number', () => {
        const ctx = createMockCtx();
        const out: WasmValue[] = [0];
        expect(() => f32Lifting(ctx, 'not-a-number', out, 0)).toThrow('expected a number');
    });

    test('f64Lifting throws for non-number', () => {
        const ctx = createMockCtx();
        const out: WasmValue[] = [0];
        expect(() => f64Lifting(ctx, 'not-a-number', out, 0)).toThrow('expected a number');
    });

    test('f32Lifting preserves normal values', () => {
        const ctx = createMockCtx();
        const out: WasmValue[] = [0];
        f32Lifting(ctx, 3.14, out, 0);
        expect(out[0]).toBe(Math.fround(3.14));
    });

    test('f64Lifting preserves normal values', () => {
        const ctx = createMockCtx();
        const out: WasmValue[] = [0];
        f64Lifting(ctx, 3.14, out, 0);
        expect(out[0]).toBe(3.14);
    });
});

describe('lift.ts charLifting', () => {
    test('charLifting rejects surrogates', () => {
        const ctx = createMockCtx();
        const out: WasmValue[] = [0];
        // Use a string that starts with a surrogate codepoint
        // This would normally be a lone surrogate in a string
        expect(() => charLifting(ctx, '\uD800', out, 0)).toThrow('surrogate');
    });

    test('charLifting throws on non-string', () => {
        const ctx = createMockCtx();
        const out: WasmValue[] = [0];
        expect(() => charLifting(ctx, 42, out, 0)).toThrow('expected a string');
    });

    test('charLifting accepts max valid codepoint U+10FFFF', () => {
        const ctx = createMockCtx();
        const out: WasmValue[] = [0];
        charLifting(ctx, String.fromCodePoint(0x10FFFF), out, 0);
        expect(out[0]).toBe(0x10FFFF);
    });

    test('charLifting accepts ASCII character', () => {
        const ctx = createMockCtx();
        const out: WasmValue[] = [0];
        charLifting(ctx, 'A', out, 0);
        expect(out[0]).toBe(0x41);
    });
});

describe('lift.ts stringLiftingUtf16', () => {
    test('encodes empty string', () => {
        const ctx = createMockCtx();
        const out: WasmValue[] = [0, 0];
        stringLiftingUtf16(ctx, '', out, 0);
        expect(out[0]).toBe(0);
        expect(out[1]).toBe(0);
    });

    test('encodes BMP characters in UTF-16LE', () => {
        const ctx = createMockCtx();
        const out: WasmValue[] = [0, 0];
        stringLiftingUtf16(ctx, 'Hi', out, 0);
        // Should have allocated and returned pointer + code unit count
        expect(out[0]).toBeGreaterThan(0); // pointer
        expect(out[1]).toBe(2); // code units
    });

    test('encodes multi-byte string', () => {
        const ctx = createMockCtx();
        const out: WasmValue[] = [0, 0];
        stringLiftingUtf16(ctx, 'Ωπ', out, 0);
        expect(out[1]).toBe(2); // 2 BMP code units
    });

    test('throws for non-string', () => {
        const ctx = createMockCtx();
        const out: WasmValue[] = [0, 0];
        expect(() => stringLiftingUtf16(ctx, 42, out, 0)).toThrow('expected a string');
    });
});

describe('lift.ts stringLiftingUtf8', () => {
    test('encodes non-empty string', () => {
        const ctx = createMockCtx();
        const out: WasmValue[] = [0, 0];
        stringLiftingUtf8(ctx, 'hello', out, 0);
        expect(out[0]).toBeGreaterThan(0);
        expect(out[1]).toBe(5);
    });

    test('encodes empty string', () => {
        const ctx = createMockCtx();
        const out: WasmValue[] = [0, 0];
        stringLiftingUtf8(ctx, '', out, 0);
        expect(out[0]).toBe(0);
        expect(out[1]).toBe(0);
    });
});

describe('lift.ts enum/flags lifting', () => {
    test('enumLifting maps string to index', () => {
        const ctx = createMockCtx();
        const plan = { nameToIndex: new Map([['red', 0], ['green', 1]]) };
        const out: WasmValue[] = [0];
        enumLifting(plan, ctx, 'green', out, 0);
        expect(out[0]).toBe(1);
    });

    test('enumLifting throws on unknown', () => {
        const ctx = createMockCtx();
        const plan = { nameToIndex: new Map([['red', 0]]) };
        const out: WasmValue[] = [0];
        expect(() => enumLifting(plan, ctx, 'purple', out, 0)).toThrow('Unknown enum value');
    });

    test('flagsLifting encodes bitfield', () => {
        const ctx = createMockCtx();
        const plan = { wordCount: 1, memberNames: ['a', 'b', 'c'] };
        const out: WasmValue[] = [0];
        flagsLifting(plan, ctx, { a: true, b: false, c: true }, out, 0);
        expect(out[0]).toBe(0b101);
    });

    test('flagsLifting throws on null', () => {
        const ctx = createMockCtx();
        const plan = { wordCount: 1, memberNames: ['a'] };
        const out: WasmValue[] = [0];
        expect(() => flagsLifting(plan, ctx, null, out, 0)).toThrow('expected an object');
    });
});

describe('lift.ts resource lifting', () => {
    test('ownLifting adds to table', () => {
        const ctx = createMockCtx();
        const plan = { resourceTypeIdx: 0 };
        const out: WasmValue[] = [0];
        ownLifting(plan, ctx, { name: 'res' }, out, 0);
        expect(out[0]).toBeGreaterThan(0);
    });

    test('borrowLifting adds to table', () => {
        const ctx = createMockCtx();
        const plan = { resourceTypeIdx: 0 };
        const out: WasmValue[] = [0];
        borrowLifting(plan, ctx, { name: 'res' }, out, 0);
        expect(out[0]).toBeGreaterThan(0);
    });

    test('borrowLiftingDirect passes value through', () => {
        const ctx = createMockCtx();
        const plan = { resourceTypeIdx: 0 };
        const out: WasmValue[] = [0];
        borrowLiftingDirect(plan, ctx, 42, out, 0);
        expect(out[0]).toBe(42);
    });
});
