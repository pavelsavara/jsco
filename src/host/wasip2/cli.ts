// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * wasi:cli/* — CLI-related WASI interfaces
 *
 * Implements:
 * - wasi:cli/environment — get-environment, get-arguments, initial-cwd
 * - wasi:cli/exit — exit(result)
 * - wasi:cli/stdin — get-stdin() → InputStream
 * - wasi:cli/stdout — get-stdout() → OutputStream
 * - wasi:cli/stderr — get-stderr() → OutputStream
 * - wasi:cli/terminal-input — get-terminal-stdin() → undefined
 * - wasi:cli/terminal-output — get-terminal-stdout() → undefined
 * - wasi:cli/terminal-stderr — get-terminal-stderr() → undefined
 *
 * All configurable via WasiConfig.
 */

import type {
    WasiInputStream,
    WasiOutputStream,
} from './api';
import { WasiExit } from './api';
import type { WasiConfig, WasiCli } from './types';
import { createInputStream, createOutputStream } from './streams';

const defaultTextDecoder = new TextDecoder();

/**
 * Create a complete wasi:cli host from a WasiConfig.
 * Stdin is backed by config.stdin (or empty).
 * Stdout/stderr call config callbacks (or console.log/console.error).
 */
export function createWasiCli(config?: WasiConfig): WasiCli {
    const env = config?.env ?? [];
    const args = config?.args ?? [];
    const cwd = config?.cwd;

    // Stdin: backed by configured bytes, or empty
    const stdinData = config?.stdin ?? new Uint8Array(0);
    const stdinStream = createInputStream(stdinData);

    // Stdout: configurable sink, default console.log
    const stdoutSink = config?.stdout ?? ((bytes: Uint8Array) => {
        const text = defaultTextDecoder.decode(bytes);
        // eslint-disable-next-line no-console
        console.log(text);
    });
    const stdoutStream = createOutputStream(stdoutSink);

    // Stderr: configurable sink, default console.error
    const stderrSink = config?.stderr ?? ((bytes: Uint8Array) => {
        const text = defaultTextDecoder.decode(bytes);
        // eslint-disable-next-line no-console
        console.error(text);
    });
    const stderrStream = createOutputStream(stderrSink);

    return {
        environment: {
            getEnvironment(): [string, string][] {
                return env.slice();
            },
            getArguments(): string[] {
                return args.slice();
            },
            initialCwd(): string | undefined {
                return cwd;
            },
        },

        exit: {
            exit(status: { tag: 'ok' } | { tag: 'err' }): never {
                const code = status.tag === 'ok' ? 0 : 1;
                throw new WasiExit(code);
            },
            exitWithCode(statusCode: number): never {
                throw new WasiExit(statusCode);
            },
        },

        stdin: {
            getStdin(): WasiInputStream {
                return stdinStream;
            },
        },

        stdout: {
            getStdout(): WasiOutputStream {
                return stdoutStream;
            },
        },

        stderr: {
            getStderr(): WasiOutputStream {
                return stderrStream;
            },
        },

        terminalInput: {
            getTerminalStdin(): undefined {
                return undefined;
            },
        },

        terminalOutput: {
            getTerminalStdout(): undefined {
                return undefined;
            },
            getTerminalStderr(): undefined {
                return undefined;
            },
        },
    };
}
