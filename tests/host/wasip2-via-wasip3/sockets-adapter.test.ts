// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

/**
 * Unit tests for the P2-via-P3 socket adapter functions (adaptTcp, adaptUdp).
 *
 * These tests exercise the adapter's start/finish state machine, pending
 * operation tracking, TCP stream setup, UDP datagram stream creation,
 * and send-permit enforcement — all with mock P3 socket objects (no real
 * network I/O).
 */

import {
    adaptTcp,
    adaptUdp,
    adaptIncomingDatagramStream,
    adaptOutgoingDatagramStream,
} from '../../../src/host/wasip2-via-wasip3/sockets';
import type { WasiPollable } from '../../../src/host/wasip2-via-wasip3/io';

// ──────────────────── Mock P3 TCP socket ────────────────────

type IpSocketAddress = { tag: string; val: { port: number; address: number[] } };

function createMockTcpSocket(opts?: {
    bindFail?: string;
    connectFail?: string;
    listenFail?: string;
    bindDelay?: number;
    connectDelay?: number;
}) {
    let bound = false;
    let connected = false;
    let listening = false;
    let localAddr: IpSocketAddress = { tag: 'ipv4', val: { port: 0, address: [0, 0, 0, 0] } };
    let remoteAddr: IpSocketAddress | undefined;
    let keepAliveEnabled = false;
    let keepAliveIdleTime = 7_200_000_000_000n; // 2 hours in ns
    let keepAliveInterval = 1_000_000_000n;
    let keepAliveCount = 9;
    let hopLimit = 64;
    let receiveBufferSize = 65536n;
    let sendBufferSize = 65536n;
    let listenBacklogSize = 128n;

    const socket = {
        async bind(addr: IpSocketAddress): Promise<void> {
            if (opts?.bindDelay) await new Promise(r => setTimeout(r, opts.bindDelay));
            if (opts?.bindFail) throw { tag: opts.bindFail };
            bound = true;
            localAddr = { tag: addr.tag, val: { port: addr.val.port || 12345, address: addr.val.address } };
        },
        async connect(addr: IpSocketAddress): Promise<void> {
            if (opts?.connectDelay) await new Promise(r => setTimeout(r, opts.connectDelay));
            if (opts?.connectFail) throw { tag: opts.connectFail };
            connected = true;
            remoteAddr = addr;
            localAddr = { tag: 'ipv4', val: { port: 54321, address: [127, 0, 0, 1] } };
        },
        async listen(): Promise<AsyncIterable<typeof socket>> {
            if (opts?.listenFail) throw { tag: opts.listenFail };
            listening = true;
            // Return an async iterable that yields one accepted connection
            const accepted = createMockTcpSocket();
            return {
                [Symbol.asyncIterator]() {
                    let yielded = false;
                    return {
                        async next() {
                            if (yielded) return { value: undefined as unknown, done: true };
                            yielded = true;
                            return { value: accepted, done: false };
                        },
                    };
                },
            };
        },
        send(_data: AsyncIterable<Uint8Array>): Promise<void> {
            return Promise.resolve();
        },
        receive(): [{ push(v: Uint8Array): void; close(): void;[Symbol.asyncIterator](): AsyncIterator<Uint8Array>; onReadableDrop?: () => void }, Promise<void>] {
            const chunks: Uint8Array[] = [new Uint8Array([1, 2, 3])];
            let idx = 0;
            const stream = {
                push(_v: Uint8Array) { /* no-op */ },
                close() { /* no-op */ },
                [Symbol.asyncIterator]() {
                    return {
                        async next(): Promise<IteratorResult<Uint8Array>> {
                            if (idx < chunks.length) {
                                return { value: chunks[idx++]!, done: false };
                            }
                            return { value: undefined as unknown as Uint8Array, done: true };
                        },
                    };
                },
            };
            return [stream, Promise.resolve()];
        },
        getLocalAddress(): IpSocketAddress {
            if (!bound && !connected) throw { tag: 'invalid-state' };
            return localAddr;
        },
        getRemoteAddress(): IpSocketAddress {
            if (!connected) throw { tag: 'invalid-state' };
            return remoteAddr!;
        },
        getIsListening(): boolean { return listening; },
        getAddressFamily(): 'ipv4' | 'ipv6' { return 'ipv4'; },
        setListenBacklogSize(value: bigint): void { listenBacklogSize = value; },
        getKeepAliveEnabled(): boolean { return keepAliveEnabled; },
        setKeepAliveEnabled(value: boolean): void { keepAliveEnabled = value; },
        getKeepAliveIdleTime(): bigint { return keepAliveIdleTime; },
        setKeepAliveIdleTime(value: bigint): void { keepAliveIdleTime = value; },
        getKeepAliveInterval(): bigint { return keepAliveInterval; },
        setKeepAliveInterval(value: bigint): void { keepAliveInterval = value; },
        getKeepAliveCount(): number { return keepAliveCount; },
        setKeepAliveCount(value: number): void { keepAliveCount = value; },
        getHopLimit(): number { return hopLimit; },
        setHopLimit(value: number): void { hopLimit = value; },
        getReceiveBufferSize(): bigint { return receiveBufferSize; },
        setReceiveBufferSize(value: bigint): void { receiveBufferSize = value; },
        getSendBufferSize(): bigint { return sendBufferSize; },
        setSendBufferSize(value: bigint): void { sendBufferSize = value; },
        drop(): void { /* no-op */ },
        // Expose internals for assertions
        _getListenBacklogSize() { return listenBacklogSize; },
    };
    return socket;
}

// ──────────────────── Mock P3 UDP socket ────────────────────

function createMockUdpSocket(opts?: {
    bindFail?: string;
    connectFail?: string;
}) {
    let bound = false;
    let connected = false;
    let localAddr: IpSocketAddress = { tag: 'ipv4', val: { port: 0, address: [0, 0, 0, 0] } };
    let remoteAddr: IpSocketAddress | undefined;
    let unicastHopLimit = 64;
    let receiveBufferSize = 65536n;
    let sendBufferSize = 65536n;
    const sentDatagrams: { data: Uint8Array; addr: IpSocketAddress | undefined }[] = [];
    const receivedDatagrams: [Uint8Array, IpSocketAddress][] = [
        [new Uint8Array([10, 20, 30]), { tag: 'ipv4', val: { port: 9999, address: [192, 168, 1, 1] } }],
    ];

    const socket = {
        async bind(addr: IpSocketAddress): Promise<void> {
            if (opts?.bindFail) throw { tag: opts.bindFail };
            bound = true;
            localAddr = { tag: addr.tag, val: { port: addr.val.port || 33333, address: addr.val.address } };
        },
        async connect(addr: IpSocketAddress): Promise<void> {
            if (opts?.connectFail) throw { tag: opts.connectFail };
            connected = true;
            remoteAddr = addr;
        },
        disconnect(): void {
            connected = false;
            remoteAddr = undefined;
        },
        async send(data: Uint8Array, remoteAddress: IpSocketAddress | undefined): Promise<void> {
            sentDatagrams.push({ data: new Uint8Array(data), addr: remoteAddress });
        },
        async receive(): Promise<[Uint8Array, IpSocketAddress]> {
            const dg = receivedDatagrams.shift();
            if (dg) return dg;
            // Simulate waiting forever (should not be called in these tests)
            return new Promise(() => { /* never resolves */ });
        },
        getLocalAddress(): IpSocketAddress {
            if (!bound) throw { tag: 'invalid-state' };
            return localAddr;
        },
        getRemoteAddress(): IpSocketAddress {
            if (!connected) throw { tag: 'invalid-state' };
            return remoteAddr!;
        },
        getAddressFamily(): 'ipv4' | 'ipv6' { return 'ipv4'; },
        getUnicastHopLimit(): number { return unicastHopLimit; },
        setUnicastHopLimit(value: number): void { unicastHopLimit = value; },
        getReceiveBufferSize(): bigint { return receiveBufferSize; },
        setReceiveBufferSize(value: bigint): void { receiveBufferSize = value; },
        getSendBufferSize(): bigint { return sendBufferSize; },
        setSendBufferSize(value: bigint): void { sendBufferSize = value; },
        drop(): void { /* no-op */ },
        // Expose internals for assertions
        _getSentDatagrams() { return sentDatagrams; },
        _isBound() { return bound; },
        _isConnected() { return connected; },
    };
    return socket;
}

// ──────────────────── TCP adapter tests ────────────────────

describe('adaptTcp — TCP state machine', () => {
    const tcp = adaptTcp();

    describe('bind lifecycle', () => {
        it('start-bind initiates a pending bind', () => {
            const sock = createMockTcpSocket();
            const addr: IpSocketAddress = { tag: 'ipv4', val: { port: 8080, address: [127, 0, 0, 1] } };
            const result = tcp['start-bind'](sock, {}, addr);
            expect(result).toEqual({ tag: 'ok', val: undefined });
        });

        it('finish-bind returns would-block before resolution', () => {
            const sock = createMockTcpSocket({ bindDelay: 100 });
            const addr: IpSocketAddress = { tag: 'ipv4', val: { port: 8080, address: [127, 0, 0, 1] } };
            tcp['start-bind'](sock, {}, addr);
            const result = tcp['finish-bind'](sock);
            expect(result).toEqual({ tag: 'err', val: 'would-block' });
        });

        it('finish-bind returns ok after resolution', async () => {
            const sock = createMockTcpSocket();
            const addr: IpSocketAddress = { tag: 'ipv4', val: { port: 8080, address: [127, 0, 0, 1] } };
            tcp['start-bind'](sock, {}, addr);
            await new Promise(r => setTimeout(r, 10));
            const result = tcp['finish-bind'](sock);
            expect(result).toEqual({ tag: 'ok', val: undefined });
        });

        it('finish-bind returns error code on failure', async () => {
            const sock = createMockTcpSocket({ bindFail: 'address-in-use' });
            const addr: IpSocketAddress = { tag: 'ipv4', val: { port: 80, address: [0, 0, 0, 0] } };
            tcp['start-bind'](sock, {}, addr);
            await new Promise(r => setTimeout(r, 10));
            const result = tcp['finish-bind'](sock);
            expect(result).toEqual({ tag: 'err', val: 'address-in-use' });
        });

        it('start-bind after bound returns invalid-state', async () => {
            const sock = createMockTcpSocket();
            const addr: IpSocketAddress = { tag: 'ipv4', val: { port: 8080, address: [127, 0, 0, 1] } };
            tcp['start-bind'](sock, {}, addr);
            await new Promise(r => setTimeout(r, 10));
            tcp['finish-bind'](sock);
            const result = tcp['start-bind'](sock, {}, addr);
            expect(result).toEqual({ tag: 'err', val: 'invalid-state' });
        });

        it('concurrent start-bind returns concurrency-conflict', () => {
            const sock = createMockTcpSocket({ bindDelay: 100 });
            const addr: IpSocketAddress = { tag: 'ipv4', val: { port: 8080, address: [127, 0, 0, 1] } };
            tcp['start-bind'](sock, {}, addr);
            const result = tcp['start-bind'](sock, {}, addr);
            expect(result).toEqual({ tag: 'err', val: 'concurrency-conflict' });
        });
    });

    describe('connect lifecycle', () => {
        it('start-connect initiates a pending connect', () => {
            const sock = createMockTcpSocket();
            const addr: IpSocketAddress = { tag: 'ipv4', val: { port: 80, address: [93, 184, 216, 34] } };
            const result = tcp['start-connect'](sock, {}, addr);
            expect(result).toEqual({ tag: 'ok', val: undefined });
        });

        it('finish-connect returns would-block before resolution', () => {
            const sock = createMockTcpSocket({ connectDelay: 100 });
            const addr: IpSocketAddress = { tag: 'ipv4', val: { port: 80, address: [93, 184, 216, 34] } };
            tcp['start-connect'](sock, {}, addr);
            const result = tcp['finish-connect'](sock);
            expect(result).toEqual({ tag: 'err', val: 'would-block' });
        });

        it('finish-connect returns ok with streams after resolution', async () => {
            const sock = createMockTcpSocket();
            const addr: IpSocketAddress = { tag: 'ipv4', val: { port: 80, address: [93, 184, 216, 34] } };
            tcp['start-connect'](sock, {}, addr);
            await new Promise(r => setTimeout(r, 10));
            const result = tcp['finish-connect'](sock);
            expect(result.tag).toBe('ok');
            if (result.tag === 'ok') {
                const [inputStream, outputStream] = result.val;
                expect(inputStream).toBeDefined();
                expect(outputStream).toBeDefined();
            }
        });

        it('finish-connect returns error code on failure', async () => {
            const sock = createMockTcpSocket({ connectFail: 'connection-refused' });
            const addr: IpSocketAddress = { tag: 'ipv4', val: { port: 80, address: [10, 0, 0, 1] } };
            tcp['start-connect'](sock, {}, addr);
            await new Promise(r => setTimeout(r, 10));
            const result = tcp['finish-connect'](sock);
            expect(result).toEqual({ tag: 'err', val: 'connection-refused' });
        });

        it('start-connect after connected returns invalid-state', async () => {
            const sock = createMockTcpSocket();
            const addr: IpSocketAddress = { tag: 'ipv4', val: { port: 80, address: [93, 184, 216, 34] } };
            tcp['start-connect'](sock, {}, addr);
            await new Promise(r => setTimeout(r, 10));
            tcp['finish-connect'](sock);
            const result = tcp['start-connect'](sock, {}, addr);
            expect(result).toEqual({ tag: 'err', val: 'invalid-state' });
        });

        it('concurrent start-connect returns concurrency-conflict', () => {
            const sock = createMockTcpSocket({ connectDelay: 100 });
            const addr: IpSocketAddress = { tag: 'ipv4', val: { port: 80, address: [93, 184, 216, 34] } };
            tcp['start-connect'](sock, {}, addr);
            const result = tcp['start-connect'](sock, {}, addr);
            expect(result).toEqual({ tag: 'err', val: 'concurrency-conflict' });
        });
    });

    describe('listen lifecycle', () => {
        it('start-listen requires prior bind', () => {
            const sock = createMockTcpSocket();
            const result = tcp['start-listen'](sock);
            expect(result).toEqual({ tag: 'err', val: 'invalid-state' });
        });

        it('start-listen after bind + finish-bind succeeds', async () => {
            const sock = createMockTcpSocket();
            const addr: IpSocketAddress = { tag: 'ipv4', val: { port: 9090, address: [0, 0, 0, 0] } };
            tcp['start-bind'](sock, {}, addr);
            await new Promise(r => setTimeout(r, 10));
            tcp['finish-bind'](sock);
            const result = tcp['start-listen'](sock);
            expect(result).toEqual({ tag: 'ok', val: undefined });
        });

        it('finish-listen returns ok after resolution', async () => {
            const sock = createMockTcpSocket();
            const addr: IpSocketAddress = { tag: 'ipv4', val: { port: 9090, address: [0, 0, 0, 0] } };
            tcp['start-bind'](sock, {}, addr);
            await new Promise(r => setTimeout(r, 10));
            tcp['finish-bind'](sock);
            tcp['start-listen'](sock);
            await new Promise(r => setTimeout(r, 10));
            const result = tcp['finish-listen'](sock);
            expect(result).toEqual({ tag: 'ok', val: undefined });
        });

        it('finish-listen returns error on failure', async () => {
            const sock = createMockTcpSocket({ listenFail: 'address-in-use' });
            const addr: IpSocketAddress = { tag: 'ipv4', val: { port: 9090, address: [0, 0, 0, 0] } };
            tcp['start-bind'](sock, {}, addr);
            await new Promise(r => setTimeout(r, 10));
            tcp['finish-bind'](sock);
            tcp['start-listen'](sock);
            await new Promise(r => setTimeout(r, 10));
            const result = tcp['finish-listen'](sock);
            expect(result).toEqual({ tag: 'err', val: 'address-in-use' });
        });
    });

    describe('accept', () => {
        it('accept without listen returns invalid-state', () => {
            const sock = createMockTcpSocket();
            const result = tcp['accept'](sock);
            expect(result).toEqual({ tag: 'err', val: 'invalid-state' });
        });

        it('accept after listen returns would-block then accepted socket', async () => {
            const sock = createMockTcpSocket();
            const addr: IpSocketAddress = { tag: 'ipv4', val: { port: 9090, address: [0, 0, 0, 0] } };
            tcp['start-bind'](sock, {}, addr);
            await new Promise(r => setTimeout(r, 10));
            tcp['finish-bind'](sock);
            tcp['start-listen'](sock);
            await new Promise(r => setTimeout(r, 10));
            tcp['finish-listen'](sock);

            // First call starts the accept
            const r1 = tcp['accept'](sock);
            expect(r1.tag).toBe('err');
            if (r1.tag === 'err') expect(r1.val).toBe('would-block');

            // Wait for the mock accept to resolve
            await new Promise(r => setTimeout(r, 10));

            // Second call should return the accepted socket
            const r2 = tcp['accept'](sock);
            expect(r2.tag).toBe('ok');
            if (r2.tag === 'ok') {
                const [accepted, inputStream, outputStream] = r2.val;
                expect(accepted).toBeDefined();
                expect(inputStream).toBeDefined();
                expect(outputStream).toBeDefined();
            }
        });
    });

    describe('address queries', () => {
        it('local-address returns error before bind', () => {
            const sock = createMockTcpSocket();
            const result = tcp['local-address'](sock);
            expect(result).toEqual({ tag: 'err', val: 'invalid-state' });
        });

        it('local-address returns ok after bind', async () => {
            const sock = createMockTcpSocket();
            const addr: IpSocketAddress = { tag: 'ipv4', val: { port: 8080, address: [127, 0, 0, 1] } };
            tcp['start-bind'](sock, {}, addr);
            await new Promise(r => setTimeout(r, 10));
            tcp['finish-bind'](sock);
            const result = tcp['local-address'](sock);
            expect(result.tag).toBe('ok');
            if (result.tag === 'ok') expect(result.val.val.port).toBe(8080);
        });

        it('remote-address returns error before connect', () => {
            const sock = createMockTcpSocket();
            const result = tcp['remote-address'](sock);
            expect(result).toEqual({ tag: 'err', val: 'invalid-state' });
        });

        it('remote-address returns ok after connect', async () => {
            const sock = createMockTcpSocket();
            const addr: IpSocketAddress = { tag: 'ipv4', val: { port: 80, address: [93, 184, 216, 34] } };
            tcp['start-connect'](sock, {}, addr);
            await new Promise(r => setTimeout(r, 10));
            tcp['finish-connect'](sock);
            const result = tcp['remote-address'](sock);
            expect(result.tag).toBe('ok');
            if (result.tag === 'ok') expect(result.val.val.port).toBe(80);
        });
    });

    describe('properties', () => {
        it('is-listening returns false initially', () => {
            const sock = createMockTcpSocket();
            expect(tcp['is-listening'](sock)).toBe(false);
        });

        it('address-family returns ipv4', () => {
            const sock = createMockTcpSocket();
            expect(tcp['address-family'](sock)).toBe('ipv4');
        });

        it('keep-alive-enabled get/set round-trips', () => {
            const sock = createMockTcpSocket();
            expect(tcp['keep-alive-enabled'](sock)).toEqual({ tag: 'ok', val: false });
            expect(tcp['set-keep-alive-enabled'](sock, true)).toEqual({ tag: 'ok', val: undefined });
            expect(tcp['keep-alive-enabled'](sock)).toEqual({ tag: 'ok', val: true });
        });

        it('keep-alive-idle-time get/set round-trips', () => {
            const sock = createMockTcpSocket();
            const idle = tcp['keep-alive-idle-time'](sock);
            expect(idle.tag).toBe('ok');
            tcp['set-keep-alive-idle-time'](sock, 5_000_000_000n);
            expect(tcp['keep-alive-idle-time'](sock)).toEqual({ tag: 'ok', val: 5_000_000_000n });
        });

        it('keep-alive-interval get/set round-trips', () => {
            const sock = createMockTcpSocket();
            tcp['set-keep-alive-interval'](sock, 2_000_000_000n);
            expect(tcp['keep-alive-interval'](sock)).toEqual({ tag: 'ok', val: 2_000_000_000n });
        });

        it('keep-alive-count get/set round-trips', () => {
            const sock = createMockTcpSocket();
            tcp['set-keep-alive-count'](sock, 5);
            expect(tcp['keep-alive-count'](sock)).toEqual({ tag: 'ok', val: 5 });
        });

        it('hop-limit get/set round-trips', () => {
            const sock = createMockTcpSocket();
            expect(tcp['hop-limit'](sock)).toEqual({ tag: 'ok', val: 64 });
            tcp['set-hop-limit'](sock, 128);
            expect(tcp['hop-limit'](sock)).toEqual({ tag: 'ok', val: 128 });
        });

        it('receive-buffer-size get/set round-trips', () => {
            const sock = createMockTcpSocket();
            expect(tcp['receive-buffer-size'](sock)).toEqual({ tag: 'ok', val: 65536n });
            tcp['set-receive-buffer-size'](sock, 131072n);
            expect(tcp['receive-buffer-size'](sock)).toEqual({ tag: 'ok', val: 131072n });
        });

        it('send-buffer-size get/set round-trips', () => {
            const sock = createMockTcpSocket();
            expect(tcp['send-buffer-size'](sock)).toEqual({ tag: 'ok', val: 65536n });
            tcp['set-send-buffer-size'](sock, 262144n);
            expect(tcp['send-buffer-size'](sock)).toEqual({ tag: 'ok', val: 262144n });
        });

        it('set-listen-backlog-size delegates', () => {
            const sock = createMockTcpSocket();
            const r = tcp['set-listen-backlog-size'](sock, 256n);
            expect(r).toEqual({ tag: 'ok', val: undefined });
            expect(sock._getListenBacklogSize()).toBe(256n);
        });
    });

    describe('shutdown', () => {
        it('shutdown before connect returns invalid-state', () => {
            const sock = createMockTcpSocket();
            const result = tcp['shutdown'](sock, 'both');
            expect(result).toEqual({ tag: 'err', val: 'invalid-state' });
        });

        it('shutdown after connect returns ok', async () => {
            const sock = createMockTcpSocket();
            const addr: IpSocketAddress = { tag: 'ipv4', val: { port: 80, address: [93, 184, 216, 34] } };
            tcp['start-connect'](sock, {}, addr);
            await new Promise(r => setTimeout(r, 10));
            tcp['finish-connect'](sock);
            expect(tcp['shutdown'](sock, 'both')).toEqual({ tag: 'ok', val: undefined });
            expect(tcp['shutdown'](sock, 'receive')).toEqual({ tag: 'ok', val: undefined });
            expect(tcp['shutdown'](sock, 'send')).toEqual({ tag: 'ok', val: undefined });
        });
    });

    describe('subscribe', () => {
        it('returns a ready pollable when no pending ops', () => {
            const sock = createMockTcpSocket();
            const pollable = tcp['subscribe'](sock) as WasiPollable;
            expect(pollable.ready()).toBe(true);
        });

        it('returns not-ready during pending bind', () => {
            const sock = createMockTcpSocket({ bindDelay: 100 });
            const addr: IpSocketAddress = { tag: 'ipv4', val: { port: 8080, address: [127, 0, 0, 1] } };
            tcp['start-bind'](sock, {}, addr);
            const pollable = tcp['subscribe'](sock) as WasiPollable;
            expect(pollable.ready()).toBe(false);
        });

        it('returns ready after bind resolves', async () => {
            const sock = createMockTcpSocket();
            const addr: IpSocketAddress = { tag: 'ipv4', val: { port: 8080, address: [127, 0, 0, 1] } };
            tcp['start-bind'](sock, {}, addr);
            const pollable = tcp['subscribe'](sock) as WasiPollable;
            await new Promise(r => setTimeout(r, 10));
            expect(pollable.ready()).toBe(true);
        });
    });
});

// ──────────────────── UDP adapter tests ────────────────────

describe('adaptUdp — UDP state machine', () => {
    const udp = adaptUdp();

    describe('bind lifecycle', () => {
        it('start-bind initiates a pending bind', () => {
            const sock = createMockUdpSocket();
            const addr: IpSocketAddress = { tag: 'ipv4', val: { port: 5000, address: [0, 0, 0, 0] } };
            const result = udp['start-bind'](sock, {}, addr);
            expect(result).toEqual({ tag: 'ok', val: undefined });
        });

        it('finish-bind returns ok after resolution', async () => {
            const sock = createMockUdpSocket();
            const addr: IpSocketAddress = { tag: 'ipv4', val: { port: 5000, address: [0, 0, 0, 0] } };
            udp['start-bind'](sock, {}, addr);
            await new Promise(r => setTimeout(r, 10));
            const result = udp['finish-bind'](sock);
            expect(result).toEqual({ tag: 'ok', val: undefined });
        });

        it('finish-bind returns error on failure', async () => {
            const sock = createMockUdpSocket({ bindFail: 'address-in-use' });
            const addr: IpSocketAddress = { tag: 'ipv4', val: { port: 5000, address: [0, 0, 0, 0] } };
            udp['start-bind'](sock, {}, addr);
            await new Promise(r => setTimeout(r, 10));
            const result = udp['finish-bind'](sock);
            expect(result).toEqual({ tag: 'err', val: 'address-in-use' });
        });

        it('start-bind after bound returns invalid-state', async () => {
            const sock = createMockUdpSocket();
            const addr: IpSocketAddress = { tag: 'ipv4', val: { port: 5000, address: [0, 0, 0, 0] } };
            udp['start-bind'](sock, {}, addr);
            await new Promise(r => setTimeout(r, 10));
            udp['finish-bind'](sock);
            const result = udp['start-bind'](sock, {}, addr);
            expect(result).toEqual({ tag: 'err', val: 'invalid-state' });
        });
    });

    describe('stream (datagram streams)', () => {
        it('stream before bind returns invalid-state', () => {
            const sock = createMockUdpSocket();
            const result = udp['stream'](sock, undefined);
            expect(result).toEqual({ tag: 'err', val: 'invalid-state' });
        });

        it('stream after bind returns incoming + outgoing datagram streams', async () => {
            const sock = createMockUdpSocket();
            const addr: IpSocketAddress = { tag: 'ipv4', val: { port: 5000, address: [0, 0, 0, 0] } };
            udp['start-bind'](sock, {}, addr);
            await new Promise(r => setTimeout(r, 10));
            udp['finish-bind'](sock);
            const result = udp['stream'](sock, undefined);
            expect(result.tag).toBe('ok');
            if (result.tag === 'ok') {
                const [incoming, outgoing] = result.val;
                expect(incoming).toBeDefined();
                expect(incoming.receive).toBeDefined();
                expect(incoming.subscribe).toBeDefined();
                expect(outgoing).toBeDefined();
                expect(outgoing.checkSend).toBeDefined();
                expect(outgoing.send).toBeDefined();
                expect(outgoing.subscribe).toBeDefined();
            }
        });

        it('stream with remote address triggers connect', async () => {
            const sock = createMockUdpSocket();
            const bindAddr: IpSocketAddress = { tag: 'ipv4', val: { port: 5000, address: [0, 0, 0, 0] } };
            const remoteAddr: IpSocketAddress = { tag: 'ipv4', val: { port: 9999, address: [192, 168, 1, 1] } };
            udp['start-bind'](sock, {}, bindAddr);
            await new Promise(r => setTimeout(r, 10));
            udp['finish-bind'](sock);
            const result = await udp['stream'](sock, remoteAddr);
            expect(result.tag).toBe('ok');
            expect(sock._isConnected()).toBe(true);
        });

        it('stream with invalid remote address rejects', async () => {
            const sock = createMockUdpSocket();
            const bindAddr: IpSocketAddress = { tag: 'ipv4', val: { port: 5000, address: [0, 0, 0, 0] } };
            // Port 0 is invalid per validation
            const invalidAddr: IpSocketAddress = { tag: 'ipv4', val: { port: 0, address: [192, 168, 1, 1] } };
            udp['start-bind'](sock, {}, bindAddr);
            await new Promise(r => setTimeout(r, 10));
            udp['finish-bind'](sock);
            const result = udp['stream'](sock, invalidAddr);
            expect(result).toEqual({ tag: 'err', val: 'invalid-argument' });
        });
    });

    describe('address queries', () => {
        it('local-address before bind returns invalid-state', () => {
            const sock = createMockUdpSocket();
            const result = udp['local-address'](sock);
            expect(result).toEqual({ tag: 'err', val: 'invalid-state' });
        });

        it('local-address after bind returns ok', async () => {
            const sock = createMockUdpSocket();
            const addr: IpSocketAddress = { tag: 'ipv4', val: { port: 5000, address: [0, 0, 0, 0] } };
            udp['start-bind'](sock, {}, addr);
            await new Promise(r => setTimeout(r, 10));
            udp['finish-bind'](sock);
            const result = udp['local-address'](sock);
            expect(result.tag).toBe('ok');
        });

        it('remote-address before connect returns invalid-state', () => {
            const sock = createMockUdpSocket();
            const result = udp['remote-address'](sock);
            expect(result).toEqual({ tag: 'err', val: 'invalid-state' });
        });

        it('remote-address after stream(remoteAddr) returns ok', async () => {
            const sock = createMockUdpSocket();
            const bindAddr: IpSocketAddress = { tag: 'ipv4', val: { port: 5000, address: [0, 0, 0, 0] } };
            const remoteAddr: IpSocketAddress = { tag: 'ipv4', val: { port: 9999, address: [192, 168, 1, 1] } };
            udp['start-bind'](sock, {}, bindAddr);
            await new Promise(r => setTimeout(r, 10));
            udp['finish-bind'](sock);
            await udp['stream'](sock, remoteAddr);
            const result = udp['remote-address'](sock);
            expect(result.tag).toBe('ok');
            if (result.tag === 'ok') expect(result.val.val.port).toBe(9999);
        });
    });

    describe('properties', () => {
        it('address-family returns ipv4', () => {
            const sock = createMockUdpSocket();
            expect(udp['address-family'](sock)).toBe('ipv4');
        });

        it('unicast-hop-limit get/set round-trips', () => {
            const sock = createMockUdpSocket();
            expect(udp['unicast-hop-limit'](sock)).toEqual({ tag: 'ok', val: 64 });
            udp['set-unicast-hop-limit'](sock, 128);
            expect(udp['unicast-hop-limit'](sock)).toEqual({ tag: 'ok', val: 128 });
        });

        it('receive-buffer-size get/set round-trips', () => {
            const sock = createMockUdpSocket();
            expect(udp['receive-buffer-size'](sock)).toEqual({ tag: 'ok', val: 65536n });
            udp['set-receive-buffer-size'](sock, 131072n);
            expect(udp['receive-buffer-size'](sock)).toEqual({ tag: 'ok', val: 131072n });
        });

        it('send-buffer-size get/set round-trips', () => {
            const sock = createMockUdpSocket();
            expect(udp['send-buffer-size'](sock)).toEqual({ tag: 'ok', val: 65536n });
            udp['set-send-buffer-size'](sock, 262144n);
            expect(udp['send-buffer-size'](sock)).toEqual({ tag: 'ok', val: 262144n });
        });
    });

    describe('subscribe', () => {
        it('returns ready when no pending ops', () => {
            const sock = createMockUdpSocket();
            const pollable = udp['subscribe'](sock) as WasiPollable;
            expect(pollable.ready()).toBe(true);
        });
    });
});

// ──────────────────── Datagram stream adapter tests ────────────────────

describe('adaptIncomingDatagramStream', () => {
    const adapter = adaptIncomingDatagramStream();

    it('receive delegates to the stream object', () => {
        const stream = {
            socket: {},
            receive(maxResults: bigint) {
                return { tag: 'ok' as const, val: [{ data: new Uint8Array([1]), remoteAddress: { tag: 'ipv4', val: { port: 1234, address: [1, 2, 3, 4] } } }].slice(0, Number(maxResults)) };
            },
            subscribe() { return { ready: () => true, block: () => { /* no-op */ } }; },
        };
        const result = adapter['receive'](stream, 10n);
        expect(result.tag).toBe('ok');
        if (result.tag === 'ok') expect(result.val.length).toBe(1);
    });

    it('subscribe delegates to the stream object', () => {
        const stream = {
            socket: {},
            receive() { return { tag: 'ok' as const, val: [] }; },
            subscribe() { return { ready: () => true, block: () => { /* no-op */ } }; },
        };
        const pollable = adapter['subscribe'](stream) as WasiPollable;
        expect(pollable.ready()).toBe(true);
    });
});

describe('adaptOutgoingDatagramStream', () => {
    const adapter = adaptOutgoingDatagramStream();

    it('check-send delegates to the stream object', () => {
        const stream = {
            socket: {},
            remoteAddress: undefined,
            checkSend() { return { tag: 'ok' as const, val: 64n }; },
            send() { return { tag: 'ok' as const, val: 0n }; },
            subscribe() { return { ready: () => true, block: () => { /* no-op */ } }; },
        };
        const result = adapter['check-send'](stream);
        expect(result).toEqual({ tag: 'ok', val: 64n });
    });

    it('send delegates to the stream object', () => {
        const datagrams = [
            { data: new Uint8Array([1, 2, 3]), remoteAddress: { tag: 'ipv4', val: { port: 9999, address: [10, 0, 0, 1] } } },
        ];
        const stream = {
            socket: {},
            remoteAddress: undefined,
            checkSend() { return { tag: 'ok' as const, val: 64n }; },
            send(dgs: typeof datagrams) { return { tag: 'ok' as const, val: BigInt(dgs.length) }; },
            subscribe() { return { ready: () => true, block: () => { /* no-op */ } }; },
        };
        const result = adapter['send'](stream, datagrams);
        expect(result).toEqual({ tag: 'ok', val: 1n });
    });

    it('subscribe delegates to the stream object', () => {
        const stream = {
            socket: {},
            remoteAddress: undefined,
            checkSend() { return { tag: 'ok' as const, val: 64n }; },
            send() { return { tag: 'ok' as const, val: 0n }; },
            subscribe() { return { ready: () => true, block: () => { /* no-op */ } }; },
        };
        const pollable = adapter['subscribe'](stream) as WasiPollable;
        expect(pollable.ready()).toBe(true);
    });
});

// ──────────────────── Send-permit enforcement (Step 7) ────────────────────

describe('UDP send-permit enforcement', () => {
    it('send within permit limit succeeds', async () => {
        const sock = createMockUdpSocket();
        const udp = adaptUdp();
        const bindAddr: IpSocketAddress = { tag: 'ipv4', val: { port: 5000, address: [0, 0, 0, 0] } };
        udp['start-bind'](sock, {}, bindAddr);
        await new Promise(r => setTimeout(r, 10));
        udp['finish-bind'](sock);
        const streamResult = udp['stream'](sock, undefined);
        expect(streamResult.tag).toBe('ok');
        if (streamResult.tag !== 'ok') return;
        const [, outgoing] = streamResult.val;

        const outAdapter = adaptOutgoingDatagramStream();
        // check-send gives permission
        const permits = outAdapter['check-send'](outgoing);
        expect(permits.tag).toBe('ok');

        // Send within limit
        const dgs = Array.from({ length: 3 }, (_, i) => ({
            data: new Uint8Array([i]),
            remoteAddress: { tag: 'ipv4', val: { port: 9999, address: [10, 0, 0, 1] } },
        }));
        const result = await outAdapter['send'](outgoing, dgs);
        expect(result.tag).toBe('ok');
    });

    it('send exceeding permit limit traps', async () => {
        const sock = createMockUdpSocket();
        const udp = adaptUdp();
        const bindAddr: IpSocketAddress = { tag: 'ipv4', val: { port: 5001, address: [0, 0, 0, 0] } };
        udp['start-bind'](sock, {}, bindAddr);
        await new Promise(r => setTimeout(r, 10));
        udp['finish-bind'](sock);
        const streamResult = udp['stream'](sock, undefined);
        expect(streamResult.tag).toBe('ok');
        if (streamResult.tag !== 'ok') return;
        const [, outgoing] = streamResult.val;

        const outAdapter = adaptOutgoingDatagramStream();
        // check-send gives 64 permits
        outAdapter['check-send'](outgoing);

        // Send 65 datagrams (one over the 64 limit)
        const dgs = Array.from({ length: 65 }, (_, i) => ({
            data: new Uint8Array([i]),
            remoteAddress: { tag: 'ipv4', val: { port: 9999, address: [10, 0, 0, 1] } },
        }));
        expect(() => outAdapter['send'](outgoing, dgs)).toThrow(WebAssembly.RuntimeError);
    });

    it('send without prior check-send traps (permits = 0)', async () => {
        const sock = createMockUdpSocket();
        const udp = adaptUdp();
        const bindAddr: IpSocketAddress = { tag: 'ipv4', val: { port: 5002, address: [0, 0, 0, 0] } };
        udp['start-bind'](sock, {}, bindAddr);
        await new Promise(r => setTimeout(r, 10));
        udp['finish-bind'](sock);
        const streamResult = udp['stream'](sock, undefined);
        expect(streamResult.tag).toBe('ok');
        if (streamResult.tag !== 'ok') return;
        const [, outgoing] = streamResult.val;

        const outAdapter = adaptOutgoingDatagramStream();
        // Don't call check-send — permits remain 0
        const dgs = [{ data: new Uint8Array([1]), remoteAddress: { tag: 'ipv4', val: { port: 9999, address: [10, 0, 0, 1] } } }];
        expect(() => outAdapter['send'](outgoing, dgs)).toThrow(WebAssembly.RuntimeError);
    });
});
