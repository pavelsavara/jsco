// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

/**
 * Tests for wasi:clocks/wall-clock through the P2-via-P3 adapter.
 * Mirrors wasip2/wall-clock.test.ts.
 */

import { createWasiP2ViaP3Adapter } from '../../../src/host/wasip2-via-wasip3/index';
import { createMockP3 } from './test-helpers';

describe('wasi:clocks/wall-clock (via P3 adapter)', () => {
    function getClock() {
        return createWasiP2ViaP3Adapter(createMockP3())['wasi:clocks/wall-clock']!;
    }

    it('now() returns seconds as bigint', () => {
        const dt = getClock()['now']!();
        expect(typeof dt.seconds).toBe('bigint');
    });

    it('now() returns nanoseconds as number', () => {
        const dt = getClock()['now']!();
        expect(typeof dt.nanoseconds).toBe('number');
    });

    it('now() returns plausible epoch time', () => {
        const dt = getClock()['now']!();
        expect(dt.seconds).toBeGreaterThan(1577836800n);
        expect(dt.seconds).toBeLessThan(4102444800n);
    });

    it('now() returns nanoseconds in valid range', () => {
        const dt = getClock()['now']!();
        expect(dt.nanoseconds).toBeGreaterThanOrEqual(0);
        expect(dt.nanoseconds).toBeLessThan(1_000_000_000);
    });

    it('now() advances over time', async () => {
        const clock = getClock();
        const a = clock['now']!();
        const start = Date.now();
        while (Date.now() - start < 5) { /* spin */ }
        const b = clock['now']!();
        const aNs = a.seconds * 1_000_000_000n + BigInt(a.nanoseconds);
        const bNs = b.seconds * 1_000_000_000n + BigInt(b.nanoseconds);
        expect(bNs).toBeGreaterThanOrEqual(aNs);
    });

    it('resolution() returns a WasiDatetime', () => {
        const res = getClock()['resolution']!();
        expect(typeof res.seconds).toBe('bigint');
        expect(typeof res.nanoseconds).toBe('number');
    });

    it('now() clamps negative P3 seconds to 0', () => {
        const host = createWasiP2ViaP3Adapter(createMockP3({
            'wasi:clocks/system-clock': {
                now: () => ({ seconds: -100n, nanoseconds: 500_000_000 }),
                getResolution: () => 1_000_000n,
            },
        }));
        const dt = host['wasi:clocks/wall-clock']!['now']!();
        expect(dt.seconds).toBe(0n);
        expect(dt.nanoseconds).toBe(500_000_000);
    });
});

describe('wasi:clocks/timezone (via P3 adapter)', () => {
    it('display returns a timezone-display record', () => {
        const host = createWasiP2ViaP3Adapter(createMockP3());
        const fn = host['wasi:clocks/timezone']!['display']!;
        const tz = fn({ seconds: 0n, nanoseconds: 0 });
        expect(typeof tz.utcOffset).toBe('number');
        expect(typeof tz.name).toBe('string');
        expect(tz.name).toBe('UTC');
        expect(tz.inDaylightSavingTime).toBe(false);
    });
});
