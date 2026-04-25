// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * Tests for wasi:io/poll through the P2-via-P3 adapter.
 * Mirrors wasip2/poll.test.ts.
 */

import { createWasiP2ViaP3Adapter } from '../../../src/host/wasip2-via-wasip3/index';
import { createMockP3 } from '../../../src/host/wasip2-via-wasip3/test-helpers';
import { createSyncPollable, createAsyncPollable, poll, JspiBlockSignal } from '../../../src/host/wasip2-via-wasip3/io';
import type { WasiPollable } from '../../../src/host/wasip2-via-wasip3/io';

describe('wasi:io/poll (via P3 adapter)', () => {
    describe('createSyncPollable', () => {
        it('ready() reflects readiness function', () => {
            let ready = false;
            const p = createSyncPollable(() => ready);
            expect(p.ready()).toBe(false);
            ready = true;
            expect(p.ready()).toBe(true);
        });

        it('block() succeeds when already ready', () => {
            const p = createSyncPollable(() => true);
            expect(() => p.block()).not.toThrow();
        });

        it('block() throws when not ready', () => {
            const p = createSyncPollable(() => false);
            expect(() => p.block()).toThrow();
        });

        it('ready() can transition from false to true', () => {
            let count = 0;
            const p = createSyncPollable(() => ++count >= 3);
            expect(p.ready()).toBe(false);
            expect(p.ready()).toBe(false);
            expect(p.ready()).toBe(true);
        });
    });

    describe('createAsyncPollable', () => {
        it('ready() is false before promise resolves', () => {
            const p = createAsyncPollable(new Promise(() => { }));
            expect(p.ready()).toBe(false);
        });

        it('ready() becomes true after promise resolves', async () => {
            let resolve!: () => void;
            const promise = new Promise<void>(r => { resolve = r; });
            const p = createAsyncPollable(promise);
            expect(p.ready()).toBe(false);
            resolve();
            await promise;
            await new Promise(r => setTimeout(r, 0));
            expect(p.ready()).toBe(true);
        });

        it('block() on already-resolved pollable returns immediately', async () => {
            const promise = Promise.resolve();
            const p = createAsyncPollable(promise);
            await promise;
            await new Promise(r => setTimeout(r, 0));
            expect(() => p.block()).not.toThrow();
        });
    });

    describe('poll()', () => {
        it('returns index of single ready pollable', () => {
            const p = createSyncPollable(() => true);
            const result = poll([p]);
            expect(result).toEqual(new Uint32Array([0]));
        });

        it('returns indices of all ready pollables', () => {
            const p0 = createSyncPollable(() => true);
            const p1 = createSyncPollable(() => false);
            const p2 = createSyncPollable(() => true);
            const result = poll([p0, p1, p2]);
            expect(result).toEqual(new Uint32Array([0, 2]));
        });

        it('returns only ready indices', () => {
            const p0 = createSyncPollable(() => false);
            const p1 = createSyncPollable(() => true);
            const result = poll([p0, p1]);
            expect(result).toEqual(new Uint32Array([1]));
        });

        it('throws on empty pollable list', () => {
            expect(() => poll([])).toThrow('at least one pollable');
        });

        it('throws when no pollables are ready (sync only)', () => {
            const p = createSyncPollable(() => false);
            expect(() => poll([p])).toThrow();
        });

        it('handles duplicate pollable references', () => {
            const p = createSyncPollable(() => true);
            const result = poll([p, p, p]);
            expect(result).toEqual(new Uint32Array([0, 1, 2]));
        });

        it('handles many pollables at once', () => {
            const pollables = Array.from({ length: 100 }, (_, i) =>
                createSyncPollable(() => i % 3 === 0)
            );
            const result = poll(pollables);
            const expected = Array.from({ length: 100 }, (_, i) => i).filter(i => i % 3 === 0);
            expect(result).toEqual(new Uint32Array(expected));
        });

        it('poll with single not-ready among many ready returns only ready', () => {
            const pollables = Array.from({ length: 5 }, (_, i) =>
                createSyncPollable(() => i !== 2)
            );
            const result = poll(pollables);
            expect(result).toEqual(new Uint32Array([0, 1, 3, 4]));
        });
    });

    describe('adapter poll interface', () => {
        it('poll dispatches through adapter', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const pollFn = host['wasi:io/poll']!['poll']!;
            const pollable: WasiPollable = { ready: () => true, block: () => { } };
            const indices = pollFn([pollable]);
            expect(indices).toBeInstanceOf(Uint32Array);
            expect(indices.length).toBe(1);
            expect(indices[0]).toBe(0);
        });

        it('[method]pollable.ready dispatches to the pollable', () => {
            const host = createWasiP2ViaP3Adapter(createMockP3());
            const readyFn = host['wasi:io/poll']!['[method]pollable.ready']!;
            const pollable: WasiPollable = { ready: () => true, block: () => { } };
            expect(readyFn(pollable)).toBe(true);
        });
    });

    describe('JspiBlockSignal', () => {
        it('carries the promise', () => {
            const promise = Promise.resolve();
            const signal = new JspiBlockSignal(promise);
            expect(signal.promise).toBe(promise);
        });
    });
});
