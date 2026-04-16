/** @module Interface wasi:sockets/tcp@0.2.11 **/
export type InputStream = import('./wasi-io-streams.js').InputStream;
export type OutputStream = import('./wasi-io-streams.js').OutputStream;
export type Pollable = import('./wasi-io-poll.js').Pollable;
export type Duration = import('./wasi-clocks-monotonic-clock.js').Duration;
export type Network = import('./wasi-sockets-network.js').Network;
export type ErrorCode = import('./wasi-sockets-network.js').ErrorCode;
export type IpSocketAddress = import('./wasi-sockets-network.js').IpSocketAddress;
export type IpAddressFamily = import('./wasi-sockets-network.js').IpAddressFamily;
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

export class TcpSocket {
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
}
