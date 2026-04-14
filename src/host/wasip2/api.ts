// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * WASI Preview 2 API type declarations.
 *
 * All type-level declarations (interfaces, type aliases) that model the
 * WASI Preview 2 specification live in this file.
 */

// ─── wasi:io/error ───

/** wasi:io/error — error resource */
export interface WasiError {
    toDebugString(): string;
}

// ─── wasi:io/poll ───

/** wasi:io/poll — pollable resource */
export interface WasiPollable {
    /** Check if the pollable is ready (non-blocking) */
    ready(): boolean;
    /** Block until ready. Requires JSPI for async pollables. */
    block(): void;
}

/** Result of poll() — indices of ready pollables */
export type PollResult = Uint32Array;

// ─── wasi:io/streams ───

/** wasi:io/streams stream-error variant */
export type StreamError =
    | { tag: 'last-operation-failed'; val: WasiError }
    | { tag: 'closed' };

/** wasi:io/streams input-stream resource */
export interface WasiInputStream {
    /** Non-blocking read of up to len bytes */
    read(len: bigint): StreamResult<Uint8Array>;
    /** Block until data available, then read */
    blockingRead(len: bigint): StreamResult<Uint8Array>;
    /** Skip up to len bytes */
    skip(len: bigint): StreamResult<bigint>;
    /** Block until data available, then skip */
    blockingSkip(len: bigint): StreamResult<bigint>;
    /** Subscribe to readiness */
    subscribe(): WasiPollable;
}

/** wasi:io/streams output-stream resource */
export interface WasiOutputStream {
    /** Check how many bytes can be written without blocking */
    checkWrite(): StreamResult<bigint>;
    /** Write bytes (must call checkWrite first) */
    write(contents: Uint8Array): StreamResult<void>;
    /** Blocking write + flush */
    blockingWriteAndFlush(contents: Uint8Array): StreamResult<void>;
    /** Begin flushing — non-blocking */
    flush(): StreamResult<void>;
    /** Block until flush completes */
    blockingFlush(): StreamResult<void>;
    /** Write zero bytes */
    writeZeroes(len: bigint): StreamResult<void>;
    /** Blocking write zeroes + flush */
    blockingWriteZeroesAndFlush(len: bigint): StreamResult<void>;
    /** Subscribe to writability */
    subscribe(): WasiPollable;
}

/** Result type for stream operations */
export type StreamResult<T> =
    | { tag: 'ok'; val: T }
    | { tag: 'err'; val: StreamError };

// ─── wasi:clocks ───

/** WASI datetime record — used by wall-clock and filesystem */
export interface WasiDatetime {
    seconds: bigint;
    nanoseconds: number;
}

/** wasi:clocks/monotonic-clock — monotonic clock resource */
export interface WasiMonotonicClock {
    /** Current time in nanoseconds (monotonic, not wall-clock) */
    now(): bigint;
    /** Clock resolution in nanoseconds */
    resolution(): bigint;
    /** Subscribe for a duration (nanoseconds from now). Returns a pollable. */
    subscribeDuration(nanos: bigint): WasiPollable;
    /** Subscribe until an absolute instant (nanoseconds since clock epoch). Returns a pollable. */
    subscribeInstant(instant: bigint): WasiPollable;
}

/** wasi:clocks/wall-clock */
export interface WasiWallClock {
    now(): WasiDatetime;
    resolution(): WasiDatetime;
}

// ─── wasi:random ───

/** wasi:random/random */
export interface WasiRandom {
    getRandomBytes(len: bigint): Uint8Array;
    getRandomU64(): bigint;
}

/** wasi:random/insecure */
export interface WasiRandomInsecure {
    getInsecureRandomBytes(len: bigint): Uint8Array;
    getInsecureRandomU64(): bigint;
}

/** wasi:random/insecure-seed */
export interface WasiRandomInsecureSeed {
    insecureSeed(): [bigint, bigint];
}

// ─── wasi:cli ───

/** Thrown by wasi:cli/exit to signal process termination */
export class WasiExit extends Error {
    constructor(public readonly status: number) {
        super(`WASI exit with status ${status}`);
        this.name = 'WasiExit';
    }
}

/** wasi:cli/environment interface */
export interface WasiEnvironment {
    /** Returns environment variables as [key, value] pairs */
    getEnvironment(): [string, string][];
    /** Returns command-line arguments */
    getArguments(): string[];
    /** Returns initial working directory, or undefined if not set */
    initialCwd(): string | undefined;
}

/** wasi:cli/exit interface */
export interface WasiCliExit {
    /** Exit with a result. Throws WasiExit. */
    exit(status: { tag: 'ok' } | { tag: 'err' }): never;
}

/** wasi:cli/stdin interface */
export interface WasiStdin {
    getStdin(): WasiInputStream;
}

/** wasi:cli/stdout interface */
export interface WasiStdout {
    getStdout(): WasiOutputStream;
}

/** wasi:cli/stderr interface */
export interface WasiStderr {
    getStderr(): WasiOutputStream;
}

/** wasi:cli/terminal-input interface */
export interface WasiTerminalInput {
    getTerminalStdin(): undefined;
}

/** wasi:cli/terminal-output interface */
export interface WasiTerminalOutput {
    getTerminalStdout(): undefined;
    getTerminalStderr(): undefined;
}

// ─── wasi:filesystem ───

/** wasi:filesystem/types error-code enum — 36 variants */
export type ErrorCode =
    | 'access'
    | 'bad-descriptor'
    | 'busy'
    | 'deadlock'
    | 'quota'
    | 'exist'
    | 'file-too-large'
    | 'illegal-byte-sequence'
    | 'in-progress'
    | 'interrupted'
    | 'invalid'
    | 'io'
    | 'is-directory'
    | 'loop'
    | 'too-many-links'
    | 'message-size'
    | 'name-too-long'
    | 'no-device'
    | 'no-entry'
    | 'no-lock'
    | 'insufficient-memory'
    | 'insufficient-space'
    | 'not-directory'
    | 'not-empty'
    | 'not-recoverable'
    | 'unsupported'
    | 'no-tty'
    | 'no-such-device'
    | 'overflow'
    | 'not-permitted'
    | 'pipe'
    | 'read-only'
    | 'invalid-seek'
    | 'text-file-busy'
    | 'cross-device'
    | 'other';

/** wasi:filesystem/types descriptor-type */
export type DescriptorType =
    | 'unknown'
    | 'block-device'
    | 'character-device'
    | 'directory'
    | 'fifo'
    | 'symbolic-link'
    | 'regular-file'
    | 'socket';

/** wasi:filesystem/types descriptor-flags */
export interface DescriptorFlags {
    read?: boolean;
    write?: boolean;
    fileIntegritySync?: boolean;
    dataIntegritySync?: boolean;
    mutateDirectory?: boolean;
}

/** wasi:filesystem/types path-flags */
export interface PathFlags {
    symlinkFollow?: boolean;
}

/** wasi:filesystem/types open-flags */
export interface OpenFlags {
    create?: boolean;
    directory?: boolean;
    exclusive?: boolean;
    truncate?: boolean;
}

/** wasi:filesystem/types descriptor-stat */
export interface DescriptorStat {
    type: DescriptorType;
    linkCount: bigint;
    size: bigint;
    dataAccessTimestamp?: WasiDatetime;
    dataModificationTimestamp?: WasiDatetime;
    statusChangeTimestamp?: WasiDatetime;
}

/** wasi:filesystem/types directory-entry */
export interface DirectoryEntry {
    type: DescriptorType;
    name: string;
}

/** wasi:filesystem/types metadata-hash-value */
export interface MetadataHashValue {
    upper: bigint;
    lower: bigint;
}

/** Result type for filesystem operations */
export type FsResult<T> = { tag: 'ok'; val: T } | { tag: 'err'; val: ErrorCode };

/** wasi:filesystem/types directory-entry-stream resource */
export interface WasiDirectoryEntryStream {
    /** Read the next directory entry, or undefined if exhausted */
    readDirectoryEntry(): FsResult<DirectoryEntry | undefined>;
}

/** wasi:filesystem/types descriptor resource */
export interface WasiDescriptor {
    /** Read via stream at offset */
    readViaStream(offset: bigint): FsResult<WasiInputStream>;
    /** Write via stream at offset */
    writeViaStream(offset: bigint): FsResult<WasiOutputStream>;
    /** Append via stream */
    appendViaStream(): FsResult<WasiOutputStream>;
    /** Get descriptor flags */
    getFlags(): FsResult<DescriptorFlags>;
    /** Get descriptor type */
    getType(): FsResult<DescriptorType>;
    /** Set file size */
    setSize(size: bigint): FsResult<void>;
    /** Read from file at offset */
    read(length: bigint, offset: bigint): FsResult<[Uint8Array, boolean]>;
    /** Write to file at offset */
    write(buffer: Uint8Array, offset: bigint): FsResult<bigint>;
    /** Read directory entries */
    readDirectory(): FsResult<WasiDirectoryEntryStream>;
    /** Sync data to storage (no-op in memory VFS) */
    syncData(): FsResult<void>;
    /** Sync metadata + data (no-op) */
    sync(): FsResult<void>;
    /** Get stat */
    stat(): FsResult<DescriptorStat>;
    /** Stat a path relative to this descriptor */
    statAt(_pathFlags: PathFlags, path: string): FsResult<DescriptorStat>;
    /** Create a directory at path */
    createDirectoryAt(path: string): FsResult<void>;
    /** Open a file/directory at path */
    openAt(pathFlags: PathFlags, path: string, openFlags: OpenFlags, descriptorFlags: DescriptorFlags): FsResult<WasiDescriptor>;
    /** Remove a directory at path */
    removeDirectoryAt(path: string): FsResult<void>;
    /** Unlink a file at path */
    unlinkFileAt(path: string): FsResult<void>;
    /** Rename from old-path to new-path (within same descriptor) */
    renameAt(oldPath: string, newDescriptor: WasiDescriptor, newPath: string): FsResult<void>;
    /** Read a symlink (unsupported) */
    readlinkAt(path: string): FsResult<string>;
    /** Create a symlink (unsupported) */
    symlinkAt(oldPath: string, newPath: string): FsResult<void>;
    /** Link (unsupported) */
    linkAt(oldPathFlags: PathFlags, oldPath: string, newDescriptor: WasiDescriptor, newPath: string): FsResult<void>;
    /** Set times on a path */
    setTimesAt(pathFlags: PathFlags, path: string, atime: WasiDatetime | undefined, mtime: WasiDatetime | undefined): FsResult<void>;
    /** Check if two descriptors refer to the same node */
    isSameObject(other: WasiDescriptor): boolean;
    /** Metadata hash */
    metadataHash(): FsResult<MetadataHashValue>;
    /** Metadata hash at path */
    metadataHashAt(pathFlags: PathFlags, path: string): FsResult<MetadataHashValue>;
    /** Advise the implementation about access patterns (no-op) */
    advise(offset: bigint, length: bigint, advice: string): FsResult<void>;
    /** Set times on this descriptor */
    setTimes(atime: WasiDatetime | undefined, mtime: WasiDatetime | undefined): FsResult<void>;
    /** @internal Get the underlying VFS node */
    _node(): unknown;
}

/** wasi:filesystem/preopens — returns list of (descriptor, path) pairs */
export interface WasiPreopens {
    getDirectories(): [WasiDescriptor, string][];
}

// ─── wasi:http ───

/** wasi:http/types method variant */
export type HttpMethod =
    | { tag: 'get' }
    | { tag: 'head' }
    | { tag: 'post' }
    | { tag: 'put' }
    | { tag: 'delete' }
    | { tag: 'connect' }
    | { tag: 'options' }
    | { tag: 'trace' }
    | { tag: 'patch' }
    | { tag: 'other'; val: string };

/** wasi:http/types scheme variant */
export type HttpScheme =
    | { tag: 'HTTP' }
    | { tag: 'HTTPS' }
    | { tag: 'other'; val: string };

/** wasi:http/types error-code variant (subset of 30+ cases) */
export type HttpErrorCode =
    | { tag: 'DNS-timeout' }
    | { tag: 'DNS-error'; val?: { rcode?: string; infoCode?: number } }
    | { tag: 'destination-not-found' }
    | { tag: 'destination-unavailable' }
    | { tag: 'connection-refused' }
    | { tag: 'connection-terminated' }
    | { tag: 'connection-timeout' }
    | { tag: 'TLS-protocol-error' }
    | { tag: 'TLS-alert-received'; val?: { alertId?: number; alertMessage?: string } }
    | { tag: 'HTTP-request-denied' }
    | { tag: 'HTTP-request-body-size'; val?: bigint }
    | { tag: 'HTTP-request-method-invalid' }
    | { tag: 'HTTP-request-URI-invalid' }
    | { tag: 'HTTP-request-header-section-size'; val?: number }
    | { tag: 'HTTP-request-header-size'; val?: { fieldName?: string; fieldSize?: number } }
    | { tag: 'HTTP-response-incomplete' }
    | { tag: 'HTTP-response-header-section-size'; val?: number }
    | { tag: 'HTTP-response-header-size'; val?: { fieldName?: string; fieldSize?: number } }
    | { tag: 'HTTP-response-body-size'; val?: bigint }
    | { tag: 'HTTP-response-transfer-coding'; val?: string }
    | { tag: 'HTTP-response-content-coding'; val?: string }
    | { tag: 'size-exceeded'; val?: string }
    | { tag: 'internal-error'; val?: string };

/** wasi:http/types header-error */
export type HeaderError =
    | { tag: 'invalid-syntax' }
    | { tag: 'forbidden' }
    | { tag: 'immutable' };

/** Result type for HTTP operations */
export type HttpResult<T> = { tag: 'ok'; val: T } | { tag: 'err'; val: HttpErrorCode };

/** wasi:http/types fields resource — HTTP headers/trailers */
export interface WasiFields {
    /** Get all values for a header name */
    get(name: string): Uint8Array[];
    /** Check if a header exists */
    has(name: string): boolean;
    /** Set all values for a header name */
    set(name: string, values: Uint8Array[]): { tag: 'ok' } | { tag: 'err'; val: HeaderError };
    /** Append a value to a header */
    append(name: string, value: Uint8Array): { tag: 'ok' } | { tag: 'err'; val: HeaderError };
    /** Delete a header */
    delete(name: string): { tag: 'ok' } | { tag: 'err'; val: HeaderError };
    /** Get all entries */
    entries(): [string, Uint8Array][];
    /** Clone this fields resource */
    clone(): WasiFields;
}

/** wasi:http/types outgoing-request resource */
export interface WasiOutgoingRequest {
    /** Get the HTTP method */
    method(): HttpMethod;
    /** Set the HTTP method */
    setMethod(method: HttpMethod): boolean;
    /** Get path with query */
    pathWithQuery(): string | undefined;
    /** Set path with query */
    setPathWithQuery(path: string | undefined): boolean;
    /** Get scheme */
    scheme(): HttpScheme | undefined;
    /** Set scheme */
    setScheme(scheme: HttpScheme | undefined): boolean;
    /** Get authority (host:port) */
    authority(): string | undefined;
    /** Set authority */
    setAuthority(authority: string | undefined): boolean;
    /** Get headers */
    headers(): WasiFields;
    /** Get body (only once) */
    body(): HttpResult<WasiOutgoingBody>;
}

/** wasi:http/types outgoing-body resource */
export interface WasiOutgoingBody {
    /** Get the output stream (only once) */
    write(): HttpResult<WasiOutputStream>;
}

/** wasi:http/types request-options resource */
export interface WasiRequestOptions {
    /** Connect timeout in nanoseconds */
    connectTimeout(): bigint | undefined;
    setConnectTimeout(timeout: bigint | undefined): boolean;
    /** First byte timeout in nanoseconds */
    firstByteTimeout(): bigint | undefined;
    setFirstByteTimeout(timeout: bigint | undefined): boolean;
    /** Between bytes timeout in nanoseconds */
    betweenBytesTimeout(): bigint | undefined;
    setBetweenBytesTimeout(timeout: bigint | undefined): boolean;
}

/** wasi:http/types incoming-response resource */
export interface WasiIncomingResponse {
    /** HTTP status code */
    status(): number;
    /** Response headers */
    headers(): WasiFields;
    /** Consume the body (only once) */
    consume(): HttpResult<WasiIncomingBody>;
}

/** wasi:http/types incoming-body resource */
export interface WasiIncomingBody {
    /** Get the input stream (only once) */
    stream(): HttpResult<WasiInputStream>;
}

/** wasi:http/types future-incoming-response resource */
export interface WasiFutureIncomingResponse {
    /** Subscribe for readiness */
    subscribe(): WasiPollable;
    /** Get the response (returns undefined if not ready yet) */
    get(): HttpResult<WasiIncomingResponse> | undefined;
}

/** wasi:http/outgoing-handler interface */
export interface WasiOutgoingHandler {
    /** Send an outgoing request, get a future response */
    handle(request: WasiOutgoingRequest, options?: WasiRequestOptions): HttpResult<WasiFutureIncomingResponse>;
}

/** wasi:http/types incoming-request resource */
export interface WasiIncomingRequest {
    method(): HttpMethod;
    pathWithQuery(): string | undefined;
    scheme(): HttpScheme | undefined;
    authority(): string | undefined;
    headers(): WasiFields;
    consume(): HttpResult<WasiIncomingBody>;
}

/** wasi:http/types outgoing-response resource */
export interface WasiOutgoingResponse {
    statusCode(): number;
    setStatusCode(code: number): boolean;
    headers(): WasiFields;
    body(): HttpResult<WasiOutgoingBody>;
}

/** wasi:http/types response-outparam resource */
export interface WasiResponseOutparam {
    /** Set the response or error. Consumes the outparam. */
    _resolve: (response: { tag: 'ok'; val: WasiOutgoingResponse } | { tag: 'err'; val: HttpErrorCode }) => void;
}

/** Handler function type matching wasi:http/incoming-handler.handle */
export type IncomingHandlerFn = (request: WasiIncomingRequest, responseOut: WasiResponseOutparam) => void;

/** wasi:http/types future-trailers resource */
export interface WasiFutureTrailers {
    subscribe(): WasiPollable;
    get(): { tag: 'ok'; val: { tag: 'ok'; val: WasiFields | undefined } } | { tag: 'err'; val: string } | undefined;
}

// ─── wasi:sockets ───

/** wasi:sockets/network error-code (string form matching WIT enum) */
export type SocketErrorCode =
    | 'unknown'
    | 'access-denied'
    | 'not-supported'
    | 'invalid-argument'
    | 'out-of-memory'
    | 'timeout'
    | 'concurrency-conflict'
    | 'not-in-progress'
    | 'would-block'
    | 'invalid-state'
    | 'new-socket-limit'
    | 'address-not-bindable'
    | 'address-in-use'
    | 'remote-unreachable'
    | 'connection-refused'
    | 'connection-reset'
    | 'connection-aborted'
    | 'datagram-too-large'
    | 'name-unresolvable'
    | 'temporary-resolver-failure'
    | 'permanent-resolver-failure';

/** wasi:sockets/network ip-address-family */
export type IpAddressFamily = 'ipv4' | 'ipv6';

/** wasi:sockets/network ip-address variant */
export type IpAddress =
    | { tag: 'ipv4'; val: [number, number, number, number] }
    | { tag: 'ipv6'; val: [number, number, number, number, number, number, number, number] };

/** wasi:sockets/network ip-socket-address variant */
export type IpSocketAddress =
    | { tag: 'ipv4'; val: { port: number; address: [number, number, number, number] } }
    | { tag: 'ipv6'; val: { port: number; flowInfo: number; address: [number, number, number, number, number, number, number, number]; scopeId: number } };

/** Socket result type */
export type SocketResult<T> = { tag: 'ok'; val: T } | { tag: 'err'; val: SocketErrorCode };

/** wasi:sockets/network — opaque network resource */
export interface WasiNetwork {
    _tag: 'network';
}

/** wasi:sockets/tcp — TCP socket resource */
export interface WasiTcpSocket {
    startBind(network: WasiNetwork, localAddress: IpSocketAddress): SocketResult<void>;
    finishBind(): SocketResult<void>;
    startConnect(network: WasiNetwork, remoteAddress: IpSocketAddress): SocketResult<void>;
    finishConnect(): SocketResult<[WasiInputStream, WasiOutputStream]>;
    startListen(): SocketResult<void>;
    finishListen(): SocketResult<void>;
    accept(): SocketResult<[WasiTcpSocket, WasiInputStream, WasiOutputStream]>;
    localAddress(): SocketResult<IpSocketAddress>;
    remoteAddress(): SocketResult<IpSocketAddress>;
    isListening(): boolean;
    addressFamily(): IpAddressFamily;
    setListenBacklogSize(value: bigint): SocketResult<void>;
    keepAliveEnabled(): SocketResult<boolean>;
    setKeepAliveEnabled(value: boolean): SocketResult<void>;
    keepAliveIdleTime(): SocketResult<bigint>;
    setKeepAliveIdleTime(value: bigint): SocketResult<void>;
    keepAliveInterval(): SocketResult<bigint>;
    setKeepAliveInterval(value: bigint): SocketResult<void>;
    keepAliveCount(): SocketResult<number>;
    setKeepAliveCount(value: number): SocketResult<void>;
    hopLimit(): SocketResult<number>;
    setHopLimit(value: number): SocketResult<void>;
    receiveBufferSize(): SocketResult<bigint>;
    setReceiveBufferSize(value: bigint): SocketResult<void>;
    sendBufferSize(): SocketResult<bigint>;
    setSendBufferSize(value: bigint): SocketResult<void>;
    subscribe(): WasiPollable;
    shutdown(shutdownType: string): SocketResult<void>;
}

/** Incoming datagram record */
export interface IncomingDatagram {
    data: Uint8Array;
    remoteAddress: IpSocketAddress;
}

/** Outgoing datagram record */
export interface OutgoingDatagram {
    data: Uint8Array;
    remoteAddress?: IpSocketAddress;
}

/** wasi:sockets/udp incoming-datagram-stream resource */
export interface WasiIncomingDatagramStream {
    receive(maxResults: bigint): SocketResult<IncomingDatagram[]>;
    subscribe(): WasiPollable;
}

/** wasi:sockets/udp outgoing-datagram-stream resource */
export interface WasiOutgoingDatagramStream {
    checkSend(): SocketResult<bigint>;
    send(datagrams: OutgoingDatagram[]): SocketResult<bigint>;
    subscribe(): WasiPollable;
}

/** wasi:sockets/udp — UDP socket resource */
export interface WasiUdpSocket {
    startBind(network: WasiNetwork, localAddress: IpSocketAddress): SocketResult<void>;
    finishBind(): SocketResult<void>;
    stream(remoteAddress: IpSocketAddress | undefined): SocketResult<[WasiIncomingDatagramStream, WasiOutgoingDatagramStream]>;
    localAddress(): SocketResult<IpSocketAddress>;
    remoteAddress(): SocketResult<IpSocketAddress>;
    addressFamily(): IpAddressFamily;
    unicastHopLimit(): SocketResult<number>;
    setUnicastHopLimit(value: number): SocketResult<void>;
    receiveBufferSize(): SocketResult<bigint>;
    setReceiveBufferSize(value: bigint): SocketResult<void>;
    sendBufferSize(): SocketResult<bigint>;
    setSendBufferSize(value: bigint): SocketResult<void>;
    subscribe(): WasiPollable;
}

/** wasi:sockets/ip-name-lookup — resolve-address-stream resource */
export interface WasiResolveAddressStream {
    resolveNextAddress(): SocketResult<IpAddress | undefined>;
    subscribe(): WasiPollable;
}

// ─── WASI P2 host export types ───

/**
 * Per-interface method maps for all WASI P2 host interfaces.
 * Keys are canonical ABI method names (kebab-case with [method], [constructor],
 * [static], [resource-drop] prefixes for resource operations).
 */
export interface WasiP2Interfaces {
    // ─── wasi:random ───
    'wasi:random/random': {
        'get-random-bytes': (len: bigint) => Uint8Array;
        'get-random-u64': () => bigint;
    };
    'wasi:random/insecure': {
        'get-insecure-random-bytes': (len: bigint) => Uint8Array;
        'get-insecure-random-u64': () => bigint;
    };
    'wasi:random/insecure-seed': {
        'insecure-seed': () => [bigint, bigint];
    };

    // ─── wasi:clocks ───
    'wasi:clocks/wall-clock': {
        'now': () => WasiDatetime;
        'resolution': () => WasiDatetime;
    };
    'wasi:clocks/monotonic-clock': {
        'now': () => bigint;
        'resolution': () => bigint;
        'subscribe-duration': (nanos: bigint) => WasiPollable;
        'subscribe-instant': (instant: bigint) => WasiPollable;
    };

    // ─── wasi:io ───
    'wasi:io/poll': {
        'poll': (pollables: WasiPollable[]) => PollResult;
    };
    'wasi:io/error': {
        '[method]error.to-debug-string': (self: WasiError) => string;
        '[resource-drop]error': (self: WasiError) => void;
    };
    'wasi:io/streams': {
        // input-stream
        '[method]input-stream.read': (self: WasiInputStream, len: bigint) => StreamResult<Uint8Array>;
        '[method]input-stream.blocking-read': (self: WasiInputStream, len: bigint) => StreamResult<Uint8Array>;
        '[method]input-stream.skip': (self: WasiInputStream, len: bigint) => StreamResult<bigint>;
        '[method]input-stream.blocking-skip': (self: WasiInputStream, len: bigint) => StreamResult<bigint>;
        '[method]input-stream.subscribe': (self: WasiInputStream) => WasiPollable;
        '[resource-drop]input-stream': (self: WasiInputStream) => void;
        // output-stream
        '[method]output-stream.check-write': (self: WasiOutputStream) => StreamResult<bigint>;
        '[method]output-stream.write': (self: WasiOutputStream, contents: Uint8Array) => StreamResult<void>;
        '[method]output-stream.blocking-write-and-flush': (self: WasiOutputStream, contents: Uint8Array) => StreamResult<void>;
        '[method]output-stream.flush': (self: WasiOutputStream) => StreamResult<void>;
        '[method]output-stream.blocking-flush': (self: WasiOutputStream) => StreamResult<void>;
        '[method]output-stream.write-zeroes': (self: WasiOutputStream, len: bigint) => StreamResult<void>;
        '[method]output-stream.blocking-write-zeroes-and-flush': (self: WasiOutputStream, len: bigint) => StreamResult<void>;
        '[method]output-stream.subscribe': (self: WasiOutputStream) => WasiPollable;
        '[resource-drop]output-stream': (self: WasiOutputStream) => void;
    };

    // ─── wasi:cli ───
    'wasi:cli/environment': {
        'get-environment': () => [string, string][];
        'get-arguments': () => string[];
        'initial-cwd': () => string | undefined;
    };
    'wasi:cli/exit': {
        'exit': (status: { tag: 'ok' } | { tag: 'err' }) => never;
    };
    'wasi:cli/stdin': {
        'get-stdin': () => WasiInputStream;
    };
    'wasi:cli/stdout': {
        'get-stdout': () => WasiOutputStream;
    };
    'wasi:cli/stderr': {
        'get-stderr': () => WasiOutputStream;
    };
    'wasi:cli/terminal-input': {
        'get-terminal-stdin': () => undefined;
    };
    'wasi:cli/terminal-stdout': {
        'get-terminal-stdout': () => undefined;
    };
    'wasi:cli/terminal-stderr': {
        'get-terminal-stderr': () => undefined;
    };

    // ─── wasi:filesystem ───
    'wasi:filesystem/types': {
        'filesystem-error-code': (err: WasiError) => ErrorCode | undefined;
        '[resource-drop]descriptor': (self: WasiDescriptor) => void;
        '[method]descriptor.read-via-stream': (self: WasiDescriptor, offset: bigint) => FsResult<WasiInputStream>;
        '[method]descriptor.write-via-stream': (self: WasiDescriptor, offset: bigint) => FsResult<WasiOutputStream>;
        '[method]descriptor.append-via-stream': (self: WasiDescriptor) => FsResult<WasiOutputStream>;
        '[method]descriptor.get-type': (self: WasiDescriptor) => FsResult<DescriptorType>;
        '[method]descriptor.stat': (self: WasiDescriptor) => FsResult<DescriptorStat>;
        '[method]descriptor.stat-at': (self: WasiDescriptor, pathFlags: PathFlags, path: string) => FsResult<DescriptorStat>;
        '[method]descriptor.open-at': (self: WasiDescriptor, pathFlags: PathFlags, path: string, openFlags: OpenFlags, descFlags: DescriptorFlags) => FsResult<WasiDescriptor>;
        '[method]descriptor.read-directory': (self: WasiDescriptor) => FsResult<WasiDirectoryEntryStream>;
        '[method]descriptor.create-directory-at': (self: WasiDescriptor, path: string) => FsResult<void>;
        '[method]descriptor.remove-directory-at': (self: WasiDescriptor, path: string) => FsResult<void>;
        '[method]descriptor.unlink-file-at': (self: WasiDescriptor, path: string) => FsResult<void>;
        '[method]descriptor.read': (self: WasiDescriptor, length: bigint, offset: bigint) => FsResult<[Uint8Array, boolean]>;
        '[method]descriptor.write': (self: WasiDescriptor, buffer: Uint8Array, offset: bigint) => FsResult<bigint>;
        '[method]descriptor.get-flags': (self: WasiDescriptor) => FsResult<DescriptorFlags>;
        '[method]descriptor.set-size': (self: WasiDescriptor, size: bigint) => FsResult<void>;
        '[method]descriptor.sync': (self: WasiDescriptor) => FsResult<void>;
        '[method]descriptor.sync-data': (self: WasiDescriptor) => FsResult<void>;
        '[method]descriptor.metadata-hash': (self: WasiDescriptor) => FsResult<MetadataHashValue>;
        '[method]descriptor.metadata-hash-at': (self: WasiDescriptor, pathFlags: PathFlags, path: string) => FsResult<MetadataHashValue>;
        '[method]descriptor.rename-at': (self: WasiDescriptor, oldPath: string, newDesc: WasiDescriptor, newPath: string) => FsResult<void>;
        '[method]descriptor.set-times': (self: WasiDescriptor, atime: WasiDatetime | undefined, mtime: WasiDatetime | undefined) => FsResult<void>;
        '[method]descriptor.set-times-at': (self: WasiDescriptor, pathFlags: PathFlags, path: string, atime: WasiDatetime | undefined, mtime: WasiDatetime | undefined) => FsResult<void>;
        '[method]descriptor.is-same-object': (self: WasiDescriptor, other: WasiDescriptor) => boolean;
        '[method]descriptor.advise': (self: WasiDescriptor, offset: bigint, length: bigint, advice: string) => FsResult<void>;
        '[resource-drop]directory-entry-stream': (self: WasiDirectoryEntryStream) => void;
        '[method]directory-entry-stream.read-directory-entry': (self: WasiDirectoryEntryStream) => FsResult<DirectoryEntry | undefined>;
    };
    'wasi:filesystem/preopens': {
        'get-directories': () => [WasiDescriptor, string][];
    };

    // ─── wasi:http ───
    'wasi:http/types': {
        // fields
        '[constructor]fields': () => WasiFields;
        '[static]fields.from-list': (entries: [string, Uint8Array][]) => WasiFields;
        '[resource-drop]fields': (self: WasiFields) => void;
        '[method]fields.get': (self: WasiFields, name: string) => Uint8Array[];
        '[method]fields.has': (self: WasiFields, name: string) => boolean;
        '[method]fields.set': (self: WasiFields, name: string, values: Uint8Array[]) => { tag: 'ok' } | { tag: 'err'; val: HeaderError };
        '[method]fields.append': (self: WasiFields, name: string, value: Uint8Array) => { tag: 'ok' } | { tag: 'err'; val: HeaderError };
        '[method]fields.delete': (self: WasiFields, name: string) => { tag: 'ok' } | { tag: 'err'; val: HeaderError };
        '[method]fields.entries': (self: WasiFields) => [string, Uint8Array][];
        '[method]fields.clone': (self: WasiFields) => WasiFields;
        // outgoing-request
        '[constructor]outgoing-request': (headers: WasiFields) => WasiOutgoingRequest;
        '[resource-drop]outgoing-request': (self: WasiOutgoingRequest) => void;
        '[method]outgoing-request.method': (self: WasiOutgoingRequest) => HttpMethod;
        '[method]outgoing-request.set-method': (self: WasiOutgoingRequest, method: HttpMethod) => boolean;
        '[method]outgoing-request.path-with-query': (self: WasiOutgoingRequest) => string | undefined;
        '[method]outgoing-request.set-path-with-query': (self: WasiOutgoingRequest, path: string | undefined) => boolean;
        '[method]outgoing-request.scheme': (self: WasiOutgoingRequest) => HttpScheme | undefined;
        '[method]outgoing-request.set-scheme': (self: WasiOutgoingRequest, scheme: HttpScheme | undefined) => boolean;
        '[method]outgoing-request.authority': (self: WasiOutgoingRequest) => string | undefined;
        '[method]outgoing-request.set-authority': (self: WasiOutgoingRequest, authority: string | undefined) => boolean;
        '[method]outgoing-request.headers': (self: WasiOutgoingRequest) => WasiFields;
        '[method]outgoing-request.body': (self: WasiOutgoingRequest) => HttpResult<WasiOutgoingBody>;
        // outgoing-body
        '[resource-drop]outgoing-body': (self: WasiOutgoingBody) => void;
        '[method]outgoing-body.write': (self: WasiOutgoingBody) => HttpResult<WasiOutputStream>;
        // request-options
        '[constructor]request-options': () => WasiRequestOptions;
        '[resource-drop]request-options': (self: WasiRequestOptions) => void;
        '[method]request-options.connect-timeout': (self: WasiRequestOptions) => bigint | undefined;
        '[method]request-options.set-connect-timeout': (self: WasiRequestOptions, timeout: bigint | undefined) => boolean;
        '[method]request-options.first-byte-timeout': (self: WasiRequestOptions) => bigint | undefined;
        '[method]request-options.set-first-byte-timeout': (self: WasiRequestOptions, timeout: bigint | undefined) => boolean;
        '[method]request-options.between-bytes-timeout': (self: WasiRequestOptions) => bigint | undefined;
        '[method]request-options.set-between-bytes-timeout': (self: WasiRequestOptions, timeout: bigint | undefined) => boolean;
        // incoming-response
        '[resource-drop]incoming-response': (self: WasiIncomingResponse) => void;
        '[method]incoming-response.status': (self: WasiIncomingResponse) => number;
        '[method]incoming-response.headers': (self: WasiIncomingResponse) => WasiFields;
        '[method]incoming-response.consume': (self: WasiIncomingResponse) => HttpResult<WasiIncomingBody>;
        // incoming-body
        '[resource-drop]incoming-body': (self: WasiIncomingBody) => void;
        '[method]incoming-body.stream': (self: WasiIncomingBody) => HttpResult<WasiInputStream>;
        // future-incoming-response
        '[resource-drop]future-incoming-response': (self: WasiFutureIncomingResponse) => void;
        '[method]future-incoming-response.subscribe': (self: WasiFutureIncomingResponse) => WasiPollable;
        '[method]future-incoming-response.get': (self: WasiFutureIncomingResponse) => HttpResult<WasiIncomingResponse> | undefined;
        // error-code helper
        'http-error-code': (err: WasiError) => HttpErrorCode | undefined;
    };
    'wasi:http/outgoing-handler': {
        'handle': (request: WasiOutgoingRequest, options?: WasiRequestOptions) => HttpResult<WasiFutureIncomingResponse>;
    };

    // ─── wasi:sockets ───
    'wasi:sockets/instance-network': {
        'instance-network': () => WasiNetwork;
    };
    'wasi:sockets/network': {
        '[resource-drop]network': (self: WasiNetwork) => void;
    };
    'wasi:sockets/tcp-create-socket': {
        'create-tcp-socket': (family: IpAddressFamily) => WasiTcpSocket;
    };
    'wasi:sockets/tcp': {
        '[resource-drop]tcp-socket': (self: WasiTcpSocket) => void;
        '[method]tcp-socket.start-bind': (self: WasiTcpSocket, network: WasiNetwork, localAddress: IpSocketAddress) => SocketResult<void>;
        '[method]tcp-socket.finish-bind': (self: WasiTcpSocket) => SocketResult<void>;
        '[method]tcp-socket.start-connect': (self: WasiTcpSocket, network: WasiNetwork, remoteAddress: IpSocketAddress) => SocketResult<void>;
        '[method]tcp-socket.finish-connect': (self: WasiTcpSocket) => SocketResult<[WasiInputStream, WasiOutputStream]>;
        '[method]tcp-socket.start-listen': (self: WasiTcpSocket) => SocketResult<void>;
        '[method]tcp-socket.finish-listen': (self: WasiTcpSocket) => SocketResult<void>;
        '[method]tcp-socket.accept': (self: WasiTcpSocket) => SocketResult<[WasiTcpSocket, WasiInputStream, WasiOutputStream]>;
        '[method]tcp-socket.local-address': (self: WasiTcpSocket) => SocketResult<IpSocketAddress>;
        '[method]tcp-socket.remote-address': (self: WasiTcpSocket) => SocketResult<IpSocketAddress>;
        '[method]tcp-socket.is-listening': (self: WasiTcpSocket) => boolean;
        '[method]tcp-socket.address-family': (self: WasiTcpSocket) => IpAddressFamily;
        '[method]tcp-socket.set-listen-backlog-size': (self: WasiTcpSocket, value: bigint) => SocketResult<void>;
        '[method]tcp-socket.keep-alive-enabled': (self: WasiTcpSocket) => SocketResult<boolean>;
        '[method]tcp-socket.set-keep-alive-enabled': (self: WasiTcpSocket, value: boolean) => SocketResult<void>;
        '[method]tcp-socket.keep-alive-idle-time': (self: WasiTcpSocket) => SocketResult<bigint>;
        '[method]tcp-socket.set-keep-alive-idle-time': (self: WasiTcpSocket, value: bigint) => SocketResult<void>;
        '[method]tcp-socket.keep-alive-interval': (self: WasiTcpSocket) => SocketResult<bigint>;
        '[method]tcp-socket.set-keep-alive-interval': (self: WasiTcpSocket, value: bigint) => SocketResult<void>;
        '[method]tcp-socket.keep-alive-count': (self: WasiTcpSocket) => SocketResult<number>;
        '[method]tcp-socket.set-keep-alive-count': (self: WasiTcpSocket, value: number) => SocketResult<void>;
        '[method]tcp-socket.hop-limit': (self: WasiTcpSocket) => SocketResult<number>;
        '[method]tcp-socket.set-hop-limit': (self: WasiTcpSocket, value: number) => SocketResult<void>;
        '[method]tcp-socket.receive-buffer-size': (self: WasiTcpSocket) => SocketResult<bigint>;
        '[method]tcp-socket.set-receive-buffer-size': (self: WasiTcpSocket, value: bigint) => SocketResult<void>;
        '[method]tcp-socket.send-buffer-size': (self: WasiTcpSocket) => SocketResult<bigint>;
        '[method]tcp-socket.set-send-buffer-size': (self: WasiTcpSocket, value: bigint) => SocketResult<void>;
        '[method]tcp-socket.subscribe': (self: WasiTcpSocket) => WasiPollable;
        '[method]tcp-socket.shutdown': (self: WasiTcpSocket, shutdownType: string) => SocketResult<void>;
    };
    'wasi:sockets/udp-create-socket': {
        'create-udp-socket': (family: IpAddressFamily) => WasiUdpSocket;
    };
    'wasi:sockets/udp': {
        '[resource-drop]udp-socket': (self: WasiUdpSocket) => void;
        '[method]udp-socket.start-bind': (self: WasiUdpSocket, network: WasiNetwork, localAddress: IpSocketAddress) => SocketResult<void>;
        '[method]udp-socket.finish-bind': (self: WasiUdpSocket) => SocketResult<void>;
        '[method]udp-socket.stream': (self: WasiUdpSocket, remoteAddress: IpSocketAddress | undefined) => SocketResult<[WasiIncomingDatagramStream, WasiOutgoingDatagramStream]>;
        '[method]udp-socket.local-address': (self: WasiUdpSocket) => SocketResult<IpSocketAddress>;
        '[method]udp-socket.remote-address': (self: WasiUdpSocket) => SocketResult<IpSocketAddress>;
        '[method]udp-socket.address-family': (self: WasiUdpSocket) => IpAddressFamily;
        '[method]udp-socket.unicast-hop-limit': (self: WasiUdpSocket) => SocketResult<number>;
        '[method]udp-socket.set-unicast-hop-limit': (self: WasiUdpSocket, value: number) => SocketResult<void>;
        '[method]udp-socket.receive-buffer-size': (self: WasiUdpSocket) => SocketResult<bigint>;
        '[method]udp-socket.set-receive-buffer-size': (self: WasiUdpSocket, value: bigint) => SocketResult<void>;
        '[method]udp-socket.send-buffer-size': (self: WasiUdpSocket) => SocketResult<bigint>;
        '[method]udp-socket.set-send-buffer-size': (self: WasiUdpSocket, value: bigint) => SocketResult<void>;
        '[method]udp-socket.subscribe': (self: WasiUdpSocket) => WasiPollable;
        // datagram streams
        '[resource-drop]incoming-datagram-stream': (self: WasiIncomingDatagramStream) => void;
        '[method]incoming-datagram-stream.receive': (self: WasiIncomingDatagramStream, maxResults: bigint) => SocketResult<IncomingDatagram[]>;
        '[method]incoming-datagram-stream.subscribe': (self: WasiIncomingDatagramStream) => WasiPollable;
        '[resource-drop]outgoing-datagram-stream': (self: WasiOutgoingDatagramStream) => void;
        '[method]outgoing-datagram-stream.check-send': (self: WasiOutgoingDatagramStream) => SocketResult<bigint>;
        '[method]outgoing-datagram-stream.send': (self: WasiOutgoingDatagramStream, datagrams: OutgoingDatagram[]) => SocketResult<bigint>;
        '[method]outgoing-datagram-stream.subscribe': (self: WasiOutgoingDatagramStream) => WasiPollable;
    };
    'wasi:sockets/ip-name-lookup': {
        'resolve-addresses': (network: WasiNetwork, name: string) => WasiResolveAddressStream;
        '[resource-drop]resolve-address-stream': (self: WasiResolveAddressStream) => void;
        '[method]resolve-address-stream.resolve-next-address': (self: WasiResolveAddressStream) => SocketResult<IpAddress | undefined>;
        '[method]resolve-address-stream.subscribe': (self: WasiResolveAddressStream) => WasiPollable;
    };
}

/** All WASI P2 interface names supported by the host */
export type WasiP2InterfaceName = keyof WasiP2Interfaces;

/** WASI P2 host exports: flat map of WASI interface → method records.
 * Both unversioned ('wasi:cli/stdin') and versioned ('wasi:cli/stdin@0.2.0') keys are present.
 * Some interfaces may be absent when `enabledInterfaces` is used to filter. */
export type WasiP2HostExports = {
    [K in WasiP2InterfaceName]?: WasiP2Interfaces[K];
} & Record<string, Record<string, Function>>;
