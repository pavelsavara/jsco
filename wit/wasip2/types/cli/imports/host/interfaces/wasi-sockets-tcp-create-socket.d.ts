/** @module Interface wasi:sockets/tcp-create-socket@0.2.11 **/
export function createTcpSocket(addressFamily: IpAddressFamily): TcpSocket;
export type Network = import('./wasi-sockets-network.js').Network;
export type ErrorCode = import('./wasi-sockets-network.js').ErrorCode;
export type IpAddressFamily = import('./wasi-sockets-network.js').IpAddressFamily;
export type TcpSocket = import('./wasi-sockets-tcp.js').TcpSocket;
