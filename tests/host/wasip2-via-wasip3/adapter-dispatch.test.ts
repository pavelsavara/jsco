// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * Tests that exercise the P2-via-P3 adapter method dispatch wrappers.
 * These thin wrappers in index.ts forward [method]X.Y(self, ...) calls
 * to self.Y(...). Each test creates a mock object and calls through
 * the adapter to cover the dispatch function.
 */

import { createWasiP2ViaP3Adapter } from '../../../src/host/wasip2-via-wasip3/index';
import { createMockP3 } from './test-helpers';
import { createInputStream, createOutputStream } from '../../../src/host/wasip2-via-wasip3/io';
import type { WasiPollable } from '../../../src/host/wasip2-via-wasip3/io';

function getAdapter() {
    return createWasiP2ViaP3Adapter(createMockP3());
}

// ─── wasi:io/poll ───

describe('wasi:io/poll adapter dispatch', () => {
    it('[method]pollable.ready dispatches to self.ready()', () => {
        const host = getAdapter();
        const ioPoll = host['wasi:io/poll']!;
        const pollable: WasiPollable = { ready: () => true, block: () => { } };
        expect(ioPoll['[method]pollable.ready']!(pollable)).toBe(true);
    });

    it('[method]pollable.block dispatches to self.block()', () => {
        const host = getAdapter();
        const ioPoll = host['wasi:io/poll']!;
        let blockCalled = false;
        const pollable: WasiPollable = { ready: () => true, block: () => { blockCalled = true; } };
        ioPoll['[method]pollable.block']!(pollable);
        expect(blockCalled).toBe(true);
    });

    it('[resource-drop]pollable is a no-op', () => {
        const host = getAdapter();
        const ioPoll = host['wasi:io/poll']!;
        expect(() => ioPoll['[resource-drop]pollable']!({})).not.toThrow();
    });

    it('poll function works with ready pollables', () => {
        const host = getAdapter();
        const ioPoll = host['wasi:io/poll']!;
        const p1: WasiPollable = { ready: () => false, block: () => { } };
        const p2: WasiPollable = { ready: () => true, block: () => { } };
        const result = ioPoll['poll']!([p1, p2]) as Uint32Array;
        expect(result).toContain(1);
    });
});

// ─── wasi:io/error ───

describe('wasi:io/error adapter dispatch', () => {
    it('[method]error.to-debug-string dispatches', () => {
        const host = getAdapter();
        const ioError = host['wasi:io/error']!;
        const err = { toDebugString: () => 'test-error' };
        expect(ioError['[method]error.to-debug-string']!(err)).toBe('test-error');
    });

    it('[resource-drop]error is a no-op', () => {
        const host = getAdapter();
        expect(() => host['wasi:io/error']!['[resource-drop]error']!({})).not.toThrow();
    });
});

// ─── wasi:io/streams ───

describe('wasi:io/streams adapter dispatch', () => {
    function getStreams() {
        return getAdapter()['wasi:io/streams']!;
    }

    it('[method]input-stream.read dispatches', () => {
        const streams = getStreams();
        const is = createInputStream(new Uint8Array([1, 2, 3]));
        const result = streams['[method]input-stream.read']!(is, 2n);
        expect(result.tag).toBe('ok');
    });

    it('[method]input-stream.blocking-read dispatches', () => {
        const streams = getStreams();
        const is = createInputStream(new Uint8Array([1, 2, 3]));
        const result = streams['[method]input-stream.blocking-read']!(is, 2n);
        expect(result.tag).toBe('ok');
    });

    it('[method]input-stream.skip dispatches', () => {
        const streams = getStreams();
        const is = createInputStream(new Uint8Array([1, 2, 3]));
        const result = streams['[method]input-stream.skip']!(is, 1n);
        expect(result.tag).toBe('ok');
    });

    it('[method]input-stream.blocking-skip dispatches', () => {
        const streams = getStreams();
        const is = createInputStream(new Uint8Array([1, 2, 3]));
        const result = streams['[method]input-stream.blocking-skip']!(is, 1n);
        expect(result.tag).toBe('ok');
    });

    it('[method]input-stream.subscribe dispatches', () => {
        const streams = getStreams();
        const is = createInputStream(new Uint8Array([1]));
        const pollable = streams['[method]input-stream.subscribe']!(is) as WasiPollable;
        expect(pollable.ready()).toBe(true);
    });

    it('[resource-drop]input-stream is a no-op', () => {
        const streams = getStreams();
        expect(() => streams['[resource-drop]input-stream']!({})).not.toThrow();
    });

    it('[method]output-stream.check-write dispatches', () => {
        const streams = getStreams();
        const os = createOutputStream();
        const result = streams['[method]output-stream.check-write']!(os);
        expect(result.tag).toBe('ok');
    });

    it('[method]output-stream.write dispatches', () => {
        const streams = getStreams();
        const os = createOutputStream();
        const result = streams['[method]output-stream.write']!(os, new Uint8Array([1, 2]));
        expect(result.tag).toBe('ok');
    });

    it('[method]output-stream.blocking-write-and-flush dispatches', () => {
        const streams = getStreams();
        const flushed: Uint8Array[] = [];
        const os = createOutputStream(b => flushed.push(b));
        const result = streams['[method]output-stream.blocking-write-and-flush']!(os, new Uint8Array([1]));
        expect(result.tag).toBe('ok');
    });

    it('[method]output-stream.flush dispatches', () => {
        const streams = getStreams();
        const os = createOutputStream();
        const result = streams['[method]output-stream.flush']!(os);
        expect(result.tag).toBe('ok');
    });

    it('[method]output-stream.blocking-flush dispatches', () => {
        const streams = getStreams();
        const os = createOutputStream();
        const result = streams['[method]output-stream.blocking-flush']!(os);
        expect(result.tag).toBe('ok');
    });

    it('[method]output-stream.write-zeroes dispatches', () => {
        const streams = getStreams();
        const os = createOutputStream();
        const result = streams['[method]output-stream.write-zeroes']!(os, 3n);
        expect(result.tag).toBe('ok');
    });

    it('[method]output-stream.blocking-write-zeroes-and-flush dispatches', () => {
        const streams = getStreams();
        const flushed: Uint8Array[] = [];
        const os = createOutputStream(b => flushed.push(b));
        const result = streams['[method]output-stream.blocking-write-zeroes-and-flush']!(os, 2n);
        expect(result.tag).toBe('ok');
    });

    it('[method]output-stream.splice dispatches', () => {
        const streams = getStreams();
        const is = createInputStream(new Uint8Array([1, 2, 3]));
        const os = createOutputStream();
        const result = streams['[method]output-stream.splice']!(os, is, 2n);
        expect(result.tag).toBe('ok');
    });

    it('[method]output-stream.blocking-splice dispatches', () => {
        const streams = getStreams();
        const is = createInputStream(new Uint8Array([1, 2, 3]));
        const os = createOutputStream();
        const result = streams['[method]output-stream.blocking-splice']!(os, is, 2n);
        expect(result.tag).toBe('ok');
    });

    it('[method]output-stream.subscribe dispatches', () => {
        const streams = getStreams();
        const os = createOutputStream();
        const pollable = streams['[method]output-stream.subscribe']!(os) as WasiPollable;
        expect(typeof pollable.ready).toBe('function');
    });

    it('[resource-drop]output-stream is a no-op', () => {
        const streams = getStreams();
        expect(() => streams['[resource-drop]output-stream']!({})).not.toThrow();
    });
});

// ─── wasi:filesystem/types ───

describe('wasi:filesystem/types adapter dispatch', () => {
    function getFs() {
        return getAdapter()['wasi:filesystem/types']!;
    }

    it('filesystem-error-code returns undefined', () => {
        expect(getFs()['filesystem-error-code']!()).toBeUndefined();
    });

    it('[resource-drop]descriptor is a no-op', () => {
        expect(() => getFs()['[resource-drop]descriptor']!({})).not.toThrow();
    });

    it('[resource-drop]directory-entry-stream is a no-op', () => {
        expect(() => getFs()['[resource-drop]directory-entry-stream']!({})).not.toThrow();
    });

    it('[method]descriptor.get-type dispatches', () => {
        const desc = { getType: () => 'regular-file' };
        expect(getFs()['[method]descriptor.get-type']!(desc)).toBe('regular-file');
    });

    it('[method]descriptor.stat dispatches', () => {
        const stat = { type: 'regular-file', size: 100n };
        const desc = { stat: () => stat };
        expect(getFs()['[method]descriptor.stat']!(desc)).toBe(stat);
    });

    it('[method]descriptor.stat-at dispatches', () => {
        const stat = { type: 'directory', size: 0n };
        const desc = { statAt: (_pf: unknown, _p: string) => stat };
        expect(getFs()['[method]descriptor.stat-at']!(desc, {}, 'test')).toBe(stat);
    });

    it('[method]descriptor.read dispatches', () => {
        const data = new Uint8Array([1, 2]);
        const desc = { read: (_len: bigint, _off: bigint) => ({ tag: 'ok', val: [data, false] }) };
        const result = getFs()['[method]descriptor.read']!(desc, 2n, 0n);
        expect(result.tag).toBe('ok');
    });

    it('[method]descriptor.write dispatches', () => {
        const desc = { write: (_buf: Uint8Array, _off: bigint) => ({ tag: 'ok', val: 5n }) };
        const result = getFs()['[method]descriptor.write']!(desc, new Uint8Array(5), 0n);
        expect(result.tag).toBe('ok');
    });

    it('[method]descriptor.read-via-stream dispatches', () => {
        const mockStream = { read: () => ({ tag: 'ok', val: new Uint8Array(0) }) };
        const desc = { readViaStream: (_off: bigint) => mockStream };
        const result = getFs()['[method]descriptor.read-via-stream']!(desc, 0n);
        expect(result).toBe(mockStream);
    });

    it('[method]descriptor.write-via-stream dispatches', () => {
        const mockStream = { write: () => ({ tag: 'ok' }) };
        const desc = { writeViaStream: (_off: bigint) => mockStream };
        const result = getFs()['[method]descriptor.write-via-stream']!(desc, 0n);
        expect(result).toBe(mockStream);
    });

    it('[method]descriptor.append-via-stream dispatches', () => {
        const mockStream = { write: () => ({ tag: 'ok' }) };
        const desc = { appendViaStream: () => mockStream };
        const result = getFs()['[method]descriptor.append-via-stream']!(desc);
        expect(result).toBe(mockStream);
    });

    it('[method]descriptor.open-at dispatches', () => {
        const child = { getType: () => 'regular-file' };
        const desc = { openAt: () => ({ tag: 'ok', val: child }) };
        const result = getFs()['[method]descriptor.open-at']!(desc, {}, 'file.txt', {}, {});
        expect(result.tag).toBe('ok');
    });

    it('[method]descriptor.read-directory dispatches', () => {
        const dirStream = { readDirectoryEntry: () => null };
        const desc = { readDirectory: () => dirStream };
        expect(getFs()['[method]descriptor.read-directory']!(desc)).toBe(dirStream);
    });

    it('[method]descriptor.create-directory-at dispatches', () => {
        const desc = { createDirectoryAt: (p: string) => ({ tag: 'ok', val: p }) };
        const result = getFs()['[method]descriptor.create-directory-at']!(desc, 'subdir');
        expect(result.tag).toBe('ok');
    });

    it('[method]descriptor.remove-directory-at dispatches', () => {
        const desc = { removeDirectoryAt: () => ({ tag: 'ok' }) };
        expect(getFs()['[method]descriptor.remove-directory-at']!(desc, 'dir').tag).toBe('ok');
    });

    it('[method]descriptor.unlink-file-at dispatches', () => {
        const desc = { unlinkFileAt: () => ({ tag: 'ok' }) };
        expect(getFs()['[method]descriptor.unlink-file-at']!(desc, 'f').tag).toBe('ok');
    });

    it('[method]descriptor.get-flags dispatches', () => {
        const desc = { getFlags: () => ({ read: true, write: false }) };
        const result = getFs()['[method]descriptor.get-flags']!(desc);
        expect(result.read).toBe(true);
    });

    it('[method]descriptor.set-size dispatches', () => {
        const desc = { setSize: () => ({ tag: 'ok' }) };
        expect(getFs()['[method]descriptor.set-size']!(desc, 0n).tag).toBe('ok');
    });

    it('[method]descriptor.sync dispatches', () => {
        const desc = { sync: () => ({ tag: 'ok' }) };
        expect(getFs()['[method]descriptor.sync']!(desc).tag).toBe('ok');
    });

    it('[method]descriptor.sync-data dispatches', () => {
        const desc = { syncData: () => ({ tag: 'ok' }) };
        expect(getFs()['[method]descriptor.sync-data']!(desc).tag).toBe('ok');
    });

    it('[method]descriptor.metadata-hash dispatches', () => {
        const desc = { metadataHash: () => ({ upper: 0n, lower: 0n }) };
        const result = getFs()['[method]descriptor.metadata-hash']!(desc);
        expect(result.upper).toBe(0n);
    });

    it('[method]descriptor.metadata-hash-at dispatches', () => {
        const desc = { metadataHashAt: () => ({ upper: 1n, lower: 2n }) };
        const result = getFs()['[method]descriptor.metadata-hash-at']!(desc, {}, 'file');
        expect(result.upper).toBe(1n);
    });

    it('[method]descriptor.rename-at dispatches', () => {
        const desc = { renameAt: () => ({ tag: 'ok' }) };
        expect(getFs()['[method]descriptor.rename-at']!(desc, 'old', desc, 'new').tag).toBe('ok');
    });

    it('[method]descriptor.link-at dispatches', () => {
        const desc = { linkAt: () => ({ tag: 'ok' }) };
        expect(getFs()['[method]descriptor.link-at']!(desc, {}, 'old', desc, 'new').tag).toBe('ok');
    });

    it('[method]descriptor.readlink-at dispatches', () => {
        const desc = { readlinkAt: () => ({ tag: 'ok', val: '/target' }) };
        expect(getFs()['[method]descriptor.readlink-at']!(desc, 'link').tag).toBe('ok');
    });

    it('[method]descriptor.symlink-at dispatches', () => {
        const desc = { symlinkAt: () => ({ tag: 'ok' }) };
        expect(getFs()['[method]descriptor.symlink-at']!(desc, '/target', 'link').tag).toBe('ok');
    });

    it('[method]descriptor.set-times dispatches', () => {
        const desc = { setTimes: () => ({ tag: 'ok' }) };
        const ts = { tag: 'no-change' };
        expect(getFs()['[method]descriptor.set-times']!(desc, ts, ts).tag).toBe('ok');
    });

    it('[method]descriptor.set-times-at dispatches', () => {
        const desc = { setTimesAt: () => ({ tag: 'ok' }) };
        const ts = { tag: 'no-change' };
        expect(getFs()['[method]descriptor.set-times-at']!(desc, {}, 'f', ts, ts).tag).toBe('ok');
    });

    it('[method]descriptor.is-same-object dispatches', () => {
        const desc = { isSameObject: (other: unknown) => other === desc };
        expect(getFs()['[method]descriptor.is-same-object']!(desc, desc)).toBe(true);
    });

    it('[method]descriptor.advise dispatches', () => {
        const desc = { advise: () => ({ tag: 'ok' }) };
        expect(getFs()['[method]descriptor.advise']!(desc, 0n, 100n, 'normal').tag).toBe('ok');
    });

    it('[method]directory-entry-stream.read-directory-entry dispatches', () => {
        const stream = { readDirectoryEntry: () => ({ tag: 'ok', val: { name: 'test', type: 'regular-file' } }) };
        const result = getFs()['[method]directory-entry-stream.read-directory-entry']!(stream);
        expect(result.tag).toBe('ok');
    });
});

// ─── wasi:filesystem/preopens ───

describe('wasi:filesystem/preopens adapter dispatch', () => {
    it('get-directories returns empty array from mock', () => {
        const host = getAdapter();
        const dirs = host['wasi:filesystem/preopens']!['get-directories']!();
        expect(Array.isArray(dirs)).toBe(true);
    });
});

// ─── wasi:sockets/* ───

describe('wasi:sockets adapter dispatch', () => {
    it('instance-network returns an object', () => {
        const host = getAdapter();
        const net = host['wasi:sockets/instance-network']!['instance-network']!();
        expect(typeof net).toBe('object');
    });

    it('network-error-code returns undefined', () => {
        const host = getAdapter();
        expect(host['wasi:sockets/network']!['network-error-code']!()).toBeUndefined();
    });

    it('[resource-drop]network is a no-op', () => {
        const host = getAdapter();
        expect(() => host['wasi:sockets/network']!['[resource-drop]network']!({})).not.toThrow();
    });

    it('tcp-create-socket returns err not-supported from mock', () => {
        const host = getAdapter();
        const result = host['wasi:sockets/tcp-create-socket']!['create-tcp-socket']!('ipv4');
        expect(result.tag).toBe('err');
    });

    it('udp-create-socket returns err not-supported from mock', () => {
        const host = getAdapter();
        const result = host['wasi:sockets/udp-create-socket']!['create-udp-socket']!('ipv4');
        expect(result.tag).toBe('err');
    });

    it('[resource-drop]tcp-socket is a no-op', () => {
        const host = getAdapter();
        expect(() => host['wasi:sockets/tcp']!['[resource-drop]tcp-socket']!({})).not.toThrow();
    });

    it('[resource-drop]udp-socket is a no-op', () => {
        const host = getAdapter();
        expect(() => host['wasi:sockets/udp']!['[resource-drop]udp-socket']!({})).not.toThrow();
    });

    describe('tcp-socket methods with no implementation', () => {
        function getTcp() {
            return getAdapter()['wasi:sockets/tcp']!;
        }

        const emptySocket = {};

        it('start-bind returns not-supported', () => {
            expect(getTcp()['[method]tcp-socket.start-bind']!(emptySocket, {}, {}).tag).toBe('err');
        });

        it('finish-bind returns not-supported', () => {
            expect(getTcp()['[method]tcp-socket.finish-bind']!(emptySocket).tag).toBe('err');
        });

        it('start-connect returns not-supported', () => {
            expect(getTcp()['[method]tcp-socket.start-connect']!(emptySocket, {}, {}).tag).toBe('err');
        });

        it('finish-connect returns not-supported', () => {
            expect(getTcp()['[method]tcp-socket.finish-connect']!(emptySocket).tag).toBe('err');
        });

        it('start-listen returns not-supported', () => {
            expect(getTcp()['[method]tcp-socket.start-listen']!(emptySocket).tag).toBe('err');
        });

        it('finish-listen returns not-supported', () => {
            expect(getTcp()['[method]tcp-socket.finish-listen']!(emptySocket).tag).toBe('err');
        });

        it('accept returns not-supported', () => {
            expect(getTcp()['[method]tcp-socket.accept']!(emptySocket).tag).toBe('err');
        });

        it('local-address returns not-supported', () => {
            expect(getTcp()['[method]tcp-socket.local-address']!(emptySocket).tag).toBe('err');
        });

        it('remote-address returns not-supported', () => {
            expect(getTcp()['[method]tcp-socket.remote-address']!(emptySocket).tag).toBe('err');
        });

        it('is-listening returns false', () => {
            expect(getTcp()['[method]tcp-socket.is-listening']!(emptySocket)).toBe(false);
        });

        it('address-family returns ipv4', () => {
            expect(getTcp()['[method]tcp-socket.address-family']!(emptySocket)).toBe('ipv4');
        });

        it('set-listen-backlog-size returns not-supported', () => {
            expect(getTcp()['[method]tcp-socket.set-listen-backlog-size']!(emptySocket, 128n).tag).toBe('err');
        });

        it('keep-alive-enabled returns not-supported', () => {
            expect(getTcp()['[method]tcp-socket.keep-alive-enabled']!(emptySocket).tag).toBe('err');
        });

        it('set-keep-alive-enabled returns not-supported', () => {
            expect(getTcp()['[method]tcp-socket.set-keep-alive-enabled']!(emptySocket, true).tag).toBe('err');
        });

        it('keep-alive-idle-time returns not-supported', () => {
            expect(getTcp()['[method]tcp-socket.keep-alive-idle-time']!(emptySocket).tag).toBe('err');
        });

        it('set-keep-alive-idle-time returns not-supported', () => {
            expect(getTcp()['[method]tcp-socket.set-keep-alive-idle-time']!(emptySocket, 1000n).tag).toBe('err');
        });

        it('keep-alive-interval returns not-supported', () => {
            expect(getTcp()['[method]tcp-socket.keep-alive-interval']!(emptySocket).tag).toBe('err');
        });

        it('set-keep-alive-interval returns not-supported', () => {
            expect(getTcp()['[method]tcp-socket.set-keep-alive-interval']!(emptySocket, 1000n).tag).toBe('err');
        });

        it('keep-alive-count returns not-supported', () => {
            expect(getTcp()['[method]tcp-socket.keep-alive-count']!(emptySocket).tag).toBe('err');
        });

        it('set-keep-alive-count returns not-supported', () => {
            expect(getTcp()['[method]tcp-socket.set-keep-alive-count']!(emptySocket, 3).tag).toBe('err');
        });

        it('hop-limit returns not-supported', () => {
            expect(getTcp()['[method]tcp-socket.hop-limit']!(emptySocket).tag).toBe('err');
        });

        it('set-hop-limit returns not-supported', () => {
            expect(getTcp()['[method]tcp-socket.set-hop-limit']!(emptySocket, 64).tag).toBe('err');
        });

        it('receive-buffer-size returns not-supported', () => {
            expect(getTcp()['[method]tcp-socket.receive-buffer-size']!(emptySocket).tag).toBe('err');
        });

        it('set-receive-buffer-size returns not-supported', () => {
            expect(getTcp()['[method]tcp-socket.set-receive-buffer-size']!(emptySocket, 1024n).tag).toBe('err');
        });

        it('send-buffer-size returns not-supported', () => {
            expect(getTcp()['[method]tcp-socket.send-buffer-size']!(emptySocket).tag).toBe('err');
        });

        it('set-send-buffer-size returns not-supported', () => {
            expect(getTcp()['[method]tcp-socket.set-send-buffer-size']!(emptySocket, 1024n).tag).toBe('err');
        });

        it('subscribe returns ready pollable', () => {
            const p = getTcp()['[method]tcp-socket.subscribe']!(emptySocket) as WasiPollable;
            expect(p.ready()).toBe(true);
        });

        it('shutdown returns not-supported', () => {
            expect(getTcp()['[method]tcp-socket.shutdown']!(emptySocket, 'both').tag).toBe('err');
        });
    });

    describe('udp-socket methods with no implementation', () => {
        function getUdp() {
            return getAdapter()['wasi:sockets/udp']!;
        }

        const emptySocket = {};

        it('start-bind returns not-supported', () => {
            expect(getUdp()['[method]udp-socket.start-bind']!(emptySocket, {}, {}).tag).toBe('err');
        });

        it('finish-bind returns not-supported', () => {
            expect(getUdp()['[method]udp-socket.finish-bind']!(emptySocket).tag).toBe('err');
        });

        it('stream returns not-supported', () => {
            expect(getUdp()['[method]udp-socket.stream']!(emptySocket, {}).tag).toBe('err');
        });

        it('local-address returns not-supported', () => {
            expect(getUdp()['[method]udp-socket.local-address']!(emptySocket).tag).toBe('err');
        });

        it('remote-address returns not-supported', () => {
            expect(getUdp()['[method]udp-socket.remote-address']!(emptySocket).tag).toBe('err');
        });

        it('address-family returns ipv4', () => {
            expect(getUdp()['[method]udp-socket.address-family']!(emptySocket)).toBe('ipv4');
        });

        it('unicast-hop-limit returns not-supported', () => {
            expect(getUdp()['[method]udp-socket.unicast-hop-limit']!(emptySocket).tag).toBe('err');
        });

        it('set-unicast-hop-limit returns not-supported', () => {
            expect(getUdp()['[method]udp-socket.set-unicast-hop-limit']!(emptySocket, 64).tag).toBe('err');
        });

        it('receive-buffer-size returns not-supported', () => {
            expect(getUdp()['[method]udp-socket.receive-buffer-size']!(emptySocket).tag).toBe('err');
        });

        it('set-receive-buffer-size returns not-supported', () => {
            expect(getUdp()['[method]udp-socket.set-receive-buffer-size']!(emptySocket, 1024n).tag).toBe('err');
        });

        it('send-buffer-size returns not-supported', () => {
            expect(getUdp()['[method]udp-socket.send-buffer-size']!(emptySocket).tag).toBe('err');
        });

        it('set-send-buffer-size returns not-supported', () => {
            expect(getUdp()['[method]udp-socket.set-send-buffer-size']!(emptySocket, 1024n).tag).toBe('err');
        });

        it('subscribe returns ready pollable', () => {
            const p = getUdp()['[method]udp-socket.subscribe']!(emptySocket) as WasiPollable;
            expect(p.ready()).toBe(true);
        });
    });

    describe('ip-name-lookup adapter dispatch', () => {
        it('resolve-addresses returns not-supported from mock', () => {
            const host = getAdapter();
            const lookup = host['wasi:sockets/ip-name-lookup']!;
            const result = lookup['resolve-addresses']!({}, 'localhost');
            expect(result.tag).toBe('err');
        });

        it('[resource-drop]resolve-address-stream is a no-op', () => {
            const host = getAdapter();
            expect(() => host['wasi:sockets/ip-name-lookup']!['[resource-drop]resolve-address-stream']!({})).not.toThrow();
        });
    });
});

// ─── wasi:http/types additional dispatch ───

describe('wasi:http/types adapter dispatch', () => {
    function getTypes() {
        return getAdapter()['wasi:http/types']!;
    }

    it('[resource-drop]fields is a no-op', () => {
        expect(() => getTypes()['[resource-drop]fields']!({})).not.toThrow();
    });

    it('[resource-drop]outgoing-request is a no-op', () => {
        expect(() => getTypes()['[resource-drop]outgoing-request']!({})).not.toThrow();
    });

    it('[resource-drop]outgoing-body is a no-op', () => {
        expect(() => getTypes()['[resource-drop]outgoing-body']!({})).not.toThrow();
    });

    it('[resource-drop]request-options is a no-op', () => {
        expect(() => getTypes()['[resource-drop]request-options']!({})).not.toThrow();
    });

    it('[resource-drop]incoming-response is a no-op', () => {
        expect(() => getTypes()['[resource-drop]incoming-response']!({})).not.toThrow();
    });

    it('[resource-drop]incoming-body is a no-op', () => {
        expect(() => getTypes()['[resource-drop]incoming-body']!({})).not.toThrow();
    });

    it('[resource-drop]future-incoming-response is a no-op', () => {
        expect(() => getTypes()['[resource-drop]future-incoming-response']!({})).not.toThrow();
    });

    it('[resource-drop]incoming-request is a no-op', () => {
        expect(() => getTypes()['[resource-drop]incoming-request']!({})).not.toThrow();
    });

    it('[resource-drop]outgoing-response is a no-op', () => {
        expect(() => getTypes()['[resource-drop]outgoing-response']!({})).not.toThrow();
    });

    it('[resource-drop]response-outparam is a no-op', () => {
        expect(() => getTypes()['[resource-drop]response-outparam']!({})).not.toThrow();
    });

    it('[resource-drop]future-trailers is a no-op', () => {
        expect(() => getTypes()['[resource-drop]future-trailers']!({})).not.toThrow();
    });

    it('[static]outgoing-body.finish returns ok', () => {
        const result = getTypes()['[static]outgoing-body.finish']!();
        expect(result.tag).toBe('ok');
    });

    it('[static]response-outparam.set is a stub', () => {
        expect(() => getTypes()['[static]response-outparam.set']!()).not.toThrow();
    });

    it('http-error-code returns undefined', () => {
        expect(getTypes()['http-error-code']!()).toBeUndefined();
    });

    it('[static]incoming-body.finish returns future trailers', () => {
        const result = getTypes()['[static]incoming-body.finish']!();
        expect(typeof result.subscribe).toBe('function');
        expect(typeof result.get).toBe('function');
        const poll = result.subscribe();
        expect(poll.ready()).toBe(true);
        const val = result.get();
        expect(val.tag).toBe('ok');
    });

    it('[method]future-trailers.subscribe returns ready pollable', () => {
        const pollable = getTypes()['[method]future-trailers.subscribe']!() as WasiPollable;
        expect(pollable.ready()).toBe(true);
    });

    it('[method]future-trailers.get returns ok', () => {
        const result = getTypes()['[method]future-trailers.get']!();
        expect(result.tag).toBe('ok');
    });

    it('[method]outgoing-request.method dispatches', () => {
        const req = { method: () => ({ tag: 'post' }) };
        expect(getTypes()['[method]outgoing-request.method']!(req).tag).toBe('post');
    });

    it('[method]outgoing-request.set-method dispatches', () => {
        const req = { setMethod: () => true };
        expect(getTypes()['[method]outgoing-request.set-method']!(req, { tag: 'get' })).toBe(true);
    });

    it('[method]outgoing-request.path-with-query dispatches', () => {
        const req = { pathWithQuery: () => '/api' };
        expect(getTypes()['[method]outgoing-request.path-with-query']!(req)).toBe('/api');
    });

    it('[method]outgoing-request.set-path-with-query dispatches', () => {
        const req = { setPathWithQuery: () => true };
        expect(getTypes()['[method]outgoing-request.set-path-with-query']!(req, '/test')).toBe(true);
    });

    it('[method]outgoing-request.scheme dispatches', () => {
        const req = { scheme: () => ({ tag: 'HTTPS' }) };
        expect(getTypes()['[method]outgoing-request.scheme']!(req).tag).toBe('HTTPS');
    });

    it('[method]outgoing-request.set-scheme dispatches', () => {
        const req = { setScheme: () => true };
        expect(getTypes()['[method]outgoing-request.set-scheme']!(req, { tag: 'HTTP' })).toBe(true);
    });

    it('[method]outgoing-request.authority dispatches', () => {
        const req = { authority: () => 'host.com' };
        expect(getTypes()['[method]outgoing-request.authority']!(req)).toBe('host.com');
    });

    it('[method]outgoing-request.set-authority dispatches', () => {
        const req = { setAuthority: () => true };
        expect(getTypes()['[method]outgoing-request.set-authority']!(req, 'host.com')).toBe(true);
    });

    it('[method]outgoing-request.headers dispatches', () => {
        const headers = {};
        const req = { headers: () => headers };
        expect(getTypes()['[method]outgoing-request.headers']!(req)).toBe(headers);
    });

    it('[method]outgoing-request.body dispatches', () => {
        const body = { tag: 'ok', val: {} };
        const req = { body: () => body };
        expect(getTypes()['[method]outgoing-request.body']!(req)).toBe(body);
    });

    it('[method]outgoing-body.write dispatches', () => {
        const os = {};
        const body = { write: () => os };
        expect(getTypes()['[method]outgoing-body.write']!(body)).toBe(os);
    });

    it('[method]request-options.connect-timeout dispatches', () => {
        const opts = { connectTimeout: () => 5000n };
        expect(getTypes()['[method]request-options.connect-timeout']!(opts)).toBe(5000n);
    });

    it('[method]request-options.set-connect-timeout dispatches', () => {
        const opts = { setConnectTimeout: () => true };
        expect(getTypes()['[method]request-options.set-connect-timeout']!(opts, 1000n)).toBe(true);
    });

    it('[method]request-options.first-byte-timeout dispatches', () => {
        const opts = { firstByteTimeout: () => undefined };
        expect(getTypes()['[method]request-options.first-byte-timeout']!(opts)).toBeUndefined();
    });

    it('[method]request-options.set-first-byte-timeout dispatches', () => {
        const opts = { setFirstByteTimeout: () => true };
        expect(getTypes()['[method]request-options.set-first-byte-timeout']!(opts, 2000n)).toBe(true);
    });

    it('[method]request-options.between-bytes-timeout dispatches', () => {
        const opts = { betweenBytesTimeout: () => 3000n };
        expect(getTypes()['[method]request-options.between-bytes-timeout']!(opts)).toBe(3000n);
    });

    it('[method]request-options.set-between-bytes-timeout dispatches', () => {
        const opts = { setBetweenBytesTimeout: () => true };
        expect(getTypes()['[method]request-options.set-between-bytes-timeout']!(opts, 4000n)).toBe(true);
    });

    it('[method]incoming-response.status dispatches', () => {
        const resp = { status: () => 200 };
        expect(getTypes()['[method]incoming-response.status']!(resp)).toBe(200);
    });

    it('[method]incoming-response.headers dispatches', () => {
        const h = {};
        const resp = { headers: () => h };
        expect(getTypes()['[method]incoming-response.headers']!(resp)).toBe(h);
    });

    it('[method]incoming-response.consume dispatches', () => {
        const body = {};
        const resp = { consume: () => body };
        expect(getTypes()['[method]incoming-response.consume']!(resp)).toBe(body);
    });

    it('[method]incoming-body.stream dispatches', () => {
        const stream = {};
        const body = { stream: () => stream };
        expect(getTypes()['[method]incoming-body.stream']!(body)).toBe(stream);
    });

    it('[method]future-incoming-response.subscribe dispatches', () => {
        const pollable: WasiPollable = { ready: () => true, block: () => { } };
        const future = { subscribe: () => pollable };
        expect(getTypes()['[method]future-incoming-response.subscribe']!(future)).toBe(pollable);
    });

    it('[method]future-incoming-response.get dispatches', () => {
        const result = { tag: 'ok', val: {} };
        const future = { get: () => result };
        expect(getTypes()['[method]future-incoming-response.get']!(future)).toBe(result);
    });

    it('[constructor]outgoing-response creates response with status and body', () => {
        const headers = {};
        const resp = getTypes()['[constructor]outgoing-response']!(headers);
        expect(resp.statusCode()).toBe(200);
        expect(resp.headers()).toBe(headers);
        expect(resp.setStatusCode(404)).toBe(true);
        expect(resp.statusCode()).toBe(404);
        const body = resp.body();
        expect(body.tag).toBe('ok');
    });
});

// ─── wasi:http/outgoing-handler ───

describe('wasi:http/outgoing-handler adapter dispatch', () => {
    it('handle is registered', () => {
        const host = getAdapter();
        const handler = host['wasi:http/outgoing-handler']!;
        expect(typeof handler['handle']).toBe('function');
    });
});
