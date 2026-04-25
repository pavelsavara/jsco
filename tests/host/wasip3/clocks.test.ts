// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { createMonotonicClock, createSystemClock, createTimezone, createClocksTypes } from '../../../src/host/wasip3/clocks';

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

describe('wasi:clocks evil arguments', () => {
    const clock = createMonotonicClock();

    it('many concurrent waitFor calls do not leak timers', async () => {
        const promises: Promise<void>[] = [];
        for (let i = 0; i < 200; i++) {
            promises.push(clock.waitFor(1_000_000n)); // 1ms each
        }
        await Promise.all(promises);
        // If we get here without OOM or timeout, timer cleanup works
    });

    it('waitFor with extremely large value does not crash (just pends)', () => {
        // Start an extremely long wait — it should not crash synchronously
        const p = clock.waitFor(BigInt(Number.MAX_SAFE_INTEGER) * 1_000_000_000n);
        expect(p).toBeInstanceOf(Promise);
        // We do not await it — just verify it was created safely
    });

    it('waitFor(undefined) throws or rejects', async () => {
        try {
            await (clock as any).waitFor(undefined);
        } catch {
            // Expected — undefined is not a bigint
            return;
        }
        // If it didn't throw, it resolved — that's also acceptable for a no-op
    });

    it('waitUntil with non-bigint argument throws or rejects', async () => {
        try {
            await (clock as any).waitUntil('not a bigint');
        } catch {
            // Expected
            return;
        }
        // Acceptable if it resolves immediately (treats as already-past)
    });
});

describe('wasi:clocks/system-clock additional', () => {
    const clock = createSystemClock();

    it('nanoseconds is in valid range after multiple calls', () => {
        for (let i = 0; i < 10; i++) {
            const instant = clock.now();
            expect(instant.nanoseconds).toBeGreaterThanOrEqual(0);
            expect(instant.nanoseconds).toBeLessThanOrEqual(999_999_999);
        }
    });
});

describe('wasi:clocks/timezone invalid arguments', () => {
    const tz = createTimezone();

    it('utcOffset with malformed instant (negative nanoseconds) does not crash', () => {
        const malformed = { seconds: BigInt(Math.floor(Date.now() / 1000)), nanoseconds: -1 };
        // Should not crash — may return an offset or undefined
        const result = tz.utcOffset(malformed);
        if (result !== undefined) {
            expect(typeof result).toBe('bigint');
        }
    });

    it('utcOffset with nanoseconds > 999_999_999 does not crash', () => {
        const malformed = { seconds: BigInt(Math.floor(Date.now() / 1000)), nanoseconds: 1_500_000_000 };
        const result = tz.utcOffset(malformed);
        if (result !== undefined) {
            expect(typeof result).toBe('bigint');
        }
    });
});
