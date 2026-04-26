// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * Tests for wasi:sockets/* P2-via-P3 adapter functions.
 * Exercises adaptTcpCreateSocket, adaptUdpCreateSocket, adaptIpNameLookup,
 * adaptInstanceNetwork, and adaptNetwork.
 */

import {
    adaptTcpCreateSocket, adaptUdpCreateSocket, adaptIpNameLookup,
    adaptInstanceNetwork, adaptNetwork,
} from '../../../src/host/wasip2-via-wasip3/sockets';
import type { WasiP3Imports } from '../../../wit/wasip3/types/index';

function mockP3(socketTypes: Record<string, unknown> = {}, lookup: Record<string, unknown> = {}): WasiP3Imports {
    return {
        'wasi:sockets/types': socketTypes,
        'wasi:sockets/ip-name-lookup': lookup,
    } as unknown as WasiP3Imports;
}

describe('adaptInstanceNetwork', () => {
    it('returns an object', () => {
        const { instanceNetwork } = adaptInstanceNetwork();
        expect(typeof instanceNetwork()).toBe('object');
    });
});

describe('adaptNetwork', () => {
    it('networkErrorCode returns undefined', () => {
        const { networkErrorCode } = adaptNetwork();
        expect(networkErrorCode()).toBeUndefined();
    });
});

describe('adaptTcpCreateSocket', () => {
    it('returns not-supported when TcpSocket.create is missing', () => {
        const p3 = mockP3({});
        const { createTcpSocket } = adaptTcpCreateSocket(p3);
        const result = createTcpSocket('ipv4');
        expect(result.tag).toBe('err');
        expect(result.val).toBe('not-supported');
    });

    it('returns ok when TcpSocket.create succeeds', () => {
        const p3 = mockP3({ TcpSocket: { create: (f: string) => ({ family: f }) } });
        const { createTcpSocket } = adaptTcpCreateSocket(p3);
        const result = createTcpSocket('ipv4');
        expect(result.tag).toBe('ok');
        if (result.tag === 'ok') {
            expect(result.val).toEqual({ family: 'ipv4' });
        }
    });

    it('returns not-supported when TcpSocket.create throws', () => {
        const p3 = mockP3({ TcpSocket: { create: () => { throw new Error('nope'); } } });
        const { createTcpSocket } = adaptTcpCreateSocket(p3);
        const result = createTcpSocket('ipv6');
        expect(result.tag).toBe('err');
        expect(result.val).toBe('not-supported');
    });

    it('returns not-supported when TcpSocket exists but create is null', () => {
        const p3 = mockP3({ TcpSocket: { create: null } });
        const { createTcpSocket } = adaptTcpCreateSocket(p3);
        const result = createTcpSocket('ipv4');
        expect(result.tag).toBe('err');
    });
});

describe('adaptUdpCreateSocket', () => {
    it('returns not-supported when UdpSocket.create is missing', () => {
        const p3 = mockP3({});
        const { createUdpSocket } = adaptUdpCreateSocket(p3);
        const result = createUdpSocket('ipv4');
        expect(result.tag).toBe('err');
        expect(result.val).toBe('not-supported');
    });

    it('returns ok when UdpSocket.create succeeds', () => {
        const p3 = mockP3({ UdpSocket: { create: (f: string) => ({ family: f }) } });
        const { createUdpSocket } = adaptUdpCreateSocket(p3);
        const result = createUdpSocket('ipv6');
        expect(result.tag).toBe('ok');
    });

    it('returns not-supported when UdpSocket.create throws', () => {
        const p3 = mockP3({ UdpSocket: { create: () => { throw new Error('nope'); } } });
        const { createUdpSocket } = adaptUdpCreateSocket(p3);
        const result = createUdpSocket('ipv4');
        expect(result.tag).toBe('err');
    });
});

describe('adaptIpNameLookup', () => {
    it('returns resolve stream on success', () => {
        const p3 = mockP3({}, { resolveAddresses: () => Promise.resolve([{ tag: 'ipv4', val: [127, 0, 0, 1] }]) });
        const { resolveAddresses } = adaptIpNameLookup(p3);
        const result = resolveAddresses({}, 'localhost');
        expect(result.tag).toBe('ok');
    });

    it('returns not-supported when resolveAddresses throws', () => {
        const p3 = mockP3({}, { resolveAddresses: () => { throw new Error('nope'); } });
        const { resolveAddresses } = adaptIpNameLookup(p3);
        const result = resolveAddresses({}, 'localhost');
        expect(result.tag).toBe('err');
    });

    it('resolve stream: resolveNextAddress returns would-block before resolution', () => {
        const p3 = mockP3({}, { resolveAddresses: () => new Promise(() => { /* never resolves */ }) });
        const { resolveAddresses } = adaptIpNameLookup(p3);
        const result = resolveAddresses({}, 'example.com');
        if (result.tag !== 'ok') throw new Error('expected ok');
        const stream = result.val as { resolveNextAddress(): { tag: string; val?: unknown }; subscribe(): { ready(): boolean; block(): void } };
        expect(stream.resolveNextAddress().tag).toBe('err');
        expect(stream.resolveNextAddress().val).toBe('would-block');
    });

    it('resolve stream: returns addresses after resolution', async () => {
        const addrs = [{ tag: 'ipv4', val: [1, 2, 3, 4] }, { tag: 'ipv4', val: [5, 6, 7, 8] }];
        const p3 = mockP3({}, { resolveAddresses: () => Promise.resolve(addrs) });
        const { resolveAddresses } = adaptIpNameLookup(p3);
        const result = resolveAddresses({}, 'example.com');
        if (result.tag !== 'ok') throw new Error('expected ok');
        const stream = result.val as { resolveNextAddress(): { tag: string; val?: unknown }; subscribe(): { ready(): boolean; block(): void } };
        await new Promise(r => setTimeout(r, 10));
        expect(stream.subscribe().ready()).toBe(true);
        const r1 = stream.resolveNextAddress();
        expect(r1.tag).toBe('ok');
        expect(r1.val).toEqual(addrs[0]);
        const r2 = stream.resolveNextAddress();
        expect(r2.tag).toBe('ok');
        expect(r2.val).toEqual(addrs[1]);
        // Past end
        const r3 = stream.resolveNextAddress();
        expect(r3.tag).toBe('ok');
        expect(r3.val).toBeUndefined();
    });

    it('resolve stream: handles rejection gracefully', async () => {
        const p3 = mockP3({}, { resolveAddresses: () => Promise.reject(new Error('dns fail')) });
        const { resolveAddresses } = adaptIpNameLookup(p3);
        const result = resolveAddresses({}, 'bad.example');
        if (result.tag !== 'ok') throw new Error('expected ok');
        const stream = result.val as { resolveNextAddress(): { tag: string; val?: unknown }; subscribe(): { ready(): boolean; block(): void } };
        await new Promise(r => setTimeout(r, 10));
        // After rejection, stream should be resolved (empty addresses)
        expect(stream.subscribe().ready()).toBe(true);
        const r1 = stream.resolveNextAddress();
        expect(r1.tag).toBe('ok');
        expect(r1.val).toBeUndefined(); // empty address list
    });

    it('resolve stream: subscribe.block throws when not resolved', () => {
        const p3 = mockP3({}, { resolveAddresses: () => new Promise(() => { }) });
        const { resolveAddresses } = adaptIpNameLookup(p3);
        const result = resolveAddresses({}, 'example.com');
        if (result.tag !== 'ok') throw new Error('expected ok');
        const stream = result.val as { resolveNextAddress(): { tag: string; val?: unknown }; subscribe(): { ready(): boolean; block(): void } };
        const pollable = stream.subscribe();
        expect(pollable.ready()).toBe(false);
        expect(() => pollable.block()).toThrow('not-supported');
    });

    it('resolve stream: subscribe.block is noop when resolved', async () => {
        const p3 = mockP3({}, { resolveAddresses: () => Promise.resolve([]) });
        const { resolveAddresses } = adaptIpNameLookup(p3);
        const result = resolveAddresses({}, 'example.com');
        if (result.tag !== 'ok') throw new Error('expected ok');
        const stream = result.val as { resolveNextAddress(): { tag: string; val?: unknown }; subscribe(): { ready(): boolean; block(): void } };
        await new Promise(r => setTimeout(r, 10));
        expect(() => stream.subscribe().block()).not.toThrow();
    });
});
