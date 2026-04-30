// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**\n * WASIp3 Host — browser-compatible entry point.\n *\n * Creates all WASI Preview 3 host interface implementations:\n * CLI (environment, exit, stdio), clocks, random, filesystem (in-memory VFS),\n * HTTP client (Fetch API), and socket stubs (not-supported in browser).\n *\n * Import from `@pavelsavara/jsco/wasip3`.\n */

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
import type { HostConfig } from './types';

export type { HandleTable, HandleId, HandleTableConfig } from './resources';
export type { WasiStreamReadable, WasiStreamWritable, StreamPair } from './streams';
export type { WasiResult } from './result';
export type { HostConfig, MountConfig, NetworkConfig, AllocationLimits } from './types';
export type { _HttpMethod, _HttpScheme, _HttpResult, _HttpErrorCode, _HttpLimits } from './http';

// Re-export infrastructure
export { createHandleTable } from './resources';
export { readableFromStream, readableFromAsyncIterable, createStreamPair, collectStream, collectBytes } from './streams';
export { ok, err, WasiError } from './result';
export { NETWORK_DEFAULTS, LIMIT_DEFAULTS } from './types';
export { _HttpFields, _HttpRequest, _HttpResponse, _getHttpLimits } from './http';

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
import { makeRegister } from '../_shared/resource-table';

const P3_VERSIONS = ['0.3.0-rc-2026-03-15'] as const;
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

/**
 * Create a WASIp3 host import object with all WASI Preview 3 interfaces.
 *
 * Each interface is registered under both its unversioned key
 * (e.g. `wasi:cli/environment`) and the versioned key
 * (e.g. `wasi:cli/environment@0.3.0-rc-2026-03-15`).
 *
 * The browser bundle provides in-memory VFS, Web Crypto random, Fetch-based
 * HTTP, and browser clock implementations. Socket operations throw `not-supported`.
 *
 * For Node.js with real filesystem mounts, TCP/UDP sockets, and HTTP server
 * support, use `createWasiP3Host()` from `@pavelsavara/jsco/wasip3-node` instead.
 *
 * @param config - Optional configuration for environment, stdio, filesystem, and limits.
 * @returns A `WasiP3Imports` object suitable for passing to component instantiation.
 */
export function createWasiP3Host(config?: HostConfig): WasiP3Imports & JsImports {
    const fsState = initFilesystem(config);

    const result: Record<string, unknown> = {};
    const register = makeRegister(result, 'wasi:', P3_VERSIONS);

    register('cli/environment', createEnvironment(config));
    register('cli/exit', createExit());
    register('cli/stderr', createStderr(config));
    register('cli/stdin', createStdin(config));
    register('cli/stdout', createStdout(config));
    register('cli/terminal-input', createTerminalInput());
    register('cli/terminal-output', createTerminalOutput());
    register('cli/terminal-stderr', createTerminalStderr());
    register('cli/terminal-stdin', createTerminalStdin());
    register('cli/terminal-stdout', createTerminalStdout());
    register('cli/types', createCliTypes());
    register('clocks/monotonic-clock', createMonotonicClock());
    register('clocks/system-clock', createSystemClock());
    register('clocks/timezone', createTimezone());
    register('clocks/types', createClocksTypes());
    register('filesystem/preopens', createPreopens(fsState));
    register('filesystem/types', createFilesystemTypes(fsState));
    register('http/client', createHttpClient(config));
    register('http/handler', createHttpHandler());
    register('http/types', createHttpTypes(config));
    register('random/insecure-seed', createInsecureSeed());
    register('random/insecure', createInsecure(config?.limits));
    register('random/random', createRandom(config?.limits));
    register('sockets/ip-name-lookup', createIpNameLookup());
    register('sockets/types', createSocketsTypes());

    return result as unknown as WasiP3Imports & JsImports;
}
