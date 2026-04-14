// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * wasi:sockets/* — Node.js + browser implementation
 *
 * On Node.js: TCP sockets via `net` module, UDP via `dgram`, DNS via `dns`.
 * On browser: all socket operations return 'not-supported'.
 *
 * TCP socket lifecycle (WASI spec):
 *   unbound → bind-in-progress → bound → listen-in-progress → listening → accept
 *   unbound → bind-in-progress → bound → connect-in-progress → connected
 *
 * All socket operations are non-blocking. Async completion is exposed via
 * pollable resources backed by JSPI.
 */

import type { Socket as NetSocket, Server as NetServer } from 'node:net';
import type { Socket as DgramSocket } from 'node:dgram';
import { WasiInputStream, WasiOutputStream } from './streams';
import { WasiPollable, createSyncPollable, createAsyncPollable } from './poll';
import type { NetworkConfig } from './types';
import { NETWORK_DEFAULTS } from './types';

// ─── Types ───

/** wasi:sockets/network error-code (string form matching WIT enum) */
export type SocketErrorCode =
    | 'unknown'
    | 'access-denied'
    | 'not-supported'
    | 'invalid-argument'
    | 'out-of-memory'
    | 'timeout'
    | 'concurrency-conflict'
    | 'not-in-progress'
    | 'would-block'
    | 'invalid-state'
    | 'new-socket-limit'
    | 'address-not-bindable'
    | 'address-in-use'
    | 'remote-unreachable'
    | 'connection-refused'
    | 'connection-reset'
    | 'connection-aborted'
    | 'datagram-too-large'
    | 'name-unresolvable'
    | 'temporary-resolver-failure'
    | 'permanent-resolver-failure';

/** wasi:sockets/network ip-address-family */
export type IpAddressFamily = 'ipv4' | 'ipv6';

/** wasi:sockets/network ip-address variant */
export type IpAddress =
    | { tag: 'ipv4'; val: [number, number, number, number] }
    | { tag: 'ipv6'; val: [number, number, number, number, number, number, number, number] };

/** wasi:sockets/network ip-socket-address variant */
export type IpSocketAddress =
    | { tag: 'ipv4'; val: { port: number; address: [number, number, number, number] } }
    | { tag: 'ipv6'; val: { port: number; flowInfo: number; address: [number, number, number, number, number, number, number, number]; scopeId: number } };

/** Socket result type */
export type SocketResult<T> = { tag: 'ok'; val: T } | { tag: 'err'; val: SocketErrorCode };

function socketOk<T>(val: T): SocketResult<T> {
    return { tag: 'ok', val };
}

function socketErr<T>(code: SocketErrorCode = 'not-supported'): SocketResult<T> {
    return { tag: 'err', val: code };
}

/** Map Node.js error codes to WASI socket error codes */
function mapNodeError(err: NodeJS.ErrnoException): SocketErrorCode {
    switch (err.code) {
        case 'EACCES': case 'EPERM': return 'access-denied';
        case 'EADDRINUSE': return 'address-in-use';
        case 'EADDRNOTAVAIL': return 'address-not-bindable';
        case 'ECONNREFUSED': return 'connection-refused';
        case 'ECONNRESET': return 'connection-reset';
        case 'ECONNABORTED': return 'connection-aborted';
        case 'EHOSTUNREACH': case 'ENETUNREACH': case 'ENETDOWN': return 'remote-unreachable';
        case 'ETIMEDOUT': return 'timeout';
        case 'EINVAL': return 'invalid-argument';
        case 'ENOTCONN': return 'invalid-state';
        case 'EMFILE': case 'ENFILE': return 'new-socket-limit';
        case 'EMSGSIZE': return 'datagram-too-large';
        case 'ENOENT': case 'EAI_NONAME': case 'ENOTFOUND': return 'name-unresolvable';
        case 'EAI_AGAIN': return 'temporary-resolver-failure';
        case 'EAI_FAIL': return 'permanent-resolver-failure';
        default: return 'unknown';
    }
}

// ─── Node.js module detection ───

let _nodeNet: typeof import('node:net') | null | undefined;
function getNodeNet(): typeof import('node:net') | null {
    if (_nodeNet === undefined) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
            _nodeNet = require('node:net') as typeof import('node:net');
        } catch {
            _nodeNet = null;
        }
    }
    return _nodeNet;
}

let _nodeDgram: typeof import('node:dgram') | null | undefined;
function getNodeDgram(): typeof import('node:dgram') | null {
    if (_nodeDgram === undefined) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
            _nodeDgram = require('node:dgram') as typeof import('node:dgram');
        } catch {
            _nodeDgram = null;
        }
    }
    return _nodeDgram;
}

let _nodeDns: typeof import('node:dns') | null | undefined;
function getNodeDns(): typeof import('node:dns') | null {
    if (_nodeDns === undefined) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
            _nodeDns = require('node:dns') as typeof import('node:dns');
        } catch {
            _nodeDns = null;
        }
    }
    return _nodeDns;
}

// ─── Address helpers ───

/** Convert IpSocketAddress to Node.js address/port */
function socketAddressToNode(addr: IpSocketAddress): { address: string; port: number; family: 4 | 6 } {
    if (addr.tag === 'ipv4') {
        return {
            address: addr.val.address.join('.'),
            port: addr.val.port,
            family: 4,
        };
    }
    return {
        address: addr.val.address.map(n => n.toString(16)).join(':'),
        port: addr.val.port,
        family: 6,
    };
}

/** Convert Node.js address info to IpSocketAddress */
function nodeToSocketAddress(address: string, port: number, family: string | number): IpSocketAddress {
    if (family === 'IPv6' || family === 6 || family === '6') {
        const parts = parseIpv6(address);
        return {
            tag: 'ipv6',
            val: { port, flowInfo: 0, address: parts, scopeId: 0 },
        };
    }
    const octets = address.split('.').map(Number);
    while (octets.length < 4) octets.push(0);
    return {
        tag: 'ipv4',
        val: { port, address: octets.slice(0, 4) as [number, number, number, number] },
    };
}

/** Parse an IPv6 address string to 8x u16 tuple */
function parseIpv6(addr: string): [number, number, number, number, number, number, number, number] {
    const halves = addr.split('::');
    let parts: number[];
    if (halves.length === 2) {
        const left = halves[0] ? halves[0].split(':').map(s => parseInt(s, 16)) : [];
        const right = halves[1] ? halves[1].split(':').map(s => parseInt(s, 16)) : [];
        const fill = 8 - left.length - right.length;
        parts = [...left, ...new Array<number>(fill).fill(0), ...right];
    } else {
        parts = addr.split(':').map(s => parseInt(s, 16));
    }
    while (parts.length < 8) parts.push(0);
    return parts.slice(0, 8) as [number, number, number, number, number, number, number, number];
}

/** Check if an address is all-zeros */
function isZeroAddress(addr: IpSocketAddress): boolean {
    if (addr.tag === 'ipv4') return addr.val.address.every(b => b === 0);
    return addr.val.address.every(b => b === 0);
}

// ─── Network ───

/** wasi:sockets/network — opaque network resource */
export interface WasiNetwork {
    _tag: 'network';
}

/** Create a network resource */
export function createNetwork(): WasiNetwork {
    return { _tag: 'network' };
}

// ─── Stream factories for TCP sockets ───

/** Create WasiInputStream + WasiOutputStream pair from a connected Node.js socket */
function createStreamsForSocket(sock: NetSocket, bufferLimit: number): [WasiInputStream, WasiOutputStream] {
    const readBuffer: number[] = [];
    let readClosed = false;
    let readResolve: (() => void) | null = null;

    sock.on('data', (chunk: Buffer) => {
        readBuffer.push(...chunk);
        // Apply backpressure when buffer exceeds limit
        if (readBuffer.length >= bufferLimit) {
            sock.pause();
        }
        if (readResolve) { readResolve(); readResolve = null; }
    });
    sock.on('end', () => {
        readClosed = true;
        if (readResolve) { readResolve(); readResolve = null; }
    });
    sock.on('error', () => {
        readClosed = true;
        if (readResolve) { readResolve(); readResolve = null; }
    });

    const inStream: WasiInputStream = {
        read(len: bigint) {
            if (readClosed && readBuffer.length === 0) return { tag: 'err', val: { tag: 'closed' as const } };
            if (readBuffer.length === 0) return { tag: 'ok', val: new Uint8Array(0) };
            const count = Math.min(Number(len), readBuffer.length);
            const bytes = new Uint8Array(readBuffer.splice(0, count));
            // Resume reading when buffer drains below limit
            if (readBuffer.length < bufferLimit) sock.resume();
            return { tag: 'ok', val: bytes };
        },
        blockingRead(len: bigint) {
            if (readBuffer.length > 0 || readClosed) return this.read(len);
            const promise = new Promise<void>(resolve => { readResolve = resolve; });
            const pollable = createAsyncPollable(promise);
            pollable.block();
            return this.read(len);
        },
        skip(len: bigint) {
            if (readClosed && readBuffer.length === 0) return { tag: 'err', val: { tag: 'closed' as const } };
            const count = Math.min(Number(len), readBuffer.length);
            readBuffer.splice(0, count);
            return { tag: 'ok', val: BigInt(count) };
        },
        blockingSkip(len: bigint) { return this.skip(len); },
        subscribe() { return createSyncPollable(() => readBuffer.length > 0 || readClosed); },
    };

    let writeClosed = false;
    const outStream: WasiOutputStream = {
        checkWrite() {
            if (writeClosed) return { tag: 'err', val: { tag: 'closed' as const } };
            return { tag: 'ok', val: 65536n };
        },
        write(contents: Uint8Array) {
            if (writeClosed) return { tag: 'err', val: { tag: 'closed' as const } };
            sock.write(contents);
            return { tag: 'ok', val: undefined };
        },
        blockingWriteAndFlush(contents: Uint8Array) {
            if (writeClosed) return { tag: 'err', val: { tag: 'closed' as const } };
            sock.write(contents);
            return { tag: 'ok', val: undefined };
        },
        flush() {
            if (writeClosed) return { tag: 'err', val: { tag: 'closed' as const } };
            return { tag: 'ok', val: undefined };
        },
        blockingFlush() { return this.flush(); },
        writeZeroes(len: bigint) {
            if (writeClosed) return { tag: 'err', val: { tag: 'closed' as const } };
            sock.write(Buffer.alloc(Number(len)));
            return { tag: 'ok', val: undefined };
        },
        blockingWriteZeroesAndFlush(len: bigint) { return this.writeZeroes(len); },
        subscribe() { return createSyncPollable(() => !writeClosed); },
    };

    sock.on('close', () => { writeClosed = true; });

    return [inStream, outStream];
}

// ─── TCP Socket ───

const enum TcpState {
    Unbound = 0,
    BindInProgress = 1,
    Bound = 2,
    ListenInProgress = 3,
    Listening = 4,
    ConnectInProgress = 5,
    Connected = 6,
    Closed = 7,
}

/** wasi:sockets/tcp — TCP socket resource */
export interface WasiTcpSocket {
    startBind(network: WasiNetwork, localAddress: IpSocketAddress): SocketResult<void>;
    finishBind(): SocketResult<void>;
    startConnect(network: WasiNetwork, remoteAddress: IpSocketAddress): SocketResult<void>;
    finishConnect(): SocketResult<[WasiInputStream, WasiOutputStream]>;
    startListen(): SocketResult<void>;
    finishListen(): SocketResult<void>;
    accept(): SocketResult<[WasiTcpSocket, WasiInputStream, WasiOutputStream]>;
    localAddress(): SocketResult<IpSocketAddress>;
    remoteAddress(): SocketResult<IpSocketAddress>;
    isListening(): boolean;
    addressFamily(): IpAddressFamily;
    setListenBacklogSize(value: bigint): SocketResult<void>;
    keepAliveEnabled(): SocketResult<boolean>;
    setKeepAliveEnabled(value: boolean): SocketResult<void>;
    keepAliveIdleTime(): SocketResult<bigint>;
    setKeepAliveIdleTime(value: bigint): SocketResult<void>;
    keepAliveInterval(): SocketResult<bigint>;
    setKeepAliveInterval(value: bigint): SocketResult<void>;
    keepAliveCount(): SocketResult<number>;
    setKeepAliveCount(value: number): SocketResult<void>;
    hopLimit(): SocketResult<number>;
    setHopLimit(value: number): SocketResult<void>;
    receiveBufferSize(): SocketResult<bigint>;
    setReceiveBufferSize(value: bigint): SocketResult<void>;
    sendBufferSize(): SocketResult<bigint>;
    setSendBufferSize(value: bigint): SocketResult<void>;
    subscribe(): WasiPollable;
    shutdown(shutdownType: string): SocketResult<void>;
}

/** Create a connected WasiTcpSocket wrapping an accepted node socket */
function createConnectedTcpSocket(sock: NetSocket, af: IpAddressFamily, bufferLimit: number): WasiTcpSocket & { _inputStream: WasiInputStream; _outputStream: WasiOutputStream } {
    const [inS, outS] = createStreamsForSocket(sock, bufferLimit);
    const addr = sock.address() as { address: string; port: number; family: string };
    const rAddr = sock.remoteAddress;
    const rPort = sock.remotePort;
    const famStr = af === 'ipv6' ? 'IPv6' : 'IPv4';

    return {
        startBind: () => socketErr('invalid-state'),
        finishBind: () => socketErr('invalid-state'),
        startConnect: () => socketErr('invalid-state'),
        finishConnect: () => socketErr('invalid-state'),
        startListen: () => socketErr('invalid-state'),
        finishListen: () => socketErr('invalid-state'),
        accept: () => socketErr('invalid-state'),
        localAddress: () => socketOk(nodeToSocketAddress(addr.address, addr.port, addr.family)),
        remoteAddress() {
            if (!rAddr || rPort === undefined) return socketErr('invalid-state');
            return socketOk(nodeToSocketAddress(rAddr, rPort, famStr));
        },
        isListening: () => false,
        addressFamily: () => af,
        setListenBacklogSize: () => socketErr('invalid-state'),
        keepAliveEnabled: () => socketOk(false),
        setKeepAliveEnabled(v: boolean) { sock.setKeepAlive(v); return socketOk(undefined); },
        keepAliveIdleTime: () => socketOk(7200_000_000_000n),
        setKeepAliveIdleTime: () => socketOk(undefined),
        keepAliveInterval: () => socketOk(75_000_000_000n),
        setKeepAliveInterval: () => socketOk(undefined),
        keepAliveCount: () => socketOk(9),
        setKeepAliveCount: () => socketOk(undefined),
        hopLimit: () => socketOk(64),
        setHopLimit: () => socketOk(undefined),
        receiveBufferSize: () => socketOk(65536n),
        setReceiveBufferSize: () => socketOk(undefined),
        sendBufferSize: () => socketOk(65536n),
        setSendBufferSize: () => socketOk(undefined),
        subscribe: () => createSyncPollable(() => true),
        shutdown(shutdownType: string) {
            if (shutdownType === 'receive' || shutdownType === 'both') sock.end();
            if (shutdownType === 'send' || shutdownType === 'both') sock.end();
            return socketOk(undefined);
        },
        _inputStream: inS,
        _outputStream: outS,
    };
}

/** Create a TCP socket. On Node.js, creates a real socket. On browser, returns 'not-supported'. */
export function createTcpSocket(addressFamily: IpAddressFamily, networkConfig?: NetworkConfig): SocketResult<WasiTcpSocket> {
    const net = getNodeNet();
    if (!net) return socketErr('not-supported');

    const maxPending = networkConfig?.maxTcpPendingConnections ?? NETWORK_DEFAULTS.maxTcpPendingConnections;
    const idleTimeoutMs = networkConfig?.tcpIdleTimeoutMs ?? NETWORK_DEFAULTS.tcpIdleTimeoutMs;
    const bufferLimit = networkConfig?.socketBufferBytes ?? NETWORK_DEFAULTS.socketBufferBytes;

    let state: TcpState = TcpState.Unbound;
    const family = addressFamily;
    let socket: NetSocket | null = null;
    let server: NetServer | null = null;
    let pendingError: SocketErrorCode | null = null;
    let bindAddress: IpSocketAddress | null = null;
    let connectAddress: IpSocketAddress | null = null;
    let backlogSize = 128;
    let keepAlive = false;
    let keepAliveIdleNs = 7200_000_000_000n;
    let keepAliveIntervalNs = 75_000_000_000n;
    let keepAliveCountVal = 9;
    let hopLimitVal = 64;
    let rcvBufSize = 65536n;
    let sndBufSize = 65536n;
    let asyncReady = false;
    const pendingConnections: NetSocket[] = [];
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    /** Reset the idle timer for a connected socket */
    function resetIdleTimer() {
        if (idleTimer) clearTimeout(idleTimer);
        if (idleTimeoutMs > 0 && socket) {
            idleTimer = setTimeout(() => {
                if (state === TcpState.Connected && socket) {
                    socket.destroy();
                    state = TcpState.Closed;
                }
            }, idleTimeoutMs);
        }
    }


    const tcpSocket: WasiTcpSocket = {
        startBind(_network: WasiNetwork, localAddress: IpSocketAddress): SocketResult<void> {
            if (state !== TcpState.Unbound) return socketErr('invalid-state');
            if ((localAddress.tag === 'ipv4' && family !== 'ipv4') || (localAddress.tag === 'ipv6' && family !== 'ipv6')) {
                return socketErr('invalid-argument');
            }
            bindAddress = localAddress;
            state = TcpState.BindInProgress;
            asyncReady = true;
            return socketOk(undefined);
        },

        finishBind(): SocketResult<void> {
            if (state !== TcpState.BindInProgress) return socketErr('not-in-progress');
            state = TcpState.Bound;
            return socketOk(undefined);
        },

        startConnect(_network: WasiNetwork, remoteAddress: IpSocketAddress): SocketResult<void> {
            if (state === TcpState.Connected || state === TcpState.Listening || state === TcpState.Closed) return socketErr('invalid-state');
            if (state === TcpState.ConnectInProgress) return socketErr('concurrency-conflict');
            if ((remoteAddress.tag === 'ipv4' && family !== 'ipv4') || (remoteAddress.tag === 'ipv6' && family !== 'ipv6')) {
                return socketErr('invalid-argument');
            }
            if (isZeroAddress(remoteAddress)) return socketErr('invalid-argument');
            const addr = socketAddressToNode(remoteAddress);
            if (addr.port === 0) return socketErr('invalid-argument');

            connectAddress = remoteAddress;
            state = TcpState.ConnectInProgress;
            asyncReady = false;
            pendingError = null;

            socket = net!.createConnection({
                host: addr.address,
                port: addr.port,
                family: addr.family,
            });
            socket.on('connect', () => { asyncReady = true; });
            socket.on('error', (err: NodeJS.ErrnoException) => {
                pendingError = mapNodeError(err);
                asyncReady = true;
            });

            return socketOk(undefined);
        },

        finishConnect(): SocketResult<[WasiInputStream, WasiOutputStream]> {
            if (state !== TcpState.ConnectInProgress) return socketErr('not-in-progress');
            if (!asyncReady) return socketErr('would-block');
            if (pendingError) { state = TcpState.Closed; return socketErr(pendingError); }
            state = TcpState.Connected;
            resetIdleTimer();
            const [inS, outS] = createStreamsForSocket(socket!, bufferLimit);
            return socketOk([inS, outS]);
        },

        startListen(): SocketResult<void> {
            if (state !== TcpState.Bound) return socketErr('invalid-state');
            state = TcpState.ListenInProgress;
            asyncReady = false;
            pendingError = null;

            server = net!.createServer();
            server.on('connection', (conn: NetSocket) => {
                // Drop connections that exceed the pending limit
                if (pendingConnections.length >= maxPending) {
                    conn.destroy();
                    return;
                }
                pendingConnections.push(conn);
            });
            server.on('error', (err: NodeJS.ErrnoException) => {
                pendingError = mapNodeError(err);
                asyncReady = true;
            });

            const addr = socketAddressToNode(bindAddress!);
            server.listen({
                host: isZeroAddress(bindAddress!) ? undefined : addr.address,
                port: addr.port,
                backlog: backlogSize,
            }, () => { asyncReady = true; });

            return socketOk(undefined);
        },

        finishListen(): SocketResult<void> {
            if (state !== TcpState.ListenInProgress) return socketErr('not-in-progress');
            if (!asyncReady) return socketErr('would-block');
            if (pendingError) { state = TcpState.Bound; return socketErr(pendingError); }
            state = TcpState.Listening;
            return socketOk(undefined);
        },

        accept(): SocketResult<[WasiTcpSocket, WasiInputStream, WasiOutputStream]> {
            if (state !== TcpState.Listening) return socketErr('invalid-state');
            if (pendingConnections.length === 0) return socketErr('would-block');
            const conn = pendingConnections.shift()!;
            // Set idle timeout on the accepted connection
            if (idleTimeoutMs > 0) {
                conn.setTimeout(idleTimeoutMs, () => { conn.destroy(); });
            }
            const connSocket = createConnectedTcpSocket(conn, family, bufferLimit);
            return socketOk([connSocket, connSocket._inputStream, connSocket._outputStream]);
        },

        localAddress(): SocketResult<IpSocketAddress> {
            if (state < TcpState.Bound) return socketErr('invalid-state');
            if (server) {
                const a = server.address();
                if (a && typeof a === 'object') return socketOk(nodeToSocketAddress(a.address, a.port, a.family ?? (family === 'ipv6' ? 'IPv6' : 'IPv4')));
            }
            if (socket) {
                const a = socket.address() as { address: string; port: number; family: string };
                return socketOk(nodeToSocketAddress(a.address, a.port, a.family));
            }
            if (bindAddress) return socketOk(bindAddress);
            return socketErr('invalid-state');
        },

        remoteAddress(): SocketResult<IpSocketAddress> {
            if (state !== TcpState.Connected) return socketErr('invalid-state');
            if (socket && socket.remoteAddress && socket.remotePort !== undefined) {
                return socketOk(nodeToSocketAddress(socket.remoteAddress, socket.remotePort, family === 'ipv6' ? 'IPv6' : 'IPv4'));
            }
            if (connectAddress) return socketOk(connectAddress);
            return socketErr('invalid-state');
        },

        isListening: () => state === TcpState.Listening,
        addressFamily: () => family,

        setListenBacklogSize(value: bigint): SocketResult<void> {
            if (value === 0n) return socketErr('invalid-argument');
            if (state === TcpState.ConnectInProgress || state === TcpState.Connected) return socketErr('invalid-state');
            backlogSize = Number(value);
            return socketOk(undefined);
        },

        keepAliveEnabled: () => socketOk(keepAlive),
        setKeepAliveEnabled(value: boolean) { keepAlive = value; if (socket) socket.setKeepAlive(value); return socketOk(undefined); },
        keepAliveIdleTime: () => socketOk(keepAliveIdleNs),
        setKeepAliveIdleTime(value: bigint) { if (value === 0n) return socketErr('invalid-argument'); keepAliveIdleNs = value; return socketOk(undefined); },
        keepAliveInterval: () => socketOk(keepAliveIntervalNs),
        setKeepAliveInterval(value: bigint) { if (value === 0n) return socketErr('invalid-argument'); keepAliveIntervalNs = value; return socketOk(undefined); },
        keepAliveCount: () => socketOk(keepAliveCountVal),
        setKeepAliveCount(value: number) { if (value === 0) return socketErr('invalid-argument'); keepAliveCountVal = value; return socketOk(undefined); },
        hopLimit: () => socketOk(hopLimitVal),
        setHopLimit(value: number) { if (value === 0) return socketErr('invalid-argument'); hopLimitVal = value; return socketOk(undefined); },
        receiveBufferSize: () => socketOk(rcvBufSize),
        setReceiveBufferSize(value: bigint) { if (value === 0n) return socketErr('invalid-argument'); rcvBufSize = value; return socketOk(undefined); },
        sendBufferSize: () => socketOk(sndBufSize),
        setSendBufferSize(value: bigint) { if (value === 0n) return socketErr('invalid-argument'); sndBufSize = value; return socketOk(undefined); },

        subscribe(): WasiPollable {
            if (state === TcpState.ConnectInProgress || state === TcpState.ListenInProgress || state === TcpState.BindInProgress) {
                if (asyncReady) return createSyncPollable(() => true);
                return createAsyncPollable(new Promise<void>(resolve => {
                    const check = () => { if (asyncReady) { resolve(); return; } setTimeout(check, 1); };
                    check();
                }));
            }
            if (state === TcpState.Listening) return createSyncPollable(() => pendingConnections.length > 0);
            return createSyncPollable(() => true);
        },

        shutdown(shutdownType: string): SocketResult<void> {
            if (state !== TcpState.Connected) return socketErr('invalid-state');
            if (!socket) return socketErr('invalid-state');
            if (shutdownType === 'receive' || shutdownType === 'both') socket.end();
            if (shutdownType === 'send' || shutdownType === 'both') socket.end();
            return socketOk(undefined);
        },
    };

    return socketOk(tcpSocket);
}

// ─── UDP Socket ───

/** Incoming datagram record */
export interface IncomingDatagram {
    data: Uint8Array;
    remoteAddress: IpSocketAddress;
}

/** Outgoing datagram record */
export interface OutgoingDatagram {
    data: Uint8Array;
    remoteAddress?: IpSocketAddress;
}

/** wasi:sockets/udp incoming-datagram-stream resource */
export interface WasiIncomingDatagramStream {
    receive(maxResults: bigint): SocketResult<IncomingDatagram[]>;
    subscribe(): WasiPollable;
}

/** wasi:sockets/udp outgoing-datagram-stream resource */
export interface WasiOutgoingDatagramStream {
    checkSend(): SocketResult<bigint>;
    send(datagrams: OutgoingDatagram[]): SocketResult<bigint>;
    subscribe(): WasiPollable;
}

const enum UdpState {
    Unbound = 0,
    BindInProgress = 1,
    Bound = 2,
}

/** wasi:sockets/udp — UDP socket resource */
export interface WasiUdpSocket {
    startBind(network: WasiNetwork, localAddress: IpSocketAddress): SocketResult<void>;
    finishBind(): SocketResult<void>;
    stream(remoteAddress: IpSocketAddress | undefined): SocketResult<[WasiIncomingDatagramStream, WasiOutgoingDatagramStream]>;
    localAddress(): SocketResult<IpSocketAddress>;
    remoteAddress(): SocketResult<IpSocketAddress>;
    addressFamily(): IpAddressFamily;
    unicastHopLimit(): SocketResult<number>;
    setUnicastHopLimit(value: number): SocketResult<void>;
    receiveBufferSize(): SocketResult<bigint>;
    setReceiveBufferSize(value: bigint): SocketResult<void>;
    sendBufferSize(): SocketResult<bigint>;
    setSendBufferSize(value: bigint): SocketResult<void>;
    subscribe(): WasiPollable;
}

/** Create a UDP socket. On Node.js, creates a real socket. On browser, returns 'not-supported'. */
export function createUdpSocket(addressFamily: IpAddressFamily, networkConfig?: NetworkConfig): SocketResult<WasiUdpSocket> {
    const dgram = getNodeDgram();
    if (!dgram) return socketErr('not-supported');

    const maxDatagrams = networkConfig?.maxUdpDatagrams ?? NETWORK_DEFAULTS.maxUdpDatagrams;

    const family = addressFamily;
    let state: UdpState = UdpState.Unbound;
    let sock: DgramSocket | null = null;
    let connectedAddress: IpSocketAddress | null = null;
    let asyncReady = false;
    let pendingError: SocketErrorCode | null = null;
    let hopLimit = 64;
    let rcvBufSize = 65536n;
    let sndBufSize = 65536n;
    const incomingBuffer: IncomingDatagram[] = [];

    const udpSocket: WasiUdpSocket = {
        startBind(_network: WasiNetwork, localAddress: IpSocketAddress): SocketResult<void> {
            if (state !== UdpState.Unbound) return socketErr('invalid-state');
            if ((localAddress.tag === 'ipv4' && family !== 'ipv4') || (localAddress.tag === 'ipv6' && family !== 'ipv6')) {
                return socketErr('invalid-argument');
            }
            state = UdpState.BindInProgress;
            asyncReady = false;
            pendingError = null;

            sock = dgram!.createSocket(family === 'ipv6' ? 'udp6' : 'udp4');
            sock.on('error', (err: NodeJS.ErrnoException) => { pendingError = mapNodeError(err); asyncReady = true; });
            sock.on('message', (msg: Buffer, rinfo: { address: string; port: number; family: string }) => {
                // Drop datagrams when buffer is full
                if (incomingBuffer.length >= maxDatagrams) return;
                incomingBuffer.push({
                    data: new Uint8Array(msg),
                    remoteAddress: nodeToSocketAddress(rinfo.address, rinfo.port, rinfo.family),
                });
            });
            const addr = socketAddressToNode(localAddress);
            sock.bind(addr.port, isZeroAddress(localAddress) ? undefined : addr.address, () => { asyncReady = true; });

            return socketOk(undefined);
        },

        finishBind(): SocketResult<void> {
            if (state !== UdpState.BindInProgress) return socketErr('not-in-progress');
            if (!asyncReady) return socketErr('would-block');
            if (pendingError) { state = UdpState.Unbound; return socketErr(pendingError); }
            state = UdpState.Bound;
            return socketOk(undefined);
        },

        stream(remoteAddress: IpSocketAddress | undefined): SocketResult<[WasiIncomingDatagramStream, WasiOutgoingDatagramStream]> {
            if (state !== UdpState.Bound) return socketErr('invalid-state');
            connectedAddress = remoteAddress ?? null;

            const inStream: WasiIncomingDatagramStream = {
                receive(maxResults: bigint): SocketResult<IncomingDatagram[]> {
                    const count = Math.min(Number(maxResults), incomingBuffer.length);
                    return socketOk(incomingBuffer.splice(0, count));
                },
                subscribe() { return createSyncPollable(() => incomingBuffer.length > 0); },
            };

            const outStream: WasiOutgoingDatagramStream = {
                checkSend(): SocketResult<bigint> { return socketOk(64n); },
                send(datagrams: OutgoingDatagram[]): SocketResult<bigint> {
                    let sent = 0;
                    for (const dg of datagrams) {
                        const target = dg.remoteAddress ?? connectedAddress;
                        if (!target) return socketErr('invalid-argument');
                        const tAddr = socketAddressToNode(target);
                        try {
                            sock!.send(dg.data, tAddr.port, tAddr.address);
                            sent++;
                        } catch (e) {
                            if (sent === 0) return socketErr(mapNodeError(e as NodeJS.ErrnoException));
                            break;
                        }
                    }
                    return socketOk(BigInt(sent));
                },
                subscribe() { return createSyncPollable(() => true); },
            };

            return socketOk([inStream, outStream]);
        },

        localAddress(): SocketResult<IpSocketAddress> {
            if (state < UdpState.Bound || !sock) return socketErr('invalid-state');
            const a = sock.address();
            return socketOk(nodeToSocketAddress(a.address, a.port, a.family));
        },

        remoteAddress(): SocketResult<IpSocketAddress> {
            if (!connectedAddress) return socketErr('invalid-state');
            return socketOk(connectedAddress);
        },

        addressFamily: () => family,
        unicastHopLimit: () => socketOk(hopLimit),
        setUnicastHopLimit(value: number) { if (value === 0) return socketErr('invalid-argument'); hopLimit = value; if (sock) sock.setTTL(value); return socketOk(undefined); },
        receiveBufferSize: () => socketOk(rcvBufSize),
        setReceiveBufferSize(value: bigint) { if (value === 0n) return socketErr('invalid-argument'); rcvBufSize = value; if (sock) sock.setRecvBufferSize(Number(value)); return socketOk(undefined); },
        sendBufferSize: () => socketOk(sndBufSize),
        setSendBufferSize(value: bigint) { if (value === 0n) return socketErr('invalid-argument'); sndBufSize = value; if (sock) sock.setSendBufferSize(Number(value)); return socketOk(undefined); },

        subscribe(): WasiPollable {
            if (state === UdpState.BindInProgress) {
                if (asyncReady) return createSyncPollable(() => true);
                return createAsyncPollable(new Promise<void>(resolve => {
                    const check = () => { if (asyncReady) { resolve(); return; } setTimeout(check, 1); };
                    check();
                }));
            }
            return createSyncPollable(() => true);
        },
    };

    return socketOk(udpSocket);
}

// ─── IP Name Lookup ───

/** wasi:sockets/ip-name-lookup — resolve-address-stream resource */
export interface WasiResolveAddressStream {
    resolveNextAddress(): SocketResult<IpAddress | undefined>;
    subscribe(): WasiPollable;
}

// ─── DNS concurrent lookup counter ───
let _activeDnsLookups = 0;

/** Resolve addresses using Node.js dns, or return 'not-supported' on browser */
export function resolveAddresses(_network: WasiNetwork, name: string, networkConfig?: NetworkConfig): SocketResult<WasiResolveAddressStream> {
    const dns = getNodeDns();
    if (!dns) return socketErr('not-supported');
    if (!name || name.length === 0) return socketErr('invalid-argument');

    const maxConcurrent = networkConfig?.maxConcurrentDnsLookups ?? NETWORK_DEFAULTS.maxConcurrentDnsLookups;
    const timeoutMs = networkConfig?.dnsTimeoutMs ?? NETWORK_DEFAULTS.dnsTimeoutMs;

    // Enforce concurrent DNS lookup limit
    if (_activeDnsLookups >= maxConcurrent) return socketErr('temporary-resolver-failure');

    const results: IpAddress[] = [];
    let resolved = false;
    let lookupError: SocketErrorCode | null = null;

    _activeDnsLookups++;

    // Timeout guard
    const timer = setTimeout(() => {
        if (!resolved) {
            resolved = true;
            lookupError = 'timeout';
            _activeDnsLookups--;
        }
    }, timeoutMs);

    dns.lookup(name, { all: true }, (err: NodeJS.ErrnoException | null, addresses?: Array<{ address: string; family: number }>) => {
        if (resolved) return; // timed out already
        clearTimeout(timer);
        _activeDnsLookups--;
        if (err) {
            lookupError = mapNodeError(err);
        } else if (addresses) {
            for (const addr of addresses) {
                if (addr.family === 4) {
                    const parts = addr.address.split('.').map(Number);
                    results.push({ tag: 'ipv4', val: [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 0] });
                } else if (addr.family === 6) {
                    results.push({ tag: 'ipv6', val: parseIpv6(addr.address) });
                }
            }
        }
        resolved = true;
    });

    let cursor = 0;
    return socketOk({
        resolveNextAddress(): SocketResult<IpAddress | undefined> {
            if (!resolved) return socketErr('would-block');
            if (lookupError) return socketErr(lookupError);
            if (cursor >= results.length) return socketOk(undefined);
            return socketOk(results[cursor++]);
        },
        subscribe(): WasiPollable {
            if (resolved) return createSyncPollable(() => true);
            return createAsyncPollable(new Promise<void>(resolve => {
                const check = () => { if (resolved) { resolve(); return; } setTimeout(check, 1); };
                check();
            }));
        },
    });
}

// ─── Instance Network ───

/** wasi:sockets/instance-network — create a network handle */
export function instanceNetwork(): WasiNetwork {
    return createNetwork();
}
