// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * wasi:random adapter — direct passthrough from P3 to P2.
 *
 * The random interfaces are identical between P2 and P3.
 */

import type { WasiP3Imports } from '../../../wit/wasip3/types/index';

export function adaptRandom(p3: WasiP3Imports) {
    const p3random = p3['wasi:random/random'];
    return {
        getRandomBytes(len: bigint): Uint8Array {
            return p3random.getRandomBytes(len);
        },
        getRandomU64(): bigint {
            return p3random.getRandomU64();
        },
    };
}

export function adaptInsecure(p3: WasiP3Imports) {
    const p3insecure = p3['wasi:random/insecure'];
    return {
        getInsecureRandomBytes(len: bigint): Uint8Array {
            return p3insecure.getInsecureRandomBytes(len);
        },
        getInsecureRandomU64(): bigint {
            return p3insecure.getInsecureRandomU64();
        },
    };
}

export function adaptInsecureSeed(p3: WasiP3Imports) {
    const p3seed = p3['wasi:random/insecure-seed'];
    return {
        insecureSeed(): [bigint, bigint] {
            return p3seed.getInsecureSeed();
        },
    };
}
