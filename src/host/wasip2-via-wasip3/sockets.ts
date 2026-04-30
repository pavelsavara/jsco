// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * wasi:sockets adapter — bridges P3 consolidated sockets to P2's 7 interfaces.
 *
 * P3 consolidates 7 P2 interfaces into 2 (`types` + `ip-name-lookup`).
 * The P2 adapter re-expands them. Browser stubs throw not-supported.
 */

import type { WasiP3Imports } from '../wasip3';
import { ok, err } from '../wasip3';

type SocketErrorCode = string;
type SocketResult<T> = { tag: 'ok'; val: T } | { tag: 'err'; val: SocketErrorCode };
type IpAddressFamily = 'ipv4' | 'ipv6';

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
                // P3 uses static TcpSocket.create(family)
                const TcpSocket = (p3types as Record<string, unknown>)['TcpSocket'] as { create: (family: IpAddressFamily) => unknown };
                if (!TcpSocket || !TcpSocket.create) {
                    return socketErr('not-supported');
                }
                const socket = TcpSocket.create(family);
                return ok(socket);
            } catch {
                return socketErr('not-supported');
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
            } catch {
                return socketErr('not-supported');
            }
        },
    };
}

export function adaptIpNameLookup(p3: WasiP3Imports): { resolveAddresses(_network: unknown, name: string): SocketResult<unknown> } {
    const p3lookup = p3['wasi:sockets/ip-name-lookup'];
    return {
        resolveAddresses(_network: unknown, name: string): SocketResult<unknown> {
            try {
                // P3 resolveAddresses is async and returns list<ip-address>
                // P2 returns a resolve-address-stream resource
                // For browser stubs, this throws not-supported anyway
                const promise = p3lookup.resolveAddresses(name);
                // Wrap as a P2 resolve-address-stream
                return ok(createResolveStream(promise as Promise<unknown[]>));
            } catch {
                return socketErr('not-supported');
            }
        },
    };
}

function createResolveStream(promise: Promise<unknown[]>): { resolveNextAddress(): SocketResult<unknown | undefined>; subscribe(): { ready(): boolean; block(): void } } {
    let addresses: unknown[] | null = null;
    let index = 0;
    let resolved = false;

    promise.then(result => {
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
        subscribe(): { ready(): boolean; block(): void } {
            return {
                ready: (): boolean => resolved,
                block(): void {
                    if (resolved) return;
                    throw new Error('not-supported');
                },
            };
        },
    };
}
