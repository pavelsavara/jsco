// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

// cli
import type * as WasiCliEnvironment from './cli/command/host/interfaces/wasi-cli-environment.js';
import type * as WasiCliExit from './cli/command/host/interfaces/wasi-cli-exit.js';
import type * as WasiCliStderr from './cli/command/host/interfaces/wasi-cli-stderr.js';
import type * as WasiCliStdin from './cli/command/host/interfaces/wasi-cli-stdin.js';
import type * as WasiCliStdout from './cli/command/host/interfaces/wasi-cli-stdout.js';
import type * as WasiCliTerminalInput from './cli/command/host/interfaces/wasi-cli-terminal-input.js';
import type * as WasiCliTerminalOutput from './cli/command/host/interfaces/wasi-cli-terminal-output.js';
import type * as WasiCliTerminalStderr from './cli/command/host/interfaces/wasi-cli-terminal-stderr.js';
import type * as WasiCliTerminalStdin from './cli/command/host/interfaces/wasi-cli-terminal-stdin.js';
import type * as WasiCliTerminalStdout from './cli/command/host/interfaces/wasi-cli-terminal-stdout.js';
import type * as WasiCliTypes from './cli/command/host/interfaces/wasi-cli-types.js';
import type * as WasiCliRun from './cli/command/host/interfaces/wasi-cli-run.js';

// clocks
import type * as WasiClocksMonotonicClock from './cli/command/host/interfaces/wasi-clocks-monotonic-clock.js';
import type * as WasiClocksSystemClock from './cli/command/host/interfaces/wasi-clocks-system-clock.js';
import type * as WasiClocksTimezone from './cli/command/host/interfaces/wasi-clocks-timezone.js';
import type * as WasiClocksTypes from './cli/command/host/interfaces/wasi-clocks-types.js';

// filesystem
import type * as WasiFilesystemPreopens from './cli/command/host/interfaces/wasi-filesystem-preopens.js';
import type * as WasiFilesystemTypes from './cli/command/host/interfaces/wasi-filesystem-types.js';

// http
import type * as WasiHttpClient from './http/middleware/host/interfaces/wasi-http-client.js';
import type * as WasiHttpHandler from './http/middleware/host/interfaces/wasi-http-handler.js';
import type * as WasiHttpTypes from './http/middleware/host/interfaces/wasi-http-types.js';

// random
import type * as WasiRandomInsecureSeed from './cli/command/host/interfaces/wasi-random-insecure-seed.js';
import type * as WasiRandomInsecure from './cli/command/host/interfaces/wasi-random-insecure.js';
import type * as WasiRandomRandom from './cli/command/host/interfaces/wasi-random-random.js';

// sockets
import type * as WasiSocketsIpNameLookup from './cli/command/host/interfaces/wasi-sockets-ip-name-lookup.js';
import type * as WasiSocketsTypes from './cli/command/host/interfaces/wasi-sockets-types.js';

// Merge of all WASIp3 world imports: cli/command, http/middleware, http/service
export interface WasiP3Imports {
    'wasi:cli/environment': typeof WasiCliEnvironment;
    'wasi:cli/exit': typeof WasiCliExit;
    'wasi:cli/stderr': typeof WasiCliStderr;
    'wasi:cli/stdin': typeof WasiCliStdin;
    'wasi:cli/stdout': typeof WasiCliStdout;
    'wasi:cli/terminal-input': typeof WasiCliTerminalInput;
    'wasi:cli/terminal-output': typeof WasiCliTerminalOutput;
    'wasi:cli/terminal-stderr': typeof WasiCliTerminalStderr;
    'wasi:cli/terminal-stdin': typeof WasiCliTerminalStdin;
    'wasi:cli/terminal-stdout': typeof WasiCliTerminalStdout;
    'wasi:cli/types': typeof WasiCliTypes;
    'wasi:clocks/monotonic-clock': typeof WasiClocksMonotonicClock;
    'wasi:clocks/system-clock': typeof WasiClocksSystemClock;
    'wasi:clocks/timezone': typeof WasiClocksTimezone;
    'wasi:clocks/types': typeof WasiClocksTypes;
    'wasi:filesystem/preopens': typeof WasiFilesystemPreopens;
    'wasi:filesystem/types': typeof WasiFilesystemTypes;
    'wasi:http/client': typeof WasiHttpClient;
    'wasi:http/handler': typeof WasiHttpHandler;
    'wasi:http/types': typeof WasiHttpTypes;
    'wasi:random/insecure-seed': typeof WasiRandomInsecureSeed;
    'wasi:random/insecure': typeof WasiRandomInsecure;
    'wasi:random/random': typeof WasiRandomRandom;
    'wasi:sockets/ip-name-lookup': typeof WasiSocketsIpNameLookup;
    'wasi:sockets/types': typeof WasiSocketsTypes;
}

// Guest exports from cli/command and http/middleware+service worlds
export interface WasiP3Exports {
    'wasi:cli/run'?: typeof WasiCliRun;
    'wasi:http/handler'?: typeof WasiHttpHandler;
}

export type WasiP3 = WasiP3Imports & WasiP3Exports;

// Re-export interface types
export type {
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
    WasiCliRun,
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
