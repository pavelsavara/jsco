/**
 * wasi:sockets/* — Stub implementation
 *
 * Browsers cannot create raw TCP/UDP sockets. All socket operations
 * return 'not-supported' error. This satisfies the WASI interface
 * contract so components that import sockets can still load (they
 * just can't use them).
 */

// ─── Types ───

/** wasi:sockets/network error-code */
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

function socketErr<T>(code: SocketErrorCode = 'not-supported'): SocketResult<T> {
    return { tag: 'err', val: code };
}

// ─── Network ───

/** wasi:sockets/network — opaque network resource (stub) */
export interface WasiNetwork {
    /** Stub — no-op */
    _tag: 'network';
}

/** Create a stub network resource */
export function createNetwork(): WasiNetwork {
    return { _tag: 'network' };
}

// ─── TCP ───

/** wasi:sockets/tcp — stub TCP socket */
export interface WasiTcpSocket {
    startBind(network: WasiNetwork, localAddress: IpSocketAddress): SocketResult<void>;
    finishBind(): SocketResult<void>;
    startConnect(network: WasiNetwork, remoteAddress: IpSocketAddress): SocketResult<void>;
    finishConnect(): SocketResult<[any, any]>;
    startListen(): SocketResult<void>;
    finishListen(): SocketResult<void>;
    accept(): SocketResult<[any, any, any]>;
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
    shutdown(shutdownType: string): SocketResult<void>;
}

/** Create a TCP socket (always fails — browsers don't support raw sockets) */
export function createTcpSocket(_addressFamily: IpAddressFamily): SocketResult<WasiTcpSocket> {
    return socketErr('not-supported');
}

// ─── UDP ───

/** wasi:sockets/udp — stub UDP socket */
export interface WasiUdpSocket {
    startBind(network: WasiNetwork, localAddress: IpSocketAddress): SocketResult<void>;
    finishBind(): SocketResult<void>;
    stream(remoteAddress: IpSocketAddress | undefined): SocketResult<[any, any]>;
    localAddress(): SocketResult<IpSocketAddress>;
    remoteAddress(): SocketResult<IpSocketAddress>;
    addressFamily(): IpAddressFamily;
    unicastHopLimit(): SocketResult<number>;
    setUnicastHopLimit(value: number): SocketResult<void>;
    receiveBufferSize(): SocketResult<bigint>;
    setReceiveBufferSize(value: bigint): SocketResult<void>;
    sendBufferSize(): SocketResult<bigint>;
    setSendBufferSize(value: bigint): SocketResult<void>;
}

/** Create a UDP socket (always fails — browsers don't support raw sockets) */
export function createUdpSocket(_addressFamily: IpAddressFamily): SocketResult<WasiUdpSocket> {
    return socketErr('not-supported');
}

// ─── IP Name Lookup ───

/** wasi:sockets/ip-name-lookup — resolve-address-stream resource */
export interface WasiResolveAddressStream {
    resolveNextAddress(): SocketResult<IpAddress | undefined>;
}

/** Resolve addresses (always fails — browsers use fetch, not raw DNS) */
export function resolveAddresses(_network: WasiNetwork, _name: string): SocketResult<WasiResolveAddressStream> {
    return socketErr('not-supported');
}

// ─── Instance Network ───

/** wasi:sockets/instance-network — create a network handle */
export function instanceNetwork(): WasiNetwork {
    return createNetwork();
}
