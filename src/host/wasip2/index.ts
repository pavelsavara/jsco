// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * WASI Preview 2 Host — Browser-native implementation
 *
 * Entry point for the WASI host. Provides createWasiP2Host(config) factory
 * that returns a flat JsImports object ready to pass to instantiate().
 *
 * Implemented interfaces:
 * - wasi:random/random, insecure, insecure-seed (D1)
 * - wasi:clocks/wall-clock (D1)
 * - wasi:io/error (D2)
 * - wasi:io/poll (D2)
 * - wasi:io/streams (D2)
 * - wasi:clocks/monotonic-clock (D3)
 * - wasi:cli/* (D3)
 * - wasi:filesystem/types, preopens (D4)
 * - wasi:http/types, outgoing-handler (D5)
 * - wasi:sockets/* stubs (D6)
 */

import type {
    WasiError,
    WasiDescriptor,
    WasiDirectoryEntryStream,
    WasiFields,
    WasiOutgoingRequest,
    WasiOutgoingBody,
    WasiRequestOptions,
    WasiIncomingResponse,
    WasiIncomingBody,
    WasiFutureIncomingResponse,
    WasiTcpSocket,
    WasiUdpSocket,
    WasiResolveAddressStream,
    WasiIncomingDatagramStream,
    WasiOutgoingDatagramStream,
    WasiNetwork,
    WasiInputStream,
    WasiOutputStream,
    WasiP2HostExports,
} from './api';
import type { WasiConfig } from './types';
import { createWasiRandom, createWasiRandomInsecure, createWasiRandomInsecureSeed } from './random';
import { createWasiWallClock } from './wall-clock';
import { createWasiMonotonicClock } from './monotonic-clock';
import { createWasiCli } from './cli';
import { createWasiFilesystem } from './filesystem';
import { createNodeFilesystem } from './node/filesystem-node';
import { poll } from './poll';
import {
    createOutgoingHandler,
    createFields,
    createFieldsFromList,
    createOutgoingRequest,
    createRequestOptions,
} from './http';
import {
    createTcpSocket,
    createUdpSocket,
    resolveAddresses,
    instanceNetwork,
} from './node/sockets';

// Re-exports — WASI P2 API types
export type {
    WasiError,
    WasiPollable, PollResult,
    StreamError, WasiInputStream, WasiOutputStream, StreamResult,
    WasiDatetime,
    WasiMonotonicClock,
    WasiWallClock,
    WasiRandom, WasiRandomInsecure, WasiRandomInsecureSeed,
    WasiEnvironment, WasiCliExit, WasiStdin, WasiStdout, WasiStderr, WasiTerminalInput, WasiTerminalOutput,
    ErrorCode, DescriptorType, DescriptorFlags, PathFlags, OpenFlags, DescriptorStat, DirectoryEntry, MetadataHashValue, FsResult, WasiDirectoryEntryStream, WasiDescriptor, WasiPreopens,
    HttpMethod, HttpScheme, HttpErrorCode, HeaderError, HttpResult, WasiFields, WasiOutgoingRequest, WasiOutgoingBody, WasiRequestOptions, WasiIncomingResponse, WasiIncomingBody, WasiFutureIncomingResponse, WasiOutgoingHandler,
    WasiIncomingRequest, WasiOutgoingResponse, WasiResponseOutparam, IncomingHandlerFn, WasiFutureTrailers,
    SocketErrorCode, IpAddressFamily, IpAddress, IpSocketAddress, SocketResult, WasiNetwork, WasiTcpSocket, WasiUdpSocket, IncomingDatagram, OutgoingDatagram, WasiIncomingDatagramStream, WasiOutgoingDatagramStream, WasiResolveAddressStream,
    WasiP2Interfaces, WasiP2InterfaceName, WasiP2HostExports,
} from './api';
export { WasiExit } from './api';

// Re-exports — internal types
export type { WasiConfig, HandleId, HandleTable, NetworkConfig, WasiCli, WasiFilesystem, FsMount, FetchFn, HttpServerConfig, WasiHttpServer } from './types';
export { createHandleTable, NETWORK_DEFAULTS } from './types';

// Re-exports — factory functions
export { createWasiRandom, createWasiRandomInsecure, createWasiRandomInsecureSeed } from './random';
export { createWasiWallClock } from './wall-clock';
export { createWasiError } from './error';
export { JspiBlockSignal, createSyncPollable, createAsyncPollable, poll } from './poll';
export { createInputStream, createOutputStream } from './streams';
export { createWasiMonotonicClock } from './monotonic-clock';
export { createWasiCli } from './cli';
export { createWasiFilesystem } from './filesystem';
export { createNodeFilesystem } from './node/filesystem-node';
export { createFields, createFieldsFromList, createOutgoingRequest, createRequestOptions, createOutgoingHandler } from './http';
export { createOutgoingResponse, createHttpServer, responseOutparamSet, createFutureTrailers } from './node/http-server';
export { createNetwork, createTcpSocket, createUdpSocket, resolveAddresses, instanceNetwork } from './node/sockets';

/**
 * Create a flat JsImports object containing all WASI host implementations.
 *
 * Keys are kebab-case WASI interface names (e.g. 'wasi:cli/stdin').
 * Values are objects with kebab-case method names (e.g. 'get-stdin').
 *
 * Both versioned ('wasi:cli/stdin@0.2.0') and unversioned ('wasi:cli/stdin')
 * keys are registered so components compiled with any WASI version work.
 *
 * @param config Optional configuration for CLI, filesystem, HTTP, etc.
 * @returns A flat JsImports object ready to pass to instantiate() or merge with other imports.
 */
export function createWasiP2Host(config?: WasiConfig): WasiP2HostExports {
    const random = createWasiRandom();
    const insecure = createWasiRandomInsecure();
    const insecureSeed = createWasiRandomInsecureSeed();
    const wallClock = createWasiWallClock();
    const monotonicClock = createWasiMonotonicClock();
    const cli = createWasiCli(config);
    const filesystem = config?.mounts && config.mounts.length > 0
        ? createNodeFilesystem(config.mounts)
        : createWasiFilesystem(config?.fs);
    const outgoingHandler = createOutgoingHandler(undefined, config?.network?.maxHttpBodyBytes);

    const result: Record<string, Record<string, Function>> = {};
    const versions = ['0.2.0', '0.2.1', '0.2.2', '0.2.3', '0.2.4', '0.2.5', '0.2.6', '0.2.7', '0.2.8', '0.2.9', '0.2.10', '0.2.11'];
    const wasiPrefix = 'wasi:';
    const methodPrefix = '[method]';
    const resourceDropPrefix = '[resource-drop]';
    const method = (cls: string, name: string) => methodPrefix + cls + '.' + name;
    const drop = (cls: string) => resourceDropPrefix + cls;
    const enabled = config?.enabledInterfaces;
    function register(ns: string, methods: Record<string, Function>) {
        const key = wasiPrefix + ns;
        if (enabled && !enabled.some(prefix => key.startsWith(wasiPrefix + prefix))) return;
        result[key] = methods;
        for (const v of versions) result[key + '@' + v] = methods;
    }

    // wasi:random/*
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

    // wasi:clocks/*
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

    // wasi:io/*
    register('io/poll', {
        'poll': poll,
    });
    // wasi:io/error — resource methods dispatched on WasiError objects
    const _error = 'error';
    register('io/error', {
        [method(_error, 'to-debug-string')]: (self: WasiError) => self.toDebugString(),
        [drop(_error)]: (_self: WasiError) => { /* GC handles cleanup */ },
    });
    // wasi:io/streams — resource methods dispatched on stream objects
    const inputStreamPrefix = 'input-stream';
    const outputStreamPrefix = 'output-stream';
    register('io/streams', {
        // InputStream methods
        [method(inputStreamPrefix, 'read')]: (self: WasiInputStream, len: bigint) => self.read(len),
        [method(inputStreamPrefix, 'blocking-read')]: (self: WasiInputStream, len: bigint) => self.blockingRead(len),
        [method(inputStreamPrefix, 'skip')]: (self: WasiInputStream, len: bigint) => self.skip(len),
        [method(inputStreamPrefix, 'blocking-skip')]: (self: WasiInputStream, len: bigint) => self.blockingSkip(len),
        [method(inputStreamPrefix, 'subscribe')]: (self: WasiInputStream) => self.subscribe(),
        [drop(inputStreamPrefix)]: (_self: WasiInputStream) => { /* GC handles cleanup */ },
        // OutputStream methods
        [method(outputStreamPrefix, 'check-write')]: (self: WasiOutputStream) => self.checkWrite(),
        [method(outputStreamPrefix, 'write')]: (self: WasiOutputStream, contents: Uint8Array) => self.write(contents),
        [method(outputStreamPrefix, 'blocking-write-and-flush')]: (self: WasiOutputStream, contents: Uint8Array) => self.blockingWriteAndFlush(contents),
        [method(outputStreamPrefix, 'flush')]: (self: WasiOutputStream) => self.flush(),
        [method(outputStreamPrefix, 'blocking-flush')]: (self: WasiOutputStream) => self.blockingFlush(),
        [method(outputStreamPrefix, 'write-zeroes')]: (self: WasiOutputStream, len: bigint) => self.writeZeroes(len),
        [method(outputStreamPrefix, 'blocking-write-zeroes-and-flush')]: (self: WasiOutputStream, len: bigint) => self.blockingWriteZeroesAndFlush(len),
        [method(outputStreamPrefix, 'subscribe')]: (self: WasiOutputStream) => self.subscribe(),
        [drop(outputStreamPrefix)]: (_self: WasiOutputStream) => { /* GC handles cleanup */ },
    });

    // wasi:cli/*
    register('cli/environment', {
        'get-environment': cli.environment.getEnvironment,
        'get-arguments': cli.environment.getArguments,
        'initial-cwd': cli.environment.initialCwd,
    });
    register('cli/exit', {
        'exit': cli.exit.exit,
    });
    register('cli/stdin', {
        'get-stdin': cli.stdin.getStdin,
    });
    register('cli/stdout', {
        'get-stdout': cli.stdout.getStdout,
    });
    register('cli/stderr', {
        'get-stderr': cli.stderr.getStderr,
    });
    register('cli/terminal-input', {
        'get-terminal-stdin': cli.terminalInput.getTerminalStdin,
    });
    register('cli/terminal-stdout', {
        'get-terminal-stdout': cli.terminalOutput.getTerminalStdout,
    });
    register('cli/terminal-stderr', {
        'get-terminal-stderr': cli.terminalOutput.getTerminalStderr,
    });

    // wasi:filesystem/*
    const descriptorPrefix = 'descriptor';
    const directoryPrefix = 'directory-entry-stream';
    register('filesystem/types', {
        'filesystem-error-code': (_err: WasiError) => {
            // In our VFS, stream errors don't carry filesystem error codes.
            // Return none (undefined) per the WIT spec.
            return undefined;
        },
        [drop(descriptorPrefix)]: (_self: WasiDescriptor) => { /* GC handles cleanup */ },
        [method(descriptorPrefix, 'read-via-stream')]: (self: WasiDescriptor, offset: bigint) => self.readViaStream(offset),
        [method(descriptorPrefix, 'write-via-stream')]: (self: WasiDescriptor, offset: bigint) => self.writeViaStream(offset),
        [method(descriptorPrefix, 'append-via-stream')]: (self: WasiDescriptor) => self.appendViaStream(),
        [method(descriptorPrefix, 'get-type')]: (self: WasiDescriptor) => self.getType(),
        [method(descriptorPrefix, 'stat')]: (self: WasiDescriptor) => self.stat(),
        [method(descriptorPrefix, 'stat-at')]: (self: WasiDescriptor, pathFlags: any, path: string) => self.statAt(pathFlags, path),
        [method(descriptorPrefix, 'open-at')]: (self: WasiDescriptor, pathFlags: any, path: string, openFlags: any, descFlags: any) => self.openAt(pathFlags, path, openFlags, descFlags),
        [method(descriptorPrefix, 'read-directory')]: (self: WasiDescriptor) => self.readDirectory(),
        [method(descriptorPrefix, 'create-directory-at')]: (self: WasiDescriptor, path: string) => self.createDirectoryAt(path),
        [method(descriptorPrefix, 'remove-directory-at')]: (self: WasiDescriptor, path: string) => self.removeDirectoryAt(path),
        [method(descriptorPrefix, 'unlink-file-at')]: (self: WasiDescriptor, path: string) => self.unlinkFileAt(path),
        [method(descriptorPrefix, 'read')]: (self: WasiDescriptor, length: bigint, offset: bigint) => self.read(length, offset),
        [method(descriptorPrefix, 'write')]: (self: WasiDescriptor, buffer: Uint8Array, offset: bigint) => self.write(buffer, offset),
        [method(descriptorPrefix, 'get-flags')]: (self: WasiDescriptor) => self.getFlags(),
        [method(descriptorPrefix, 'set-size')]: (self: WasiDescriptor, size: bigint) => self.setSize(size),
        [method(descriptorPrefix, 'sync')]: (self: WasiDescriptor) => self.sync(),
        [method(descriptorPrefix, 'sync-data')]: (self: WasiDescriptor) => self.syncData(),
        [method(descriptorPrefix, 'metadata-hash')]: (self: WasiDescriptor) => self.metadataHash(),
        [method(descriptorPrefix, 'metadata-hash-at')]: (self: WasiDescriptor, pathFlags: any, path: string) => self.metadataHashAt(pathFlags, path),
        [method(descriptorPrefix, 'rename-at')]: (self: WasiDescriptor, oldPath: string, newDesc: WasiDescriptor, newPath: string) => self.renameAt(oldPath, newDesc, newPath),
        [method(descriptorPrefix, 'set-times')]: (self: WasiDescriptor, atime: any, mtime: any) => self.setTimes(atime, mtime),
        [method(descriptorPrefix, 'set-times-at')]: (self: WasiDescriptor, pathFlags: any, path: string, atime: any, mtime: any) => self.setTimesAt(pathFlags, path, atime, mtime),
        [method(descriptorPrefix, 'is-same-object')]: (self: WasiDescriptor, other: WasiDescriptor) => self.isSameObject(other),
        [method(descriptorPrefix, 'advise')]: (self: WasiDescriptor, offset: bigint, length: bigint, advice: string) => self.advise(offset, length, advice),
        [drop(directoryPrefix)]: (_self: WasiDirectoryEntryStream) => { /* GC handles cleanup */ },
        [method(directoryPrefix, 'read-directory-entry')]: (self: WasiDirectoryEntryStream) => self.readDirectoryEntry(),
    });
    register('filesystem/preopens', {
        'get-directories': filesystem.preopens.getDirectories,
    });

    // wasi:http/*
    const fieldsPrefix = 'fields';
    const outReqPrefix = 'outgoing-request';
    const outBodyPrefix = 'outgoing-body';
    const reqOptsPrefix = 'request-options';
    const inRespPrefix = 'incoming-response';
    const inBodyPrefix = 'incoming-body';
    const futRespPrefix = 'future-incoming-response';
    register('http/types', {
        // Fields constructors
        '[constructor]fields': () => createFields(),
        '[static]fields.from-list': (entries: [string, Uint8Array][]) => createFieldsFromList(entries),
        [drop(fieldsPrefix)]: (_self: WasiFields) => { /* GC */ },
        [method(fieldsPrefix, 'get')]: (self: WasiFields, name: string) => self.get(name),
        [method(fieldsPrefix, 'has')]: (self: WasiFields, name: string) => self.has(name),
        [method(fieldsPrefix, 'set')]: (self: WasiFields, name: string, values: Uint8Array[]) => self.set(name, values),
        [method(fieldsPrefix, 'append')]: (self: WasiFields, name: string, value: Uint8Array) => self.append(name, value),
        [method(fieldsPrefix, 'delete')]: (self: WasiFields, name: string) => self.delete(name),
        [method(fieldsPrefix, 'entries')]: (self: WasiFields) => self.entries(),
        [method(fieldsPrefix, 'clone')]: (self: WasiFields) => self.clone(),
        // Outgoing request
        '[constructor]outgoing-request': (headers: WasiFields) => createOutgoingRequest(headers),
        [drop(outReqPrefix)]: (_self: WasiOutgoingRequest) => { /* GC */ },
        [method(outReqPrefix, 'method')]: (self: WasiOutgoingRequest) => self.method(),
        [method(outReqPrefix, 'set-method')]: (self: WasiOutgoingRequest, m: any) => self.setMethod(m),
        [method(outReqPrefix, 'path-with-query')]: (self: WasiOutgoingRequest) => self.pathWithQuery(),
        [method(outReqPrefix, 'set-path-with-query')]: (self: WasiOutgoingRequest, p: string | undefined) => self.setPathWithQuery(p),
        [method(outReqPrefix, 'scheme')]: (self: WasiOutgoingRequest) => self.scheme(),
        [method(outReqPrefix, 'set-scheme')]: (self: WasiOutgoingRequest, s: any) => self.setScheme(s),
        [method(outReqPrefix, 'authority')]: (self: WasiOutgoingRequest) => self.authority(),
        [method(outReqPrefix, 'set-authority')]: (self: WasiOutgoingRequest, a: string | undefined) => self.setAuthority(a),
        [method(outReqPrefix, 'headers')]: (self: WasiOutgoingRequest) => self.headers(),
        [method(outReqPrefix, 'body')]: (self: WasiOutgoingRequest) => self.body(),
        // Outgoing body
        [drop(outBodyPrefix)]: (_self: WasiOutgoingBody) => { /* GC */ },
        [method(outBodyPrefix, 'write')]: (self: WasiOutgoingBody) => self.write(),
        // Request options
        '[constructor]request-options': () => createRequestOptions(),
        [drop(reqOptsPrefix)]: (_self: WasiRequestOptions) => { /* GC */ },
        [method(reqOptsPrefix, 'connect-timeout')]: (self: WasiRequestOptions) => self.connectTimeout(),
        [method(reqOptsPrefix, 'set-connect-timeout')]: (self: WasiRequestOptions, t: bigint | undefined) => self.setConnectTimeout(t),
        [method(reqOptsPrefix, 'first-byte-timeout')]: (self: WasiRequestOptions) => self.firstByteTimeout(),
        [method(reqOptsPrefix, 'set-first-byte-timeout')]: (self: WasiRequestOptions, t: bigint | undefined) => self.setFirstByteTimeout(t),
        [method(reqOptsPrefix, 'between-bytes-timeout')]: (self: WasiRequestOptions) => self.betweenBytesTimeout(),
        [method(reqOptsPrefix, 'set-between-bytes-timeout')]: (self: WasiRequestOptions, t: bigint | undefined) => self.setBetweenBytesTimeout(t),
        // Incoming response
        [drop(inRespPrefix)]: (_self: WasiIncomingResponse) => { /* GC */ },
        [method(inRespPrefix, 'status')]: (self: WasiIncomingResponse) => self.status(),
        [method(inRespPrefix, 'headers')]: (self: WasiIncomingResponse) => self.headers(),
        [method(inRespPrefix, 'consume')]: (self: WasiIncomingResponse) => self.consume(),
        // Incoming body
        [drop(inBodyPrefix)]: (_self: WasiIncomingBody) => { /* GC */ },
        [method(inBodyPrefix, 'stream')]: (self: WasiIncomingBody) => self.stream(),
        // Future incoming response
        [drop(futRespPrefix)]: (_self: WasiFutureIncomingResponse) => { /* GC */ },
        [method(futRespPrefix, 'subscribe')]: (self: WasiFutureIncomingResponse) => self.subscribe(),
        [method(futRespPrefix, 'get')]: (self: WasiFutureIncomingResponse) => self.get(),
        // HTTP error-code helper
        'http-error-code': (_err: WasiError) => undefined,
    });
    register('http/outgoing-handler', {
        'handle': outgoingHandler.handle,
    });

    // wasi:sockets/*
    register('sockets/instance-network', {
        'instance-network': instanceNetwork,
    });
    register('sockets/network', {
        [drop('network')]: (_self: WasiNetwork) => { /* GC */ },
    });
    register('sockets/tcp-create-socket', {
        'create-tcp-socket': (family: any) => createTcpSocket(family, config?.network),
    });
    const tcpPrefix = 'tcp-socket';
    register('sockets/tcp', {
        [drop(tcpPrefix)]: (_self: WasiTcpSocket) => { /* GC */ },
        [method(tcpPrefix, 'start-bind')]: (self: WasiTcpSocket, network: WasiNetwork, addr: any) => self.startBind(network, addr),
        [method(tcpPrefix, 'finish-bind')]: (self: WasiTcpSocket) => self.finishBind(),
        [method(tcpPrefix, 'start-connect')]: (self: WasiTcpSocket, network: WasiNetwork, addr: any) => self.startConnect(network, addr),
        [method(tcpPrefix, 'finish-connect')]: (self: WasiTcpSocket) => self.finishConnect(),
        [method(tcpPrefix, 'start-listen')]: (self: WasiTcpSocket) => self.startListen(),
        [method(tcpPrefix, 'finish-listen')]: (self: WasiTcpSocket) => self.finishListen(),
        [method(tcpPrefix, 'accept')]: (self: WasiTcpSocket) => self.accept(),
        [method(tcpPrefix, 'local-address')]: (self: WasiTcpSocket) => self.localAddress(),
        [method(tcpPrefix, 'remote-address')]: (self: WasiTcpSocket) => self.remoteAddress(),
        [method(tcpPrefix, 'is-listening')]: (self: WasiTcpSocket) => self.isListening(),
        [method(tcpPrefix, 'address-family')]: (self: WasiTcpSocket) => self.addressFamily(),
        [method(tcpPrefix, 'set-listen-backlog-size')]: (self: WasiTcpSocket, v: bigint) => self.setListenBacklogSize(v),
        [method(tcpPrefix, 'keep-alive-enabled')]: (self: WasiTcpSocket) => self.keepAliveEnabled(),
        [method(tcpPrefix, 'set-keep-alive-enabled')]: (self: WasiTcpSocket, v: boolean) => self.setKeepAliveEnabled(v),
        [method(tcpPrefix, 'keep-alive-idle-time')]: (self: WasiTcpSocket) => self.keepAliveIdleTime(),
        [method(tcpPrefix, 'set-keep-alive-idle-time')]: (self: WasiTcpSocket, v: bigint) => self.setKeepAliveIdleTime(v),
        [method(tcpPrefix, 'keep-alive-interval')]: (self: WasiTcpSocket) => self.keepAliveInterval(),
        [method(tcpPrefix, 'set-keep-alive-interval')]: (self: WasiTcpSocket, v: bigint) => self.setKeepAliveInterval(v),
        [method(tcpPrefix, 'keep-alive-count')]: (self: WasiTcpSocket) => self.keepAliveCount(),
        [method(tcpPrefix, 'set-keep-alive-count')]: (self: WasiTcpSocket, v: number) => self.setKeepAliveCount(v),
        [method(tcpPrefix, 'hop-limit')]: (self: WasiTcpSocket) => self.hopLimit(),
        [method(tcpPrefix, 'set-hop-limit')]: (self: WasiTcpSocket, v: number) => self.setHopLimit(v),
        [method(tcpPrefix, 'receive-buffer-size')]: (self: WasiTcpSocket) => self.receiveBufferSize(),
        [method(tcpPrefix, 'set-receive-buffer-size')]: (self: WasiTcpSocket, v: bigint) => self.setReceiveBufferSize(v),
        [method(tcpPrefix, 'send-buffer-size')]: (self: WasiTcpSocket) => self.sendBufferSize(),
        [method(tcpPrefix, 'set-send-buffer-size')]: (self: WasiTcpSocket, v: bigint) => self.setSendBufferSize(v),
        [method(tcpPrefix, 'subscribe')]: (self: WasiTcpSocket) => self.subscribe(),
        [method(tcpPrefix, 'shutdown')]: (self: WasiTcpSocket, how: string) => self.shutdown(how),
    });
    register('sockets/udp-create-socket', {
        'create-udp-socket': (family: any) => createUdpSocket(family, config?.network),
    });
    const udpPrefix = 'udp-socket';
    const inDgramPrefix = 'incoming-datagram-stream';
    const outDgramPrefix = 'outgoing-datagram-stream';
    register('sockets/udp', {
        [drop(udpPrefix)]: (_self: WasiUdpSocket) => { /* GC */ },
        [method(udpPrefix, 'start-bind')]: (self: WasiUdpSocket, network: WasiNetwork, addr: any) => self.startBind(network, addr),
        [method(udpPrefix, 'finish-bind')]: (self: WasiUdpSocket) => self.finishBind(),
        [method(udpPrefix, 'stream')]: (self: WasiUdpSocket, remoteAddr: any) => self.stream(remoteAddr),
        [method(udpPrefix, 'local-address')]: (self: WasiUdpSocket) => self.localAddress(),
        [method(udpPrefix, 'remote-address')]: (self: WasiUdpSocket) => self.remoteAddress(),
        [method(udpPrefix, 'address-family')]: (self: WasiUdpSocket) => self.addressFamily(),
        [method(udpPrefix, 'unicast-hop-limit')]: (self: WasiUdpSocket) => self.unicastHopLimit(),
        [method(udpPrefix, 'set-unicast-hop-limit')]: (self: WasiUdpSocket, v: number) => self.setUnicastHopLimit(v),
        [method(udpPrefix, 'receive-buffer-size')]: (self: WasiUdpSocket) => self.receiveBufferSize(),
        [method(udpPrefix, 'set-receive-buffer-size')]: (self: WasiUdpSocket, v: bigint) => self.setReceiveBufferSize(v),
        [method(udpPrefix, 'send-buffer-size')]: (self: WasiUdpSocket) => self.sendBufferSize(),
        [method(udpPrefix, 'set-send-buffer-size')]: (self: WasiUdpSocket, v: bigint) => self.setSendBufferSize(v),
        [method(udpPrefix, 'subscribe')]: (self: WasiUdpSocket) => self.subscribe(),
        // Datagram streams
        [drop(inDgramPrefix)]: (_self: WasiIncomingDatagramStream) => { /* GC */ },
        [method(inDgramPrefix, 'receive')]: (self: WasiIncomingDatagramStream, max: bigint) => self.receive(max),
        [method(inDgramPrefix, 'subscribe')]: (self: WasiIncomingDatagramStream) => self.subscribe(),
        [drop(outDgramPrefix)]: (_self: WasiOutgoingDatagramStream) => { /* GC */ },
        [method(outDgramPrefix, 'check-send')]: (self: WasiOutgoingDatagramStream) => self.checkSend(),
        [method(outDgramPrefix, 'send')]: (self: WasiOutgoingDatagramStream, datagrams: any[]) => self.send(datagrams),
        [method(outDgramPrefix, 'subscribe')]: (self: WasiOutgoingDatagramStream) => self.subscribe(),
    });
    const resolveStreamPrefix = 'resolve-address-stream';
    register('sockets/ip-name-lookup', {
        'resolve-addresses': (network: any, name: string) => resolveAddresses(network, name, config?.network),
        [drop(resolveStreamPrefix)]: (_self: WasiResolveAddressStream) => { /* GC */ },
        [method(resolveStreamPrefix, 'resolve-next-address')]: (self: WasiResolveAddressStream) => self.resolveNextAddress(),
        [method(resolveStreamPrefix, 'subscribe')]: (self: WasiResolveAddressStream) => self.subscribe(),
    });

    return result;
}
