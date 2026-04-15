// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * wasi:clocks/monotonic-clock — High-resolution monotonic timer
 *
 * Uses performance.now() scaled to nanoseconds.
 * subscribeDuration() / subscribeInstant() create Pollables via setTimeout.
 */

import type { WasiPollable, WasiMonotonicClock } from './api';
import { createSyncPollable, createAsyncPollable } from './poll';

/** Nanoseconds per millisecond */
const NS_PER_MS = 1_000_000n;

/** Browser performance.now() resolution is ~1ms (can be 5µs in some configs) */
const RESOLUTION_NS = NS_PER_MS;

/**
 * Convert performance.now() (milliseconds, fractional) to nanoseconds (bigint).
 * Uses microsecond precision from the fractional part.
 */
function perfNowNanos(): bigint {
    const ms = performance.now();
    // performance.now() returns a DOMHighResTimeStamp (double, milliseconds).
    // Multiply by 1e6 to get nanoseconds, then truncate to bigint.
    return BigInt(Math.trunc(ms * 1_000_000));
}

/**
 * Create a wasi:clocks/monotonic-clock implementation.
 */
export function createWasiMonotonicClock(): WasiMonotonicClock {
    const clock: WasiMonotonicClock = {
        now(): bigint {
            return perfNowNanos();
        },

        resolution(): bigint {
            return RESOLUTION_NS;
        },

        subscribeDuration(nanos: bigint): WasiPollable {
            if (nanos <= 0n) {
                // Zero or negative duration → immediately ready
                return createSyncPollable(() => true);
            }

            // Convert nanoseconds to milliseconds for setTimeout
            const ms = Number(nanos / NS_PER_MS);
            const deadline = performance.now() + ms;

            // For very large durations, skip setTimeout (would overflow int32)
            // and rely on deadline checking in ready()
            const MAX_TIMEOUT_MS = 0x7FFFFFFF; // ~24.8 days, max safe setTimeout
            if (ms > MAX_TIMEOUT_MS) {
                return createSyncPollable(() => performance.now() >= deadline);
            }

            // Use a pollable that checks if the deadline has passed
            // For blocking, create an async pollable backed by setTimeout
            const promise = new Promise<void>(resolve => {
                setTimeout(resolve, ms);
            });

            // Return async pollable — ready() checks deadline, block() uses JSPI
            let resolved = false;
            promise.then(() => { resolved = true; });

            return {
                ready(): boolean {
                    if (resolved) return true;
                    // Check if deadline passed even if setTimeout hasn't fired
                    if (performance.now() >= deadline) {
                        resolved = true;
                        return true;
                    }
                    return false;
                },
                block(): void {
                    if (resolved || performance.now() >= deadline) return;
                    // Delegate to async pollable's block behavior
                    const asyncPollable = createAsyncPollable(promise);
                    asyncPollable.block();
                },
            };
        },

        subscribeInstant(instant: bigint): WasiPollable {
            const currentNanos = perfNowNanos();
            if (instant <= currentNanos) {
                // Instant is in the past → immediately ready
                return createSyncPollable(() => true);
            }

            const deltaNanos = instant - currentNanos;
            return clock.subscribeDuration(deltaNanos);
        },
    };
    return clock;
}
