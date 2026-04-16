/// <reference path="./wasi-io-streams.d.ts" />
declare module 'wasi:cli/stdin@0.2.11' {
  export function getStdin(): InputStream;
  export type InputStream = import('wasi:io/streams@0.2.11').InputStream;
}
