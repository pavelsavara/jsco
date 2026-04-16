// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * Tests for WASIp3 Node.js stdio wrappers (nodeStdioDefaults).
 */

import { Readable, Writable, PassThrough } from 'node:stream';
import { nodeStdioDefaults } from './stdio-node';
import { createStdin, createStdout, createStderr } from '../stdio';
import { createStreamPair, collectBytes } from '../streams';

const enc = new TextEncoder();
const dec = new TextDecoder();

describe('nodeStdioDefaults', () => {
    test('returns stdin, stdout, stderr', () => {
        const defaults = nodeStdioDefaults();
        expect(defaults.stdin).toBeDefined();
        expect(defaults.stdout).toBeDefined();
        expect(defaults.stderr).toBeDefined();
    });

    test('preserves user-provided stdin', () => {
        const custom = new ReadableStream<Uint8Array>();
        const defaults = nodeStdioDefaults({ stdin: custom });
        expect(defaults.stdin).toBe(custom);
    });

    test('preserves user-provided stdout', () => {
        const custom = new WritableStream<Uint8Array>();
        const defaults = nodeStdioDefaults({ stdout: custom });
        expect(defaults.stdout).toBe(custom);
    });

    test('preserves user-provided stderr', () => {
        const custom = new WritableStream<Uint8Array>();
        const defaults = nodeStdioDefaults({ stderr: custom });
        expect(defaults.stderr).toBe(custom);
    });
});

describe('Node.js stdout WritableStream wrapper', () => {
    function createTestWritable(): { writable: Writable; chunks: Buffer[] } {
        const chunks: Buffer[] = [];
        const writable = new Writable({
            write(chunk, _encoding, callback) {
                chunks.push(Buffer.from(chunk));
                callback();
            },
        });
        return { writable, chunks };
    }

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
        });
    }

    test('writes data through to Node writable', async () => {
        const { writable, chunks } = createTestWritable();
        const webStream = nodeWritableToWeb(writable);
        const stdout = createStdout({ stdout: webStream });

        const pair = createStreamPair<Uint8Array>();
        const future = stdout.writeViaStream(pair.readable);

        await pair.write(enc.encode('hello from wasm'));
        pair.close();
        await future;

        const output = Buffer.concat(chunks).toString('utf-8');
        expect(output).toBe('hello from wasm');
    });

    test('writes multiple chunks in order', async () => {
        const { writable, chunks } = createTestWritable();
        const webStream = nodeWritableToWeb(writable);
        const stdout = createStdout({ stdout: webStream });

        const pair = createStreamPair<Uint8Array>();
        const future = stdout.writeViaStream(pair.readable);

        await pair.write(enc.encode('chunk1'));
        await pair.write(enc.encode('chunk2'));
        await pair.write(enc.encode('chunk3'));
        pair.close();
        await future;

        const output = chunks.map(c => c.toString('utf-8'));
        expect(output).toEqual(['chunk1', 'chunk2', 'chunk3']);
    });

    test('handles backpressure', async () => {
        const _drainCallbacks: (() => void)[] = [];
        const chunks: Buffer[] = [];

        // Simulate a slow writable that requires drain
        const slowWritable = new Writable({
            highWaterMark: 1,
            write(chunk, _encoding, callback) {
                chunks.push(Buffer.from(chunk));
                // Simulate async write
                setTimeout(callback, 0);
            },
        });

        const webStream = nodeWritableToWeb(slowWritable);
        const stdout = createStdout({ stdout: webStream });

        const pair = createStreamPair<Uint8Array>();
        const future = stdout.writeViaStream(pair.readable);

        await pair.write(enc.encode('a'));
        await pair.write(enc.encode('b'));
        pair.close();
        await future;

        const output = Buffer.concat(chunks).toString('utf-8');
        expect(output).toBe('ab');
    });
});

describe('Node.js stdin ReadableStream wrapper', () => {
    function nodeReadableToWeb(nodeStream: Readable): ReadableStream<Uint8Array> {
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

    test('reads data from Node readable', async () => {
        const pt = new PassThrough();
        const webStream = nodeReadableToWeb(pt);
        const stdin = createStdin({ stdin: webStream });

        const [stream, future] = stdin.readViaStream();

        pt.write(Buffer.from('hello'));
        pt.end();

        const collected = await collectBytes(stream);
        expect(dec.decode(collected)).toBe('hello');

        const result = await future;
        expect(result.tag).toBe('ok');
    });

    test('reads multiple chunks in order', async () => {
        const pt = new PassThrough();
        const webStream = nodeReadableToWeb(pt);
        const stdin = createStdin({ stdin: webStream });

        const [stream, future] = stdin.readViaStream();

        pt.write(Buffer.from('aaa'));
        pt.write(Buffer.from('bbb'));
        pt.end();

        const collected = await collectBytes(stream);
        expect(dec.decode(collected)).toBe('aaabbb');

        const result = await future;
        expect(result.tag).toBe('ok');
    });

    test('empty stdin', async () => {
        const pt = new PassThrough();
        const webStream = nodeReadableToWeb(pt);
        const stdin = createStdin({ stdin: webStream });

        const [stream, future] = stdin.readViaStream();
        pt.end();

        const collected = await collectBytes(stream);
        expect(collected.length).toBe(0);

        const result = await future;
        expect(result.tag).toBe('ok');
    });
});

describe('Node.js stderr WritableStream wrapper', () => {
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
        });
    }

    test('writes data through to stderr writable', async () => {
        const chunks: Buffer[] = [];
        const writable = new Writable({
            write(chunk, _encoding, callback) {
                chunks.push(Buffer.from(chunk));
                callback();
            },
        });

        const webStream = nodeWritableToWeb(writable);
        const stderr = createStderr({ stderr: webStream });

        const pair = createStreamPair<Uint8Array>();
        const future = stderr.writeViaStream(pair.readable);

        await pair.write(enc.encode('error message'));
        pair.close();
        await future;

        const output = Buffer.concat(chunks).toString('utf-8');
        expect(output).toBe('error message');
    });
});
