/// <reference path="./wasi-io-poll.d.ts" />
/// <reference path="./wasi-sockets-network.d.ts" />
declare module 'wasi:sockets/ip-name-lookup@0.2.11' {
  export function resolveAddresses(network: Network, name: string): ResolveAddressStream;
  export type Pollable = import('wasi:io/poll@0.2.11').Pollable;
  export type Network = import('wasi:sockets/network@0.2.11').Network;
  export type ErrorCode = import('wasi:sockets/network@0.2.11').ErrorCode;
  export type IpAddress = import('wasi:sockets/network@0.2.11').IpAddress;
  
  export class ResolveAddressStream implements Disposable {
    /**
     * This type does not have a public constructor.
     */
    private constructor();
    resolveNextAddress(): IpAddress | undefined;
    subscribe(): Pollable;
    [Symbol.dispose](): void;
  }
}
