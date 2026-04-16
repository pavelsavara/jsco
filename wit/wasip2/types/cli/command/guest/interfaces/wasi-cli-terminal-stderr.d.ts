/// <reference path="./wasi-cli-terminal-output.d.ts" />
declare module 'wasi:cli/terminal-stderr@0.2.11' {
  /**
   * If stderr is connected to a terminal, return a `terminal-output` handle
   * allowing further interaction with it.
   */
  export function getTerminalStderr(): TerminalOutput | undefined;
  export type TerminalOutput = import('wasi:cli/terminal-output@0.2.11').TerminalOutput;
}
