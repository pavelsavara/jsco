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
 */
function nodeReadableToWeb(nodeStream: Readable): ReadableStream<Uint8Array> {
    // Node 18+ has Readable.toWeb, but it may not be available everywhere.
    // Build a manual adapter for broadest compat.
    return new ReadableStream<Uint8Array>({
        start(controller) {
            nodeStream.on('data', (chunk: Buffer) => {
                controller.enqueue(new Uint8Array(chunk));
            });
            nodeStream.on('end', () => {
                controller.close();
            });
            nodeStream.on('error', (err) => {
                controller.error(err);
            });
        },
        cancel() {
            nodeStream.destroy();
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
                    if (err) reject(err);
                });
                if (ok) {
                    resolve();
                } else {
                    nodeStream.once('drain', resolve);
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
 * Only creates web wrappers for streams not already provided in `existing`.
 */
export function nodeStdioDefaults(existing?: {
    stdin?: ReadableStream<Uint8Array>;
    stdout?: WritableStream<Uint8Array>;
    stderr?: WritableStream<Uint8Array>;
}): {
    stdin: ReadableStream<Uint8Array>;
    stdout: WritableStream<Uint8Array>;
    stderr: WritableStream<Uint8Array>;
} {
    return {
        stdin: existing?.stdin ?? nodeReadableToWeb(process.stdin),
        stdout: existing?.stdout ?? nodeWritableToWeb(process.stdout),
        stderr: existing?.stderr ?? nodeWritableToWeb(process.stderr),
    };
}
