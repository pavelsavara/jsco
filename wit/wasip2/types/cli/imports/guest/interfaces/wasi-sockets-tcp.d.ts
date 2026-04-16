/// <reference path="./wasi-clocks-monotonic-clock.d.ts" />
/// <reference path="./wasi-io-poll.d.ts" />
/// <reference path="./wasi-io-streams.d.ts" />
/// <reference path="./wasi-sockets-network.d.ts" />
declare module 'wasi:sockets/tcp@0.2.11' {
  export type InputStream = import('wasi:io/streams@0.2.11').InputStream;
  export type OutputStream = import('wasi:io/streams@0.2.11').OutputStream;
  export type Pollable = import('wasi:io/poll@0.2.11').Pollable;
  export type Duration = import('wasi:clocks/monotonic-clock@0.2.11').Duration;
  export type Network = import('wasi:sockets/network@0.2.11').Network;
  export type ErrorCode = import('wasi:sockets/network@0.2.11').ErrorCode;
  export type IpSocketAddress = import('wasi:sockets/network@0.2.11').IpSocketAddress;
  export type IpAddressFamily = import('wasi:sockets/network@0.2.11').IpAddressFamily;
  /**
   * # Variants
   * 
   * ## `"receive"`
   * 
   * ## `"send"`
   * 
   * ## `"both"`
   */
  export type ShutdownType = 'receive' | 'send' | 'both';
  
  export class TcpSocket implements Disposable {
    /**
     * This type does not have a public constructor.
     */
    private constructor();
    startBind(network: Network, localAddress: IpSocketAddress): void;
    finishBind(): void;
    startConnect(network: Network, remoteAddress: IpSocketAddress): void;
    finishConnect(): [InputStream, OutputStream];
    startListen(): void;
    finishListen(): void;
    accept(): [TcpSocket, InputStream, OutputStream];
    localAddress(): IpSocketAddress;
    remoteAddress(): IpSocketAddress;
    isListening(): boolean;
    addressFamily(): IpAddressFamily;
    setListenBacklogSize(value: bigint): void;
    keepAliveEnabled(): boolean;
    setKeepAliveEnabled(value: boolean): void;
    keepAliveIdleTime(): Duration;
    setKeepAliveIdleTime(value: Duration): void;
    keepAliveInterval(): Duration;
    setKeepAliveInterval(value: Duration): void;
    keepAliveCount(): number;
    setKeepAliveCount(value: number): void;
    hopLimit(): number;
    setHopLimit(value: number): void;
    receiveBufferSize(): bigint;
    setReceiveBufferSize(value: bigint): void;
    sendBufferSize(): bigint;
    setSendBufferSize(value: bigint): void;
    subscribe(): Pollable;
    shutdown(shutdownType: ShutdownType): void;
    [Symbol.dispose](): void;
  }
}
