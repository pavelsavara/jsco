# WASIp3 Host Implementation Plan

## Overview

Implement a native WASIp3 host in TypeScript that provides all WASI Preview 3 interfaces.
Two bundles: `wasip3.js` (browser-compatible core) and `wasip3-node.js` (Node.js extensions).
The node bundle is dynamically loaded at runtime when running on Node.js.

## Architecture

```
                        ┌─────────────────────┐
                        │   User code          │
                        │   createHost(config)  │
                        └─────────┬───────────┘
                                  │
                ┌─────────────────▼─────────────────┐
                │         wasip3.js (browser)        │
                │  - VFS, clocks, random, CLI        │
                │  - HTTP client (fetch, duplex)     │
                │  - stream helpers                  │
                │  - NOOP stubs for sockets/server   │
                │  - dynamic import of wasip3-node   │
                └─────────────────┬─────────────────┘
                                  │ (on Node.js)
                ┌─────────────────▼─────────────────┐
                │      wasip3-node.js (node)         │
                │  - Real FS mounts via node:fs      │
                │  - TCP/UDP sockets via node:net    │
                │  - HTTP server via node:http        │
                │  - DNS lookup via node:dns          │
                │  - serve(handler)                   │
                └───────────────────────────────────┘
```

### Entry Points

- `src/host/wasip3/wasip3.ts` → `dist/release/wasip3.js` + `wasip3.d.ts`
- `src/host/wasip3/node/wasip3.ts` → `dist/release/wasip3-node.js` (no public .d.ts)

### Public API

```
wasip3.js exports:
  createHost(config?: WasiP3Config): Promise<WasiP3Imports>
  serve(handler: typeof WasiHttpHandler): Promise<void>  // re-exported from node

wasip3-node.js exports:
  createHost(config?: WasiP3Config): Promise<Partial<WasiP3Imports>>
  serve(handler: typeof WasiHttpHandler): Promise<void>
```

### Merge Strategy

`wasip3.js` `createHost()`:
1. Creates browser-compatible implementations for all interfaces
2. Attempts `import('./wasip3-node.js')` — only when we are running in nodeJS - detect
3. If node module loaded, calls its `createHost()` to get `Partial<WasiP3Imports>`
4. Merges node overrides over browser defaults (node wins for sockets, server. For file-system, the VFS handles external call and forward mounted nodes)
5. VFS mounts that map to real host paths are forwarded to node's real FS implementation
6. Returns the merged `WasiP3Imports` object

### Config

`WasiP3Config` — P3-native configuration:
- `env?: [string, string][]` — environment variables
- `args?: string[]` — program arguments
- `cwd?: string` — initial working directory
- `stdin?: ReadableStream<Uint8Array>` — stdin as web stream (not callback)
- `stdout?: WritableStream<Uint8Array>` — stdout as web stream
- `stderr?: WritableStream<Uint8Array>` — stderr as web stream
- `fs?: Map<string, Uint8Array|string>` — in-memory VFS files
- `mounts?: MountConfig[]` — host FS mount points (Node.js only)
- `network?: NetworkConfig` — limits and timeouts
- `enabledInterfaces?: string[]` — optional whitelist

### Stream Bridge

P3 interfaces use `WasiStreamReadable<T>` / `WasiStreamWritable<T>` (AsyncIterableIterator).
Internally, use Web Streams API (`ReadableStream` / `WritableStream`) for backpressure.
Provide helpers to bridge:
- `ReadableStream<T>` → `WasiStreamReadable<T>` (wrap as async iterable)
- `WritableStream<T>` → `WasiStreamWritable<T>` (wrap as async iterable that the host pushes into)
- `WasiStreamReadable<T>` → `ReadableStream<T>` (wrap async iterable as pull-based stream)

### Cross-Cutting Concerns

#### Security & Input Validation
All user data, call arguments, and network requests are treated as untrusted/malicious:
- **Buffer/length overflow guards**: Validate all sizes against config limits before allocating. Reject negative lengths, lengths exceeding `maxAllocationSize`, and integer overflows.
- **Path traversal**: Prevent `..` escape and symlink escape at every path resolution point.
- **Header injection**: Validate HTTP header names/values, reject forbidden headers.
- **DNS/network**: Rate-limit concurrent DNS lookups, enforce connection limits.
- **Resource exhaustion**: Cap open handles, active streams, pending futures per instance.

#### Memory Allocation Discipline
- Pre-allocate buffers of exact size — no growing arrays or repeated concatenation.
- Avoid creating unnecessary intermediate objects in hot paths (stream read/write, poll).
- Reuse typed arrays where possible (e.g. shared scratch buffer for small reads).
- Stream chunks: pass through without copying when ownership transfers cleanly.

#### Multi-Threading Readiness
Stateful components (VFS, environment variables) are designed with future multi-threading in mind:
- VFS and env state accessed through an async interface that does not assume single-thread.
- The async interface boundary enables future replacement with a WASM/WASI component or SharedArrayBuffer+Atomics implementation without changing callers.
- For now, single-threaded in-memory implementations. The interface shape is what matters.

#### Resource Handle Management
Unified handle allocation/disposal via typed `HandleTable<T>` per resource kind:
- Descriptor handles, socket handles, stream handles, DNS resolution handles.
- Deterministic disposal: `[resource-drop]` releases the handle and cleans up underlying resources.
- Handle reuse after drop (free-list). Detect use-after-drop.

---

## Stage 1: Infrastructure & Build

### Goals
- Set up the file structure, build pipeline, and shared utilities

### Tasks
- Create `src/host/wasip3/wasip3.ts` entry point with `createHost()` skeleton
- Create `src/host/wasip3/node/wasip3.ts` entry point with `createHost()` and `serve()` skeletons
- Add rollup entries for `wasip3.js` and `wasip3-node.js` (mirror wasip2 pattern)
- Update `deploy/package.json` exports map with `./wasip3` and `./wasip3-node`
- Create `src/host/wasip3/types.ts` — `WasiP3Config`, `MountConfig`, `NetworkConfig`, allocation/size limits
- Create `src/host/wasip3/streams.ts` — stream bridge helpers (ReadableStream ↔ WasiStream)
- Create `src/host/wasip3/result.ts` — result/error constructor helpers (`ok()`, `err()`), `WasiError` exception class carrying error code/tag/message for representing failed results as throwable exceptions
- Create `src/host/wasip3/resources.ts` — typed `HandleTable<T>` for resource handle allocation, lookup, drop, and use-after-drop detection. Free-list based reuse. Per-kind tables (descriptors, sockets, streams, etc.)
- Verify build produces `dist/release/wasip3.js`, `wasip3.d.ts`, `wasip3-node.js`

### Tests
- `src/host/wasip3/streams.test.ts` — stream bridge round-trips
- `src/host/wasip3/resources.test.ts` — handle alloc/get/drop, use-after-drop error, free-list reuse
- `src/host/wasip3/wasip3-host.test.ts` — createHost returns object with all interface keys

---

## Stage 1.5: Interface Skeletons

### Goals
- Create skeleton files for ALL interfaces with every function stubbed out
- Every function throws `WasiError('not-implemented')` — enables incremental development and compile-time type checking from the start

### Tasks
- Create `src/host/wasip3/random.ts` — all 3 interfaces, all functions, throw not-implemented
- Create `src/host/wasip3/clocks.ts` — monotonic-clock, system-clock, timezone, throw not-implemented
- Create `src/host/wasip3/cli.ts` — environment, exit, types, terminal-*, throw not-implemented
- Create `src/host/wasip3/stdio.ts` — stdin, stdout, stderr, throw not-implemented
- Create `src/host/wasip3/filesystem.ts` — Descriptor class skeleton, preopens, throw not-implemented
- Create `src/host/wasip3/vfs.ts` — async VFS interface definition, in-memory skeleton
- Create `src/host/wasip3/http.ts` — types, client send(), throw not-implemented
- Create `src/host/wasip3/sockets.ts` — TcpSocket, UdpSocket, ip-name-lookup, throw not-supported
- Create `src/host/wasip3/node/sockets.ts` — Node.js socket skeleton, throw not-implemented
- Create `src/host/wasip3/node/http-server.ts` — serve() skeleton, throw not-implemented
- Create `src/host/wasip3/node/filesystem-node.ts` — node FS Descriptor skeleton, throw not-implemented
- Wire all skeletons into `createHost()` so it returns a complete `WasiP3Imports` object
- Verify build succeeds and type-checks pass

### Tests
- `src/host/wasip3/wasip3-host.test.ts` — every interface key present, calling any function throws not-implemented

---

## Stage 2: Simple Interfaces (Random, Clocks, CLI Environment/Exit)

### Goals
- Implement interfaces that are synchronous or trivially async, browser-compatible

### Interfaces
- `wasi:random/random` — `getRandomBytes(len)`, `getRandomU64()` via `crypto.getRandomValues()`. Validate `len` against config max allocation size before allocating.
- `wasi:random/insecure` — `getInsecureRandomBytes(len)`, `getInsecureRandomU64()`. Same length validation.
- `wasi:random/insecure-seed` — `insecureSeed()` returning `[bigint, bigint]`
- `wasi:clocks/types` — `Duration` type (just bigint, no runtime)
- `wasi:clocks/monotonic-clock` — `now()`, `getResolution()`, `waitUntil(Mark)`, `waitFor(Duration)` (Promise-based)
- `wasi:clocks/system-clock` — `now()`, `getResolution()`
- `wasi:clocks/timezone` — `display(Instant)`, `utcOffset(Instant)`, `inDaylightSavingTime(Instant)`
- `wasi:cli/environment` — `getEnvironment()`, `getArguments()`, `getInitialCwd()` from config
- `wasi:cli/exit` — `exit(Result)`, `exitWithCode(number)` throwing WasiExit
- `wasi:cli/types` — `ErrorCode` type (no runtime)

### Tasks
- Create `src/host/wasip3/random.ts`
- Create `src/host/wasip3/clocks.ts`
- Create `src/host/wasip3/cli.ts`

### Tests
- `src/host/wasip3/random.test.ts`
- `src/host/wasip3/clocks.test.ts`
- `src/host/wasip3/cli.test.ts` — environment, exit

---

## Stage 3: CLI Stdio (Streams)

### Goals
- Implement stdin/stdout/stderr using P3 stream semantics
- First real usage of the stream bridge

### Interfaces
- `wasi:cli/stdin` — `readViaStream()` returning `[WasiStreamWritable<Uint8Array>, WasiFuture<Result>]`
- `wasi:cli/stdout` — `writeViaStream(data: WasiStreamReadable<Uint8Array>): WasiFuture<void>`
- `wasi:cli/stderr` — same as stdout

### Design
- stdin: Host creates a `ReadableStream` from config.stdin (or empty stream). `readViaStream()` returns a writable end the runtime pushes data into, plus a completion future.
- stdout/stderr: Guest passes a readable stream. Host consumes it and writes to config.stdout/stderr (or discards).

### Tasks
- Create `src/host/wasip3/stdio.ts`
- Wire into cli.ts and createHost()

### Tests
- Extend `src/host/wasip3/cli.test.ts` — stdin read, stdout/stderr write, completion futures

---

## Stage 4: Terminal Interfaces

### Goals
- Implement terminal-related interfaces (mostly informational, NOOP in many environments)

### Interfaces
- `wasi:cli/terminal-input` — `TerminalInput` class
- `wasi:cli/terminal-output` — `TerminalOutput` class
- `wasi:cli/terminal-stdin` — `getTerminalStdin(): TerminalInput | undefined`
- `wasi:cli/terminal-stdout` — `getTerminalStdout(): TerminalOutput | undefined`
- `wasi:cli/terminal-stderr` — `getTerminalStderr(): TerminalOutput | undefined`

### Tasks
- Add terminal stubs to `src/host/wasip3/cli.ts`

### Tests
- Extend `src/host/wasip3/cli.test.ts` — terminal queries return undefined in non-TTY

---

## Stage 5: Virtual Filesystem

### Goals
- Full in-memory VFS with directory tree, metadata, timestamps
- Browser-compatible, no node:fs dependency
- Async interface that enables future multi-threaded or component-based backend

### Interfaces
- `wasi:filesystem/types` — `Descriptor` class (all methods), `DirectoryEntry`, error codes
- `wasi:filesystem/preopens` — `getDirectories()` returning descriptors

### Design

#### Async VFS Interface
The VFS is accessed through an async interface (`IVfsBackend`) that all Descriptor methods call:
```
IVfsBackend {
  stat(path): Promise<DescriptorStat>
  read(path, offset, len): Promise<Uint8Array>
  write(path, data, offset): Promise<void>
  openAt(dirPath, path, flags): Promise<handle>
  readDirectory(path): AsyncIterable<DirectoryEntry>
  createDirectory(path): Promise<void>
  removeDirectory(path): Promise<void>
  unlink(path): Promise<void>
  rename(from, to): Promise<void>
  ... (all Descriptor operations)
}
```
- In-memory implementation: `MemoryVfsBackend` — synchronous under the hood but exposed as async
- Node.js mount implementation: `NodeFsBackend` — delegates to node:fs/promises (Stage 9)
- The Descriptor class dispatches to the appropriate backend based on which subtree the path falls in
- This async boundary makes the interface safe for future SAB+Atomics or component replacement

#### VFS Tree (MemoryVfsBackend)
- Nodes are directories (children map) or files (Uint8Array content)
- Each node tracks: type, size, link count, access/modification/status-change timestamps
- `Descriptor` wraps a VFS node reference with flags (read/write/mutate-directory)
- File I/O via P3 streams: `readViaStream(offset)` → `[WasiStreamWritable<u8>, WasiFuture<Result>]`
- `writeViaStream(data, offset)` → `WasiFuture<Result>`
- Directory listing: `readDirectory()` → `WasiStreamWritable<DirectoryEntry>`
- Path traversal: resolve relative paths, prevent escape above preopens
- `openAt`, `stat`, `statAt`, `setTimes`, `setTimesAt`, `createDirectoryAt`, `removeDirectoryAt`, `unlinkFileAt`, `renameAt`, `linkAt`, `symlinkAt`, `readlinkAt`, `metadataHash`, `metadataHashAt`

#### Security
- Validate all path arguments: reject null bytes, excessive length (config.maxPathLength)
- Validate buffer sizes against config limits before allocation
- Prevent `..` escape above preopens at every resolution step

### Tasks
- Create `src/host/wasip3/vfs.ts` — `IVfsBackend` interface, `MemoryVfsBackend`, VfsNode tree, path resolution
- Create `src/host/wasip3/filesystem.ts` — Descriptor class, preopens, backend dispatch, error mapping

### Tests
- `src/host/wasip3/filesystem.test.ts` — tree construction, CRUD ops, path traversal, escape prevention, stream reads/writes, directory listing, timestamps, error codes
- `src/host/wasip3/vfs.test.ts` — MemoryVfsBackend operations, concurrent access patterns, size limit enforcement

---

## Stage 6: HTTP Client

### Goals
- Implement HTTP outbound requests using fetch() with duplex streaming

### Interfaces
- `wasi:http/types` — all type definitions (Method, Scheme, ErrorCode, Request, Response classes)
- `wasi:http/client` — `send(request: Request): Promise<Response>`

### Design
- `Request` class: method, URL, headers, optional body as `ReadableStream<Uint8Array>`
- `Response` class: status, headers, body as `ReadableStream<Uint8Array>`
- `send()` converts Request → `fetch()` RequestInit with `duplex: 'half'` for streaming body
- Response wraps fetch Response with streaming body consumption
- Error mapping: network errors → P3 `ErrorCode` variants
- Timeout support via `AbortSignal.timeout()`
- Security: validate URL scheme (http/https only), header count/size limits (config.network.maxHeaders, maxHeaderSize), request body size limit, response body size limit. Reject forbidden headers (host, connection, etc. per spec). Sanitize header values (no CRLF injection).

### Tasks
- Create `src/host/wasip3/http.ts` — types, client implementation

### Tests
- `src/host/wasip3/http.test.ts` — request/response construction, header validation, error mapping, mock fetch

---

## Stage 7: Sockets (Browser Stubs + Node.js Implementation)

### Goals
- Browser: all socket operations throw `not-supported`
- Node.js: full TCP and UDP implementation, DNS lookup

### Interfaces
- `wasi:sockets/types` — `TcpSocket`, `UdpSocket` classes, address types, error codes
- `wasi:sockets/ip-name-lookup` — `resolveAddresses(name): WasiStreamWritable<IpAddress>`

### Design (browser)
- `TcpSocket.create()` throws `{ tag: 'not-supported' }`
- `UdpSocket.create()` throws `{ tag: 'not-supported' }`
- `resolveAddresses()` throws `{ tag: 'not-supported' }`

### Design (Node.js)
- TCP: `node:net` Socket/Server wrapping
  - `TcpSocket.create()` → new socket
  - `bind()`, `connect()` → Promise-based
  - `listen()` → `WasiStreamWritable<TcpSocket>` of accepted connections
  - `send(stream)` → pipe ReadableStream to socket
  - `receive()` → `[WasiStreamWritable<u8>, WasiFuture<Result>]` from socket data events
  - Socket options: keepalive, buffer sizes, hop limit, timeouts
- UDP: `node:dgram` wrapping
  - `send(datagram)` / `receive()` with `WasiStreamWritable<Datagram>`
- DNS: `node:dns` lookup with concurrent limit and timeout

### Tasks
- Create `src/host/wasip3/sockets.ts` — browser stubs
- Create `src/host/wasip3/node/sockets.ts` — Node.js TCP/UDP/DNS implementation

### Tests
- `src/host/wasip3/sockets.test.ts` — browser stubs throw not-supported
- `src/host/wasip3/node/sockets.test.ts` — TCP connect/listen/send/receive, UDP send/receive, DNS lookup (with real loopback server in test)

---

## Stage 8: HTTP Server (Node.js) & serve()

### Goals
- Implement `serve(handler)` on Node.js using `node:http`
- Route incoming HTTP requests to the WASM handler export

### Interfaces
- `wasi:http/handler` — `handle(request: Request): Promise<Response>` (this is the guest export the server calls)

### Design
- `serve(handler)` starts `http.Server`
- Incoming request → P3 `Request` object with streaming body
- Calls `handler.handle(request)` → awaits P3 `Response`
- P3 `Response` → Node.js `ServerResponse` with streaming body
- Graceful shutdown, timeout enforcement, error handling
- Config: port, host, backlog, keepalive, header limits, body limits

### Tasks
- Create `src/host/wasip3/node/http-server.ts`
- Wire `serve()` re-export from wasip3.ts

### Tests
- `src/host/wasip3/node/http-server.test.ts` — start server, send request, verify handler called, streaming body round-trip, error responses, timeout

---

## Stage 9: Node.js Filesystem (Real FS Mounts)

### Goals
- Implement `NodeFsBackend` conforming to `IVfsBackend` async interface
- Mount host directories into VFS, forwarding operations to real filesystem
- Security: prevent path escape and symlink escape

### Design
- `MountConfig: { hostPath: string, guestPath: string, readOnly?: boolean }`
- `NodeFsBackend` implements `IVfsBackend` — all methods delegate to `node:fs/promises`
- VFS Descriptor dispatches to `NodeFsBackend` for paths under a mount, `MemoryVfsBackend` for others
- Path resolution: guest path → host path with escape prevention
- Symlink/junction resolution: `fs.realpath()` checked against mount boundary after every resolve
- Stream methods: `readViaStream` uses `fs.createReadStream`, wrapped as WasiStream
- Error mapping: Node.js errno → P3 filesystem ErrorCode
- Preopens: each mount added to `getDirectories()` results
- Security: validate all incoming paths (null bytes, length limits, traversal), validate file sizes against config limits before read allocation

### Tasks
- Create `src/host/wasip3/node/filesystem-node.ts` — `NodeFsBackend` implementing `IVfsBackend`
- Wire mount forwarding in wasip3.ts createHost() — register backends per mount path

### Tests
- `src/host/wasip3/node/filesystem-node.test.ts` — read/write mounted files, directory listing, stat, escape prevention, symlink security, error mapping, read-only enforcement, size limit enforcement

---

## Stage 10: Integration Tests

### Goals
- End-to-end tests with real WASM components using the P3 host
- Browser tests via Playwright

### Tasks
- Create `src/host/wasip3/integration.test.ts` — run WASM components with P3 host, verify stdout output, filesystem access, HTTP requests
- Create integration test WASM components (or reuse existing with P3 adapter)
- Create `tests/browser/wasip3.spec.ts` — Playwright tests loading P3 components in Chromium
- Add browser test HTML page that loads wasip3.js and runs a component
- Verify mounted folder round-trip (write from WASM, read from host, and vice versa)
- Verify socket echo server (TCP connect, send, receive)
- Verify HTTP echo server (serve + client send round-trip)

### Test Scenarios
- CLI: hello-world component with stdout capture
- Filesystem: component reads/writes VFS files, reads mounted host files
- HTTP client: component sends request to test server, verifies response
- HTTP server: serve() routes to handler, integration test sends HTTP request
- Sockets: component connects to test TCP server, echo round-trip
- Combined: component using filesystem + HTTP + stdout together

---

## Stage 11: Polish & Documentation

### Goals
- Finalize public API surface, documentation, error messages

### Tasks
- Review and finalize `WasiP3Config` shape
- Ensure all error paths produce clear, actionable error messages
- Add JSDoc comments to public API functions and types
- Verify tree-shaking: browser bundle should not include node:fs/net/http references
- Verify minification: reserved names, const enum inlining
- Run full test suite: lint, build, unit tests, integration tests, browser tests
- Update README with P3 host usage examples
