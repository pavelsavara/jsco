// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { initializeAsserts } from '../../src/utils/assert';
initializeAsserts();

import type { WasmPointer, WasmSize, WasmValue } from '../../src/marshal/model/types';
import type { MarshalingContext } from '../../src/resolver/types';
import {
    liftStringUtf8, liftStringUtf16, liftList,
} from '../../src/marshal/lift';
import {
    lowerStringUtf8, lowerStringUtf16, lowerList,
} from '../../src/marshal/lower';
import {
    loadStringUtf8,
    loadStringUtf16,
    loadList,
} from '../../src/marshal/memory-load';
import { storeList } from '../../src/marshal/memory-store';
import { validateBoundarySize } from '../../src/marshal/validation';
import { liftU8 } from '../../src/marshal/lift';
import { loadU8 } from '../../src/marshal/memory-load';
import { storeU8 } from '../../src/marshal/memory-store';

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
        expect(() => liftStringUtf8(ctx, 'hello world!', out, 0))
            .toThrow(/exceeds maxAllocationSize/);
    });

    test('stringLiftingUtf8 accepts string at boundary', () => {
        const ctx = makeCtx(4096, 5);
        const out: WasmValue[] = [0, 0];
        expect(() => liftStringUtf8(ctx, 'hello', out, 0)).not.toThrow();
    });

    test('stringLiftingUtf16 rejects strings exceeding maxAllocationSize', () => {
        // UTF-16 = 2 bytes per code unit; limit=8 bytes = 4 code units max
        const ctx = makeCtx(4096, 8);
        const out: WasmValue[] = [0, 0];
        expect(() => liftStringUtf16(ctx, 'hello', out, 0))
            .toThrow(/exceeds maxAllocationSize/);
    });

    test('listLifting rejects lists exceeding maxAllocationSize', () => {
        const ctx = makeCtx(4096, 8);
        const out: WasmValue[] = [0, 0];
        const plan = { elemSize: 1, elemAlign: 1, elemStorer: storeU8 } as any;
        const big = new Array(100).fill(0);
        expect(() => liftList(plan, ctx, big, out, 0))
            .toThrow(/exceeds maxAllocationSize/);
    });

    test('listLifting accepts empty list with cap of 0 elements', () => {
        const ctx = makeCtx(4096, 0); // cap 0 = disabled
        const out: WasmValue[] = [0, 0];
        const plan = { elemSize: 1, elemAlign: 1, elemStorer: storeU8 } as any;
        expect(() => liftList(plan, ctx, [], out, 0)).not.toThrow();
    });
});

describe('lower boundary validation (WASM → JS)', () => {
    test('stringLoweringUtf8 rejects guest-supplied len exceeding maxAllocationSize', () => {
        const ctx = makeCtx(1_000_000, 100);
        // pretend WASM passes a (ptr, len) = (0, 200). Should reject before reading memory.
        expect(() => lowerStringUtf8(ctx, 0, 200))
            .toThrow(/exceeds maxAllocationSize/);
    });

    test('stringLoweringUtf16 rejects guest-supplied codeUnits whose byteLen exceeds cap', () => {
        const ctx = makeCtx(1_000_000, 100);
        // 60 code units × 2 = 120 bytes > 100
        expect(() => lowerStringUtf16(ctx, 0, 60))
            .toThrow(/exceeds maxAllocationSize/);
    });

    test('listLowering rejects guest-supplied len whose totalBytes exceed cap', () => {
        const ctx = makeCtx(1_000_000, 100);
        const plan = { elemSize: 4, elemAlign: 4, elemLowerer: () => 0 } as any;
        // 30 elements × 4 = 120 bytes > 100
        expect(() => lowerList(plan, ctx, 0, 30))
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
        expect(() => loadStringUtf8(ctx, 0))
            .toThrow(/exceeds maxAllocationSize/);
    });

    test('stringLoaderUtf16 rejects guest-supplied codeUnits exceeding cap', () => {
        const ctx = makeCtx(1_000_000, 100);
        const dv = ctx.memory.getView(0 as WasmPointer, 8 as WasmSize);
        dv.setUint32(0, 16, true);
        dv.setUint32(4, 60, true); // 60 × 2 = 120 > 100
        expect(() => loadStringUtf16(ctx, 0))
            .toThrow(/exceeds maxAllocationSize/);
    });

    test('listLoader rejects guest-supplied len whose totalBytes exceed cap', () => {
        const ctx = makeCtx(1_000_000, 100);
        const dv = ctx.memory.getView(0 as WasmPointer, 8 as WasmSize);
        dv.setUint32(0, 16, true);
        dv.setUint32(4, 30, true);
        const plan = { elemSize: 4, elemAlign: 4, elemLoader: loadU8 } as any;
        expect(() => loadList(plan, ctx, 0))
            .toThrow(/exceeds maxAllocationSize/);
    });
});

describe('memory-store boundary validation (JS → WASM, structured)', () => {
    test('listStorer rejects JS arrays whose totalBytes exceed cap', () => {
        const ctx = makeCtx(4096, 100);
        const plan = { elemSize: 4, elemAlign: 4, elemStorer: storeU8 } as any;
        const big = new Array(30).fill(0); // 30 × 4 = 120 > 100
        expect(() => storeList(plan, ctx, 0, big))
            .toThrow(/exceeds maxAllocationSize/);
    });

    test('listStorer accepts list at boundary', () => {
        const ctx = makeCtx(4096, 120);
        const plan = { elemSize: 4, elemAlign: 4, elemStorer: (_c: any, _p: number, _v: any) => { /* noop */ } } as any;
        const list = new Array(30).fill(0);
        expect(() => storeList(plan, ctx, 0, list)).not.toThrow();
    });
});

// Reference imports to avoid unused-import lint
void liftU8;

// Deterministic xorshift32 PRNG so failures reproduce exactly from the seed.
function makeRng(seed: number): () => number {
    let s = seed | 0;
    return () => {
        s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
        return (s >>> 0) / 0x1_0000_0000;
    };
}

describe('boundary validation fuzz (log-scale length sweep)', () => {
    const CAP = 1024;
    const MAX_LEN = 1 << 30; // 1 GiB — well above cap
    const ITERATIONS = 200;

    // Sample lengths on a log scale: each sample is r * 2^k for k in [0..30].
    function sampleLogScaleLen(rng: () => number): number {
        const k = Math.floor(rng() * 31);
        const span = Math.max(1, 1 << k);
        return Math.min(MAX_LEN, Math.floor(rng() * span) + (rng() < 0.05 ? span : 0));
    }

    test('stringLiftingUtf8: every length either succeeds or throws RangeError', () => {
        const rng = makeRng(0xC0FFEE);
        const ctx = makeCtx(64 * 1024, CAP);
        const out: WasmValue[] = [0, 0];
        let succeeded = 0, rejected = 0;
        for (let i = 0; i < ITERATIONS; i++) {
            const len = sampleLogScaleLen(rng);
            const str = 'a'.repeat(Math.min(len, 100_000)); // bounded to keep allocation finite
            try {
                liftStringUtf8(ctx, str, out, 0);
                succeeded++;
                expect(str.length).toBeLessThanOrEqual(CAP);
            } catch (e) {
                rejected++;
                expect(e).toBeInstanceOf(RangeError);
                expect(String(e)).toMatch(/exceeds maxAllocationSize|is invalid/);
            }
        }
        expect(succeeded + rejected).toBe(ITERATIONS);
    });

    test('listLifting: every length either succeeds or throws RangeError', () => {
        const rng = makeRng(0xDEADBEEF);
        const ctx = makeCtx(64 * 1024, CAP);
        const out: WasmValue[] = [0, 0];
        const plan = { elemSize: 4, elemAlign: 4, elemStorer: (_c: any, _p: number, _v: any) => { /* noop */ } } as any;
        let succeeded = 0, rejected = 0;
        for (let i = 0; i < ITERATIONS; i++) {
            const len = Math.min(sampleLogScaleLen(rng), 10_000);
            const arr = new Array(len).fill(0);
            try {
                liftList(plan, ctx, arr, out, 0);
                succeeded++;
                expect(len * 4).toBeLessThanOrEqual(CAP);
            } catch (e) {
                rejected++;
                expect(e).toBeInstanceOf(RangeError);
            }
        }
        expect(succeeded + rejected).toBe(ITERATIONS);
    });

    test('stringLoweringUtf8: every guest-supplied len either succeeds or throws RangeError', () => {
        const rng = makeRng(0x12345678);
        const ctx = makeCtx(2 * CAP, CAP);
        let succeeded = 0, rejected = 0;
        // Pre-fill the first CAP bytes with valid ASCII so success path decodes cleanly.
        new Uint8Array(ctx.memory.getMemory().buffer).fill(0x61, 0, CAP);
        for (let i = 0; i < ITERATIONS; i++) {
            const len = sampleLogScaleLen(rng);
            try {
                lowerStringUtf8(ctx, 0, len);
                succeeded++;
                expect(len).toBeLessThanOrEqual(CAP);
            } catch (e) {
                rejected++;
                expect(e).toBeInstanceOf(RangeError);
            }
        }
        expect(succeeded + rejected).toBe(ITERATIONS);
    });

    test('listLowering: every guest-supplied len either succeeds or throws RangeError', () => {
        const rng = makeRng(0xFEEDFACE);
        const ctx = makeCtx(2 * CAP, CAP);
        const plan = { elemSize: 4, elemAlign: 4, elemLoader: () => 0 } as any;
        let succeeded = 0, rejected = 0;
        for (let i = 0; i < ITERATIONS; i++) {
            const len = sampleLogScaleLen(rng);
            try {
                lowerList(plan, ctx, 0, len);
                succeeded++;
                expect(len * 4).toBeLessThanOrEqual(CAP);
            } catch (e) {
                rejected++;
                expect(e).toBeInstanceOf(RangeError);
            }
        }
        expect(succeeded + rejected).toBe(ITERATIONS);
    });

    test('no unhandled-rejection escapes the fuzz sweep', async () => {
        // Verifies that throwing from a synchronous lift/lower call does not
        // leak any unawaited Promise rejection into the next tick.
        const unhandled: unknown[] = [];
        const onUnhandled = (e: any): void => { unhandled.push(e); };
        process.on('unhandledRejection', onUnhandled);
        try {
            const rng = makeRng(0xBADF00D);
            const ctx = makeCtx(64 * 1024, CAP);
            const out: WasmValue[] = [0, 0];
            for (let i = 0; i < ITERATIONS; i++) {
                const len = sampleLogScaleLen(rng);
                const str = 'a'.repeat(Math.min(len, 100_000));
                try { liftStringUtf8(ctx, str, out, 0); } catch { /* expected */ }
            }
            // Yield once so any pending microtasks complete.
            await new Promise(r => setImmediate(r));
            expect(unhandled).toEqual([]);
        } finally {
            process.off('unhandledRejection', onUnhandled);
        }
    });
});
