// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import {
    readableFromStream,
    readableFromAsyncIterable,
    createStreamPair,
    collectStream,
    collectBytes,
} from './streams';

describe('StreamBridge', () => {
    // ─── 1.2 Happy path ─────────────────────────────────────────────

    describe('happy path', () => {
        it('wraps a ReadableStream<Uint8Array> and iterates to completion', async () => {
            const data = new Uint8Array([1, 2, 3, 4, 5]);
            const webStream = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(data);
                    controller.close();
                },
            });
            const readable = readableFromStream(webStream);
            const collected = await collectBytes(readable);
            expect(collected).toEqual(data);
        });

        it('wraps a WritableStream-like pair and verifies flushed data', async () => {
            const pair = createStreamPair<Uint8Array>();
            const chunk = new Uint8Array([10, 20, 30]);
            // Write then close from producer side
            const writePromise = pair.write(chunk);
            // Start consuming
            const collectPromise = collectBytes(pair.readable);
            await writePromise;
            pair.close();
            const result = await collectPromise;
            expect(result).toEqual(chunk);
        });

        it('round-trip: readable → writable → collect, bytes match', async () => {
            const original = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
            const pair = createStreamPair<Uint8Array>();

            // Producer writes
            const writePromise = pair.write(original);
            const collectPromise = collectBytes(pair.readable);
            await writePromise;
            pair.close();

            const result = await collectPromise;
            expect(result).toEqual(original);
        });

        it('stream of non-byte type (struct values survive the bridge)', async () => {
            interface DirectoryEntry { name: string; type: string }
            const entries: DirectoryEntry[] = [
                { name: 'file.txt', type: 'regular-file' },
                { name: 'subdir', type: 'directory' },
            ];
            const pair = createStreamPair<DirectoryEntry>();

            const collectPromise = collectStream(pair.readable);
            for (const entry of entries) {
                await pair.write(entry);
            }
            pair.close();

            const result = await collectPromise;
            expect(result).toEqual(entries);
        });

        it('empty stream iterates to zero elements', async () => {
            const pair = createStreamPair<Uint8Array>();
            pair.close();
            const result = await collectStream(pair.readable);
            expect(result).toEqual([]);
        });
    });

    // ─── 1.2 Error path ─────────────────────────────────────────────

    describe('error path', () => {
        it('readable stream that errors mid-stream propagates error to consumer', async () => {
            const pair = createStreamPair<number>();

            const collectPromise = collectStream(pair.readable);
            await pair.write(1);
            pair.error(new Error('stream broke'));

            await expect(collectPromise).rejects.toThrow('stream broke');
        });

        it('write after close is rejected', async () => {
            const pair = createStreamPair<string>();
            pair.close();
            await expect(pair.write('late')).rejects.toThrow(/write after close/);
        });

        it('ReadableStream that errors mid-stream propagates error', async () => {
            const webStream = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new Uint8Array([1, 2]));
                    controller.error(new Error('source error'));
                },
            });
            const readable = readableFromStream(webStream);
            await expect(collectBytes(readable)).rejects.toThrow('source error');
        });

        it('close readable stream prematurely — consumer sees end of stream', async () => {
            const pair = createStreamPair<number>();
            // Start consuming before writing (backpressure: write blocks until read)
            const collectPromise = collectStream(pair.readable);
            await pair.write(1);
            pair.close();
            const result = await collectPromise;
            expect(result).toEqual([1]);
        });

        it('error stream cancels pending reads', async () => {
            const pair = createStreamPair<number>();
            // Start consuming — will wait for items
            const collectPromise = collectStream(pair.readable);
            await pair.write(42);
            // Error signals the consumer to throw
            pair.error(new Error('cancelled'));
            await expect(collectPromise).rejects.toThrow('cancelled');
        });
    });

    // ─── 1.2 Edge cases ─────────────────────────────────────────────

    describe('edge cases', () => {
        it('single-byte reads work correctly', async () => {
            const pair = createStreamPair<Uint8Array>();
            const collectPromise = collectBytes(pair.readable);
            await pair.write(new Uint8Array([42]));
            pair.close();
            const result = await collectPromise;
            expect(result).toEqual(new Uint8Array([42]));
        });

        it('backpressure: write resolves only after consumer reads', async () => {
            const pair = createStreamPair<number>();
            let writeResolved = false;

            const writePromise = pair.write(1).then(() => { writeResolved = true; });

            // Write should not resolve until consumer reads
            await new Promise(r => setTimeout(r, 10));
            expect(writeResolved).toBe(false);

            // Now consume
            const iterator = pair.readable[Symbol.asyncIterator]();
            const { value } = await iterator.next();
            expect(value).toBe(1);

            await writePromise;
            expect(writeResolved).toBe(true);

            pair.close();
            const { done } = await iterator.next();
            expect(done).toBe(true);
        });

        it('stream with exactly one chunk yields one value then completes', async () => {
            const pair = createStreamPair<string>();
            const collectPromise = collectStream(pair.readable);
            await pair.write('only-one');
            pair.close();
            const result = await collectPromise;
            expect(result).toEqual(['only-one']);
        });

        it('multiple chunks are yielded in order', async () => {
            const pair = createStreamPair<number>();
            const collectPromise = collectStream(pair.readable);

            await pair.write(1);
            await pair.write(2);
            await pair.write(3);
            pair.close();

            const result = await collectPromise;
            expect(result).toEqual([1, 2, 3]);
        });

        it('large chunk (1MB+) passes through without corruption', async () => {
            const pair = createStreamPair<Uint8Array>();
            const size = 1024 * 1024 + 7; // 1MB + 7 bytes
            const data = new Uint8Array(size);
            for (let i = 0; i < size; i++) data[i] = i & 0xFF;
            const collectPromise = collectBytes(pair.readable);
            await pair.write(data);
            pair.close();
            const result = await collectPromise;
            expect(result.length).toBe(size);
            expect(result[0]).toBe(0);
            expect(result[size - 1]).toBe((size - 1) & 0xFF);
        });

        it('zero-length Uint8Array chunk passes through', async () => {
            const pair = createStreamPair<Uint8Array>();
            const collectPromise = collectStream(pair.readable);
            await pair.write(new Uint8Array(0));
            await pair.write(new Uint8Array([1]));
            pair.close();
            const result = await collectPromise;
            expect(result.length).toBe(2);
        });

        it('backpressure: fast consumer, slow producer — consumer awaits without spinning', async () => {
            const pair = createStreamPair<number>();
            const received: number[] = [];

            // Start consuming immediately (fast consumer)
            const consumePromise = (async () => {
                for await (const item of pair.readable) {
                    received.push(item);
                }
            })();

            // Slow producer: write with delays
            await pair.write(1);
            await new Promise(r => setTimeout(r, 10));
            await pair.write(2);
            await new Promise(r => setTimeout(r, 10));
            await pair.write(3);
            pair.close();

            await consumePromise;
            expect(received).toEqual([1, 2, 3]);
        });
    });

    // ─── 1.2 Invalid arguments ──────────────────────────────────────

    describe('invalid arguments', () => {
        it('readableFromAsyncIterable with proper async iterable works', async () => {
            async function* gen() {
                yield 'a';
                yield 'b';
            }
            const readable = readableFromAsyncIterable(gen());
            const result = await collectStream(readable);
            expect(result).toEqual(['a', 'b']);
        });

        it('readableFromAsyncIterable with empty iterable yields nothing', async () => {
            async function* gen() {
                // empty
            }
            const readable = readableFromAsyncIterable(gen());
            const result = await collectStream(readable);
            expect(result).toEqual([]);
        });
    });

    // ─── 1.2 Evil arguments ─────────────────────────────────────────

    describe('evil arguments', () => {
        it('async iterable that throws on next() propagates error', async () => {
            const evil: AsyncIterable<string> = {
                [Symbol.asyncIterator]() {
                    let first = true;
                    return {
                        next() {
                            if (first) {
                                first = false;
                                return Promise.resolve({ value: 'ok', done: false as const });
                            }
                            return Promise.reject(new Error('evil next'));
                        },
                    };
                },
            };
            const readable = readableFromAsyncIterable(evil);
            const items: string[] = [];
            await expect((async () => {
                for await (const item of readable) {
                    items.push(item);
                }
            })()).rejects.toThrow('evil next');
            expect(items).toEqual(['ok']);
        });

        it('thenable value does not confuse async iteration', async () => {
            // An object with a `then` property that is NOT a function
            const sneaky = { then: 'not-a-function', data: 42 };
            const pair = createStreamPair<typeof sneaky>();
            const collectPromise = collectStream(pair.readable);
            await pair.write(sneaky);
            pair.close();
            const result = await collectPromise;
            expect(result).toEqual([sneaky]);
        });

        it('error after close is silently ignored', () => {
            const pair = createStreamPair<number>();
            pair.close();
            // Should not throw
            pair.error(new Error('late error'));
        });

        it('double close is silently ignored', () => {
            const pair = createStreamPair<number>();
            pair.close();
            pair.close(); // should not throw
        });

        it('infinite async iterable can be broken out of by consumer', async () => {
            async function* infinite() {
                let i = 0;
                while (true) {
                    yield i++;
                }
            }
            const readable = readableFromAsyncIterable(infinite());
            const items: number[] = [];
            for await (const item of readable) {
                items.push(item);
                if (items.length >= 5) break;
            }
            expect(items).toEqual([0, 1, 2, 3, 4]);
        });

        it('iterator whose return() throws — consumer still gets collected data', async () => {
            let returnCalled = false;
            const evil: AsyncIterable<number> = {
                [Symbol.asyncIterator]() {
                    let i = 0;
                    return {
                        next() {
                            if (i < 3) return Promise.resolve({ value: i++, done: false as const });
                            return Promise.resolve({ value: undefined, done: true as const });
                        },
                        return() {
                            returnCalled = true;
                            throw new Error('evil return');
                        },
                    };
                },
            };
            const readable = readableFromAsyncIterable(evil);
            const items: number[] = [];
            for await (const item of readable) {
                items.push(item);
            }
            expect(items).toEqual([0, 1, 2]);
        });

        it('null yielded from async iterable is passed through', async () => {
            async function* gen() {
                yield null;
                yield 42;
            }
            const readable = readableFromAsyncIterable(gen());
            const result = await collectStream(readable);
            expect(result).toEqual([null, 42]);
        });

        it('Proxy object that throws on property access is propagated', async () => {
            // Proxy must not trap `.then` — JS Promise resolution checks `.then`
            // on yielded values from async generators (thenable check)
            const evilProxy = new Proxy({}, {
                get(_target, prop) {
                    if (prop === 'then') return undefined; // allow thenable check
                    throw new Error('proxy trap');
                },
            });
            const pair = createStreamPair<unknown>();
            const collectPromise = collectStream(pair.readable);
            // Writing the proxy itself should succeed (we're not accessing properties)
            await pair.write(evilProxy);
            pair.close();
            const result = await collectPromise;
            // The proxy is stored as-is; accessing its properties would throw
            expect(result.length).toBe(1);
            expect(() => (result[0] as Record<string, unknown>).anything).toThrow('proxy trap');
        });

        it('iterator that calls next() after done gets no extra values', async () => {
            const values = [10, 20];
            let nextCallCount = 0;
            const iterable: AsyncIterable<number> = {
                [Symbol.asyncIterator]() {
                    let idx = 0;
                    return {
                        next() {
                            nextCallCount++;
                            if (idx < values.length) {
                                return Promise.resolve({ value: values[idx++]!, done: false as const });
                            }
                            return Promise.resolve({ value: undefined, done: true as const });
                        },
                    };
                },
            };
            const readable = readableFromAsyncIterable(iterable);
            const result = await collectStream(readable);
            expect(result).toEqual([10, 20]);
            // Bridge should call next() exactly 3 times: two values + one done
            expect(nextCallCount).toBe(3);
        });
    });

    // ─── 1.2 Multi-step: chunked vs element-by-element ─────────────

    describe('chunked vs element-by-element', () => {
        it('stream<u8> works with Uint8Array chunks (batch mode)', async () => {
            const pair = createStreamPair<Uint8Array>();
            const collectPromise = collectBytes(pair.readable);

            await pair.write(new Uint8Array([1, 2, 3]));
            await pair.write(new Uint8Array([4, 5]));
            pair.close();

            const result = await collectPromise;
            expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
        });

        it('stream<u8> works with single-byte chunks (element mode)', async () => {
            const pair = createStreamPair<Uint8Array>();
            const collectPromise = collectBytes(pair.readable);

            await pair.write(new Uint8Array([1]));
            await pair.write(new Uint8Array([2]));
            await pair.write(new Uint8Array([3]));
            pair.close();

            const result = await collectPromise;
            expect(result).toEqual(new Uint8Array([1, 2, 3]));
        });

        it('stream<directory-entry> works per-entry', async () => {
            interface DirEntry { name: string; type: string }
            const pair = createStreamPair<DirEntry>();
            const collectPromise = collectStream(pair.readable);

            await pair.write({ name: 'a.txt', type: 'regular-file' });
            await pair.write({ name: 'b/', type: 'directory' });
            pair.close();

            const result = await collectPromise;
            expect(result).toEqual([
                { name: 'a.txt', type: 'regular-file' },
                { name: 'b/', type: 'directory' },
            ]);
        });
    });
});
