/**
 * WASI Preview 2 Host — Browser-native implementation
 *
 * Entry point for the WASI host. Provides createWasiHost(config) factory
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

import { WasiConfig } from './types';
import { createWasiRandom, createWasiRandomInsecure, createWasiRandomInsecureSeed } from './random';
import { createWasiWallClock } from './wall-clock';
import { createWasiMonotonicClock } from './monotonic-clock';
import { createWasiCli } from './cli';
import { createWasiFilesystem, WasiDescriptor, WasiDirectoryEntryStream } from './filesystem';
import { poll } from './poll';
import { createOutgoingHandler } from './http';
import { createTcpSocket, createUdpSocket, resolveAddresses, instanceNetwork } from './sockets';
import { WasiInputStream, WasiOutputStream } from './streams';
import { WasiError } from './error';

// Re-exports for direct usage
export type { WasiConfig, WasiDatetime, HandleId, HandleTable } from './types';
export { WasiExit, createHandleTable } from './types';
export type { WasiRandom, WasiRandomInsecure, WasiRandomInsecureSeed } from './random';
export { createWasiRandom, createWasiRandomInsecure, createWasiRandomInsecureSeed } from './random';
export type { WasiWallClock } from './wall-clock';
export { createWasiWallClock } from './wall-clock';
export type { WasiError } from './error';
export { createWasiError } from './error';
export type { WasiPollable, PollResult } from './poll';
export { JspiBlockSignal, createSyncPollable, createAsyncPollable, poll, hasJspi } from './poll';
export type { WasiInputStream, WasiOutputStream, StreamError, StreamResult } from './streams';
export { createInputStream, createOutputStream } from './streams';
export type { WasiMonotonicClock } from './monotonic-clock';
export { createWasiMonotonicClock } from './monotonic-clock';
export type { WasiEnvironment, WasiCliExit, WasiStdin, WasiStdout, WasiStderr, WasiTerminalInput, WasiTerminalOutput, WasiCli } from './cli';
export { createWasiCli } from './cli';
export type { ErrorCode, DescriptorType, DescriptorFlags, PathFlags, OpenFlags, DescriptorStat, DirectoryEntry, MetadataHashValue, FsResult, WasiDirectoryEntryStream, WasiDescriptor, WasiPreopens, WasiFilesystem } from './filesystem';
export { createWasiFilesystem } from './filesystem';
export type { HttpMethod, HttpScheme, HttpErrorCode, HeaderError, HttpResult, WasiFields, WasiOutgoingRequest, WasiOutgoingBody, WasiRequestOptions, WasiIncomingResponse, WasiIncomingBody, WasiFutureIncomingResponse, WasiOutgoingHandler, FetchFn } from './http';
export { createFields, createFieldsFromList, createOutgoingRequest, createRequestOptions, createOutgoingHandler } from './http';
export type { SocketErrorCode, IpAddressFamily, IpAddress, IpSocketAddress, SocketResult, WasiNetwork, WasiTcpSocket, WasiUdpSocket, WasiResolveAddressStream } from './sockets';
export { createNetwork, createTcpSocket, createUdpSocket, resolveAddresses, instanceNetwork } from './sockets';

/** JsImports-compatible flat map: { 'wasi:cli/stdin': { 'get-stdin': fn }, ... } */
export type WasiHostImports = Record<string, Record<string, Function>>;

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
export function createWasiHost(config?: WasiConfig): WasiHostImports {
    const random = createWasiRandom();
    const insecure = createWasiRandomInsecure();
    const insecureSeed = createWasiRandomInsecureSeed();
    const wallClock = createWasiWallClock();
    const monotonicClock = createWasiMonotonicClock();
    const cli = createWasiCli(config);
    const filesystem = createWasiFilesystem(config?.fs);
    const outgoingHandler = createOutgoingHandler();

    const result: WasiHostImports = {};
    const versions = ['0.2.0', '0.2.1', '0.2.2', '0.2.3', '0.2.4', '0.2.5', '0.2.6', '0.2.7', '0.2.8', '0.2.9', '0.2.10', '0.2.11'];
    const wasiPrefix = 'wasi:';
    const methodPrefix = '[method]';
    const resourceDropPrefix = '[resource-drop]';
    const method = (cls: string, name: string) => methodPrefix + cls + '.' + name;
    const drop = (cls: string) => resourceDropPrefix + cls;
    function register(ns: string, methods: Record<string, Function>) {
        const key = wasiPrefix + ns;
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
    register('http/outgoing-handler', {
        'handle': outgoingHandler.handle,
    });

    // wasi:sockets/* (all stubs)
    register('sockets/instance-network', {
        'instance-network': instanceNetwork,
    });
    register('sockets/tcp-create-socket', {
        'create-tcp-socket': (family: any) => createTcpSocket(family),
    });
    register('sockets/udp-create-socket', {
        'create-udp-socket': (family: any) => createUdpSocket(family),
    });
    register('sockets/ip-name-lookup', {
        'resolve-addresses': (network: any, name: string) => resolveAddresses(network, name),
    });

    return result;
}
