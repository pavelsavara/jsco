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
import { createSocketsTypes, createIpNameLookup } from './sockets';
import { JsImports } from '../../resolver/api-types';
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

export function createWasiP3Host(config?: WasiP3Config): WasiP3Imports & JsImports {
    const fsState = initFilesystem(config);

    const result: Record<string, unknown> = {};
    const p3version = '0.3.0-rc-2026-03-15';
    function register(key: string, value: unknown) {
        result[key] = value;
        result[key + '@' + p3version] = value;
    }

    register('wasi:cli/environment', createEnvironment(config));
    register('wasi:cli/exit', createExit());
    register('wasi:cli/stderr', createStderr(config));
    register('wasi:cli/stdin', createStdin(config));
    register('wasi:cli/stdout', createStdout(config));
    register('wasi:cli/terminal-input', createTerminalInput());
    register('wasi:cli/terminal-output', createTerminalOutput());
    register('wasi:cli/terminal-stderr', createTerminalStderr());
    register('wasi:cli/terminal-stdin', createTerminalStdin());
    register('wasi:cli/terminal-stdout', createTerminalStdout());
    register('wasi:cli/types', createCliTypes());
    register('wasi:clocks/monotonic-clock', createMonotonicClock());
    register('wasi:clocks/system-clock', createSystemClock());
    register('wasi:clocks/timezone', createTimezone());
    register('wasi:clocks/types', createClocksTypes());
    register('wasi:filesystem/preopens', createPreopens(fsState));
    register('wasi:filesystem/types', createFilesystemTypes(fsState));
    register('wasi:http/client', createHttpClient(config));
    register('wasi:http/handler', createHttpHandler());
    register('wasi:http/types', createHttpTypes(config));
    register('wasi:random/insecure-seed', createInsecureSeed());
    register('wasi:random/insecure', createInsecure(config?.limits));
    register('wasi:random/random', createRandom(config?.limits));
    register('wasi:sockets/ip-name-lookup', createIpNameLookup());
    register('wasi:sockets/types', createSocketsTypes());

    return result as unknown as WasiP3Imports & JsImports;
}
