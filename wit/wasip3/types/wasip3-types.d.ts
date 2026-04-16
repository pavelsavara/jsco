/** WASIp3 stream and future built-in types. */

/**
 * A readable end of a WASIp3 `stream<T>`.
 *
 * The component-model stream is split into a readable/writable pair.
 * `WasiStreamReadable<T>` is the end you *read from* (i.e. consume items).
 *
 * For `stream<u8>`, `T` is `Uint8Array` (reads yield byte chunks).
 */
interface WasiStreamReadable<T> {
    [Symbol.asyncIterator](): AsyncIterableIterator<T>;
}

/**
 * A writable end of a WASIp3 `stream<T>`.
 *
 * `WasiStreamWritable<T>` is the end you *receive items from*
 * (the runtime writes into it).
 *
 * For `stream<u8>`, `T` is `Uint8Array`.
 */
interface WasiStreamWritable<T> {
    [Symbol.asyncIterator](): AsyncIterableIterator<T>;
}

/**
 * A WASIp3 `future<T>` — a one-shot asynchronous value.
 *
 * Semantically equivalent to `Promise<T>`, but represented as a
 * component-model built-in so that the host can fulfil it.
 */
type WasiFuture<T> = Promise<T>;
