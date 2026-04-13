// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { createWasiRandom, createWasiRandomInsecure, createWasiRandomInsecureSeed } from './random';

describe('wasi:random/random', () => {
    const random = createWasiRandom();

    it('getRandomBytes returns correct length', () => {
        const bytes = random.getRandomBytes(32n);
        expect(bytes).toBeInstanceOf(Uint8Array);
        expect(bytes.length).toBe(32);
    });

    it('getRandomBytes handles zero length', () => {
        const bytes = random.getRandomBytes(0n);
        expect(bytes.length).toBe(0);
    });

    it('getRandomBytes handles large requests (batching)', () => {
        const bytes = random.getRandomBytes(100_000n);
        expect(bytes.length).toBe(100_000);
        // Verify not all zeros (statistically impossible for crypto random)
        const nonZero = bytes.some(b => b !== 0);
        expect(nonZero).toBe(true);
    });

    it('getRandomBytes produces different output each call', () => {
        const a = random.getRandomBytes(32n);
        const b = random.getRandomBytes(32n);
        // Statistically impossible for 32 crypto-random bytes to match
        const same = a.every((v, i) => v === b[i]);
        expect(same).toBe(false);
    });

    it('getRandomU64 returns bigint', () => {
        const val = random.getRandomU64();
        expect(typeof val).toBe('bigint');
    });

    it('getRandomU64 returns values in u64 range', () => {
        const val = random.getRandomU64();
        expect(val).toBeGreaterThanOrEqual(0n);
        expect(val).toBeLessThan(1n << 64n);
    });

    it('getRandomU64 produces different values', () => {
        const a = random.getRandomU64();
        const b = random.getRandomU64();
        // Statistically impossible for two random u64 to match
        expect(a).not.toBe(b);
    });
});

describe('wasi:random/insecure', () => {
    const insecure = createWasiRandomInsecure();

    it('getInsecureRandomBytes returns correct length', () => {
        const bytes = insecure.getInsecureRandomBytes(64n);
        expect(bytes).toBeInstanceOf(Uint8Array);
        expect(bytes.length).toBe(64);
    });

    it('getInsecureRandomBytes handles zero length', () => {
        const bytes = insecure.getInsecureRandomBytes(0n);
        expect(bytes.length).toBe(0);
    });

    it('getInsecureRandomU64 returns bigint', () => {
        const val = insecure.getInsecureRandomU64();
        expect(typeof val).toBe('bigint');
    });

    it('getInsecureRandomU64 returns values in u64 range', () => {
        const val = insecure.getInsecureRandomU64();
        expect(val).toBeGreaterThanOrEqual(0n);
        expect(val).toBeLessThan(1n << 64n);
    });
});

describe('wasi:random/insecure-seed', () => {
    const seed = createWasiRandomInsecureSeed();

    it('insecureSeed returns a tuple of two bigints', () => {
        const [s0, s1] = seed.insecureSeed();
        expect(typeof s0).toBe('bigint');
        expect(typeof s1).toBe('bigint');
    });

    it('insecureSeed returns same values on repeated calls', () => {
        const [a0, a1] = seed.insecureSeed();
        const [b0, b1] = seed.insecureSeed();
        expect(a0).toBe(b0);
        expect(a1).toBe(b1);
    });

    it('different instances return different seeds', () => {
        const seed2 = createWasiRandomInsecureSeed();
        const [a0, a1] = seed.insecureSeed();
        const [b0, b1] = seed2.insecureSeed();
        // Statistically impossible for both u64 pairs to match
        const same = a0 === b0 && a1 === b1;
        expect(same).toBe(false);
    });
});
