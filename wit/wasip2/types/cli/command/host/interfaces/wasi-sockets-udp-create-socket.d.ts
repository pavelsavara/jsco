/** @module Interface wasi:sockets/udp-create-socket@0.2.11 **/
export function createUdpSocket(addressFamily: IpAddressFamily): UdpSocket;
export type Network = import('./wasi-sockets-network.js').Network;
export type ErrorCode = import('./wasi-sockets-network.js').ErrorCode;
export type IpAddressFamily = import('./wasi-sockets-network.js').IpAddressFamily;
export type UdpSocket = import('./wasi-sockets-udp.js').UdpSocket;
