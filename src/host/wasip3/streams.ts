// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

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
 */
export function createStreamPair<T>(): StreamPair<T> {
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
                item.resolve();
                yield item.value;
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
