// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * Internal (non-WASI-spec) types for the WASI Preview 2 host implementation.
 * WASI P2 API type declarations live in api.ts.
 */

import type {
    WasiEnvironment,
    WasiCliExit,
    WasiStdin,
    WasiStdout,
    WasiStderr,
    WasiTerminalInput,
    WasiTerminalOutput,
    WasiPreopens,
    WasiDescriptor,
    WasiResponseOutparam,
    WasiOutgoingResponse,
    HttpErrorCode,
    WasiNetwork,
} from './api';

// Re-export WasiExit and WasiDatetime from api.ts for backward compatibility
export { WasiExit } from './api';
export type { WasiDatetime } from './api';

// ─── Internal extended interfaces (not part of WASI spec) ───

/** @internal Extended WasiDescriptor with VFS node access */
export interface WasiDescriptorInternal extends WasiDescriptor {
    _node(): unknown;
}

/** @internal Extended WasiResponseOutparam with resolve callback */
export interface WasiResponseOutparamInternal extends WasiResponseOutparam {
    _resolve(response: { tag: 'ok'; val: WasiOutgoingResponse } | { tag: 'err'; val: HttpErrorCode }): void;
}

/** @internal Extended WasiNetwork with tag */
export interface WasiNetworkInternal extends WasiNetwork {
    _tag: string;
}

/** Networking configuration for HTTP, sockets, and DNS */
export interface NetworkConfig {
    /** Maximum HTTP body size in bytes (request and response). Default: 2MB (2_097_152) */
    maxHttpBodyBytes?: number;
    /** Maximum HTTP headers total size in bytes. Default: 200KB (204_800) */
    maxHttpHeadersBytes?: number;
    /** Per-connection socket read buffer size in bytes. Default: 200KB (204_800) */
    socketBufferBytes?: number;
    /** Maximum pending TCP connections (backlog). Default: 500. Overflows are dropped. */
    maxTcpPendingConnections?: number;
    /** TCP idle timeout in milliseconds. Connections idle longer are closed. Default: 120_000 (2 min) */
    tcpIdleTimeoutMs?: number;
    /** HTTP server request timeout in milliseconds. Default: 30_000 (30s) */
    httpRequestTimeoutMs?: number;
    /** Maximum queued UDP datagrams per socket. Default: 1_000 */
    maxUdpDatagrams?: number;
    /** DNS lookup timeout in milliseconds. Default: 5_000 */
    dnsTimeoutMs?: number;
    /** Maximum concurrent DNS lookups. Default: 100 */
    maxConcurrentDnsLookups?: number;
    /** Maximum concurrent HTTP connections to the server. Default: 1_000 */
    maxHttpConnections?: number;
    /** Maximum request URL length in bytes. Default: 8_192 */
    maxRequestUrlBytes?: number;
    /** Node.js HTTP server headersTimeout in ms (Slowloris protection). Default: 60_000 */
    httpHeadersTimeoutMs?: number;
    /** Node.js HTTP server keepAliveTimeout in ms. Default: 5_000 */
    httpKeepAliveTimeoutMs?: number;
}

export const NETWORK_DEFAULTS = {
    maxHttpBodyBytes: 2_097_152,
    maxHttpHeadersBytes: 204_800,
    socketBufferBytes: 204_800,
    maxTcpPendingConnections: 500,
    tcpIdleTimeoutMs: 120_000,
    httpRequestTimeoutMs: 30_000,
    maxUdpDatagrams: 1_000,
    dnsTimeoutMs: 5_000,
    maxConcurrentDnsLookups: 100,
    maxHttpConnections: 1_000,
    maxRequestUrlBytes: 8_192,
    httpHeadersTimeoutMs: 60_000,
    httpKeepAliveTimeoutMs: 5_000,
} as const;

/** Configuration for createWasiP2Host() */
export interface WasiConfig {
    /** Environment variables as [key, value] pairs */
    env?: [string, string][];
    /** Command-line arguments */
    args?: string[];
    /** Initial working directory */
    cwd?: string;
    /** Stdin content (bytes) */
    stdin?: Uint8Array;
    /** Stdout callback — called on flush. Default: console.log */
    stdout?: (bytes: Uint8Array) => void;
    /** Stderr callback — called on flush. Default: console.error */
    stderr?: (bytes: Uint8Array) => void;
    /** Virtual filesystem — full unix paths to file contents */
    fs?: Map<string, Uint8Array>;
    /**
     * Real filesystem mount points (Node.js only).
     * Each entry maps a host directory to a guest path.
     * Similar to wasmtime's --dir flag.
     *
     * @example
     * ```ts
     * mounts: [
     *   { hostPath: '.', guestPath: '/' },
     *   { hostPath: '/data', guestPath: '/mnt/data', readOnly: true },
     * ]
     * ```
     *
     * When mounts are specified, they take precedence over the `fs` VFS.
     */
    mounts?: Array<{ hostPath: string; guestPath: string; readOnly?: boolean }>;
    /** Networking limits and timeouts */
    network?: NetworkConfig;
    /**
     * WASI interface prefixes to enable (e.g. ['wasi:cli', 'wasi:http', 'wasi:sockets']).
     * Default: all interfaces enabled. When set, only matching prefixes are registered.
     */
    enabledInterfaces?: string[];
}

/** Opaque handle ID for WASI resources */
export type HandleId = number;

/** Minimal handle table for host-side resource tracking */
export interface HandleTable<T> {
    add(resource: T): HandleId;
    get(id: HandleId): T;
    remove(id: HandleId): T;
    has(id: HandleId): boolean;
}

/** Create a handle table for managing host-side resources */
export function createHandleTable<T>(): HandleTable<T> {
    let nextId = 1;
    const table = new Map<HandleId, T>();

    return {
        add(resource: T): HandleId {
            const id = nextId++;
            table.set(id, resource);
            return id;
        },
        get(id: HandleId): T {
            const resource = table.get(id);
            if (resource === undefined) {
                throw new Error(`Invalid handle: ${id}`);
            }
            return resource;
        },
        remove(id: HandleId): T {
            const resource = table.get(id);
            if (resource === undefined) {
                throw new Error(`Invalid handle: ${id}`);
            }
            table.delete(id);
            return resource;
        },
        has(id: HandleId): boolean {
            return table.has(id);
        },
    };
}

// ─── Aggregate / configuration types from other modules ───

/** Complete CLI host — all wasi:cli/* interfaces */
export interface WasiCli {
    environment: WasiEnvironment;
    exit: WasiCliExit;
    stdin: WasiStdin;
    stdout: WasiStdout;
    stderr: WasiStderr;
    terminalInput: WasiTerminalInput;
    terminalOutput: WasiTerminalOutput;
}

/** wasi:filesystem combined interface */
export interface WasiFilesystem {
    preopens: WasiPreopens;
    /** Open a root descriptor for the entire VFS */
    rootDescriptor(): WasiDescriptor;
}

/** A mount point mapping host path to guest path */
export interface FsMount {
    /** Host filesystem path (absolute or relative to cwd) */
    hostPath: string;
    /** Guest path visible to the WASM component */
    guestPath: string;
    /** Read-only mount. Default: false (read-write) */
    readOnly?: boolean;
}

/** Fetch function type — matches the browser fetch API signature */
export type FetchFn = (input: string | URL, init?: RequestInit) => Promise<Response>;

/** Configuration for the HTTP server */
export interface HttpServerConfig {
    /** Port to listen on. Default: 0 (auto-assign) */
    port?: number;
    /** Hostname to bind to. Default: '127.0.0.1' */
    hostname?: string;
    /** Networking limits. Merged with NETWORK_DEFAULTS. */
    network?: NetworkConfig;
}

/** HTTP server handle */
export interface WasiHttpServer {
    /** Start listening. Returns the actual port. */
    start(): Promise<number>;
    /** Stop the server gracefully */
    stop(): Promise<void>;
    /** The actual port the server is listening on (after start) */
    port(): number;
}
