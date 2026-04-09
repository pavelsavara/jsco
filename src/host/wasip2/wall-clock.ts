/**
 * wasi:clocks/wall-clock — Wall clock time
 *
 * Browser implementation using Date.now().
 */

import { WasiDatetime } from './types';

/** wasi:clocks/wall-clock */
export interface WasiWallClock {
    now(): WasiDatetime;
    resolution(): WasiDatetime;
}

export function createWasiWallClock(): WasiWallClock {
    return {
        now(): WasiDatetime {
            const ms = Date.now();
            const seconds = BigInt(Math.floor(ms / 1000));
            const nanoseconds = (ms % 1000) * 1_000_000;
            return { seconds, nanoseconds };
        },
        resolution(): WasiDatetime {
            // Date.now() has ~1ms resolution in browsers
            return { seconds: 0n, nanoseconds: 1_000_000 };
        },
    };
}
