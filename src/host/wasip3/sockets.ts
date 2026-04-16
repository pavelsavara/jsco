// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * WASIp3 Sockets — Browser stubs.
 *
 * All socket operations throw `not-supported` in the browser.
 * Node.js overrides are provided by `node/sockets.ts`.
 */

import type {
    WasiSocketsTypes,
    WasiSocketsIpNameLookup,
} from '../../../wit/wasip3/types/index';

// ──────────────────── Local type aliases ────────────────────

type IpAddressFamily = 'ipv4' | 'ipv6';
type Ipv4Address = [number, number, number, number];
type Ipv6Address = [number, number, number, number, number, number, number, number];
type Ipv6Address = [number, number, number, number, number, number, number, number];
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

// ──────────────────── Error helper ────────────────────

function notSupported(msg?: string): never {
    throw Object.assign(new Error(msg ?? 'sockets are not supported in the browser'), { tag: 'not-supported' } as ErrorCode);
}

// ──────────────────── TcpSocket (browser stub) ────────────────────

class BrowserTcpSocket {
    private constructor() { /* private */ }

    static create(_addressFamily: IpAddressFamily): never {
        return notSupported('TCP sockets are not supported in the browser');
    }

    bind(_localAddress: IpSocketAddress): never { return notSupported(); }
    connect(_remoteAddress: IpSocketAddress): never { return notSupported(); }
    listen(): never { return notSupported(); }
    send(_data: WasiStreamReadable<Uint8Array>): never { return notSupported(); }
    receive(): never { return notSupported(); }
    getLocalAddress(): never { return notSupported(); }
    getRemoteAddress(): never { return notSupported(); }
    getIsListening(): never { return notSupported(); }
    getAddressFamily(): never { return notSupported(); }
    setListenBacklogSize(_value: bigint): never { return notSupported(); }
    getKeepAliveEnabled(): never { return notSupported(); }
    setKeepAliveEnabled(_value: boolean): never { return notSupported(); }
    getKeepAliveIdleTime(): never { return notSupported(); }
    setKeepAliveIdleTime(_value: Duration): never { return notSupported(); }
    getKeepAliveInterval(): never { return notSupported(); }
    setKeepAliveInterval(_value: Duration): never { return notSupported(); }
    getKeepAliveCount(): never { return notSupported(); }
    setKeepAliveCount(_value: number): never { return notSupported(); }
    getHopLimit(): never { return notSupported(); }
    setHopLimit(_value: number): never { return notSupported(); }
    getReceiveBufferSize(): never { return notSupported(); }
    setReceiveBufferSize(_value: bigint): never { return notSupported(); }
    getSendBufferSize(): never { return notSupported(); }
    setSendBufferSize(_value: bigint): never { return notSupported(); }
}

// ──────────────────── UdpSocket (browser stub) ────────────────────

class BrowserUdpSocket {
    private constructor() { /* private */ }

    static create(_addressFamily: IpAddressFamily): never {
        return notSupported('UDP sockets are not supported in the browser');
    }

    bind(_localAddress: IpSocketAddress): never { return notSupported(); }
    connect(_remoteAddress: IpSocketAddress): never { return notSupported(); }
    disconnect(): never { return notSupported(); }
    send(_data: Uint8Array, _remoteAddress: IpSocketAddress | undefined): never { return notSupported(); }
    receive(): never { return notSupported(); }
    getLocalAddress(): never { return notSupported(); }
    getRemoteAddress(): never { return notSupported(); }
    getAddressFamily(): never { return notSupported(); }
    getUnicastHopLimit(): never { return notSupported(); }
    setUnicastHopLimit(_value: number): never { return notSupported(); }
    getReceiveBufferSize(): never { return notSupported(); }
    setReceiveBufferSize(_value: bigint): never { return notSupported(); }
    getSendBufferSize(): never { return notSupported(); }
    setSendBufferSize(_value: bigint): never { return notSupported(); }
}

// ──────────────────── Factory functions ────────────────────

export function createSocketsTypes(): typeof WasiSocketsTypes {
    return {
        TcpSocket: BrowserTcpSocket,
        UdpSocket: BrowserUdpSocket,
    } as unknown as typeof WasiSocketsTypes;
}

export function createIpNameLookup(): typeof WasiSocketsIpNameLookup {
    return {
        async resolveAddresses(_name: string): Promise<never> {
            return notSupported('DNS lookup is not supported in the browser');
        },
    } as unknown as typeof WasiSocketsIpNameLookup;
}
