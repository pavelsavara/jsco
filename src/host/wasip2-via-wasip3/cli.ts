// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * wasi:cli adapter — bridges P3 cli interfaces to P2.
 *
 * Key differences:
 * - P3 `getInitialCwd()` → P2 `initialCwd()` (rename)
 * - P3 stdin `readViaStream()` → P2 `getStdin()` returning InputStream
 * - P3 stdout/stderr `writeViaStream(readable)` → P2 `getStdout()/getStderr()` returning OutputStream
 */

import type { WasiP3Imports } from '../../../wit/wasip3/types/index';
import type { WasiInputStream, WasiOutputStream } from './io';
import { createInputStreamFromP3, createOutputStreamFromP3 } from './io';
import { createStreamPair } from '../wasip3/streams';

export function adaptEnvironment(p3: WasiP3Imports): { getEnvironment(): [string, string][]; getArguments(): string[]; initialCwd(): string | undefined } {
    const p3env = p3['wasi:cli/environment'];
    return {
        getEnvironment(): [string, string][] {
            return p3env.getEnvironment();
        },
        getArguments(): string[] {
            return p3env.getArguments();
        },
        initialCwd(): string | undefined {
            return p3env.getInitialCwd();
        },
    };
}

export function adaptExit(p3: WasiP3Imports): { exit(status: { tag: 'ok' } | { tag: 'err' }): void; exitWithCode(statusCode: number): void } {
    const p3exit = p3['wasi:cli/exit'];
    return {
        exit(status: { tag: 'ok' } | { tag: 'err' }): void {
            p3exit.exit(status as { tag: 'ok'; val: void } | { tag: 'err'; val: void });
        },
        exitWithCode(statusCode: number): void {
            p3exit.exitWithCode(statusCode);
        },
    };
}

export function adaptStdin(p3: WasiP3Imports): { getStdin(): WasiInputStream } {
    const p3stdin = p3['wasi:cli/stdin'];
    let cached: WasiInputStream | null = null;

    return {
        getStdin(): WasiInputStream {
            if (!cached) {
                const [stream] = p3stdin.readViaStream();
                cached = createInputStreamFromP3(stream);
            }
            return cached;
        },
    };
}

export function adaptStdout(p3: WasiP3Imports): { getStdout(): WasiOutputStream } {
    const p3stdout = p3['wasi:cli/stdout'];
    let cached: WasiOutputStream | null = null;

    return {
        getStdout(): WasiOutputStream {
            if (!cached) {
                const pair = createStreamPair<Uint8Array>();
                // Hand readable end to P3 host, keep writable end for P2 guest
                p3stdout.writeViaStream(pair.readable);
                cached = createOutputStreamFromP3(pair);
            }
            return cached;
        },
    };
}

export function adaptStderr(p3: WasiP3Imports): { getStderr(): WasiOutputStream } {
    const p3stderr = p3['wasi:cli/stderr'];
    let cached: WasiOutputStream | null = null;

    return {
        getStderr(): WasiOutputStream {
            if (!cached) {
                const pair = createStreamPair<Uint8Array>();
                p3stderr.writeViaStream(pair.readable);
                cached = createOutputStreamFromP3(pair);
            }
            return cached;
        },
    };
}

export function adaptTerminalInput(p3: WasiP3Imports): { getTerminalStdin(): unknown } {
    const p3ti = p3['wasi:cli/terminal-stdin'];
    return {
        getTerminalStdin(): unknown {
            return p3ti.getTerminalStdin();
        },
    };
}

export function adaptTerminalStdout(p3: WasiP3Imports): { getTerminalStdout(): unknown } {
    const p3to = p3['wasi:cli/terminal-stdout'];
    return {
        getTerminalStdout(): unknown {
            return p3to.getTerminalStdout();
        },
    };
}

export function adaptTerminalStderr(p3: WasiP3Imports): { getTerminalStderr(): unknown } {
    const p3te = p3['wasi:cli/terminal-stderr'];
    return {
        getTerminalStderr(): unknown {
            return p3te.getTerminalStderr();
        },
    };
}
