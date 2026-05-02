// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

/**
 * wasi:io adapter — synthesizes P2 error, poll, and streams from P3 async primitives.
 *
 * P3 has no wasi:io at all — streams are built-in CM types (async iterables)
 * and polling is replaced by Promises. This module creates the full P2 io
 * surface (WasiError, WasiPollable, WasiInputStream, WasiOutputStream) from
 * P3 stream pairs and promises.
 */

import type { WasiStreamReadable } from '../wasip3';

import type { StreamPair } from '../wasip3';
import { ok, err } from '../wasip3';

// ─── wasi:io/error ───

export interface WasiError {
    toDebugString(): string;
    /** Optional discriminated-union payload that the http adapter's
     *  `http-error-code` binding maps back to a wasi:http error-code. */
    httpErrorCode?: { tag: string; val?: unknown };
}

export function createWasiError(message: string, httpErrorCode?: { tag: string; val?: unknown }): WasiError {
    return { toDebugString: () => message, httpErrorCode };
}

// ─── wasi:io/poll ───

export interface WasiPollable {
    ready(): boolean;
    block(): void;
}

export type PollResult = Uint32Array;

export function createSyncPollable(isReady: () => boolean): WasiPollable {
    return {
        ready: isReady,
        block(): void {
            if (isReady()) return;
            throw new Error('Synchronous pollable is not ready and cannot block');
        },
    };
}

export function createAsyncPollable(promise: Promise<void>): WasiPollable {
    let resolved = false;
    promise.then(() => { resolved = true; });
    return {
        ready: () => resolved,
        block(): void {
            if (resolved) return;
            throw new JspiBlockSignal(promise);
        },
    };
}

export class JspiBlockSignal {
    constructor(public readonly promise: Promise<unknown>) { }
}

export function poll(pollables: WasiPollable[]): PollResult {
    if (pollables.length === 0) {
        throw new Error('poll() requires at least one pollable');
    }
    const ready: number[] = [];
    for (let i = 0; i < pollables.length; i++) {
        if (pollables[i]!.ready()) {
            ready.push(i);
        }
    }
    if (ready.length > 0) {
        return new Uint32Array(ready);
    }
    // Need to block — catch JspiBlockSignal and re-throw with the actual poll result
    try {
        pollables[0]!.block();
    } catch (e) {
        if (e instanceof JspiBlockSignal) {
            throw new JspiBlockSignal(e.promise.then(() => {
                const readyAfterBlock: number[] = [];
                for (let i = 0; i < pollables.length; i++) {
                    if (pollables[i]!.ready()) {
                        readyAfterBlock.push(i);
                    }
                }
                if (readyAfterBlock.length === 0) {
                    throw new Error('poll() blocked but no pollables became ready');
                }
                return new Uint32Array(readyAfterBlock);
            }));
        }
        throw e;
    }
    const readyAfterBlock: number[] = [];
    for (let i = 0; i < pollables.length; i++) {
        if (pollables[i]!.ready()) {
            readyAfterBlock.push(i);
        }
    }
    if (readyAfterBlock.length === 0) {
        throw new Error('poll() blocked but no pollables became ready');
    }
    return new Uint32Array(readyAfterBlock);
}

// ─── wasi:io/streams ───

export type StreamError =
    | { tag: 'last-operation-failed'; val: WasiError }
    | { tag: 'closed' };

export type StreamResult<T> =
    | { tag: 'ok'; val: T }
    | { tag: 'err'; val: StreamError };

function streamOk<T>(val: T): StreamResult<T> {
    return ok(val);
}

function streamClosed<T>(): StreamResult<T> {
    return err({ tag: 'closed' });
}

function streamFailed<T>(message: string): StreamResult<T> {
    return err({ tag: 'last-operation-failed', val: createWasiError(message) });
}

export interface WasiInputStream {
    read(len: bigint): StreamResult<Uint8Array>;
    blockingRead(len: bigint): StreamResult<Uint8Array>;
    skip(len: bigint): StreamResult<bigint>;
    blockingSkip(len: bigint): StreamResult<bigint>;
    subscribe(): WasiPollable;
}

export interface WasiOutputStream {
    checkWrite(): StreamResult<bigint>;
    write(contents: Uint8Array): StreamResult<void>;
    blockingWriteAndFlush(contents: Uint8Array): StreamResult<void>;
    flush(): StreamResult<void>;
    blockingFlush(): StreamResult<void>;
    writeZeroes(len: bigint): StreamResult<void>;
    blockingWriteZeroesAndFlush(len: bigint): StreamResult<void>;
    splice(src: WasiInputStream, len: bigint): StreamResult<bigint>;
    blockingSplice(src: WasiInputStream, len: bigint): StreamResult<bigint>;
    subscribe(): WasiPollable;
}

/**
 * Create a P2 InputStream backed by a P3 WasiStreamReadable<Uint8Array>.
 *
 * Internally pumps the async iterable into a buffer. P2 read() returns
 * whatever is available; subscribe() returns a pollable tied to the
 * next chunk arriving.
 */
export function createInputStreamFromP3(
    p3stream: WasiStreamReadable<Uint8Array>,
): WasiInputStream {
    let buffer = new Uint8Array(0);
    let closed = false;
    let error: string | null = null;
    let nextChunkPromise: Promise<void> | null = null;
    let nextChunkReady = false;

    const iterator = p3stream[Symbol.asyncIterator]();

    function startPumping(): void {
        if (nextChunkPromise || closed) return;
        nextChunkReady = false;
        nextChunkPromise = (async (): Promise<void> => {
            try {
                const { done, value } = await iterator.next();
                if (done) {
                    closed = true;
                } else {
                    const old = buffer;
                    buffer = new Uint8Array(old.length + value.length);
                    buffer.set(old);
                    buffer.set(value, old.length);
                }
            } catch (e) {
                error = e instanceof Error ? e.message : String(e);
                closed = true;
            }
            nextChunkReady = true;
            nextChunkPromise = null;
        })();
    }

    // Start the first pump eagerly
    startPumping();

    return {
        read(len: bigint): StreamResult<Uint8Array> {
            if (error) return streamFailed(error);
            if (buffer.length > 0) {
                const count = Math.min(Number(len), buffer.length);
                const result = buffer.slice(0, count);
                buffer = buffer.slice(count);
                if (buffer.length === 0) startPumping();
                return streamOk(result);
            }
            if (closed) return streamClosed();
            // No data available yet — non-blocking returns empty
            return streamOk(new Uint8Array(0));
        },

        blockingRead(len: bigint): StreamResult<Uint8Array> {
            if (error) return streamFailed(error);
            if (buffer.length > 0) {
                return this.read(len);
            }
            if (closed) return streamClosed();
            // Need to block until data arrives
            startPumping();
            if (nextChunkPromise && !nextChunkReady) {
                throw new JspiBlockSignal(nextChunkPromise.then(() => this.read(len)));
            }
            return this.read(len);
        },

        skip(len: bigint): StreamResult<bigint> {
            if (error) return streamFailed(error);
            if (buffer.length > 0) {
                const count = Math.min(Number(len), buffer.length);
                buffer = buffer.slice(count);
                if (buffer.length === 0) startPumping();
                return streamOk(BigInt(count));
            }
            if (closed) return streamClosed();
            return streamOk(0n);
        },

        blockingSkip(len: bigint): StreamResult<bigint> {
            if (error) return streamFailed(error);
            if (buffer.length > 0) {
                return this.skip(len);
            }
            if (closed) return streamClosed();
            startPumping();
            if (nextChunkPromise && !nextChunkReady) {
                throw new JspiBlockSignal(nextChunkPromise.then(() => this.skip(len)));
            }
            return this.skip(len);
        },

        subscribe(): WasiPollable {
            if (buffer.length > 0 || closed || error) {
                return createSyncPollable(() => true);
            }
            startPumping();
            if (nextChunkPromise) {
                return createAsyncPollable(nextChunkPromise.then(() => { }));
            }
            return createSyncPollable(() => true);
        },
    };
}

/**
 * Create a P2 OutputStream that forwards writes into a P3 StreamPair.
 *
 * The readable end of the pair should be passed to the P3 host function
 * that consumes a stream (e.g. stdout.writeViaStream).
 */
export function createOutputStreamFromP3(
    pair: StreamPair<Uint8Array>,
    bufferCapacity: number = 1024 * 1024,
): WasiOutputStream {
    let closed = false;
    const CAPACITY = bufferCapacity;

    return {
        checkWrite(): StreamResult<bigint> {
            if (closed) return streamClosed();
            return streamOk(BigInt(CAPACITY));
        },

        write(contents: Uint8Array): StreamResult<void> {
            if (closed) return streamClosed();
            // Lowering trampoline may provide a plain Array for list<u8>; ensure Uint8Array for P3
            const bytes = contents instanceof Uint8Array ? contents : new Uint8Array(contents);
            // Fire-and-forget the write — P2 write is non-blocking
            pair.write(bytes).catch(() => { closed = true; });
            return streamOk(undefined);
        },

        blockingWriteAndFlush(contents: Uint8Array): StreamResult<void> {
            if (closed) return streamClosed();
            const bytes = contents instanceof Uint8Array ? contents : new Uint8Array(contents);
            const p = pair.write(bytes);
            // For blocking variant we need to wait
            throw new JspiBlockSignal(p.then(() => streamOk(undefined)));
        },

        flush(): StreamResult<void> {
            if (closed) return streamClosed();
            return streamOk(undefined);
        },

        blockingFlush(): StreamResult<void> {
            if (closed) return streamClosed();
            return streamOk(undefined);
        },

        writeZeroes(len: bigint): StreamResult<void> {
            if (closed) return streamClosed();
            const zeroes = new Uint8Array(Number(len));
            pair.write(zeroes).catch(() => { closed = true; });
            return streamOk(undefined);
        },

        blockingWriteZeroesAndFlush(len: bigint): StreamResult<void> {
            if (closed) return streamClosed();
            const zeroes = new Uint8Array(Number(len));
            const p = pair.write(zeroes);
            throw new JspiBlockSignal(p.then(() => streamOk(undefined)));
        },

        splice(src: WasiInputStream, len: bigint): StreamResult<bigint> {
            const readResult = src.read(len);
            if (readResult.tag === 'err') return readResult as StreamResult<bigint>;
            const data = readResult.val;
            const writeResult = this.write(data);
            if (writeResult.tag === 'err') return writeResult as StreamResult<bigint>;
            return streamOk(BigInt(data.length));
        },

        blockingSplice(src: WasiInputStream, len: bigint): StreamResult<bigint> {
            const readResult = src.blockingRead(len);
            if (readResult.tag === 'err') return readResult as StreamResult<bigint>;
            const data = readResult.val;
            const writeResult = this.blockingWriteAndFlush(data);
            if (writeResult.tag === 'err') return writeResult as StreamResult<bigint>;
            return streamOk(BigInt(data.length));
        },

        subscribe(): WasiPollable {
            if (closed) return createSyncPollable(() => true);
            return createSyncPollable(() => !closed);
        },
    };
}

/**
 * Create a P2 InputStream from a static buffer (no P3 stream needed).
 */
export function createInputStream(data: Uint8Array): WasiInputStream {
    let position = 0;
    let closed = false;

    return {
        read(len: bigint): StreamResult<Uint8Array> {
            if (closed) return streamClosed();
            const available = data.length - position;
            if (available === 0) {
                closed = true;
                return streamClosed();
            }
            const count = Math.min(Number(len), available);
            const result = data.slice(position, position + count);
            position += count;
            return streamOk(result);
        },

        blockingRead(len: bigint): StreamResult<Uint8Array> {
            return this.read(len);
        },

        skip(len: bigint): StreamResult<bigint> {
            if (closed) return streamClosed();
            const available = data.length - position;
            if (available === 0) {
                closed = true;
                return streamClosed();
            }
            const count = Math.min(Number(len), available);
            position += count;
            return streamOk(BigInt(count));
        },

        blockingSkip(len: bigint): StreamResult<bigint> {
            return this.skip(len);
        },

        subscribe(): WasiPollable {
            return createSyncPollable(() => true);
        },
    };
}

/**
 * Create a P2 OutputStream that accumulates bytes into a buffer.
 */
export function createOutputStream(
    onFlush?: (bytes: Uint8Array) => void,
    bufferCapacity: number = 1024 * 1024,
): WasiOutputStream {
    let buf: number[] = [];
    let closed = false;
    const sink = onFlush ?? ((): void => { });

    function doFlush(): StreamResult<void> {
        if (closed) return streamClosed();
        if (buf.length > 0) {
            const bytes = new Uint8Array(buf);
            buf = [];
            try {
                sink(bytes);
            } catch (e) {
                closed = true;
                // If the sink threw a WasiError (e.g. with an attached
                // httpErrorCode), preserve it so the guest can decode the
                // error via http-error-code(). Otherwise wrap the message.
                if (e && typeof e === 'object' && typeof (e as WasiError).toDebugString === 'function') {
                    return err({ tag: 'last-operation-failed', val: e as WasiError });
                }
                return streamFailed(e instanceof Error ? e.message : String(e));
            }
        }
        return streamOk(undefined);
    }

    return {
        checkWrite(): StreamResult<bigint> {
            if (closed) return streamClosed();
            const available = bufferCapacity - buf.length;
            return streamOk(BigInt(available > 0 ? available : 0));
        },

        write(contents: Uint8Array): StreamResult<void> {
            if (closed) return streamClosed();
            if (buf.length + contents.length > bufferCapacity) {
                return streamFailed('write would exceed buffer capacity');
            }
            buf = buf.concat(Array.from(contents));
            return streamOk(undefined);
        },

        blockingWriteAndFlush(contents: Uint8Array): StreamResult<void> {
            const writeResult = this.write(contents);
            if (writeResult.tag === 'err') return writeResult;
            return doFlush();
        },

        flush(): StreamResult<void> {
            return doFlush();
        },

        blockingFlush(): StreamResult<void> {
            return doFlush();
        },

        writeZeroes(len: bigint): StreamResult<void> {
            if (closed) return streamClosed();
            const count = Number(len);
            if (buf.length + count > bufferCapacity) {
                return streamFailed('write would exceed buffer capacity');
            }
            buf = buf.concat(new Array<number>(count).fill(0));
            return streamOk(undefined);
        },

        blockingWriteZeroesAndFlush(len: bigint): StreamResult<void> {
            const writeResult = this.writeZeroes(len);
            if (writeResult.tag === 'err') return writeResult;
            return doFlush();
        },

        splice(src: WasiInputStream, len: bigint): StreamResult<bigint> {
            const readResult = src.read(len);
            if (readResult.tag === 'err') return readResult as StreamResult<bigint>;
            const data = readResult.val;
            const writeResult = this.write(data);
            if (writeResult.tag === 'err') return writeResult as StreamResult<bigint>;
            return streamOk(BigInt(data.length));
        },

        blockingSplice(src: WasiInputStream, len: bigint): StreamResult<bigint> {
            const readResult = src.blockingRead(len);
            if (readResult.tag === 'err') return readResult as StreamResult<bigint>;
            const data = readResult.val;
            const writeResult = this.blockingWriteAndFlush(data);
            if (writeResult.tag === 'err') return writeResult as StreamResult<bigint>;
            return streamOk(BigInt(data.length));
        },

        subscribe(): WasiPollable {
            return createSyncPollable(() => !closed && buf.length < bufferCapacity);
        },
    };
}
