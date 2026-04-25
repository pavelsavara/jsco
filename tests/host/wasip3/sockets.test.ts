// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { createSocketsTypes, createIpNameLookup } from './sockets';

describe('Browser sockets stubs', () => {
    describe('TcpSocket', () => {
        it('TcpSocket.create throws not-supported', () => {
            const types = createSocketsTypes() as unknown as {
                TcpSocket: { create(af: string): never };
            };
            try {
                types.TcpSocket.create('ipv4');
                fail('should have thrown');
            } catch (e) {
                expect((e as { tag: string }).tag).toBe('not-supported');
                expect((e as Error).message).toContain('TCP');
            }
        });

        it('TcpSocket.create with ipv6 also throws not-supported', () => {
            const types = createSocketsTypes() as unknown as {
                TcpSocket: { create(af: string): never };
            };
            expect(() => types.TcpSocket.create('ipv6')).toThrow(/not supported/);
        });

        it('TcpSocket instance methods all throw not-supported', () => {
            const types = createSocketsTypes() as unknown as {
                TcpSocket: { prototype: Record<string, Function> };
            };
            const proto = types.TcpSocket.prototype;
            const methods = [
                'bind', 'connect', 'listen', 'send', 'receive',
                'getLocalAddress', 'getRemoteAddress', 'getIsListening',
                'getAddressFamily', 'setListenBacklogSize',
                'getKeepAliveEnabled', 'setKeepAliveEnabled',
                'getKeepAliveIdleTime', 'setKeepAliveIdleTime',
                'getKeepAliveInterval', 'setKeepAliveInterval',
                'getKeepAliveCount', 'setKeepAliveCount',
                'getHopLimit', 'setHopLimit',
                'getReceiveBufferSize', 'setReceiveBufferSize',
                'getSendBufferSize', 'setSendBufferSize',
            ];
            for (const method of methods) {
                expect(typeof proto[method]).toBe('function');
                try {
                    proto[method]();
                    fail(`${method} should have thrown`);
                } catch (e) {
                    expect((e as { tag: string }).tag).toBe('not-supported');
                }
            }
        });
    });

    describe('UdpSocket', () => {
        it('UdpSocket.create throws not-supported', () => {
            const types = createSocketsTypes() as unknown as {
                UdpSocket: { create(af: string): never };
            };
            try {
                types.UdpSocket.create('ipv4');
                fail('should have thrown');
            } catch (e) {
                expect((e as { tag: string }).tag).toBe('not-supported');
                expect((e as Error).message).toContain('UDP');
            }
        });

        it('UdpSocket instance methods all throw not-supported', () => {
            const types = createSocketsTypes() as unknown as {
                UdpSocket: { prototype: Record<string, Function> };
            };
            const proto = types.UdpSocket.prototype;
            const methods = [
                'bind', 'connect', 'disconnect', 'send', 'receive',
                'getLocalAddress', 'getRemoteAddress', 'getAddressFamily',
                'getUnicastHopLimit', 'setUnicastHopLimit',
                'getReceiveBufferSize', 'setReceiveBufferSize',
                'getSendBufferSize', 'setSendBufferSize',
            ];
            for (const method of methods) {
                expect(typeof proto[method]).toBe('function');
                try {
                    proto[method]();
                    fail(`${method} should have thrown`);
                } catch (e) {
                    expect((e as { tag: string }).tag).toBe('not-supported');
                }
            }
        });
    });

    describe('ip-name-lookup', () => {
        it('resolveAddresses throws not-supported', async () => {
            const lookup = createIpNameLookup() as unknown as {
                resolveAddresses(name: string): Promise<never>;
            };
            try {
                await lookup.resolveAddresses('example.com');
                fail('should have thrown');
            } catch (e) {
                expect((e as { tag: string }).tag).toBe('not-supported');
                expect((e as Error).message).toContain('DNS');
            }
        });
    });

    describe('cross-type confusion', () => {
        it('TcpSocket and UdpSocket are distinct types', () => {
            const types = createSocketsTypes() as unknown as {
                TcpSocket: { create(af: string): never };
                UdpSocket: { create(af: string): never };
            };
            // Both should throw, but with different messages
            try { types.TcpSocket.create('ipv4'); } catch (e) {
                expect((e as Error).message).toContain('TCP');
            }
            try { types.UdpSocket.create('ipv4'); } catch (e) {
                expect((e as Error).message).toContain('UDP');
            }
        });

        it('createSocketsTypes called twice returns independent instances', () => {
            const t1 = createSocketsTypes();
            const t2 = createSocketsTypes();
            expect(t1).not.toBe(t2);
        });
    });
});
