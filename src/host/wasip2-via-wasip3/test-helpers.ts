// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * Shared test helpers for wasip2-via-wasip3 adapter tests.
 */

import type { WasiP3Imports } from '../../../wit/wasip3/types/index';
import { createStreamPair } from '../wasip3/streams';
import type { WasiStreamReadable } from '../wasip3/streams';

/**
 * Build a minimal mock P3 host with all required interfaces.
 * Override any interface by passing partial overrides.
 */
export function createMockP3(overrides?: Partial<Record<string, unknown>>): WasiP3Imports {
    const base: Record<string, unknown> = {
        'wasi:cli/environment': {
            getEnvironment: () => [['FOO', 'bar'], ['BAZ', 'qux']] as [string, string][],
            getArguments: () => ['arg1', 'arg2'],
            getInitialCwd: () => '/home/test',
        },
        'wasi:cli/exit': {
            exit: (status: { tag: string }) => {
                throw new Error(`exit: ${status.tag}`);
            },
            exitWithCode: (code: number) => {
                throw new Error(`exit: ${code}`);
            },
        },
        'wasi:cli/stdin': {
            readViaStream: () => {
                const pair = createStreamPair<Uint8Array>();
                pair.write(new Uint8Array([72, 101, 108, 108, 111])); // "Hello"
                pair.close();
                return [pair.readable, Promise.resolve()];
            },
        },
        'wasi:cli/stdout': {
            writeViaStream: (_data: WasiStreamReadable<Uint8Array>) => Promise.resolve(),
        },
        'wasi:cli/stderr': {
            writeViaStream: (_data: WasiStreamReadable<Uint8Array>) => Promise.resolve(),
        },
        'wasi:cli/terminal-input': {},
        'wasi:cli/terminal-output': {},
        'wasi:cli/terminal-stdin': {
            getTerminalStdin: () => undefined,
        },
        'wasi:cli/terminal-stdout': {
            getTerminalStdout: () => undefined,
        },
        'wasi:cli/terminal-stderr': {
            getTerminalStderr: () => undefined,
        },
        'wasi:cli/types': {},
        'wasi:clocks/monotonic-clock': {
            now: () => BigInt(Math.round(performance.now() * 1_000_000)),
            getResolution: () => 1_000n,
            waitUntil: (when: bigint) => {
                const nowNs = BigInt(Math.round(performance.now() * 1_000_000));
                const delayNs = when - nowNs;
                if (delayNs <= 0n) return undefined;
                const MAX_NS = BigInt(0x7fffffff) * 1_000_000n;
                const delayMs = Number(delayNs > MAX_NS ? MAX_NS : delayNs) / 1_000_000;
                return new Promise(resolve => {
                    const t = setTimeout(resolve, delayMs);
                    if (typeof t === 'object' && 'unref' in t) t.unref();
                });
            },
            waitFor: (howLong: bigint) => {
                if (howLong <= 0n) return undefined;
                const MAX_NS = BigInt(0x7fffffff) * 1_000_000n;
                const delayMs = Number(howLong > MAX_NS ? MAX_NS : howLong) / 1_000_000;
                return new Promise(resolve => {
                    const t = setTimeout(resolve, delayMs);
                    if (typeof t === 'object' && 'unref' in t) t.unref();
                });
            },
        },
        'wasi:clocks/system-clock': {
            now: () => {
                const ms = Date.now();
                return { seconds: BigInt(Math.floor(ms / 1000)), nanoseconds: (ms % 1000) * 1_000_000 };
            },
            getResolution: () => 1_000_000n,
        },
        'wasi:clocks/timezone': {
            ianaId: () => 'UTC',
            utcOffset: () => 0n,
            toDebugString: () => 'UTC',
        },
        'wasi:clocks/types': {},
        'wasi:filesystem/preopens': {
            getDirectories: () => [],
        },
        'wasi:filesystem/types': {},
        'wasi:http/client': {
            send: () => { throw new Error('not implemented'); },
        },
        'wasi:http/handler': {
            handle: () => { throw new Error('not implemented'); },
        },
        'wasi:http/types': {},
        'wasi:random/random': {
            getRandomBytes: (len: bigint) => {
                const n = Number(len);
                const buf = new Uint8Array(n);
                for (let offset = 0; offset < n; offset += 65536) {
                    const end = Math.min(offset + 65536, n);
                    crypto.getRandomValues(buf.subarray(offset, end));
                }
                return buf;
            },
            getRandomU64: () => {
                const buf = new Uint8Array(8);
                crypto.getRandomValues(buf);
                const view = new DataView(buf.buffer);
                return view.getBigUint64(0, true);
            },
        },
        'wasi:random/insecure': {
            getInsecureRandomBytes: (len: bigint) => new Uint8Array(Number(len)),
            getInsecureRandomU64: () => 42n,
        },
        'wasi:random/insecure-seed': {
            getInsecureSeed: () => [1n, 2n] as [bigint, bigint],
        },
        'wasi:sockets/ip-name-lookup': {
            resolveAddresses: () => { throw Object.assign(new Error('not-supported'), { tag: 'not-supported' }); },
        },
        'wasi:sockets/types': {
            TcpSocket: { create: () => { throw Object.assign(new Error('not-supported'), { tag: 'not-supported' }); } },
            UdpSocket: { create: () => { throw Object.assign(new Error('not-supported'), { tag: 'not-supported' }); } },
        },
    };

    return { ...base, ...overrides } as unknown as WasiP3Imports;
}
