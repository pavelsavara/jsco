/**
 * wasi:io/streams — InputStream and OutputStream
 *
 * InputStream: reads from a Uint8Array buffer with a read cursor.
 * OutputStream: accumulates written bytes in a buffer, flushed to a callback.
 *
 * Stream error variants:
 * - last-operation-failed(error) — operation failed, stream is now closed
 * - closed — stream ended normally
 */

import { WasiError, createWasiError } from './error';
import { WasiPollable, createSyncPollable } from './poll';

/** wasi:io/streams stream-error variant */
export type StreamError =
    | { tag: 'last-operation-failed'; val: WasiError }
    | { tag: 'closed' };

/** wasi:io/streams input-stream resource */
export interface WasiInputStream {
    /** Non-blocking read of up to len bytes */
    read(len: bigint): StreamResult<Uint8Array>;
    /** Block until data available, then read */
    blockingRead(len: bigint): StreamResult<Uint8Array>;
    /** Skip up to len bytes */
    skip(len: bigint): StreamResult<bigint>;
    /** Block until data available, then skip */
    blockingSkip(len: bigint): StreamResult<bigint>;
    /** Subscribe to readiness */
    subscribe(): WasiPollable;
}

/** wasi:io/streams output-stream resource */
export interface WasiOutputStream {
    /** Check how many bytes can be written without blocking */
    checkWrite(): StreamResult<bigint>;
    /** Write bytes (must call checkWrite first) */
    write(contents: Uint8Array): StreamResult<void>;
    /** Blocking write + flush */
    blockingWriteAndFlush(contents: Uint8Array): StreamResult<void>;
    /** Begin flushing — non-blocking */
    flush(): StreamResult<void>;
    /** Block until flush completes */
    blockingFlush(): StreamResult<void>;
    /** Write zero bytes */
    writeZeroes(len: bigint): StreamResult<void>;
    /** Blocking write zeroes + flush */
    blockingWriteZeroesAndFlush(len: bigint): StreamResult<void>;
    /** Subscribe to writability */
    subscribe(): WasiPollable;
}

/** Result type for stream operations */
export type StreamResult<T> =
    | { tag: 'ok'; val: T }
    | { tag: 'err'; val: StreamError };

function streamOk<T>(val: T): StreamResult<T> {
    return { tag: 'ok', val };
}

function streamClosed<T>(): StreamResult<T> {
    return { tag: 'err', val: { tag: 'closed' } };
}

function streamFailed<T>(message: string): StreamResult<T> {
    return { tag: 'err', val: { tag: 'last-operation-failed', val: createWasiError(message) } };
}

/**
 * Create an InputStream backed by a Uint8Array buffer.
 * Reads advance a cursor. When the buffer is exhausted, reads return 'closed'.
 */
export function createInputStream(data: Uint8Array): WasiInputStream {
    let position = 0;
    let closed = false;

    function bytesAvailable(): number {
        return data.length - position;
    }

    return {
        read(len: bigint): StreamResult<Uint8Array> {
            if (closed) return streamClosed();
            const available = bytesAvailable();
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
            // For a buffer-backed stream, blocking and non-blocking are the same
            return this.read(len);
        },

        skip(len: bigint): StreamResult<bigint> {
            if (closed) return streamClosed();
            const available = bytesAvailable();
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
            // Buffer-backed stream is always ready (or closed)
            return createSyncPollable(() => true);
        },
    };
}

/**
 * Create an OutputStream that accumulates bytes and flushes to a callback.
 *
 * @param onFlush Called with accumulated bytes on flush. Default: noop.
 * @param bufferCapacity Max bytes before backpressure. Default: 1MB.
 */
export function createOutputStream(
    onFlush?: (bytes: Uint8Array) => void,
    bufferCapacity: number = 1024 * 1024,
): WasiOutputStream {
    let buffer: number[] = [];
    let closed = false;
    const sink = onFlush ?? (() => { });

    function doFlush(): StreamResult<void> {
        if (closed) return streamClosed();
        if (buffer.length > 0) {
            const bytes = new Uint8Array(buffer);
            buffer = [];
            try {
                sink(bytes);
            } catch (e) {
                closed = true;
                return streamFailed(e instanceof Error ? e.message : String(e));
            }
        }
        return streamOk(undefined);
    }

    return {
        checkWrite(): StreamResult<bigint> {
            if (closed) return streamClosed();
            const available = bufferCapacity - buffer.length;
            return streamOk(BigInt(available > 0 ? available : 0));
        },

        write(contents: Uint8Array): StreamResult<void> {
            if (closed) return streamClosed();
            if (buffer.length + contents.length > bufferCapacity) {
                return streamFailed('write would exceed buffer capacity');
            }
            for (let i = 0; i < contents.length; i++) {
                buffer.push(contents[i]);
            }
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
            // For synchronous sinks, blocking and non-blocking flush are the same
            return doFlush();
        },

        writeZeroes(len: bigint): StreamResult<void> {
            if (closed) return streamClosed();
            const count = Number(len);
            if (buffer.length + count > bufferCapacity) {
                return streamFailed('write would exceed buffer capacity');
            }
            for (let i = 0; i < count; i++) {
                buffer.push(0);
            }
            return streamOk(undefined);
        },

        blockingWriteZeroesAndFlush(len: bigint): StreamResult<void> {
            const writeResult = this.writeZeroes(len);
            if (writeResult.tag === 'err') return writeResult;
            return doFlush();
        },

        subscribe(): WasiPollable {
            // Synchronous output stream is always writable (until buffer full)
            return createSyncPollable(() => !closed && buffer.length < bufferCapacity);
        },
    };
}
