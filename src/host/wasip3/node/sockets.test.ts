// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import * as net from 'node:net';
import { createNodeSocketsTypes, createNodeIpNameLookup } from './sockets';

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

        it('bind sets local address', () => {
            const sock = types.TcpSocket.create('ipv4');
            sock.bind(ipv4Addr(0));
            expect(sock.getLocalAddress()).toEqual(ipv4Addr(0));
        });

        it('bind twice throws invalid-state', () => {
            const sock = types.TcpSocket.create('ipv4');
            sock.bind(ipv4Addr(0));
            try {
                sock.bind(ipv4Addr(0));
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
                sock.setKeepAliveIdleTime(1000n);
                expect(sock.getKeepAliveIdleTime()).toBe(1000n);
            });

            it('keepAliveInterval set/get', () => {
                const sock = types.TcpSocket.create('ipv4');
                sock.setKeepAliveInterval(500n);
                expect(sock.getKeepAliveInterval()).toBe(500n);
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
            const results = await lookup.resolveAddresses('localhost');
            expect(results.length).toBeGreaterThan(0);
            // localhost should resolve to 127.0.0.1 or ::1
            const hasIpv4 = results.some(r => r.tag === 'ipv4');
            const hasIpv6 = results.some(r => r.tag === 'ipv6');
            expect(hasIpv4 || hasIpv6).toBe(true);
        });

        it('parses raw IPv4 address', async () => {
            const results = await lookup.resolveAddresses('192.168.1.1');
            expect(results).toEqual([{ tag: 'ipv4', val: [192, 168, 1, 1] }]);
        });

        it('parses raw IPv6 address', async () => {
            const results = await lookup.resolveAddresses('::1');
            expect(results).toEqual([{ tag: 'ipv6', val: [0, 0, 0, 0, 0, 0, 0, 1] }]);
        });

        it('throws for invalid name', async () => {
            try {
                await lookup.resolveAddresses('this-does-not-exist-at-all.invalid');
                fail('should throw');
            } catch (e) {
                expect((e as { tag: string }).tag).toBeDefined();
            }
        });
    });
});
