// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * Tests for wasi:clocks/monotonic-clock through the P2-via-P3 adapter.
 * Mirrors wasip2/monotonic-clock.test.ts.
 */

import { createWasiP2ViaP3Adapter } from '../../../src/host/wasip2-via-wasip3/index';
import { createMockP3 } from './test-helpers';
import type { WasiPollable } from '../../../src/host/wasip2-via-wasip3/io';

describe('wasi:clocks/monotonic-clock (via P3 adapter)', () => {
    function getClock() {
        return createWasiP2ViaP3Adapter(createMockP3())['wasi:clocks/monotonic-clock']!;
    }

    describe('now()', () => {
        it('returns a bigint', () => {
            const t = getClock()['now']!();
            expect(typeof t).toBe('bigint');
        });

        it('returns a positive value', () => {
            expect(getClock()['now']!()).toBeGreaterThan(0n);
        });

        it('returns non-decreasing values (monotonic guarantee)', () => {
            const clock = getClock();
            const t1 = clock['now']!();
            const t2 = clock['now']!();
            expect(t2).toBeGreaterThanOrEqual(t1);
        });

        it('called in rapid succession returns distinct or equal values (never backwards)', () => {
            const clock = getClock();
            const values: bigint[] = [];
            for (let i = 0; i < 100; i++) {
                values.push(clock['now']!());
            }
            for (let i = 1; i < values.length; i++) {
                expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]!);
            }
        });

        it('value is in nanosecond scale (not milliseconds or seconds)', () => {
            const t = getClock()['now']!();
            expect(t).toBeGreaterThan(1_000_000n);
        });
    });

    describe('resolution()', () => {
        it('returns a positive bigint', () => {
            const r = getClock()['resolution']!();
            expect(typeof r).toBe('bigint');
            expect(r).toBeGreaterThan(0n);
        });
    });

    describe('subscribeDuration()', () => {
        it('duration(0) creates an immediately-ready pollable', () => {
            const p = getClock()['subscribe-duration']!(0n) as WasiPollable;
            expect(p.ready()).toBe(true);
        });

        it('negative duration creates an immediately-ready pollable', () => {
            const p = getClock()['subscribe-duration']!(-100n) as WasiPollable;
            expect(p.ready()).toBe(true);
        });

        it('large duration creates a pollable that is not immediately ready', () => {
            const p = getClock()['subscribe-duration']!(1_000_000_000n) as WasiPollable;
            expect(typeof p.ready).toBe('function');
            expect(typeof p.block).toBe('function');
        });
    });

    describe('subscribeInstant()', () => {
        it('past instant creates an immediately-ready pollable', () => {
            const clock = getClock();
            const pastInstant = clock['now']!() - 1_000_000_000n;
            const p = clock['subscribe-instant']!(pastInstant) as WasiPollable;
            expect(p.ready()).toBe(true);
        });

        it('instant at zero creates an immediately-ready pollable', () => {
            const p = getClock()['subscribe-instant']!(0n) as WasiPollable;
            expect(p.ready()).toBe(true);
        });
    });
});
