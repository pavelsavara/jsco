// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { WasiRandomRandom, WasiRandomInsecure, WasiRandomInsecureSeed } from '../../../wit/wasip3/types/index';
import type { AllocationLimits } from './types';
import { ALLOCATION_DEFAULTS } from './types';

const MAX_CRYPTO_CHUNK = 65536;

export function createRandom(limits?: AllocationLimits): typeof WasiRandomRandom {
    const maxAllocation = limits?.maxAllocationSize ?? ALLOCATION_DEFAULTS.maxAllocationSize;

    return {
        getRandomBytes(maxLen: bigint): Uint8Array {
            if (maxLen === 0n) return new Uint8Array(0);
            if (maxLen < 0n) throw new RangeError('getRandomBytes: maxLen must be non-negative');
            if (maxLen > BigInt(maxAllocation)) {
                throw new RangeError(`getRandomBytes: maxLen ${maxLen} exceeds maxAllocationSize ${maxAllocation}`);
            }
            const len = Number(maxLen);
            const buf = new Uint8Array(len);
            // crypto.getRandomValues has a 65536-byte limit per call
            for (let offset = 0; offset < len; offset += MAX_CRYPTO_CHUNK) {
                const end = Math.min(offset + MAX_CRYPTO_CHUNK, len);
                crypto.getRandomValues(buf.subarray(offset, end));
            }
            return buf;
        },

        getRandomU64(): bigint {
            const buf = new Uint8Array(8);
            crypto.getRandomValues(buf);
            const view = new DataView(buf.buffer);
            return view.getBigUint64(0, true);
        },
    };
}

export function createInsecure(limits?: AllocationLimits): typeof WasiRandomInsecure {
    const maxAllocation = limits?.maxAllocationSize ?? ALLOCATION_DEFAULTS.maxAllocationSize;

    return {
        getInsecureRandomBytes(maxLen: bigint): Uint8Array {
            if (maxLen === 0n) return new Uint8Array(0);
            if (maxLen < 0n) throw new RangeError('getInsecureRandomBytes: maxLen must be non-negative');
            if (maxLen > BigInt(maxAllocation)) {
                throw new RangeError(`getInsecureRandomBytes: maxLen ${maxLen} exceeds maxAllocationSize ${maxAllocation}`);
            }
            const len = Number(maxLen);
            const buf = new Uint8Array(len);
            // Use crypto for insecure too — the spec says it doesn't need to be crypto-secure
            // but there's no reason to use a worse source in the browser
            for (let offset = 0; offset < len; offset += MAX_CRYPTO_CHUNK) {
                const end = Math.min(offset + MAX_CRYPTO_CHUNK, len);
                crypto.getRandomValues(buf.subarray(offset, end));
            }
            return buf;
        },

        getInsecureRandomU64(): bigint {
            const buf = new Uint8Array(8);
            crypto.getRandomValues(buf);
            const view = new DataView(buf.buffer);
            return view.getBigUint64(0, true);
        },
    };
}

export function createInsecureSeed(): typeof WasiRandomInsecureSeed {
    // Generate the seed once per instance (per spec: intended to be called once)
    const seedBuf = new Uint8Array(16);
    crypto.getRandomValues(seedBuf);
    const view = new DataView(seedBuf.buffer);
    const seed: [bigint, bigint] = [view.getBigUint64(0, true), view.getBigUint64(8, true)];

    return {
        getInsecureSeed(): [bigint, bigint] {
            return seed;
        },
    };
}
