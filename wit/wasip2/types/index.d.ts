// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

// cli
import type * as WasiCliEnvironment from './cli/command/host/interfaces/wasi-cli-environment.js';
import type * as WasiCliExit from './cli/command/host/interfaces/wasi-cli-exit.js';
import type * as WasiCliRun from './cli/command/host/interfaces/wasi-cli-run.js';
import type * as WasiCliStderr from './cli/command/host/interfaces/wasi-cli-stderr.js';
import type * as WasiCliStdin from './cli/command/host/interfaces/wasi-cli-stdin.js';
import type * as WasiCliStdout from './cli/command/host/interfaces/wasi-cli-stdout.js';
import type * as WasiCliTerminalInput from './cli/command/host/interfaces/wasi-cli-terminal-input.js';
import type * as WasiCliTerminalOutput from './cli/command/host/interfaces/wasi-cli-terminal-output.js';
import type * as WasiCliTerminalStderr from './cli/command/host/interfaces/wasi-cli-terminal-stderr.js';
import type * as WasiCliTerminalStdin from './cli/command/host/interfaces/wasi-cli-terminal-stdin.js';
import type * as WasiCliTerminalStdout from './cli/command/host/interfaces/wasi-cli-terminal-stdout.js';

// clocks
import type * as WasiClocksMonotonicClock from './cli/command/host/interfaces/wasi-clocks-monotonic-clock.js';
import type * as WasiClocksTimezone from './cli/command/host/interfaces/wasi-clocks-timezone.js';
import type * as WasiClocksWallClock from './cli/command/host/interfaces/wasi-clocks-wall-clock.js';

// filesystem
import type * as WasiFilesystemPreopens from './cli/command/host/interfaces/wasi-filesystem-preopens.js';
import type * as WasiFilesystemTypes from './cli/command/host/interfaces/wasi-filesystem-types.js';

// http
import type * as WasiHttpIncomingHandler from './http/proxy/host/interfaces/wasi-http-incoming-handler.js';
import type * as WasiHttpOutgoingHandler from './http/proxy/host/interfaces/wasi-http-outgoing-handler.js';
import type * as WasiHttpTypes from './http/proxy/host/interfaces/wasi-http-types.js';

// io
import type * as WasiIoError from './cli/command/host/interfaces/wasi-io-error.js';
import type * as WasiIoPoll from './cli/command/host/interfaces/wasi-io-poll.js';
import type * as WasiIoStreams from './cli/command/host/interfaces/wasi-io-streams.js';

// random
import type * as WasiRandomInsecureSeed from './cli/command/host/interfaces/wasi-random-insecure-seed.js';
import type * as WasiRandomInsecure from './cli/command/host/interfaces/wasi-random-insecure.js';
import type * as WasiRandomRandom from './cli/command/host/interfaces/wasi-random-random.js';

// sockets
import type * as WasiSocketsInstanceNetwork from './cli/command/host/interfaces/wasi-sockets-instance-network.js';
import type * as WasiSocketsIpNameLookup from './cli/command/host/interfaces/wasi-sockets-ip-name-lookup.js';
import type * as WasiSocketsNetwork from './cli/command/host/interfaces/wasi-sockets-network.js';
import type * as WasiSocketsTcpCreateSocket from './cli/command/host/interfaces/wasi-sockets-tcp-create-socket.js';
import type * as WasiSocketsTcp from './cli/command/host/interfaces/wasi-sockets-tcp.js';
import type * as WasiSocketsUdpCreateSocket from './cli/command/host/interfaces/wasi-sockets-udp-create-socket.js';
import type * as WasiSocketsUdp from './cli/command/host/interfaces/wasi-sockets-udp.js';

// Merge of all WASIp2 world imports: cli/command, http/proxy
export interface WasiP2Imports {
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
    'wasi:clocks/monotonic-clock': typeof WasiClocksMonotonicClock;
    'wasi:clocks/timezone': typeof WasiClocksTimezone;
    'wasi:clocks/wall-clock': typeof WasiClocksWallClock;
    'wasi:filesystem/preopens': typeof WasiFilesystemPreopens;
    'wasi:filesystem/types': typeof WasiFilesystemTypes;
    'wasi:http/outgoing-handler': typeof WasiHttpOutgoingHandler;
    'wasi:http/types': typeof WasiHttpTypes;
    'wasi:io/error': typeof WasiIoError;
    'wasi:io/poll': typeof WasiIoPoll;
    'wasi:io/streams': typeof WasiIoStreams;
    'wasi:random/insecure-seed': typeof WasiRandomInsecureSeed;
    'wasi:random/insecure': typeof WasiRandomInsecure;
    'wasi:random/random': typeof WasiRandomRandom;
    'wasi:sockets/instance-network': typeof WasiSocketsInstanceNetwork;
    'wasi:sockets/ip-name-lookup': typeof WasiSocketsIpNameLookup;
    'wasi:sockets/network': typeof WasiSocketsNetwork;
    'wasi:sockets/tcp-create-socket': typeof WasiSocketsTcpCreateSocket;
    'wasi:sockets/tcp': typeof WasiSocketsTcp;
    'wasi:sockets/udp-create-socket': typeof WasiSocketsUdpCreateSocket;
    'wasi:sockets/udp': typeof WasiSocketsUdp;
}

// Guest exports from cli/command and http/proxy worlds
export interface WasiP2Exports {
    'wasi:cli/run'?: typeof WasiCliRun;
    'wasi:http/incoming-handler'?: typeof WasiHttpIncomingHandler;
}

export type WasiP2 = WasiP2Imports & WasiP2Exports;

// Re-export interface types
export type {
    WasiCliEnvironment,
    WasiCliExit,
    WasiCliRun,
    WasiCliStderr,
    WasiCliStdin,
    WasiCliStdout,
    WasiCliTerminalInput,
    WasiCliTerminalOutput,
    WasiCliTerminalStderr,
    WasiCliTerminalStdin,
    WasiCliTerminalStdout,
    WasiClocksMonotonicClock,
    WasiClocksTimezone,
    WasiClocksWallClock,
    WasiFilesystemPreopens,
    WasiFilesystemTypes,
    WasiHttpIncomingHandler,
    WasiHttpOutgoingHandler,
    WasiHttpTypes,
    WasiIoError,
    WasiIoPoll,
    WasiIoStreams,
    WasiRandomInsecureSeed,
    WasiRandomInsecure,
    WasiRandomRandom,
    WasiSocketsInstanceNetwork,
    WasiSocketsIpNameLookup,
    WasiSocketsNetwork,
    WasiSocketsTcpCreateSocket,
    WasiSocketsTcp,
    WasiSocketsUdpCreateSocket,
    WasiSocketsUdp,
};
