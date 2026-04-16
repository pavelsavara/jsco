/// <reference path="./wasi-io-poll.d.ts" />
/// <reference path="./wasi-sockets-network.d.ts" />
declare module 'wasi:sockets/udp@0.2.11' {
  export type Pollable = import('wasi:io/poll@0.2.11').Pollable;
  export type Network = import('wasi:sockets/network@0.2.11').Network;
  export type ErrorCode = import('wasi:sockets/network@0.2.11').ErrorCode;
  export type IpSocketAddress = import('wasi:sockets/network@0.2.11').IpSocketAddress;
  export type IpAddressFamily = import('wasi:sockets/network@0.2.11').IpAddressFamily;
  export interface IncomingDatagram {
    data: Uint8Array,
    remoteAddress: IpSocketAddress,
  }
  export interface OutgoingDatagram {
    data: Uint8Array,
    remoteAddress?: IpSocketAddress,
  }
  
  export class IncomingDatagramStream implements Disposable {
    /**
     * This type does not have a public constructor.
     */
    private constructor();
    receive(maxResults: bigint): Array<IncomingDatagram>;
    subscribe(): Pollable;
    [Symbol.dispose](): void;
  }
  
  export class OutgoingDatagramStream implements Disposable {
    /**
     * This type does not have a public constructor.
     */
    private constructor();
    checkSend(): bigint;
    send(datagrams: Array<OutgoingDatagram>): bigint;
    subscribe(): Pollable;
    [Symbol.dispose](): void;
  }
  
  export class UdpSocket implements Disposable {
    /**
     * This type does not have a public constructor.
     */
    private constructor();
    startBind(network: Network, localAddress: IpSocketAddress): void;
    finishBind(): void;
    stream(remoteAddress: IpSocketAddress | undefined): [IncomingDatagramStream, OutgoingDatagramStream];
    localAddress(): IpSocketAddress;
    remoteAddress(): IpSocketAddress;
    addressFamily(): IpAddressFamily;
    unicastHopLimit(): number;
    setUnicastHopLimit(value: number): void;
    receiveBufferSize(): bigint;
    setReceiveBufferSize(value: bigint): void;
    sendBufferSize(): bigint;
    setSendBufferSize(value: bigint): void;
    subscribe(): Pollable;
    [Symbol.dispose](): void;
  }
}
