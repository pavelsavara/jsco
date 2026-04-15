// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * Tests for wasi:sockets/* — Node.js implementation
 *
 * Tests TCP socket lifecycle, UDP datagram send/receive,
 * and DNS name lookup using real Node.js modules.
 */

import type {
    IpSocketAddress,
    WasiTcpSocket,
    WasiNetwork,
} from '../api';
import {
    createTcpSocket,
    createUdpSocket,
    resolveAddresses,
    createNetwork,
    instanceNetwork,
} from './sockets';
import * as net from 'node:net';

/** Wait for a pollable to become ready (without JSPI block()) */
async function waitReady(pollable: { ready(): boolean }, timeoutMs = 5000): Promise<void> {
    const start = Date.now();
    while (!pollable.ready()) {
        if (Date.now() - start > timeoutMs) throw new Error('Pollable timed out');
        await new Promise(resolve => setTimeout(resolve, 10));
    }
}

const ipv4Loopback: IpSocketAddress = {
    tag: 'ipv4',
    val: { port: 0, address: [127, 0, 0, 1] },
};

const ipv4Addr = (port: number): IpSocketAddress => ({
    tag: 'ipv4',
    val: { port, address: [127, 0, 0, 1] },
});

describe('wasi:sockets/network', () => {
    test('createNetwork returns a network resource', () => {
        const net = createNetwork();
        expect((net as any)._tag).toBe('network');
    });

    test('instanceNetwork returns a network resource', () => {
        const net = instanceNetwork();
        expect((net as any)._tag).toBe('network');
    });
});

describe('wasi:sockets/tcp', () => {
    test('createTcpSocket ipv4 succeeds on Node.js', () => {
        const result = createTcpSocket('ipv4');
        expect(result.tag).toBe('ok');
    });

    test('createTcpSocket ipv6 succeeds on Node.js', () => {
        const result = createTcpSocket('ipv6');
        expect(result.tag).toBe('ok');
    });

    describe('TCP state machine', () => {
        let socket: WasiTcpSocket;
        let network: WasiNetwork;

        beforeEach(() => {
            const result = createTcpSocket('ipv4');
            if (result.tag !== 'ok') throw new Error('Failed to create socket');
            socket = result.val;
            network = createNetwork();
        });

        test('starts in unbound state', () => {
            expect(socket.isListening()).toBe(false);
            expect(socket.addressFamily()).toBe('ipv4');
        });

        test('start-bind succeeds for unbound socket', () => {
            const result = socket.startBind(network, ipv4Loopback);
            expect(result.tag).toBe('ok');
        });

        test('finish-bind succeeds after start-bind', () => {
            socket.startBind(network, ipv4Loopback);
            const result = socket.finishBind();
            expect(result.tag).toBe('ok');
        });

        test('start-bind fails for already bound socket', () => {
            socket.startBind(network, ipv4Loopback);
            socket.finishBind();
            const result = socket.startBind(network, ipv4Loopback);
            expect(result.tag).toBe('err');
            if (result.tag === 'err') expect(result.val).toBe('invalid-state');
        });

        test('finish-bind fails without start-bind', () => {
            const result = socket.finishBind();
            expect(result.tag).toBe('err');
            if (result.tag === 'err') expect(result.val).toBe('not-in-progress');
        });

        test('start-connect with zero address fails', () => {
            const zeroAddr: IpSocketAddress = { tag: 'ipv4', val: { port: 80, address: [0, 0, 0, 0] } };
            const result = socket.startConnect(network, zeroAddr);
            expect(result.tag).toBe('err');
            if (result.tag === 'err') expect(result.val).toBe('invalid-argument');
        });

        test('start-connect with zero port fails', () => {
            const zeroPort: IpSocketAddress = { tag: 'ipv4', val: { port: 0, address: [127, 0, 0, 1] } };
            const result = socket.startConnect(network, zeroPort);
            expect(result.tag).toBe('err');
            if (result.tag === 'err') expect(result.val).toBe('invalid-argument');
        });

        test('address family mismatch for bind fails', () => {
            const ipv6Addr: IpSocketAddress = { tag: 'ipv6', val: { port: 0, flowInfo: 0, address: [0, 0, 0, 0, 0, 0, 0, 1], scopeId: 0 } };
            const result = socket.startBind(network, ipv6Addr);
            expect(result.tag).toBe('err');
            if (result.tag === 'err') expect(result.val).toBe('invalid-argument');
        });

        test('set-listen-backlog-size works before listen', () => {
            socket.startBind(network, ipv4Loopback);
            socket.finishBind();
            const result = socket.setListenBacklogSize(64n);
            expect(result.tag).toBe('ok');
        });

        test('set-listen-backlog-size rejects zero', () => {
            const result = socket.setListenBacklogSize(0n);
            expect(result.tag).toBe('err');
            if (result.tag === 'err') expect(result.val).toBe('invalid-argument');
        });

        test('keep-alive defaults', () => {
            const enabled = socket.keepAliveEnabled();
            expect(enabled.tag).toBe('ok');
            if (enabled.tag === 'ok') expect(enabled.val).toBe(false);
        });

        test('hop-limit defaults', () => {
            const limit = socket.hopLimit();
            expect(limit.tag).toBe('ok');
            if (limit.tag === 'ok') expect(limit.val).toBe(64);
        });

        test('buffer sizes', () => {
            const rcv = socket.receiveBufferSize();
            expect(rcv.tag).toBe('ok');
            if (rcv.tag === 'ok') expect(rcv.val).toBe(65536n);
            const snd = socket.sendBufferSize();
            expect(snd.tag).toBe('ok');
            if (snd.tag === 'ok') expect(snd.val).toBe(65536n);
        });

        test('shutdown fails for non-connected socket', () => {
            const result = socket.shutdown('both');
            expect(result.tag).toBe('err');
            if (result.tag === 'err') expect(result.val).toBe('invalid-state');
        });

        test('shutdown with receive fails for non-connected socket', () => {
            const result = socket.shutdown('receive');
            expect(result.tag).toBe('err');
            if (result.tag === 'err') expect(result.val).toBe('invalid-state');
        });

        test('shutdown with send fails for non-connected socket', () => {
            const result = socket.shutdown('send');
            expect(result.tag).toBe('err');
            if (result.tag === 'err') expect(result.val).toBe('invalid-state');
        });
    });

    describe('TCP listen and accept', () => {
        let server: WasiTcpSocket;
        let serverNet: WasiNetwork;

        beforeEach(() => {
            const result = createTcpSocket('ipv4');
            if (result.tag !== 'ok') throw new Error('Failed to create socket');
            server = result.val;
            serverNet = createNetwork();
        });

        test('bind and listen lifecycle', async () => {
            // Bind
            const bindResult = server.startBind(serverNet, ipv4Loopback);
            expect(bindResult.tag).toBe('ok');
            const finishBind = server.finishBind();
            expect(finishBind.tag).toBe('ok');

            // Listen
            const listenResult = server.startListen();
            expect(listenResult.tag).toBe('ok');

            // Wait for listen to complete
            const pollable = server.subscribe();
            await waitReady(pollable);

            const finishListen = server.finishListen();
            expect(finishListen.tag).toBe('ok');
            expect(server.isListening()).toBe(true);

            // Should have a local address
            const addr = server.localAddress();
            expect(addr.tag).toBe('ok');

            // Accept should return would-block when no connections
            const acceptResult = server.accept();
            expect(acceptResult.tag).toBe('err');
            if (acceptResult.tag === 'err') expect(acceptResult.val).toBe('would-block');
        }, 10000);

        test('listen fails for unbound socket', () => {
            const result = server.startListen();
            expect(result.tag).toBe('err');
            if (result.tag === 'err') expect(result.val).toBe('invalid-state');
        });
    });

    describe('TCP connect and communicate', () => {
        test('client-server round trip', async () => {
            const network = createNetwork();

            // Create a real node server to connect to
            const nodeServer = net.createServer((conn: any) => {
                conn.on('data', (data: Buffer) => {
                    conn.write(data); // echo
                });
            });

            await new Promise<void>(resolve => {
                nodeServer.listen(0, '127.0.0.1', resolve);
            });

            const addr = nodeServer.address();
            const port = (typeof addr === 'object' && addr) ? addr.port : 0;

            try {
                const clientResult = createTcpSocket('ipv4');
                expect(clientResult.tag).toBe('ok');
                if (clientResult.tag !== 'ok') return;
                const client = clientResult.val;

                // Connect
                const connectResult = client.startConnect(network, ipv4Addr(port));
                expect(connectResult.tag).toBe('ok');

                // Wait for connection
                const pollable = client.subscribe();
                await waitReady(pollable);

                const finishConnect = client.finishConnect();
                expect(finishConnect.tag).toBe('ok');
                if (finishConnect.tag !== 'ok') return;

                const [inStream, outStream] = finishConnect.val;

                // Write data
                const data = new TextEncoder().encode('hello');
                const writeResult = outStream.write(data);
                expect(writeResult.tag).toBe('ok');

                // Read back echo
                await new Promise(resolve => setTimeout(resolve, 100));
                const readResult = inStream.read(100n);
                expect(readResult.tag).toBe('ok');
                if (readResult.tag === 'ok') {
                    expect(new TextDecoder().decode(readResult.val)).toBe('hello');
                }

                // Shutdown
                const shutdownResult = client.shutdown('both');
                expect(shutdownResult.tag).toBe('ok');
            } finally {
                nodeServer.close();
            }
        }, 15000);
    });
});

describe('wasi:sockets/udp', () => {
    test('createUdpSocket ipv4 succeeds on Node.js', () => {
        const result = createUdpSocket('ipv4');
        expect(result.tag).toBe('ok');
    });

    test('createUdpSocket ipv6 succeeds on Node.js', () => {
        const result = createUdpSocket('ipv6');
        expect(result.tag).toBe('ok');
    });

    test('UDP bind lifecycle', async () => {
        const result = createUdpSocket('ipv4');
        if (result.tag !== 'ok') throw new Error('Failed to create socket');
        const socket = result.val;
        const network = createNetwork();

        const bindResult = socket.startBind(network, ipv4Loopback);
        expect(bindResult.tag).toBe('ok');

        // Wait for bind
        const pollable = socket.subscribe();
        await waitReady(pollable);

        const finishBind = socket.finishBind();
        expect(finishBind.tag).toBe('ok');

        // Should have a local address
        const addr = socket.localAddress();
        expect(addr.tag).toBe('ok');

        // Get streams
        const streamResult = socket.stream(undefined);
        expect(streamResult.tag).toBe('ok');
    }, 10000);

    test('UDP send and receive', async () => {
        const network = createNetwork();

        // Create receiver
        const recvResult = createUdpSocket('ipv4');
        expect(recvResult.tag).toBe('ok');
        if (recvResult.tag !== 'ok') return;
        const receiver = recvResult.val;

        receiver.startBind(network, ipv4Loopback);
        const recvPoll = receiver.subscribe();
        await waitReady(recvPoll);
        receiver.finishBind();

        const recvAddr = receiver.localAddress();
        expect(recvAddr.tag).toBe('ok');
        if (recvAddr.tag !== 'ok') return;

        // Create sender
        const sendResult = createUdpSocket('ipv4');
        expect(sendResult.tag).toBe('ok');
        if (sendResult.tag !== 'ok') return;
        const sender = sendResult.val;

        sender.startBind(network, ipv4Loopback);
        const sendPoll = sender.subscribe();
        await waitReady(sendPoll);
        sender.finishBind();

        // Get streams
        const recvStreamResult = receiver.stream(undefined);
        expect(recvStreamResult.tag).toBe('ok');
        if (recvStreamResult.tag !== 'ok') return;
        const [inStream] = recvStreamResult.val;

        const sendStreamResult = sender.stream(recvAddr.val);
        expect(sendStreamResult.tag).toBe('ok');
        if (sendStreamResult.tag !== 'ok') return;
        const [, outStream] = sendStreamResult.val;

        // Send datagram
        const data = new TextEncoder().encode('ping');
        const checkSend = outStream.checkSend();
        expect(checkSend.tag).toBe('ok');

        const sent = outStream.send([{ data, remoteAddress: recvAddr.val }]);
        expect(sent.tag).toBe('ok');
        if (sent.tag === 'ok') expect(sent.val).toBe(1n);

        // Wait for datagram
        await new Promise(resolve => setTimeout(resolve, 200));

        const received = inStream.receive(10n);
        expect(received.tag).toBe('ok');
        if (received.tag === 'ok') {
            expect(received.val.length).toBeGreaterThanOrEqual(1);
            if (received.val.length > 0) {
                expect(new TextDecoder().decode(received.val[0]!.data)).toBe('ping');
            }
        }
    }, 15000);

    test('UDP address family mismatch fails', () => {
        const result = createUdpSocket('ipv4');
        if (result.tag !== 'ok') return;
        const socket = result.val;
        const network = createNetwork();
        const ipv6Addr: IpSocketAddress = { tag: 'ipv6', val: { port: 0, flowInfo: 0, address: [0, 0, 0, 0, 0, 0, 0, 1], scopeId: 0 } };
        const bindResult = socket.startBind(network, ipv6Addr);
        expect(bindResult.tag).toBe('err');
        if (bindResult.tag === 'err') expect(bindResult.val).toBe('invalid-argument');
    });

    test('UDP stream fails for unbound socket', () => {
        const result = createUdpSocket('ipv4');
        if (result.tag !== 'ok') return;
        const streamResult = result.val.stream(undefined);
        expect(streamResult.tag).toBe('err');
        if (streamResult.tag === 'err') expect(streamResult.val).toBe('invalid-state');
    });

    test('UDP socket options', () => {
        const result = createUdpSocket('ipv4');
        if (result.tag !== 'ok') return;
        const socket = result.val;

        expect(socket.addressFamily()).toBe('ipv4');
        expect(socket.unicastHopLimit().tag).toBe('ok');
        expect(socket.receiveBufferSize().tag).toBe('ok');
        expect(socket.sendBufferSize().tag).toBe('ok');

        const setHop = socket.setUnicastHopLimit(128);
        expect(setHop.tag).toBe('ok');

        const setZeroHop = socket.setUnicastHopLimit(0);
        expect(setZeroHop.tag).toBe('err');
    });
});

describe('wasi:sockets/ip-name-lookup', () => {
    test('resolveAddresses resolves localhost', async () => {
        const net = createNetwork();
        const result = resolveAddresses(net, 'localhost');
        expect(result.tag).toBe('ok');
        if (result.tag !== 'ok') return;

        const stream = result.val;

        // Wait for resolution
        const pollable = stream.subscribe();
        await waitReady(pollable);

        // Get first address
        const addr = stream.resolveNextAddress();
        expect(addr.tag).toBe('ok');
        if (addr.tag === 'ok') {
            expect(addr.val).toBeDefined();
            if (addr.val) {
                expect(addr.val.tag === 'ipv4' || addr.val.tag === 'ipv6').toBe(true);
            }
        }
    }, 10000);

    test('resolveAddresses with empty name returns error', () => {
        const net = createNetwork();
        const result = resolveAddresses(net, '');
        expect(result.tag).toBe('err');
        if (result.tag === 'err') expect(result.val).toBe('invalid-argument');
    });

    test('resolve-address-stream exhaustion', async () => {
        const net = createNetwork();
        const result = resolveAddresses(net, 'localhost');
        if (result.tag !== 'ok') return;
        const stream = result.val;

        const pollable = stream.subscribe();
        await waitReady(pollable);

        // Drain all addresses
        let count = 0;
        for (; ;) {
            const addr = stream.resolveNextAddress();
            if (addr.tag !== 'ok' || addr.val === undefined) break;
            count++;
            if (count > 100) break; // Safety
        }

        // After exhaustion, should return undefined
        const final = stream.resolveNextAddress();
        expect(final.tag).toBe('ok');
        if (final.tag === 'ok') expect(final.val).toBeUndefined();
    }, 10000);
});
