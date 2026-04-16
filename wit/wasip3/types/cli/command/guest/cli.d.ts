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
/// <reference path="./interfaces/wasi-cli-types.d.ts" />
/// <reference path="./interfaces/wasi-clocks-monotonic-clock.d.ts" />
/// <reference path="./interfaces/wasi-clocks-system-clock.d.ts" />
/// <reference path="./interfaces/wasi-clocks-timezone.d.ts" />
/// <reference path="./interfaces/wasi-clocks-types.d.ts" />
/// <reference path="./interfaces/wasi-filesystem-preopens.d.ts" />
/// <reference path="./interfaces/wasi-filesystem-types.d.ts" />
/// <reference path="./interfaces/wasi-random-insecure-seed.d.ts" />
/// <reference path="./interfaces/wasi-random-insecure.d.ts" />
/// <reference path="./interfaces/wasi-random-random.d.ts" />
/// <reference path="./interfaces/wasi-sockets-ip-name-lookup.d.ts" />
/// <reference path="./interfaces/wasi-sockets-types.d.ts" />
declare module 'wasi:cli/command@0.3.0-rc-2026-03-15' {
  export type * as WasiCliEnvironment030Rc20260315 from 'wasi:cli/environment@0.3.0-rc-2026-03-15'; // import wasi:cli/environment@0.3.0-rc-2026-03-15
  export type * as WasiCliExit030Rc20260315 from 'wasi:cli/exit@0.3.0-rc-2026-03-15'; // import wasi:cli/exit@0.3.0-rc-2026-03-15
  export type * as WasiCliStderr030Rc20260315 from 'wasi:cli/stderr@0.3.0-rc-2026-03-15'; // import wasi:cli/stderr@0.3.0-rc-2026-03-15
  export type * as WasiCliStdin030Rc20260315 from 'wasi:cli/stdin@0.3.0-rc-2026-03-15'; // import wasi:cli/stdin@0.3.0-rc-2026-03-15
  export type * as WasiCliStdout030Rc20260315 from 'wasi:cli/stdout@0.3.0-rc-2026-03-15'; // import wasi:cli/stdout@0.3.0-rc-2026-03-15
  export type * as WasiCliTerminalInput030Rc20260315 from 'wasi:cli/terminal-input@0.3.0-rc-2026-03-15'; // import wasi:cli/terminal-input@0.3.0-rc-2026-03-15
  export type * as WasiCliTerminalOutput030Rc20260315 from 'wasi:cli/terminal-output@0.3.0-rc-2026-03-15'; // import wasi:cli/terminal-output@0.3.0-rc-2026-03-15
  export type * as WasiCliTerminalStderr030Rc20260315 from 'wasi:cli/terminal-stderr@0.3.0-rc-2026-03-15'; // import wasi:cli/terminal-stderr@0.3.0-rc-2026-03-15
  export type * as WasiCliTerminalStdin030Rc20260315 from 'wasi:cli/terminal-stdin@0.3.0-rc-2026-03-15'; // import wasi:cli/terminal-stdin@0.3.0-rc-2026-03-15
  export type * as WasiCliTerminalStdout030Rc20260315 from 'wasi:cli/terminal-stdout@0.3.0-rc-2026-03-15'; // import wasi:cli/terminal-stdout@0.3.0-rc-2026-03-15
  export type * as WasiCliTypes030Rc20260315 from 'wasi:cli/types@0.3.0-rc-2026-03-15'; // import wasi:cli/types@0.3.0-rc-2026-03-15
  export type * as WasiClocksMonotonicClock030Rc20260315 from 'wasi:clocks/monotonic-clock@0.3.0-rc-2026-03-15'; // import wasi:clocks/monotonic-clock@0.3.0-rc-2026-03-15
  export type * as WasiClocksSystemClock030Rc20260315 from 'wasi:clocks/system-clock@0.3.0-rc-2026-03-15'; // import wasi:clocks/system-clock@0.3.0-rc-2026-03-15
  export type * as WasiClocksTimezone030Rc20260315 from 'wasi:clocks/timezone@0.3.0-rc-2026-03-15'; // import wasi:clocks/timezone@0.3.0-rc-2026-03-15
  export type * as WasiClocksTypes030Rc20260315 from 'wasi:clocks/types@0.3.0-rc-2026-03-15'; // import wasi:clocks/types@0.3.0-rc-2026-03-15
  export type * as WasiFilesystemPreopens030Rc20260315 from 'wasi:filesystem/preopens@0.3.0-rc-2026-03-15'; // import wasi:filesystem/preopens@0.3.0-rc-2026-03-15
  export type * as WasiFilesystemTypes030Rc20260315 from 'wasi:filesystem/types@0.3.0-rc-2026-03-15'; // import wasi:filesystem/types@0.3.0-rc-2026-03-15
  export type * as WasiRandomInsecureSeed030Rc20260315 from 'wasi:random/insecure-seed@0.3.0-rc-2026-03-15'; // import wasi:random/insecure-seed@0.3.0-rc-2026-03-15
  export type * as WasiRandomInsecure030Rc20260315 from 'wasi:random/insecure@0.3.0-rc-2026-03-15'; // import wasi:random/insecure@0.3.0-rc-2026-03-15
  export type * as WasiRandomRandom030Rc20260315 from 'wasi:random/random@0.3.0-rc-2026-03-15'; // import wasi:random/random@0.3.0-rc-2026-03-15
  export type * as WasiSocketsIpNameLookup030Rc20260315 from 'wasi:sockets/ip-name-lookup@0.3.0-rc-2026-03-15'; // import wasi:sockets/ip-name-lookup@0.3.0-rc-2026-03-15
  export type * as WasiSocketsTypes030Rc20260315 from 'wasi:sockets/types@0.3.0-rc-2026-03-15'; // import wasi:sockets/types@0.3.0-rc-2026-03-15
  export * as run from 'wasi:cli/run@0.3.0-rc-2026-03-15'; // export wasi:cli/run@0.3.0-rc-2026-03-15
}
