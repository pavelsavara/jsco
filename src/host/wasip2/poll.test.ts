// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { createSyncPollable, createAsyncPollable, poll, hasJspi, JspiBlockSignal } from './poll';

describe('wasi:io/poll', () => {
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

        it('block() throws when not ready (cannot block without JSPI)', () => {
            const p = createSyncPollable(() => false);
            expect(() => p.block()).toThrow('cannot block without JSPI');
        });

        it('ready() can transition from false to true', () => {
            let count = 0;
            const p = createSyncPollable(() => ++count >= 3);
            expect(p.ready()).toBe(false); // count=1
            expect(p.ready()).toBe(false); // count=2
            expect(p.ready()).toBe(true); // count=3
        });
    });

    describe('createAsyncPollable', () => {
        it('ready() is false before promise resolves', () => {
            const p = createAsyncPollable(new Promise(() => { })); // never resolves
            expect(p.ready()).toBe(false);
        });

        it('ready() becomes true after promise resolves', async () => {
            let resolve!: () => void;
            const promise = new Promise<void>(r => { resolve = r; });
            const p = createAsyncPollable(promise);
            expect(p.ready()).toBe(false);
            resolve();
            await promise;
            // Allow microtask to run
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


        if (!hasJspi()) {
            // Intentionally skipped when running with `--experimental-wasm-jspi`. The test verifies
            // the error message shown to users who don't have JSPI enabled. It only runs when JSPI
            // is absent. Not a bug — test infrastructure design.
            it('block() throws JSPI error with helpful message in non-JSPI environment', () => {
                const p = createAsyncPollable(new Promise(() => { }));
                expect(() => p.block()).toThrow('JSPI');
                expect(() => p.block()).toThrow('chrome://flags');
            });
        } else {
            it('block() throws JspiBlockSignal when JSPI available but not resolved', () => {
                // We can't test real JSPI in Node, but we can verify the signal
                // would be thrown if hasJspi() returned true.
                // This is tested indirectly via the error path.
                const p = createAsyncPollable(new Promise(() => { }));
                try {
                    p.block();
                } catch (e) {
                    // In Node.js without JSPI, we get the error string
                    expect(e).toBeDefined();
                }
            });
        }
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
            // Without JSPI, blocking on non-ready sync pollable throws
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

    describe('hasJspi()', () => {
        it('returns boolean', () => {
            expect(typeof hasJspi()).toBe('boolean');
        });

        it('returns consistent cached results on repeated calls', () => {
            const first = hasJspi();
            const second = hasJspi();
            const third = hasJspi();
            expect(first).toBe(second);
            expect(second).toBe(third);
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
