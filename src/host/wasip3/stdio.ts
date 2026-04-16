// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type {
    WasiCliStdin,
    WasiCliStdout,
    WasiCliStderr,
    WasiCliTerminalInput,
    WasiCliTerminalOutput,
    WasiCliTerminalStderr,
    WasiCliTerminalStdin,
    WasiCliTerminalStdout,
} from '../../../wit/wasip3/types/index';
import type { WasiP3Config } from './types';
import type { WasiStreamReadable, WasiStreamWritable } from './streams';
import { createStreamPair, readableFromStream } from './streams';

type ErrorCode = 'io' | 'illegal-byte-sequence' | 'pipe';
type Result<T, E> = { tag: 'ok'; val: T } | { tag: 'err'; val: E };

/**
 * Create the wasi:cli/stdin interface.
 *
 * `readViaStream()` returns a `[WasiStreamWritable<u8>, WasiFuture<Result>]` pair.
 * The writable end is where the runtime receives bytes from stdin.
 * The host pushes config.stdin data into it and signals completion via the future.
 */
export function createStdin(config?: WasiP3Config): typeof WasiCliStdin {
    const stdinStream = config?.stdin;

    return {
        readViaStream(): [WasiStreamWritable<Uint8Array>, Promise<Result<void, ErrorCode>>] {
            const pair = createStreamPair<Uint8Array>();

            // Pump stdin data into the writable end, then signal completion
            const future = (async (): Promise<Result<void, ErrorCode>> => {
                try {
                    if (stdinStream) {
                        const readable = readableFromStream(stdinStream);
                        for await (const chunk of readable) {
                            await pair.write(chunk);
                        }
                    }
                    pair.close();
                    return { tag: 'ok', val: undefined };
                } catch (e) {
                    pair.error(e);
                    return { tag: 'err', val: 'io' };
                }
            })();

            return [pair.readable as WasiStreamWritable<Uint8Array>, future];
        },
    };
}

/**
 * Create the wasi:cli/stdout interface.
 *
 * `writeViaStream(data)` consumes a readable stream from the guest and writes
 * its contents to config.stdout. When no stdout stream is configured, chunks
 * are decoded as UTF-8 and sent to `console.log` (browser default).
 */
export function createStdout(config?: WasiP3Config): typeof WasiCliStdout {
    const stdoutStream = config?.stdout;

    // eslint-disable-next-line no-console
    const fallback = stdoutStream ? undefined : console.log;
    return {
        writeViaStream(data: WasiStreamReadable<Uint8Array>): Promise<void> {
            return pumpToWritable(data, stdoutStream, fallback);
        },
    };
}

/**
 * Create the wasi:cli/stderr interface.
 *
 * Same as stdout but writes to config.stderr / console.error.
 */
export function createStderr(config?: WasiP3Config): typeof WasiCliStderr {
    const stderrStream = config?.stderr;

    // eslint-disable-next-line no-console
    const fallback = stderrStream ? undefined : console.error;
    return {
        writeViaStream(data: WasiStreamReadable<Uint8Array>): Promise<void> {
            return pumpToWritable(data, stderrStream, fallback);
        },
    };
}

/**
 * Consume a WasiStreamReadable and write all chunks to a WritableStream.
 * If no output stream is configured, chunks are decoded as UTF-8 text
 * and sent to the `fallbackLog` function (e.g. console.log / console.error).
 */
async function pumpToWritable(
    data: WasiStreamReadable<Uint8Array>,
    output: WritableStream<Uint8Array> | undefined,
    fallbackLog: ((...args: string[]) => void) | undefined,
): Promise<void> {
    if (!output) {
        if (!fallbackLog) {
            // No output and no fallback — discard all data
            for await (const _chunk of data) {
                // intentionally empty — drain the stream
            }
            return;
        }
        const decoder = new TextDecoder();
        let buffer = '';
        for await (const chunk of data) {
            buffer += decoder.decode(chunk, { stream: true });
            // Flush complete lines immediately
            let nl: number;
            while ((nl = buffer.indexOf('\n')) !== -1) {
                fallbackLog(buffer.slice(0, nl));
                buffer = buffer.slice(nl + 1);
            }
        }
        // Flush remaining partial line
        buffer += decoder.decode();
        if (buffer.length > 0) {
            fallbackLog(buffer);
        }
        return;
    }
    const writer = output.getWriter();
    try {
        for await (const chunk of data) {
            await writer.write(chunk);
        }
    } finally {
        writer.releaseLock();
    }
}

// --- Terminal interfaces (Stage 4 per plan, but included here since they're trivial) ---

export function createTerminalInput(): typeof WasiCliTerminalInput {
    // TerminalInput is a class with only a private constructor — no runtime methods
    return {} as typeof WasiCliTerminalInput;
}

export function createTerminalOutput(): typeof WasiCliTerminalOutput {
    // TerminalOutput is a class with only a private constructor — no runtime methods
    return {} as typeof WasiCliTerminalOutput;
}

export function createTerminalStdin(): typeof WasiCliTerminalStdin {
    return {
        getTerminalStdin(): undefined {
            // Not a terminal in browser/test environments
            return undefined;
        },
    };
}

export function createTerminalStdout(): typeof WasiCliTerminalStdout {
    return {
        getTerminalStdout(): undefined {
            return undefined;
        },
    };
}

export function createTerminalStderr(): typeof WasiCliTerminalStderr {
    return {
        getTerminalStderr(): undefined {
            return undefined;
        },
    };
}
