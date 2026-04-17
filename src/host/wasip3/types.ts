// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * WASIp3 Host — Configuration types, allocation/size limits, and defaults.
 */

/** Host FS mount point (Node.js only). */
export interface MountConfig {
    /** Path on the host filesystem */
    hostPath: string;
    /** Path visible to the guest component */
    guestPath: string;
    /** If true, writes are rejected */
    readOnly?: boolean;
}

/** Networking limits and timeouts. */
export interface NetworkConfig {
    /** Maximum HTTP body size in bytes (request and response). Default: 2MB */
    maxHttpBodyBytes?: number;
    /** Maximum HTTP headers total size in bytes. Default: 200KB */
    maxHttpHeadersBytes?: number;
    /** Per-connection socket read buffer size in bytes. Default: 200KB */
    socketBufferBytes?: number;
    /** Maximum pending TCP connections (backlog). Default: 500 */
    maxTcpPendingConnections?: number;
    /** TCP idle timeout in milliseconds. Default: 120_000 (2 min) */
    tcpIdleTimeoutMs?: number;
    /** HTTP server request timeout in milliseconds. Default: 30_000 */
    httpRequestTimeoutMs?: number;
    /** Maximum queued UDP datagrams per socket. Default: 1_000 */
    maxUdpDatagrams?: number;
    /** DNS lookup timeout in milliseconds. Default: 5_000 */
    dnsTimeoutMs?: number;
    /** Maximum concurrent DNS lookups. Default: 100 */
    maxConcurrentDnsLookups?: number;
    /** Maximum concurrent HTTP connections. Default: 1_000 */
    maxHttpConnections?: number;
    /** Maximum request URL length in bytes. Default: 8_192 */
    maxRequestUrlBytes?: number;
    /** HTTP server headersTimeout in ms (Slowloris protection). Default: 60_000 */
    httpHeadersTimeoutMs?: number;
    /** HTTP server keepAliveTimeout in ms. Default: 5_000 */
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

/** Allocation and size limits. */
export interface AllocationLimits {
    /** Maximum single allocation size in bytes. Default: 16MB */
    maxAllocationSize?: number;
    /** Maximum number of live resource handles per table. Default: 10_000 */
    maxHandles?: number;
    /** Maximum filesystem path length in bytes. Default: 4_096 */
    maxPathLength?: number;
}

export const ALLOCATION_DEFAULTS = {
    maxAllocationSize: 16_777_216,
    maxHandles: 10_000,
    maxPathLength: 4_096,
} as const;

/** Configuration for `createHost()`. */
export interface WasiP3Config {
    /** Environment variables as [key, value] pairs */
    env?: [string, string][];
    /** Command-line arguments */
    args?: string[];
    /** Initial working directory */
    cwd?: string;
    /** Stdin as a web ReadableStream */
    stdin?: ReadableStream<Uint8Array>;
    /** Stdout as a web WritableStream */
    stdout?: WritableStream<Uint8Array>;
    /** Stderr as a web WritableStream */
    stderr?: WritableStream<Uint8Array>;
    /** In-memory VFS files: full unix paths → content (bytes or UTF-8 string) */
    fs?: Map<string, Uint8Array | string>;
    /** Host FS mount points (Node.js only) */
    mounts?: MountConfig[];
    /** Networking limits and timeouts */
    network?: NetworkConfig;
    /** Allocation and size limits */
    limits?: AllocationLimits;
    /**
     * WASI interface prefixes to enable (e.g. ['wasi:cli', 'wasi:http']).
     * Default: all interfaces enabled. When set, only matching prefixes are registered.
     */
    enabledInterfaces?: string[];
}
