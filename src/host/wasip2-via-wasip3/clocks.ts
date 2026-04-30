// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

/**
 * wasi:clocks adapter — bridges P3 clocks to P2.
 *
 * Key differences:
 * - P3 `system-clock` → P2 `wall-clock` (different interface name, type changes)
 * - P3 `system-clock.instant.seconds` is `s64` → P2 `wall-clock.datetime.seconds` is `u64`
 * - P3 `monotonic-clock.getResolution()` → P2 `resolution()`
 * - P3 `waitUntil/waitFor` → P2 `subscribeInstant/subscribeDuration` (async→pollable)
 * - P3 `timezone.ianaId()/utcOffset()/toDebugString()` → P2 `timezone.display()` → record
 */

import type { WasiP3Imports } from '../wasip3';
import type { WasiPollable } from './io';
import { createSyncPollable, createAsyncPollable } from './io';

interface WasiDatetime {
    seconds: bigint;
    nanoseconds: number;
}

interface TimezoneDisplay {
    utcOffset: number;
    name: string;
    inDaylightSavingTime: boolean;
}

export function adaptMonotonicClock(p3: WasiP3Imports): { now(): bigint; resolution(): bigint; subscribeDuration(nanos: bigint): WasiPollable; subscribeInstant(instant: bigint): WasiPollable } {
    const p3clock = p3['wasi:clocks/monotonic-clock'];

    return {
        now(): bigint {
            return p3clock.now();
        },

        resolution(): bigint {
            return p3clock.getResolution();
        },

        subscribeDuration(nanos: bigint): WasiPollable {
            if (nanos <= 0n) {
                return createSyncPollable(() => true);
            }
            const promise = p3clock.waitFor(nanos);
            if (!promise || !(promise instanceof Promise)) {
                return createSyncPollable(() => true);
            }
            return createAsyncPollable(promise.then(() => { }));
        },

        subscribeInstant(instant: bigint): WasiPollable {
            const nowNs = p3clock.now();
            if (instant <= nowNs) {
                return createSyncPollable(() => true);
            }
            const promise = p3clock.waitUntil(instant);
            if (!promise || !(promise instanceof Promise)) {
                return createSyncPollable(() => true);
            }
            return createAsyncPollable(promise.then(() => { }));
        },
    };
}

export function adaptWallClock(p3: WasiP3Imports): { now(): WasiDatetime; resolution(): WasiDatetime } {
    const p3clock = p3['wasi:clocks/system-clock'];

    return {
        now(): WasiDatetime {
            const instant = p3clock.now();
            // P3 instant.seconds is s64; P2 datetime.seconds is u64.
            // Clamp negative to 0 (pre-epoch not representable in P2).
            const seconds = instant.seconds < 0n ? 0n : instant.seconds;
            return { seconds, nanoseconds: instant.nanoseconds };
        },

        resolution(): WasiDatetime {
            const durationNs = p3clock.getResolution();
            const seconds = durationNs / 1_000_000_000n;
            const nanoseconds = Number(durationNs % 1_000_000_000n);
            return { seconds, nanoseconds };
        },
    };
}

export function adaptTimezone(p3: WasiP3Imports): { display(when: WasiDatetime): TimezoneDisplay } {
    const p3tz = p3['wasi:clocks/timezone'];

    return {
        display(when: WasiDatetime): TimezoneDisplay {
            const instant = { seconds: when.seconds, nanoseconds: when.nanoseconds };
            const offsetNs = p3tz.utcOffset(instant);
            const utcOffset = offsetNs !== undefined ? Number(offsetNs / 60_000_000_000n) : 0;
            const name = p3tz.ianaId() ?? p3tz.toDebugString();
            // P3 has no in-daylight-saving-time field; always false
            return { utcOffset, name, inDaylightSavingTime: false };
        },
    };
}
