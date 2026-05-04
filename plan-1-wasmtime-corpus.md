# Plan 1: Wire the unused `integration-tests/wasmtime/*.component.wasm` corpus

## Status: Largely complete (May 2026)

Implemented in [tests/host/wasip3/wasmtime-corpus.test.ts](tests/host/wasip3/wasmtime-corpus.test.ts).

### Coverage snapshot (103 total artifacts)

| Category | Count | Status |
|----------|-------|--------|
| KNOWN_TESTED (other test files) | 25 | ✅ Exercised in integration.test.ts, sockets-integration.test.ts, http-reactor-concurrent.test.ts |
| P2_CLI_SIMPLE roster | 24 | ✅ Parametric smoke + dedicated stdout/stderr assertions |
| P2_HTTP_OUTBOUND roster | 5 | ✅ Against echo-server-p3 fixture |
| P2_HTTP_OUTBOUND_VALIDATION roster | 7 | ✅ Client-side input validation (no network) |
| P3_FS_SIMPLE roster | 2 | ✅ file_read_write + readdir via flattenResource() |
| P3_SERVE roster | 2 | ✅ serve() harness with HTTP requests |
| P3_MIDDLEWARE_CHAIN roster | 2 | ✅ linkHandler() chain wiring + deflate + concurrency |
| Echo-server fixture tests | — | ✅ fetch()-level contract verification |
| KNOWN_UNSUPPORTED | 36 | ❌ See re-evaluation below |

### What's been done
- ✅ Inventory test (`every .component.wasm is classified`) enforces that every artifact in `integration-tests/wasmtime/` is in `KNOWN_TESTED`, `KNOWN_UNSUPPORTED`, or owned by a smoke-test roster. Also fails on stale allowlist entries.
- ✅ P2 CLI smoke roster (`P2_CLI_SIMPLE`) wires 24 artifacts (hello_stdout, exit_*, args, argv0, env, default_clocks, sleep, much_stdout, large_env, random, sleep, export_cabi_realloc, stdin, stdin_empty, stdio_write_flushes, stream_pollable_correct, file_read, file_append, file_dir_sync, directory_list) with dedicated assertions on captured stdout/stderr where relevant.
- ✅ P2 HTTP outbound roster (`P2_HTTP_OUTBOUND`) runs `get`/`post`/`put`/`large_post`/`content_length` against an out-of-process `jsco serve echo-server-p3` fixture (see [tests/test-utils/echo-server-fixture.ts](tests/test-utils/echo-server-fixture.ts)).
- ✅ P2 HTTP outbound validation roster (`P2_HTTP_OUTBOUND_VALIDATION`) runs 7 client-side validation variants (unknown_method, unsupported_scheme, missing_path_and_query, invalid_port, invalid_dnsname, timeout, invalid_header) — no network traffic, just host input checks.
- ✅ P3 filesystem roster (`P3_FS_SIMPLE`) wires `p3_filesystem_file_read_write` and `p3_readdir` via `flattenResource('descriptor', FsDescriptor, FS_NON_RESULT)`. Required host fix: `createFilesystemTypes()` now exposes flat `[method]descriptor.*` entries, `throwFsError()` passes through error-code objects.
- ✅ P3 service-export roster (`P3_SERVE`) wires `p3_cli_serve_hello_world` and `p3_api_proxy` via `serve()`.
- ✅ P3 middleware chain roster (`P3_MIDDLEWARE_CHAIN`) wires `p3_http_middleware` and `p3_http_middleware_with_chain` via `linkHandler()` with deflate transcoding, 3-deep chain, and 16-way concurrency tests.
- ✅ Echo-server-p3 fixture smoke tests verify the wasmtime echo wire contract (method/uri/content-length pass-through) end-to-end via `fetch()`.
- ✅ `KNOWN_TESTED` (25 entries) cross-references existing tests in `integration.test.ts`, `sockets-integration.test.ts`, and `node/http-reactor-concurrent.test.ts`.
- ✅ `KNOWN_UNSUPPORTED` (36 entries) — every excluded artifact has a one-line reason.

### Completed steps (from original plan)

- ✅ **Step 1 — P2 CLI: panic→exit-code mapping**: `runP2` catches `WebAssembly.RuntimeError` and returns exit-code 1. `p2_cli_exit_panic` wired in `P2_CLI_SIMPLE`.
- ✅ **Step 2 — P2 stdin family**: `p2_cli_stdin`, `p2_cli_stdin_empty`, `p2_cli_stdio_write_flushes`, `p2_stream_pollable_correct` all wired with `stringToReadable()` payloads.
- ✅ **Step 3 — P2 file/dir preopen fixtures**: `p2_cli_file_read`, `p2_cli_file_append`, `p2_cli_file_dir_sync`, `p2_cli_directory_list` wired with `config.fs` Map fixtures.
- ✅ **Step 5 — P3 service exports (partial)**: `p3_cli_serve_hello_world` and `p3_api_proxy` exercised via `serve()`. Middleware chain (`p3_http_middleware`, `p3_http_middleware_with_chain`) exercised via `linkHandler()`.
- ✅ **Step 6 — P2 HTTP client-side validation**: All 7 validation variants wired in `P2_HTTP_OUTBOUND_VALIDATION`.
- ✅ **Phase 1 — P3 filesystem flattenResource + P2 sockets diagnosis**: `createFilesystemTypes()` now uses `flattenResource()`, wiring 2/3 P3 filesystem artifacts. P2 sockets blocked by adapter stub gap (all method implementations are `not-supported`).

### Outstanding work — prioritized (easiest → hardest)

Each step below moves entries out of `KNOWN_UNSUPPORTED` and into a live roster. Steps are ordered by effort: cheap fixture/test-harness wiring first, then host-side bug fixes, then larger architectural gaps.

#### Step 1 — P3 filesystem: wire host methods via flattenResource ✅ DONE
- **Files**: `p3_filesystem_file_read_write.component.wasm`, `p3_readdir.component.wasm` → now in `P3_FS_SIMPLE` roster.
- **What was done**:
  - `createFilesystemTypes()` in `src/host/wasip3/filesystem.ts` now uses `flattenResource('descriptor', FsDescriptor, FS_NON_RESULT)` to expose `[method]descriptor.*` entries the resolver needs.
  - `FS_NON_RESULT` set: `read-via-stream`, `read-directory`, `drop` (these return tuples/void, not `result<T,E>`).
  - `write-via-stream` / `append-via-stream` are result-wrapped by default (their `future<result<_, error-code>>` return has result INSIDE the future).
  - `throwFsError()` now passes through error-code-shaped objects (`{ tag: string }`) instead of converting all non-VfsError throws to `{ tag: 'io' }`.
  - Also exposes `Descriptor` (PascalCase) for direct host test compatibility.
- **Remaining**: `p3_file_write.component.wasm` still in KNOWN_UNSUPPORTED — its final assertion tests stream lifecycle (unused readable stream not auto-cancelled when host future resolves with error). The 64KB write+stat+read phases pass; only the "write to read-only descriptor returns remaining data" stream close propagation fails. This is a runtime-level fix in stream-table.ts.

#### Step 2 — P2 sockets via P2-via-P3 adapter ❌ BLOCKED
- **Files**: 13 P2 socket artifacts (`p2_tcp_bind` through `p2_ip_name_lookup`).
- **Finding**: The P2-via-P3 adapter's `sockets/tcp` and `sockets/udp` resource methods in `src/host/wasip2-via-wasip3/sockets.ts` are **all stubs returning `not-supported`**. They don't delegate to the P3 `NodeTcpSocket`/`NodeUdpSocket` methods. Only `TcpSocket.create()` and `UdpSocket.create()` (static factories) are wired.
- **Gap**: The P2 start-bind/finish-bind/start-connect/finish-connect state machine needs a bridge to the P3 direct async socket API. This is a non-trivial adapter implementation, not just test wiring.
- **All 13 entries remain in KNOWN_UNSUPPORTED** with reason: "P2-via-P3 adapter tcp/udp methods are not-supported stubs".

#### Step 3 — P2 `api_read_only`: read-only preopen flag *(small host change)*
- **File**: `p2_api_read_only.component.wasm`
- **Discovery**: `FsDescriptor` already enforces `ensureWrite()` check (throws `{ tag: 'read-only' }` when `!this.flags.write`). The only gap is that `initFilesystem()` hardcodes `{ read: true, write: true, mutateDirectory: true }` for the root preopen.
- **Fix**: Add an optional `fsFlags?: { read?: boolean; write?: boolean; mutateDirectory?: boolean }` field to `HostConfig`. When `write` is false, create the preopen with `{ read: true, write: false, mutateDirectory: false }`. The guest expects to read `bar.txt` (27 bytes, "And stood awhile in thought") but all writes/creates/renames/removes must fail.
- **Effort**: ~15 lines host change + ~5 lines test.

#### Step 4 — P2 `api_time`: fake clock injection *(small host change)*
- **File**: `p2_api_time.component.wasm`
- **Discovery**: `src/host/wasip3/clocks.ts` uses `performance.now()` and `Date.now()` directly with no configuration hooks. The guest expects:
  - `Instant::elapsed()` = exactly 42 seconds after `Instant::now()`
  - `SystemTime::now()` = UNIX_EPOCH + 1,431,648,000.000000100 (2015-05-15T12:00:00Z + 100ns)
- **Fix**: Add optional `clocks?: { wallClockNow?: () => { seconds: bigint; nanoseconds: number }; monotonicNow?: () => bigint; monotonicResolution?: bigint }` to `HostConfig`. Wire a fake monotonic clock that returns 0 on first call and 42_000_000_000n on second call. Wire a fake wall clock returning the expected epoch.
- **Effort**: ~25 lines host change + ~10 lines test.

#### Step 5 — P2 `http_outbound_request_response_build` *(host: OutgoingResponse builder)*
- **File**: `p2_http_outbound_request_response_build.component.wasm`
- **Discovery**: Guest tests building both `OutgoingRequest` (with body write + method/scheme/authority validation) and `OutgoingResponse` (with body write). The P2 adapter in `src/host/wasip2-via-wasip3/http.ts` has `AdapterOutgoingRequest` but needs `AdapterOutgoingResponse` with `.body()` → write stream. Also validates malformed method/authority/scheme/path strings with newlines.
- **Fix**: Implement `AdapterOutgoingResponse` resource class with `body()` → `AdapterOutgoingBody` and wire it in the P2 adapter. The validation setters on `AdapterOutgoingRequest` (invalid method, bad authority with newlines, IPv6 addresses) must return `err` on invalid input.
- **Effort**: ~40 lines for response builder + validation edge cases.

#### Step 6 — P2 `api_reactor`: parser bug with `own<imported-resource>` exports *(parser fix)*
- **File**: `p2_api_reactor.component.wasm`
- **Issue**: Guest exports a `test-reactor` world with `add-strings(ss: list<string>) -> u32` and `get-strings() -> list<string>` plus `write-strings-to(o: own<output-stream>) -> result`. The parser resolves the export type_index to `ComponentTypeDefinedOwn` (tag 68) instead of `ComponentTypeFunc`.
- **Root cause**: When the export signature contains `own<imported-resource>`, the type indexing in `src/parser/export.ts` or `src/resolver/type-validation.ts` follows the `own<T>` wrapper instead of resolving the enclosing function type.
- **Fix**: Debug with `parser: LogLevel.Summary` to see the WAT dump. The export's type_index should point at a `ComponentTypeFunc`, not the `own<T>` within a return type. Likely an off-by-one or wrong indirection in the type index resolution.
- **Effort**: Medium — requires parser debugging. Possibly ~20 lines fix once root cause is clear.

#### Step 7 — P2 `udp_send_too_much`: send-permit overflow trap *(host fix)*
- **File**: `p2_udp_send_too_much.component.wasm`
- **Discovery**: Guest calls `check_send()` to get permit count, then attempts `permits + 1` datagrams. Per WASI spec this must trap. The P2 adapter's `UdpSocket.send()` may not enforce permit limits.
- **Fix**: Track send permits in the UDP socket implementation. `check_send()` returns available permits; `send()` traps if datagram count exceeds last `check_send()` value.
- **Effort**: ~15 lines in socket host.

#### Step 8 — P3 HTTP outbound: decouple body streaming from fetch *(large host fix)*
- **Files**: 12 × `p3_http_outbound_request_*.component.wasm` + `p3_http_proxy.component.wasm`
- **Issue**: `sendImpl()` in `src/host/wasip3/http.ts` passes `wrapBodyAsReadableStream(contents)` directly to `fetch()`. Under JSPI, the wasm task is suspended during `await fetch()`, so the guest's `join!` arm that writes to the body transmitter can never make progress → deadlock.
- **Root cause**: JSPI has no intra-task concurrency. The guest pattern is `join!(client::send(req), async { tx.write_all(buf); drop(tx); })` — both arms must progress, but JSPI suspends the entire task on the first `await`.
- **Fix options** (ordered by complexity):
  1. **Eager buffering**: Before calling `fetch()`, eagerly drain `contents` into a `Uint8Array` buffer. Pros: simple (~20 lines), matches what P2 adapter already does. Cons: breaks streaming-large-bodies use case, doubles memory for large requests.
  2. **ReadableStream with microtask yield**: Give `fetch()` a `ReadableStream` whose `pull()` yields control back to the JSPI scheduler via `new Promise(resolve => setTimeout(resolve, 0))` between chunks, allowing the guest task to resume and write. Pros: preserves streaming. Cons: requires understanding of JSPI task scheduling and may not work if JSPI doesn't resume on microtask boundaries.
  3. **Spec-aligned async task fork**: The Component Model async spec allows `task.spawn` to create independent subtasks. If jsco's executor supports subtask spawning, the two arms of the guest's `join!` could run as separate tasks. This is the architecturally correct fix but requires spec-complete subtask support.
- **Recommendation**: Start with option 1 (eager buffering). It unblocks all 13 artifacts immediately. File a follow-up for streaming support once JSPI task scheduling is better understood.
- **Effort**: Option 1: ~20 lines. Option 2: ~50 lines + testing. Option 3: large.
- **P3 validation variants**: Once send works, the validation-only variants (`invalid_dnsname`, `invalid_header`, `invalid_port`, `invalid_version`, `missing_path_and_query`, `timeout`, `unknown_method`, `unsupported_scheme`) also need host-side error mapping similar to what the P2 adapter already has in `adapterMapFetchError()`.
- **P3 `response_build`**: Additionally tests `Response::new()` constructor (building outgoing response with body stream). This may need a separate `HttpResponse` builder that the guest can construct client-side (not just receive from `fetch()`).

#### Step 9 — P3 `cli_serve_sleep`: handler task cancellation *(architectural)*
- **File**: `p3_cli_serve_sleep.component.wasm`
- **Issue**: Guest handler calls `monotonic_clock::wait_for(u64::MAX)` — sleeps forever. The `serve()` harness in `src/host/wasip3/node/http-server.ts` has a per-request timeout that closes the HTTP response after `requestTimeoutMs`, but does NOT cancel the guest's WASM task. The guest handler continues running (or rather, suspended on the clock pollable) even after the response is sent.
- **Fix**: Implement guest task cancellation. The `requestAc.abort()` signal needs to propagate into the async-lifted export trampoline so that the suspended `wait_for` pollable rejects. This requires:
  1. Thread an `AbortSignal` through the `handle(request)` call.
  2. When the signal fires, reject the pending waitable (clock pollable) to unblock the guest.
  3. The guest sees the cancellation as a trap (per spec: "task cancelled").
- **Alternative**: For the test only, accept that the handler hangs and just verify the HTTP response is a 504 timeout. Skip verifying guest cleanup.
- **Effort**: Full cancellation is large (touches waitable-set, async-lift trampoline, pollable). Test-only workaround is ~10 lines.

#### Step 10 — P3 `cli_many_tasks`: async-lower resource quota *(architectural)*
- **File**: `p3_cli_many_tasks.component.wasm`
- **Issue**: Guest makes 1000 raw `[async-lower]` calls to `wait_for()` in a tight loop. Per the Component Model spec, an implementation may impose a limit on in-flight async-lower operations and trap when exceeded. Wasmtime traps before the 1000th iteration. jsco has no such limit.
- **Fix**: Add a configurable `maxAsyncLowerCalls` counter to the canon built-in layer. On each `[async-lower]` (canon.lower with async), increment the counter. When it exceeds the limit, trap the instance. The counter resets when tasks complete.
- **Effort**: ~30 lines in canon built-in paths + wiring through `MarshalingContext`.

#### Step 11 — P2 `http_outbound_request_invalid_version`: HTTP/2 server fixture *(test infrastructure)*
- **File**: `p2_http_outbound_request_invalid_version.component.wasm`
- **Issue**: Guest requests HTTP/2 or an invalid HTTP version. The host must map this to the correct `error-code` variant. Node's `fetch()` over HTTP/1.1 may not surface the right error shape.
- **Fix**: Stand up a test fixture using `node:http2` server. The guest should get an `http-protocol-error` or similar from the host when it tries to speak HTTP/2 to a server that only supports HTTP/1.1 (or vice versa).
- **Effort**: ~30 lines for HTTP/2 fixture + error mapping.

## Motivation
`integration-tests/wasmtime/` contains **100 prebuilt component artifacts** drawn from the upstream wasmtime test-programs suite. Only ~12 are referenced from JSCO tests today (in [tests/host/wasip3/integration.test.ts](tests/host/wasip3/integration.test.ts), [tests/host/wasip3/sockets-integration.test.ts](tests/host/wasip3/sockets-integration.test.ts), [tests/host/wasip3/node/http-reactor-concurrent.test.ts](tests/host/wasip3/node/http-reactor-concurrent.test.ts)). The rest are spec-validated scenarios already on disk: TCP states, UDP `send_too_much`, file/dir sync, HTTP middleware chains, large posts, content-length, sockopts, `much_stdout`, `large_env`, ip-name-lookup, etc.

Wiring them is high coverage-per-effort and will surface real host bugs against scenarios upstream already considers canonical.

## Goal
Every `.component.wasm` in `integration-tests/wasmtime/` is either:
1. Exercised by at least one Jest test, OR
2. Listed in an explicit `KNOWN_UNSUPPORTED` allowlist with a one-line reason.

## Scope
- Read-only inventory of `integration-tests/wasmtime/*.component.wasm`.
- Parameterized "smoke" tests that exercise each unused artifact end-to-end where possible.
- Targeted fixes for any host gaps the smoke tests uncover (filed as separate PRs if non-trivial).

## Approach

### Step 1: Inventory
Build a small helper script (or inline `beforeAll`) that:
- Globs `integration-tests/wasmtime/*.component.wasm`.
- Cross-references against a `KNOWN_TESTED: Set<string>` extracted from existing test files.
- Cross-references against a `KNOWN_UNSUPPORTED: Map<string, string>` allowlist (initially empty).
- Throws if there are files in neither set — forces every artifact to be classified.

### Step 2: Parameterized smoke harness
For each WASIp3 component category, add a `test.each(...)` block that:
- `instantiateWasiComponent(file, {...})` with appropriate stdin/env/args/limits.
- Asserts a sensible end condition for the category:
  - **CLI**: completes without throwing (or throws expected `WasiExit`).
  - **HTTP outbound**: import host with a deterministic mock fetch, assert request shape.
  - **TCP/UDP**: skip on browser; on Node, use ephemeral loopback ports, assert connect/read/write.
  - **Filesystem**: VFS-mounted fixture dir, assert post-conditions.
  - **DNS / ip-name-lookup**: mock resolver, assert call shape.

### Step 3: Categorize and split files
Suggested test files (mirror existing layout):
- `tests/host/wasip3/cli-corpus.test.ts` — `p3_cli_*` family
- `tests/host/wasip3/http-corpus.test.ts` — `p3_http_*` family
- `tests/host/wasip3/sockets-corpus.test.ts` — `p3_sockets_*` family (Node-only)
- `tests/host/wasip3/filesystem-corpus.test.ts` — `p3_filesystem_*`, `p3_readdir`, `p3_file_write`
- `tests/host/wasip2-via-wasip3/p2-corpus.test.ts` — all `p2_*` files via the P2-via-P3 adapter

### Step 4: Triage failures
For each failure: classify as
- **Bug in JSCO host** → fix in this PR if small, file follow-up issue otherwise and add to `KNOWN_UNSUPPORTED` with issue link.
- **Test-harness gap** (wrong mock, wrong fixture) → fix.
- **Genuinely unsupported** (e.g. requires raw socket on browser) → add to `KNOWN_UNSUPPORTED`.

## Acceptance criteria
- [ ] No `.component.wasm` in `integration-tests/wasmtime/` is unaccounted for.
- [ ] CI runs the new corpus tests under both Debug and Release configurations.
- [ ] Test runtime increase is acceptable (target: under 60s added; use `--testPathIgnorePatterns` in slow workflows if needed).
- [ ] Any new `KNOWN_UNSUPPORTED` entry has a tracking issue.

## Risks
- Some `.component.wasm` files may need fixtures (e.g. specific stdin payloads, env vars) that the wasmtime test harness sets up in Rust and aren't documented in the wasm itself. Mitigation: cross-reference [d:\\wasmtime\\crates\\test-programs\\src\\bin\\](d:\\wasmtime\\crates\\test-programs\\src\\bin\\) source files (already noted in copilot-instructions) to recover the expected harness contract.
- Wasmtime tests sometimes assert on host-side state (e.g. files written, network bytes received) — port those assertions to JS or skip with a reason.

## Out of scope
- Building new wasm artifacts. Use only what's already on disk.
- Updating the wasmtime corpus to a newer commit — pin to current hash.

---

## Re-evaluation of KNOWN_UNSUPPORTED (May 2026)

Full audit of all 38 KNOWN_UNSUPPORTED entries. Each entry re-assessed against current host implementation state.

### Category A: P3 filesystem — RESOLVED (2 wired, 1 stream lifecycle issue)

| Artifact | Old reason | Outcome |
|----------|-----------|---------|
| `p3_filesystem_file_read_write` | host missing `[method]descriptor.write-via-stream` | ✅ **WIRED** — passes via `flattenResource()` |
| `p3_readdir` | host missing `[method]descriptor.read-directory` | ✅ **WIRED** — passes via `flattenResource()` |
| `p3_file_write` | host missing `[method]descriptor.write-via-stream` | ❌ Stream lifecycle: unused readable not auto-cancelled when future resolves with error |

**Resolution**: `createFilesystemTypes()` now uses `flattenResource()`. The root cause was that the old code returned `{ Descriptor: FsDescriptor }` which didn't expose flat `[method]descriptor.*` entries.

### Category B: P2 sockets — covered but not exercised via P2 adapter (13 artifacts, Step 2)

| Artifact | Old reason | Re-assessment |
|----------|-----------|---------------|
| `p2_tcp_bind` | covered by p3_sockets_tcp_bind | Adapter exists in `src/host/wasip2-via-wasip3/sockets.ts`. Running P2 variant tests the adapter layer + P2 WIT interface. |
| `p2_tcp_connect` | covered by p3 | Same |
| `p2_tcp_listen` | covered by p3 | Same |
| `p2_tcp_sample_application` | covered by p3 | Same |
| `p2_tcp_sockopts` | covered by p3 | Same |
| `p2_tcp_states` | covered by p3 | Same |
| `p2_tcp_streams` | covered by p3 | Same |
| `p2_udp_bind` | covered by p3 | Same |
| `p2_udp_connect` | covered by p3 | Same |
| `p2_udp_sample_application` | covered by p3 | Same |
| `p2_udp_sockopts` | covered by p3 | Same |
| `p2_udp_states` | covered by p3 | Same |
| `p2_ip_name_lookup` | covered by p3 | Same |

**Action**: Wire a `P2_SOCKETS` roster. These are self-contained test programs that exercise the full socket lifecycle. Node-only. Immediate benefit: tests the P2-via-P3 adapter layer that currently has zero test coverage for sockets.

### Category C: P2 API tests — fixable with targeted host changes (3 artifacts, Steps 3–6)

| Artifact | Old reason | Fix needed |
|----------|-----------|------------|
| `p2_api_read_only` | host always sets write:true | Add `fsFlags` to `HostConfig` (~15 lines) |
| `p2_api_time` | no fake-clock injection point | Add `clocks` config to `HostConfig` (~25 lines) |
| `p2_api_reactor` | parser bug: `ComponentTypeDefinedOwn` vs `ComponentTypeFunc` | Debug parser type resolution for `own<imported-resource>` in export signatures |

### Category D: P2 HTTP response builder (1 artifact, Step 5)

| Artifact | Old reason | Fix needed |
|----------|-----------|------------|
| `p2_http_outbound_request_response_build` | host missing `[method]outgoing-response.body` | Implement `AdapterOutgoingResponse` with `.body()` → write stream. Also needs validation methods (malformed method/authority/scheme/path with newlines). |

### Category E: P3 HTTP outbound — JSPI deadlock (14 artifacts, Step 8)

| Artifact | Old reason | Recommended fix |
|----------|-----------|-----------------|
| `p3_http_outbound_request_get` | JSPI deadlock | Eager body buffering in `sendImpl` |
| `p3_http_outbound_request_post` | JSPI deadlock | Same |
| `p3_http_outbound_request_put` | JSPI deadlock | Same |
| `p3_http_outbound_request_content_length` | JSPI deadlock | Same |
| `p3_http_outbound_request_large_post` | JSPI deadlock | Same |
| `p3_http_outbound_request_invalid_dnsname` | needs DNS-failure mapping | After deadlock fix: map fetch `TypeError` with `ENOTFOUND` → `dns-error` |
| `p3_http_outbound_request_invalid_header` | needs HTTP/2 server | After deadlock fix: may work with fetch's own header validation |
| `p3_http_outbound_request_invalid_port` | needs port-validation | After deadlock fix: map fetch error → `connection-refused` or similar |
| `p3_http_outbound_request_invalid_version` | needs HTTP/2 server | May need HTTP/2 fixture (Step 11) |
| `p3_http_outbound_request_missing_path_and_query` | needs raw-socket-level error | After deadlock fix: validate path before fetch |
| `p3_http_outbound_request_timeout` | needs slow-response server | After deadlock fix: use echo server with delayed response |
| `p3_http_outbound_request_unknown_method` | client-side method validation | After deadlock fix: host should validate method before fetch |
| `p3_http_outbound_request_unsupported_scheme` | client-side scheme validation | After deadlock fix: host should validate scheme before fetch |
| `p3_http_outbound_request_response_build` | client-side response builder | After deadlock fix + `Response` constructor for client-side use |
| `p3_http_proxy` | blocked by JSPI deadlock | Service export that proxies outbound — unblocked by deadlock fix |

**Note**: The 5 validation-only variants (`unknown_method`, `unsupported_scheme`, `missing_path_and_query`, `invalid_port`, `invalid_dnsname`) may work even with the deadlock if the validation happens *before* the `fetch()` call. The guest might construct a request, set invalid fields, and assert the host returns an error on `set_*` — never reaching `send()`. Need to verify each guest's code path.

### Category F: P3 cancellation / limits (2 artifacts, Steps 9–10)

| Artifact | Old reason | Fix needed |
|----------|-----------|------------|
| `p3_cli_serve_sleep` | infinite sleep, needs cancel/abort | Handler task cancellation: propagate `AbortSignal` into suspended waitable |
| `p3_cli_many_tasks` | resource quota (1000 async-lower calls) | Add `maxAsyncLowerCalls` counter in canon built-in layer |

### Category G: P2 HTTP invalid_version (1 artifact, Step 11)

| Artifact | Old reason | Fix needed |
|----------|-----------|------------|
| `p2_http_outbound_request_invalid_version` | needs HTTP/2 server | Node `http2.createServer` fixture + version mismatch error mapping |

---

## Path to zero KNOWN_UNSUPPORTED — execution order

| Phase | Steps | Artifacts unblocked | Cumulative tested |
|-------|-------|-------------------|-------------------|
| **Phase 1: Quick wins** | Steps 1–2 | 16 (3 filesystem + 13 sockets) | 81 / 103 |
| **Phase 2: Small host changes** | Steps 3–5 | 3 (read_only + time + response_build) | 84 / 103 |
| **Phase 3: Parser fix** | Step 6 | 1 (api_reactor) | 85 / 103 |
| **Phase 4: HTTP deadlock fix** | Step 8 | 14 (all P3 HTTP outbound + proxy) | 99 / 103 |
| **Phase 5: Socket edge case** | Step 7 | 1 (udp_send_too_much) | 100 / 103 |
| **Phase 6: Architectural** | Steps 9–11 | 3 (serve_sleep + many_tasks + invalid_version) | 103 / 103 |

**Phase 1** is pure test wiring — no host changes, immediate ROI.
**Phase 2** requires small, localized host config additions.
**Phase 4** is the single biggest unlock — 14 artifacts from one `sendImpl` fix.
**Phase 6** requires deeper architectural work but covers the final 3 artifacts.
