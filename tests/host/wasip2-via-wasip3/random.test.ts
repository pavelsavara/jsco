// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * Tests for wasi:random/* through the P2-via-P3 adapter.
 * Mirrors wasip2/random.test.ts.
 */

import { createWasiP2ViaP3Adapter } from '../../../src/host/wasip2-via-wasip3/index';
import { createMockP3 } from './test-helpers';

describe('wasi:random/random (via P3 adapter)', () => {
    function getRandomIface() {
        return createWasiP2ViaP3Adapter(createMockP3())['wasi:random/random']!;
    }

    it('getRandomBytes returns correct length', () => {
        const bytes = getRandomIface()['get-random-bytes']!(32n);
        expect(bytes).toBeInstanceOf(Uint8Array);
        expect(bytes.length).toBe(32);
    });

    it('getRandomBytes handles zero length', () => {
        const bytes = getRandomIface()['get-random-bytes']!(0n);
        expect(bytes.length).toBe(0);
    });

    it('getRandomBytes handles large requests (batching)', () => {
        const bytes = getRandomIface()['get-random-bytes']!(100_000n);
        expect(bytes.length).toBe(100_000);
        const nonZero = bytes.some((b: number) => b !== 0);
        expect(nonZero).toBe(true);
    });

    it('getRandomBytes produces different output each call', () => {
        const iface = getRandomIface();
        const a = iface['get-random-bytes']!(32n);
        const b = iface['get-random-bytes']!(32n);
        const same = a.every((v: number, i: number) => v === b[i]);
        expect(same).toBe(false);
    });

    it('getRandomU64 returns bigint', () => {
        const val = getRandomIface()['get-random-u64']!();
        expect(typeof val).toBe('bigint');
    });

    it('getRandomU64 returns values in u64 range', () => {
        const val = getRandomIface()['get-random-u64']!();
        expect(val).toBeGreaterThanOrEqual(0n);
        expect(val).toBeLessThan(1n << 64n);
    });

    it('getRandomU64 produces different values', () => {
        const iface = getRandomIface();
        const a = iface['get-random-u64']!();
        const b = iface['get-random-u64']!();
        expect(a).not.toBe(b);
    });
});

describe('wasi:random/insecure (via P3 adapter)', () => {
    function getInsecureIface() {
        return createWasiP2ViaP3Adapter(createMockP3())['wasi:random/insecure']!;
    }

    it('getInsecureRandomBytes returns correct length', () => {
        const bytes = getInsecureIface()['get-insecure-random-bytes']!(64n);
        expect(bytes).toBeInstanceOf(Uint8Array);
        expect(bytes.length).toBe(64);
    });

    it('getInsecureRandomBytes handles zero length', () => {
        const bytes = getInsecureIface()['get-insecure-random-bytes']!(0n);
        expect(bytes.length).toBe(0);
    });

    it('getInsecureRandomU64 returns bigint', () => {
        const val = getInsecureIface()['get-insecure-random-u64']!();
        expect(typeof val).toBe('bigint');
    });
});

describe('wasi:random/insecure-seed (via P3 adapter)', () => {
    it('insecureSeed returns a tuple of two bigints', () => {
        const iface = createWasiP2ViaP3Adapter(createMockP3())['wasi:random/insecure-seed']!;
        const seed = iface['insecure-seed']!();
        expect(typeof seed[0]).toBe('bigint');
        expect(typeof seed[1]).toBe('bigint');
    });
});
