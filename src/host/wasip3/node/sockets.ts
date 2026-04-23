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
type WasiStreamWritable<T> = AsyncIterable<T> & { push(value: T): void; close(): void; onReadableDrop?: () => void };
type WasiFuture<T> = Promise<T>;

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

function isUnspecifiedAddress(addr: IpSocketAddress): boolean {
    if (addr.tag === 'ipv4') {
        const a = addr.val.address;
        return a[0] === 0 && a[1] === 0 && a[2] === 0 && a[3] === 0;
    }
    const a = addr.val.address;
    return a[0] === 0 && a[1] === 0 && a[2] === 0 && a[3] === 0 &&
        a[4] === 0 && a[5] === 0 && a[6] === 0 && a[7] === 0;
}

/** Detect IPv4-mapped IPv6 addresses (::ffff:x.x.x.x) */
function isIpv4MappedIpv6(addr: IpSocketAddress): boolean {
    if (addr.tag !== 'ipv6') return false;
    const a = addr.val.address;
    return a[0] === 0 && a[1] === 0 && a[2] === 0 && a[3] === 0 &&
        a[4] === 0 && a[5] === 0xffff;
}

function validateConnectAddress(addr: IpSocketAddress, socketFamily: IpAddressFamily): void {
    if (isUnspecifiedAddress(addr)) {
        throwError('invalid-argument', 'Cannot connect to unspecified address');
    }
    if (addr.val.port === 0) {
        throwError('invalid-argument', 'Cannot connect to port 0');
    }
    if (addr.tag !== socketFamily) {
        throwError('invalid-argument', 'Address family mismatch');
    }
    if (isIpv4MappedIpv6(addr)) {
        throwError('invalid-argument', 'IPv4-mapped IPv6 addresses are not allowed');
    }
    if (isBroadcastAddress(addr) || isMulticastAddress(addr)) {
        throwError('invalid-argument', 'Cannot connect to broadcast or multicast address');
    }
}

function isBroadcastAddress(addr: IpSocketAddress): boolean {
    if (addr.tag !== 'ipv4') return false;
    const a = addr.val.address;
    return a[0] === 255 && a[1] === 255 && a[2] === 255 && a[3] === 255;
}

function isMulticastAddress(addr: IpSocketAddress): boolean {
    if (addr.tag === 'ipv4') {
        return (addr.val.address[0]! & 0xf0) === 224;
    }
    return (addr.val.address[0]! & 0xff00) === 0xff00;
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

/** Pending server-close promises. `bind()` awaits these so the OS port is truly released. */
const pendingServerCloses: Set<Promise<void>> = new Set();

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
    /** Raw Node.js sockets from accepted connections, tracked so drop() can force-close them. */
    private _acceptedRawSockets: net.Socket[] = [];
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
    /** Number of active send/receive operations keeping the socket alive. */
    private _activeOps = 0;
    /** Whether drop() was called while operations are still active. */
    private _dropPending = false;
    /** Whether send() has been called (at most once per connection). */
    private _sendCalled = false;
    /** Whether receive() has been called (at most once per connection). */
    private _receiveCalled = false;

    private constructor(family: IpAddressFamily) {
        this._family = family;
    }

    static create(addressFamily: IpAddressFamily): NodeTcpSocket {
        return new NodeTcpSocket(addressFamily);
    }

    /** Decrement active ops; if drop was deferred, destroy now. */
    private _releaseOp(): void {
        this._activeOps--;
        if (this._activeOps === 0 && this._dropPending) {
            this._destroySocket();
        }
    }

    /** Actually destroy the underlying Node.js socket. */
    private _destroySocket(): void {
        if (this._socket) {
            this._socket.destroy();
            this._socket = null;
        }
    }

    /** Actually bind the socket by starting a temporary net.Server to claim the port. */
    async bind(localAddress: IpSocketAddress): Promise<void> {
        if (this._state !== TcpState.Created) {
            throwError('invalid-state', 'Socket is already bound or connected');
        }
        if (localAddress.tag !== this._family) {
            throwError('invalid-argument', 'Address family mismatch');
        }
        if (isIpv4MappedIpv6(localAddress)) {
            throwError('invalid-argument', 'IPv4-mapped IPv6 addresses are not allowed');
        }
        if (isBroadcastAddress(localAddress) || isMulticastAddress(localAddress)) {
            throwError('invalid-argument', 'Cannot bind to broadcast or multicast address');
        }
        // Wait for any pending server closes so the OS port is truly released.
        if (pendingServerCloses.size > 0) {
            await Promise.all(pendingServerCloses);
        }
        const host = socketAddressToString(localAddress);
        const port = socketAddressPort(localAddress);

        // Create a server to perform the actual OS bind and claim the port
        const server = net.createServer({ allowHalfOpen: true });
        this._server = server;

        return new Promise<void>((resolve, reject) => {
            server.listen({ port, host, backlog: Number(this._backlog), exclusive: false }, () => {
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
        validateConnectAddress(remoteAddress, this._family);
        const host = socketAddressToString(remoteAddress);
        const port = socketAddressPort(remoteAddress);

        // If we have a bind server, close it to release the port for the client socket
        const bindAddr = this._localAddress;
        if (this._server) {
            await new Promise<void>(resolve => this._server!.close(() => resolve()));
            this._server = null;
        }

        return new Promise<void>((resolve, reject) => {
            const socket = new net.Socket({ allowHalfOpen: true });
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

    async listen(): Promise<WasiStreamWritable<NodeTcpSocket>> {
        if (this._state === TcpState.Connected || this._state === TcpState.Listening || this._state === TcpState.Closed) {
            throwError('invalid-state', 'Socket is already connected, listening, or closed');
        }
        // Implicit bind if not yet bound
        if (this._state === TcpState.Created) {
            const unspec: IpSocketAddress = this._family === 'ipv4'
                ? { tag: 'ipv4', val: { port: 0, address: [0, 0, 0, 0] } }
                : { tag: 'ipv6', val: { port: 0, flowInfo: 0, address: [0, 0, 0, 0, 0, 0, 0, 0], scopeId: 0 } };
            await this.bind(unspec);
        }
        this._state = TcpState.Listening;

        const family = this._family;
        const server = this._server!;

        // Create an async iterable that yields accepted connections
        const pendingConnections: NodeTcpSocket[] = [];
        let resolveNext: ((value: IteratorResult<NodeTcpSocket>) => void) | null = null;
        let closed = false;

        server.on('connection', (socket: net.Socket) => {
            this._acceptedRawSockets.push(socket);
            const accepted = new NodeTcpSocket(family);
            accepted._socket = socket;
            accepted._state = TcpState.Connected;
            // Inherit socket options from the listener
            accepted._keepAliveEnabled = this._keepAliveEnabled;
            accepted._keepAliveIdleTime = this._keepAliveIdleTime;
            accepted._keepAliveInterval = this._keepAliveInterval;
            accepted._keepAliveCount = this._keepAliveCount;
            accepted._hopLimit = this._hopLimit;
            accepted._receiveBufferSize = this._receiveBufferSize;
            accepted._sendBufferSize = this._sendBufferSize;
            // Apply keep-alive to the actual socket
            if (this._keepAliveEnabled) {
                socket.setKeepAlive(true);
            }
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
        if (this._sendCalled) {
            // Close the input stream so the guest sees DROPPED on writes
            const iter = data[Symbol.asyncIterator]();
            if (iter.return) iter.return();
            return Promise.reject({ tag: 'invalid-state' } as ErrorCode);
        }
        this._sendCalled = true;
        const socket = this._socket;
        this._activeOps++;
        // Track socket errors so we can abort the iteration
        let socketError: ErrorCode | undefined;
        const onError = (err: NodeJS.ErrnoException) => {
            socketError = mapNodeErrorTag(err);
        };
        socket.on('error', onError);

        return (async () => {
            try {
                const iter = data[Symbol.asyncIterator]();
                try {
                    let done = false;
                    while (!done) {
                        const result = await iter.next();
                        if (result.done) { done = true; break; }
                        if (socketError) throw socketError;
                        await new Promise<void>((resolve, reject) => {
                            socket.write(result.value, (err) => {
                                if (err) reject(err);
                                else resolve();
                            });
                        });
                        if (socketError) throw socketError;
                    }
                } finally {
                    // Close the iterator (and the stream entry) when we're done
                    if (iter.return) iter.return();
                }
                if (socketError) throw socketError;
                // Half-close: send FIN so the remote's receive sees closure.
                // Per WIT spec: "closing the stream causes a FIN packet to be
                // sent out." The 'finish' event may never fire if the remote
                // destroys the connection first (RST), so also resolve on
                // 'error' or 'close'.
                await new Promise<void>((resolve) => {
                    let resolved = false;
                    const done = () => { if (!resolved) { resolved = true; resolve(); } };
                    socket.once('error', done);
                    socket.once('close', done);
                    socket.end(done);
                });
                // When the own handle was dropped, the socket will be destroyed
                // via _releaseOp → _destroySocket when all ops complete.
            } catch (err) {
                // Prefer socket-level error (connection-broken/reset) over write-level error
                if (socketError) throw socketError;
                if (err && typeof (err as ErrorCode).tag === 'string') throw err;
                const nodeErr = err as NodeJS.ErrnoException;
                if (nodeErr && typeof nodeErr.code === 'string') {
                    throw mapNodeErrorTag(nodeErr);
                }
                throw err;
            } finally {
                socket.removeListener('error', onError);
                this._releaseOp();
            }
        })();
    }

    receive(): [WasiStreamWritable<Uint8Array>, WasiFuture<void>] {
        if (this._state !== TcpState.Connected || !this._socket) {
            throwError('invalid-state', 'Socket is not connected');
        }
        if (this._receiveCalled) {
            // Return a closed stream and a rejected future
            const closedStream: WasiStreamWritable<Uint8Array> = {
                push() { /* no-op */ },
                close() { /* no-op */ },
                async *[Symbol.asyncIterator]() { /* immediately done */ },
            };
            return [closedStream, Promise.reject({ tag: 'invalid-state' } as ErrorCode)];
        }
        this._receiveCalled = true;
        const socket = this._socket;
        let pushFn: ((value: Uint8Array) => void) | null = null;
        let closeFn: (() => void) | null = null;
        this._activeOps++;

        const stream: WasiStreamWritable<Uint8Array> = {
            push(value: Uint8Array) { if (pushFn) pushFn(value); },
            close() { if (closeFn) closeFn(); },
            // onReadableDrop is set on the stream object; addReadable() captures
            // it into the stream entry so dropReadable() can invoke it.
            onReadableDrop: undefined,
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

        const releaseOnce = (() => {
            let released = false;
            return () => { if (!released) { released = true; this._releaseOp(); } };
        })();

        const future = new Promise<void>((resolve, reject) => {
            // When the WASM drops the receive stream reader, the receive
            // future should resolve. Per WIT spec: "Dropping the stream
            // should've caused the future to resolve."
            stream.onReadableDrop = () => {
                if (closeFn) closeFn();
                releaseOnce();
                resolve(undefined);
            };
            socket.on('data', (chunk: Buffer) => {
                if (pushFn) pushFn(new Uint8Array(chunk));
            });
            socket.on('end', () => {
                if (closeFn) closeFn();
                releaseOnce();
                resolve(undefined);
            });
            socket.on('error', (err: NodeJS.ErrnoException) => {
                if (closeFn) closeFn();
                releaseOnce();
                reject(mapNodeErrorTag(err));
            });
            socket.on('close', () => {
                // 'close' fires after 'end' or 'error'. Only release the op
                // (let the socket be destroyed when _dropPending). Do NOT call
                // closeFn — the stream should only close on 'end' or 'error'.
                releaseOnce();
                resolve(undefined);
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
        if (value === 0n) throwError('invalid-argument', 'Backlog size must be greater than 0');
        this._backlog = value;
    }

    getKeepAliveEnabled(): boolean { return this._keepAliveEnabled; }
    setKeepAliveEnabled(value: boolean): void {
        this._keepAliveEnabled = value;
        if (this._socket) this._socket.setKeepAlive(value);
    }

    getKeepAliveIdleTime(): Duration { return this._keepAliveIdleTime; }
    setKeepAliveIdleTime(value: Duration): void {
        if (value === 0n) throwError('invalid-argument', 'Keep-alive idle time must be greater than 0');
        // Clamp to minimum 1 second (OS minimum)
        const SECOND = 1_000_000_000n;
        this._keepAliveIdleTime = value < SECOND ? SECOND : value;
    }

    getKeepAliveInterval(): Duration { return this._keepAliveInterval; }
    setKeepAliveInterval(value: Duration): void {
        if (value === 0n) throwError('invalid-argument', 'Keep-alive interval must be greater than 0');
        // Clamp to minimum 1 second (OS minimum)
        const SECOND = 1_000_000_000n;
        this._keepAliveInterval = value < SECOND ? SECOND : value;
    }

    getKeepAliveCount(): number { return this._keepAliveCount; }
    setKeepAliveCount(value: number): void {
        if (value === 0) throwError('invalid-argument', 'Keep-alive count must be greater than 0');
        this._keepAliveCount = value;
    }

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

    drop(): void {

        this._state = TcpState.Closed;
        // Do NOT destroy accepted connections — per the WIT spec, client
        // sockets returned by listen are independent and their send/receive
        // streams remain functional after the listener is dropped.
        this._acceptedRawSockets = [];
        if (this._server) {
            const server = this._server;
            // server.close() stops accepting new connections immediately.
            // The listening port is released when close() is called, so
            // resolve the promise now rather than waiting for all connections
            // to end (which may never happen without force-destroying them).
            server.close();
            const p = Promise.resolve();
            pendingServerCloses.add(p);
            p.then(() => { pendingServerCloses.delete(p); });
            this._server = null;
        }
        if (this._activeOps > 0) {
            // Defer socket destruction until active send/receive operations complete.
            this._dropPending = true;
        } else {
            this._destroySocket();
        }
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
    private _pendingOptions: (() => void)[] = [];

    private constructor(family: IpAddressFamily) {
        this._family = family;
        this._socket = dgram.createSocket(family === 'ipv4' ? 'udp4' : 'udp6');
    }

    static create(addressFamily: IpAddressFamily): NodeUdpSocket {
        return new NodeUdpSocket(addressFamily);
    }

    /** Apply deferred socket options once the socket has an fd (after bind). */
    private _applyPendingOptions(): void {
        for (const apply of this._pendingOptions) apply();
        this._pendingOptions = [];
    }

    private async _implicitBind(): Promise<void> {
        const unspec: IpSocketAddress = this._family === 'ipv4'
            ? { tag: 'ipv4', val: { port: 0, address: [0, 0, 0, 0] } }
            : { tag: 'ipv6', val: { port: 0, flowInfo: 0, address: [0, 0, 0, 0, 0, 0, 0, 0], scopeId: 0 } };
        await this.bind(unspec);
    }

    async bind(localAddress: IpSocketAddress): Promise<void> {
        if (this._state !== UdpState.Created) {
            throwError('invalid-state', 'Socket is already bound');
        }
        if (localAddress.tag !== this._family) {
            throwError('invalid-argument', 'Address family mismatch');
        }
        if (isIpv4MappedIpv6(localAddress)) {
            throwError('invalid-argument', 'IPv4-mapped IPv6 addresses are not allowed');
        }
        const host = socketAddressToString(localAddress);
        const port = socketAddressPort(localAddress);

        return new Promise<void>((resolve, reject) => {
            this._socket.bind(port, host, () => {
                this._state = UdpState.Bound;
                const addr = this._socket.address();
                this._localAddress = nodeAddressToIpSocket(addr.address, addr.port, addr.family);
                this._applyPendingOptions();
                resolve();
            });
            this._socket.once('error', (err) => {
                try { mapNodeError(err); } catch (e) { reject(e); }
            });
        });
    }

    async connect(remoteAddress: IpSocketAddress): Promise<void> {
        if (this._state === UdpState.Closed) {
            throwError('invalid-state', 'Socket is closed');
        }
        validateConnectAddress(remoteAddress, this._family);
        // Implicit bind if not yet bound
        if (this._state === UdpState.Created) {
            await this._implicitBind();
        }
        // Disconnect first if already connected (reconnect)
        if (this._state === UdpState.Connected) {
            this._socket.disconnect();
            this._state = UdpState.Bound;
            this._remoteAddress = null;
        }
        const host = socketAddressToString(remoteAddress);
        const port = socketAddressPort(remoteAddress);

        return new Promise<void>((resolve, reject) => {
            this._socket.connect(port, host, () => {
                this._state = UdpState.Connected;
                this._remoteAddress = remoteAddress;
                // Always update local address after connect — the OS may assign a specific
                // interface address (e.g. 127.0.0.1) instead of the wildcard (0.0.0.0).
                const addr = this._socket.address();
                this._localAddress = nodeAddressToIpSocket(addr.address, addr.port, addr.family);
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
        // Refresh local address after disconnect — it may revert to wildcard
        const addr = this._socket.address();
        this._localAddress = nodeAddressToIpSocket(addr.address, addr.port, addr.family);
    }

    async send(data: Uint8Array, remoteAddress: IpSocketAddress | undefined): Promise<void> {
        // Sending without a remote address on an unconnected socket is invalid
        if (!remoteAddress && this._state !== UdpState.Connected) {
            throwError('invalid-argument', 'Remote address required for unconnected socket');
        }
        // Implicit bind if not yet bound
        if (this._state === UdpState.Created) {
            await this._implicitBind();
        }
        // list<u8> may arrive as a plain Array from the component model
        const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
        return new Promise<void>((resolve, reject) => {
            const callback = (err: Error | null) => {
                if (err) {
                    try { mapNodeError(err as NodeJS.ErrnoException); } catch (e) { reject(e); }
                } else {
                    resolve();
                }
            };
            if (this._state === UdpState.Connected) {
                // Node.js does not allow specifying a destination on a connected socket.
                // WASI allows it — just send to the connected address.
                this._socket.send(buf, callback);
            } else if (remoteAddress) {
                const host = socketAddressToString(remoteAddress);
                const port = socketAddressPort(remoteAddress);
                this._socket.send(buf, port, host, callback);
            } else {
                this._socket.send(buf, callback);
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
        if (this._state !== UdpState.Created) {
            this._socket.setTTL(value);
        } else {
            this._pendingOptions.push(() => this._socket.setTTL(value));
        }
    }

    getReceiveBufferSize(): bigint { return this._receiveBufferSize; }
    setReceiveBufferSize(value: bigint): void {
        if (value === 0n) throwError('invalid-argument', 'Buffer size must be greater than 0');
        this._receiveBufferSize = value;
        if (this._state !== UdpState.Created) {
            this._socket.setRecvBufferSize(Number(value));
        } else {
            this._pendingOptions.push(() => this._socket.setRecvBufferSize(Number(value)));
        }
    }

    getSendBufferSize(): bigint { return this._sendBufferSize; }
    setSendBufferSize(value: bigint): void {
        if (value === 0n) throwError('invalid-argument', 'Buffer size must be greater than 0');
        this._sendBufferSize = value;
        if (this._state !== UdpState.Created) {
            this._socket.setSendBufferSize(Number(value));
        } else {
            this._pendingOptions.push(() => this._socket.setSendBufferSize(Number(value)));
        }
    }

    /** Close the underlying dgram socket. */
    close(): void {
        this._state = UdpState.Closed;
        this._socket.close();
    }

    drop(): void {
        if (this._state !== UdpState.Closed) {
            this.close();
        }
    }
}

// ──────────────────── IP name lookup (Node.js) ────────────────────

type DnsErrorCode =
    | { tag: 'access-denied' }
    | { tag: 'invalid-argument' }
    | { tag: 'name-unresolvable' }
    | { tag: 'temporary-resolver-failure' }
    | { tag: 'permanent-resolver-failure' }
    | { tag: 'other'; val: string | undefined };

function throwDnsError(tag: DnsErrorCode['tag'], message?: string): never {
    throw Object.assign(new Error(message ?? tag), { tag } as DnsErrorCode);
}

async function resolveAddresses(name: string): Promise<IpAddress[]> {
    // Reject empty or whitespace-only input before any other checks
    if (!name || /^\s*$/.test(name)) {
        throwDnsError('invalid-argument', `Invalid domain name: ${name}`);
    }

    // If the input is an IP address string, parse and return directly
    if (net.isIPv4(name)) {
        return [{ tag: 'ipv4', val: parseIpv4(name) }];
    }
    if (net.isIPv6(name)) {
        return [{ tag: 'ipv6', val: parseIpv6(name) }];
    }
    // Handle bracketed IPv6 notation: [::1] → ::1
    if (name.startsWith('[') && name.endsWith(']')) {
        const inner = name.slice(1, -1);
        if (net.isIPv6(inner)) {
            return [{ tag: 'ipv6', val: parseIpv6(inner) }];
        }
        // Brackets but not valid IPv6 (e.g. "[::]:80" wouldn't match since it has :80)
        throwDnsError('invalid-argument', `Invalid domain name: ${name}`);
    }

    // Validate domain names: reject IP:port, URLs, and names with invalid chars
    if (/[[\]<>&:/]/.test(name) || name.includes(' ')) {
        throwDnsError('invalid-argument', `Invalid domain name: ${name}`);
    }

    try {
        const results = await dns.lookup(name, { all: true });
        if (results.length === 0) {
            throwDnsError('name-unresolvable', `No addresses found for ${name}`);
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
                throwDnsError('name-unresolvable', `Name unresolvable: ${name}`);
                break;
            case 'EAI_AGAIN':
                throwDnsError('temporary-resolver-failure', `Temporary resolver failure: ${name}`);
                break;
            case 'EAI_FAIL':
                throwDnsError('permanent-resolver-failure', `Permanent resolver failure: ${name}`);
                break;
            default:
                throwDnsError('other', nodeErr.message);
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
            // On Windows, ECONNABORTED is the equivalent of EPIPE
            // (connection no longer writable). Map to connection-broken
            // per the WIT spec: "EPIPE, ECONNABORTED on Windows".
            return { tag: 'connection-broken' };
        case 'EPIPE':
            return { tag: 'connection-broken' };
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
