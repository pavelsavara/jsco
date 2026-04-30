// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { checkHeapGrowth } from '../../src/runtime/heap-watchdog';
import type { MarshalingContext } from '../../src/marshal/model/types';

/** MarshalingContext stub exposing only the fields the watchdog reads/writes,
 *  with a settable `_heap` field so we can drive the sample sequence
 *  deterministically (no reliance on real `process.memoryUsage`). */
interface StubCtx extends MarshalingContext {
    _aborted?: { reason?: string };
}

function makeCtx(maxHeapGrowthPerYield?: number): StubCtx {
    const aborted: { reason?: string } = {};
    const ctx = {
        maxHeapGrowthPerYield,
        heapAtLastYield: 0,
        heapGrowthOverCount: 0,
        abort: (reason?: string) => { aborted.reason = reason; },
        _aborted: aborted,
    } as unknown as StubCtx;
    return ctx;
}

/** Inject a controllable heap reading by overriding process.memoryUsage for
 *  the duration of the test. The watchdog binds `getHeapUsed` at module load
 *  time, but in Node it dispatches through `process.memoryUsage` so we can
 *  swap the underlying function. */
function withHeapSequence(values: number[], fn: () => void): void {
    let i = 0;
    const orig = process.memoryUsage;
    // Replacing the whole method preserves the type contract the watchdog
    // captured at import time (`process.memoryUsage().heapUsed`).
    (process as unknown as { memoryUsage: () => NodeJS.MemoryUsage }).memoryUsage =
        (() => ({ heapUsed: values[Math.min(i++, values.length - 1)] } as NodeJS.MemoryUsage)) as typeof process.memoryUsage;
    try { fn(); } finally {
        (process as unknown as { memoryUsage: typeof orig }).memoryUsage = orig;
    }
}

describe('heap-watchdog (memory-cap hardening)', () => {
    test('no-op when cap is 0', () => {
        const ctx = makeCtx(0);
        withHeapSequence([1_000_000_000, 2_000_000_000], () => {
            checkHeapGrowth(ctx);
            checkHeapGrowth(ctx);
        });
        expect(ctx._aborted!.reason).toBeUndefined();
    });

    test('no-op when cap is undefined', () => {
        const ctx = makeCtx(undefined);
        withHeapSequence([1_000_000_000, 2_000_000_000], () => {
            checkHeapGrowth(ctx);
            checkHeapGrowth(ctx);
        });
        expect(ctx._aborted!.reason).toBeUndefined();
    });

    test('first sample initialises baseline; does not abort', () => {
        const ctx = makeCtx(1_000);
        withHeapSequence([5_000_000], () => checkHeapGrowth(ctx));
        expect(ctx._aborted!.reason).toBeUndefined();
        expect(ctx.heapAtLastYield).toBe(5_000_000);
    });

    test('single over-cap sample does not abort (GC-lag tolerance)', () => {
        const ctx = makeCtx(1_000_000);
        // baseline 10MB, then 100MB (90MB jump > 1MB cap) — only 1 trip
        withHeapSequence([10_000_000, 100_000_000], () => {
            checkHeapGrowth(ctx);
            checkHeapGrowth(ctx);
        });
        expect(ctx._aborted!.reason).toBeUndefined();
        expect(ctx.heapGrowthOverCount).toBe(1);
    });

    test('two consecutive over-cap samples still does not abort', () => {
        const ctx = makeCtx(1_000_000);
        withHeapSequence([10_000_000, 100_000_000, 200_000_000], () => {
            checkHeapGrowth(ctx); // baseline
            checkHeapGrowth(ctx); // trip 1
            checkHeapGrowth(ctx); // trip 2
        });
        expect(ctx._aborted!.reason).toBeUndefined();
        expect(ctx.heapGrowthOverCount).toBe(2);
    });

    test('three consecutive over-cap samples abort with RuntimeError', () => {
        const ctx = makeCtx(1_000_000);
        let caught: unknown;
        withHeapSequence([10_000_000, 100_000_000, 200_000_000, 300_000_000], () => {
            checkHeapGrowth(ctx); // baseline
            checkHeapGrowth(ctx); // trip 1
            checkHeapGrowth(ctx); // trip 2
            try { checkHeapGrowth(ctx); } catch (e) { caught = e; }
        });
        expect(caught).toBeInstanceOf(WebAssembly.RuntimeError);
        expect((caught as Error).message).toMatch(/heap-growth budget exceeded:/);
        expect((caught as Error).message).toMatch(/3 consecutive over-cap/);
        expect(ctx._aborted!.reason).toMatch(/heap-growth budget exceeded/);
    });

    test('under-cap sample resets the consecutive-trip counter', () => {
        const ctx = makeCtx(1_000_000);
        // baseline → trip → trip → small jump (resets) → trip → trip → trip → abort
        withHeapSequence([
            10_000_000,
            100_000_000, // trip 1
            200_000_000, // trip 2
            200_500_000, // delta 0.5 MB ≤ cap → resets counter
            300_000_000, // trip 1 again
            400_000_000, // trip 2
            500_000_000, // trip 3 → abort
        ], () => {
            checkHeapGrowth(ctx);
            checkHeapGrowth(ctx);
            checkHeapGrowth(ctx);
            checkHeapGrowth(ctx);
            expect(ctx.heapGrowthOverCount).toBe(0);
            checkHeapGrowth(ctx);
            checkHeapGrowth(ctx);
            let caught: unknown;
            try { checkHeapGrowth(ctx); } catch (e) { caught = e; }
            expect(caught).toBeInstanceOf(WebAssembly.RuntimeError);
        });
    });

    test('zero heap reading (no-introspection embedder) is a silent no-op', () => {
        const ctx = makeCtx(1_000_000);
        withHeapSequence([0, 0, 0, 0], () => {
            checkHeapGrowth(ctx);
            checkHeapGrowth(ctx);
            checkHeapGrowth(ctx);
            checkHeapGrowth(ctx);
        });
        expect(ctx._aborted!.reason).toBeUndefined();
        expect(ctx.heapAtLastYield).toBe(0);
    });
});
