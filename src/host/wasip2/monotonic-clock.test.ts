import { createWasiMonotonicClock } from './monotonic-clock';

describe('wasi:clocks/monotonic-clock', () => {
    describe('now()', () => {
        it('returns a bigint', () => {
            const clock = createWasiMonotonicClock();
            const t = clock.now();
            expect(typeof t).toBe('bigint');
        });

        it('returns a positive value', () => {
            const clock = createWasiMonotonicClock();
            expect(clock.now()).toBeGreaterThan(0n);
        });

        it('returns non-decreasing values (monotonic guarantee)', () => {
            const clock = createWasiMonotonicClock();
            const t1 = clock.now();
            const t2 = clock.now();
            expect(t2).toBeGreaterThanOrEqual(t1);
        });

        it('called in rapid succession returns distinct or equal values (never backwards)', () => {
            const clock = createWasiMonotonicClock();
            const values: bigint[] = [];
            for (let i = 0; i < 100; i++) {
                values.push(clock.now());
            }
            for (let i = 1; i < values.length; i++) {
                expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
            }
        });

        it('value is in nanosecond scale (not milliseconds or seconds)', () => {
            const clock = createWasiMonotonicClock();
            const t = clock.now();
            // performance.now() returns ms in the thousands range,
            // so nanoseconds should be in the millions/billions range.
            expect(t).toBeGreaterThan(1_000_000n);
        });
    });

    describe('resolution()', () => {
        it('returns a positive bigint', () => {
            const clock = createWasiMonotonicClock();
            const r = clock.resolution();
            expect(typeof r).toBe('bigint');
            expect(r).toBeGreaterThan(0n);
        });
    });

    describe('subscribeDuration()', () => {
        it('duration(0) creates an immediately-ready pollable', () => {
            const clock = createWasiMonotonicClock();
            const p = clock.subscribeDuration(0n);
            expect(p.ready()).toBe(true);
        });

        it('negative duration creates an immediately-ready pollable', () => {
            const clock = createWasiMonotonicClock();
            const p = clock.subscribeDuration(-100n);
            expect(p.ready()).toBe(true);
        });

        it('large duration creates a pollable that is not immediately ready', () => {
            const clock = createWasiMonotonicClock();
            // Use a duration > MAX_TIMEOUT_MS (0x7FFFFFFF ms) so it uses sync pollable
            // (no setTimeout created, no open handles)
            const hugeNanos = BigInt(0x80000000) * 1_000_000n; // ~2.1 billion ms in ns
            const p = clock.subscribeDuration(hugeNanos);
            expect(p.ready()).toBe(false);
        });

        it('MAX_U64 duration does not overflow or crash', () => {
            const clock = createWasiMonotonicClock();
            const maxU64 = (1n << 64n) - 1n;
            // Large durations skip setTimeout → sync pollable
            const p = clock.subscribeDuration(maxU64);
            expect(p.ready()).toBe(false);
        });

        it('rapid creation of 1000 timer pollables does not crash', () => {
            const clock = createWasiMonotonicClock();
            const pollables = [];
            for (let i = 0; i < 1000; i++) {
                // Use 0 duration so no timers are left open
                pollables.push(clock.subscribeDuration(0n));
            }
            expect(pollables[0].ready()).toBe(true);
            expect(pollables[999].ready()).toBe(true);
            expect(pollables.length).toBe(1000);
        });
    });

    describe('subscribeInstant()', () => {
        it('past instant creates an immediately-ready pollable', () => {
            const clock = createWasiMonotonicClock();
            const pastInstant = clock.now() - 1_000_000_000n;
            const p = clock.subscribeInstant(pastInstant);
            expect(p.ready()).toBe(true);
        });

        it('instant at zero creates an immediately-ready pollable', () => {
            const clock = createWasiMonotonicClock();
            const p = clock.subscribeInstant(0n);
            expect(p.ready()).toBe(true);
        });

        it('far-future instant creates a not-yet-ready pollable', () => {
            const clock = createWasiMonotonicClock();
            // Use a huge future instant so the duration well exceeds MAX_TIMEOUT_MS
            // and goes through the sync pollable path (no setTimeout).
            // Extra margin avoids timing race between clock.now() and internal perfNowNanos().
            const farFuture = clock.now() + BigInt(0x100000000) * 1_000_000n;
            const p = clock.subscribeInstant(farFuture);
            expect(p.ready()).toBe(false);
        });
    });
});
