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
 * its contents to config.stdout. Returns a future that resolves when done.
 */
export function createStdout(config?: WasiP3Config): typeof WasiCliStdout {
    const stdoutStream = config?.stdout;

    return {
        writeViaStream(data: WasiStreamReadable<Uint8Array>): Promise<void> {
            return pumpToWritable(data, stdoutStream);
        },
    };
}

/**
 * Create the wasi:cli/stderr interface.
 *
 * Same as stdout but writes to config.stderr.
 */
export function createStderr(config?: WasiP3Config): typeof WasiCliStderr {
    const stderrStream = config?.stderr;

    return {
        writeViaStream(data: WasiStreamReadable<Uint8Array>): Promise<void> {
            return pumpToWritable(data, stderrStream);
        },
    };
}

/**
 * Consume a WasiStreamReadable and write all chunks to a WritableStream.
 * If no output stream is configured, the data is discarded.
 */
async function pumpToWritable(
    data: WasiStreamReadable<Uint8Array>,
    output?: WritableStream<Uint8Array>,
): Promise<void> {
    if (!output) {
        // Discard all data
        for await (const _chunk of data) {
            // intentionally empty — drain the stream
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
