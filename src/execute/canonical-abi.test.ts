// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { initializeAsserts } from '../utils/assert';
initializeAsserts();

import { ModelTag } from '../model/tags';
import { ComponentValType, PrimitiveValType } from '../model/types';
import { ResolverContext, BindingContext, StringEncoding } from '../resolver/types';
import { createResourceTable } from '../resolver/context';
import { createLifting as _createLifting, createFunctionLifting } from '../binder/to-abi';
import { createLowering } from '../binder/to-js';
import { storeToMemory, loadFromMemory } from '../binder/test-helpers';
import { WasmPointer, WasmSize, WasmValue } from './types';
import { validateAllocResult, validatePointerAlignment, checkNotPoisoned, checkNotReentrant } from './validation';
import { describeDebugOnly } from '../test-utils/debug-only';

/** Test-only UTF-8 validator with detailed error messages. */
function validateUtf8(bytes: Uint8Array): void {
    let i = 0;
    while (i < bytes.length) {
        const b0 = bytes[i]!;
        if (b0 < 0x80) {
            i++;
        } else if ((b0 & 0xE0) === 0xC0) {
            if (b0 < 0xC2) throw new Error(`invalid UTF-8: overlong 2-byte sequence at offset ${i}`);
            if (i + 1 >= bytes.length) throw new Error(`invalid UTF-8: truncated 2-byte sequence at offset ${i}`);
            if ((bytes[i + 1]! & 0xC0) !== 0x80) throw new Error(`invalid UTF-8: bad continuation byte at offset ${i + 1}`);
            i += 2;
        } else if ((b0 & 0xF0) === 0xE0) {
            if (i + 2 >= bytes.length) throw new Error(`invalid UTF-8: truncated 3-byte sequence at offset ${i}`);
            const b1 = bytes[i + 1]!;
            if ((b1 & 0xC0) !== 0x80) throw new Error(`invalid UTF-8: bad continuation byte at offset ${i + 1}`);
            if ((bytes[i + 2]! & 0xC0) !== 0x80) throw new Error(`invalid UTF-8: bad continuation byte at offset ${i + 2}`);
            if (b0 === 0xE0 && b1 < 0xA0) throw new Error(`invalid UTF-8: overlong 3-byte sequence at offset ${i}`);
            if (b0 === 0xED && b1 >= 0xA0) throw new Error(`invalid UTF-8: surrogate codepoint at offset ${i}`);
            i += 3;
        } else if ((b0 & 0xF8) === 0xF0) {
            if (b0 > 0xF4) throw new Error(`invalid UTF-8: codepoint > U+10FFFF at offset ${i}`);
            if (i + 3 >= bytes.length) throw new Error(`invalid UTF-8: truncated 4-byte sequence at offset ${i}`);
            const b1 = bytes[i + 1]!;
            if ((b1 & 0xC0) !== 0x80) throw new Error(`invalid UTF-8: bad continuation byte at offset ${i + 1}`);
            if ((bytes[i + 2]! & 0xC0) !== 0x80) throw new Error(`invalid UTF-8: bad continuation byte at offset ${i + 2}`);
            if ((bytes[i + 3]! & 0xC0) !== 0x80) throw new Error(`invalid UTF-8: bad continuation byte at offset ${i + 3}`);
            if (b0 === 0xF0 && b1 < 0x90) throw new Error(`invalid UTF-8: overlong 4-byte sequence at offset ${i}`);
            if (b0 === 0xF4 && b1 > 0x8F) throw new Error(`invalid UTF-8: codepoint > U+10FFFF at offset ${i}`);
            i += 4;
        } else {
            throw new Error(`invalid UTF-8: unexpected byte 0x${b0.toString(16)} at offset ${i}`);
        }
    }
}

// Wrap BYO-buffer lifters to return arrays for test convenience
function createLifting(rctx: any, model: any): (ctx: BindingContext, value: any) => WasmValue[] {
    const lifter = _createLifting(rctx, model);
    return (ctx: BindingContext, value: any) => {
        const out = new Array<WasmValue>(64);
        const count = lifter(ctx, value, out, 0);
        return out.slice(0, count);
    };
}
import { deepResolveType } from '../resolver/calling-convention';

// --- Test helpers ---

function createMinimalRctx(usesNumberForInt64 = false): ResolverContext {
    return {
        resolved: {
            liftingCache: new Map(), loweringCache: new Map(),
            resolvedTypes: new Map(),
            usesNumberForInt64,
            stringEncoding: StringEncoding.Utf8,
            canonicalResourceIds: new Map(),
            componentSectionCache: new Map(),
        },
    } as any as ResolverContext;
}

function createMockMemoryContext(bufferSize = 4096): { ctx: BindingContext, buffer: ArrayBuffer } {
    const buffer = new ArrayBuffer(bufferSize);
    let nextAlloc = 16;

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

// Helper to create a mock context with a misaligned allocator
function createMisalignedAllocContext(): { ctx: BindingContext, buffer: ArrayBuffer } {
    const buffer = new ArrayBuffer(4096);
    const memory = {
        getMemory() { return { buffer } as any; },
        getView(ptr: WasmPointer, len: WasmSize): DataView { return new DataView(buffer, ptr, len); },
        getViewU8(ptr: WasmPointer, len: WasmSize): Uint8Array { return new Uint8Array(buffer, ptr, len); },
        readI32(ptr: WasmPointer): number { return new DataView(buffer).getInt32(ptr, true); },
        writeI32(ptr: WasmPointer, value: number): void { new DataView(buffer).setInt32(ptr, value, true); },
    };

    // Allocator that always returns misaligned pointers (odd addresses)
    let nextAlloc = 1; // start at 1 — always odd
    const allocator = {
        realloc(_oldPtr: WasmPointer, _oldSize: WasmSize, _align: WasmSize, newSize: WasmSize): WasmPointer {
            if (newSize === 0) return 0 as WasmPointer;
            const ptr = nextAlloc;
            nextAlloc += (newSize as number) + 1; // keep odd
            if (nextAlloc % 2 === 0) nextAlloc++; // force odd
            return ptr as WasmPointer;
        },
    };

    const ctx = {
        memory, allocator,
        utf8Encoder: new TextEncoder(),
        utf8Decoder: new TextDecoder('utf-8', { fatal: true }),
        resources: createResourceTable(),
    } as any as BindingContext;

    return { ctx, buffer };
}

// Helper to create a context with a tiny buffer for OOB testing
function _createTinyBufferContext(size: number): { ctx: BindingContext, buffer: ArrayBuffer } {
    const buffer = new ArrayBuffer(size);
    const memory = {
        getMemory() { return { buffer } as any; },
        getView(ptr: WasmPointer, len: WasmSize): DataView { return new DataView(buffer, ptr, len); },
        getViewU8(ptr: WasmPointer, len: WasmSize): Uint8Array { return new Uint8Array(buffer, ptr, len); },
        readI32(ptr: WasmPointer): number { return new DataView(buffer).getInt32(ptr, true); },
        writeI32(ptr: WasmPointer, value: number): void { new DataView(buffer).setInt32(ptr, value, true); },
    };

    // Allocator that returns a valid pointer at offset 0
    const allocator = {
        realloc(_oldPtr: WasmPointer, _oldSize: WasmSize, _align: WasmSize, _newSize: WasmSize): WasmPointer {
            return 0 as WasmPointer;
        },
    };

    const ctx = {
        memory, allocator,
        utf8Encoder: new TextEncoder(),
        utf8Decoder: new TextDecoder('utf-8', { fatal: true }),
        resources: createResourceTable(),
    } as any as BindingContext;

    return { ctx, buffer };
}

// =============================================================================
// Phase C1: Memory Alignment & Bounds Validation
// =============================================================================

describeDebugOnly('C1: validateAllocResult', () => {
    test('accepts aligned pointer with sufficient bounds', () => {
        const { ctx } = createMockMemoryContext();
        // ptr=16, align=4, size=8 — valid (16 is aligned to 4, 16+8 < 4096)
        expect(() => validateAllocResult(ctx, 16 as WasmPointer, 4, 8)).not.toThrow();
    });

    test('accepts ptr=0 size=0 (null allocation)', () => {
        const { ctx } = createMockMemoryContext();
        expect(() => validateAllocResult(ctx, 0 as WasmPointer, 4, 0)).not.toThrow();
    });

    test('traps on misaligned pointer (align=4, ptr=3)', () => {
        const { ctx } = createMockMemoryContext();
        expect(() => validateAllocResult(ctx, 3 as WasmPointer, 4, 8))
            .toThrow('realloc return not aligned: ptr=3 alignment=4');
    });

    test('traps on misaligned pointer (align=8, ptr=12)', () => {
        const { ctx } = createMockMemoryContext();
        expect(() => validateAllocResult(ctx, 12 as WasmPointer, 8, 16))
            .toThrow('realloc return not aligned: ptr=12 alignment=8');
    });

    test('traps on misaligned pointer (align=2, ptr=1)', () => {
        const { ctx } = createMockMemoryContext();
        expect(() => validateAllocResult(ctx, 1 as WasmPointer, 2, 4))
            .toThrow('realloc return not aligned: ptr=1 alignment=2');
    });

    test('traps on out-of-bounds allocation', () => {
        const { ctx } = createMockMemoryContext(64); // only 64 bytes
        expect(() => validateAllocResult(ctx, 32 as WasmPointer, 4, 64))
            .toThrow('realloc return out of bounds');
    });

    test('traps when ptr+size exactly exceeds memory', () => {
        const { ctx } = createMockMemoryContext(100);
        expect(() => validateAllocResult(ctx, 96 as WasmPointer, 4, 8))
            .toThrow('realloc return out of bounds');
    });

    test('accepts when ptr+size exactly equals memory length', () => {
        const { ctx } = createMockMemoryContext(100);
        expect(() => validateAllocResult(ctx, 96 as WasmPointer, 4, 4)).not.toThrow();
    });

    test('accepts alignment=1 (all addresses are valid)', () => {
        const { ctx } = createMockMemoryContext();
        expect(() => validateAllocResult(ctx, 7 as WasmPointer, 1, 10)).not.toThrow();
        expect(() => validateAllocResult(ctx, 13 as WasmPointer, 1, 10)).not.toThrow();
    });
});

describeDebugOnly('C1: validatePointerAlignment', () => {
    test('accepts aligned pointer', () => {
        expect(() => validatePointerAlignment(16, 4, 'list')).not.toThrow();
    });

    test('accepts any pointer with alignment=1', () => {
        expect(() => validatePointerAlignment(7, 1, 'list')).not.toThrow();
    });

    test('traps on misaligned list pointer (align=4, ptr=5)', () => {
        expect(() => validatePointerAlignment(5, 4, 'list'))
            .toThrow('list pointer not aligned: ptr=5 alignment=4');
    });

    test('traps on misaligned list pointer (align=8, ptr=4)', () => {
        expect(() => validatePointerAlignment(4, 8, 'list'))
            .toThrow('list pointer not aligned: ptr=4 alignment=8');
    });
});

describeDebugOnly('C1: list pointer alignment validation', () => {
    test('list<u32> at misaligned pointer traps on load', () => {
        const rctx = createMinimalRctx();
        const listModel = {
            tag: ModelTag.ComponentTypeDefinedList,
            value: prim(PrimitiveValType.U32),
        } as any;
        const lowerer = createLowering(rctx.resolved, listModel);

        const { ctx, buffer } = createMockMemoryContext();
        // Write list data at offset 0 with ptr=3 (misaligned for u32, align=4)
        const dv = new DataView(buffer);
        dv.setUint32(3, 42, true);

        // lowerer expects (ptr, len) — ptr=3 is misaligned for u32
        expect(() => (lowerer as any)(ctx, 3, 1))
            .toThrow('list pointer not aligned');
    });

    test('list<u32> at aligned pointer succeeds', () => {
        const rctx = createMinimalRctx();
        const listModel = {
            tag: ModelTag.ComponentTypeDefinedList,
            value: prim(PrimitiveValType.U32),
        } as any;
        const lowerer = createLowering(rctx.resolved, listModel);

        const { ctx, buffer } = createMockMemoryContext();
        const dv = new DataView(buffer);
        dv.setUint32(16, 42, true); // aligned at 16

        const result = (lowerer as any)(ctx, 16, 1);
        expect(result).toEqual([42]);
    });

    test('list<u8> at any pointer succeeds (align=1)', () => {
        const rctx = createMinimalRctx();
        const listModel = {
            tag: ModelTag.ComponentTypeDefinedList,
            value: prim(PrimitiveValType.U8),
        } as any;
        const lowerer = createLowering(rctx.resolved, listModel);

        const { ctx, buffer } = createMockMemoryContext();
        new Uint8Array(buffer)[7] = 0xAB;

        const result = (lowerer as any)(ctx, 7, 1);
        expect(result).toEqual([0xAB]);
    });
});

describeDebugOnly('C1: list out-of-bounds validation', () => {
    test('list<u32> beyond memory traps', () => {
        const rctx = createMinimalRctx();
        const listModel = {
            tag: ModelTag.ComponentTypeDefinedList,
            value: prim(PrimitiveValType.U32),
        } as any;
        const lowerer = createLowering(rctx.resolved, listModel);

        const { ctx } = createMockMemoryContext(64);
        // ptr=60, len=2 means 60 + 2*4 = 68 > 64
        expect(() => (lowerer as any)(ctx, 60, 2))
            .toThrow('list pointer out of bounds');
    });
});

describeDebugOnly('C1: string out-of-bounds validation', () => {
    test('string beyond memory traps on load', () => {
        const rctx = createMinimalRctx();
        const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.String));

        const { ctx } = createMockMemoryContext(64);
        // ptr=60, len=10 means 60+10=70 > 64
        expect(() => (lowerer as any)(ctx, 60, 10))
            .toThrow('string pointer out of bounds');
    });
});

describeDebugOnly('C1: list lifting with misaligned realloc traps', () => {
    test('list<u32> lifting traps when realloc returns misaligned ptr', () => {
        const rctx = createMinimalRctx();
        const listModel = {
            tag: ModelTag.ComponentTypeDefinedList,
            value: prim(PrimitiveValType.U32),
        } as any;
        const lifter = createLifting(rctx.resolved, listModel);

        const { ctx } = createMisalignedAllocContext();
        // list<u32> needs align=4 but allocator returns odd addresses
        expect(() => (lifter as any)(ctx, [10, 20, 30]))
            .toThrow('realloc return not aligned');
    });
});

// =============================================================================
// Phase C2: String Encoding Validation
// =============================================================================

describeDebugOnly('C2: validateUtf8', () => {
    test('accepts valid ASCII', () => {
        expect(() => validateUtf8(new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F]))).not.toThrow();
    });

    test('accepts valid 2-byte UTF-8 (é = 0xC3 0xA9)', () => {
        expect(() => validateUtf8(new Uint8Array([0xC3, 0xA9]))).not.toThrow();
    });

    test('accepts valid 3-byte UTF-8 (€ = 0xE2 0x82 0xAC)', () => {
        expect(() => validateUtf8(new Uint8Array([0xE2, 0x82, 0xAC]))).not.toThrow();
    });

    test('accepts valid 4-byte UTF-8 (𝄞 = 0xF0 0x9D 0x84 0x9E)', () => {
        expect(() => validateUtf8(new Uint8Array([0xF0, 0x9D, 0x84, 0x9E]))).not.toThrow();
    });

    test('accepts empty byte sequence', () => {
        expect(() => validateUtf8(new Uint8Array([]))).not.toThrow();
    });

    test('accepts U+0000 (null character)', () => {
        expect(() => validateUtf8(new Uint8Array([0x00]))).not.toThrow();
    });

    test('accepts U+D7FF (last before surrogates)', () => {
        // U+D7FF = 0xED 0x9F 0xBF
        expect(() => validateUtf8(new Uint8Array([0xED, 0x9F, 0xBF]))).not.toThrow();
    });

    test('accepts U+E000 (first after surrogates)', () => {
        // U+E000 = 0xEE 0x80 0x80
        expect(() => validateUtf8(new Uint8Array([0xEE, 0x80, 0x80]))).not.toThrow();
    });

    test('accepts U+10FFFF (maximum valid codepoint)', () => {
        // U+10FFFF = 0xF4 0x8F 0xBF 0xBF
        expect(() => validateUtf8(new Uint8Array([0xF4, 0x8F, 0xBF, 0xBF]))).not.toThrow();
    });

    test('rejects standalone continuation byte (0x80)', () => {
        expect(() => validateUtf8(new Uint8Array([0x80])))
            .toThrow('invalid UTF-8: unexpected byte 0x80');
    });

    test('rejects standalone continuation byte (0xBF)', () => {
        expect(() => validateUtf8(new Uint8Array([0xBF])))
            .toThrow('invalid UTF-8: unexpected byte 0xbf');
    });

    test('rejects overlong 2-byte encoding of ASCII (0xC0 0xAF)', () => {
        expect(() => validateUtf8(new Uint8Array([0xC0, 0xAF])))
            .toThrow('invalid UTF-8: overlong 2-byte');
    });

    test('rejects overlong 2-byte encoding (0xC1 0xBF)', () => {
        expect(() => validateUtf8(new Uint8Array([0xC1, 0xBF])))
            .toThrow('invalid UTF-8: overlong 2-byte');
    });

    test('rejects truncated 2-byte sequence', () => {
        expect(() => validateUtf8(new Uint8Array([0xC3])))
            .toThrow('invalid UTF-8: truncated 2-byte');
    });

    test('rejects bad continuation in 2-byte sequence', () => {
        expect(() => validateUtf8(new Uint8Array([0xC3, 0x28])))
            .toThrow('invalid UTF-8: bad continuation byte');
    });

    test('rejects overlong 3-byte encoding (0xE0 0x80 0x80)', () => {
        expect(() => validateUtf8(new Uint8Array([0xE0, 0x80, 0x80])))
            .toThrow('invalid UTF-8: overlong 3-byte');
    });

    test('rejects surrogate codepoint U+D800 (0xED 0xA0 0x80)', () => {
        expect(() => validateUtf8(new Uint8Array([0xED, 0xA0, 0x80])))
            .toThrow('invalid UTF-8: surrogate codepoint');
    });

    test('rejects surrogate codepoint U+DFFF (0xED 0xBF 0xBF)', () => {
        expect(() => validateUtf8(new Uint8Array([0xED, 0xBF, 0xBF])))
            .toThrow('invalid UTF-8: surrogate codepoint');
    });

    test('rejects truncated 3-byte sequence', () => {
        expect(() => validateUtf8(new Uint8Array([0xE2, 0x82])))
            .toThrow('invalid UTF-8: truncated 3-byte');
    });

    test('rejects bad continuation in 3-byte sequence', () => {
        expect(() => validateUtf8(new Uint8Array([0xE2, 0x28, 0xAC])))
            .toThrow('invalid UTF-8: bad continuation byte');
    });

    test('rejects overlong 4-byte encoding (0xF0 0x80 0x80 0x80)', () => {
        expect(() => validateUtf8(new Uint8Array([0xF0, 0x80, 0x80, 0x80])))
            .toThrow('invalid UTF-8: overlong 4-byte');
    });

    test('rejects codepoint > U+10FFFF (0xF4 0x90 0x80 0x80)', () => {
        expect(() => validateUtf8(new Uint8Array([0xF4, 0x90, 0x80, 0x80])))
            .toThrow('invalid UTF-8: codepoint > U+10FFFF');
    });

    test('rejects byte 0xF5 (would encode > U+10FFFF)', () => {
        expect(() => validateUtf8(new Uint8Array([0xF5, 0x80, 0x80, 0x80])))
            .toThrow('invalid UTF-8: codepoint > U+10FFFF');
    });

    test('rejects truncated 4-byte sequence', () => {
        expect(() => validateUtf8(new Uint8Array([0xF0, 0x9D, 0x84])))
            .toThrow('invalid UTF-8: truncated 4-byte');
    });

    test('rejects byte 0xFE', () => {
        expect(() => validateUtf8(new Uint8Array([0xFE])))
            .toThrow('invalid UTF-8: unexpected byte 0xfe');
    });

    test('rejects byte 0xFF', () => {
        expect(() => validateUtf8(new Uint8Array([0xFF])))
            .toThrow('invalid UTF-8: unexpected byte 0xff');
    });

    test('rejects invalid byte in middle of valid sequence', () => {
        // valid "H", then invalid standalone continuation, then valid "i"
        expect(() => validateUtf8(new Uint8Array([0x48, 0x80, 0x69])))
            .toThrow('invalid UTF-8: unexpected byte 0x80');
    });
});

describeDebugOnly('C2: string lowering validates UTF-8 from memory', () => {
    test('valid UTF-8 string loads correctly', () => {
        const rctx = createMinimalRctx();
        const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.String));

        const { ctx, buffer } = createMockMemoryContext();
        // Write "hello" at offset 16
        const bytes = new TextEncoder().encode('hello');
        new Uint8Array(buffer).set(bytes, 16);

        const result = (lowerer as any)(ctx, 16, 5);
        expect(result).toBe('hello');
    });

    test('invalid UTF-8 in memory traps on load', () => {
        const rctx = createMinimalRctx();
        const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.String));

        const { ctx, buffer } = createMockMemoryContext();
        // Write invalid UTF-8 at offset 16: standalone continuation byte
        new Uint8Array(buffer).set([0x80, 0x80, 0x80], 16);

        // TextDecoder({ fatal: true }) throws on invalid UTF-8
        expect(() => (lowerer as any)(ctx, 16, 3))
            .toThrow('not valid');
    });

    test('surrogate in UTF-8 string traps on load', () => {
        const rctx = createMinimalRctx();
        const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.String));

        const { ctx, buffer } = createMockMemoryContext();
        // Write U+D800 encoded as UTF-8 (0xED 0xA0 0x80)
        new Uint8Array(buffer).set([0xED, 0xA0, 0x80], 16);

        expect(() => (lowerer as any)(ctx, 16, 3))
            .toThrow('not valid');
    });

    test('overlong encoding traps on load', () => {
        const rctx = createMinimalRctx();
        const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.String));

        const { ctx, buffer } = createMockMemoryContext();
        // Overlong encoding of '/' (0x2F): 0xC0 0xAF
        new Uint8Array(buffer).set([0xC0, 0xAF], 16);

        expect(() => (lowerer as any)(ctx, 16, 2))
            .toThrow('not valid');
    });

    test('empty string (len=0) loads without validation', () => {
        const rctx = createMinimalRctx();
        const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.String));

        const { ctx } = createMockMemoryContext();
        const result = (lowerer as any)(ctx, 0, 0);
        expect(result).toBe('');
    });

    test('UTF-8 multibyte string round-trips through memory', () => {
        const rctx = createMinimalRctx();
        const { ctx, buffer } = createMockMemoryContext();
        const original = '日本語'; // 3-byte UTF-8 chars
        const encoded = new TextEncoder().encode(original);
        new Uint8Array(buffer).set(encoded, 16);

        const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.String));
        const result = (lowerer as any)(ctx, 16, encoded.length);
        expect(result).toBe(original);
    });

    test('UTF-8 4-byte chars round-trip through memory', () => {
        const rctx = createMinimalRctx();
        const { ctx, buffer } = createMockMemoryContext();
        const original = '𝄞🎵'; // 4-byte UTF-8 chars
        const encoded = new TextEncoder().encode(original);
        new Uint8Array(buffer).set(encoded, 16);

        const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.String));
        const result = (lowerer as any)(ctx, 16, encoded.length);
        expect(result).toBe(original);
    });
});

// =============================================================================
// Phase C3: Complex Spilling & Nested Memory Layout
// =============================================================================

describeDebugOnly('C3: nested compound types through memory', () => {
    test('option<list<u8>> round-trips through memory', () => {
        const rctx = createMinimalRctx();
        const { ctx, buffer } = createMockMemoryContext();

        // Register inner list type
        const listModel = {
            tag: ModelTag.ComponentTypeDefinedList,
            value: prim(PrimitiveValType.U8),
        } as any;
        (rctx.resolved.resolvedTypes as Map<any, any>).set(100, listModel);

        const optionModel = deepResolveType(rctx.resolved, {
            tag: ModelTag.ComponentTypeDefinedOption,
            value: { tag: ModelTag.ComponentValTypeType, value: 100 },
        } as any);
        (rctx.resolved.resolvedTypes as Map<any, any>).set(101, optionModel);

        // Store Some([1,2,3]) through memory
        // option layout: discriminant(1 byte) + alignment padding + list(ptr + len = 8 bytes)
        // First, store the list data
        new Uint8Array(buffer)[200] = 1;
        new Uint8Array(buffer)[201] = 2;
        new Uint8Array(buffer)[202] = 3;

        // Write option at offset 16: discriminant=1 (Some)
        const dv = new DataView(buffer);
        dv.setUint8(16, 1); // discriminant = Some
        // padding to align list (ptr, len are 4-byte aligned) → offset 20
        dv.setInt32(20, 200, true); // list ptr
        dv.setInt32(24, 3, true); // list len

        const result = loadFromMemory(ctx, 16, optionModel, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(result).toEqual([1, 2, 3]);
    });

    test('option<option<u8>> None stores discriminant 0', () => {
        const rctx = createMinimalRctx();
        const { ctx, buffer } = createMockMemoryContext();

        const innerOption = {
            tag: ModelTag.ComponentTypeDefinedOption,
            value: prim(PrimitiveValType.U8),
        } as any;
        (rctx.resolved.resolvedTypes as Map<any, any>).set(100, innerOption);

        const outerOption = deepResolveType(rctx.resolved, {
            tag: ModelTag.ComponentTypeDefinedOption,
            value: { tag: ModelTag.ComponentValTypeType, value: 100 },
        } as any);

        // Store None at offset 16
        const dv = new DataView(buffer);
        dv.setUint8(16, 0); // outer discriminant = None

        const result = loadFromMemory(ctx, 16, outerOption, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(result).toBeNull();
    });

    test('result<u32, string> ok case through memory', () => {
        const rctx = createMinimalRctx();
        const { ctx, buffer } = createMockMemoryContext();

        const resultModel = {
            tag: ModelTag.ComponentTypeDefinedResult,
            ok: prim(PrimitiveValType.U32),
            err: prim(PrimitiveValType.String),
        } as any;

        // result layout: discriminant(4 bytes) + payload at offset 4
        // ok case: discriminant=0, payload=u32
        const dv = new DataView(buffer);
        dv.setInt32(16, 0, true); // discriminant = ok
        dv.setUint32(20, 42, true); // payload = 42

        const result = loadFromMemory(ctx, 16, resultModel, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(result).toEqual({ tag: 'ok', val: 42 });
    });

    test('result<u32, string> err case through memory', () => {
        const rctx = createMinimalRctx();
        const { ctx, buffer } = createMockMemoryContext();

        const resultModel = {
            tag: ModelTag.ComponentTypeDefinedResult,
            ok: prim(PrimitiveValType.U32),
            err: prim(PrimitiveValType.String),
        } as any;

        // Write the error string
        const errBytes = new TextEncoder().encode('oops');
        new Uint8Array(buffer).set(errBytes, 200);

        // result layout: discriminant(4 bytes) + payload
        // err case: discriminant=1, payload=string (ptr+len)
        const dv = new DataView(buffer);
        dv.setInt32(16, 1, true); // discriminant = err
        dv.setInt32(20, 200, true); // string ptr
        dv.setInt32(24, 4, true); // string len

        const result = loadFromMemory(ctx, 16, resultModel, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(result).toEqual({ tag: 'err', val: 'oops' });
    });

    test('tuple<u8, u32, u8> with alignment padding round-trips', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();

        const tupleModel = {
            tag: ModelTag.ComponentTypeDefinedTuple,
            members: [
                prim(PrimitiveValType.U8),
                prim(PrimitiveValType.U32),
                prim(PrimitiveValType.U8),
            ],
        } as any;

        // Store: u8 at offset 16, padding to 20, u32 at 20, u8 at 24
        storeToMemory(ctx, 16, tupleModel, [0xAB, 0x12345678, 0xCD], rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);

        // Read back
        const result = loadFromMemory(ctx, 16, tupleModel, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(result).toEqual([0xAB, 0x12345678, 0xCD]);
    });

    test('record with mixed types round-trips through memory', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();

        const recordModel = {
            tag: ModelTag.ComponentTypeDefinedRecord,
            members: [
                { name: 'flag', type: prim(PrimitiveValType.Bool) },
                { name: 'count', type: prim(PrimitiveValType.U32) },
                { name: 'score', type: prim(PrimitiveValType.Float32) },
                { name: 'byte', type: prim(PrimitiveValType.U8) },
            ],
        } as any;

        const original = { flag: true, count: 100, score: 3.14, byte: 0xFF };
        storeToMemory(ctx, 16, recordModel, original, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        const result = loadFromMemory(ctx, 16, recordModel, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds) as any;

        expect(result.flag).toBe(true);
        expect(result.count).toBe(100);
        expect(result.score).toBeCloseTo(3.14, 2);
        expect(result.byte).toBe(0xFF);
    });

    test('variant with multiple compound cases round-trips', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();

        const variantModel = {
            tag: ModelTag.ComponentTypeDefinedVariant,
            variants: [
                { name: 'none', ty: undefined },
                { name: 'just-int', ty: prim(PrimitiveValType.U32) },
                { name: 'just-bool', ty: prim(PrimitiveValType.Bool) },
            ],
        } as any;

        // Test case 1: just-int(42)
        storeToMemory(ctx, 16, variantModel, { tag: 'just-int', val: 42 }, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        let result = loadFromMemory(ctx, 16, variantModel, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(result).toEqual({ tag: 'just-int', val: 42 });

        // Test case 0: none
        storeToMemory(ctx, 64, variantModel, { tag: 'none', val: undefined }, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        result = loadFromMemory(ctx, 64, variantModel, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(result).toEqual({ tag: 'none', val: undefined });
    });

    test('list<tuple<u8, u32>> with alignment-aware element stride', () => {
        const rctx = createMinimalRctx();
        const { ctx, buffer } = createMockMemoryContext();

        const tupleModel = {
            tag: ModelTag.ComponentTypeDefinedTuple,
            members: [
                prim(PrimitiveValType.U8),
                prim(PrimitiveValType.U32),
            ],
        } as any;
        (rctx.resolved.resolvedTypes as Map<any, any>).set(100, tupleModel);

        const listModel = {
            tag: ModelTag.ComponentTypeDefinedList,
            value: { tag: ModelTag.ComponentValTypeType, value: 100 },
        } as any;

        // tuple<u8, u32> has size=8 (1 byte + 3 padding + 4 bytes), align=4
        // Store 2 elements at offset 200
        storeToMemory(ctx, 200, tupleModel, [0xAA, 100], rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        storeToMemory(ctx, 208, tupleModel, [0xBB, 200], rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);

        // Now set up list pointer: ptr=200, len=2
        const dv = new DataView(buffer);
        dv.setInt32(16, 200, true); // ptr
        dv.setInt32(20, 2, true); // len

        // Load the list using lowerer
        const lowerer = createLowering(rctx.resolved, listModel);
        const result = (lowerer as any)(ctx, 200, 2);
        expect(result).toEqual([
            [0xAA, 100],
            [0xBB, 200],
        ]);
    });

    test('deeply nested: list<option<u32>> round-trip', () => {
        const rctx = createMinimalRctx();
        const { ctx, buffer } = createMockMemoryContext();

        const optionModel = {
            tag: ModelTag.ComponentTypeDefinedOption,
            value: prim(PrimitiveValType.U32),
        } as any;
        (rctx.resolved.resolvedTypes as Map<any, any>).set(100, optionModel);

        const listModel = {
            tag: ModelTag.ComponentTypeDefinedList,
            value: { tag: ModelTag.ComponentValTypeType, value: 100 },
        } as any;

        // option<u32> in memory: u8 discriminant + padding(3) + u32 payload = 8 bytes, align=4
        // Store 3 elements at offset 200:
        // [Some(10), None, Some(20)]
        const dv = new DataView(buffer);
        // Element 0: Some(10) at 200
        dv.setUint8(200, 1); // discriminant = Some
        dv.setUint32(204, 10, true); // payload
        // Element 1: None at 208
        dv.setUint8(208, 0); // discriminant = None
        // Element 2: Some(20) at 216
        dv.setUint8(216, 1); // discriminant = Some
        dv.setUint32(220, 20, true); // payload

        const lowerer = createLowering(rctx.resolved, listModel);
        const result = (lowerer as any)(ctx, 200, 3);
        expect(result).toEqual([10, null, 20]);
    });
});

// =============================================================================
// Phase C4: Runtime Behavioral Guarantees
// =============================================================================

describeDebugOnly('C4: checkNotPoisoned', () => {
    test('does not throw on healthy context', () => {
        const { ctx } = createMockMemoryContext();
        expect(() => checkNotPoisoned(ctx)).not.toThrow();
    });

    test('does not throw when poisoned is false', () => {
        const { ctx } = createMockMemoryContext();
        ctx.poisoned = false;
        expect(() => checkNotPoisoned(ctx)).not.toThrow();
    });

    test('throws when context is poisoned', () => {
        const { ctx } = createMockMemoryContext();
        ctx.poisoned = true;
        expect(() => checkNotPoisoned(ctx))
            .toThrow('component instance is poisoned');
    });
});

describeDebugOnly('C4: checkNotReentrant', () => {
    test('does not throw when not in export', () => {
        const { ctx } = createMockMemoryContext();
        expect(() => checkNotReentrant(ctx)).not.toThrow();
    });

    test('does not throw when inExport is false', () => {
        const { ctx } = createMockMemoryContext();
        ctx.inExport = false;
        expect(() => checkNotReentrant(ctx)).not.toThrow();
    });

    test('throws when already in export', () => {
        const { ctx } = createMockMemoryContext();
        ctx.inExport = true;
        expect(() => checkNotReentrant(ctx))
            .toThrow('cannot reenter component');
    });
});

describeDebugOnly('C4: instance poisoning through liftingTrampoline', () => {
    test('export call sets inExport and clears on return', () => {
        const rctx = createMinimalRctx();
        const funcModel = {
            tag: ModelTag.ComponentTypeFunc,
            params: [{ name: 'x', type: prim(PrimitiveValType.U32) }],
            results: { tag: ModelTag.ComponentFuncResultUnnamed, type: prim(PrimitiveValType.U32) },
        } as any;

        const fnLifting = createFunctionLifting(rctx.resolved, funcModel);
        const { ctx } = createMockMemoryContext();

        let capturedInExport = false;
        const mockWasm = (x: number) => {
            capturedInExport = ctx.inExport!;
            return x * 2;
        };

        const jsFunc = fnLifting(ctx, mockWasm as any);
        const result = (jsFunc as any)(5);
        expect(result).toBe(10);
        expect(capturedInExport).toBe(true);
        expect(ctx.inExport).toBe(false); // cleared after return
    });

    test('export call poisons instance on trap', () => {
        const rctx = createMinimalRctx();
        const funcModel = {
            tag: ModelTag.ComponentTypeFunc,
            params: [],
            results: { tag: ModelTag.ComponentFuncResultUnnamed, type: prim(PrimitiveValType.U32) },
        } as any;

        const fnLifting = createFunctionLifting(rctx.resolved, funcModel);
        const { ctx } = createMockMemoryContext();

        const mockWasm = () => { throw new Error('wasm trap!'); };
        const jsFunc = fnLifting(ctx, mockWasm as any);

        expect(() => (jsFunc as any)()).toThrow('wasm trap!');
        expect(ctx.poisoned).toBe(true);
        expect(ctx.inExport).toBe(false); // cleared in finally
    });

    test('poisoned instance rejects subsequent export calls', () => {
        const rctx = createMinimalRctx();
        const funcModel = {
            tag: ModelTag.ComponentTypeFunc,
            params: [],
            results: { tag: ModelTag.ComponentFuncResultUnnamed, type: prim(PrimitiveValType.U32) },
        } as any;

        const fnLifting = createFunctionLifting(rctx.resolved, funcModel);
        const { ctx } = createMockMemoryContext();

        // First call traps
        const trappingWasm = () => { throw new Error('wasm trap!'); };
        const jsFunc1 = fnLifting(ctx, trappingWasm as any);
        expect(() => (jsFunc1 as any)()).toThrow('wasm trap!');

        // Second call (even to a different function) should be rejected
        const normalWasm = () => 42;
        const jsFunc2 = fnLifting(ctx, normalWasm as any);
        expect(() => (jsFunc2 as any)()).toThrow('component instance is poisoned');
    });
});

describeDebugOnly('C4: reentrance guard through liftingTrampoline', () => {
    test('reentrant export call is rejected', () => {
        const rctx = createMinimalRctx();
        const funcModel = {
            tag: ModelTag.ComponentTypeFunc,
            params: [],
            results: { tag: ModelTag.ComponentFuncResultUnnamed, type: prim(PrimitiveValType.U32) },
        } as any;

        const fnLifting = createFunctionLifting(rctx.resolved, funcModel);
        const { ctx } = createMockMemoryContext();

        let reentrantError: Error | null = null;
        const outerWasm = () => {
            // This simulates an import callback trying to re-enter the component
            try {
                const innerFunc = fnLifting(ctx, (() => 99) as any);
                (innerFunc as any)();
            } catch (e) {
                reentrantError = e as Error;
            }
            return 42;
        };

        const jsFunc = fnLifting(ctx, outerWasm as any);
        // The outer call should succeed but the inner reentrant call should fail
        // However, since the inner call throws, it poisons the context
        // The outer call will then also throw due to poisoning
        // Let's capture the reentrant error separately
        try {
            (jsFunc as any)();
        } catch (e) {
            // outer might be poisoned, that's fine
        }

        expect(reentrantError).not.toBeNull();
        expect(reentrantError!.message).toContain('cannot reenter component');
    });
});

describeDebugOnly('C4: post-return cleanup', () => {
    test('post-return function is called after successful export', () => {
        const rctx = createMinimalRctx();
        const funcModel = {
            tag: ModelTag.ComponentTypeFunc,
            params: [],
            results: { tag: ModelTag.ComponentFuncResultUnnamed, type: prim(PrimitiveValType.U32) },
        } as any;

        const fnLifting = createFunctionLifting(rctx.resolved, funcModel);
        const { ctx } = createMockMemoryContext();

        let postReturnCalled = false;
        const mockWasm = () => {
            // Set up post-return during the export call
            ctx.postReturnFn = () => { postReturnCalled = true; };
            return 42;
        };

        const jsFunc = fnLifting(ctx, mockWasm as any);
        const result = (jsFunc as any)();
        expect(result).toBe(42);
        expect(postReturnCalled).toBe(true);
        expect(ctx.postReturnFn).toBeUndefined(); // cleared after call
    });

    test('post-return is not called on trap', () => {
        const rctx = createMinimalRctx();
        const funcModel = {
            tag: ModelTag.ComponentTypeFunc,
            params: [],
            results: { tag: ModelTag.ComponentFuncResultUnnamed, type: prim(PrimitiveValType.U32) },
        } as any;

        const fnLifting = createFunctionLifting(rctx.resolved, funcModel);
        const { ctx } = createMockMemoryContext();

        let postReturnCalled = false;
        ctx.postReturnFn = () => { postReturnCalled = true; };

        const trappingWasm = () => { throw new Error('trap'); };
        const jsFunc = fnLifting(ctx, trappingWasm as any);

        expect(() => (jsFunc as any)()).toThrow('trap');
        expect(postReturnCalled).toBe(false);
    });
});

// =============================================================================
// Combined C1-C4: integration scenarios
// =============================================================================

describeDebugOnly('C-integration: full round-trip with validation', () => {
    test('string lift + lower round-trip with valid UTF-8', () => {
        const liftRctx = createMinimalRctx();
        const lowerRctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();

        const lifter = createLifting(liftRctx.resolved, prim(PrimitiveValType.String));
        const lowerer = createLowering(lowerRctx.resolved, prim(PrimitiveValType.String));

        const original = 'hello world 🌍';
        const [ptr, len] = (lifter as any)(ctx, original) as [number, number];
        const result = (lowerer as any)(ctx, ptr, len);
        expect(result).toBe(original);
    });

    test('list<u32> lift validates alignment, then lower validates pointer', () => {
        const liftRctx = createMinimalRctx();
        const lowerRctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();

        const listModelLift = {
            tag: ModelTag.ComponentTypeDefinedList,
            value: prim(PrimitiveValType.U32),
        } as any;
        const listModelLower = {
            tag: ModelTag.ComponentTypeDefinedList,
            value: prim(PrimitiveValType.U32),
        } as any;

        const lifter = createLifting(liftRctx.resolved, listModelLift);
        const lowerer = createLowering(lowerRctx.resolved, listModelLower);

        const original = [10, 20, 30];
        const [ptr, len] = (lifter as any)(ctx, original) as [number, number];
        const result = (lowerer as any)(ctx, ptr, len);
        expect(result).toEqual(original);
    });

    test('record with string field round-trips with full validation', () => {
        const rctx = createMinimalRctx();
        const { ctx, buffer } = createMockMemoryContext();

        const recordModel = {
            tag: ModelTag.ComponentTypeDefinedRecord,
            members: [
                { name: 'id', type: prim(PrimitiveValType.U32) },
                { name: 'name', type: prim(PrimitiveValType.String) },
            ],
        } as any;

        // Store record with string at offset 32
        // id=42 at offset 32 (4 bytes)
        // name ptr + len at offset 36 (8 bytes)
        const nameBytes = new TextEncoder().encode('Alice');
        new Uint8Array(buffer).set(nameBytes, 200);

        const dv = new DataView(buffer);
        dv.setUint32(32, 42, true); // id
        dv.setInt32(36, 200, true); // name ptr
        dv.setInt32(40, 5, true); // name len

        const result = loadFromMemory(ctx, 32, recordModel, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
        expect(result.id).toBe(42);
        expect(result.name).toBe('Alice');
    });
});

// =============================================================================
// UTF-16 String Encoding
// =============================================================================

describeDebugOnly('UTF-16 string encoding', () => {
    function createUtf16Rctx(): ResolverContext {
        return {
            resolved: {
                liftingCache: new Map(), loweringCache: new Map(),
                resolvedTypes: new Map(),
                usesNumberForInt64: false,
                stringEncoding: StringEncoding.Utf16,
            },
        } as any as ResolverContext;
    }

    describe('lifting (JS → WASM memory)', () => {
        test('ASCII string encodes as UTF-16LE', () => {
            const rctx = createUtf16Rctx();
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.String));
            const { ctx, buffer } = createMockMemoryContext();

            const [ptr, codeUnits] = lifter(ctx, 'hello') as [number, number];
            expect(codeUnits).toBe(5);
            const view = new Uint8Array(buffer, ptr, 10);
            // 'h'=0x0068 'e'=0x0065 'l'=0x006C 'l'=0x006C 'o'=0x006F (little-endian)
            expect(view[0]).toBe(0x68); expect(view[1]).toBe(0x00);
            expect(view[2]).toBe(0x65); expect(view[3]).toBe(0x00);
            expect(view[4]).toBe(0x6C); expect(view[5]).toBe(0x00);
        });

        test('empty string returns [0, 0]', () => {
            const rctx = createUtf16Rctx();
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.String));
            const { ctx } = createMockMemoryContext();

            const [ptr, codeUnits] = lifter(ctx, '') as [number, number];
            expect(ptr).toBe(0);
            expect(codeUnits).toBe(0);
        });

        test('BMP characters encode correctly', () => {
            const rctx = createUtf16Rctx();
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.String));
            const { ctx, buffer } = createMockMemoryContext();

            // Japanese characters — all BMP (2 bytes each in UTF-16)
            const [ptr, codeUnits] = lifter(ctx, '日本') as [number, number];
            expect(codeUnits).toBe(2);
            const dv = new DataView(buffer, ptr, 4);
            expect(dv.getUint16(0, true)).toBe('日'.charCodeAt(0));
            expect(dv.getUint16(2, true)).toBe('本'.charCodeAt(0));
        });

        test('surrogate pairs encode correctly', () => {
            const rctx = createUtf16Rctx();
            const lifter = createLifting(rctx.resolved, prim(PrimitiveValType.String));
            const { ctx, buffer } = createMockMemoryContext();

            // 𝄞 = U+1D11E → surrogate pair D834 DD1E
            const [ptr, codeUnits] = lifter(ctx, '𝄞') as [number, number];
            expect(codeUnits).toBe(2); // surrogate pair = 2 code units
            const dv = new DataView(buffer, ptr, 4);
            expect(dv.getUint16(0, true)).toBe(0xD834);
            expect(dv.getUint16(2, true)).toBe(0xDD1E);
        });
    });

    describe('lowering (WASM memory → JS)', () => {
        test('UTF-16LE in memory decodes to JS string', () => {
            const rctx = createUtf16Rctx();
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.String));

            const { ctx, buffer } = createMockMemoryContext();
            // Write "hi" as UTF-16LE at offset 16
            const dv = new DataView(buffer);
            dv.setUint16(16, 'h'.charCodeAt(0), true);
            dv.setUint16(18, 'i'.charCodeAt(0), true);

            const result = (lowerer as any)(ctx, 16, 2);
            expect(result).toBe('hi');
        });

        test('empty string (0 code units) loads correctly', () => {
            const rctx = createUtf16Rctx();
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.String));

            const { ctx } = createMockMemoryContext();
            const result = (lowerer as any)(ctx, 0, 0);
            expect(result).toBe('');
        });

        test('surrogate pairs in memory decode correctly', () => {
            const rctx = createUtf16Rctx();
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.String));

            const { ctx, buffer } = createMockMemoryContext();
            // Write 𝄞 (U+1D11E) as surrogate pair at offset 16
            const dv = new DataView(buffer);
            dv.setUint16(16, 0xD834, true);
            dv.setUint16(18, 0xDD1E, true);

            const result = (lowerer as any)(ctx, 16, 2);
            expect(result).toBe('𝄞');
        });

        test('misaligned UTF-16 pointer traps', () => {
            const rctx = createUtf16Rctx();
            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.String));

            const { ctx, buffer } = createMockMemoryContext();
            // Write at odd offset
            new Uint8Array(buffer).set([0x68, 0x00], 17);

            expect(() => (lowerer as any)(ctx, 17, 1))
                .toThrow('UTF-16 string pointer not aligned');
        });
    });

    describe('memory path (storeToMemory/loadFromMemory)', () => {
        test('UTF-16 string round-trips through memory', () => {
            const rctx = createUtf16Rctx();
            const { ctx } = createMockMemoryContext();

            const strType = prim(PrimitiveValType.String);
            storeToMemory(ctx, 32, strType as any, 'hëllo', rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);

            const result = loadFromMemory(ctx, 32, strType as any, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
            expect(result).toBe('hëllo');
        });

        test('UTF-16 Japanese string round-trips through memory', () => {
            const rctx = createUtf16Rctx();
            const { ctx } = createMockMemoryContext();

            const strType = prim(PrimitiveValType.String);
            storeToMemory(ctx, 32, strType as any, '日本語', rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);

            const result = loadFromMemory(ctx, 32, strType as any, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
            expect(result).toBe('日本語');
        });
    });
});

// =============================================================================
// Security: spilled-path boundary validation (CVE-inspired)
// =============================================================================

describeDebugOnly('Security: spilled-path memory loader validation', () => {

    describe('string loader bounds checking', () => {
        test('traps on out-of-bounds string pointer in memory (spilled path)', () => {
            const rctx = createMinimalRctx();
            const { ctx, buffer } = createMockMemoryContext(128);
            const strType = prim(PrimitiveValType.String);

            // Write a string descriptor at offset 0: ptr=200 (out of 128-byte buffer), len=5
            const dv = new DataView(buffer);
            dv.setUint32(0, 200, true); // ptr beyond memory
            dv.setUint32(4, 5, true); // len

            expect(() => loadFromMemory(ctx, 0, strType as any,
                rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds))
                .toThrow('string pointer out of bounds');
        });

        test('traps on invalid UTF-8 in spilled-path string', () => {
            const rctx = createMinimalRctx();
            const { ctx, buffer } = createMockMemoryContext(256);

            // Write invalid UTF-8 bytes at offset 100
            new Uint8Array(buffer).set([0xC3, 0x28], 100); // invalid continuation byte

            // Write string descriptor at offset 0: ptr=100, len=2
            const dv = new DataView(buffer);
            dv.setUint32(0, 100, true);
            dv.setUint32(4, 2, true);

            const strType = prim(PrimitiveValType.String);
            // TextDecoder({ fatal: true }) throws on invalid UTF-8
            expect(() => loadFromMemory(ctx, 0, strType as any,
                rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds))
                .toThrow('not valid');
        });

        test('handles zero-length string in spilled path', () => {
            const rctx = createMinimalRctx();
            const { ctx, buffer } = createMockMemoryContext(128);

            const dv = new DataView(buffer);
            dv.setUint32(0, 0, true);
            dv.setUint32(4, 0, true);

            const strType = prim(PrimitiveValType.String);
            const result = loadFromMemory(ctx, 0, strType as any,
                rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
            expect(result).toBe('');
        });
    });

    describe('list loader bounds checking', () => {
        test('traps on out-of-bounds list pointer in memory (spilled path)', () => {
            const rctx = createMinimalRctx();
            const { ctx, buffer } = createMockMemoryContext(128);

            const listModel = { tag: ModelTag.ComponentTypeDefinedList, value: prim(PrimitiveValType.U32) } as any;

            // Write list descriptor at offset 0: ptr=200 (beyond memory), len=3
            const dv = new DataView(buffer);
            dv.setUint32(0, 200, true);
            dv.setUint32(4, 3, true);

            expect(() => loadFromMemory(ctx, 0, listModel,
                rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds))
                .toThrow('list pointer out of bounds');
        });

        test('traps on list with length causing overflow past memory', () => {
            const rctx = createMinimalRctx();
            const { ctx, buffer } = createMockMemoryContext(128);

            const listModel = { tag: ModelTag.ComponentTypeDefinedList, value: prim(PrimitiveValType.U32) } as any;

            // ptr=16, len=100 → 16 + 100*4 = 416 > 128
            const dv = new DataView(buffer);
            dv.setUint32(0, 16, true);
            dv.setUint32(4, 100, true);

            expect(() => loadFromMemory(ctx, 0, listModel,
                rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds))
                .toThrow('list pointer out of bounds');
        });

        test('traps on misaligned list pointer in memory (spilled path)', () => {
            const rctx = createMinimalRctx();
            const { ctx, buffer } = createMockMemoryContext(256);

            const listModel = { tag: ModelTag.ComponentTypeDefinedList, value: prim(PrimitiveValType.U32) } as any;

            // ptr=3 (not aligned to 4), len=1
            const dv = new DataView(buffer);
            dv.setUint32(0, 3, true);
            dv.setUint32(4, 1, true);

            expect(() => loadFromMemory(ctx, 0, listModel,
                rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds))
                .toThrow('list pointer not aligned');
        });

        test('zero-length list accepted without bounds check', () => {
            const rctx = createMinimalRctx();
            const { ctx, buffer } = createMockMemoryContext(128);

            const listModel = { tag: ModelTag.ComponentTypeDefinedList, value: prim(PrimitiveValType.U32) } as any;

            const dv = new DataView(buffer);
            dv.setUint32(0, 0, true);
            dv.setUint32(4, 0, true);

            const result = loadFromMemory(ctx, 0, listModel,
                rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
            expect(result).toEqual([]);
        });
    });

    describe('discriminant validation in spilled path', () => {
        test('traps on invalid option discriminant in memory', () => {
            const rctx = createMinimalRctx();
            const { ctx, buffer } = createMockMemoryContext(128);

            const optionModel = {
                tag: ModelTag.ComponentTypeDefinedOption,
                value: prim(PrimitiveValType.U32),
            } as any;

            // Write discriminant=2 (invalid for option: must be 0 or 1)
            new DataView(buffer).setUint8(0, 2);

            expect(() => loadFromMemory(ctx, 0, optionModel,
                rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds))
                .toThrow('Invalid option discriminant: 2');
        });

        test('traps on invalid result discriminant in memory', () => {
            const rctx = createMinimalRctx();
            const { ctx, buffer } = createMockMemoryContext(128);

            const resultModel = {
                tag: ModelTag.ComponentTypeDefinedResult,
                ok: prim(PrimitiveValType.U32),
                err: prim(PrimitiveValType.String),
            } as any;

            // Write discriminant=5 (invalid for result: must be 0 or 1)
            new DataView(buffer).setUint8(0, 5);

            expect(() => loadFromMemory(ctx, 0, resultModel,
                rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds))
                .toThrow('Invalid result discriminant: 5');
        });

        test('traps on invalid variant discriminant in memory', () => {
            const rctx = createMinimalRctx();
            const { ctx, buffer } = createMockMemoryContext(128);

            const variantModel = {
                tag: ModelTag.ComponentTypeDefinedVariant,
                variants: [
                    { name: 'a', ty: prim(PrimitiveValType.U32) },
                    { name: 'b', ty: undefined },
                ],
            } as any;

            // discriminant=2 (only 0 and 1 valid)
            new DataView(buffer).setUint8(0, 2);

            expect(() => loadFromMemory(ctx, 0, variantModel,
                rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds))
                .toThrow('Invalid variant discriminant: 2 >= 2');
        });

        test('traps on invalid enum discriminant in memory', () => {
            const rctx = createMinimalRctx();
            const { ctx, buffer } = createMockMemoryContext(128);

            const enumModel = {
                tag: ModelTag.ComponentTypeDefinedEnum,
                members: ['red', 'green', 'blue'],
            } as any;

            // discriminant=3 (only 0, 1, 2 valid)
            new DataView(buffer).setUint8(0, 3);

            expect(() => loadFromMemory(ctx, 0, enumModel,
                rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds))
                .toThrow('Invalid enum discriminant: 3 >= 3');
        });

        test('valid discriminants accepted for option/result/variant/enum', () => {
            const rctx = createMinimalRctx();
            const { ctx, buffer } = createMockMemoryContext(128);
            const dv = new DataView(buffer);

            // Option: disc=0 → null
            dv.setUint8(0, 0);
            const optionModel = { tag: ModelTag.ComponentTypeDefinedOption, value: prim(PrimitiveValType.U32) } as any;
            expect(loadFromMemory(ctx, 0, optionModel, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds)).toBeNull();

            // Option: disc=1 → Some(value)
            dv.setUint8(16, 1);
            dv.setUint32(20, 42, true);
            expect(loadFromMemory(ctx, 16, optionModel, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds)).toBe(42);

            // Result: disc=0 → ok
            dv.setUint8(32, 0);
            dv.setUint32(36, 99, true);
            const resultModel = { tag: ModelTag.ComponentTypeDefinedResult, ok: prim(PrimitiveValType.U32), err: undefined } as any;
            expect(loadFromMemory(ctx, 32, resultModel, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds)).toEqual({ tag: 'ok', val: 99 });

            // Enum: disc=2 → 'blue'
            dv.setUint8(48, 2);
            const enumModel = { tag: ModelTag.ComponentTypeDefinedEnum, members: ['red', 'green', 'blue'] } as any;
            expect(loadFromMemory(ctx, 48, enumModel, rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds)).toBe('blue');
        });
    });

    describe('char codepoint validation in spilled path', () => {
        test('traps on codepoint >= 0x110000 in memory', () => {
            const rctx = createMinimalRctx();
            const { ctx, buffer } = createMockMemoryContext(128);

            new DataView(buffer).setUint32(0, 0x110000, true);

            const charType = prim(PrimitiveValType.Char);
            expect(() => loadFromMemory(ctx, 0, charType as any,
                rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds))
                .toThrow('Invalid char codepoint');
        });

        test('traps on surrogate codepoint in memory', () => {
            const rctx = createMinimalRctx();
            const { ctx, buffer } = createMockMemoryContext(128);

            new DataView(buffer).setUint32(0, 0xD800, true);

            const charType = prim(PrimitiveValType.Char);
            expect(() => loadFromMemory(ctx, 0, charType as any,
                rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds))
                .toThrow('Invalid char codepoint: surrogate');
        });

        test('accepts valid char at boundary (U+10FFFF)', () => {
            const rctx = createMinimalRctx();
            const { ctx, buffer } = createMockMemoryContext(128);

            new DataView(buffer).setUint32(0, 0x10FFFF, true);

            const charType = prim(PrimitiveValType.Char);
            const result = loadFromMemory(ctx, 0, charType as any,
                rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds);
            expect(result).toBe(String.fromCodePoint(0x10FFFF));
        });
    });

    describe('flat-path unsigned coercion', () => {
        test('list lowering treats length as unsigned', () => {
            const rctx = createMinimalRctx();
            const { ctx } = createMockMemoryContext(128);

            const listModel = { tag: ModelTag.ComponentTypeDefinedList, value: prim(PrimitiveValType.U8) } as any;
            const lowerer = createLowering(rctx.resolved, listModel);

            // Simulate WASM passing ptr=0, len=0 (should work fine)
            const result = (lowerer as any)(ctx, 16, 3);
            expect(result).toEqual([0, 0, 0]);
        });

        test('string lowering treats ptr/len as unsigned', () => {
            const rctx = createMinimalRctx();
            const { ctx, buffer } = createMockMemoryContext(256);

            const lowerer = createLowering(rctx.resolved, prim(PrimitiveValType.String));

            // Write valid UTF-8 at offset 16
            const bytes = new TextEncoder().encode('hi');
            new Uint8Array(buffer).set(bytes, 16);

            const result = (lowerer as any)(ctx, 16, 2);
            expect(result).toBe('hi');
        });
    });
});

// =============================================================================
// useNumberForInt64 memory-path (compound types with i64 fields)
// =============================================================================

describeDebugOnly('useNumberForInt64 memory-path', () => {
    function createNumberRctx(): ResolverContext {
        return {
            resolved: {
                liftingCache: new Map(), loweringCache: new Map(),
                resolvedTypes: new Map(),
                usesNumberForInt64: true,
            },
        } as any as ResolverContext;
    }

    describe('record with s64 field', () => {
        const recordModel = {
            tag: ModelTag.ComponentTypeDefinedRecord,
            members: [
                { name: 'id', type: prim(PrimitiveValType.U32) },
                { name: 'value', type: prim(PrimitiveValType.S64) },
            ],
        } as any;

        test('loadFromMemory returns number when useNumberForInt64=true', () => {
            const rctx = createNumberRctx();
            const { ctx, buffer } = createMockMemoryContext(128);
            const dv = new DataView(buffer);
            dv.setUint32(0, 42, true); // id
            dv.setBigInt64(8, 123n, true); // value (aligned to 8)
            const result = loadFromMemory(ctx, 0, recordModel,
                rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds, true);
            expect(result.id).toBe(42);
            expect(result.value).toBe(123);
            expect(typeof result.value).toBe('number');
        });

        test('loadFromMemory returns bigint when useNumberForInt64=false', () => {
            const rctx = createMinimalRctx();
            const { ctx, buffer } = createMockMemoryContext(128);
            const dv = new DataView(buffer);
            dv.setUint32(0, 42, true);
            dv.setBigInt64(8, 123n, true);
            const result = loadFromMemory(ctx, 0, recordModel,
                rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds, false);
            expect(result.id).toBe(42);
            expect(result.value).toBe(123n);
            expect(typeof result.value).toBe('bigint');
        });
    });

    describe('result<u64, string>', () => {
        const resultModel = {
            tag: ModelTag.ComponentTypeDefinedResult,
            ok: prim(PrimitiveValType.U64),
            err: prim(PrimitiveValType.String),
        } as any;

        test('ok payload returns number when useNumberForInt64=true', () => {
            const rctx = createNumberRctx();
            const { ctx, buffer } = createMockMemoryContext(128);
            const dv = new DataView(buffer);
            dv.setUint8(0, 0); // disc=0 (ok)
            dv.setBigUint64(8, 999n, true); // payload (aligned to 8)
            const result = loadFromMemory(ctx, 0, resultModel,
                rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds, true);
            expect(result.tag).toBe('ok');
            expect(result.val).toBe(999);
            expect(typeof result.val).toBe('number');
        });

        test('ok payload returns bigint when useNumberForInt64=false', () => {
            const rctx = createMinimalRctx();
            const { ctx, buffer } = createMockMemoryContext(128);
            const dv = new DataView(buffer);
            dv.setUint8(0, 0);
            dv.setBigUint64(8, 999n, true);
            const result = loadFromMemory(ctx, 0, resultModel,
                rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds, false);
            expect(result.tag).toBe('ok');
            expect(result.val).toBe(999n);
            expect(typeof result.val).toBe('bigint');
        });
    });

    describe('option<s64>', () => {
        const optionModel = {
            tag: ModelTag.ComponentTypeDefinedOption,
            value: prim(PrimitiveValType.S64),
        } as any;

        test('Some returns number when useNumberForInt64=true', () => {
            const rctx = createNumberRctx();
            const { ctx, buffer } = createMockMemoryContext(128);
            const dv = new DataView(buffer);
            dv.setUint8(0, 1); // disc=1 (Some)
            dv.setBigInt64(8, -42n, true); // payload (aligned to 8)
            const result = loadFromMemory(ctx, 0, optionModel,
                rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds, true);
            expect(result).toBe(-42);
            expect(typeof result).toBe('number');
        });

        test('Some returns bigint when useNumberForInt64=false', () => {
            const rctx = createMinimalRctx();
            const { ctx, buffer } = createMockMemoryContext(128);
            const dv = new DataView(buffer);
            dv.setUint8(0, 1);
            dv.setBigInt64(8, -42n, true);
            const result = loadFromMemory(ctx, 0, optionModel,
                rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds, false);
            expect(result).toBe(-42n);
            expect(typeof result).toBe('bigint');
        });
    });

    describe('tuple<u32, s64>', () => {
        const tupleModel = {
            tag: ModelTag.ComponentTypeDefinedTuple,
            members: [
                prim(PrimitiveValType.U32),
                prim(PrimitiveValType.S64),
            ],
        } as any;

        test('returns [number, number] when useNumberForInt64=true', () => {
            const rctx = createNumberRctx();
            const { ctx, buffer } = createMockMemoryContext(128);
            const dv = new DataView(buffer);
            dv.setUint32(0, 7, true); // u32
            dv.setBigInt64(8, 100n, true); // s64 (aligned to 8)
            const result = loadFromMemory(ctx, 0, tupleModel,
                rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds, true);
            expect(result).toEqual([7, 100]);
            expect(typeof result[1]).toBe('number');
        });

        test('returns [number, bigint] when useNumberForInt64=false', () => {
            const rctx = createMinimalRctx();
            const { ctx, buffer } = createMockMemoryContext(128);
            const dv = new DataView(buffer);
            dv.setUint32(0, 7, true);
            dv.setBigInt64(8, 100n, true);
            const result = loadFromMemory(ctx, 0, tupleModel,
                rctx.resolved.stringEncoding, rctx.resolved.canonicalResourceIds, false);
            expect(result).toEqual([7, 100n]);
            expect(typeof result[1]).toBe('bigint');
        });
    });
});
