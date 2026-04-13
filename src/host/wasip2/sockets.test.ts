// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * Tests for wasi:sockets/* stub implementation
 *
 * All socket operations should fail with 'not-supported' since
 * browsers cannot create raw TCP/UDP sockets.
 */

import {
    createTcpSocket,
    createUdpSocket,
    resolveAddresses,
    createNetwork,
    instanceNetwork,
    IpSocketAddress,
} from './sockets';

const _ipv4Addr: IpSocketAddress = {
    tag: 'ipv4',
    val: { port: 8080, address: [127, 0, 0, 1] },
};

const _ipv6Addr: IpSocketAddress = {
    tag: 'ipv6',
    val: {
        port: 8080,
        flowInfo: 0,
        address: [0, 0, 0, 0, 0, 0, 0, 1],
        scopeId: 0,
    },
};

describe('wasi:sockets/network', () => {
    test('createNetwork returns a network resource', () => {
        const net = createNetwork();
        expect(net._tag).toBe('network');
    });

    test('instanceNetwork returns a network resource', () => {
        const net = instanceNetwork();
        expect(net._tag).toBe('network');
    });
});

describe('wasi:sockets/tcp', () => {
    test('createTcpSocket ipv4 returns not-supported', () => {
        const result = createTcpSocket('ipv4');
        expect(result.tag).toBe('err');
        if (result.tag !== 'err') return;
        expect(result.val).toBe('not-supported');
    });

    test('createTcpSocket ipv6 returns not-supported', () => {
        const result = createTcpSocket('ipv6');
        expect(result.tag).toBe('err');
        if (result.tag !== 'err') return;
        expect(result.val).toBe('not-supported');
    });
});

describe('wasi:sockets/udp', () => {
    test('createUdpSocket ipv4 returns not-supported', () => {
        const result = createUdpSocket('ipv4');
        expect(result.tag).toBe('err');
        if (result.tag !== 'err') return;
        expect(result.val).toBe('not-supported');
    });

    test('createUdpSocket ipv6 returns not-supported', () => {
        const result = createUdpSocket('ipv6');
        expect(result.tag).toBe('err');
        if (result.tag !== 'err') return;
        expect(result.val).toBe('not-supported');
    });
});

describe('wasi:sockets/ip-name-lookup', () => {
    test('resolveAddresses returns not-supported', () => {
        const net = createNetwork();
        const result = resolveAddresses(net, 'example.com');
        expect(result.tag).toBe('err');
        if (result.tag !== 'err') return;
        expect(result.val).toBe('not-supported');
    });

    test('resolveAddresses with empty name returns not-supported', () => {
        const net = createNetwork();
        const result = resolveAddresses(net, '');
        expect(result.tag).toBe('err');
        if (result.tag !== 'err') return;
        expect(result.val).toBe('not-supported');
    });

    test('resolveAddresses with IP address returns not-supported', () => {
        const net = createNetwork();
        const result = resolveAddresses(net, '127.0.0.1');
        expect(result.tag).toBe('err');
        if (result.tag !== 'err') return;
        expect(result.val).toBe('not-supported');
    });
});
