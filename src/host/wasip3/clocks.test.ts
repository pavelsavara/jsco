// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { createMonotonicClock, createSystemClock, createTimezone, createClocksTypes } from './clocks';

describe('wasi:clocks/monotonic-clock', () => {
    const clock = createMonotonicClock();

    describe('now', () => {
        it('returns a bigint (nanoseconds)', () => {
            const val = clock.now();
            expect(typeof val).toBe('bigint');
        });

        it('two consecutive calls produce non-decreasing values', () => {
            const a = clock.now();
            const b = clock.now();
            expect(b >= a).toBe(true);
        });

        it('values called in rapid succession are non-decreasing', () => {
            const values: bigint[] = [];
            for (let i = 0; i < 100; i++) {
                values.push(clock.now());
            }
            for (let i = 1; i < values.length; i++) {
                expect(values[i]! >= values[i - 1]!).toBe(true);
            }
        });
    });

    describe('getResolution', () => {
        it('returns a positive bigint', () => {
            const res = clock.getResolution();
            expect(typeof res).toBe('bigint');
            expect(res > 0n).toBe(true);
        });
    });

    describe('waitFor', () => {
        it('resolves after approximately the given duration', async () => {
            const before = performance.now();
            await clock.waitFor(10_000_000n); // 10ms
            const after = performance.now();
            expect(after - before).toBeGreaterThanOrEqual(5); // at least ~5ms (timer imprecision)
        });

        it('resolves immediately for 0 duration', async () => {
            const before = performance.now();
            await clock.waitFor(0n);
            const after = performance.now();
            expect(after - before).toBeLessThan(50);
        });

        it('resolves immediately for 1ns (sub-millisecond)', async () => {
            const before = performance.now();
            await clock.waitFor(1n);
            const after = performance.now();
            // setTimeout minimum is ~1ms, so this should resolve near-instantly
            expect(after - before).toBeLessThan(50);
        });

        it('resolves immediately for negative duration', async () => {
            const before = performance.now();
            await clock.waitFor(-1_000_000n);
            const after = performance.now();
            expect(after - before).toBeLessThan(50);
        });

        it('multiple concurrent waitFor calls resolve independently', async () => {
            const results: number[] = [];
            const p1 = clock.waitFor(5_000_000n).then(() => results.push(1));
            const p2 = clock.waitFor(5_000_000n).then(() => results.push(2));
            const p3 = clock.waitFor(5_000_000n).then(() => results.push(3));
            await Promise.all([p1, p2, p3]);
            expect(results).toHaveLength(3);
        });
    });

    describe('waitUntil', () => {
        it('resolves for a mark in the near future', async () => {
            const target = clock.now() + 10_000_000n; // 10ms from now
            const before = performance.now();
            await clock.waitUntil(target);
            const after = performance.now();
            expect(after - before).toBeGreaterThanOrEqual(5);
        });

        it('resolves immediately for a mark already passed', async () => {
            const past = clock.now() - 1_000_000n;
            const before = performance.now();
            await clock.waitUntil(past);
            const after = performance.now();
            expect(after - before).toBeLessThan(50);
        });
    });
});

describe('wasi:clocks/system-clock', () => {
    const clock = createSystemClock();

    describe('now', () => {
        it('returns an Instant with seconds and nanoseconds', () => {
            const instant = clock.now();
            expect(typeof instant.seconds).toBe('bigint');
            expect(typeof instant.nanoseconds).toBe('number');
        });

        it('seconds is approximately current Unix epoch seconds', () => {
            const instant = clock.now();
            const expected = BigInt(Math.floor(Date.now() / 1000));
            // Allow ±2 seconds for test execution time
            expect(instant.seconds >= expected - 2n).toBe(true);
            expect(instant.seconds <= expected + 2n).toBe(true);
        });

        it('nanoseconds is in [0, 999_999_999]', () => {
            const instant = clock.now();
            expect(instant.nanoseconds).toBeGreaterThanOrEqual(0);
            expect(instant.nanoseconds).toBeLessThanOrEqual(999_999_999);
        });

        it('nanoseconds is a number (u32), not bigint', () => {
            const instant = clock.now();
            expect(typeof instant.nanoseconds).toBe('number');
            expect(Number.isInteger(instant.nanoseconds)).toBe(true);
        });
    });

    describe('getResolution', () => {
        it('returns a positive bigint', () => {
            const res = clock.getResolution();
            expect(typeof res).toBe('bigint');
            expect(res > 0n).toBe(true);
        });
    });
});

describe('wasi:clocks/timezone', () => {
    const tz = createTimezone();

    describe('ianaId', () => {
        it('returns a string or undefined', () => {
            const id = tz.ianaId();
            if (id !== undefined) {
                expect(typeof id).toBe('string');
                expect(id.length).toBeGreaterThan(0);
            }
        });
    });

    describe('utcOffset', () => {
        it('returns a bigint or undefined for current time', () => {
            const now = { seconds: BigInt(Math.floor(Date.now() / 1000)), nanoseconds: 0 };
            const offset = tz.utcOffset(now);
            if (offset !== undefined) {
                expect(typeof offset).toBe('bigint');
                // Offset magnitude < 86,400,000,000,000 ns (one day)
                const absOffset = offset < 0n ? -offset : offset;
                expect(absOffset < 86_400_000_000_000n).toBe(true);
            }
        });

        it('returns consistent offset for the same instant', () => {
            const now = { seconds: BigInt(Math.floor(Date.now() / 1000)), nanoseconds: 0 };
            const offset1 = tz.utcOffset(now);
            const offset2 = tz.utcOffset(now);
            expect(offset1).toBe(offset2);
        });
    });

    describe('toDebugString', () => {
        it('returns a non-empty string', () => {
            const str = tz.toDebugString();
            expect(typeof str).toBe('string');
            expect(str.length).toBeGreaterThan(0);
        });
    });
});

describe('wasi:clocks/types', () => {
    it('createClocksTypes returns an object (type-only module)', () => {
        const types = createClocksTypes();
        expect(typeof types).toBe('object');
    });
});
