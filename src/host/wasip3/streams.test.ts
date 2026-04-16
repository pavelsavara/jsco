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
