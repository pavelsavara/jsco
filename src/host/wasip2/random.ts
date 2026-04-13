// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * wasi:random/random — Cryptographically-secure random bytes
 * wasi:random/insecure — Non-cryptographic random bytes
 * wasi:random/insecure-seed — Deterministic seed pair
 *
 * Browser implementation using crypto.getRandomValues() and Math.random().
 */

/** wasi:random/random */
export interface WasiRandom {
    getRandomBytes(len: bigint): Uint8Array;
    getRandomU64(): bigint;
}

/** wasi:random/insecure */
export interface WasiRandomInsecure {
    getInsecureRandomBytes(len: bigint): Uint8Array;
    getInsecureRandomU64(): bigint;
}

/** wasi:random/insecure-seed */
export interface WasiRandomInsecureSeed {
    insecureSeed(): [bigint, bigint];
}

const MAX_CRYPTO_BATCH = 65536;

function cryptoRandomBytes(len: bigint): Uint8Array {
    const size = Number(len);
    const result = new Uint8Array(size);
    // crypto.getRandomValues() has a 65536-byte limit per call
    for (let offset = 0; offset < size; offset += MAX_CRYPTO_BATCH) {
        const remaining = size - offset;
        const batchSize = remaining < MAX_CRYPTO_BATCH ? remaining : MAX_CRYPTO_BATCH;
        const batch = new Uint8Array(batchSize);
        crypto.getRandomValues(batch);
        result.set(batch, offset);
    }
    return result;
}

function insecureRandomBytes(len: bigint): Uint8Array {
    const size = Number(len);
    const result = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
        result[i] = (Math.random() * 256) | 0;
    }
    return result;
}

function randomU64WithCrypto(): bigint {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const view = new DataView(bytes.buffer);
    return view.getBigUint64(0, true);
}

function insecureRandomU64(): bigint {
    // Two 32-bit values combined into one 64-bit value
    const lo = BigInt((Math.random() * 0x100000000) >>> 0);
    const hi = BigInt((Math.random() * 0x100000000) >>> 0);
    return (hi << 32n) | lo;
}

export function createWasiRandom(): WasiRandom {
    return {
        getRandomBytes: cryptoRandomBytes,
        getRandomU64: randomU64WithCrypto,
    };
}

export function createWasiRandomInsecure(): WasiRandomInsecure {
    return {
        getInsecureRandomBytes: insecureRandomBytes,
        getInsecureRandomU64: insecureRandomU64,
    };
}

export function createWasiRandomInsecureSeed(): WasiRandomInsecureSeed {
    // Return a pair of insecure u64 values as seed
    // Seeded once at construction time
    const seed0 = insecureRandomU64();
    const seed1 = insecureRandomU64();
    return {
        insecureSeed: () => [seed0, seed1],
    };
}
