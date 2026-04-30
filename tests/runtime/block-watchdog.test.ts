// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { withBlockingTimeout } from '../../src/runtime/block-watchdog';
import type { MarshalingContext } from '../../src/marshal/model/types';

/** Minimal MarshalingContext stub exposing only the fields the watchdog reads.
 *  Tracks `aborted` so tests can assert the instance is poisoned alongside
 *  the thrown RuntimeError. */
function makeStubCtx(maxBlockingTimeMs?: number): {
    ctx: MarshalingContext;
    aborted: { reason?: string };
} {
    const aborted: { reason?: string } = {};
    const ctx = {
        maxBlockingTimeMs,
        abort: (reason?: string) => { aborted.reason = reason; },
    } as unknown as MarshalingContext;
    return { ctx, aborted };
}

describe('block-watchdog (E1 detection)', () => {
    test('returns non-Promise inputs unchanged (sync fast-path)', () => {
        const { ctx } = makeStubCtx(1000);
        const r = withBlockingTimeout(ctx, 42, 'site');
        expect(r).toBe(42);
    });

    test('passes through resolved Promise without timer when cap=0', async () => {
        const { ctx, aborted } = makeStubCtx(0);
        const r = await withBlockingTimeout(ctx, Promise.resolve(7), 'site');
        expect(r).toBe(7);
        expect(aborted.reason).toBeUndefined();
    });

    test('passes through resolved Promise without timer when cap=undefined', async () => {
        const { ctx, aborted } = makeStubCtx(undefined);
        const r = await withBlockingTimeout(ctx, Promise.resolve('ok'), 'site');
        expect(r).toBe('ok');
        expect(aborted.reason).toBeUndefined();
    });

    test('resolves before cap fires — no abort, no timer leak', async () => {
        const { ctx, aborted } = makeStubCtx(1000);
        const slow = new Promise<number>((res) => { setTimeout(() => res(11), 10); });
        const r = await withBlockingTimeout(ctx, slow, 'host-import.resume');
        expect(r).toBe(11);
        expect(aborted.reason).toBeUndefined();
    });

    test('cap elapses before resolution → RuntimeError + abort()', async () => {
        const { ctx, aborted } = makeStubCtx(20);
        const never = new Promise<number>(() => { /* never resolves */ });

        let caught: unknown;
        try {
            await withBlockingTimeout(ctx, never, 'waitable-set.wait');
        } catch (e) {
            caught = e;
        }
        expect(caught).toBeInstanceOf(WebAssembly.RuntimeError);
        expect((caught as Error).message).toMatch(/JSPI suspension stalled >20ms at waitable-set\.wait/);
        expect((caught as Error).message).toMatch(/plan\.md E1/);
        expect(aborted.reason).toMatch(/JSPI suspension stalled/);
    });

    test('underlying rejection propagates without spurious abort', async () => {
        const { ctx, aborted } = makeStubCtx(1000);
        const fails = Promise.reject(new Error('host failed'));

        let caught: unknown;
        try {
            await withBlockingTimeout(ctx, fails, 'host-import.resume');
        } catch (e) {
            caught = e;
        }
        expect((caught as Error).message).toBe('host failed');
        expect(aborted.reason).toBeUndefined();
    });
});
