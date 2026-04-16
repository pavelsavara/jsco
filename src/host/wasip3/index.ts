// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * WASIp3 Host — entry point (stub)
 *
 * Provides `createHost()` factory returning a `WasiP3Imports` object.
 * All interface methods throw "not implemented" until the host is built out.
 */

import type {
    WasiP3Imports,
    WasiCliEnvironment,
    WasiCliExit,
    WasiCliStderr,
    WasiCliStdin,
    WasiCliStdout,
    WasiCliTerminalInput,
    WasiCliTerminalOutput,
    WasiCliTerminalStderr,
    WasiCliTerminalStdin,
    WasiCliTerminalStdout,
    WasiCliTypes,
    WasiClocksMonotonicClock,
    WasiClocksSystemClock,
    WasiClocksTimezone,
    WasiClocksTypes,
    WasiFilesystemPreopens,
    WasiFilesystemTypes,
    WasiHttpClient,
    WasiHttpHandler,
    WasiHttpTypes,
    WasiRandomInsecureSeed,
    WasiRandomInsecure,
    WasiRandomRandom,
    WasiSocketsIpNameLookup,
    WasiSocketsTypes,
} from '../../../wit/wasip3/types/index';
import { WasiP3Config } from './wasip3';

export type { HandleTable, HandleId, HandleTableConfig } from './resources';
export type { WasiStreamReadable, WasiStreamWritable, StreamPair } from './streams';
export type { WasiResult } from './result';
export type { WasiP3Config, MountConfig, NetworkConfig, AllocationLimits } from './types';

// Re-export infrastructure
export { createHandleTable } from './resources';
export { readableFromStream, readableFromAsyncIterable, createStreamPair, collectStream, collectBytes } from './streams';
export { ok, err, WasiError } from './result';
export { NETWORK_DEFAULTS, ALLOCATION_DEFAULTS } from './types';

// Re-export WIT types for consumers
export type {
    WasiP3Imports,
    WasiCliEnvironment,
    WasiCliExit,
    WasiCliStderr,
    WasiCliStdin,
    WasiCliStdout,
    WasiCliTerminalInput,
    WasiCliTerminalOutput,
    WasiCliTerminalStderr,
    WasiCliTerminalStdin,
    WasiCliTerminalStdout,
    WasiCliTypes,
    WasiClocksMonotonicClock,
    WasiClocksSystemClock,
    WasiClocksTimezone,
    WasiClocksTypes,
    WasiFilesystemPreopens,
    WasiFilesystemTypes,
    WasiHttpClient,
    WasiHttpHandler,
    WasiHttpTypes,
    WasiRandomInsecureSeed,
    WasiRandomInsecure,
    WasiRandomRandom,
    WasiSocketsIpNameLookup,
    WasiSocketsTypes,
};

const NOT_IMPLEMENTED = 'WASIp3 host: not implemented';

function notImplemented(): never {
    throw new Error(NOT_IMPLEMENTED);
}

function stubInterface(): Record<string, (...args: unknown[]) => never> {
    return new Proxy({} as Record<string, (...args: unknown[]) => never>, {
        get(_target, prop) {
            if (typeof prop === 'symbol') return undefined;
            return notImplemented;
        },
    });
}

/**
 * Create a WASIp3 host import object.
 *
 * **Stub implementation** — every interface method throws "not implemented".
 * Will be replaced with real implementations incrementally.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createHost(config: WasiP3Config): WasiP3Imports {
    return {
        'wasi:cli/environment': stubInterface() as unknown as typeof WasiCliEnvironment,
        'wasi:cli/exit': stubInterface() as unknown as typeof WasiCliExit,
        'wasi:cli/stderr': stubInterface() as unknown as typeof WasiCliStderr,
        'wasi:cli/stdin': stubInterface() as unknown as typeof WasiCliStdin,
        'wasi:cli/stdout': stubInterface() as unknown as typeof WasiCliStdout,
        'wasi:cli/terminal-input': stubInterface() as unknown as typeof WasiCliTerminalInput,
        'wasi:cli/terminal-output': stubInterface() as unknown as typeof WasiCliTerminalOutput,
        'wasi:cli/terminal-stderr': stubInterface() as unknown as typeof WasiCliTerminalStderr,
        'wasi:cli/terminal-stdin': stubInterface() as unknown as typeof WasiCliTerminalStdin,
        'wasi:cli/terminal-stdout': stubInterface() as unknown as typeof WasiCliTerminalStdout,
        'wasi:cli/types': stubInterface() as unknown as typeof WasiCliTypes,
        'wasi:clocks/monotonic-clock': stubInterface() as unknown as typeof WasiClocksMonotonicClock,
        'wasi:clocks/system-clock': stubInterface() as unknown as typeof WasiClocksSystemClock,
        'wasi:clocks/timezone': stubInterface() as unknown as typeof WasiClocksTimezone,
        'wasi:clocks/types': stubInterface() as unknown as typeof WasiClocksTypes,
        'wasi:filesystem/preopens': stubInterface() as unknown as typeof WasiFilesystemPreopens,
        'wasi:filesystem/types': stubInterface() as unknown as typeof WasiFilesystemTypes,
        'wasi:http/client': stubInterface() as unknown as typeof WasiHttpClient,
        'wasi:http/handler': stubInterface() as unknown as typeof WasiHttpHandler,
        'wasi:http/types': stubInterface() as unknown as typeof WasiHttpTypes,
        'wasi:random/insecure-seed': stubInterface() as unknown as typeof WasiRandomInsecureSeed,
        'wasi:random/insecure': stubInterface() as unknown as typeof WasiRandomInsecure,
        'wasi:random/random': stubInterface() as unknown as typeof WasiRandomRandom,
        'wasi:sockets/ip-name-lookup': stubInterface() as unknown as typeof WasiSocketsIpNameLookup,
        'wasi:sockets/types': stubInterface() as unknown as typeof WasiSocketsTypes,
    };
}
