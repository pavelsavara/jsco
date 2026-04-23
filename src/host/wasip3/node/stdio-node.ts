// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * WASIp3 Stdio — Node.js streaming implementation.
 *
 * Wraps `process.stdin`, `process.stdout`, and `process.stderr` as web
 * `ReadableStream<Uint8Array>` / `WritableStream<Uint8Array>` so they can be
 * passed to the shared `createStdin` / `createStdout` / `createStderr` factories.
 */

import { Readable, Writable } from 'node:stream';

/**
 * Wrap a Node.js `Readable` (e.g. `process.stdin`) into a web `ReadableStream<Uint8Array>`.
 *
 * Uses named listener references so they can be removed on cancel.
 * Does NOT destroy the underlying Node.js stream — it may be shared (e.g. `process.stdin`).
 */
function nodeReadableToWeb(nodeStream: Readable): ReadableStream<Uint8Array> {
    let onData: ((chunk: Buffer) => void) | undefined;
    let onEnd: (() => void) | undefined;
    let onError: ((err: Error) => void) | undefined;

    function removeListeners() {
        if (onData) nodeStream.removeListener('data', onData);
        if (onEnd) nodeStream.removeListener('end', onEnd);
        if (onError) nodeStream.removeListener('error', onError);
        onData = onEnd = onError = undefined;
    }

    return new ReadableStream<Uint8Array>({
        start(controller) {
            onData = (chunk: Buffer) => {
                controller.enqueue(new Uint8Array(chunk));
            };
            onEnd = () => {
                removeListeners();
                controller.close();
            };
            onError = (err: Error) => {
                removeListeners();
                controller.error(err);
            };
            nodeStream.on('data', onData);
            nodeStream.on('end', onEnd);
            nodeStream.on('error', onError);
        },
        cancel() {
            removeListeners();
        },
    });
}

/**
 * Wrap a Node.js `Writable` (e.g. `process.stdout`) into a web `WritableStream<Uint8Array>`.
 *
 * Uses `write()` with backpressure — waits for drain before resolving.
 * Does NOT close the underlying stream (stdout/stderr must stay open).
 */
function nodeWritableToWeb(nodeStream: Writable): WritableStream<Uint8Array> {
    return new WritableStream<Uint8Array>({
        write(chunk) {
            return new Promise<void>((resolve, reject) => {
                const ok = nodeStream.write(chunk, (err) => {
                    if (err) {
                        nodeStream.removeListener('drain', onDrain);
                        reject(err);
                    }
                });
                function onDrain() { resolve(); }
                if (ok) {
                    resolve();
                } else {
                    nodeStream.once('drain', onDrain);
                }
            });
        },
        // Do NOT close process.stdout/stderr — they're shared and must stay open
    });
}

/**
 * Build a `WasiP3Config`-compatible stdin/stdout/stderr override object
 * backed by real Node.js process streams.
 *
 * Caches web-stream wrappers for `process.stdin`/`stdout`/`stderr` so that
 * repeated calls (e.g. one per test) don't keep adding listeners to the
 * same underlying Node.js stream (which triggers MaxListenersExceededWarning).
 *
 * Only creates web wrappers for streams not already provided in `existing`.
 */
let cachedStdin: ReadableStream<Uint8Array> | undefined;
let cachedStdout: WritableStream<Uint8Array> | undefined;
let cachedStderr: WritableStream<Uint8Array> | undefined;

export function nodeStdioDefaults(existing?: {
    stdin?: ReadableStream<Uint8Array>;
    stdout?: WritableStream<Uint8Array>;
    stderr?: WritableStream<Uint8Array>;
}): {
    stdin: ReadableStream<Uint8Array>;
    stdout: WritableStream<Uint8Array>;
    stderr: WritableStream<Uint8Array>;
} {
    if (!cachedStdin) cachedStdin = nodeReadableToWeb(process.stdin);
    if (!cachedStdout) cachedStdout = nodeWritableToWeb(process.stdout);
    if (!cachedStderr) cachedStderr = nodeWritableToWeb(process.stderr);
    return {
        stdin: existing?.stdin ?? cachedStdin,
        stdout: existing?.stdout ?? cachedStdout,
        stderr: existing?.stderr ?? cachedStderr,
    };
}
