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

// ──────────────────── Resource flattening ────────────────────

function camelToKebab(str: string): string {
    return str.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}

/**
 * Wrap a function call so that success → `{tag:'ok', val}` and thrown
 * ErrorCode objects → `{tag:'err', val}`. Handles async (Promise) returns.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
function wrapResultCall(target: any, method: string, ...args: any[]): any {
    try {
        const res = target[method](...args);
        if (res instanceof Promise) {
            return res.then(
                (val: any) => ({ tag: 'ok', val }),
                (err: any) => {
                    if (err && typeof err === 'object' && typeof err.tag === 'string') return { tag: 'err', val: err };
                    throw err;
                },
            );
        }
        return { tag: 'ok', val: res };
    } catch (err: any) {
        if (err && typeof err === 'object' && typeof err.tag === 'string') return { tag: 'err', val: err };
        throw err;
    }
}

/**
 * Flatten a resource class into a `[method]`/`[static]`/`[resource-drop]` table.
 *
 * The component model expects imports like `[method]tcp-socket.send` as flat
 * function entries. This helper introspects a class prototype and generates
 * those entries so the resolver can find them.
 *
 * Methods whose WIT return type is `result<T, E>` are auto-wrapped: success
 * returns `{tag:'ok', val}`, thrown ErrorCode objects return `{tag:'err', val}`.
 * Methods listed in `nonResultMethods` (kebab-case) are passed through as-is.
 */
export function flattenResource(
    name: string,
    cls: { prototype: Record<string, unknown>; create?: (...args: unknown[]) => unknown },
    nonResultMethods?: ReadonlySet<string>,
): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    // Register the class itself under the kebab-case resource name for type alias resolution
    result[name] = cls;
    if (typeof cls.create === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        result[`[static]${name}.create`] = (...args: any[]) => wrapResultCall(cls, 'create', ...args);
    }
    for (const key of Object.getOwnPropertyNames(cls.prototype)) {
        if (key === 'constructor') continue;
        if (typeof cls.prototype[key] !== 'function') continue;
        const kebab = camelToKebab(key);
        if (nonResultMethods?.has(kebab)) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            result[`[method]${name}.${kebab}`] = (self: any, ...args: any[]) => self[key](...args);
        } else {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            result[`[method]${name}.${kebab}`] = (self: any, ...args: any[]) => wrapResultCall(self, key, ...args);
        }
    }
    result[`[resource-drop]${name}`] = (self: any) => { if (self && typeof self.drop === 'function') self.drop(); };
    return result;
}

// ──────────────────── Factory functions ────────────────────

// Methods whose return type is NOT result<T, E>
export const TCP_NON_RESULT = new Set(['get-is-listening', 'get-address-family', 'receive', 'send']);
export const UDP_NON_RESULT = new Set(['get-address-family']);

/**
 * Create the `wasi:sockets/types` interface (browser stub).
 *
 * Both `TcpSocket.create()` and `UdpSocket.create()` throw `not-supported`.
 * On Node.js, this is replaced by real implementations from `node/sockets.ts`.
 */
export function createSocketsTypes(): typeof WasiSocketsTypes {
    return {
        TcpSocket: BrowserTcpSocket,
        UdpSocket: BrowserUdpSocket,
        ...flattenResource('tcp-socket', BrowserTcpSocket as unknown as { prototype: Record<string, unknown>; create?: (...args: unknown[]) => unknown }, TCP_NON_RESULT),
        ...flattenResource('udp-socket', BrowserUdpSocket as unknown as { prototype: Record<string, unknown>; create?: (...args: unknown[]) => unknown }, UDP_NON_RESULT),
    } as unknown as typeof WasiSocketsTypes;
}

/**
 * Create the `wasi:sockets/ip-name-lookup` interface (browser stub).
 *
 * DNS lookup is not available in the browser. Throws `not-supported`.
 * On Node.js, this is replaced by real DNS lookup from `node/sockets.ts`.
 */
export function createIpNameLookup(): typeof WasiSocketsIpNameLookup {
    return {
        async resolveAddresses(_name: string): Promise<never> {
            return notSupported('DNS lookup is not supported in the browser');
        },
    } as unknown as typeof WasiSocketsIpNameLookup;
}
