// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { createRandom, createInsecure, createInsecureSeed } from '../../../src/host/wasip3/random';

describe('wasi:random/random', () => {
    const random = createRandom();

    describe('getRandomBytes', () => {
        // Spec: "This function returns a list of cryptographically-random bytes."
        // Spec: "Implementations MAY return fewer bytes than requested (short reads).
        //        Callers that require exactly max-len bytes MUST call in a loop."
        // Our implementation always returns exactly max-len bytes, which is compliant.

        it('returns exactly the requested number of bytes', () => {
            const bytes = random.getRandomBytes(16n);
            expect(bytes).toBeInstanceOf(Uint8Array);
            expect(bytes.length).toBe(16);
        });

        it('returns at least 1 byte when max-len > 0 (spec invariant)', () => {
            // Spec requires at least 1 byte for non-zero max-len
            for (let i = 0; i < 10; i++) {
                const bytes = random.getRandomBytes(1n);
                expect(bytes.length).toBeGreaterThanOrEqual(1);
            }
        });

        it('returns empty Uint8Array for 0', () => {
            const bytes = random.getRandomBytes(0n);
            expect(bytes).toBeInstanceOf(Uint8Array);
            expect(bytes.length).toBe(0);
        });

        it('returns a single byte', () => {
            const bytes = random.getRandomBytes(1n);
            expect(bytes.length).toBe(1);
        });

        it('two calls return different data (probabilistic)', () => {
            const a = random.getRandomBytes(32n);
            const b = random.getRandomBytes(32n);
            // With 32 bytes, chance of collision is negligible
            expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
        });

        it('handles exactly 65536 bytes (single crypto.getRandomValues limit)', () => {
            const bytes = random.getRandomBytes(65536n);
            expect(bytes.length).toBe(65536);
        });

        it('handles 65537 bytes (exceeds single call limit, must chunk)', () => {
            const bytes = random.getRandomBytes(65537n);
            expect(bytes.length).toBe(65537);
        });

        it('handles large allocation within config limits', () => {
            const bytes = random.getRandomBytes(1_000_000n);
            expect(bytes.length).toBe(1_000_000);
        });

        it('throws for negative length', () => {
            expect(() => random.getRandomBytes(-1n)).toThrow(RangeError);
        });

        it('throws for absurdly large length exceeding config limit', () => {
            const small = createRandom({ maxAllocationSize: 1024 });
            expect(() => small.getRandomBytes(2048n)).toThrow(RangeError);
            expect(() => small.getRandomBytes(2048n)).toThrow(/maxAllocationSize/);
        });

        it('throws when maxLen exceeds u64 range via config limit', () => {
            expect(() => random.getRandomBytes(2n ** 64n)).toThrow(RangeError);
        });

        it('rapid calls in tight loop do not crash', () => {
            for (let i = 0; i < 100; i++) {
                const bytes = random.getRandomBytes(64n);
                expect(bytes.length).toBe(64);
            }
        });

        it('undefined argument returns empty array (no type guard)', () => {
            // No runtime type check — undefined passes through comparisons as false
            const result = (random as any).getRandomBytes(undefined);
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result.length).toBe(0);
        });

        it('number instead of bigint silently coerces', () => {
            // JS allows number<->bigint comparisons; Number(42) = 42
            const result = (random as any).getRandomBytes(42);
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result.length).toBe(42);
        });

        it('throws for absurdly large bigint beyond u64', () => {
            expect(() => random.getRandomBytes(BigInt(Number.MAX_SAFE_INTEGER) * 1000n)).toThrow(RangeError);
        });
    });

    describe('getRandomU64', () => {
        it('returns a bigint', () => {
            const val = random.getRandomU64();
            expect(typeof val).toBe('bigint');
        });

        it('returns a value in [0, 2^64) range', () => {
            const val = random.getRandomU64();
            expect(val >= 0n).toBe(true);
            expect(val < 2n ** 64n).toBe(true);
        });

        it('two consecutive calls return different values (probabilistic)', () => {
            const a = random.getRandomU64();
            const b = random.getRandomU64();
            expect(a).not.toBe(b);
        });
    });
});

describe('wasi:random/insecure', () => {
    const insecure = createInsecure();

    describe('getInsecureRandomBytes', () => {
        it('returns exactly the requested number of bytes', () => {
            const bytes = insecure.getInsecureRandomBytes(32n);
            expect(bytes).toBeInstanceOf(Uint8Array);
            expect(bytes.length).toBe(32);
        });

        it('returns empty Uint8Array for 0', () => {
            const bytes = insecure.getInsecureRandomBytes(0n);
            expect(bytes.length).toBe(0);
        });

        it('throws for negative length', () => {
            expect(() => insecure.getInsecureRandomBytes(-1n)).toThrow(RangeError);
        });

        it('throws for length exceeding config limit', () => {
            const small = createInsecure({ maxAllocationSize: 512 });
            expect(() => small.getInsecureRandomBytes(1024n)).toThrow(RangeError);
        });
    });

    describe('getInsecureRandomU64', () => {
        it('returns a bigint in [0, 2^64)', () => {
            const val = insecure.getInsecureRandomU64();
            expect(typeof val).toBe('bigint');
            expect(val >= 0n).toBe(true);
            expect(val < 2n ** 64n).toBe(true);
        });
    });
});

describe('wasi:random/insecure-seed', () => {
    describe('getInsecureSeed', () => {
        it('returns a [bigint, bigint] tuple', () => {
            const seed = createInsecureSeed();
            const [a, b] = seed.getInsecureSeed();
            expect(typeof a).toBe('bigint');
            expect(typeof b).toBe('bigint');
        });

        it('both values are in [0, 2^64) range', () => {
            const seed = createInsecureSeed();
            const [a, b] = seed.getInsecureSeed();
            expect(a >= 0n).toBe(true);
            expect(a < 2n ** 64n).toBe(true);
            expect(b >= 0n).toBe(true);
            expect(b < 2n ** 64n).toBe(true);
        });

        it('calling twice in same instance returns the same seed', () => {
            const seed = createInsecureSeed();
            const first = seed.getInsecureSeed();
            const second = seed.getInsecureSeed();
            expect(first[0]).toBe(second[0]);
            expect(first[1]).toBe(second[1]);
        });

        it('different instances return different seeds (probabilistic)', () => {
            const seed1 = createInsecureSeed();
            const seed2 = createInsecureSeed();
            const [a1, b1] = seed1.getInsecureSeed();
            const [a2, b2] = seed2.getInsecureSeed();
            // With 128 bits of randomness, collision is negligible
            expect(a1 !== a2 || b1 !== b2).toBe(true);
        });
    });
});
