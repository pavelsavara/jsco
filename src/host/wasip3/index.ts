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
import type { WasiP3Config } from './types';

export type { HandleTable, HandleId, HandleTableConfig } from './resources';
export type { WasiStreamReadable, WasiStreamWritable, StreamPair } from './streams';
export type { WasiResult } from './result';
export type { WasiP3Config, MountConfig, NetworkConfig, AllocationLimits } from './types';

// Re-export infrastructure
export { createHandleTable } from './resources';
export { readableFromStream, readableFromAsyncIterable, createStreamPair, collectStream, collectBytes } from './streams';
export { ok, err, WasiError } from './result';
export { NETWORK_DEFAULTS, ALLOCATION_DEFAULTS } from './types';

// Implementation modules
import { createRandom, createInsecure, createInsecureSeed } from './random';
import { createMonotonicClock, createSystemClock, createTimezone, createClocksTypes } from './clocks';
import { createEnvironment, createExit, createCliTypes } from './cli';
import {
    createStdin, createStdout, createStderr,
    createTerminalInput, createTerminalOutput,
    createTerminalStdin, createTerminalStdout, createTerminalStderr,
} from './stdio';
import { initFilesystem, createPreopens, createFilesystemTypes } from './filesystem';
import { createHttpTypes, createHttpClient, createHttpHandler } from './http';
export { WasiExit } from './cli';

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
 * Stages 2-4 interfaces (random, clocks, cli, stdio, terminals) are
 * fully implemented. Remaining interfaces throw "not implemented".
 */
export function createHost(config?: WasiP3Config): WasiP3Imports {
    const fsState = initFilesystem(config);
    return {
        'wasi:cli/environment': createEnvironment(config),
        'wasi:cli/exit': createExit(),
        'wasi:cli/stderr': createStderr(config),
        'wasi:cli/stdin': createStdin(config),
        'wasi:cli/stdout': createStdout(config),
        'wasi:cli/terminal-input': createTerminalInput(),
        'wasi:cli/terminal-output': createTerminalOutput(),
        'wasi:cli/terminal-stderr': createTerminalStderr(),
        'wasi:cli/terminal-stdin': createTerminalStdin(),
        'wasi:cli/terminal-stdout': createTerminalStdout(),
        'wasi:cli/types': createCliTypes(),
        'wasi:clocks/monotonic-clock': createMonotonicClock(),
        'wasi:clocks/system-clock': createSystemClock(),
        'wasi:clocks/timezone': createTimezone(),
        'wasi:clocks/types': createClocksTypes(),
        'wasi:filesystem/preopens': createPreopens(fsState),
        'wasi:filesystem/types': createFilesystemTypes(fsState),
        'wasi:http/client': createHttpClient(config),
        'wasi:http/handler': createHttpHandler(),
        'wasi:http/types': createHttpTypes(config),
        'wasi:random/insecure-seed': createInsecureSeed(),
        'wasi:random/insecure': createInsecure(config?.limits),
        'wasi:random/random': createRandom(config?.limits),
        'wasi:sockets/ip-name-lookup': stubInterface() as unknown as typeof WasiSocketsIpNameLookup,
        'wasi:sockets/types': stubInterface() as unknown as typeof WasiSocketsTypes,
    };
}
