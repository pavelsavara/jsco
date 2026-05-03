// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

/**
 * wasi:sockets adapter — bridges P3 consolidated sockets to P2's 7 interfaces.
 *
 * P3 consolidates 7 P2 interfaces into 2 (`types` + `ip-name-lookup`).
 * The P2 adapter re-expands them. Browser stubs throw not-supported.
 *
 * TCP/UDP methods delegate to the P3 socket object's async methods,
 * bridging the P2 start/finish state machine via pending-operation tracking.
 */

import type { WasiP3Imports } from '../wasip3';
import type { WasiStreamReadable } from '../wasip3';
import { ok, err, createStreamPair } from '../wasip3';
import { createAsyncPollable, createSyncPollable, createDynamicPollable, createInputStreamFromP3, createOutputStreamFromP3 } from './io';
import type { WasiPollable, WasiInputStream, WasiOutputStream } from './io';

type SocketErrorCode = string;
type SocketResult<T> = { tag: 'ok'; val: T } | { tag: 'err'; val: SocketErrorCode };
type IpAddressFamily = 'ipv4' | 'ipv6';
type IpSocketAddress = { tag: string; val: { port: number; address: number[] } };

// ──────────────────── Address validation (P2 sync checks) ────────────────────

function validateRemoteAddress(addr: IpSocketAddress, socketFamily: IpAddressFamily): SocketErrorCode | undefined {
    if (!addr || !addr.val) return 'invalid-argument';
    const a = addr.val.address;
    // Unspecified address
    if (addr.tag === 'ipv4') {
        if (a[0] === 0 && a[1] === 0 && a[2] === 0 && a[3] === 0) return 'invalid-argument';
    } else if (addr.tag === 'ipv6') {
        if (a.every(v => v === 0)) return 'invalid-argument';
    }
    // Port 0
    if (addr.val.port === 0) return 'invalid-argument';
    // Family mismatch
    if (addr.tag !== socketFamily) return 'invalid-argument';
    // IPv4-mapped IPv6
    if (addr.tag === 'ipv6' && a[0] === 0 && a[1] === 0 && a[2] === 0 && a[3] === 0 && a[4] === 0 && a[5] === 0xffff) return 'invalid-argument';
    return undefined;
}

// ──────────────────── P3 socket interface shapes ────────────────────

interface P3TcpSocket {
    bind(addr: IpSocketAddress): Promise<void>;
    connect(addr: IpSocketAddress): Promise<void>;
    listen(): Promise<AsyncIterable<P3TcpSocket>>;
    send(data: AsyncIterable<Uint8Array>): Promise<void>;
    receive(): [{ push(v: Uint8Array): void; close(): void; [Symbol.asyncIterator](): AsyncIterator<Uint8Array>; onReadableDrop?: () => void }, Promise<void>];
    getLocalAddress(): IpSocketAddress;
    getRemoteAddress(): IpSocketAddress;
    getIsListening(): boolean;
    getAddressFamily(): IpAddressFamily;
    setListenBacklogSize(value: bigint): void;
    getKeepAliveEnabled(): boolean;
    setKeepAliveEnabled(value: boolean): void;
    getKeepAliveIdleTime(): bigint;
    setKeepAliveIdleTime(value: bigint): void;
    getKeepAliveInterval(): bigint;
    setKeepAliveInterval(value: bigint): void;
    getKeepAliveCount(): number;
    setKeepAliveCount(value: number): void;
    getHopLimit(): number;
    setHopLimit(value: number): void;
    getReceiveBufferSize(): bigint;
    setReceiveBufferSize(value: bigint): void;
    getSendBufferSize(): bigint;
    setSendBufferSize(value: bigint): void;
    drop(): void;
}

interface P3UdpSocket {
    bind(addr: IpSocketAddress): Promise<void>;
    connect(addr: IpSocketAddress): Promise<void>;
    disconnect(): void;
    send(data: Uint8Array, remoteAddress: IpSocketAddress | undefined): Promise<void>;
    receive(): Promise<[Uint8Array, IpSocketAddress]>;
    getLocalAddress(): IpSocketAddress;
    getRemoteAddress(): IpSocketAddress;
    getAddressFamily(): IpAddressFamily;
    getUnicastHopLimit(): number;
    setUnicastHopLimit(value: number): void;
    getReceiveBufferSize(): bigint;
    setReceiveBufferSize(value: bigint): void;
    getSendBufferSize(): bigint;
    setSendBufferSize(value: bigint): void;
    drop(): void;
}

// ──────────────────── Pending operation tracking ────────────────────

interface PendingOp<T = void> {
    promise: Promise<void>;
    resolved: boolean;
    result?: T;
    error?: unknown;
}

function startOp<T = void>(promise: Promise<T>): PendingOp<T> {
    const op: PendingOp<T> = { promise: null!, resolved: false };
    op.promise = promise.then(
        (val) => { op.resolved = true; op.result = val; },
        (e) => { op.resolved = true; op.error = e; },
    );
    return op;
}

function finishOp<T = void>(op: PendingOp<T> | undefined): SocketResult<T> {
    if (!op) return err('not-in-progress');
    if (!op.resolved) return err('would-block');
    if (op.error !== undefined) return err(extractErrorCode(op.error));
    return ok(op.result as T);
}

function extractErrorCode(e: unknown): string {
    if (e && typeof e === 'object' && 'tag' in e && typeof (e as { tag: unknown }).tag === 'string') {
        return (e as { tag: string }).tag;
    }
    return 'unknown';
}

// ──────────────────── Per-socket adapter state (WeakMap) ────────────────────

interface TcpAdapterState {
    bound?: boolean;
    connected?: boolean;
    pendingBind?: PendingOp;
    pendingConnect?: PendingOp;
    pendingListen?: PendingOp<AsyncIterable<P3TcpSocket>>;
    /** Pending accept — tracks the current `iter.next()` on the listen stream. */
    pendingAccept?: PendingOp<IteratorResult<P3TcpSocket>>;
    listenStream?: AsyncIterator<P3TcpSocket>;
    inputStream?: WasiInputStream;
    outputStream?: WasiOutputStream;
    /** The P3 stream pair used for TCP send — close() sends FIN. */
    sendPair?: { close(): void };
}

const tcpState = new WeakMap<P3TcpSocket, TcpAdapterState>();

function getTcpState(self: P3TcpSocket): TcpAdapterState {
    let s = tcpState.get(self);
    if (!s) { s = {}; tcpState.set(self, s); }
    return s;
}

interface UdpAdapterState {
    bound?: boolean;
    connected?: boolean;
    remoteAddress?: IpSocketAddress;
    pendingBind?: PendingOp;
    /** The datagram streams created by P2 `%stream` call. */
    incomingStream?: IncomingDatagramStream;
    outgoingStream?: OutgoingDatagramStream;
}

const udpState = new WeakMap<P3UdpSocket, UdpAdapterState>();

function getUdpState(self: P3UdpSocket): UdpAdapterState {
    let s = udpState.get(self);
    if (!s) { s = {}; udpState.set(self, s); }
    return s;
}

// ──────────────────── TCP stream setup ────────────────────

function setupTcpStreams(self: P3TcpSocket, state: TcpAdapterState): void {
    if (state.inputStream) return; // already set up

    // Receive: P3 returns [writable-stream, future]
    const [recvStream] = self.receive();
    state.inputStream = createInputStreamFromP3(recvStream as unknown as WasiStreamReadable<Uint8Array>);

    // Send: create a stream pair, feed the readable end to P3 send()
    const pair = createStreamPair<Uint8Array>();
    state.sendPair = pair;
    // Fire and forget — send completes when the stream closes
    self.send(pair.readable);
    state.outputStream = createOutputStreamFromP3(pair);
}

// ──────────────────── Adapt functions ────────────────────

function socketErr<T>(code: SocketErrorCode): SocketResult<T> {
    return err(code);
}

export function adaptInstanceNetwork(): { instanceNetwork(): object } {
    return {
        instanceNetwork(): object {
            return {};
        },
    };
}

export function adaptNetwork(): { networkErrorCode(): undefined } {
    return {
        networkErrorCode(): undefined {
            return undefined;
        },
    };
}

export function adaptTcpCreateSocket(p3: WasiP3Imports): { createTcpSocket(family: IpAddressFamily): SocketResult<unknown> } {
    const p3types = p3['wasi:sockets/types'];
    return {
        createTcpSocket(family: IpAddressFamily): SocketResult<unknown> {
            try {
                const TcpSocket = (p3types as Record<string, unknown>)['TcpSocket'] as { create: (family: IpAddressFamily) => unknown };
                if (!TcpSocket || !TcpSocket.create) {
                    return socketErr('not-supported');
                }
                const socket = TcpSocket.create(family);
                return ok(socket);
            } catch (e) {
                const code = extractErrorCode(e);
                return socketErr(code === 'unknown' ? 'not-supported' : code);
            }
        },
    };
}

export function adaptUdpCreateSocket(p3: WasiP3Imports): { createUdpSocket(family: IpAddressFamily): SocketResult<unknown> } {
    const p3types = p3['wasi:sockets/types'];
    return {
        createUdpSocket(family: IpAddressFamily): SocketResult<unknown> {
            try {
                const UdpSocket = (p3types as Record<string, unknown>)['UdpSocket'] as { create: (family: IpAddressFamily) => unknown };
                if (!UdpSocket || !UdpSocket.create) {
                    return socketErr('not-supported');
                }
                const socket = UdpSocket.create(family);
                return ok(socket);
            } catch (e) {
                const code = extractErrorCode(e);
                return socketErr(code === 'unknown' ? 'not-supported' : code);
            }
        },
    };
}

// ──────────────────── TCP adapter methods ────────────────────

export function adaptTcp(): Record<string, Function> {
    return {
        'start-bind'(self: P3TcpSocket, _network: unknown, localAddress: IpSocketAddress): SocketResult<void> {
            const state = getTcpState(self);
            if (state.bound || state.connected || state.listenStream) return err('invalid-state');
            if (state.pendingBind) return err('concurrency-conflict');
            try {
                state.pendingBind = startOp(self.bind(localAddress));
                return ok(undefined);
            } catch (e) {
                return err(extractErrorCode(e));
            }
        },

        'finish-bind'(self: P3TcpSocket): SocketResult<void> {
            const state = getTcpState(self);
            const result = finishOp(state.pendingBind);
            if (result.tag === 'ok') {
                state.bound = true;
                state.pendingBind = undefined;
            } else if (result.val !== 'would-block') {
                state.pendingBind = undefined;
            }
            return result;
        },

        'start-connect'(self: P3TcpSocket, _network: unknown, remoteAddress: IpSocketAddress): SocketResult<void> {
            const state = getTcpState(self);
            if (state.connected || state.listenStream) return err('invalid-state');
            if (state.pendingConnect) return err('concurrency-conflict');
            try {
                state.pendingConnect = startOp(self.connect(remoteAddress));
                return ok(undefined);
            } catch (e) {
                return err(extractErrorCode(e));
            }
        },

        'finish-connect'(self: P3TcpSocket): SocketResult<[WasiInputStream, WasiOutputStream]> {
            const state = getTcpState(self);
            const result = finishOp(state.pendingConnect);
            if (result.tag === 'err') {
                if (result.val !== 'would-block') state.pendingConnect = undefined;
                return result as SocketResult<[WasiInputStream, WasiOutputStream]>;
            }
            state.pendingConnect = undefined;
            state.connected = true;
            setupTcpStreams(self, state);
            const tuple: [WasiInputStream, WasiOutputStream] = [state.inputStream!, state.outputStream!];
            return ok(tuple);
        },

        'start-listen'(self: P3TcpSocket): SocketResult<void> {
            const state = getTcpState(self);
            // P2 requires explicit bind before listen; disallow if already connected/listening
            if (!state.bound || state.connected || state.listenStream) return err('invalid-state');
            if (state.pendingListen) return err('concurrency-conflict');
            try {
                state.pendingListen = startOp(self.listen());
                return ok(undefined);
            } catch (e) {
                return err(extractErrorCode(e));
            }
        },

        'finish-listen'(self: P3TcpSocket): SocketResult<void> {
            const state = getTcpState(self);
            const result = finishOp(state.pendingListen);
            if (result.tag === 'ok') {
                // Store the listen stream iterator for accept()
                const stream = state.pendingListen!.result!;
                state.listenStream = stream[Symbol.asyncIterator]();
                state.pendingListen = undefined;
                return ok(undefined);
            }
            if (result.tag === 'err' && result.val !== 'would-block') {
                state.pendingListen = undefined;
            }
            return result as SocketResult<void>;
        },

        'accept'(self: P3TcpSocket): SocketResult<[P3TcpSocket, WasiInputStream, WasiOutputStream]> {
            const state = getTcpState(self);
            if (!state.listenStream) return err('invalid-state');

            // Check if a previous accept() already started an iter.next()
            if (state.pendingAccept) {
                if (!state.pendingAccept.resolved) return err('would-block');
                if (state.pendingAccept.error !== undefined) {
                    const code = extractErrorCode(state.pendingAccept.error);
                    state.pendingAccept = undefined;
                    return err(code);
                }
                const iterResult = state.pendingAccept.result;
                state.pendingAccept = undefined;
                if (iterResult && !iterResult.done && iterResult.value) {
                    const accepted = iterResult.value;
                    const acceptedState = getTcpState(accepted);
                    acceptedState.connected = true;
                    setupTcpStreams(accepted, acceptedState);
                    const tuple: [P3TcpSocket, WasiInputStream, WasiOutputStream] = [accepted, acceptedState.inputStream!, acceptedState.outputStream!];
                    return ok(tuple);
                }
                return err('would-block');
            }

            // Start a new accept by pulling from the listen stream
            state.pendingAccept = startOp(state.listenStream.next());
            // Check if it resolved synchronously (unlikely but possible)
            if (state.pendingAccept.resolved && state.pendingAccept.result) {
                const iterResult = state.pendingAccept.result;
                state.pendingAccept = undefined;
                if (!iterResult.done && iterResult.value) {
                    const accepted = iterResult.value;
                    const acceptedState = getTcpState(accepted);
                    acceptedState.connected = true;
                    setupTcpStreams(accepted, acceptedState);
                    const tuple: [P3TcpSocket, WasiInputStream, WasiOutputStream] = [accepted, acceptedState.inputStream!, acceptedState.outputStream!];
                    return ok(tuple);
                }
            }
            return err('would-block');
        },

        'local-address'(self: P3TcpSocket): SocketResult<IpSocketAddress> {
            try { return ok(self.getLocalAddress()); }
            catch (e) { return err(extractErrorCode(e)); }
        },

        'remote-address'(self: P3TcpSocket): SocketResult<IpSocketAddress> {
            try { return ok(self.getRemoteAddress()); }
            catch (e) { return err(extractErrorCode(e)); }
        },

        'is-listening'(self: P3TcpSocket): boolean {
            return self.getIsListening?.() ?? false;
        },

        'address-family'(self: P3TcpSocket): IpAddressFamily {
            return self.getAddressFamily?.() ?? 'ipv4';
        },

        'set-listen-backlog-size'(self: P3TcpSocket, value: bigint): SocketResult<void> {
            try { self.setListenBacklogSize(value); return ok(undefined); }
            catch (e) { return err(extractErrorCode(e)); }
        },

        'keep-alive-enabled'(self: P3TcpSocket): SocketResult<boolean> {
            try { return ok(self.getKeepAliveEnabled()); }
            catch (e) { return err(extractErrorCode(e)); }
        },
        'set-keep-alive-enabled'(self: P3TcpSocket, value: boolean): SocketResult<void> {
            try { self.setKeepAliveEnabled(value); return ok(undefined); }
            catch (e) { return err(extractErrorCode(e)); }
        },
        'keep-alive-idle-time'(self: P3TcpSocket): SocketResult<bigint> {
            try { return ok(self.getKeepAliveIdleTime()); }
            catch (e) { return err(extractErrorCode(e)); }
        },
        'set-keep-alive-idle-time'(self: P3TcpSocket, value: bigint): SocketResult<void> {
            try { self.setKeepAliveIdleTime(value); return ok(undefined); }
            catch (e) { return err(extractErrorCode(e)); }
        },
        'keep-alive-interval'(self: P3TcpSocket): SocketResult<bigint> {
            try { return ok(self.getKeepAliveInterval()); }
            catch (e) { return err(extractErrorCode(e)); }
        },
        'set-keep-alive-interval'(self: P3TcpSocket, value: bigint): SocketResult<void> {
            try { self.setKeepAliveInterval(value); return ok(undefined); }
            catch (e) { return err(extractErrorCode(e)); }
        },
        'keep-alive-count'(self: P3TcpSocket): SocketResult<number> {
            try { return ok(self.getKeepAliveCount()); }
            catch (e) { return err(extractErrorCode(e)); }
        },
        'set-keep-alive-count'(self: P3TcpSocket, value: number): SocketResult<void> {
            try { self.setKeepAliveCount(value); return ok(undefined); }
            catch (e) { return err(extractErrorCode(e)); }
        },
        'hop-limit'(self: P3TcpSocket): SocketResult<number> {
            try { return ok(self.getHopLimit()); }
            catch (e) { return err(extractErrorCode(e)); }
        },
        'set-hop-limit'(self: P3TcpSocket, value: number): SocketResult<void> {
            try { self.setHopLimit(value); return ok(undefined); }
            catch (e) { return err(extractErrorCode(e)); }
        },
        'receive-buffer-size'(self: P3TcpSocket): SocketResult<bigint> {
            try { return ok(self.getReceiveBufferSize()); }
            catch (e) { return err(extractErrorCode(e)); }
        },
        'set-receive-buffer-size'(self: P3TcpSocket, value: bigint): SocketResult<void> {
            try { self.setReceiveBufferSize(value); return ok(undefined); }
            catch (e) { return err(extractErrorCode(e)); }
        },
        'send-buffer-size'(self: P3TcpSocket): SocketResult<bigint> {
            try { return ok(self.getSendBufferSize()); }
            catch (e) { return err(extractErrorCode(e)); }
        },
        'set-send-buffer-size'(self: P3TcpSocket, value: bigint): SocketResult<void> {
            try { self.setSendBufferSize(value); return ok(undefined); }
            catch (e) { return err(extractErrorCode(e)); }
        },

        'shutdown'(self: P3TcpSocket, shutdownType: string): SocketResult<void> {
            const state = getTcpState(self);
            // P2 spec: shutdown is only valid on connected sockets
            if (!state.connected) return err('invalid-state');
            try {
                if (shutdownType === 'receive' || shutdownType === 'both') {
                    // Signal end of read interest — close the input stream so reads return Closed
                    if (state.inputStream) {
                        state.inputStream.close?.();
                    }
                }
                if (shutdownType === 'send' || shutdownType === 'both') {
                    if (state.outputStream) {
                        state.outputStream.close?.();
                    }
                    if (state.sendPair) {
                        state.sendPair.close();
                        state.sendPair = undefined;
                    }
                }
                return ok(undefined);
            } catch (e) {
                return err(extractErrorCode(e));
            }
        },

        'subscribe'(self: P3TcpSocket): WasiPollable {
            const state = getTcpState(self);
            // Return a dynamic pollable that lazily checks the current pending op.
            // The P2 guest may call subscribe() BEFORE start-bind/connect/listen,
            // so we cannot snapshot the pending op at creation time.
            // Also tracks pendingAccept for blocking_accept().
            return createDynamicPollable(
                () => {
                    const pending = state.pendingBind ?? state.pendingConnect ?? state.pendingListen ?? state.pendingAccept;
                    return !pending || pending.resolved;
                },
                () => {
                    const pending = state.pendingBind ?? state.pendingConnect ?? state.pendingListen ?? state.pendingAccept;
                    return pending && !pending.resolved ? pending.promise : undefined;
                },
            );
        },
    };
}

// ──────────────────── UDP adapter types ────────────────────

interface IncomingDatagram {
    data: Uint8Array;
    remoteAddress: IpSocketAddress;
}

interface IncomingDatagramStream {
    socket: P3UdpSocket;
    receive(maxResults: bigint): SocketResult<IncomingDatagram[]>;
    subscribe(): WasiPollable;
}

interface OutgoingDatagramStream {
    socket: P3UdpSocket;
    remoteAddress: IpSocketAddress | undefined;
    checkSend(): SocketResult<bigint>;
    send(datagrams: { data: Uint8Array; remoteAddress?: IpSocketAddress }[]): SocketResult<bigint> | Promise<SocketResult<bigint>>;
    subscribe(): WasiPollable;
}

function createIncomingDatagramStream(socket: P3UdpSocket): IncomingDatagramStream {
    const pending: IncomingDatagram[] = [];
    let receiving = false;
    let pendingPromise: Promise<void> | undefined;
    let closed = false;

    function startReceive(): void {
        if (receiving || closed) return;
        receiving = true;
        const p = socket.receive().then(
            ([data, addr]) => {
                pending.push({ data, remoteAddress: addr });
                receiving = false;
                // Immediately start another receive to accumulate more datagrams
                startReceive();
            },
            () => {
                receiving = false;
                closed = true;
            },
        );
        pendingPromise = p;
    }

    // Start receiving eagerly
    startReceive();

    return {
        socket,
        receive(maxResults: bigint): SocketResult<IncomingDatagram[]> {
            const count = Math.min(Number(maxResults), pending.length);
            const result = pending.splice(0, count);
            return ok(result);
        },
        subscribe(): WasiPollable {
            return createDynamicPollable(
                () => pending.length > 0 || closed,
                () => pendingPromise,
            );
        },
    };
}

function createOutgoingDatagramStream(socket: P3UdpSocket, remoteAddress: IpSocketAddress | undefined, _connectPromise: Promise<void> | undefined): OutgoingDatagramStream {
    return {
        socket,
        remoteAddress,
        checkSend(): SocketResult<bigint> {
            // Always allow sending — no permit tracking needed for the bridge
            return ok(64n);
        },
        send(datagrams: { data: Uint8Array; remoteAddress?: IpSocketAddress }[]): SocketResult<bigint> | Promise<SocketResult<bigint>> {
            const promises: Promise<void>[] = [];
            for (const dg of datagrams) {
                const buf = dg.data instanceof Uint8Array ? dg.data : new Uint8Array(dg.data);
                // When the socket is OS-connected (stream was called with
                // a remote address), pass undefined so P3 send uses the
                // connected destination and Node.js doesn't throw
                // ERR_SOCKET_DGRAM_IS_CONNECTED.
                const addr = this.remoteAddress ? undefined : (dg.remoteAddress ?? undefined);
                promises.push(socket.send(buf, addr));
            }
            // Return a Promise so the lowering trampoline JSPI-blocks until
            // all sends complete.  This ensures packets are actually delivered
            // before the WASM caller proceeds to blocking_receive.
            const count = BigInt(datagrams.length);
            return Promise.all(promises).then(
                () => ok(count),
                () => ok(count), // best effort — report sent even on error
            );
        },
        subscribe(): WasiPollable {
            return createSyncPollable(() => true);
        },
    };
}

// ──────────────────── UDP adapter methods ────────────────────

export function adaptUdp(): Record<string, Function> {
    const udpSocketMethods: Record<string, Function> = {
        'start-bind'(self: P3UdpSocket, _network: unknown, localAddress: IpSocketAddress): SocketResult<void> {
            const state = getUdpState(self);
            if (state.bound) return err('invalid-state');
            if (state.pendingBind) return err('concurrency-conflict');
            try {
                state.pendingBind = startOp(self.bind(localAddress));
                return ok(undefined);
            } catch (e) {
                return err(extractErrorCode(e));
            }
        },

        'finish-bind'(self: P3UdpSocket): SocketResult<void> {
            const state = getUdpState(self);
            const result = finishOp(state.pendingBind);
            if (result.tag === 'ok') {
                state.bound = true;
                state.pendingBind = undefined;
            } else if (result.val !== 'would-block') {
                state.pendingBind = undefined;
            }
            return result;
        },

        'stream'(self: P3UdpSocket, remoteAddress: IpSocketAddress | undefined): SocketResult<[IncomingDatagramStream, OutgoingDatagramStream]> | Promise<SocketResult<[IncomingDatagramStream, OutgoingDatagramStream]>> {
            const state = getUdpState(self);
            // P2 requires explicit bind before stream
            if (!state.bound) return err('invalid-state');

            const buildStreams = (): SocketResult<[IncomingDatagramStream, OutgoingDatagramStream]> => {
                const incoming = createIncomingDatagramStream(self);
                const outgoing = createOutgoingDatagramStream(self, remoteAddress, undefined);
                state.incomingStream = incoming;
                state.outgoingStream = outgoing;
                return ok([incoming, outgoing] as [IncomingDatagramStream, OutgoingDatagramStream]);
            };

            try {
                if (remoteAddress) {
                    // Validate synchronously before calling async P3 connect
                    const addrErr = validateRemoteAddress(remoteAddress, self.getAddressFamily());
                    if (addrErr) return err(addrErr);
                    state.connected = true;
                    state.remoteAddress = remoteAddress;
                    // P3 connect is async — JSPI-block so subsequent stream()
                    // calls see the socket in the correct state.
                    return self.connect(remoteAddress).then(
                        () => buildStreams(),
                        () => {
                            // Connect failed but we already set adapter state;
                            // still build the streams for best-effort compat.
                            return buildStreams();
                        },
                    );
                } else {
                    // P2 %stream(None) = disconnect (or just unconnected mode)
                    if (state.connected) {
                        try { self.disconnect(); } catch { /* best effort */ }
                        state.connected = false;
                        state.remoteAddress = undefined;
                    }
                    return buildStreams();
                }
            } catch (e) {
                return err(extractErrorCode(e));
            }
        },

        'local-address'(self: P3UdpSocket): SocketResult<IpSocketAddress> {
            const state = getUdpState(self);
            if (!state.bound) return err('invalid-state');
            try { return ok(self.getLocalAddress()); }
            catch (e) { return err(extractErrorCode(e)); }
        },

        'remote-address'(self: P3UdpSocket): SocketResult<IpSocketAddress> {
            const state = getUdpState(self);
            if (!state.connected || !state.remoteAddress) return err('invalid-state');
            return ok(state.remoteAddress);
        },

        'address-family'(self: P3UdpSocket): IpAddressFamily {
            return self.getAddressFamily?.() ?? 'ipv4';
        },

        'unicast-hop-limit'(self: P3UdpSocket): SocketResult<number> {
            try { return ok(self.getUnicastHopLimit()); }
            catch (e) { return err(extractErrorCode(e)); }
        },
        'set-unicast-hop-limit'(self: P3UdpSocket, value: number): SocketResult<void> {
            try { self.setUnicastHopLimit(value); return ok(undefined); }
            catch (e) { return err(extractErrorCode(e)); }
        },
        'receive-buffer-size'(self: P3UdpSocket): SocketResult<bigint> {
            try { return ok(self.getReceiveBufferSize()); }
            catch (e) { return err(extractErrorCode(e)); }
        },
        'set-receive-buffer-size'(self: P3UdpSocket, value: bigint): SocketResult<void> {
            try { self.setReceiveBufferSize(value); return ok(undefined); }
            catch (e) { return err(extractErrorCode(e)); }
        },
        'send-buffer-size'(self: P3UdpSocket): SocketResult<bigint> {
            try { return ok(self.getSendBufferSize()); }
            catch (e) { return err(extractErrorCode(e)); }
        },
        'set-send-buffer-size'(self: P3UdpSocket, value: bigint): SocketResult<void> {
            try { self.setSendBufferSize(value); return ok(undefined); }
            catch (e) { return err(extractErrorCode(e)); }
        },

        'subscribe'(self: P3UdpSocket): WasiPollable {
            const state = getUdpState(self);
            return createDynamicPollable(
                () => !state.pendingBind || state.pendingBind.resolved,
                () => state.pendingBind && !state.pendingBind.resolved ? state.pendingBind.promise : undefined,
            );
        },
    };
    return udpSocketMethods;
}

export function adaptIncomingDatagramStream(): Record<string, Function> {
    return {
        'receive'(self: IncomingDatagramStream, maxResults: bigint): SocketResult<IncomingDatagram[]> {
            return self.receive(maxResults);
        },
        'subscribe'(self: IncomingDatagramStream): WasiPollable {
            return self.subscribe();
        },
    };
}

export function adaptOutgoingDatagramStream(): Record<string, Function> {
    return {
        'check-send'(self: OutgoingDatagramStream): SocketResult<bigint> {
            return self.checkSend();
        },
        'send'(self: OutgoingDatagramStream, datagrams: { data: Uint8Array; remoteAddress?: IpSocketAddress }[]): SocketResult<bigint> | Promise<SocketResult<bigint>> {
            return self.send(datagrams);
        },
        'subscribe'(self: OutgoingDatagramStream): WasiPollable {
            return self.subscribe();
        },
    };
}

// ──────────────────── IP name lookup ────────────────────

export function adaptIpNameLookup(p3: WasiP3Imports): { resolveAddresses(_network: unknown, name: string): SocketResult<unknown> } {
    const p3lookup = p3['wasi:sockets/ip-name-lookup'];
    return {
        resolveAddresses(_network: unknown, name: string): SocketResult<unknown> {
            // P2 spec: validate the name synchronously before calling P3
            if (!name || /^\s*$/.test(name)) {
                return socketErr('invalid-argument');
            }
            // Reject names with invalid characters (but allow bracketed IPv6 and bare colons for IPv6)
            if (/[<>&/]/.test(name) || name.includes(' ')) {
                return socketErr('invalid-argument');
            }
            // Reject IP:port patterns like "127.0.0.1:80" or "[::]:80"
            if (/:\d+$/.test(name)) {
                return socketErr('invalid-argument');
            }
            // Reject URLs like "http://example.com/"
            if (/^[a-z]+:\/\//i.test(name)) {
                return socketErr('invalid-argument');
            }
            try {
                const p3Result = p3lookup.resolveAddresses(name);
                // p3Result is a Promise that resolves to {tag:'ok',val:IpAddress[]} or {tag:'err',val:errorObj}
                const promise = (p3Result as unknown as Promise<unknown>).then(
                    (result) => {
                        if (result && typeof result === 'object' && 'tag' in result) {
                            const tagged = result as { tag: string; val: unknown };
                            if (tagged.tag === 'ok') return tagged.val as unknown[];
                            throw tagged.val;
                        }
                        if (Array.isArray(result)) return result;
                        return [result];
                    },
                );
                return ok(createResolveStream(promise));
            } catch (e) {
                if (e && typeof e === 'object' && 'tag' in e) {
                    return socketErr(extractErrorCode(e));
                }
                return socketErr('not-supported');
            }
        },
    };
}

function createResolveStream(promise: Promise<unknown[]>): { resolveNextAddress(): SocketResult<unknown | undefined>; subscribe(): WasiPollable } {
    let addresses: unknown[] | null = null;
    let index = 0;
    let resolved = false;

    const trackingPromise = promise.then(result => {
        addresses = result;
        resolved = true;
    }).catch(() => {
        addresses = [];
        resolved = true;
    });

    return {
        resolveNextAddress(): SocketResult<unknown | undefined> {
            if (!resolved || !addresses) {
                return socketErr('would-block');
            }
            if (index >= addresses.length) {
                return ok(undefined);
            }
            return ok(addresses[index++]);
        },
        subscribe(): WasiPollable {
            if (resolved) return createSyncPollable(() => true);
            return createAsyncPollable(trackingPromise);
        },
    };
}
