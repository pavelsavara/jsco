/// <reference path="./wasi-filesystem-types.d.ts" />
declare module 'wasi:filesystem/preopens@0.2.11' {
  export function getDirectories(): Array<[Descriptor, string]>;
  export type Descriptor = import('wasi:filesystem/types@0.2.11').Descriptor;
}
