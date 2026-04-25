// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * WASIp2-via-WASIp3 Adapter — entry point
 *
 * Consumes a `WasiP3Imports` instance and returns a `WasiP2Imports`-shaped
 * flat object with kebab-case keys (same shape as `createWasiP2Host()`).
 *
 * This allows existing WASM components compiled for `wasi:cli/command@0.2.x`
 * or `wasi:http/proxy@0.2.x` to run against a P3 host implementation.
 */

import type { WasiP3Imports } from '../../../wit/wasip3/types/index';
import type { WasiP2Imports } from '../../../wit/wasip2/types/index';
import type {
    WasiError,
    WasiPollable,
    WasiInputStream,
    WasiOutputStream,
} from './io';
import { poll, createSyncPollable, createOutputStream } from './io';
import { adaptEnvironment, adaptExit, adaptStdin, adaptStdout, adaptStderr, adaptTerminalInput, adaptTerminalStdout, adaptTerminalStderr } from './cli';
import { adaptMonotonicClock, adaptWallClock, adaptTimezone } from './clocks';
import { adaptRandom, adaptInsecure, adaptInsecureSeed } from './random';
import { adaptPreopens } from './filesystem';
import type { P2DescriptorAdapter, NewTimestamp } from './filesystem';
import { adaptInstanceNetwork, adaptNetwork, adaptTcpCreateSocket, adaptUdpCreateSocket, adaptIpNameLookup } from './sockets';
import { adaptHttpTypes, adaptOutgoingHandler } from './http';
import type { HttpMethod, HttpScheme } from './http-types';
import { JsImports } from '../../resolver/api-types';

// Re-export types for consumers
export type {
    WasiError,
    WasiPollable,
    WasiInputStream,
    WasiOutputStream,
} from './io';

/**
 * Create a P2-compatible host import object from a P3 import implementation.
 *
 * Keys are kebab-case WASI interface names (e.g. `'wasi:cli/stdin'`).
 * Values are objects with kebab-case method names.
 *
 * Both unversioned and versioned (`@0.2.0` through `@0.2.11`) keys are registered.
 */
export function createWasiP2ViaP3Adapter(p3: WasiP3Imports): WasiP2Imports & JsImports {
    const result: Record<string, unknown> = {};
    const versions = ['0.2.0', '0.2.1', '0.2.2', '0.2.3', '0.2.4', '0.2.5', '0.2.6', '0.2.7', '0.2.8', '0.2.9', '0.2.10', '0.2.11'];
    const wasiPrefix = 'wasi:';
    const methodPrefix = '[method]';
    const resourceDropPrefix = '[resource-drop]';
    const method = (cls: string, name: string): string => methodPrefix + cls + '.' + name;
    const drop = (cls: string): string => resourceDropPrefix + cls;

    function register(ns: string, methods: Record<string, Function>): void {
        const key = wasiPrefix + ns;
        result[key] = methods;
        for (const v of versions) result[key + '@' + v] = methods;
    }

    // ─── wasi:random/* — passthrough ───

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

    const pollablePrefix = 'pollable';
    register('io/poll', {
        'poll': poll,
        [method(pollablePrefix, 'ready')]: (self: WasiPollable) => self.ready(),
        [method(pollablePrefix, 'block')]: (self: WasiPollable) => self.block(),
        [drop(pollablePrefix)]: () => { /* GC */ },
    });

    const _error = 'error';
    register('io/error', {
        [method(_error, 'to-debug-string')]: (self: WasiError) => self.toDebugString(),
        [drop(_error)]: () => { /* GC */ },
    });

    const inputStreamPrefix = 'input-stream';
    const outputStreamPrefix = 'output-stream';
    register('io/streams', {
        [method(inputStreamPrefix, 'read')]: (self: WasiInputStream, len: bigint) => self.read(len),
        [method(inputStreamPrefix, 'blocking-read')]: (self: WasiInputStream, len: bigint) => self.blockingRead(len),
        [method(inputStreamPrefix, 'skip')]: (self: WasiInputStream, len: bigint) => self.skip(len),
        [method(inputStreamPrefix, 'blocking-skip')]: (self: WasiInputStream, len: bigint) => self.blockingSkip(len),
        [method(inputStreamPrefix, 'subscribe')]: (self: WasiInputStream) => self.subscribe(),
        [drop(inputStreamPrefix)]: () => { /* GC */ },
        [method(outputStreamPrefix, 'check-write')]: (self: WasiOutputStream) => self.checkWrite(),
        [method(outputStreamPrefix, 'write')]: (self: WasiOutputStream, contents: Uint8Array) => self.write(contents),
        [method(outputStreamPrefix, 'blocking-write-and-flush')]: (self: WasiOutputStream, contents: Uint8Array) => self.blockingWriteAndFlush(contents),
        [method(outputStreamPrefix, 'flush')]: (self: WasiOutputStream) => self.flush(),
        [method(outputStreamPrefix, 'blocking-flush')]: (self: WasiOutputStream) => self.blockingFlush(),
        [method(outputStreamPrefix, 'write-zeroes')]: (self: WasiOutputStream, len: bigint) => self.writeZeroes(len),
        [method(outputStreamPrefix, 'blocking-write-zeroes-and-flush')]: (self: WasiOutputStream, len: bigint) => self.blockingWriteZeroesAndFlush(len),
        [method(outputStreamPrefix, 'splice')]: (self: WasiOutputStream, src: WasiInputStream, len: bigint) => self.splice(src, len),
        [method(outputStreamPrefix, 'blocking-splice')]: (self: WasiOutputStream, src: WasiInputStream, len: bigint) => self.blockingSplice(src, len),
        [method(outputStreamPrefix, 'subscribe')]: (self: WasiOutputStream) => self.subscribe(),
        [drop(outputStreamPrefix)]: () => { /* GC */ },
    });

    // ─── wasi:cli/* ───

    const env = adaptEnvironment(p3);
    const exit = adaptExit(p3);
    const stdin = adaptStdin(p3);
    const stdout = adaptStdout(p3);
    const stderr = adaptStderr(p3);
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

    const preopens = adaptPreopens(p3);
    const descriptorPrefix = 'descriptor';
    const directoryPrefix = 'directory-entry-stream';

    register('filesystem/types', {
        'filesystem-error-code': () => undefined,
        [drop(descriptorPrefix)]: () => { /* GC */ },
        [method(descriptorPrefix, 'read-via-stream')]: (self: P2DescriptorAdapter, offset: bigint) => self.readViaStream(offset),
        [method(descriptorPrefix, 'write-via-stream')]: (self: P2DescriptorAdapter, offset: bigint) => self.writeViaStream(offset),
        [method(descriptorPrefix, 'append-via-stream')]: (self: P2DescriptorAdapter) => self.appendViaStream(),
        [method(descriptorPrefix, 'get-type')]: (self: P2DescriptorAdapter) => self.getType(),
        [method(descriptorPrefix, 'stat')]: (self: P2DescriptorAdapter) => self.stat(),
        [method(descriptorPrefix, 'stat-at')]: (self: P2DescriptorAdapter, pathFlags: unknown, path: string) => self.statAt(pathFlags as { symlinkFollow?: boolean }, path),
        [method(descriptorPrefix, 'open-at')]: (self: P2DescriptorAdapter, pathFlags: unknown, path: string, openFlags: unknown, descFlags: unknown) => self.openAt(pathFlags as { symlinkFollow?: boolean }, path, openFlags as { create?: boolean; directory?: boolean; exclusive?: boolean; truncate?: boolean }, descFlags as { read?: boolean; write?: boolean; mutateDirectory?: boolean }),
        [method(descriptorPrefix, 'read-directory')]: (self: P2DescriptorAdapter) => self.readDirectory(),
        [method(descriptorPrefix, 'create-directory-at')]: (self: P2DescriptorAdapter, path: string) => self.createDirectoryAt(path),
        [method(descriptorPrefix, 'remove-directory-at')]: (self: P2DescriptorAdapter, path: string) => self.removeDirectoryAt(path),
        [method(descriptorPrefix, 'unlink-file-at')]: (self: P2DescriptorAdapter, path: string) => self.unlinkFileAt(path),
        [method(descriptorPrefix, 'read')]: (self: P2DescriptorAdapter, length: bigint, offset: bigint) => self.read(length, offset),
        [method(descriptorPrefix, 'write')]: (self: P2DescriptorAdapter, buffer: Uint8Array, offset: bigint) => self.write(buffer, offset),
        [method(descriptorPrefix, 'get-flags')]: (self: P2DescriptorAdapter) => self.getFlags(),
        [method(descriptorPrefix, 'set-size')]: (self: P2DescriptorAdapter, size: bigint) => self.setSize(size),
        [method(descriptorPrefix, 'sync')]: (self: P2DescriptorAdapter) => self.sync(),
        [method(descriptorPrefix, 'sync-data')]: (self: P2DescriptorAdapter) => self.syncData(),
        [method(descriptorPrefix, 'metadata-hash')]: (self: P2DescriptorAdapter) => self.metadataHash(),
        [method(descriptorPrefix, 'metadata-hash-at')]: (self: P2DescriptorAdapter, pathFlags: unknown, path: string) => self.metadataHashAt(pathFlags as { symlinkFollow?: boolean }, path),
        [method(descriptorPrefix, 'rename-at')]: (self: P2DescriptorAdapter, oldPath: string, newDesc: P2DescriptorAdapter, newPath: string) => self.renameAt(oldPath, newDesc, newPath),
        [method(descriptorPrefix, 'link-at')]: (self: P2DescriptorAdapter, oldPathFlags: unknown, oldPath: string, newDesc: P2DescriptorAdapter, newPath: string) => self.linkAt(oldPathFlags as { symlinkFollow?: boolean }, oldPath, newDesc, newPath),
        [method(descriptorPrefix, 'readlink-at')]: (self: P2DescriptorAdapter, path: string) => self.readlinkAt(path),
        [method(descriptorPrefix, 'symlink-at')]: (self: P2DescriptorAdapter, oldPath: string, newPath: string) => self.symlinkAt(oldPath, newPath),
        [method(descriptorPrefix, 'set-times')]: (self: P2DescriptorAdapter, atime: NewTimestamp, mtime: NewTimestamp) => self.setTimes(atime, mtime),
        [method(descriptorPrefix, 'set-times-at')]: (self: P2DescriptorAdapter, pathFlags: unknown, path: string, atime: NewTimestamp, mtime: NewTimestamp) => self.setTimesAt(pathFlags as { symlinkFollow?: boolean }, path, atime, mtime),
        [method(descriptorPrefix, 'is-same-object')]: (self: P2DescriptorAdapter, other: P2DescriptorAdapter) => self.isSameObject(other),
        [method(descriptorPrefix, 'advise')]: (self: P2DescriptorAdapter, offset: bigint, length: bigint, advice: string) => self.advise(offset, length, advice),
        [drop(directoryPrefix)]: () => { /* GC */ },
        [method(directoryPrefix, 'read-directory-entry')]: (self: { readDirectoryEntry: () => unknown }) => self.readDirectoryEntry(),
    });
    register('filesystem/preopens', {
        'get-directories': preopens.getDirectories,
    });

    // ─── wasi:http/* ───

    const httpTypes = adaptHttpTypes();
    const outgoingHandler = adaptOutgoingHandler(p3);

    register('http/types', {
        '[constructor]fields': httpTypes.createFields,
        '[static]fields.from-list': httpTypes.createFieldsFromList,
        '[resource-drop]fields': () => { /* GC */ },
        '[method]fields.get': (self: { get: (name: string) => Uint8Array[] }, name: string) => self.get(name),
        '[method]fields.has': (self: { has: (name: string) => boolean }, name: string) => self.has(name),
        '[method]fields.set': (self: { set: (name: string, values: Uint8Array[]) => unknown }, name: string, values: Uint8Array[]) => self.set(name, values),
        '[method]fields.append': (self: { append: (name: string, value: Uint8Array) => unknown }, name: string, value: Uint8Array) => self.append(name, value),
        '[method]fields.delete': (self: { delete: (name: string) => unknown }, name: string) => self.delete(name),
        '[method]fields.entries': (self: { entries: () => [string, Uint8Array][] }) => self.entries(),
        '[method]fields.clone': (self: { clone: () => unknown }) => self.clone(),
        '[constructor]outgoing-request': httpTypes.createOutgoingRequest,
        '[resource-drop]outgoing-request': () => { /* GC */ },
        '[method]outgoing-request.method': (self: { method: () => HttpMethod }) => self.method(),
        '[method]outgoing-request.set-method': (self: { setMethod: (m: HttpMethod) => boolean }, m: HttpMethod) => self.setMethod(m),
        '[method]outgoing-request.path-with-query': (self: { pathWithQuery: () => string | undefined }) => self.pathWithQuery(),
        '[method]outgoing-request.set-path-with-query': (self: { setPathWithQuery: (p: string | undefined) => boolean }, p: string | undefined) => self.setPathWithQuery(p),
        '[method]outgoing-request.scheme': (self: { scheme: () => HttpScheme | undefined }) => self.scheme(),
        '[method]outgoing-request.set-scheme': (self: { setScheme: (s: HttpScheme | undefined) => boolean }, s: HttpScheme | undefined) => self.setScheme(s),
        '[method]outgoing-request.authority': (self: { authority: () => string | undefined }) => self.authority(),
        '[method]outgoing-request.set-authority': (self: { setAuthority: (a: string | undefined) => boolean }, a: string | undefined) => self.setAuthority(a),
        '[method]outgoing-request.headers': (self: { headers: () => unknown }) => self.headers(),
        '[method]outgoing-request.body': (self: { body: () => unknown }) => self.body(),
        '[resource-drop]outgoing-body': () => { /* GC */ },
        '[method]outgoing-body.write': (self: { write: () => unknown }) => self.write(),
        '[static]outgoing-body.finish': () => ({ tag: 'ok' }),
        '[constructor]request-options': httpTypes.createRequestOptions,
        '[resource-drop]request-options': () => { /* GC */ },
        '[method]request-options.connect-timeout': (self: { connectTimeout: () => bigint | undefined }) => self.connectTimeout(),
        '[method]request-options.set-connect-timeout': (self: { setConnectTimeout: (t: bigint | undefined) => boolean }, t: bigint | undefined) => self.setConnectTimeout(t),
        '[method]request-options.first-byte-timeout': (self: { firstByteTimeout: () => bigint | undefined }) => self.firstByteTimeout(),
        '[method]request-options.set-first-byte-timeout': (self: { setFirstByteTimeout: (t: bigint | undefined) => boolean }, t: bigint | undefined) => self.setFirstByteTimeout(t),
        '[method]request-options.between-bytes-timeout': (self: { betweenBytesTimeout: () => bigint | undefined }) => self.betweenBytesTimeout(),
        '[method]request-options.set-between-bytes-timeout': (self: { setBetweenBytesTimeout: (t: bigint | undefined) => boolean }, t: bigint | undefined) => self.setBetweenBytesTimeout(t),
        '[resource-drop]incoming-response': () => { /* GC */ },
        '[method]incoming-response.status': (self: { status: () => number }) => self.status(),
        '[method]incoming-response.headers': (self: { headers: () => unknown }) => self.headers(),
        '[method]incoming-response.consume': (self: { consume: () => unknown }) => self.consume(),
        '[resource-drop]incoming-body': () => { /* GC */ },
        '[method]incoming-body.stream': (self: { stream: () => unknown }) => self.stream(),
        '[static]incoming-body.finish': () => ({
            subscribe: (): WasiPollable => createSyncPollable(() => true),
            get: (): unknown => ({ tag: 'ok', val: { tag: 'ok', val: undefined } }),
        }),
        '[resource-drop]future-incoming-response': () => { /* GC */ },
        '[method]future-incoming-response.subscribe': (self: { subscribe: () => WasiPollable }) => self.subscribe(),
        '[method]future-incoming-response.get': (self: { get: () => unknown }) => self.get(),
        'http-error-code': () => undefined,
        '[resource-drop]incoming-request': () => { /* GC */ },
        '[constructor]outgoing-response': (headers: unknown) => ({
            _statusCode: 200,
            _headers: headers,
            statusCode: function (): number { return (this as { _statusCode: number })._statusCode; },
            setStatusCode: function (code: number): boolean { (this as { _statusCode: number })._statusCode = code; return true; },
            headers: function (): unknown { return (this as { _headers: unknown })._headers; },
            body: function (): unknown { return { tag: 'ok', val: { write: (): unknown => ({ tag: 'ok', val: createOutputStream() }) } }; },
        }),
        '[resource-drop]outgoing-response': () => { /* GC */ },
        '[resource-drop]response-outparam': () => { /* GC */ },
        '[static]response-outparam.set': () => { /* stub */ },
        '[resource-drop]future-trailers': () => { /* GC */ },
        '[method]future-trailers.subscribe': () => createSyncPollable(() => true),
        '[method]future-trailers.get': () => ({ tag: 'ok', val: { tag: 'ok', val: undefined } }),
    });
    register('http/outgoing-handler', {
        'handle': outgoingHandler.handle,
    });

    // ─── wasi:sockets/* ───

    const instanceNet = adaptInstanceNetwork();
    const network = adaptNetwork();
    const tcpCreate = adaptTcpCreateSocket(p3);
    const udpCreate = adaptUdpCreateSocket(p3);
    const ipLookup = adaptIpNameLookup(p3);

    register('sockets/instance-network', {
        'instance-network': instanceNet.instanceNetwork,
    });
    register('sockets/network', {
        '[resource-drop]network': () => { /* GC */ },
        'network-error-code': network.networkErrorCode,
    });
    register('sockets/tcp-create-socket', {
        'create-tcp-socket': tcpCreate.createTcpSocket,
    });
    register('sockets/tcp', {
        '[resource-drop]tcp-socket': () => { /* GC */ },
        // TCP socket methods are dispatched on the P3 tcp-socket objects
        // which are passed through from P3 types. Browser stubs throw not-supported.
        '[method]tcp-socket.start-bind': (self: { startBind?: Function }, _network: unknown, addr: unknown) =>
            self.startBind ? self.startBind(_network, addr) : { tag: 'err', val: 'not-supported' },
        '[method]tcp-socket.finish-bind': (self: { finishBind?: Function }) =>
            self.finishBind ? self.finishBind() : { tag: 'err', val: 'not-supported' },
        '[method]tcp-socket.start-connect': (self: { startConnect?: Function }, _network: unknown, addr: unknown) =>
            self.startConnect ? self.startConnect(_network, addr) : { tag: 'err', val: 'not-supported' },
        '[method]tcp-socket.finish-connect': (self: { finishConnect?: Function }) =>
            self.finishConnect ? self.finishConnect() : { tag: 'err', val: 'not-supported' },
        '[method]tcp-socket.start-listen': (self: { startListen?: Function }) =>
            self.startListen ? self.startListen() : { tag: 'err', val: 'not-supported' },
        '[method]tcp-socket.finish-listen': (self: { finishListen?: Function }) =>
            self.finishListen ? self.finishListen() : { tag: 'err', val: 'not-supported' },
        '[method]tcp-socket.accept': (self: { accept?: Function }) =>
            self.accept ? self.accept() : { tag: 'err', val: 'not-supported' },
        '[method]tcp-socket.local-address': (self: { localAddress?: Function }) =>
            self.localAddress ? self.localAddress() : { tag: 'err', val: 'not-supported' },
        '[method]tcp-socket.remote-address': (self: { remoteAddress?: Function }) =>
            self.remoteAddress ? self.remoteAddress() : { tag: 'err', val: 'not-supported' },
        '[method]tcp-socket.is-listening': (self: { isListening?: Function }) =>
            self.isListening ? self.isListening() : false,
        '[method]tcp-socket.address-family': (self: { addressFamily?: Function }) =>
            self.addressFamily ? self.addressFamily() : 'ipv4',
        '[method]tcp-socket.set-listen-backlog-size': (self: { setListenBacklogSize?: Function }, value: bigint) =>
            self.setListenBacklogSize ? self.setListenBacklogSize(value) : { tag: 'err', val: 'not-supported' },
        '[method]tcp-socket.keep-alive-enabled': (self: { keepAliveEnabled?: Function }) =>
            self.keepAliveEnabled ? self.keepAliveEnabled() : { tag: 'err', val: 'not-supported' },
        '[method]tcp-socket.set-keep-alive-enabled': (self: { setKeepAliveEnabled?: Function }, value: boolean) =>
            self.setKeepAliveEnabled ? self.setKeepAliveEnabled(value) : { tag: 'err', val: 'not-supported' },
        '[method]tcp-socket.keep-alive-idle-time': (self: { keepAliveIdleTime?: Function }) =>
            self.keepAliveIdleTime ? self.keepAliveIdleTime() : { tag: 'err', val: 'not-supported' },
        '[method]tcp-socket.set-keep-alive-idle-time': (self: { setKeepAliveIdleTime?: Function }, value: bigint) =>
            self.setKeepAliveIdleTime ? self.setKeepAliveIdleTime(value) : { tag: 'err', val: 'not-supported' },
        '[method]tcp-socket.keep-alive-interval': (self: { keepAliveInterval?: Function }) =>
            self.keepAliveInterval ? self.keepAliveInterval() : { tag: 'err', val: 'not-supported' },
        '[method]tcp-socket.set-keep-alive-interval': (self: { setKeepAliveInterval?: Function }, value: bigint) =>
            self.setKeepAliveInterval ? self.setKeepAliveInterval(value) : { tag: 'err', val: 'not-supported' },
        '[method]tcp-socket.keep-alive-count': (self: { keepAliveCount?: Function }) =>
            self.keepAliveCount ? self.keepAliveCount() : { tag: 'err', val: 'not-supported' },
        '[method]tcp-socket.set-keep-alive-count': (self: { setKeepAliveCount?: Function }, value: number) =>
            self.setKeepAliveCount ? self.setKeepAliveCount(value) : { tag: 'err', val: 'not-supported' },
        '[method]tcp-socket.hop-limit': (self: { hopLimit?: Function }) =>
            self.hopLimit ? self.hopLimit() : { tag: 'err', val: 'not-supported' },
        '[method]tcp-socket.set-hop-limit': (self: { setHopLimit?: Function }, value: number) =>
            self.setHopLimit ? self.setHopLimit(value) : { tag: 'err', val: 'not-supported' },
        '[method]tcp-socket.receive-buffer-size': (self: { receiveBufferSize?: Function }) =>
            self.receiveBufferSize ? self.receiveBufferSize() : { tag: 'err', val: 'not-supported' },
        '[method]tcp-socket.set-receive-buffer-size': (self: { setReceiveBufferSize?: Function }, value: bigint) =>
            self.setReceiveBufferSize ? self.setReceiveBufferSize(value) : { tag: 'err', val: 'not-supported' },
        '[method]tcp-socket.send-buffer-size': (self: { sendBufferSize?: Function }) =>
            self.sendBufferSize ? self.sendBufferSize() : { tag: 'err', val: 'not-supported' },
        '[method]tcp-socket.set-send-buffer-size': (self: { setSendBufferSize?: Function }, value: bigint) =>
            self.setSendBufferSize ? self.setSendBufferSize(value) : { tag: 'err', val: 'not-supported' },
        '[method]tcp-socket.subscribe': (self: { subscribe?: Function }) =>
            self.subscribe ? self.subscribe() : createSyncPollable(() => true),
        '[method]tcp-socket.shutdown': (self: { shutdown?: Function }, shutdownType: string) =>
            self.shutdown ? self.shutdown(shutdownType) : { tag: 'err', val: 'not-supported' },
    });
    register('sockets/udp-create-socket', {
        'create-udp-socket': udpCreate.createUdpSocket,
    });
    register('sockets/udp', {
        '[resource-drop]udp-socket': () => { /* GC */ },
        '[method]udp-socket.start-bind': (self: { startBind?: Function }, _network: unknown, addr: unknown) =>
            self.startBind ? self.startBind(_network, addr) : { tag: 'err', val: 'not-supported' },
        '[method]udp-socket.finish-bind': (self: { finishBind?: Function }) =>
            self.finishBind ? self.finishBind() : { tag: 'err', val: 'not-supported' },
        '[method]udp-socket.stream': (self: { stream?: Function }, addr: unknown) =>
            self.stream ? self.stream(addr) : { tag: 'err', val: 'not-supported' },
        '[method]udp-socket.local-address': (self: { localAddress?: Function }) =>
            self.localAddress ? self.localAddress() : { tag: 'err', val: 'not-supported' },
        '[method]udp-socket.remote-address': (self: { remoteAddress?: Function }) =>
            self.remoteAddress ? self.remoteAddress() : { tag: 'err', val: 'not-supported' },
        '[method]udp-socket.address-family': (self: { addressFamily?: Function }) =>
            self.addressFamily ? self.addressFamily() : 'ipv4',
        '[method]udp-socket.unicast-hop-limit': (self: { unicastHopLimit?: Function }) =>
            self.unicastHopLimit ? self.unicastHopLimit() : { tag: 'err', val: 'not-supported' },
        '[method]udp-socket.set-unicast-hop-limit': (self: { setUnicastHopLimit?: Function }, value: number) =>
            self.setUnicastHopLimit ? self.setUnicastHopLimit(value) : { tag: 'err', val: 'not-supported' },
        '[method]udp-socket.receive-buffer-size': (self: { receiveBufferSize?: Function }) =>
            self.receiveBufferSize ? self.receiveBufferSize() : { tag: 'err', val: 'not-supported' },
        '[method]udp-socket.set-receive-buffer-size': (self: { setReceiveBufferSize?: Function }, value: bigint) =>
            self.setReceiveBufferSize ? self.setReceiveBufferSize(value) : { tag: 'err', val: 'not-supported' },
        '[method]udp-socket.send-buffer-size': (self: { sendBufferSize?: Function }) =>
            self.sendBufferSize ? self.sendBufferSize() : { tag: 'err', val: 'not-supported' },
        '[method]udp-socket.set-send-buffer-size': (self: { setSendBufferSize?: Function }, value: bigint) =>
            self.setSendBufferSize ? self.setSendBufferSize(value) : { tag: 'err', val: 'not-supported' },
        '[method]udp-socket.subscribe': (self: { subscribe?: Function }) =>
            self.subscribe ? self.subscribe() : createSyncPollable(() => true),
        '[resource-drop]incoming-datagram-stream': () => { /* GC */ },
        '[method]incoming-datagram-stream.receive': (self: { receive?: Function }, maxResults: bigint) =>
            self.receive ? self.receive(maxResults) : { tag: 'err', val: 'not-supported' },
        '[method]incoming-datagram-stream.subscribe': (self: { subscribe?: Function }) =>
            self.subscribe ? self.subscribe() : createSyncPollable(() => true),
        '[resource-drop]outgoing-datagram-stream': () => { /* GC */ },
        '[method]outgoing-datagram-stream.check-send': (self: { checkSend?: Function }) =>
            self.checkSend ? self.checkSend() : { tag: 'err', val: 'not-supported' },
        '[method]outgoing-datagram-stream.send': (self: { send?: Function }, datagrams: unknown) =>
            self.send ? self.send(datagrams) : { tag: 'err', val: 'not-supported' },
        '[method]outgoing-datagram-stream.subscribe': (self: { subscribe?: Function }) =>
            self.subscribe ? self.subscribe() : createSyncPollable(() => true),
    });
    register('sockets/ip-name-lookup', {
        'resolve-addresses': ipLookup.resolveAddresses,
        '[resource-drop]resolve-address-stream': () => { /* GC */ },
        '[method]resolve-address-stream.resolve-next-address': (self: { resolveNextAddress?: Function }) =>
            self.resolveNextAddress ? self.resolveNextAddress() : { tag: 'err', val: 'not-supported' },
        '[method]resolve-address-stream.subscribe': (self: { subscribe?: Function }) =>
            self.subscribe ? self.subscribe() : createSyncPollable(() => true),
    });

    return result as unknown as WasiP2Imports & JsImports;
}
