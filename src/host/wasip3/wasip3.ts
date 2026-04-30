// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

// WASIp3 Host — browser-compatible host module
// Provides all WASI P3 host implementations.
// Import from '@pavelsavara/jsco/wasip3'

// Public API
export { createWasiP3Host, WasiExit } from '.';
export { NETWORK_DEFAULTS, LIMIT_DEFAULTS } from './types';
export type { HostConfig, MountConfig, NetworkConfig, AllocationLimits } from './types';

// Runtime values consumed by sibling bundles (wasip2-via-wasip3, wasip1-via-wasip3,
// wasip3-node) via the externalized `./wasip3.js` chunk. Anything imported at
// runtime from `'../wasip3'`/`'../../wasip3'` MUST be re-exported here, otherwise
// the Release bundle fails with "module './wasip3.js' does not provide an export
// named X" at import time.
export { createStreamPair, readableFromStream, readableFromAsyncIterable, collectStream, collectBytes } from './streams';
export type { WasiStreamReadable, WasiStreamWritable, StreamPair } from './streams';
export { ok, err, WasiError } from './result';
export type { WasiResult } from './result';
export { _HttpFields, _HttpRequest, _HttpResponse, _getHttpLimits } from './http';

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
} from '.';
