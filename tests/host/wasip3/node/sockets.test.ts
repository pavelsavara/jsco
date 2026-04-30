// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import * as net from 'node:net';
import { createNodeSocketsTypes, createNodeIpNameLookup } from '../../../../src/host/wasip3/node/sockets';

type IpAddressFamily = 'ipv4' | 'ipv6';
type IpSocketAddress =
    | { tag: 'ipv4'; val: { port: number; address: [number, number, number, number] } }
    | { tag: 'ipv6'; val: { port: number; flowInfo: number; address: [number, number, number, number, number, number, number, number]; scopeId: number } };
type IpAddress =
    | { tag: 'ipv4'; val: [number, number, number, number] }
    | { tag: 'ipv6'; val: [number, number, number, number, number, number, number, number] };

function ipv4Addr(port: number, a = 127, b = 0, c = 0, d = 1): IpSocketAddress {
    return { tag: 'ipv4', val: { port, address: [a, b, c, d] } };
}

describe('Node.js sockets', () => {
    describe('TcpSocket', () => {
        const types = createNodeSocketsTypes() as unknown as {
            TcpSocket: {
                create(af: IpAddressFamily): {
                    bind(addr: IpSocketAddress): void;
                    connect(addr: IpSocketAddress): Promise<void>;
                    listen(): Promise<AsyncIterable<unknown> & { close(): void }>;
                    send(data: AsyncIterable<Uint8Array>): Promise<void>;
                    receive(): [AsyncIterable<Uint8Array>, Promise<{ tag: string; val: unknown }>];
                    getLocalAddress(): IpSocketAddress;
                    getRemoteAddress(): IpSocketAddress;
                    getIsListening(): boolean;
                    getAddressFamily(): IpAddressFamily;
                    setListenBacklogSize(v: bigint): void;
                    getKeepAliveEnabled(): boolean;
                    setKeepAliveEnabled(v: boolean): void;
                    getKeepAliveIdleTime(): bigint;
                    setKeepAliveIdleTime(v: bigint): void;
                    getKeepAliveInterval(): bigint;
                    setKeepAliveInterval(v: bigint): void;
                    getKeepAliveCount(): number;
                    setKeepAliveCount(v: number): void;
                    getHopLimit(): number;
                    setHopLimit(v: number): void;
                    getReceiveBufferSize(): bigint;
                    setReceiveBufferSize(v: bigint): void;
                    getSendBufferSize(): bigint;
                    setSendBufferSize(v: bigint): void;
                };
            };
        };

        it('create returns a TcpSocket', () => {
            const sock = types.TcpSocket.create('ipv4');
            expect(sock).toBeDefined();
            expect(sock.getAddressFamily()).toBe('ipv4');
        });

        it('bind sets local address', async () => {
            const sock = types.TcpSocket.create('ipv4');
            await sock.bind(ipv4Addr(0));
            const addr = sock.getLocalAddress();
            expect(addr.tag).toBe('ipv4');
        });

        it('bind twice throws invalid-state', async () => {
            const sock = types.TcpSocket.create('ipv4');
            await sock.bind(ipv4Addr(0));
            try {
                await sock.bind(ipv4Addr(0));
                fail('should throw');
            } catch (e) {
                expect((e as { tag: string }).tag).toBe('invalid-state');
            }
        });

        it('getRemoteAddress before connect throws invalid-state', () => {
            const sock = types.TcpSocket.create('ipv4');
            try {
                sock.getRemoteAddress();
                fail('should throw');
            } catch (e) {
                expect((e as { tag: string }).tag).toBe('invalid-state');
            }
        });

        it('getIsListening is false initially', () => {
            const sock = types.TcpSocket.create('ipv4');
            expect(sock.getIsListening()).toBe(false);
        });

        describe('property getters/setters', () => {
            it('keepAlive defaults and set/get', () => {
                const sock = types.TcpSocket.create('ipv4');
                expect(sock.getKeepAliveEnabled()).toBe(false);
                sock.setKeepAliveEnabled(true);
                expect(sock.getKeepAliveEnabled()).toBe(true);
            });

            it('keepAliveIdleTime set/get', () => {
                const sock = types.TcpSocket.create('ipv4');
                const twoSeconds = 2_000_000_000n;
                sock.setKeepAliveIdleTime(twoSeconds);
                expect(sock.getKeepAliveIdleTime()).toBe(twoSeconds);
            });

            it('keepAliveInterval set/get', () => {
                const sock = types.TcpSocket.create('ipv4');
                const twoSeconds = 2_000_000_000n;
                sock.setKeepAliveInterval(twoSeconds);
                expect(sock.getKeepAliveInterval()).toBe(twoSeconds);
            });

            it('keepAliveCount set/get', () => {
                const sock = types.TcpSocket.create('ipv4');
                sock.setKeepAliveCount(5);
                expect(sock.getKeepAliveCount()).toBe(5);
            });

            it('hopLimit defaults to 64', () => {
                const sock = types.TcpSocket.create('ipv4');
                expect(sock.getHopLimit()).toBe(64);
            });

            it('setHopLimit(0) throws invalid-argument', () => {
                const sock = types.TcpSocket.create('ipv4');
                try {
                    sock.setHopLimit(0);
                    fail('should throw');
                } catch (e) {
                    expect((e as { tag: string }).tag).toBe('invalid-argument');
                }
            });

            it('receiveBufferSize set/get', () => {
                const sock = types.TcpSocket.create('ipv4');
                sock.setReceiveBufferSize(1024n);
                expect(sock.getReceiveBufferSize()).toBe(1024n);
            });

            it('setReceiveBufferSize(0) throws invalid-argument', () => {
                const sock = types.TcpSocket.create('ipv4');
                try {
                    sock.setReceiveBufferSize(0n);
                    fail('should throw');
                } catch (e) {
                    expect((e as { tag: string }).tag).toBe('invalid-argument');
                }
            });

            it('sendBufferSize set/get', () => {
                const sock = types.TcpSocket.create('ipv4');
                sock.setSendBufferSize(2048n);
                expect(sock.getSendBufferSize()).toBe(2048n);
            });

            it('setSendBufferSize(0) throws invalid-argument', () => {
                const sock = types.TcpSocket.create('ipv4');
                try {
                    sock.setSendBufferSize(0n);
                    fail('should throw');
                } catch (e) {
                    expect((e as { tag: string }).tag).toBe('invalid-argument');
                }
            });

            it('setListenBacklogSize set/get', () => {
                const sock = types.TcpSocket.create('ipv4');
                sock.setListenBacklogSize(256n);
                // no getter exposed in WIT, but shouldn't throw
            });
        });

        describe('TCP connect + send + receive (loopback)', () => {
            let echoServer: net.Server;
            let serverPort: number;
            const serverSockets: net.Socket[] = [];

            beforeAll((done) => {
                echoServer = net.createServer((socket) => {
                    serverSockets.push(socket);
                    socket.on('data', (data) => {
                        socket.write(data); // echo back
                    });
                    socket.on('end', () => {
                        socket.end();
                    });
                });
                echoServer.listen(0, '127.0.0.1', () => {
                    serverPort = (echoServer.address() as net.AddressInfo).port;
                    done();
                });
            });

            afterAll((done) => {
                for (const s of serverSockets) s.destroy();
                echoServer.close(done);
            });

            it('connect + send + receive echo', async () => {
                const sock = types.TcpSocket.create('ipv4');
                await sock.connect(ipv4Addr(serverPort));

                expect(sock.getIsListening()).toBe(false);
                expect(sock.getRemoteAddress().tag).toBe('ipv4');
                expect(sock.getLocalAddress().tag).toBe('ipv4');

                // Send data
                const testData = new TextEncoder().encode('hello TCP');
                const sendIterable = {
                    async *[Symbol.asyncIterator]() {
                        yield testData;
                    },
                };
                await sock.send(sendIterable);

                // Receive data
                const [recvStream] = sock.receive();
                const chunks: Uint8Array[] = [];
                for await (const chunk of recvStream) {
                    chunks.push(chunk);
                    if (chunks.reduce((s, c) => s + c.length, 0) >= testData.length) break;
                }
                const received = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
                let offset = 0;
                for (const chunk of chunks) {
                    received.set(chunk, offset);
                    offset += chunk.length;
                }
                expect(new TextDecoder().decode(received)).toBe('hello TCP');
            }, 10000);
        });

        describe('TCP listen + accept (loopback)', () => {
            it('listen returns accepted connections', async () => {
                const server = types.TcpSocket.create('ipv4');
                server.bind(ipv4Addr(0));
                const acceptStream = await server.listen();
                expect(server.getIsListening()).toBe(true);

                // Get the actual bound port
                const localAddr = server.getLocalAddress();
                const port = localAddr.val.port;

                // Connect a raw net.Socket as a client
                const clientSocket = await new Promise<net.Socket>((resolve, reject) => {
                    const s = net.createConnection({ host: '127.0.0.1', port }, () => resolve(s));
                    s.on('error', reject);
                });

                // Accept from the stream
                const iter = acceptStream[Symbol.asyncIterator]();
                const { value: accepted } = await iter.next();
                expect(accepted).toBeDefined();

                clientSocket.destroy();
                acceptStream.close();
            }, 10000);
        });

        describe('TCP read cancellation (backpressure)', () => {
            // Replicates wasmtime's test_tcp_read_cancellation:
            // blast 2MB in 256-byte chunks with minimized send buffer,
            // receiver polls-then-cancels to stress backpressure handling.

            interface AcceptedSocket {
                send(data: AsyncIterable<Uint8Array>): Promise<void>;
                receive(): [AsyncIterable<Uint8Array>, Promise<{ tag: string; val: unknown }>];
                setSendBufferSize(v: bigint): void;
            }

            async function setupPair(): Promise<{
                client: typeof types.TcpSocket extends { create(af: IpAddressFamily): infer R } ? R : never;
                accepted: AcceptedSocket;
                cleanup: () => void;
            }> {
                const server = types.TcpSocket.create('ipv4');
                server.bind(ipv4Addr(0));
                const acceptStream = await server.listen() as AsyncIterable<AcceptedSocket> & { close(): void };
                const port = server.getLocalAddress().val.port;

                const client = types.TcpSocket.create('ipv4');
                await client.connect(ipv4Addr(port));

                const acceptIter = acceptStream[Symbol.asyncIterator]();
                const { value: accepted } = await acceptIter.next();

                return {
                    client,
                    accepted: accepted!,
                    cleanup: () => acceptStream.close(),
                };
            }

            it('handles 2MB send in 256-byte chunks', async () => {
                const CHUNK_SIZE = 256;
                const CHUNKS = (2 << 20) / CHUNK_SIZE; // 8192 chunks = 2MB
                const TOTAL = CHUNKS * CHUNK_SIZE;

                const { client, accepted, cleanup } = await setupPair();
                client.setSendBufferSize(1024n);

                const chunk = new Uint8Array(CHUNK_SIZE);
                for (let i = 0; i < CHUNK_SIZE; i++) chunk[i] = i & 0xFF;

                const [recvStream] = accepted.receive();
                let totalReceived = 0;

                await Promise.all([
                    // Sender: blast 2MB
                    client.send({
                        async *[Symbol.asyncIterator]() {
                            for (let c = 0; c < CHUNKS; c++) {
                                yield new Uint8Array(chunk);
                            }
                        },
                    }),
                    // Receiver: consume all data, verify pattern
                    (async () => {
                        for await (const data of recvStream) {
                            for (let j = 0; j < data.length; j++) {
                                const expected = (totalReceived + j) % 256;
                                if (data[j] !== expected) {
                                    throw new Error(`Byte mismatch at offset ${totalReceived + j}: got ${data[j]}, expected ${expected}`);
                                }
                            }
                            totalReceived += data.length;
                            if (totalReceived >= TOTAL) break;
                        }
                    })(),
                ]);

                expect(totalReceived).toBe(TOTAL);
                cleanup();
            }, 30000);

            it('handles 2MB send with poll-then-cancel reads', async () => {
                // Simulates the Rust pattern: poll read once, if not ready
                // cancel and do a barrier read before retrying.
                const CHUNK_SIZE = 256;
                const CHUNKS = (2 << 20) / CHUNK_SIZE;
                const TOTAL = CHUNKS * CHUNK_SIZE;

                const { client, accepted, cleanup } = await setupPair();
                client.setSendBufferSize(1024n);

                const chunk = new Uint8Array(CHUNK_SIZE);
                for (let i = 0; i < CHUNK_SIZE; i++) chunk[i] = i & 0xFF;

                const [recvStream] = accepted.receive();
                const recvIter = recvStream[Symbol.asyncIterator]();
                let totalReceived = 0;
                let cancellations = 0;

                await Promise.all([
                    // Sender: blast 2MB
                    client.send({
                        async *[Symbol.asyncIterator]() {
                            for (let c = 0; c < CHUNKS; c++) {
                                yield new Uint8Array(chunk);
                            }
                        },
                    }),
                    // Receiver: poll-then-cancel pattern
                    (async () => {
                        while (totalReceived < TOTAL) {
                            const readPromise = recvIter.next();

                            // Race against a microtask to detect "pending"
                            const raced = await Promise.race([
                                readPromise.then(r => ({ ready: true as const, r })),
                                Promise.resolve().then(() => ({ ready: false as const, r: null })),
                            ]);

                            if (!raced.ready) {
                                // "Cancelled" — data wasn't immediately available.
                                // Do a barrier: await the original promise anyway
                                // (mirrors Rust's zero-length barrier read after cancel).
                                cancellations++;
                                const { value, done } = await readPromise;
                                if (done) break;
                                totalReceived += value.length;
                            } else {
                                const { value, done } = raced.r!;
                                if (done) break;
                                totalReceived += value.length;
                            }
                        }
                    })(),
                ]);

                expect(totalReceived).toBe(TOTAL);
                // Should have had at least some cancellations
                expect(cancellations).toBeGreaterThan(0);
                cleanup();
            }, 30000);
        });
    });

    describe('UdpSocket', () => {
        const types = createNodeSocketsTypes() as unknown as {
            UdpSocket: {
                create(af: IpAddressFamily): {
                    bind(addr: IpSocketAddress): Promise<void>;
                    connect(addr: IpSocketAddress): Promise<void>;
                    disconnect(): void;
                    send(data: Uint8Array, addr: IpSocketAddress | undefined): Promise<void>;
                    receive(): Promise<[Uint8Array, IpSocketAddress]>;
                    getLocalAddress(): IpSocketAddress;
                    getRemoteAddress(): IpSocketAddress;
                    getAddressFamily(): IpAddressFamily;
                    getUnicastHopLimit(): number;
                    setUnicastHopLimit(v: number): void;
                    getReceiveBufferSize(): bigint;
                    setReceiveBufferSize(v: bigint): void;
                    getSendBufferSize(): bigint;
                    setSendBufferSize(v: bigint): void;
                    close(): void;
                };
            };
        };

        it('create returns a UdpSocket', () => {
            const sock = types.UdpSocket.create('ipv4');
            expect(sock).toBeDefined();
            expect(sock.getAddressFamily()).toBe('ipv4');
            sock.close();
        });

        it('getLocalAddress before bind throws invalid-state', () => {
            const sock = types.UdpSocket.create('ipv4');
            try {
                sock.getLocalAddress();
                fail('should throw');
            } catch (e) {
                expect((e as { tag: string }).tag).toBe('invalid-state');
            }
            sock.close();
        });

        it('getRemoteAddress before connect throws invalid-state', () => {
            const sock = types.UdpSocket.create('ipv4');
            try {
                sock.getRemoteAddress();
                fail('should throw');
            } catch (e) {
                expect((e as { tag: string }).tag).toBe('invalid-state');
            }
            sock.close();
        });

        it('disconnect before connect throws invalid-state', () => {
            const sock = types.UdpSocket.create('ipv4');
            try {
                sock.disconnect();
                fail('should throw');
            } catch (e) {
                expect((e as { tag: string }).tag).toBe('invalid-state');
            }
            sock.close();
        });

        describe('property getters/setters', () => {
            it('unicastHopLimit defaults to 64', () => {
                const sock = types.UdpSocket.create('ipv4');
                expect(sock.getUnicastHopLimit()).toBe(64);
                sock.close();
            });

            it('setUnicastHopLimit(0) throws invalid-argument', () => {
                const sock = types.UdpSocket.create('ipv4');
                try {
                    sock.setUnicastHopLimit(0);
                    fail('should throw');
                } catch (e) {
                    expect((e as { tag: string }).tag).toBe('invalid-argument');
                }
                sock.close();
            });
        });

        describe('UDP send + receive (loopback)', () => {
            it('send and receive datagrams', async () => {
                const sender = types.UdpSocket.create('ipv4');
                const receiver = types.UdpSocket.create('ipv4');

                // Bind receiver to random port on loopback
                await receiver.bind(ipv4Addr(0));
                const recvAddr = receiver.getLocalAddress();
                const recvPort = recvAddr.val.port;

                // Bind sender to random port on loopback
                await sender.bind(ipv4Addr(0));

                // Start listening for a message
                const recvPromise = receiver.receive();

                // Send data
                const testData = new TextEncoder().encode('hello UDP');
                await sender.send(testData, ipv4Addr(recvPort));

                // Receive data
                const [data, srcAddr] = await recvPromise;
                expect(new TextDecoder().decode(data)).toBe('hello UDP');
                expect(srcAddr.tag).toBe('ipv4');

                sender.close();
                receiver.close();
            }, 10000);

            it('connect + send without address + receive', async () => {
                const sender = types.UdpSocket.create('ipv4');
                const receiver = types.UdpSocket.create('ipv4');

                await receiver.bind(ipv4Addr(0));
                const recvPort = receiver.getLocalAddress().val.port;

                // Connect sender to receiver
                await sender.connect(ipv4Addr(recvPort));
                expect(sender.getRemoteAddress().tag).toBe('ipv4');

                const recvPromise = receiver.receive();
                const testData = new TextEncoder().encode('connected UDP');
                await sender.send(testData, undefined);

                const [data] = await recvPromise;
                expect(new TextDecoder().decode(data)).toBe('connected UDP');

                // Disconnect
                sender.disconnect();
                try {
                    sender.getRemoteAddress();
                    fail('should throw');
                } catch (e) {
                    expect((e as { tag: string }).tag).toBe('invalid-state');
                }

                sender.close();
                receiver.close();
            }, 10000);
        });
    });

    describe('ip-name-lookup', () => {
        const lookup = createNodeIpNameLookup() as unknown as {
            resolveAddresses(name: string): Promise<IpAddress[]>;
        };

        it('resolves localhost', async () => {
            const result = await lookup.resolveAddresses('localhost') as unknown as { tag: string; val: IpAddress[] };
            expect(result.tag).toBe('ok');
            const results = result.val;
            expect(results.length).toBeGreaterThan(0);
            // localhost should resolve to 127.0.0.1 or ::1
            const hasIpv4 = results.some(r => r.tag === 'ipv4');
            const hasIpv6 = results.some(r => r.tag === 'ipv6');
            expect(hasIpv4 || hasIpv6).toBe(true);
        });

        it('parses raw IPv4 address', async () => {
            const result = await lookup.resolveAddresses('192.168.1.1') as unknown as { tag: string; val: IpAddress[] };
            expect(result).toEqual({ tag: 'ok', val: [{ tag: 'ipv4', val: [192, 168, 1, 1] }] });
        });

        it('parses raw IPv6 address', async () => {
            const result = await lookup.resolveAddresses('::1') as unknown as { tag: string; val: IpAddress[] };
            expect(result).toEqual({ tag: 'ok', val: [{ tag: 'ipv6', val: [0, 0, 0, 0, 0, 0, 0, 1] }] });
        });

        it('returns error for invalid name', async () => {
            const result = await lookup.resolveAddresses('this-does-not-exist-at-all.invalid') as unknown as { tag: string; val: { tag: string } };
            expect(result.tag).toBe('err');
            expect(result.val.tag).toBeDefined();
        });

        it('returns error for empty hostname', async () => {
            const result = await lookup.resolveAddresses('') as unknown as { tag: string; val: { tag: string } };
            expect(result.tag).toBe('err');
            expect(result.val.tag).toBeDefined();
        });

        it('resolves IP literal 127.0.0.1 to same address', async () => {
            const result = await lookup.resolveAddresses('127.0.0.1') as unknown as { tag: string; val: IpAddress[] };
            expect(result).toEqual({ tag: 'ok', val: [{ tag: 'ipv4', val: [127, 0, 0, 1] }] });
        });

        it('rejects hostname with null byte', async () => {
            try {
                await lookup.resolveAddresses('evil.com\x00.example.com');
                fail('should throw');
            } catch (e) {
                // Node.js may throw a plain Error or a tagged error
                expect(e).toBeDefined();
            }
        });

        it('returns error for very long hostname', async () => {
            const result = await lookup.resolveAddresses('A'.repeat(300)) as unknown as { tag: string; val: { tag: string } };
            expect(result.tag).toBe('err');
            expect(result.val.tag).toBeDefined();
        });

        it('concurrent DNS resolutions complete independently', async () => {
            const [r1, r2] = await Promise.all([
                lookup.resolveAddresses('127.0.0.1'),
                lookup.resolveAddresses('::1'),
            ]) as unknown as { tag: string; val: IpAddress[] }[];
            expect(r1.tag).toBe('ok');
            expect(r1.val.length).toBeGreaterThan(0);
            expect(r2.tag).toBe('ok');
            expect(r2.val.length).toBeGreaterThan(0);
        });
    });

    describe('TCP error paths', () => {
        const types = createNodeSocketsTypes() as unknown as {
            TcpSocket: {
                create(af: IpAddressFamily): {
                    bind(addr: IpSocketAddress): void;
                    connect(addr: IpSocketAddress): Promise<void>;
                    listen(): Promise<AsyncIterable<unknown> & { close(): void }>;
                    send(data: AsyncIterable<Uint8Array>): Promise<void>;
                    receive(): [AsyncIterable<Uint8Array>, Promise<{ tag: string; val: unknown }>];
                    getLocalAddress(): IpSocketAddress;
                    getRemoteAddress(): IpSocketAddress;
                    getIsListening(): boolean;
                    getAddressFamily(): IpAddressFamily;
                    setHopLimit(v: number): void;
                };
            };
        };

        it('connect to unreachable port rejects', async () => {
            const sock = types.TcpSocket.create('ipv4');
            // Port 1 on loopback is almost certainly not listening
            await expect(sock.connect(ipv4Addr(1))).rejects.toBeDefined();
        }, 10000);

        it('setHopLimit(0) throws invalid-argument', () => {
            const sock = types.TcpSocket.create('ipv4');
            try {
                sock.setHopLimit(0);
                fail('should throw');
            } catch (e) {
                expect((e as { tag: string }).tag).toBe('invalid-argument');
            }
        });

        it('setHopLimit(255) is accepted (max valid TTL)', () => {
            const sock = types.TcpSocket.create('ipv4');
            sock.setHopLimit(255);
            expect(sock.getAddressFamily()).toBe('ipv4'); // didn't throw
        });

        it('IPv6 socket creation works', () => {
            const sock = types.TcpSocket.create('ipv6');
            expect(sock.getAddressFamily()).toBe('ipv6');
        });
    });

    describe('UDP error paths', () => {
        const types = createNodeSocketsTypes() as unknown as {
            UdpSocket: {
                create(af: IpAddressFamily): {
                    bind(addr: IpSocketAddress): Promise<void>;
                    send(data: Uint8Array, addr: IpSocketAddress | undefined): Promise<void>;
                    receive(): Promise<[Uint8Array, IpSocketAddress]>;
                    getLocalAddress(): IpSocketAddress;
                    getAddressFamily(): IpAddressFamily;
                    close(): void;
                };
            };
        };

        it('send empty data succeeds when bound', async () => {
            const sender = types.UdpSocket.create('ipv4');
            const receiver = types.UdpSocket.create('ipv4');
            await receiver.bind(ipv4Addr(0));
            const recvPort = (receiver.getLocalAddress() as IpSocketAddress).val.port;
            await sender.bind(ipv4Addr(0));
            // Sending empty data is valid
            await sender.send(new Uint8Array(0), ipv4Addr(recvPort));
            sender.close();
            receiver.close();
        }, 10000);

        it('IPv6 UDP socket creation works', () => {
            const sock = types.UdpSocket.create('ipv6');
            expect(sock.getAddressFamily()).toBe('ipv6');
            sock.close();
        });
    });
});
