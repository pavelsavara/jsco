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

## Stage 1: Infrastructure & Build ✅ COMPLETE

### Goals
- Set up the file structure, build pipeline, and shared utilities

### Status
All tasks complete. Build produces `dist/release/wasip3.js`, `wasip3.d.ts`, `wasip3-node.js`.
- `src/host/wasip3/wasip3.ts` — browser entry point with `createWasiP3Host()`
- `src/host/wasip3/node/wasip3.ts` — Node.js entry with `createWasiP3Host()` and `serve()`
- Rollup entries for `wasip3.js` and `wasip3-node.js` in `rollup.config.js`
- `deploy/package.json` exports: `./wasip3`, `./wasip3-node`
- `src/host/wasip3/types.ts` — `WasiP3Config`, `MountConfig`, `NetworkConfig`, `AllocationLimits` with defaults
- `src/host/wasip3/streams.ts` — `createStreamPair()`, `readableFromStream()`, `readableFromAsyncIterable()`, `collectStream()`, `collectBytes()`
- `src/host/wasip3/result.ts` — `WasiResult<T,E>`, `ok()`/`err()` helpers, `WasiError`, `WasiExit`
- `src/host/wasip3/resources.ts` — `HandleTable<T>` with LIFO free-list, configurable max (default 10K)

### Tests ✅
- `src/host/wasip3/streams.test.ts` — stream bridge round-trips
- `src/host/wasip3/resources.test.ts` — handle alloc/get/drop, use-after-drop error, free-list reuse
- `src/host/wasip3/result.test.ts` — result/error helpers
- `src/host/wasip3/wasip3-host.test.ts` — createHost returns object with all interface keys

---

## Stage 1.5: Interface Skeletons ✅ COMPLETE

### Goals
- Create skeleton files for ALL interfaces with every function stubbed out
- Every function throws `WasiError('not-implemented')` — enables incremental development and compile-time type checking from the start

### Status
All interface files created and wired into `createWasiP3Host()` (registered as both unversioned and versioned `0.3.0-rc-2026-03-15`). All 23 WASI interfaces registered. No "not-implemented" stubs remain — all interfaces either fully implemented or intentionally "not-supported" (browser sockets).

### Tests ✅
- `src/host/wasip3/wasip3-host.test.ts` — every interface key present, browser socket stubs throw "not-supported"

---

## Stage 2: Simple Interfaces (Random, Clocks, CLI Environment/Exit) ✅ COMPLETE

### Goals
- Implement interfaces that are synchronous or trivially async, browser-compatible

### Status
All interfaces fully implemented.
- `src/host/wasip3/random.ts` — `getRandomBytes()` with chunked crypto.getRandomValues (64K limit), `getRandomU64()`, insecure variants, per-instance insecure seed
- `src/host/wasip3/clocks.ts` — `now()` via perf.now() in nanoseconds, `waitUntil()`/`waitFor()` via setTimeout, system clock from Date.now(), timezone via Intl.DateTimeFormat
- `src/host/wasip3/cli.ts` — `getEnvironment()`, `getArguments()`, `getInitialCwd()` from config, `exit()`/`exitWithCode()` throwing WasiExit

### Tests ✅
- `src/host/wasip3/random.test.ts`
- `src/host/wasip3/clocks.test.ts`
- `src/host/wasip3/cli.test.ts` — environment, exit

---

## Stage 3: CLI Stdio (Streams) ✅ COMPLETE

### Status
Fully implemented in `src/host/wasip3/stdio.ts`.
- stdin: `readViaStream()` returns stream pair, pumps from config.stdin
- stdout: `writeViaStream(readable)` → config.stdout or fallback console.log
- stderr: `writeViaStream(readable)` → config.stderr or fallback console.error
- Node.js stdio bridge in `src/host/wasip3/node/stdio-node.ts` (process.stdin/stdout/stderr)

### Tests ✅
- `src/host/wasip3/stdio.test.ts`
- `src/host/wasip3/node/stdio-node.test.ts`

---

## Stage 4: Terminal Interfaces ✅ COMPLETE

### Status
Terminal stubs implemented in `src/host/wasip3/stdio.ts`. All 5 terminal interfaces return `undefined` / throw `not-supported` (browser limitation). No TTY detection in browser.

### Tests ✅
- Covered in `src/host/wasip3/wasip3-host.test.ts` — terminal stubs return expected values

---

## Stage 5: Virtual Filesystem ✅ COMPLETE

### Status
Fully implemented.
- `src/host/wasip3/vfs.ts` — `MemoryVfsBackend` tree-based VFS with symlink support, full path resolution, 18 POSIX error codes
- `src/host/wasip3/filesystem.ts` — `FsDescriptor` resource class with 30+ methods (read, write, stat, createFile, removeFile, createDirectory, readDirectory, openAt, etc.)
- `wasi:filesystem/preopens` — `listPreopens()` returns mounted directories
- Path traversal prevention, null byte rejection, path length limits

### Tests ✅
- `src/host/wasip3/filesystem.test.ts`
- `src/host/wasip3/vfs.test.ts`

---

## Stage 6: HTTP Client ✅ COMPLETE

### Status
Fully implemented in `src/host/wasip3/http.ts` (~850 lines).
- `HttpFields` resource — RFC 9110 header validation (token format, forbidden headers, CRLF injection prevention)
- `HttpRequest` / `HttpResponse` / `HttpRequestOptions` resources
- `send(request)` — Fetch API with duplex streaming, `AbortSignal.timeout()`, full error code mapping (DNS, TLS, connection, HTTP-specific)
- Size enforcement: request/response body, header count/size, URL length
- `wasi:http/handler` — stub (guest export, not host import; throws descriptive error)

### Tests ✅
- `src/host/wasip3/http.test.ts`

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

## Stage 8: HTTP Server (Node.js) & serve() ✅ COMPLETE

### Status
Fully implemented in `src/host/wasip3/node/http-server.ts`.
- `serve(handler, config)` starts Node.js HTTP server
- Routes incoming requests to WASM handler export
- Streaming request/response body
- Re-exported via `src/host/wasip3/node/wasip3.ts`

### Tests ✅
- `src/host/wasip3/node/http-server.test.ts`

---

## Stage 9: Node.js Filesystem (Real FS Mounts) ✅ COMPLETE

### Status
Fully implemented in `src/host/wasip3/node/filesystem-node.ts`.
- Mounts host directories via Node.js `fs` module
- Wired into `src/host/wasip3/node/wasip3.ts` host creation

### Tests ✅
- `src/host/wasip3/node/filesystem-node.test.ts`

---

## Stage 10: Integration Tests ⚠️ PARTIALLY COMPLETE

### Status
- ✅ `src/host/wasip3/integration.test.ts` — Tests real wasmtime WASM components: `p3_big_random_buf`, `p3_random_imports`, `p3_cli_hello_stdout`, `p3_cli` (environment, args, terminals, stdio)
- ✅ `tests/browser/hello.spec.ts` — Playwright browser tests (hello-world, hello-city, echo components)
- ✅ `tests/browser/` — test HTML pages and serve infrastructure

### Remaining Gaps
- ❌ No dedicated `tests/browser/wasip3.spec.ts` — browser tests exercise P3 indirectly through adapter but don't test P3-native components in the browser
- ❌ No filesystem integration test with WASM components (VFS read/write from WASM)
- ❌ No socket echo server integration test (TCP connect/send/receive from WASM)
- ❌ No HTTP echo server integration test (serve + client round-trip from WASM)
- ❌ No combined multi-interface integration test (filesystem + HTTP + stdout from single component)

---

## Stage 10.5: WASIp2-via-WASIp3 Node Adapter ⚠️ MOSTLY COMPLETE

### Status
Core adapter and Node.js extensions are fully implemented. Test migration from the old `src/host/wasip2/` path is mostly complete.

#### Completed ✅
- `src/host/wasip2-via-wasip3/index.ts` — P2 adapter factory (unversioned + P2.0 through P2.11)
- `src/host/wasip2-via-wasip3/node/index.ts` — Node.js adapter entry point
- `src/host/wasip2-via-wasip3/node/http-server.ts` — P2-style HTTP server wrapper
- Rollup entries: `wasip2-via-wasip3.js`, `wasip2-via-wasip3-node.js` in `rollup.config.js`
- `deploy/package.json` exports: `./wasip2-via-wasip3`, `./wasip2-via-wasip3-node`
- `src/index.test.ts` — uses P3 host + `createWasiP2ViaP3Adapter()`
- `src/utils/args.ts` — imports from `src/host/wasip3/types.ts`
- `src/host/wasip2/` directory — fully removed
- 14 adapter unit test files in `wasip2-via-wasip3/` (cli, clocks, filesystem, http, random, sockets, etc.)
- `src/host/wasip2-via-wasip3/node/filesystem-node.test.ts` ✅
- `src/host/wasip2-via-wasip3/node/http-server.test.ts` ✅

#### Remaining Gaps ❌
- `src/host/wasip2-via-wasip3/node/sockets.test.ts` — **NOT CREATED** (no Node.js socket adapter tests)
- `tests/cli-conformance.test.ts` — **NOT CREATED** (was planned to migrate from old wasip2 path)
- `tests/cli-integration.test.ts` — **NOT CREATED** (was planned to migrate from old wasip2 path)
- Verify build produces `dist/release/wasip2-via-wasip3-node.js` and `wasip2-via-wasip3-node.d.ts` ✅

### Remaining Test Gaps
- ❌ `src/host/wasip2-via-wasip3/node/sockets.test.ts` — TCP/UDP state machine, connect/listen/send/receive, DNS lookup (via adapter chain)
- ❌ `tests/cli-conformance.test.ts` — wasmtime reference binaries via `dist/debug/index.js`
- ❌ `tests/cli-integration.test.ts` — CLI tool behavior (--help, run, etc.)

---

## Stage 10.8: Remove WASIp2 Direct Host ✅ COMPLETE

### Status
Fully complete. `src/host/wasip2/` has been removed. All code now uses P3 host + P2-via-P3 adapter.

#### Verified ✅
- `src/host/wasip2/` directory — deleted (does not exist)
- No `wasip2` or `wasip2-node` rollup entries in `rollup.config.js`
- No `./wasip2` or `./wasip2-node` exports in `deploy/package.json`
- `src/index.ts` exports `loadWasiP3Host()`, `loadWasiP2ViaP3Adapter()`, `loadWasiP3Serve()` (no direct wasip2)
- `src/utils/args.ts` imports from `src/host/wasip3/types.ts`
- `src/dynamic.ts` imports P3 types from `wit/wasip3/types/` and P2 types from `wit/wasip2/types/` (P2 types still needed for adapter return types)
- `wit/wasip2/` — retained (still referenced by `wasip2-via-wasip3/` adapter for P2 type definitions)

---

## Stage 11: Polish & Documentation — NOT STARTED

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

## Stage 12: Feedback — NOT STARTED
review the wasip3 implementation
- are there any functionalities missing ?
- are there any security issues ?
- review design and architecture and provide feedback
- propose improvements

---

## Gap Summary (as of 2026-04-21)

### Implementation Complete ✅
| Area | Status |
|------|--------|
| Infrastructure (types, streams, resources, result) | ✅ Complete |
| Random (all 3 interfaces) | ✅ Complete |
| Clocks (monotonic, system, timezone) | ✅ Complete |
| CLI (environment, exit, stdin, stdout, stderr) | ✅ Complete |
| Terminal stubs (5 interfaces) | ✅ Complete (not-supported) |
| Virtual Filesystem (VFS + Descriptor) | ✅ Complete |
| HTTP Client (types, fields, request, response, send) | ✅ Complete |
| Sockets — browser stubs | ✅ Complete (not-supported) |
| Sockets — Node.js (TCP, UDP, DNS) | ✅ Complete |
| HTTP Server — Node.js (serve) | ✅ Complete |
| Node.js Filesystem mounts | ✅ Complete |
| Node.js stdio bridge | ✅ Complete |
| P2-via-P3 adapter (browser) | ✅ Complete |
| P2-via-P3 adapter (Node.js) | ✅ Complete |
| Build pipeline (rollup, deploy exports) | ✅ Complete |
| Old wasip2 host removal | ✅ Complete |

### Gaps Not Yet Implemented ❌

#### Missing Tests
1. **`src/host/wasip2-via-wasip3/node/sockets.test.ts`** — No Node.js socket adapter test exercising TCP/UDP/DNS through the P2-via-P3 adapter chain
2. **`tests/cli-conformance.test.ts`** — CLI conformance tests against wasmtime reference binaries (planned migration from old wasip2 path, never created)
3. **`tests/cli-integration.test.ts`** — CLI tool integration tests (--help, run, serve; planned migration, never created)

#### Missing Integration Test Scenarios
4. **Browser-native P3 test** — `tests/browser/wasip3.spec.ts` for Playwright tests exercising P3 components directly in the browser (not just through P2 adapter)
5. **Filesystem WASM integration** — No test of WASM component reading/writing VFS files through P3 host
6. **Socket WASM integration** — No test of WASM component doing TCP connect/send/receive through P3 host
7. **HTTP server WASM integration** — No end-to-end test of `serve()` routing HTTP requests to a WASM handler and back
8. **Combined multi-interface test** — No test exercising filesystem + HTTP + stdout from a single WASM component

#### Documentation & Polish (Stage 11)
9. **README** — No P3 host usage examples in README.md
10. **JSDoc** — Public API types/functions lack JSDoc comments
11. **Tree-shaking verification** — Not verified that browser bundle excludes node:fs/net/http references
12. **Bundle size** — TODO.md mentions target <40KB minified+gzipped for Release (currently 264KB debug)

#### Items from TODO.md (related to WASI)
13. **WASIp1 forwarding** — Implement WASI Preview 1 by forwarding to P2/P3 (TODO.md)
14. **WASIp3 async features** — Interleaved suspension, re-entry queuing, zero-copy bring-your-own-buffer (TODO.md)
15. **Firefox browser test** — Only Chrome tested via Playwright; Firefox coverage missing (TODO.md)