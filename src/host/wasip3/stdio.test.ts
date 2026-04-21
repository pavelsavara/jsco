// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import {
    createStdin, createStdout, createStderr,
    createTerminalStdin, createTerminalStdout, createTerminalStderr,
} from './stdio';
import { createStreamPair, readableFromAsyncIterable, collectBytes } from './streams';

describe('wasi:cli/stdin', () => {
    describe('readViaStream', () => {
        it('returns [WasiStreamWritable, WasiFuture]', () => {
            const stdin = createStdin();
            const [stream, future] = stdin.readViaStream();
            expect(stream).toBeDefined();
            expect(stream[Symbol.asyncIterator]).toBeDefined();
            expect(future).toBeInstanceOf(Promise);
        });

        it('yields configured stdin data', async () => {
            const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
            const inputStream = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(data);
                    controller.close();
                },
            });

            const stdin = createStdin({ stdin: inputStream });
            const [stream, future] = stdin.readViaStream();

            const collected = await collectBytes(stream);
            expect(collected).toEqual(data);

            await future;
        });

        it('yields multiple chunks in order', async () => {
            const chunk1 = new Uint8Array([1, 2, 3]);
            const chunk2 = new Uint8Array([4, 5, 6]);
            const inputStream = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(chunk1);
                    controller.enqueue(chunk2);
                    controller.close();
                },
            });

            const stdin = createStdin({ stdin: inputStream });
            const [stream, future] = stdin.readViaStream();

            const collected = await collectBytes(stream);
            expect(collected).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));

            await future;
        });

        it('empty stdin — stream yields nothing, future resolves ok', async () => {
            const stdin = createStdin();
            const [stream, future] = stdin.readViaStream();

            const collected = await collectBytes(stream);
            expect(collected.length).toBe(0);

            await future;
        });

        it('empty ReadableStream — stream yields nothing, future resolves ok', async () => {
            const inputStream = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.close();
                },
            });

            const stdin = createStdin({ stdin: inputStream });
            const [stream, future] = stdin.readViaStream();

            const collected = await collectBytes(stream);
            expect(collected.length).toBe(0);

            await future;
        });

        it('stdin stream error — future resolves with err', async () => {
            const inputStream = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new Uint8Array([1, 2]));
                    controller.error(new Error('pipe broken'));
                },
            });

            const stdin = createStdin({ stdin: inputStream });
            const [stream, future] = stdin.readViaStream();

            // Reading may throw when the error propagates
            const chunks: Uint8Array[] = [];
            try {
                for await (const chunk of stream) {
                    chunks.push(chunk);
                }
            } catch {
                // Expected — stream errored
            }

            await expect(future).rejects.toThrow();
        });

        it('large stdin data — streams without full buffering', async () => {
            const chunkCount = 100;
            const chunkSize = 1024;
            let enqueueCount = 0;

            const inputStream = new ReadableStream<Uint8Array>({
                pull(controller) {
                    if (enqueueCount >= chunkCount) {
                        controller.close();
                        return;
                    }
                    const chunk = new Uint8Array(chunkSize);
                    chunk.fill(enqueueCount & 0xff);
                    controller.enqueue(chunk);
                    enqueueCount++;
                },
            });

            const stdin = createStdin({ stdin: inputStream });
            const [stream, future] = stdin.readViaStream();

            const collected = await collectBytes(stream);
            expect(collected.length).toBe(chunkCount * chunkSize);

            await future;
        });
    });
});

describe('wasi:cli/stdout', () => {
    describe('writeViaStream', () => {
        it('returns a Promise (WasiFuture)', () => {
            const stdout = createStdout();
            const pair = createStreamPair<Uint8Array>();
            pair.close();
            const future = stdout.writeViaStream(pair.readable);
            expect(future).toBeInstanceOf(Promise);
        });

        it('writes data to configured stdout', async () => {
            const chunks: Uint8Array[] = [];
            const outputStream = new WritableStream<Uint8Array>({
                write(chunk) {
                    chunks.push(new Uint8Array(chunk));
                },
            });

            const stdout = createStdout({ stdout: outputStream });

            const pair = createStreamPair<Uint8Array>();
            const future = stdout.writeViaStream(pair.readable);

            await pair.write(new Uint8Array([72, 101, 108, 108, 111]));
            pair.close();

            await future;

            expect(chunks.length).toBe(1);
            expect(chunks[0]).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
        });

        it('writes multiple chunks to stdout in order', async () => {
            const chunks: Uint8Array[] = [];
            const outputStream = new WritableStream<Uint8Array>({
                write(chunk) {
                    chunks.push(new Uint8Array(chunk));
                },
            });

            const stdout = createStdout({ stdout: outputStream });

            const pair = createStreamPair<Uint8Array>();
            const future = stdout.writeViaStream(pair.readable);

            await pair.write(new Uint8Array([1, 2, 3]));
            await pair.write(new Uint8Array([4, 5, 6]));
            pair.close();

            await future;

            expect(chunks.length).toBe(2);
            expect(chunks[0]).toEqual(new Uint8Array([1, 2, 3]));
            expect(chunks[1]).toEqual(new Uint8Array([4, 5, 6]));
        });

        it('writes to console.log when no stdout configured', async () => {
            const logs: string[] = [];
            // eslint-disable-next-line no-console
            const origLog = console.log;
            // eslint-disable-next-line no-console
            console.log = (...args: string[]) => logs.push(args.join(' '));

            try {
                const stdout = createStdout();
                const pair = createStreamPair<Uint8Array>();
                const future = stdout.writeViaStream(pair.readable);

                await pair.write(new TextEncoder().encode('Hello World\n'));
                pair.close();

                await future;
                expect(logs).toContain('Hello World');
            } finally {
                // eslint-disable-next-line no-console
                console.log = origLog;
            }
        });

        it('console.log fallback handles partial lines', async () => {
            const logs: string[] = [];
            // eslint-disable-next-line no-console
            const origLog = console.log;
            // eslint-disable-next-line no-console
            console.log = (...args: string[]) => logs.push(args.join(' '));

            try {
                const stdout = createStdout();
                const pair = createStreamPair<Uint8Array>();
                const future = stdout.writeViaStream(pair.readable);

                await pair.write(new TextEncoder().encode('no newline'));
                pair.close();

                await future;
                expect(logs).toContain('no newline');
            } finally {
                // eslint-disable-next-line no-console
                console.log = origLog;
            }
        });

        it('console.log fallback splits multiple lines', async () => {
            const logs: string[] = [];
            // eslint-disable-next-line no-console
            const origLog = console.log;
            // eslint-disable-next-line no-console
            console.log = (...args: string[]) => logs.push(args.join(' '));

            try {
                const stdout = createStdout();
                const pair = createStreamPair<Uint8Array>();
                const future = stdout.writeViaStream(pair.readable);

                await pair.write(new TextEncoder().encode('line1\nline2\nline3\n'));
                pair.close();

                await future;
                expect(logs).toEqual(['line1', 'line2', 'line3']);
            } finally {
                // eslint-disable-next-line no-console
                console.log = origLog;
            }
        });

        it('empty stream — future resolves normally', async () => {
            const chunks: Uint8Array[] = [];
            const outputStream = new WritableStream<Uint8Array>({
                write(chunk) {
                    chunks.push(new Uint8Array(chunk));
                },
            });

            const stdout = createStdout({ stdout: outputStream });

            const pair = createStreamPair<Uint8Array>();
            pair.close();

            await stdout.writeViaStream(pair.readable);

            expect(chunks.length).toBe(0);
        });

        it('accepts data from readableFromAsyncIterable', async () => {
            const chunks: Uint8Array[] = [];
            const outputStream = new WritableStream<Uint8Array>({
                write(chunk) {
                    chunks.push(new Uint8Array(chunk));
                },
            });

            const stdout = createStdout({ stdout: outputStream });

            async function* generate() {
                yield new Uint8Array([10, 20]);
                yield new Uint8Array([30, 40]);
            }

            const readable = readableFromAsyncIterable(generate());
            await stdout.writeViaStream(readable);

            expect(chunks.length).toBe(2);
            expect(chunks[0]).toEqual(new Uint8Array([10, 20]));
            expect(chunks[1]).toEqual(new Uint8Array([30, 40]));
        });
    });
});

describe('wasi:cli/stderr', () => {
    describe('writeViaStream', () => {
        it('writes data to configured stderr', async () => {
            const chunks: Uint8Array[] = [];
            const outputStream = new WritableStream<Uint8Array>({
                write(chunk) {
                    chunks.push(new Uint8Array(chunk));
                },
            });

            const stderr = createStderr({ stderr: outputStream });

            const pair = createStreamPair<Uint8Array>();
            const future = stderr.writeViaStream(pair.readable);

            await pair.write(new Uint8Array([69, 82, 82])); // "ERR"
            pair.close();

            await future;

            expect(chunks.length).toBe(1);
            expect(chunks[0]).toEqual(new Uint8Array([69, 82, 82]));
        });

        it('stderr and stdout are independent', async () => {
            const stdoutChunks: Uint8Array[] = [];
            const stderrChunks: Uint8Array[] = [];

            const stdoutStream = new WritableStream<Uint8Array>({
                write(chunk) { stdoutChunks.push(new Uint8Array(chunk)); },
            });
            const stderrStream = new WritableStream<Uint8Array>({
                write(chunk) { stderrChunks.push(new Uint8Array(chunk)); },
            });

            const { createStdout: createOut, createStderr: createErr } = await import('./stdio');
            const stdout = createOut({ stdout: stdoutStream });
            const stderr = createErr({ stderr: stderrStream });

            const outPair = createStreamPair<Uint8Array>();
            const errPair = createStreamPair<Uint8Array>();

            const outFuture = stdout.writeViaStream(outPair.readable);
            const errFuture = stderr.writeViaStream(errPair.readable);

            await outPair.write(new Uint8Array([1, 2]));
            await errPair.write(new Uint8Array([3, 4]));
            outPair.close();
            errPair.close();

            await Promise.all([outFuture, errFuture]);

            expect(stdoutChunks).toEqual([new Uint8Array([1, 2])]);
            expect(stderrChunks).toEqual([new Uint8Array([3, 4])]);
        });

        it('writes to console.error when no stderr configured', async () => {
            const logs: string[] = [];
            // eslint-disable-next-line no-console
            const origError = console.error;
            // eslint-disable-next-line no-console
            console.error = (...args: string[]) => logs.push(args.join(' '));

            try {
                const stderr = createStderr();
                const pair = createStreamPair<Uint8Array>();
                const future = stderr.writeViaStream(pair.readable);

                await pair.write(new TextEncoder().encode('ERROR msg\n'));
                pair.close();

                await future;
                expect(logs).toContain('ERROR msg');
            } finally {
                // eslint-disable-next-line no-console
                console.error = origError;
            }
        });
    });
});

describe('wasi:cli/stdin + stdout multi-step', () => {
    it('read stdin while writing stdout — no interference', async () => {
        const inputData = new Uint8Array([10, 20, 30]);
        const inputStream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(inputData);
                controller.close();
            },
        });

        const stdoutChunks: Uint8Array[] = [];
        const outputStream = new WritableStream<Uint8Array>({
            write(chunk) { stdoutChunks.push(new Uint8Array(chunk)); },
        });

        const { createStdin: createIn, createStdout: createOut } = await import('./stdio');
        const stdin = createIn({ stdin: inputStream });
        const stdout = createOut({ stdout: outputStream });

        // Read stdin
        const [stdinStream, stdinFuture] = stdin.readViaStream();

        // Write to stdout concurrently
        const outPair = createStreamPair<Uint8Array>();
        const stdoutFuture = stdout.writeViaStream(outPair.readable);
        await outPair.write(new Uint8Array([40, 50]));
        outPair.close();

        // Collect stdin
        const stdinData = await collectBytes(stdinStream);

        await stdoutFuture;

        expect(stdinData).toEqual(inputData);
        await stdinFuture;
        expect(stdoutChunks).toEqual([new Uint8Array([40, 50])]);
    });

    it('write UTF-8 multibyte characters split across chunks', async () => {
        const collected: Uint8Array[] = [];
        const outputStream = new WritableStream<Uint8Array>({
            write(chunk) { collected.push(new Uint8Array(chunk)); },
        });

        const { createStdout: createOut } = await import('./stdio');
        const stdout = createOut({ stdout: outputStream });

        // "日" = U+65E5 = [0xE6, 0x97, 0xA5] in UTF-8
        // Split across two chunks
        const pair = createStreamPair<Uint8Array>();
        const future = stdout.writeViaStream(pair.readable);

        await pair.write(new Uint8Array([0xE6, 0x97]));
        await pair.write(new Uint8Array([0xA5]));
        pair.close();

        await future;

        // All bytes arrive
        const allBytes = new Uint8Array(collected.reduce((a, c) => a + c.length, 0));
        let off = 0;
        for (const c of collected) { allBytes.set(c, off); off += c.length; }
        expect(allBytes).toEqual(new Uint8Array([0xE6, 0x97, 0xA5]));
    });
});

describe('wasi:cli/terminal-*', () => {
    it('getTerminalStdin returns undefined (non-TTY)', () => {
        const ts = createTerminalStdin();
        expect(ts.getTerminalStdin()).toBeUndefined();
    });

    it('getTerminalStdout returns undefined (non-TTY)', () => {
        const ts = createTerminalStdout();
        expect(ts.getTerminalStdout()).toBeUndefined();
    });

    it('getTerminalStderr returns undefined (non-TTY)', () => {
        const ts = createTerminalStderr();
        expect(ts.getTerminalStderr()).toBeUndefined();
    });
});

describe('wasi:cli/stdio edge cases', () => {
    it('rapid small writes preserve ordering', async () => {
        const chunks: Uint8Array[] = [];
        const outputStream = new WritableStream<Uint8Array>({
            write(chunk) { chunks.push(new Uint8Array(chunk)); },
        });

        const stdout = createStdout({ stdout: outputStream });
        const pair = createStreamPair<Uint8Array>();
        const future = stdout.writeViaStream(pair.readable);

        for (let i = 0; i < 50; i++) {
            await pair.write(new Uint8Array([i]));
        }
        pair.close();
        await future;

        expect(chunks.length).toBe(50);
        for (let i = 0; i < 50; i++) {
            expect(chunks[i]![0]).toBe(i);
        }
    });

    it('zero-length write does not break stream', async () => {
        const chunks: Uint8Array[] = [];
        const outputStream = new WritableStream<Uint8Array>({
            write(chunk) { chunks.push(new Uint8Array(chunk)); },
        });

        const stdout = createStdout({ stdout: outputStream });
        const pair = createStreamPair<Uint8Array>();
        const future = stdout.writeViaStream(pair.readable);

        await pair.write(new Uint8Array(0));
        await pair.write(new Uint8Array([99]));
        pair.close();
        await future;

        // At least one chunk with [99] arrives; zero-length may or may not appear
        const allBytes: number[] = [];
        for (const c of chunks) for (const b of c) allBytes.push(b);
        expect(allBytes).toContain(99);
    });

    it('write to broken WritableStream — future rejects with error', async () => {
        let rejectCount = 0;
        const brokenStream = new WritableStream<Uint8Array>({
            write() {
                rejectCount++;
                if (rejectCount >= 2) throw new Error('pipe broken');
            },
        });

        const stdout = createStdout({ stdout: brokenStream });
        const pair = createStreamPair<Uint8Array>();
        const future = stdout.writeViaStream(pair.readable);

        await pair.write(new Uint8Array([1]));
        await pair.write(new Uint8Array([2])); // should trigger broken pipe
        pair.close();

        // Future should reject with the pipe error
        await expect(future).rejects.toBeDefined();
    });

    it('stdin reading after stream is consumed yields empty', async () => {
        const inputData = new Uint8Array([1, 2, 3]);
        const inputStream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(inputData);
                controller.close();
            },
        });
        const stdin = createStdin({ stdin: inputStream });

        // First read — consume all
        const [stream1, future1] = stdin.readViaStream();
        const data1 = await collectBytes(stream1);
        expect(data1).toEqual(inputData);
        await future1;

        // Second read — stream is already consumed
        const [stream2, future2] = stdin.readViaStream();
        const data2 = await collectBytes(stream2);
        expect(data2.length).toBe(0);
        await future2;
    });
});
