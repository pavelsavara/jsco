// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

/**
 * WASIp2-via-WASIp3 Adapter — entry point
 *
 * Consumes a `WasiP3Imports` instance and returns a `WasiP2Imports`-shaped
 * flat object with kebab-case keys (same shape as `createWasiP2Host()`).
 *
 * This allows existing WASM components compiled for `wasi:cli/command@0.2.x`
 * or `wasi:http/proxy@0.2.x` to run against a P3 host implementation.
 */

import type { WasiP3Imports } from '../wasip3';
import type { WasiP2Imports } from '../../../wit/wasip2/types/index';
import type { AllocationLimits } from '../wasip3/types';
import { LIMIT_DEFAULTS } from '../wasip3/types';
import type {
    WasiPollable,
} from './io';
import { poll, createSyncPollable, createOutputStream } from './io';
import { adaptEnvironment, adaptExit, adaptStdin, adaptStdout, adaptStderr, adaptTerminalInput, adaptTerminalStdout, adaptTerminalStderr } from './cli';
import { adaptMonotonicClock, adaptWallClock, adaptTimezone } from './clocks';
import { adaptRandom, adaptInsecure, adaptInsecureSeed } from './random';
import { adaptPreopens } from './filesystem';
import type { P2DescriptorAdapter, NewTimestamp } from './filesystem';
import { adaptInstanceNetwork, adaptNetwork, adaptTcpCreateSocket, adaptUdpCreateSocket, adaptIpNameLookup } from './sockets';
import { adaptHttpTypes, adaptOutgoingHandler } from './http';
import { JsImports } from '../../resolver/api-types';
import { ok, err } from '../wasip3';
import { resource, passthrough, constant, makeRegister } from '../_shared/resource-table';

const P2_VERSIONS = [
    '0.2.0', '0.2.1', '0.2.2', '0.2.3', '0.2.4', '0.2.5',
    '0.2.6', '0.2.7', '0.2.8', '0.2.9', '0.2.10', '0.2.11',
] as const;

// Re-export types for consumers
export type {
    WasiError,
    WasiPollable,
    WasiInputStream,
    WasiOutputStream,
} from './io';
export type { WasiP2Imports } from '../../../wit/wasip2/types/index';

/**
 * Create a P2-compatible host import object from a P3 import implementation.
 *
 * Keys are kebab-case WASI interface names (e.g. `'wasi:cli/stdin'`).
 * Values are objects with kebab-case method names.
 *
 * Both unversioned and versioned (`@0.2.0` through `@0.2.11`) keys are registered.
 */
export function createWasiP2ViaP3Adapter(p3: WasiP3Imports, options?: { limits?: AllocationLimits }): WasiP2Imports & JsImports {
    const maxBufferSize = options?.limits?.maxNetworkBufferSize ?? LIMIT_DEFAULTS.maxNetworkBufferSize;
    const result: Record<string, unknown> = {};
    const register = makeRegister(result, 'wasi:', P2_VERSIONS);
    const notSupported = (): unknown => err('not-supported');
    const syncPollable = (): WasiPollable => createSyncPollable(() => true);

    // ─── wasi:random/* ───

    const random = adaptRandom(p3);
    const insecure = adaptInsecure(p3);
    const insecureSeed = adaptInsecureSeed(p3);

    register('random/random', {
        'get-random-bytes': random.getRandomBytes,
        'get-random-u64': random.getRandomU64,
    });
    register('random/insecure', {
        'get-insecure-random-bytes': insecure.getInsecureRandomBytes,
        'get-insecure-random-u64': insecure.getInsecureRandomU64,
    });
    register('random/insecure-seed', {
        'insecure-seed': insecureSeed.insecureSeed,
    });

    // ─── wasi:clocks/* ───

    const wallClock = adaptWallClock(p3);
    const monotonicClock = adaptMonotonicClock(p3);
    const timezone = adaptTimezone(p3);

    register('clocks/wall-clock', {
        'now': wallClock.now,
        'resolution': wallClock.resolution,
    });
    register('clocks/monotonic-clock', {
        'now': monotonicClock.now,
        'resolution': monotonicClock.resolution,
        'subscribe-duration': monotonicClock.subscribeDuration,
        'subscribe-instant': monotonicClock.subscribeInstant,
    });
    register('clocks/timezone', {
        'display': timezone.display,
    });

    // ─── wasi:io/* — synthesized from P3 async primitives ───

    register('io/poll', {
        'poll': poll,
        ...resource('pollable', {
            methods: passthrough('ready', 'block'),
        }),
    });

    register('io/error', {
        ...resource('error', {
            methods: passthrough('to-debug-string'),
        }),
    });

    register('io/streams', {
        ...resource('input-stream', {
            methods: passthrough(
                'read', 'blocking-read', 'skip', 'blocking-skip', 'subscribe',
            ),
        }),
        ...resource('output-stream', {
            methods: passthrough(
                'check-write', 'write',
                'blocking-write-and-flush', 'flush', 'blocking-flush',
                'write-zeroes', 'blocking-write-zeroes-and-flush',
                'splice', 'blocking-splice', 'subscribe',
            ),
        }),
    });

    // ─── wasi:cli/* ───

    const env = adaptEnvironment(p3);
    const exit = adaptExit(p3);
    const stdin = adaptStdin(p3);
    const stdout = adaptStdout(p3, maxBufferSize);
    const stderr = adaptStderr(p3, maxBufferSize);
    const terminalInput = adaptTerminalInput(p3);
    const terminalStdout = adaptTerminalStdout(p3);
    const terminalStderr = adaptTerminalStderr(p3);

    register('cli/environment', {
        'get-environment': env.getEnvironment,
        'get-arguments': env.getArguments,
        'initial-cwd': env.initialCwd,
    });
    register('cli/exit', {
        'exit': exit.exit,
        'exit-with-code': exit.exitWithCode,
    });
    register('cli/stdin', {
        'get-stdin': stdin.getStdin,
    });
    register('cli/stdout', {
        'get-stdout': stdout.getStdout,
    });
    register('cli/stderr', {
        'get-stderr': stderr.getStderr,
    });
    register('cli/terminal-input', {});
    register('cli/terminal-output', {});
    register('cli/terminal-stdin', {
        'get-terminal-stdin': terminalInput.getTerminalStdin,
    });
    register('cli/terminal-stdout', {
        'get-terminal-stdout': terminalStdout.getTerminalStdout,
    });
    register('cli/terminal-stderr', {
        'get-terminal-stderr': terminalStderr.getTerminalStderr,
    });

    // ─── wasi:filesystem/* ───

    const preopens = adaptPreopens(p3, maxBufferSize);

    register('filesystem/types', {
        'filesystem-error-code': () => undefined,
        ...resource('descriptor', {
            methods: {
                ...passthrough(
                    'read-via-stream', 'write-via-stream', 'append-via-stream',
                    'get-type', 'stat', 'read-directory',
                    'create-directory-at', 'remove-directory-at', 'unlink-file-at',
                    'read', 'write', 'get-flags', 'set-size',
                    'sync', 'sync-data', 'metadata-hash',
                    'rename-at', 'readlink-at', 'symlink-at',
                    'set-times', 'is-same-object', 'advise',
                ),
                'stat-at': (self: P2DescriptorAdapter, pathFlags: unknown, path: string) => self.statAt(pathFlags as { symlinkFollow?: boolean }, path),
                'open-at': (self: P2DescriptorAdapter, pathFlags: unknown, path: string, openFlags: unknown, descFlags: unknown) => self.openAt(pathFlags as { symlinkFollow?: boolean }, path, openFlags as { create?: boolean; directory?: boolean; exclusive?: boolean; truncate?: boolean }, descFlags as { read?: boolean; write?: boolean; mutateDirectory?: boolean }),
                'metadata-hash-at': (self: P2DescriptorAdapter, pathFlags: unknown, path: string) => self.metadataHashAt(pathFlags as { symlinkFollow?: boolean }, path),
                'link-at': (self: P2DescriptorAdapter, oldPathFlags: unknown, oldPath: string, newDesc: P2DescriptorAdapter, newPath: string) => self.linkAt(oldPathFlags as { symlinkFollow?: boolean }, oldPath, newDesc, newPath),
                'set-times-at': (self: P2DescriptorAdapter, pathFlags: unknown, path: string, atime: NewTimestamp, mtime: NewTimestamp) => self.setTimesAt(pathFlags as { symlinkFollow?: boolean }, path, atime, mtime),
            },
        }),
        ...resource('directory-entry-stream', {
            methods: passthrough('read-directory-entry'),
        }),
    });
    register('filesystem/preopens', {
        'get-directories': preopens.getDirectories,
    });

    // ─── wasi:http/* ───

    const httpTypes = adaptHttpTypes(maxBufferSize);
    const outgoingHandler = adaptOutgoingHandler(p3, maxBufferSize);

    register('http/types', {
        'http-error-code': () => undefined,
        ...resource('fields', {
            ctor: httpTypes.createFields,
            statics: { 'from-list': httpTypes.createFieldsFromList },
            methods: passthrough('get', 'has', 'set', 'append', 'delete', 'entries', 'clone'),
        }),
        ...resource('outgoing-request', {
            ctor: httpTypes.createOutgoingRequest,
            methods: passthrough(
                'method', 'set-method', 'path-with-query', 'set-path-with-query',
                'scheme', 'set-scheme', 'authority', 'set-authority',
                'headers', 'body',
            ),
        }),
        ...resource('outgoing-body', {
            methods: passthrough('write'),
            statics: { 'finish': () => ok() },
        }),
        ...resource('request-options', {
            ctor: httpTypes.createRequestOptions,
            methods: passthrough(
                'connect-timeout', 'set-connect-timeout',
                'first-byte-timeout', 'set-first-byte-timeout',
                'between-bytes-timeout', 'set-between-bytes-timeout',
            ),
        }),
        ...resource('incoming-response', {
            methods: passthrough('status', 'headers', 'consume'),
        }),
        ...resource('incoming-body', {
            methods: passthrough('stream'),
            statics: {
                'finish': () => ({
                    subscribe: syncPollable,
                    get: (): unknown => ok(ok()),
                }),
            },
        }),
        ...resource('future-incoming-response', {
            methods: passthrough('subscribe', 'get'),
        }),
        ...resource('incoming-request', {}),
        ...resource('outgoing-response', {
            ctor: (headers: unknown) => ({
                _statusCode: 200,
                _headers: headers,
                statusCode: function (): number { return (this as { _statusCode: number })._statusCode; },
                setStatusCode: function (code: number): boolean { (this as { _statusCode: number })._statusCode = code; return true; },
                headers: function (): unknown { return (this as { _headers: unknown })._headers; },
                body: function (): unknown { return ok({ write: (): unknown => ok(createOutputStream(undefined, maxBufferSize)) }); },
            }),
        }),
        ...resource('response-outparam', {
            statics: { 'set': () => { /* stub */ } },
        }),
        ...resource('future-trailers', {
            methods: {
                'subscribe': syncPollable,
                'get': () => ok(ok()),
            },
        }),
    });
    register('http/outgoing-handler', {
        'handle': outgoingHandler.handle,
    });

    // ─── wasi:sockets/* ───
    //
    // P3's sockets shape (P3 instance methods are `bind`/`connect`/...) does not match
    // P2's split start/finish state machine, so the methods below are effectively
    // "not-supported" stubs in both browser and Node hosts. Future virtual-socket
    // bridging would replace these blocks.

    const instanceNet = adaptInstanceNetwork();
    const network = adaptNetwork();
    const tcpCreate = adaptTcpCreateSocket(p3);
    const udpCreate = adaptUdpCreateSocket(p3);
    const ipLookup = adaptIpNameLookup(p3);

    register('sockets/instance-network', {
        'instance-network': instanceNet.instanceNetwork,
    });
    register('sockets/network', {
        'network-error-code': network.networkErrorCode,
        ...resource('network', {}),
    });
    register('sockets/tcp-create-socket', {
        'create-tcp-socket': tcpCreate.createTcpSocket,
    });
    register('sockets/tcp', resource('tcp-socket', {
        methods: {
            ...constant(notSupported,
                'start-bind', 'finish-bind', 'start-connect', 'finish-connect',
                'start-listen', 'finish-listen', 'accept',
                'local-address', 'remote-address', 'set-listen-backlog-size',
                'keep-alive-enabled', 'set-keep-alive-enabled',
                'keep-alive-idle-time', 'set-keep-alive-idle-time',
                'keep-alive-interval', 'set-keep-alive-interval',
                'keep-alive-count', 'set-keep-alive-count',
                'hop-limit', 'set-hop-limit',
                'receive-buffer-size', 'set-receive-buffer-size',
                'send-buffer-size', 'set-send-buffer-size',
                'shutdown',
            ),
            ...constant(false, 'is-listening'),
            ...constant('ipv4', 'address-family'),
            'subscribe': syncPollable,
        },
    }));
    register('sockets/udp-create-socket', {
        'create-udp-socket': udpCreate.createUdpSocket,
    });
    register('sockets/udp', {
        ...resource('udp-socket', {
            methods: {
                ...constant(notSupported,
                    'start-bind', 'finish-bind', 'stream',
                    'local-address', 'remote-address',
                    'unicast-hop-limit', 'set-unicast-hop-limit',
                    'receive-buffer-size', 'set-receive-buffer-size',
                    'send-buffer-size', 'set-send-buffer-size',
                ),
                ...constant('ipv4', 'address-family'),
                'subscribe': syncPollable,
            },
        }),
        ...resource('incoming-datagram-stream', {
            methods: {
                ...constant(notSupported, 'receive'),
                'subscribe': syncPollable,
            },
        }),
        ...resource('outgoing-datagram-stream', {
            methods: {
                ...constant(notSupported, 'check-send', 'send'),
                'subscribe': syncPollable,
            },
        }),
    });
    register('sockets/ip-name-lookup', {
        'resolve-addresses': ipLookup.resolveAddresses,
        ...resource('resolve-address-stream', {
            methods: {
                ...constant(notSupported, 'resolve-next-address'),
                'subscribe': syncPollable,
            },
        }),
    });

    return result as unknown as WasiP2Imports & JsImports;
}
