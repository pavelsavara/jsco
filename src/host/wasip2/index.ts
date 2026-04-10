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
import { createWasiFilesystem } from './filesystem';
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

    const interfaces: Record<string, Record<string, Function>> = {
        // wasi:random/*
        'wasi:random/random': {
            'get-random-bytes': random.getRandomBytes,
            'get-random-u64': random.getRandomU64,
        },
        'wasi:random/insecure': {
            'get-insecure-random-bytes': insecure.getInsecureRandomBytes,
            'get-insecure-random-u64': insecure.getInsecureRandomU64,
        },
        'wasi:random/insecure-seed': {
            'insecure-seed': insecureSeed.insecureSeed,
        },

        // wasi:clocks/*
        'wasi:clocks/wall-clock': {
            'now': wallClock.now,
            'resolution': wallClock.resolution,
        },
        'wasi:clocks/monotonic-clock': {
            'now': monotonicClock.now,
            'resolution': monotonicClock.resolution,
            'subscribe-duration': monotonicClock.subscribeDuration,
            'subscribe-instant': monotonicClock.subscribeInstant,
        },

        // wasi:io/*
        'wasi:io/poll': {
            'poll': poll,
        },
        // wasi:io/error — resource methods dispatched on WasiError objects
        'wasi:io/error': {
            '[method]error.to-debug-string': (self: WasiError) => self.toDebugString(),
            '[resource-drop]error': (_self: WasiError) => { /* GC handles cleanup */ },
        },
        // wasi:io/streams — resource methods dispatched on stream objects
        'wasi:io/streams': {
            // InputStream methods
            '[method]input-stream.read': (self: WasiInputStream, len: bigint) => self.read(len),
            '[method]input-stream.blocking-read': (self: WasiInputStream, len: bigint) => self.blockingRead(len),
            '[method]input-stream.skip': (self: WasiInputStream, len: bigint) => self.skip(len),
            '[method]input-stream.blocking-skip': (self: WasiInputStream, len: bigint) => self.blockingSkip(len),
            '[method]input-stream.subscribe': (self: WasiInputStream) => self.subscribe(),
            '[resource-drop]input-stream': (_self: WasiInputStream) => { /* GC handles cleanup */ },
            // OutputStream methods
            '[method]output-stream.check-write': (self: WasiOutputStream) => self.checkWrite(),
            '[method]output-stream.write': (self: WasiOutputStream, contents: Uint8Array) => self.write(contents),
            '[method]output-stream.blocking-write-and-flush': (self: WasiOutputStream, contents: Uint8Array) => self.blockingWriteAndFlush(contents),
            '[method]output-stream.flush': (self: WasiOutputStream) => self.flush(),
            '[method]output-stream.blocking-flush': (self: WasiOutputStream) => self.blockingFlush(),
            '[method]output-stream.write-zeroes': (self: WasiOutputStream, len: bigint) => self.writeZeroes(len),
            '[method]output-stream.blocking-write-zeroes-and-flush': (self: WasiOutputStream, len: bigint) => self.blockingWriteZeroesAndFlush(len),
            '[method]output-stream.subscribe': (self: WasiOutputStream) => self.subscribe(),
            '[resource-drop]output-stream': (_self: WasiOutputStream) => { /* GC handles cleanup */ },
        },

        // wasi:cli/*
        'wasi:cli/environment': {
            'get-environment': cli.environment.getEnvironment,
            'get-arguments': cli.environment.getArguments,
            'initial-cwd': cli.environment.initialCwd,
        },
        'wasi:cli/exit': {
            'exit': cli.exit.exit,
        },
        'wasi:cli/stdin': {
            'get-stdin': cli.stdin.getStdin,
        },
        'wasi:cli/stdout': {
            'get-stdout': cli.stdout.getStdout,
        },
        'wasi:cli/stderr': {
            'get-stderr': cli.stderr.getStderr,
        },
        'wasi:cli/terminal-input': {
            'get-terminal-stdin': cli.terminalInput.getTerminalStdin,
        },
        'wasi:cli/terminal-stdout': {
            'get-terminal-stdout': cli.terminalOutput.getTerminalStdout,
        },
        'wasi:cli/terminal-stderr': {
            'get-terminal-stderr': cli.terminalOutput.getTerminalStderr,
        },

        // wasi:filesystem/*
        'wasi:filesystem/types': {
            // Filesystem operations are resource-method-based.
            // The component calls [method]descriptor.* on descriptor handles.
            // For now, expose the preopens-related functions.
        },
        'wasi:filesystem/preopens': {
            'get-directories': filesystem.preopens.getDirectories,
        },

        // wasi:http/*
        'wasi:http/outgoing-handler': {
            'handle': outgoingHandler.handle,
        },

        // wasi:sockets/* (all stubs)
        'wasi:sockets/instance-network': {
            'instance-network': instanceNetwork,
        },
        'wasi:sockets/tcp-create-socket': {
            'create-tcp-socket': (family: any) => createTcpSocket(family),
        },
        'wasi:sockets/udp-create-socket': {
            'create-udp-socket': (family: any) => createUdpSocket(family),
        },
        'wasi:sockets/ip-name-lookup': {
            'resolve-addresses': (network: any, name: string) => resolveAddresses(network, name),
        },
    };

    // Register versioned aliases — WASI components use versioned import names
    // like 'wasi:cli/stdin@0.2.0'. Register all known WASI preview 2 versions.
    const result: WasiHostImports = {};
    const versions = ['0.2.0', '0.2.1', '0.2.2', '0.2.3', '0.2.4', '0.2.5', '0.2.6', '0.2.7', '0.2.8', '0.2.9', '0.2.10', '0.2.11'];
    for (const [iface, methods] of Object.entries(interfaces)) {
        // Unversioned
        result[iface] = methods;
        // Versioned
        for (const version of versions) {
            result[`${iface}@${version}`] = methods;
        }
    }

    return result;
}
