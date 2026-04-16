/// <reference path="./wasi-sockets-network.d.ts" />
declare module 'wasi:sockets/instance-network@0.2.11' {
  /**
   * Get a handle to the default network.
   */
  export function instanceNetwork(): Network;
  export type Network = import('wasi:sockets/network@0.2.11').Network;
}
