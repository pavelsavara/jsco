import { createWasiWallClock } from './wall-clock';

describe('wasi:clocks/wall-clock', () => {
    const clock = createWasiWallClock();

    it('now() returns seconds as bigint', () => {
        const dt = clock.now();
        expect(typeof dt.seconds).toBe('bigint');
    });

    it('now() returns nanoseconds as number', () => {
        const dt = clock.now();
        expect(typeof dt.nanoseconds).toBe('number');
    });

    it('now() returns plausible epoch time', () => {
        const dt = clock.now();
        // After 2020-01-01 = 1577836800
        expect(dt.seconds).toBeGreaterThan(1577836800n);
        // Before 2100-01-01 = 4102444800
        expect(dt.seconds).toBeLessThan(4102444800n);
    });

    it('now() returns nanoseconds in valid range', () => {
        const dt = clock.now();
        expect(dt.nanoseconds).toBeGreaterThanOrEqual(0);
        expect(dt.nanoseconds).toBeLessThan(1_000_000_000);
    });

    it('now() advances over time', async () => {
        const a = clock.now();
        // Small busy wait to ensure time advances
        const start = Date.now();
        while (Date.now() - start < 5) { /* spin */ }
        const b = clock.now();
        const aNs = a.seconds * 1_000_000_000n + BigInt(a.nanoseconds);
        const bNs = b.seconds * 1_000_000_000n + BigInt(b.nanoseconds);
        expect(bNs).toBeGreaterThanOrEqual(aNs);
    });

    it('resolution() returns ~1ms', () => {
        const res = clock.resolution();
        expect(res.seconds).toBe(0n);
        expect(res.nanoseconds).toBe(1_000_000);
    });
});
