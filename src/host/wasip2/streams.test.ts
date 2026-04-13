// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { createInputStream, createOutputStream } from './streams';
import { createWasiError } from './error';

describe('wasi:io/streams', () => {
    describe('InputStream', () => {
        it('read returns requested bytes', () => {
            const data = new Uint8Array([1, 2, 3, 4, 5]);
            const stream = createInputStream(data);
            const result = stream.read(3n);
            expect(result.tag).toBe('ok');
            if (result.tag === 'ok') {
                expect(result.val).toEqual(new Uint8Array([1, 2, 3]));
            }
        });

        it('read advances cursor', () => {
            const data = new Uint8Array([1, 2, 3, 4, 5]);
            const stream = createInputStream(data);
            stream.read(2n);
            const result = stream.read(2n);
            expect(result.tag).toBe('ok');
            if (result.tag === 'ok') {
                expect(result.val).toEqual(new Uint8Array([3, 4]));
            }
        });

        it('read returns shorter result at end of buffer', () => {
            const data = new Uint8Array([1, 2, 3]);
            const stream = createInputStream(data);
            stream.read(2n);
            const result = stream.read(5n); // ask for more than available
            expect(result.tag).toBe('ok');
            if (result.tag === 'ok') {
                expect(result.val).toEqual(new Uint8Array([3]));
            }
        });

        it('read returns closed when buffer exhausted', () => {
            const data = new Uint8Array([1, 2]);
            const stream = createInputStream(data);
            stream.read(2n); // consume all
            const result = stream.read(1n);
            expect(result.tag).toBe('err');
            if (result.tag === 'err') {
                expect(result.val.tag).toBe('closed');
            }
        });

        it('read from empty buffer returns closed', () => {
            const stream = createInputStream(new Uint8Array(0));
            const result = stream.read(1n);
            expect(result.tag).toBe('err');
            if (result.tag === 'err') {
                expect(result.val.tag).toBe('closed');
            }
        });

        it('read(0) returns empty result (not an error)', () => {
            const data = new Uint8Array([1, 2, 3]);
            const stream = createInputStream(data);
            const result = stream.read(0n);
            expect(result.tag).toBe('ok');
            if (result.tag === 'ok') {
                expect(result.val.length).toBe(0);
            }
        });

        it('after closed, all subsequent operations return closed', () => {
            const stream = createInputStream(new Uint8Array([1]));
            stream.read(1n); // consume all
            const r1 = stream.read(1n); // triggers closed
            expect(r1.tag).toBe('err');
            const r2 = stream.read(1n); // already closed
            expect(r2.tag).toBe('err');
            const r3 = stream.skip(1n); // also closed
            expect(r3.tag).toBe('err');
            const r4 = stream.blockingRead(1n);
            expect(r4.tag).toBe('err');
        });

        it('skip advances cursor', () => {
            const data = new Uint8Array([1, 2, 3, 4, 5]);
            const stream = createInputStream(data);
            const skipResult = stream.skip(3n);
            expect(skipResult.tag).toBe('ok');
            if (skipResult.tag === 'ok') {
                expect(skipResult.val).toBe(3n);
            }
            const readResult = stream.read(2n);
            expect(readResult.tag).toBe('ok');
            if (readResult.tag === 'ok') {
                expect(readResult.val).toEqual(new Uint8Array([4, 5]));
            }
        });

        it('skip past end returns actual skipped count', () => {
            const data = new Uint8Array([1, 2, 3]);
            const stream = createInputStream(data);
            const result = stream.skip(100n);
            expect(result.tag).toBe('ok');
            if (result.tag === 'ok') {
                expect(result.val).toBe(3n);
            }
        });

        it('skip returns closed when exhausted', () => {
            const data = new Uint8Array([1, 2]);
            const stream = createInputStream(data);
            stream.skip(2n);
            const result = stream.skip(1n);
            expect(result.tag).toBe('err');
            if (result.tag === 'err') {
                expect(result.val.tag).toBe('closed');
            }
        });

        it('blockingRead behaves same as read for buffer stream', () => {
            const data = new Uint8Array([10, 20, 30]);
            const stream = createInputStream(data);
            const result = stream.blockingRead(2n);
            expect(result.tag).toBe('ok');
            if (result.tag === 'ok') {
                expect(result.val).toEqual(new Uint8Array([10, 20]));
            }
        });

        it('blockingSkip behaves same as skip for buffer stream', () => {
            const data = new Uint8Array([10, 20, 30, 40]);
            const stream = createInputStream(data);
            const result = stream.blockingSkip(2n);
            expect(result.tag).toBe('ok');
            if (result.tag === 'ok') {
                expect(result.val).toBe(2n);
            }
            const readResult = stream.read(2n);
            expect(readResult.tag).toBe('ok');
            if (readResult.tag === 'ok') {
                expect(readResult.val).toEqual(new Uint8Array([30, 40]));
            }
        });

        it('subscribe returns ready pollable for buffer stream', () => {
            const stream = createInputStream(new Uint8Array([1]));
            const pollable = stream.subscribe();
            expect(pollable.ready()).toBe(true);
        });

        it('interleaved reads from two independent streams work correctly', () => {
            const s1 = createInputStream(new Uint8Array([1, 2, 3]));
            const s2 = createInputStream(new Uint8Array([10, 20, 30]));
            const r1a = s1.read(1n);
            const r2a = s2.read(2n);
            const r1b = s1.read(2n);
            const r2b = s2.read(1n);
            expect(r1a.tag === 'ok' ? r1a.val : null).toEqual(new Uint8Array([1]));
            expect(r2a.tag === 'ok' ? r2a.val : null).toEqual(new Uint8Array([10, 20]));
            expect(r1b.tag === 'ok' ? r1b.val : null).toEqual(new Uint8Array([2, 3]));
            expect(r2b.tag === 'ok' ? r2b.val : null).toEqual(new Uint8Array([30]));
        });

        it('handles binary (non-UTF8) data correctly', () => {
            const binary = new Uint8Array([0xFF, 0xFE, 0x00, 0x80, 0xC0]);
            const stream = createInputStream(binary);
            const result = stream.read(5n);
            expect(result.tag).toBe('ok');
            if (result.tag === 'ok') {
                expect(result.val).toEqual(binary);
            }
        });

        it('multiple sequential reads return complete buffer content', () => {
            const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
            const stream = createInputStream(data);
            const chunks: Uint8Array[] = [];
            for (; ;) {
                const result = stream.read(3n);
                if (result.tag === 'err') break;
                chunks.push(result.val);
            }
            const combined = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
            let offset = 0;
            for (const chunk of chunks) {
                combined.set(chunk, offset);
                offset += chunk.length;
            }
            expect(combined).toEqual(data);
        });
    });

    describe('OutputStream', () => {
        it('checkWrite returns available capacity', () => {
            const stream = createOutputStream(undefined, 100);
            const result = stream.checkWrite();
            expect(result.tag).toBe('ok');
            if (result.tag === 'ok') {
                expect(result.val).toBe(100n);
            }
        });

        it('write stores bytes in buffer', () => {
            const flushed: Uint8Array[] = [];
            const stream = createOutputStream(b => flushed.push(b.slice()), 100);
            const writeResult = stream.write(new Uint8Array([1, 2, 3]));
            expect(writeResult.tag).toBe('ok');

            stream.flush();
            expect(flushed.length).toBe(1);
            expect(flushed[0]).toEqual(new Uint8Array([1, 2, 3]));
        });

        it('write reduces available capacity', () => {
            const stream = createOutputStream(undefined, 100);
            stream.write(new Uint8Array(30));
            const result = stream.checkWrite();
            expect(result.tag).toBe('ok');
            if (result.tag === 'ok') {
                expect(result.val).toBe(70n);
            }
        });

        it('write fails when exceeding capacity', () => {
            const stream = createOutputStream(undefined, 10);
            const result = stream.write(new Uint8Array(20));
            expect(result.tag).toBe('err');
            if (result.tag === 'err') {
                expect(result.val.tag).toBe('last-operation-failed');
            }
        });

        it('write empty data succeeds without error', () => {
            const flushed: Uint8Array[] = [];
            const stream = createOutputStream(b => flushed.push(b.slice()));
            const result = stream.write(new Uint8Array(0));
            expect(result.tag).toBe('ok');
            stream.flush();
            expect(flushed.length).toBe(0);
        });

        it('flush calls sink with accumulated bytes', () => {
            const flushed: Uint8Array[] = [];
            const stream = createOutputStream(b => flushed.push(b.slice()));
            stream.write(new Uint8Array([1, 2]));
            stream.write(new Uint8Array([3, 4]));
            stream.flush();
            expect(flushed.length).toBe(1);
            expect(flushed[0]).toEqual(new Uint8Array([1, 2, 3, 4]));
        });

        it('flush with empty buffer is noop', () => {
            const flushed: Uint8Array[] = [];
            const stream = createOutputStream(b => flushed.push(b.slice()));
            stream.flush();
            expect(flushed.length).toBe(0);
        });

        it('flush resets buffer', () => {
            const stream = createOutputStream(undefined, 100);
            stream.write(new Uint8Array(50));
            stream.flush();
            const result = stream.checkWrite();
            expect(result.tag).toBe('ok');
            if (result.tag === 'ok') {
                expect(result.val).toBe(100n);
            }
        });

        it('blockingWriteAndFlush writes and flushes', () => {
            const flushed: Uint8Array[] = [];
            const stream = createOutputStream(b => flushed.push(b.slice()));
            stream.blockingWriteAndFlush(new Uint8Array([5, 6, 7]));
            expect(flushed.length).toBe(1);
            expect(flushed[0]).toEqual(new Uint8Array([5, 6, 7]));
        });

        it('writeZeroes writes zero bytes', () => {
            const flushed: Uint8Array[] = [];
            const stream = createOutputStream(b => flushed.push(b.slice()));
            stream.writeZeroes(4n);
            stream.flush();
            expect(flushed[0]).toEqual(new Uint8Array([0, 0, 0, 0]));
        });

        it('blockingWriteZeroesAndFlush writes and flushes', () => {
            const flushed: Uint8Array[] = [];
            const stream = createOutputStream(b => flushed.push(b.slice()));
            stream.blockingWriteZeroesAndFlush(3n);
            expect(flushed[0]).toEqual(new Uint8Array([0, 0, 0]));
        });

        it('sink error closes stream', () => {
            const stream = createOutputStream(() => { throw new Error('disk full'); });
            stream.write(new Uint8Array([1]));
            const flushResult = stream.flush();
            expect(flushResult.tag).toBe('err');
            if (flushResult.tag === 'err') {
                expect(flushResult.val.tag).toBe('last-operation-failed');
            }

            // Subsequent operations should return closed
            const writeResult = stream.write(new Uint8Array([2]));
            expect(writeResult.tag).toBe('err');
            if (writeResult.tag === 'err') {
                expect(writeResult.val.tag).toBe('closed');
            }
        });

        it('sink error carries debug message', () => {
            const stream = createOutputStream(() => { throw new Error('disk full'); });
            stream.write(new Uint8Array([1]));
            const result = stream.flush();
            expect(result.tag).toBe('err');
            if (result.tag === 'err' && result.val.tag === 'last-operation-failed') {
                expect(result.val.val.toDebugString()).toBe('disk full');
            }
        });

        it('after sink error, checkWrite also returns closed', () => {
            const stream = createOutputStream(() => { throw new Error('fail'); });
            stream.write(new Uint8Array([1]));
            stream.flush();
            const result = stream.checkWrite();
            expect(result.tag).toBe('err');
            if (result.tag === 'err') {
                expect(result.val.tag).toBe('closed');
            }
        });

        it('after sink error, subsequent flush returns closed', () => {
            const stream = createOutputStream(() => { throw new Error('fail'); });
            stream.write(new Uint8Array([1]));
            stream.flush(); // triggers error
            const result = stream.flush(); // should be closed now
            expect(result.tag).toBe('err');
            if (result.tag === 'err') {
                expect(result.val.tag).toBe('closed');
            }
        });

        it('subscribe returns writable pollable', () => {
            const stream = createOutputStream(undefined, 100);
            const pollable = stream.subscribe();
            expect(pollable.ready()).toBe(true);
        });

        it('subscribe reflects buffer full state', () => {
            const stream = createOutputStream(undefined, 5);
            stream.write(new Uint8Array(5));
            const pollable = stream.subscribe();
            expect(pollable.ready()).toBe(false);
        });

        it('default sink (no callback) does not throw', () => {
            const stream = createOutputStream();
            stream.write(new Uint8Array([1, 2, 3]));
            const result = stream.flush();
            expect(result.tag).toBe('ok');
        });

        it('multiple write-flush cycles work', () => {
            const flushed: Uint8Array[] = [];
            const stream = createOutputStream(b => flushed.push(b.slice()));

            stream.write(new Uint8Array([1, 2]));
            stream.flush();
            stream.write(new Uint8Array([3, 4]));
            stream.flush();

            expect(flushed.length).toBe(2);
            expect(flushed[0]).toEqual(new Uint8Array([1, 2]));
            expect(flushed[1]).toEqual(new Uint8Array([3, 4]));
        });

        it('interleaved writes to two independent streams work', () => {
            const out1: Uint8Array[] = [];
            const out2: Uint8Array[] = [];
            const s1 = createOutputStream(b => out1.push(b.slice()));
            const s2 = createOutputStream(b => out2.push(b.slice()));

            s1.write(new Uint8Array([1]));
            s2.write(new Uint8Array([10]));
            s1.write(new Uint8Array([2]));
            s2.write(new Uint8Array([20]));
            s1.flush();
            s2.flush();

            expect(out1[0]).toEqual(new Uint8Array([1, 2]));
            expect(out2[0]).toEqual(new Uint8Array([10, 20]));
        });

        it('blockingFlush behaves same as flush for sync sink', () => {
            const flushed: Uint8Array[] = [];
            const stream = createOutputStream(b => flushed.push(b.slice()));
            stream.write(new Uint8Array([1, 2, 3]));
            const result = stream.blockingFlush();
            expect(result.tag).toBe('ok');
            expect(flushed.length).toBe(1);
            expect(flushed[0]).toEqual(new Uint8Array([1, 2, 3]));
        });

        it('writeZeroes fails when exceeding capacity', () => {
            const stream = createOutputStream(undefined, 5);
            const result = stream.writeZeroes(10n);
            expect(result.tag).toBe('err');
            if (result.tag === 'err') {
                expect(result.val.tag).toBe('last-operation-failed');
            }
        });

        it('handles binary (non-UTF8) output bytes', () => {
            const flushed: Uint8Array[] = [];
            const stream = createOutputStream(b => flushed.push(b.slice()));
            const binary = new Uint8Array([0xFF, 0xFE, 0x00, 0x80]);
            stream.blockingWriteAndFlush(binary);
            expect(flushed[0]).toEqual(binary);
        });

        it('sink exception type preserved in error (string thrown)', () => {
            const stream = createOutputStream(() => { throw 'string error'; });
            stream.write(new Uint8Array([1]));
            const result = stream.flush();
            expect(result.tag).toBe('err');
            if (result.tag === 'err' && result.val.tag === 'last-operation-failed') {
                expect(result.val.val.toDebugString()).toBe('string error');
            }
        });
    });
});

describe('wasi:io/error', () => {
    it('error wraps a message', () => {
        const err = createWasiError('something went wrong');
        expect(err.toDebugString()).toBe('something went wrong');
    });

    it('to-debug-string returns non-empty string', () => {
        const err = createWasiError('test');
        expect(err.toDebugString().length).toBeGreaterThan(0);
    });

    it('error can be passed through stream-error last-operation-failed', () => {
        const err = createWasiError('io failure');
        const streamError = { tag: 'last-operation-failed' as const, val: err };
        expect(streamError.val.toDebugString()).toBe('io failure');
    });

    it('error with empty message returns empty string', () => {
        const err = createWasiError('');
        expect(err.toDebugString()).toBe('');
    });
});
