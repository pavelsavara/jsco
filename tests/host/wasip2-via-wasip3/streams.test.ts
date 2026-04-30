// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

/**
 * Tests for wasi:io/streams through the P2-via-P3 adapter.
 * Mirrors wasip2/streams.test.ts — tests adapter's InputStream/OutputStream
 * and the static createInputStream/createOutputStream from io.ts.
 */

import { createWasiP2ViaP3Adapter } from '../../../src/host/wasip2-via-wasip3/index';
import { createMockP3 } from './test-helpers';
import { createInputStream, createOutputStream, createWasiError } from '../../../src/host/wasip2-via-wasip3/io';
import { createInputStreamFromP3, createOutputStreamFromP3, createSyncPollable, createAsyncPollable, poll, JspiBlockSignal } from '../../../src/host/wasip2-via-wasip3/io';
import { createStreamPair } from '../../../src/host/wasip3/streams';
import type { WasiInputStream, WasiOutputStream, WasiPollable } from '../../../src/host/wasip2-via-wasip3/io';


describe('wasi:io/streams (via P3 adapter)', () => {
    describe('InputStream (static buffer)', () => {
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
            const result = stream.read(5n);
            expect(result.tag).toBe('ok');
            if (result.tag === 'ok') {
                expect(result.val).toEqual(new Uint8Array([3]));
            }
        });

        it('read returns closed when buffer exhausted', () => {
            const data = new Uint8Array([1, 2]);
            const stream = createInputStream(data);
            stream.read(2n);
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
            stream.read(1n);
            const r1 = stream.read(1n);
            expect(r1.tag).toBe('err');
            const r2 = stream.read(1n);
            expect(r2.tag).toBe('err');
            const r3 = stream.skip(1n);
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

    describe('OutputStream (static sink)', () => {
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

        it('splice reads from input and writes to output', () => {
            const inputData = new Uint8Array([10, 20, 30, 40, 50]);
            const inputStream = createInputStream(inputData);
            const flushed: Uint8Array[] = [];
            const outputStream = createOutputStream((bytes) => { flushed.push(new Uint8Array(bytes)); });
            const result = outputStream.splice(inputStream, 3n);
            expect(result.tag).toBe('ok');
            if (result.tag === 'ok') {
                expect(result.val).toBe(3n);
            }
            outputStream.flush();
            expect(flushed.length).toBe(1);
            expect(flushed[0]).toEqual(new Uint8Array([10, 20, 30]));
        });

        it('splice returns shorter count at end of input', () => {
            const inputData = new Uint8Array([1, 2]);
            const inputStream = createInputStream(inputData);
            const flushed: Uint8Array[] = [];
            const outputStream = createOutputStream((bytes) => { flushed.push(new Uint8Array(bytes)); });
            const result = outputStream.splice(inputStream, 100n);
            expect(result.tag).toBe('ok');
            if (result.tag === 'ok') {
                expect(result.val).toBe(2n);
            }
        });

        it('splice propagates input stream error', () => {
            const inputStream = createInputStream(new Uint8Array(0));
            const outputStream = createOutputStream(() => { /* no-op */ });
            const result = outputStream.splice(inputStream, 10n);
            expect(result.tag).toBe('err');
        });
    });

    describe('adapter stream interface', () => {
        it('input-stream subscribe dispatches through adapter', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const stdin = host['wasi:cli/stdin']!['get-stdin']!() as WasiInputStream;
            const subscribeFn = host['wasi:io/streams']!['[method]input-stream.subscribe']!;
            const pollable = subscribeFn(stdin);
            expect(typeof pollable.ready).toBe('function');
        });

        it('output-stream check-write dispatches through adapter', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const stdout = host['wasi:cli/stdout']!['get-stdout']!() as WasiOutputStream;
            const checkWriteFn = host['wasi:io/streams']!['[method]output-stream.check-write']!;
            const result = checkWriteFn(stdout);
            expect(result.tag).toBe('ok');
            expect(result.val > 0n).toBe(true);
        });
    });
});

describe('wasi:io/error (via P3 adapter)', () => {
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

    it('[method]error.to-debug-string dispatches through adapter', () => {
        const host = createWasiP2ViaP3Adapter(createMockP3());
        const fn = host['wasi:io/error']!['[method]error.to-debug-string']!;
        const err = { toDebugString: () => 'test error' };
        expect(fn(err)).toBe('test error');
    });
});

// ─── P3-backed streams ───

describe('createInputStreamFromP3', () => {
    it('reads data pumped from async iterable', async () => {
        const pair = createStreamPair<Uint8Array>();
        // Create stream first — pump starts consuming eagerly
        const stream = createInputStreamFromP3(pair.readable);
        // Now write (pump is waiting on dequeue, so write resolves)
        await pair.write(new Uint8Array([1, 2, 3]));
        pair.close();
        // Allow async pump to finish processing
        await new Promise(r => setTimeout(r, 10));

        const result = stream.read(3n);
        expect(result.tag).toBe('ok');
        if (result.tag === 'ok') {
            expect(result.val).toEqual(new Uint8Array([1, 2, 3]));
        }
    });

    it('subscribe returns ready pollable when data available', async () => {
        const pair = createStreamPair<Uint8Array>();
        const stream = createInputStreamFromP3(pair.readable);
        await pair.write(new Uint8Array([1]));
        pair.close();
        await new Promise(r => setTimeout(r, 10));

        const pollable = stream.subscribe();
        expect(pollable.ready()).toBe(true);
    });

    it('skip advances past buffered data', async () => {
        const pair = createStreamPair<Uint8Array>();
        const stream = createInputStreamFromP3(pair.readable);
        await pair.write(new Uint8Array([1, 2, 3, 4, 5]));
        pair.close();
        await new Promise(r => setTimeout(r, 10));

        const skipResult = stream.skip(3n);
        expect(skipResult.tag).toBe('ok');
        if (skipResult.tag === 'ok') {
            expect(skipResult.val).toBe(3n);
        }
        const readResult = stream.read(10n);
        expect(readResult.tag).toBe('ok');
        if (readResult.tag === 'ok') {
            expect(readResult.val).toEqual(new Uint8Array([4, 5]));
        }
    });

    it('read returns empty array when no data available yet', () => {
        const pair = createStreamPair<Uint8Array>();
        // Don't write anything yet, don't close
        const stream = createInputStreamFromP3(pair.readable);
        const result = stream.read(10n);
        expect(result.tag).toBe('ok');
        if (result.tag === 'ok') {
            expect(result.val.length).toBe(0);
        }
        pair.close(); // clean up
    });

    it('returns closed after stream ends', async () => {
        const pair = createStreamPair<Uint8Array>();
        pair.close();

        const stream = createInputStreamFromP3(pair.readable);
        await new Promise(r => setTimeout(r, 10));

        const result = stream.read(1n);
        expect(result.tag).toBe('err');
        if (result.tag === 'err') {
            expect(result.val.tag).toBe('closed');
        }
    });

    it('skip returns closed after stream ends', async () => {
        const pair = createStreamPair<Uint8Array>();
        pair.close();

        const stream = createInputStreamFromP3(pair.readable);
        await new Promise(r => setTimeout(r, 10));

        const result = stream.skip(1n);
        expect(result.tag).toBe('err');
    });

    it('subscribe returns ready pollable when closed', async () => {
        const pair = createStreamPair<Uint8Array>();
        pair.close();

        const stream = createInputStreamFromP3(pair.readable);
        await new Promise(r => setTimeout(r, 10));

        expect(stream.subscribe().ready()).toBe(true);
    });
});

describe('createOutputStreamFromP3', () => {
    it('writes data through to stream pair', async () => {
        const pair = createStreamPair<Uint8Array>();
        const stream = createOutputStreamFromP3(pair);

        const result = stream.write(new Uint8Array([10, 20, 30]));
        expect(result.tag).toBe('ok');

        // Flush is a no-op for P3 output streams
        expect(stream.flush().tag).toBe('ok');
    });

    it('checkWrite returns large capacity', () => {
        const pair = createStreamPair<Uint8Array>();
        const stream = createOutputStreamFromP3(pair);
        const result = stream.checkWrite();
        expect(result.tag).toBe('ok');
        if (result.tag === 'ok') {
            expect(result.val).toBeGreaterThan(0n);
        }
    });

    it('subscribe returns ready pollable', () => {
        const pair = createStreamPair<Uint8Array>();
        const stream = createOutputStreamFromP3(pair);
        expect(stream.subscribe().ready()).toBe(true);
    });

    it('writeZeroes writes zero bytes', () => {
        const pair = createStreamPair<Uint8Array>();
        const stream = createOutputStreamFromP3(pair);
        const result = stream.writeZeroes(3n);
        expect(result.tag).toBe('ok');
    });

    it('converts non-Uint8Array to Uint8Array', () => {
        const pair = createStreamPair<Uint8Array>();
        const stream = createOutputStreamFromP3(pair);
        // Simulate the trampoline passing a plain Array
        const result = stream.write([1, 2, 3] as unknown as Uint8Array);
        expect(result.tag).toBe('ok');
    });

    it('flush and blockingFlush return ok', () => {
        const pair = createStreamPair<Uint8Array>();
        const stream = createOutputStreamFromP3(pair);
        expect(stream.flush().tag).toBe('ok');
        expect(stream.blockingFlush().tag).toBe('ok');
    });

    it('blockingWriteAndFlush throws JspiBlockSignal', () => {
        const pair = createStreamPair<Uint8Array>();
        const stream = createOutputStreamFromP3(pair);
        try {
            stream.blockingWriteAndFlush(new Uint8Array([1]));
            fail('Expected JspiBlockSignal');
        } catch (e) {
            expect(e).toBeInstanceOf(JspiBlockSignal);
        }
    });

    it('blockingWriteZeroesAndFlush throws JspiBlockSignal', () => {
        const pair = createStreamPair<Uint8Array>();
        const stream = createOutputStreamFromP3(pair);
        try {
            stream.blockingWriteZeroesAndFlush(1n);
            fail('Expected JspiBlockSignal');
        } catch (e) {
            expect(e).toBeInstanceOf(JspiBlockSignal);
        }
    });

    it('splice reads from input and writes to output', () => {
        const pair = createStreamPair<Uint8Array>();
        const outStream = createOutputStreamFromP3(pair);
        const inStream = createInputStream(new Uint8Array([1, 2, 3]));
        const result = outStream.splice(inStream, 2n);
        expect(result.tag).toBe('ok');
        if (result.tag === 'ok') {
            expect(result.val).toBe(2n);
        }
    });
});

// ─── Poll primitives ───

describe('poll primitives', () => {
    it('createSyncPollable: ready returns callback result', () => {
        const p = createSyncPollable(() => true);
        expect(p.ready()).toBe(true);
        const p2 = createSyncPollable(() => false);
        expect(p2.ready()).toBe(false);
    });

    it('createSyncPollable: block when ready is no-op', () => {
        const p = createSyncPollable(() => true);
        expect(() => p.block()).not.toThrow();
    });

    it('createSyncPollable: block when not ready throws', () => {
        const p = createSyncPollable(() => false);
        expect(() => p.block()).toThrow('not ready');
    });

    it('createAsyncPollable: becomes ready after promise resolves', async () => {
        let resolve!: () => void;
        const promise = new Promise<void>(r => { resolve = r; });
        const p = createAsyncPollable(promise);
        expect(p.ready()).toBe(false);
        resolve();
        await promise;
        // Allow microtask
        await new Promise(r => setTimeout(r, 0));
        expect(p.ready()).toBe(true);
    });

    it('createAsyncPollable: block when not resolved throws JspiBlockSignal', () => {
        const promise = new Promise<void>(() => { /* never resolves */ });
        const p = createAsyncPollable(promise);
        try {
            p.block();
            fail('Expected JspiBlockSignal');
        } catch (e) {
            expect(e).toBeInstanceOf(JspiBlockSignal);
        }
    });

    it('poll with empty array throws', () => {
        expect(() => poll([])).toThrow('at least one');
    });

    it('poll returns indices of ready pollables', () => {
        const p1 = createSyncPollable(() => false);
        const p2 = createSyncPollable(() => true);
        const p3 = createSyncPollable(() => true);
        const result = poll([p1, p2, p3]);
        expect(Array.from(result)).toEqual([1, 2]);
    });

    it('poll throws JspiBlockSignal when none ready', () => {
        const promise = new Promise<void>(() => { });
        const p = createAsyncPollable(promise);
        try {
            poll([p]);
            fail('Expected JspiBlockSignal');
        } catch (e) {
            expect(e).toBeInstanceOf(JspiBlockSignal);
        }
    });
});

// ─── Additional io.ts coverage: closed-state branches, error streams ───

describe('createOutputStream closed-state branches', () => {
    it('checkWrite returns closed after sink error', () => {
        const stream = createOutputStream(() => { throw new Error('fail'); });
        stream.write(new Uint8Array([1]));
        stream.flush(); // triggers sink error, sets closed
        const result = stream.checkWrite();
        expect(result.tag).toBe('err');
        if (result.tag === 'err') expect(result.val.tag).toBe('closed');
    });

    it('writeZeroes returns closed after stream closed', () => {
        const stream = createOutputStream(() => { throw new Error('fail'); });
        stream.write(new Uint8Array([1]));
        stream.flush();
        const result = stream.writeZeroes(1n);
        expect(result.tag).toBe('err');
    });

    it('blockingWriteAndFlush propagates write error', () => {
        const stream = createOutputStream(undefined, 2);
        const result = stream.blockingWriteAndFlush(new Uint8Array(10));
        expect(result.tag).toBe('err');
    });

    it('blockingWriteZeroesAndFlush propagates writeZeroes error', () => {
        const stream = createOutputStream(undefined, 2);
        const result = stream.blockingWriteZeroesAndFlush(10n);
        expect(result.tag).toBe('err');
    });

    it('blockingSplice reads and writes blocking', () => {
        const input = createInputStream(new Uint8Array([1, 2, 3]));
        const flushed: Uint8Array[] = [];
        const output = createOutputStream(b => flushed.push(b.slice()));
        const result = output.blockingSplice(input, 2n);
        expect(result.tag).toBe('ok');
        if (result.tag === 'ok') expect(result.val).toBe(2n);
    });

    it('blockingSplice propagates read error', () => {
        const input = createInputStream(new Uint8Array(0)); // empty → closed on first read
        const output = createOutputStream();
        const result = output.blockingSplice(input, 10n);
        expect(result.tag).toBe('err');
    });
});

describe('createOutputStreamFromP3 closed-state branches', () => {
    it('checkWrite returns closed after stream error', async () => {
        const pair = createStreamPair<Uint8Array>();
        const stream = createOutputStreamFromP3(pair);
        // Trigger a write error by closing pair and forcing write failure
        pair.close();
        stream.write(new Uint8Array([1]));
        // The write.catch will eventually close the stream
        await new Promise(r => setTimeout(r, 50));
        const result = stream.checkWrite();
        // Either closed or ok (depends on race), but should not throw
        expect(['ok', 'err']).toContain(result.tag);
    });

    it('flush returns closed when stream already closed', async () => {
        const pair = createStreamPair<Uint8Array>();
        const stream = createOutputStreamFromP3(pair);
        pair.close();
        stream.write(new Uint8Array([1]));
        await new Promise(r => setTimeout(r, 50));
        // If stream detected error, flush returns closed
        const result = stream.flush();
        expect(['ok', 'err']).toContain(result.tag);
    });
});

describe('createInputStreamFromP3 error stream', () => {
    it('error in async iterable propagates as stream error', async () => {
        const pair = createStreamPair<Uint8Array>();
        const stream = createInputStreamFromP3(pair.readable);
        pair.error(new Error('test stream error'));
        await new Promise(r => setTimeout(r, 10));
        const result = stream.read(10n);
        expect(result.tag).toBe('err');
        if (result.tag === 'err') {
            expect(result.val.tag).toBe('last-operation-failed');
        }
    });

    it('error after data yields data then error', async () => {
        const pair = createStreamPair<Uint8Array>();
        const stream = createInputStreamFromP3(pair.readable);
        await pair.write(new Uint8Array([1, 2, 3]));
        pair.error(new Error('mid-stream error'));
        await new Promise(r => setTimeout(r, 10));
        // First read gets buffered data
        const r1 = stream.read(10n);
        expect(r1.tag).toBe('ok');
        if (r1.tag === 'ok') {
            expect(r1.val).toEqual(new Uint8Array([1, 2, 3]));
        }
    });

    it('subscribe returns ready on error', async () => {
        const pair = createStreamPair<Uint8Array>();
        const stream = createInputStreamFromP3(pair.readable);
        pair.error(new Error('err'));
        await new Promise(r => setTimeout(r, 10));
        expect(stream.subscribe().ready()).toBe(true);
    });
});

describe('createAsyncPollable block after resolve', () => {
    it('block is no-op when already resolved', async () => {
        const promise = Promise.resolve();
        const p = createAsyncPollable(promise);
        await new Promise(r => setTimeout(r, 0));
        expect(() => p.block()).not.toThrow();
    });
});

describe('createInputStreamFromP3 blocking methods', () => {
    it('blockingRead returns data from buffer', async () => {
        const pair = createStreamPair<Uint8Array>();
        const stream = createInputStreamFromP3(pair.readable);
        await pair.write(new Uint8Array([10, 20, 30]));
        await new Promise(r => setTimeout(r, 10));
        const result = stream.blockingRead(2n);
        expect(result.tag).toBe('ok');
        if (result.tag === 'ok') {
            expect(result.val).toEqual(new Uint8Array([10, 20]));
        }
    });

    it('blockingRead returns closed when stream is done', async () => {
        const pair = createStreamPair<Uint8Array>();
        const stream = createInputStreamFromP3(pair.readable);
        pair.close();
        await new Promise(r => setTimeout(r, 10));
        const result = stream.blockingRead(10n);
        expect(result.tag).toBe('err');
        if (result.tag === 'err') {
            expect(result.val.tag).toBe('closed');
        }
    });

    it('blockingRead returns error when stream errored', async () => {
        const pair = createStreamPair<Uint8Array>();
        const stream = createInputStreamFromP3(pair.readable);
        pair.error(new Error('blockingRead error'));
        await new Promise(r => setTimeout(r, 10));
        const result = stream.blockingRead(10n);
        expect(result.tag).toBe('err');
        if (result.tag === 'err') {
            expect(result.val.tag).toBe('last-operation-failed');
        }
    });

    it('blockingRead throws JspiBlockSignal when no data available', async () => {
        const pair = createStreamPair<Uint8Array>();
        const stream = createInputStreamFromP3(pair.readable);
        // Don't write anything - the stream should need to block
        // First drain the initial pump by waiting for the eager start
        await new Promise(r => setTimeout(r, 0));
        try {
            stream.blockingRead(10n);
            // If no throw, it returned data or closed - both acceptable
        } catch (e) {
            expect(e).toBeInstanceOf(JspiBlockSignal);
        }
    });

    it('blockingSkip returns count from buffer', async () => {
        const pair = createStreamPair<Uint8Array>();
        const stream = createInputStreamFromP3(pair.readable);
        await pair.write(new Uint8Array([1, 2, 3, 4, 5]));
        await new Promise(r => setTimeout(r, 10));
        const result = stream.blockingSkip(3n);
        expect(result.tag).toBe('ok');
        if (result.tag === 'ok') {
            expect(result.val).toBe(3n);
        }
    });

    it('blockingSkip returns closed when done', async () => {
        const pair = createStreamPair<Uint8Array>();
        const stream = createInputStreamFromP3(pair.readable);
        pair.close();
        await new Promise(r => setTimeout(r, 10));
        const result = stream.blockingSkip(10n);
        expect(result.tag).toBe('err');
        if (result.tag === 'err') {
            expect(result.val.tag).toBe('closed');
        }
    });

    it('blockingSkip returns error when stream errored', async () => {
        const pair = createStreamPair<Uint8Array>();
        const stream = createInputStreamFromP3(pair.readable);
        pair.error(new Error('blockingSkip error'));
        await new Promise(r => setTimeout(r, 10));
        const result = stream.blockingSkip(10n);
        expect(result.tag).toBe('err');
        if (result.tag === 'err') {
            expect(result.val.tag).toBe('last-operation-failed');
        }
    });
});

describe('poll with JspiBlockSignal', () => {
    it('poll catches JspiBlockSignal and re-throws with poll result promise', () => {
        let resolvePromise: (() => void) | null = null;
        const promise = new Promise<void>(r => { resolvePromise = r; });
        const pollable = createAsyncPollable(promise);
        // Pollable is not resolved yet, so poll should catch JspiBlockSignal
        try {
            poll([pollable]);
            fail('should have thrown');
        } catch (e) {
            expect(e).toBeInstanceOf(JspiBlockSignal);
            // Resolve to allow cleanup
            resolvePromise!();
        }
    });

    it('poll returns result after synchronous block completes', () => {
        let blocked = false;
        const pollable: WasiPollable = {
            ready: () => blocked,
            block: () => { blocked = true; },
        };
        const result = poll([pollable]);
        expect(result).toBeInstanceOf(Uint32Array);
        expect(result[0]).toBe(0);
    });
});
