// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

/**
 * WASIp3 Stream Bridge — adapts web ReadableStream / WritableStream
 * and async iterables to the component-model stream protocol.
 *
 * WasiStreamReadable<T>  — async iterable you read/consume from
 * WasiStreamWritable<T>  — async iterable the runtime writes into
 */

/** A readable end of a WASIp3 `stream<T>`. */
export interface WasiStreamReadable<T> {
    [Symbol.asyncIterator](): AsyncIterableIterator<T>;
}

/** A writable end of a WASIp3 `stream<T>`. */
export interface WasiStreamWritable<T> {
    [Symbol.asyncIterator](): AsyncIterableIterator<T>;
}

/**
 * Create a WasiStreamReadable<T> from a web ReadableStream<T>.
 */
export function readableFromStream<T>(stream: ReadableStream<T>): WasiStreamReadable<T> {
    const reader = stream.getReader();
    return {
        async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
            try {
                for (; ;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    yield value;
                }
            } finally {
                reader.releaseLock();
            }
        },
    };
}

/**
 * Create a WasiStreamReadable<T> from an async iterable.
 */
export function readableFromAsyncIterable<T>(iterable: AsyncIterable<T>): WasiStreamReadable<T> {
    return {
        async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
            yield* iterable;
        },
    };
}

/**
 * Pair returned by `createStreamPair()`.
 * - `readable` — consume items from the stream
 * - `writable` — push items into the stream
 * - `close()`  — signal the end of the stream from the producer side
 * - `error(e)` — signal an error from the producer side
 */
export interface StreamPair<T> {
    readable: WasiStreamReadable<T>;
    write(value: T): Promise<void>;
    close(): void;
    error(err: unknown): void;
}

/**
 * Create a linked readable/writable stream pair with backpressure.
 *
 * The producer calls `write(value)` which returns a Promise that resolves
 * when the consumer has consumed the value (pull-based backpressure).
 *
 * By default `write()` resolves as soon as the consumer *pulls* the value
 * (the `.next()` that returns it). Pass `resolveOnConsume: true` to instead
 * resolve only after the consumer pulls the *following* item — i.e. once a
 * `for await` body that awaits the value (e.g. `await writer.write(chunk)` in
 * the stdout/stderr pump) has finished. This lets a caller flush buffered
 * output by awaiting all in-flight `write()` promises and be sure every chunk
 * has reached the sink, instead of seeing a truncated tail. It must stay
 * opt-in: single-pull consumers (input-stream pumps, `iterator.next()` in
 * tests) only call `.next()` once and would otherwise hang waiting for a
 * second pull that never comes.
 */
export function createStreamPair<T>(options?: { resolveOnConsume?: boolean }): StreamPair<T> {
    const resolveOnConsume = options?.resolveOnConsume ?? false;
    // Queue of pending values and a way to signal the consumer
    type QueueItem =
        | { tag: 'value'; value: T; resolve: () => void }
        | { tag: 'done' }
        | { tag: 'error'; error: unknown };

    const queue: QueueItem[] = [];
    let waiter: ((item: QueueItem) => void) | undefined;
    let closed = false;

    function enqueue(item: QueueItem): void {
        if (waiter) {
            const w = waiter;
            waiter = undefined;
            w(item);
        } else {
            queue.push(item);
        }
    }

    function dequeue(): Promise<QueueItem> {
        if (queue.length > 0) {
            return Promise.resolve(queue.shift()!);
        }
        return new Promise<QueueItem>(resolve => {
            waiter = resolve;
        });
    }

    const readable: WasiStreamReadable<T> = {
        async *[Symbol.asyncIterator]() {
            for (; ;) {
                const item = await dequeue();
                if (item.tag === 'done') return;
                if (item.tag === 'error') throw item.error;
                if (resolveOnConsume) {
                    // Resolve the producer's write() promise only AFTER the
                    // consumer pulls the next item. For a `for await` consumer
                    // that awaits its body (e.g. `await writer.write(chunk)` in
                    // pumpToWritable), the next .next() call — which resumes us
                    // past this yield — does not happen until that body has
                    // finished. This guarantees that awaiting the write() promise
                    // means the chunk has reached the sink, so a blocking flush
                    // before a sync-lift export returns captures the full tail of
                    // stdout/stderr instead of a truncated one.
                    yield item.value;
                    item.resolve();
                } else {
                    // Default: resolve as soon as the value is pulled. Required by
                    // single-pull consumers (input-stream pumps, plain
                    // `iterator.next()`) that only call .next() once per chunk.
                    item.resolve();
                    yield item.value;
                }
            }
        },
    };

    return {
        readable,

        write(value: T): Promise<void> {
            if (closed) return Promise.reject(new Error('StreamBridge: write after close'));
            return new Promise<void>(resolve => {
                enqueue({ tag: 'value', value, resolve });
            });
        },

        close(): void {
            if (closed) return;
            closed = true;
            enqueue({ tag: 'done' });
        },

        error(err: unknown): void {
            if (closed) return;
            closed = true;
            enqueue({ tag: 'error', error: err });
        },
    };
}

/**
 * Collect all items from a WasiStreamReadable into an array.
 */
export async function collectStream<T>(readable: WasiStreamReadable<T>): Promise<T[]> {
    const items: T[] = [];
    for await (const item of readable) {
        items.push(item);
    }
    return items;
}

/**
 * Collect all byte chunks from a WasiStreamReadable<Uint8Array> into a single Uint8Array.
 */
export async function collectBytes(readable: WasiStreamReadable<Uint8Array>): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    let totalLength = 0;
    for await (const chunk of readable) {
        chunks.push(chunk);
        totalLength += chunk.length;
    }
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    return result;
}
