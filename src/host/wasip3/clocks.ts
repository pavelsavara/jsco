// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type {
    WasiClocksMonotonicClock,
    WasiClocksSystemClock,
    WasiClocksTimezone,
    WasiClocksTypes,
} from '../../../wit/wasip3/types/index';

import type { Instant } from '../../../wit/wasip3/types/cli/command/host/interfaces/wasi-clocks-system-clock';

export function createMonotonicClock(): typeof WasiClocksMonotonicClock {
    return {
        now(): bigint {
            // performance.now() returns milliseconds with microsecond precision
            return BigInt(Math.round(performance.now() * 1_000_000));
        },

        getResolution(): bigint {
            // Browser performance.now() typically has ~5μs resolution (some browsers round to 100μs)
            return 1_000n; // 1 microsecond in nanoseconds
        },

        waitUntil(when: bigint): Promise<void> | void {
            const nowNs = BigInt(Math.round(performance.now() * 1_000_000));
            const delayNs = when - nowNs;
            if (delayNs <= 0n) return;
            const delayMs = Number(delayNs) / 1_000_000;
            return new Promise(resolve => setTimeout(resolve, Math.max(0, delayMs)));
        },

        waitFor(howLong: bigint): Promise<void> | void {
            if (howLong <= 0n) return;
            const delayMs = Number(howLong) / 1_000_000;
            return new Promise(resolve => setTimeout(resolve, Math.max(0, delayMs)));
        },
    };
}

export function createSystemClock(): typeof WasiClocksSystemClock {
    return {
        now(): Instant {
            const ms = Date.now();
            const seconds = BigInt(Math.floor(ms / 1000));
            const nanoseconds = (ms % 1000) * 1_000_000;
            return { seconds, nanoseconds };
        },

        getResolution(): bigint {
            // Date.now() has millisecond resolution
            return 1_000_000n; // 1 millisecond in nanoseconds
        },
    };
}

export function createTimezone(): typeof WasiClocksTimezone {
    return {
        ianaId(): string | undefined {
            try {
                return Intl.DateTimeFormat().resolvedOptions().timeZone;
            } catch {
                return undefined;
            }
        },

        utcOffset(when: Instant): bigint | undefined {
            try {
                // Convert Instant to Date
                const ms = Number(when.seconds) * 1000 + Math.floor(when.nanoseconds / 1_000_000);
                const date = new Date(ms);
                // getTimezoneOffset returns minutes, negative means ahead of UTC
                const offsetMinutes = date.getTimezoneOffset();
                // Convert to nanoseconds; negate because getTimezoneOffset is inverted
                return BigInt(-offsetMinutes) * 60_000_000_000n;
            } catch {
                return undefined;
            }
        },

        toDebugString(): string {
            try {
                const iana = Intl.DateTimeFormat().resolvedOptions().timeZone;
                if (iana) return iana;
            } catch {
                // fall through
            }
            const offsetMin = new Date().getTimezoneOffset();
            const sign = offsetMin <= 0 ? '+' : '-';
            const absMin = Math.abs(offsetMin);
            const h = String(Math.floor(absMin / 60)).padStart(2, '0');
            const m = String(absMin % 60).padStart(2, '0');
            return `${sign}${h}:${m}`;
        },
    };
}

export function createClocksTypes(): typeof WasiClocksTypes {
    // Duration is just a type alias (bigint) — no runtime content needed
    return {} as typeof WasiClocksTypes;
}
