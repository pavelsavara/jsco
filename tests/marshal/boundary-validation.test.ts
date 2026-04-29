// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { initializeAsserts } from '../../src/utils/assert';
initializeAsserts();

import type { WasmPointer, WasmSize, WasmValue } from '../../src/marshal/model/types';
import type { MarshalingContext } from '../../src/resolver/types';
import {
    stringLiftingUtf8, stringLiftingUtf16, listLifting,
} from '../../src/marshal/lift';
import {
    stringLoweringUtf8, stringLoweringUtf16, listLowering,
} from '../../src/marshal/lower';
import {
    stringLoaderUtf8, stringLoaderUtf16, listLoader,
} from '../../src/marshal/memory-load';
import { listStorer } from '../../src/marshal/memory-store';
import { validateBoundarySize } from '../../src/marshal/validation';
import { u8Lifting } from '../../src/marshal/lift';
import { u8Loader } from '../../src/marshal/memory-load';
import { u8Storer } from '../../src/marshal/memory-store';

function makeCtx(bufferSize: number, maxAllocationSize?: number): MarshalingContext {
    const buffer = new ArrayBuffer(bufferSize);
    let allocPtr = 16;
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
        realloc(_oldPtr: number, _oldSize: number, align: number, newSize: number): number {
            if (newSize === 0) return 0;
            const aligned = (allocPtr + align - 1) & ~(align - 1);
            allocPtr = aligned + newSize;
            return aligned;
        },
    };
    const utf8Encoder = new TextEncoder();
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    return {
        memory, allocator, utf8Encoder, utf8Decoder,
        maxAllocationSize,
    } as any as MarshalingContext;
}

describe('validateBoundarySize', () => {
    test('passes when no cap set', () => {
        const ctx = makeCtx(1024);
        expect(() => validateBoundarySize(ctx, 1_000_000_000, 'list')).not.toThrow();
    });

    test('passes when cap is 0 (disabled)', () => {
        const ctx = makeCtx(1024, 0);
        expect(() => validateBoundarySize(ctx, 1_000_000_000, 'list')).not.toThrow();
    });

    test('passes at boundary', () => {
        const ctx = makeCtx(1024, 100);
        expect(() => validateBoundarySize(ctx, 100, 'list')).not.toThrow();
    });

    test('throws when totalBytes exceeds cap', () => {
        const ctx = makeCtx(1024, 100);
        expect(() => validateBoundarySize(ctx, 101, 'list')).toThrow(RangeError);
        expect(() => validateBoundarySize(ctx, 101, 'list')).toThrow('exceeds maxAllocationSize');
    });

    test('throws on negative byte length', () => {
        const ctx = makeCtx(1024, 1024);
        expect(() => validateBoundarySize(ctx, -1, 'list')).toThrow(RangeError);
    });

    test('throws on non-finite byte length', () => {
        const ctx = makeCtx(1024, 1024);
        expect(() => validateBoundarySize(ctx, Infinity, 'list')).toThrow(RangeError);
        expect(() => validateBoundarySize(ctx, NaN, 'list')).toThrow(RangeError);
    });
});

describe('lift boundary validation (JS → WASM)', () => {
    test('stringLiftingUtf8 rejects strings exceeding maxAllocationSize', () => {
        const ctx = makeCtx(4096, 8);
        const out: WasmValue[] = [0, 0];
        expect(() => stringLiftingUtf8(ctx, 'hello world!', out, 0))
            .toThrow(/exceeds maxAllocationSize/);
    });

    test('stringLiftingUtf8 accepts string at boundary', () => {
        const ctx = makeCtx(4096, 5);
        const out: WasmValue[] = [0, 0];
        expect(() => stringLiftingUtf8(ctx, 'hello', out, 0)).not.toThrow();
    });

    test('stringLiftingUtf16 rejects strings exceeding maxAllocationSize', () => {
        // UTF-16 = 2 bytes per code unit; limit=8 bytes = 4 code units max
        const ctx = makeCtx(4096, 8);
        const out: WasmValue[] = [0, 0];
        expect(() => stringLiftingUtf16(ctx, 'hello', out, 0))
            .toThrow(/exceeds maxAllocationSize/);
    });

    test('listLifting rejects lists exceeding maxAllocationSize', () => {
        const ctx = makeCtx(4096, 8);
        const out: WasmValue[] = [0, 0];
        const plan = { elemSize: 1, elemAlign: 1, elemStorer: u8Storer } as any;
        const big = new Array(100).fill(0);
        expect(() => listLifting(plan, ctx, big, out, 0))
            .toThrow(/exceeds maxAllocationSize/);
    });

    test('listLifting accepts empty list with cap of 0 elements', () => {
        const ctx = makeCtx(4096, 0); // cap 0 = disabled
        const out: WasmValue[] = [0, 0];
        const plan = { elemSize: 1, elemAlign: 1, elemStorer: u8Storer } as any;
        expect(() => listLifting(plan, ctx, [], out, 0)).not.toThrow();
    });
});

describe('lower boundary validation (WASM → JS)', () => {
    test('stringLoweringUtf8 rejects guest-supplied len exceeding maxAllocationSize', () => {
        const ctx = makeCtx(1_000_000, 100);
        // pretend WASM passes a (ptr, len) = (0, 200). Should reject before reading memory.
        expect(() => stringLoweringUtf8(ctx, 0, 200))
            .toThrow(/exceeds maxAllocationSize/);
    });

    test('stringLoweringUtf16 rejects guest-supplied codeUnits whose byteLen exceeds cap', () => {
        const ctx = makeCtx(1_000_000, 100);
        // 60 code units × 2 = 120 bytes > 100
        expect(() => stringLoweringUtf16(ctx, 0, 60))
            .toThrow(/exceeds maxAllocationSize/);
    });

    test('listLowering rejects guest-supplied len whose totalBytes exceed cap', () => {
        const ctx = makeCtx(1_000_000, 100);
        const plan = { elemSize: 4, elemAlign: 4, elemLowerer: () => 0 } as any;
        // 30 elements × 4 = 120 bytes > 100
        expect(() => listLowering(plan, ctx, 0, 30))
            .toThrow(/exceeds maxAllocationSize/);
    });
});

describe('memory-load boundary validation (WASM → JS, structured)', () => {
    test('stringLoaderUtf8 rejects guest-supplied len exceeding cap', () => {
        const ctx = makeCtx(1_000_000, 100);
        // Write (ptr=16, len=200) at offset 0
        const dv = ctx.memory.getView(0 as WasmPointer, 8 as WasmSize);
        dv.setUint32(0, 16, true);
        dv.setUint32(4, 200, true);
        expect(() => stringLoaderUtf8(ctx, 0))
            .toThrow(/exceeds maxAllocationSize/);
    });

    test('stringLoaderUtf16 rejects guest-supplied codeUnits exceeding cap', () => {
        const ctx = makeCtx(1_000_000, 100);
        const dv = ctx.memory.getView(0 as WasmPointer, 8 as WasmSize);
        dv.setUint32(0, 16, true);
        dv.setUint32(4, 60, true); // 60 × 2 = 120 > 100
        expect(() => stringLoaderUtf16(ctx, 0))
            .toThrow(/exceeds maxAllocationSize/);
    });

    test('listLoader rejects guest-supplied len whose totalBytes exceed cap', () => {
        const ctx = makeCtx(1_000_000, 100);
        const dv = ctx.memory.getView(0 as WasmPointer, 8 as WasmSize);
        dv.setUint32(0, 16, true);
        dv.setUint32(4, 30, true);
        const plan = { elemSize: 4, elemAlign: 4, elemLoader: u8Loader } as any;
        expect(() => listLoader(plan, ctx, 0))
            .toThrow(/exceeds maxAllocationSize/);
    });
});

describe('memory-store boundary validation (JS → WASM, structured)', () => {
    test('listStorer rejects JS arrays whose totalBytes exceed cap', () => {
        const ctx = makeCtx(4096, 100);
        const plan = { elemSize: 4, elemAlign: 4, elemStorer: u8Storer } as any;
        const big = new Array(30).fill(0); // 30 × 4 = 120 > 100
        expect(() => listStorer(plan, ctx, 0, big))
            .toThrow(/exceeds maxAllocationSize/);
    });

    test('listStorer accepts list at boundary', () => {
        const ctx = makeCtx(4096, 120);
        const plan = { elemSize: 4, elemAlign: 4, elemStorer: (_c: any, _p: number, _v: any) => { /* noop */ } } as any;
        const list = new Array(30).fill(0);
        expect(() => listStorer(plan, ctx, 0, list)).not.toThrow();
    });
});

// Reference imports to avoid unused-import lint
void u8Lifting;
