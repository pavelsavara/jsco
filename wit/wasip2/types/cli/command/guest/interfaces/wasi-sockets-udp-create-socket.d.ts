/// <reference path="./wasi-sockets-network.d.ts" />
/// <reference path="./wasi-sockets-udp.d.ts" />
declare module 'wasi:sockets/udp-create-socket@0.2.11' {
  export function createUdpSocket(addressFamily: IpAddressFamily): UdpSocket;
  export type Network = import('wasi:sockets/network@0.2.11').Network;
  export type ErrorCode = import('wasi:sockets/network@0.2.11').ErrorCode;
  export type IpAddressFamily = import('wasi:sockets/network@0.2.11').IpAddressFamily;
  export type UdpSocket = import('wasi:sockets/udp@0.2.11').UdpSocket;
}
