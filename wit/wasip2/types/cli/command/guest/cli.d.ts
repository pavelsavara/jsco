/// <reference path="./interfaces/wasi-cli-environment.d.ts" />
/// <reference path="./interfaces/wasi-cli-exit.d.ts" />
/// <reference path="./interfaces/wasi-cli-run.d.ts" />
/// <reference path="./interfaces/wasi-cli-stderr.d.ts" />
/// <reference path="./interfaces/wasi-cli-stdin.d.ts" />
/// <reference path="./interfaces/wasi-cli-stdout.d.ts" />
/// <reference path="./interfaces/wasi-cli-terminal-input.d.ts" />
/// <reference path="./interfaces/wasi-cli-terminal-output.d.ts" />
/// <reference path="./interfaces/wasi-cli-terminal-stderr.d.ts" />
/// <reference path="./interfaces/wasi-cli-terminal-stdin.d.ts" />
/// <reference path="./interfaces/wasi-cli-terminal-stdout.d.ts" />
/// <reference path="./interfaces/wasi-clocks-monotonic-clock.d.ts" />
/// <reference path="./interfaces/wasi-clocks-timezone.d.ts" />
/// <reference path="./interfaces/wasi-clocks-wall-clock.d.ts" />
/// <reference path="./interfaces/wasi-filesystem-preopens.d.ts" />
/// <reference path="./interfaces/wasi-filesystem-types.d.ts" />
/// <reference path="./interfaces/wasi-io-error.d.ts" />
/// <reference path="./interfaces/wasi-io-poll.d.ts" />
/// <reference path="./interfaces/wasi-io-streams.d.ts" />
/// <reference path="./interfaces/wasi-random-insecure-seed.d.ts" />
/// <reference path="./interfaces/wasi-random-insecure.d.ts" />
/// <reference path="./interfaces/wasi-random-random.d.ts" />
/// <reference path="./interfaces/wasi-sockets-instance-network.d.ts" />
/// <reference path="./interfaces/wasi-sockets-ip-name-lookup.d.ts" />
/// <reference path="./interfaces/wasi-sockets-network.d.ts" />
/// <reference path="./interfaces/wasi-sockets-tcp-create-socket.d.ts" />
/// <reference path="./interfaces/wasi-sockets-tcp.d.ts" />
/// <reference path="./interfaces/wasi-sockets-udp-create-socket.d.ts" />
/// <reference path="./interfaces/wasi-sockets-udp.d.ts" />
declare module 'wasi:cli/command@0.2.11' {
  export type * as WasiCliEnvironment0211 from 'wasi:cli/environment@0.2.11'; // import wasi:cli/environment@0.2.11
  export type * as WasiCliExit0211 from 'wasi:cli/exit@0.2.11'; // import wasi:cli/exit@0.2.11
  export type * as WasiCliStderr0211 from 'wasi:cli/stderr@0.2.11'; // import wasi:cli/stderr@0.2.11
  export type * as WasiCliStdin0211 from 'wasi:cli/stdin@0.2.11'; // import wasi:cli/stdin@0.2.11
  export type * as WasiCliStdout0211 from 'wasi:cli/stdout@0.2.11'; // import wasi:cli/stdout@0.2.11
  export type * as WasiCliTerminalInput0211 from 'wasi:cli/terminal-input@0.2.11'; // import wasi:cli/terminal-input@0.2.11
  export type * as WasiCliTerminalOutput0211 from 'wasi:cli/terminal-output@0.2.11'; // import wasi:cli/terminal-output@0.2.11
  export type * as WasiCliTerminalStderr0211 from 'wasi:cli/terminal-stderr@0.2.11'; // import wasi:cli/terminal-stderr@0.2.11
  export type * as WasiCliTerminalStdin0211 from 'wasi:cli/terminal-stdin@0.2.11'; // import wasi:cli/terminal-stdin@0.2.11
  export type * as WasiCliTerminalStdout0211 from 'wasi:cli/terminal-stdout@0.2.11'; // import wasi:cli/terminal-stdout@0.2.11
  export type * as WasiClocksMonotonicClock0211 from 'wasi:clocks/monotonic-clock@0.2.11'; // import wasi:clocks/monotonic-clock@0.2.11
  export type * as WasiClocksTimezone0211 from 'wasi:clocks/timezone@0.2.11'; // import wasi:clocks/timezone@0.2.11
  export type * as WasiClocksWallClock0211 from 'wasi:clocks/wall-clock@0.2.11'; // import wasi:clocks/wall-clock@0.2.11
  export type * as WasiFilesystemPreopens0211 from 'wasi:filesystem/preopens@0.2.11'; // import wasi:filesystem/preopens@0.2.11
  export type * as WasiFilesystemTypes0211 from 'wasi:filesystem/types@0.2.11'; // import wasi:filesystem/types@0.2.11
  export type * as WasiIoError0211 from 'wasi:io/error@0.2.11'; // import wasi:io/error@0.2.11
  export type * as WasiIoPoll0211 from 'wasi:io/poll@0.2.11'; // import wasi:io/poll@0.2.11
  export type * as WasiIoStreams0211 from 'wasi:io/streams@0.2.11'; // import wasi:io/streams@0.2.11
  export type * as WasiRandomInsecureSeed0211 from 'wasi:random/insecure-seed@0.2.11'; // import wasi:random/insecure-seed@0.2.11
  export type * as WasiRandomInsecure0211 from 'wasi:random/insecure@0.2.11'; // import wasi:random/insecure@0.2.11
  export type * as WasiRandomRandom0211 from 'wasi:random/random@0.2.11'; // import wasi:random/random@0.2.11
  export type * as WasiSocketsInstanceNetwork0211 from 'wasi:sockets/instance-network@0.2.11'; // import wasi:sockets/instance-network@0.2.11
  export type * as WasiSocketsIpNameLookup0211 from 'wasi:sockets/ip-name-lookup@0.2.11'; // import wasi:sockets/ip-name-lookup@0.2.11
  export type * as WasiSocketsNetwork0211 from 'wasi:sockets/network@0.2.11'; // import wasi:sockets/network@0.2.11
  export type * as WasiSocketsTcpCreateSocket0211 from 'wasi:sockets/tcp-create-socket@0.2.11'; // import wasi:sockets/tcp-create-socket@0.2.11
  export type * as WasiSocketsTcp0211 from 'wasi:sockets/tcp@0.2.11'; // import wasi:sockets/tcp@0.2.11
  export type * as WasiSocketsUdpCreateSocket0211 from 'wasi:sockets/udp-create-socket@0.2.11'; // import wasi:sockets/udp-create-socket@0.2.11
  export type * as WasiSocketsUdp0211 from 'wasi:sockets/udp@0.2.11'; // import wasi:sockets/udp@0.2.11
  export * as run from 'wasi:cli/run@0.2.11'; // export wasi:cli/run@0.2.11
}
