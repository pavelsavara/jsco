// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * WASIp3 Sockets — Node.js implementation.
 *
 * Provides real TCP, UDP and DNS via `node:net`, `node:dgram`, `node:dns`.
 */

import * as net from 'node:net';
import * as dgram from 'node:dgram';
import * as dns from 'node:dns/promises';

import type {
    WasiSocketsTypes,
    WasiSocketsIpNameLookup,
} from '../../../../wit/wasip3/types/index';

// ──────────────────── Local type aliases ────────────────────

type IpAddressFamily = 'ipv4' | 'ipv6';
type Ipv4Address = [number, number, number, number];
type Ipv6Address = [number, number, number, number, number, number, number, number];
type IpAddress = { tag: 'ipv4'; val: Ipv4Address } | { tag: 'ipv6'; val: Ipv6Address };
type IpSocketAddress =
    | { tag: 'ipv4'; val: { port: number; address: Ipv4Address } }
    | { tag: 'ipv6'; val: { port: number; flowInfo: number; address: Ipv6Address; scopeId: number } };
type Duration = bigint;
type ErrorCode =
    | { tag: 'access-denied' }
    | { tag: 'not-supported' }
    | { tag: 'invalid-argument' }
    | { tag: 'out-of-memory' }
    | { tag: 'timeout' }
    | { tag: 'invalid-state' }
    | { tag: 'address-not-bindable' }
    | { tag: 'address-in-use' }
    | { tag: 'remote-unreachable' }
    | { tag: 'connection-refused' }
    | { tag: 'connection-broken' }
    | { tag: 'connection-reset' }
    | { tag: 'connection-aborted' }
    | { tag: 'datagram-too-large' }
    | { tag: 'other'; val: string | undefined };

type WasiStreamReadable<T> = AsyncIterable<T>;
type WasiStreamWritable<T> = AsyncIterable<T> & { push(value: T): void; close(): void };
type WasiFuture<T> = Promise<T>;
type Result<T, E> = { tag: 'ok'; val: T } | { tag: 'err'; val: E };

// ──────────────────── Address helpers ────────────────────

function ipv4ToString(a: Ipv4Address): string {
    return `${a[0]}.${a[1]}.${a[2]}.${a[3]}`;
}

function ipv6ToString(a: Ipv6Address): string {
    return a.map(s => s.toString(16)).join(':');
}

function socketAddressToString(addr: IpSocketAddress): string {
    if (addr.tag === 'ipv4') return ipv4ToString(addr.val.address);
    return ipv6ToString(addr.val.address);
}

function socketAddressPort(addr: IpSocketAddress): number {
    return addr.val.port;
}

function parseIpv4(str: string): Ipv4Address {
    const parts = str.split('.').map(Number);
    return [parts[0]!, parts[1]!, parts[2]!, parts[3]!];
}

function parseIpv6(str: string): Ipv6Address {
    // Handle ::1 and full forms
    const expanded = expandIpv6(str);
    const parts = expanded.split(':').map(s => parseInt(s, 16));
    return [parts[0]!, parts[1]!, parts[2]!, parts[3]!, parts[4]!, parts[5]!, parts[6]!, parts[7]!];
}

function expandIpv6(str: string): string {
    if (!str.includes('::')) return str;
    const [left, right] = str.split('::');
    const leftParts = left ? left.split(':') : [];
    const rightParts = right ? right.split(':') : [];
    const missing = 8 - leftParts.length - rightParts.length;
    const middle = Array(missing).fill('0');
    return [...leftParts, ...middle, ...rightParts].join(':');
}

function nodeAddressToIpSocket(address: string, port: number, family: string | number): IpSocketAddress {
    if (family === 'IPv4' || family === 4 || family === 'ipv4') {
        return { tag: 'ipv4', val: { port, address: parseIpv4(address) } };
    }
    return { tag: 'ipv6', val: { port, flowInfo: 0, address: parseIpv6(address), scopeId: 0 } };
}

function throwError(tag: ErrorCode['tag'], message?: string): never {
    throw Object.assign(new Error(message ?? tag), { tag } as ErrorCode);
}

function mapNodeError(err: NodeJS.ErrnoException): never {
    switch (err.code) {
        case 'EACCES':
        case 'EPERM':
            return throwError('access-denied', err.message);
        case 'EADDRINUSE':
            return throwError('address-in-use', err.message);
        case 'EADDRNOTAVAIL':
            return throwError('address-not-bindable', err.message);
        case 'ECONNREFUSED':
            return throwError('connection-refused', err.message);
        case 'ECONNRESET':
            return throwError('connection-reset', err.message);
        case 'ECONNABORTED':
            return throwError('connection-aborted', err.message);
        case 'EHOSTUNREACH':
        case 'ENETUNREACH':
        case 'ENETDOWN':
            return throwError('remote-unreachable', err.message);
        case 'ETIMEDOUT':
            return throwError('timeout', err.message);
        case 'EINVAL':
            return throwError('invalid-argument', err.message);
        case 'EMSGSIZE':
            return throwError('datagram-too-large', err.message);
        default:
            return throwError('other', err.message);
    }
}

// ──────────────────── TcpSocket (Node.js) ────────────────────

const enum TcpState {
    Created = 0,
    Bound = 1,
    Connected = 2,
    Listening = 3,
    Closed = 4,
}

class NodeTcpSocket {
    private _socket: net.Socket | null = null;
    private _server: net.Server | null = null;
    private _family: IpAddressFamily;
    private _state: TcpState = TcpState.Created;
    private _localAddress: IpSocketAddress | null = null;
    private _remoteAddress: IpSocketAddress | null = null;
    private _backlog = 128n;
    private _keepAliveEnabled = false;
    private _keepAliveIdleTime = 7200_000_000_000n; // 7200s in ns
    private _keepAliveInterval = 75_000_000_000n; // 75s in ns
    private _keepAliveCount = 9;
    private _hopLimit = 64;
    private _receiveBufferSize = 65536n;
    private _sendBufferSize = 65536n;

    private constructor(family: IpAddressFamily) {
        this._family = family;
    }

    static create(addressFamily: IpAddressFamily): NodeTcpSocket {
        return new NodeTcpSocket(addressFamily);
    }

    /** Actually bind the socket by starting a temporary net.Server to claim the port. */
    async bind(localAddress: IpSocketAddress): Promise<void> {
        if (this._state !== TcpState.Created) {
            throwError('invalid-state', 'Socket is already bound or connected');
        }
        const host = socketAddressToString(localAddress);
        const port = socketAddressPort(localAddress);

        // Create a server to perform the actual OS bind and claim the port
        const server = net.createServer();
        this._server = server;

        return new Promise<void>((resolve, reject) => {
            server.listen(port, host, () => {
                const addr = server.address() as net.AddressInfo;
                this._localAddress = nodeAddressToIpSocket(addr.address, addr.port, addr.family);
                this._state = TcpState.Bound;
                resolve();
            });
            server.once('error', (err) => {
                this._server = null;
                try { mapNodeError(err); } catch (e) { reject(e); }
            });
        });
    }

    async connect(remoteAddress: IpSocketAddress): Promise<void> {
        if (this._state !== TcpState.Created && this._state !== TcpState.Bound) {
            throwError('invalid-state', 'Socket is already connected or listening');
        }
        const host = socketAddressToString(remoteAddress);
        const port = socketAddressPort(remoteAddress);

        // If we have a bind server, close it to release the port for the client socket
        const bindAddr = this._localAddress;
        if (this._server) {
            await new Promise<void>(resolve => this._server!.close(() => resolve()));
            this._server = null;
        }

        return new Promise<void>((resolve, reject) => {
            const socket = new net.Socket();
            const options: net.SocketConnectOpts = {
                host,
                port,
                family: this._family === 'ipv4' ? 4 : 6,
            } as net.TcpSocketConnectOpts;
            if (bindAddr) {
                (options as net.TcpSocketConnectOpts).localAddress = socketAddressToString(bindAddr);
                (options as net.TcpSocketConnectOpts).localPort = socketAddressPort(bindAddr);
            }
            socket.connect(options, () => {
                this._socket = socket;
                this._state = TcpState.Connected;
                const addr = socket.address() as net.AddressInfo;
                this._localAddress = nodeAddressToIpSocket(addr.address, addr.port, addr.family);
                this._remoteAddress = remoteAddress;
                resolve();
            });
            socket.on('error', (err) => {
                try { mapNodeError(err); } catch (e) { reject(e); }
            });
        });
    }

    listen(): WasiStreamWritable<NodeTcpSocket> {
        if (this._state !== TcpState.Bound || !this._server) {
            throwError('invalid-state', 'Socket must be bound before listening');
        }
        this._state = TcpState.Listening;

        const family = this._family;
        const server = this._server;

        // Create an async iterable that yields accepted connections
        const pendingConnections: NodeTcpSocket[] = [];
        let resolveNext: ((value: IteratorResult<NodeTcpSocket>) => void) | null = null;
        let closed = false;

        server.on('connection', (socket: net.Socket) => {
            const accepted = new NodeTcpSocket(family);
            accepted._socket = socket;
            accepted._state = TcpState.Connected;
            const localInfo = socket.address() as net.AddressInfo;
            accepted._localAddress = nodeAddressToIpSocket(localInfo.address, localInfo.port, localInfo.family);
            accepted._remoteAddress = nodeAddressToIpSocket(
                socket.remoteAddress!,
                socket.remotePort!,
                socket.remoteFamily!,
            );
            if (resolveNext) {
                const r = resolveNext;
                resolveNext = null;
                r({ value: accepted, done: false });
            } else {
                pendingConnections.push(accepted);
            }
        });

        const stream: WasiStreamWritable<NodeTcpSocket> = {
            push(_value: NodeTcpSocket) { /* server pushes via 'connection' event */ },
            close() {
                closed = true;
                server.close();
                if (resolveNext) {
                    resolveNext({ value: undefined as unknown as NodeTcpSocket, done: true });
                    resolveNext = null;
                }
            },
            [Symbol.asyncIterator]() {
                return {
                    next(): Promise<IteratorResult<NodeTcpSocket>> {
                        if (pendingConnections.length > 0) {
                            return Promise.resolve({ value: pendingConnections.shift()!, done: false });
                        }
                        if (closed) return Promise.resolve({ value: undefined as unknown as NodeTcpSocket, done: true });
                        return new Promise<IteratorResult<NodeTcpSocket>>(resolve => {
                            resolveNext = resolve;
                        });
                    },
                };
            },
        };

        return stream;
    }

    send(data: WasiStreamReadable<Uint8Array>): WasiFuture<void> {
        if (this._state !== TcpState.Connected || !this._socket) {
            throwError('invalid-state', 'Socket is not connected');
        }
        const socket = this._socket;
        return (async () => {
            for await (const chunk of data) {
                await new Promise<void>((resolve, reject) => {
                    socket.write(chunk, (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            }
        })();
    }

    receive(): [WasiStreamWritable<Uint8Array>, WasiFuture<Result<void, ErrorCode>>] {
        if (this._state !== TcpState.Connected || !this._socket) {
            throwError('invalid-state', 'Socket is not connected');
        }
        const socket = this._socket;
        let pushFn: ((value: Uint8Array) => void) | null = null;
        let closeFn: (() => void) | null = null;

        const stream: WasiStreamWritable<Uint8Array> = {
            push(value: Uint8Array) { if (pushFn) pushFn(value); },
            close() { if (closeFn) closeFn(); },
            [Symbol.asyncIterator]() {
                const queue: Uint8Array[] = [];
                let waiting: ((result: IteratorResult<Uint8Array>) => void) | null = null;
                let done = false;

                pushFn = (value: Uint8Array) => {
                    if (waiting) {
                        const w = waiting;
                        waiting = null;
                        w({ value, done: false });
                    } else {
                        queue.push(value);
                    }
                };
                closeFn = () => {
                    done = true;
                    if (waiting) {
                        const w = waiting;
                        waiting = null;
                        w({ value: undefined as unknown as Uint8Array, done: true });
                    }
                };

                return {
                    next(): Promise<IteratorResult<Uint8Array>> {
                        if (queue.length > 0) {
                            return Promise.resolve({ value: queue.shift()!, done: false });
                        }
                        if (done) return Promise.resolve({ value: undefined as unknown as Uint8Array, done: true });
                        return new Promise(resolve => { waiting = resolve; });
                    },
                };
            },
        };

        const future = new Promise<Result<void, ErrorCode>>((resolve) => {
            socket.on('data', (chunk: Buffer) => {
                if (pushFn) pushFn(new Uint8Array(chunk));
            });
            socket.on('end', () => {
                if (closeFn) closeFn();
                resolve({ tag: 'ok', val: undefined });
            });
            socket.on('error', (err: NodeJS.ErrnoException) => {
                if (closeFn) closeFn();
                const tag = mapNodeErrorTag(err);
                resolve({ tag: 'err', val: tag });
            });
        });

        return [stream, future];
    }

    getLocalAddress(): IpSocketAddress {
        if (!this._localAddress) throwError('invalid-state', 'Socket is not bound');
        return this._localAddress;
    }

    getRemoteAddress(): IpSocketAddress {
        if (!this._remoteAddress) throwError('invalid-state', 'Socket is not connected');
        return this._remoteAddress;
    }

    getIsListening(): boolean {
        return this._state === TcpState.Listening;
    }

    getAddressFamily(): IpAddressFamily {
        return this._family;
    }

    setListenBacklogSize(value: bigint): void {
        this._backlog = value;
    }

    getKeepAliveEnabled(): boolean { return this._keepAliveEnabled; }
    setKeepAliveEnabled(value: boolean): void {
        this._keepAliveEnabled = value;
        if (this._socket) this._socket.setKeepAlive(value);
    }

    getKeepAliveIdleTime(): Duration { return this._keepAliveIdleTime; }
    setKeepAliveIdleTime(value: Duration): void { this._keepAliveIdleTime = value; }

    getKeepAliveInterval(): Duration { return this._keepAliveInterval; }
    setKeepAliveInterval(value: Duration): void { this._keepAliveInterval = value; }

    getKeepAliveCount(): number { return this._keepAliveCount; }
    setKeepAliveCount(value: number): void { this._keepAliveCount = value; }

    getHopLimit(): number { return this._hopLimit; }
    setHopLimit(value: number): void {
        if (value === 0) throwError('invalid-argument', 'Hop limit must be 1 or higher');
        this._hopLimit = value;
    }

    getReceiveBufferSize(): bigint { return this._receiveBufferSize; }
    setReceiveBufferSize(value: bigint): void {
        if (value === 0n) throwError('invalid-argument', 'Buffer size must be greater than 0');
        this._receiveBufferSize = value;
    }

    getSendBufferSize(): bigint { return this._sendBufferSize; }
    setSendBufferSize(value: bigint): void {
        if (value === 0n) throwError('invalid-argument', 'Buffer size must be greater than 0');
        this._sendBufferSize = value;
    }
}

// ──────────────────── UdpSocket (Node.js) ────────────────────

const enum UdpState {
    Created = 0,
    Bound = 1,
    Connected = 2,
    Closed = 3,
}

class NodeUdpSocket {
    private _socket: dgram.Socket;
    private _family: IpAddressFamily;
    private _state: UdpState = UdpState.Created;
    private _localAddress: IpSocketAddress | null = null;
    private _remoteAddress: IpSocketAddress | null = null;
    private _unicastHopLimit = 64;
    private _receiveBufferSize = 65536n;
    private _sendBufferSize = 65536n;

    private constructor(family: IpAddressFamily) {
        this._family = family;
        this._socket = dgram.createSocket(family === 'ipv4' ? 'udp4' : 'udp6');
    }

    static create(addressFamily: IpAddressFamily): NodeUdpSocket {
        return new NodeUdpSocket(addressFamily);
    }

    async bind(localAddress: IpSocketAddress): Promise<void> {
        if (this._state !== UdpState.Created) {
            throwError('invalid-state', 'Socket is already bound');
        }
        const host = socketAddressToString(localAddress);
        const port = socketAddressPort(localAddress);

        return new Promise<void>((resolve, reject) => {
            this._socket.bind(port, host, () => {
                this._state = UdpState.Bound;
                const addr = this._socket.address();
                this._localAddress = nodeAddressToIpSocket(addr.address, addr.port, addr.family);
                resolve();
            });
            this._socket.once('error', (err) => {
                try { mapNodeError(err); } catch (e) { reject(e); }
            });
        });
    }

    async connect(remoteAddress: IpSocketAddress): Promise<void> {
        if (this._state !== UdpState.Created && this._state !== UdpState.Bound) {
            throwError('invalid-state', 'Socket is already connected');
        }
        const host = socketAddressToString(remoteAddress);
        const port = socketAddressPort(remoteAddress);

        return new Promise<void>((resolve, reject) => {
            this._socket.connect(port, host, () => {
                if (this._state === UdpState.Created) {
                    this._state = UdpState.Bound;
                }
                this._state = UdpState.Connected;
                this._remoteAddress = remoteAddress;
                if (!this._localAddress) {
                    const addr = this._socket.address();
                    this._localAddress = nodeAddressToIpSocket(addr.address, addr.port, addr.family);
                }
                resolve();
            });
            this._socket.once('error', (err) => {
                try { mapNodeError(err); } catch (e) { reject(e); }
            });
        });
    }

    disconnect(): void {
        if (this._state !== UdpState.Connected) {
            throwError('invalid-state', 'Socket is not connected');
        }
        this._socket.disconnect();
        this._state = UdpState.Bound;
        this._remoteAddress = null;
    }

    async send(data: Uint8Array, remoteAddress: IpSocketAddress | undefined): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const callback = (err: Error | null) => {
                if (err) {
                    try { mapNodeError(err as NodeJS.ErrnoException); } catch (e) { reject(e); }
                } else {
                    resolve();
                }
            };
            if (remoteAddress) {
                const host = socketAddressToString(remoteAddress);
                const port = socketAddressPort(remoteAddress);
                this._socket.send(data, port, host, callback);
            } else {
                this._socket.send(data, callback);
            }
        });
    }

    async receive(): Promise<[Uint8Array, IpSocketAddress]> {
        if (this._state === UdpState.Created) {
            throwError('invalid-state', 'Socket has not been bound');
        }
        return new Promise<[Uint8Array, IpSocketAddress]>((resolve, reject) => {
            this._socket.once('message', (msg: Buffer, rinfo: dgram.RemoteInfo) => {
                const addr = nodeAddressToIpSocket(rinfo.address, rinfo.port, rinfo.family);
                resolve([new Uint8Array(msg), addr]);
            });
            this._socket.once('error', (err) => {
                try { mapNodeError(err); } catch (e) { reject(e); }
            });
        });
    }

    getLocalAddress(): IpSocketAddress {
        if (!this._localAddress) throwError('invalid-state', 'Socket is not bound');
        return this._localAddress;
    }

    getRemoteAddress(): IpSocketAddress {
        if (!this._remoteAddress) throwError('invalid-state', 'Socket is not connected');
        return this._remoteAddress;
    }

    getAddressFamily(): IpAddressFamily {
        return this._family;
    }

    getUnicastHopLimit(): number { return this._unicastHopLimit; }
    setUnicastHopLimit(value: number): void {
        if (value === 0) throwError('invalid-argument', 'TTL value must be 1 or higher');
        this._unicastHopLimit = value;
        this._socket.setTTL(value);
    }

    getReceiveBufferSize(): bigint { return this._receiveBufferSize; }
    setReceiveBufferSize(value: bigint): void {
        if (value === 0n) throwError('invalid-argument', 'Buffer size must be greater than 0');
        this._receiveBufferSize = value;
        this._socket.setRecvBufferSize(Number(value));
    }

    getSendBufferSize(): bigint { return this._sendBufferSize; }
    setSendBufferSize(value: bigint): void {
        if (value === 0n) throwError('invalid-argument', 'Buffer size must be greater than 0');
        this._sendBufferSize = value;
        this._socket.setSendBufferSize(Number(value));
    }

    /** Close the underlying dgram socket. */
    close(): void {
        this._state = UdpState.Closed;
        this._socket.close();
    }
}

// ──────────────────── IP name lookup (Node.js) ────────────────────

async function resolveAddresses(name: string): Promise<IpAddress[]> {
    // If the input is an IP address string, parse and return directly
    if (net.isIPv4(name)) {
        return [{ tag: 'ipv4', val: parseIpv4(name) }];
    }
    if (net.isIPv6(name)) {
        return [{ tag: 'ipv6', val: parseIpv6(name) }];
    }

    try {
        const results = await dns.lookup(name, { all: true });
        if (results.length === 0) {
            throwError('other', `No addresses found for ${name}`);
        }
        return results.map(r => {
            if (r.family === 4) {
                return { tag: 'ipv4' as const, val: parseIpv4(r.address) };
            }
            return { tag: 'ipv6' as const, val: parseIpv6(r.address) };
        });
    } catch (err) {
        if (err && typeof err === 'object' && 'tag' in err) throw err; // re-throw our errors
        const nodeErr = err as NodeJS.ErrnoException;
        switch (nodeErr.code) {
            case 'ENOTFOUND':
            case 'EAI_NONAME':
                throwError('other', `Name unresolvable: ${name}`);
                break;
            case 'EAI_AGAIN':
                throwError('other', `Temporary resolver failure: ${name}`);
                break;
            case 'EAI_FAIL':
                throwError('other', `Permanent resolver failure: ${name}`);
                break;
            default:
                throwError('other', nodeErr.message);
        }
    }
}

// ──────────────────── Error tag mapper (no throw) ────────────────────

function mapNodeErrorTag(err: NodeJS.ErrnoException): ErrorCode {
    switch (err.code) {
        case 'EACCES':
        case 'EPERM':
            return { tag: 'access-denied' };
        case 'EADDRINUSE':
            return { tag: 'address-in-use' };
        case 'EADDRNOTAVAIL':
            return { tag: 'address-not-bindable' };
        case 'ECONNREFUSED':
            return { tag: 'connection-refused' };
        case 'ECONNRESET':
            return { tag: 'connection-reset' };
        case 'ECONNABORTED':
            return { tag: 'connection-aborted' };
        case 'EHOSTUNREACH':
        case 'ENETUNREACH':
        case 'ENETDOWN':
            return { tag: 'remote-unreachable' };
        case 'ETIMEDOUT':
            return { tag: 'timeout' };
        case 'EINVAL':
            return { tag: 'invalid-argument' };
        case 'EMSGSIZE':
            return { tag: 'datagram-too-large' };
        default:
            return { tag: 'other', val: err.message };
    }
}

// ──────────────────── Factory functions ────────────────────

import { flattenResource, TCP_NON_RESULT, UDP_NON_RESULT } from '../sockets';

export function createNodeSocketsTypes(): typeof WasiSocketsTypes {
    return {
        TcpSocket: NodeTcpSocket,
        UdpSocket: NodeUdpSocket,
        ...flattenResource('tcp-socket', NodeTcpSocket as unknown as { prototype: Record<string, unknown>; create?: (...args: unknown[]) => unknown }, TCP_NON_RESULT),
        ...flattenResource('udp-socket', NodeUdpSocket as unknown as { prototype: Record<string, unknown>; create?: (...args: unknown[]) => unknown }, UDP_NON_RESULT),
    } as unknown as typeof WasiSocketsTypes;
}

export function createNodeIpNameLookup(): typeof WasiSocketsIpNameLookup {
    return {
        'resolve-addresses': async (name: string) => {
            try {
                const result = await resolveAddresses(name);
                return { tag: 'ok', val: result };
            } catch (err: any) {
                if (err && typeof err === 'object' && typeof err.tag === 'string') return { tag: 'err', val: err };
                throw err;
            }
        },
        resolveAddresses: async (name: string) => {
            try {
                const result = await resolveAddresses(name);
                return { tag: 'ok', val: result };
            } catch (err: any) {
                if (err && typeof err === 'object' && typeof err.tag === 'string') return { tag: 'err', val: err };
                throw err;
            }
        },
    } as unknown as typeof WasiSocketsIpNameLookup;
}
