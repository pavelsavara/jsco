# Plan 1: Wire the unused `integration-tests/wasmtime/*.component.wasm` corpus

## Status: Largely complete (May 2026)

Implemented in [tests/host/wasip3/wasmtime-corpus.test.ts](tests/host/wasip3/wasmtime-corpus.test.ts).

- ✅ Inventory test (`every .component.wasm is classified`) enforces that every artifact in `integration-tests/wasmtime/` is in `KNOWN_TESTED`, `KNOWN_UNSUPPORTED`, or owned by a smoke-test roster. Also fails on stale allowlist entries.
- ✅ P2 CLI smoke roster (`P2_CLI_SIMPLE`) wires 14 artifacts (hello_stdout, exit_*, args, argv0, env, default_clocks, sleep, much_stdout, large_env, random, sleep, export_cabi_realloc) with dedicated assertions on captured stdout/stderr where relevant.
- ✅ P2 HTTP outbound roster (`P2_HTTP_OUTBOUND`) runs `get`/`post`/`put`/`large_post` against an out-of-process `jsco serve echo-server-p3` fixture (see [tests/test-utils/echo-server-fixture.ts](tests/test-utils/echo-server-fixture.ts)).
- ✅ Echo-server-p3 fixture smoke tests verify the wasmtime echo wire contract (method/uri/content-length pass-through) end-to-end via `fetch()`.
- ✅ `KNOWN_TESTED` (~25 entries) cross-references existing tests in `integration.test.ts`, `sockets-integration.test.ts`, and `node/http-reactor-concurrent.test.ts`.
- ✅ `KNOWN_UNSUPPORTED` (~50 entries) — every excluded artifact has a one-line reason; the larger gaps (P3 HTTP outbound JSPI deadlock, P3 filesystem `[method]descriptor.*` imports, P2 HTTP error-mapping, service-export/middleware harness, P2 file/dir preopen fixtures) are diagnosed individually.

### Outstanding work — prioritized (easiest → hardest)

Each step below moves entries out of `KNOWN_UNSUPPORTED` and into a live roster. Steps are ordered by effort: cheap fixture/test-harness wiring first, then host-side bug fixes, then larger architectural gaps.

#### Step 1 — P2 CLI: panic→exit-code mapping *(test-harness fix, no host change)*
- **File**: `p2_cli_exit_panic.component.wasm`
- **Issue**: Rust `panic!()` lowers to wasm `unreachable`, surfacing as `RuntimeError`; wasmtime maps it to exit-code 1.
- **Fix**: In `runP2`, treat a `RuntimeError`/`WebAssembly.RuntimeError` from `run.run()` the same way `WasiExit` is treated — return exit-code 1. Add `p2_cli_exit_panic` to `P2_CLI_SIMPLE` with expected exit 1.
- **Effort**: ~10 lines.

#### Step 2 — P2 stdin family *(harness only)*
- **Files**: `p2_cli_stdin.component.wasm`, `p2_cli_stdin_empty.component.wasm`, `p2_cli_stdio_write_flushes.component.wasm`, `p2_stream_pollable_correct.component.wasm`
- **Fix**: Wire a `stdin: ReadableStream` in the cfg factory with the exact byte payload each guest expects (cross-reference [d:\\wasmtime\\crates\\test-programs\\src\\bin\\](d:\\wasmtime\\crates\\test-programs\\src\\bin\\) for each).
- **Effort**: ~5 lines per guest plus byte-level fixture data.

#### Step 3 — P2 file/dir preopen fixtures *(harness only, VFS already exists)*
- **Files**: `p2_cli_file_read`, `p2_cli_file_append`, `p2_cli_file_dir_sync`, `p2_cli_directory_list`, `p2_api_read_only`
- **Fix**: Build a small in-memory VFS preopen helper (or reuse the existing one if any) that seeds `bar.txt` / `foo.txt` / `/sub/*` at known offsets. Mount it via the host's preopen config. No host code change.
- **Effort**: One shared fixture helper + one test per artifact.

#### Step 4 — P2 reactor + clock fixtures *(harness only)*
- **Files**: `p2_api_reactor.component.wasm`, `p2_api_time.component.wasm`
- **Fix**: `p2_api_reactor` exports a custom `test-reactor` world with `add-strings`; build a tiny adapter that calls it and asserts the merged result. `p2_api_time` needs a fake-clock host config returning a fixed `Instant`/`SystemTime`.
- **Effort**: Per-guest, isolated.

#### Step 5 — P3 service exports (handler/serve) *(harness only)*
- **Files**: `p3_cli_serve_hello_world`, `p3_api_proxy`, `p3_http_proxy`, `p3_http_middleware`, `p3_http_middleware_with_chain`, `p3_cli_serve_sleep`
- **Fix**: Layer a `Request`-builder harness on top of the existing `wasi:http/handler.handle` trampoline (already covered by `p3_http_echo`). Call into the guest's `handle` export with a synthetic request, assert response shape. `p3_cli_serve_sleep` additionally needs a cancel/abort signal.
- **Effort**: One shared harness + one test per artifact.

#### Step 6 — P2 HTTP client-side validation variants *(harness with fault injection)*
- **Files**: `p2_http_outbound_request_unknown_method`, `_unsupported_scheme`, `_response_build`, `_missing_path_and_query`, `_invalid_port`
- **Fix**: These assert the *client-side* (host) maps malformed inputs to specific `wasi:http/types::error-code` variants. Add assertions in the host's outgoing-handler validator and wire each guest with the echo-server fixture; the guest will exit 0 if the host returns the expected error code.
- **Effort**: Small host-validation additions + per-guest test.

#### Step 7 — P2 HTTP server-shape error fixtures *(needs HTTP/2 + slow server)*
- **Files**: `p2_http_outbound_request_invalid_header`, `_invalid_version`, `_invalid_dnsname`, `_timeout`, `_content_length`
- **Fix**: Stand up an HTTP/2-capable test server (Node's `http2.createServer`) plus a slow-response fixture. `_invalid_dnsname` needs DNS-failure mapping in the resolver path. `_content_length` needs the host to validate body length on `outgoing-body.finish` / `blocking-write`.
- **Effort**: One shared fixture (HTTP/2 + delayed-response) + small host validator additions.

#### Step 8 — Host fix: P3 filesystem `[method]descriptor.*` imports *(real host gap)*
- **Files**: `p3_filesystem_file_read_write`, `p3_file_write`, `p3_readdir`
- **Fix**: `src/host/wasip3/filesystem.ts` registers the `Descriptor` resource class but does not register the flat method imports (`[method]descriptor.write-via-stream`, `read-via-stream`, `read-directory`, etc.). Implement them on top of the existing VFS layer, then move artifacts into `P3_FS_SIMPLE`.
- **Effort**: Medium — mirror the WASIp2 filesystem implementation but with stream-typed signatures.

#### Step 9 — Host fix: P3 HTTP outbound JSPI deadlock *(real host bug)*
- **Files**: 12 × `p3_http_outbound_request_*.component.wasm`
- **Issue**: `client::send(request)` in `src/host/wasip3/http.ts` deadlocks when the guest passes `Some(contents_rx)` for an unwritten body — `fetch().pull()` awaits the wasi stream while the guest only writes to `contents_tx` *after* `send` returns. Under JSPI, the wasm task is suspended awaiting `send`, so it never gets to write.
- **Fix**: Decouple body-streaming from request dispatch. Either:
  - Buffer the body before calling `fetch` (simple, breaks streaming-large-bodies), OR
  - Hand `fetch` a `ReadableStream` that pulls from `contents_rx` on a *different* JS microtask so the suspended wasm task resumes between writes (correct, requires careful task-state preservation — see `per-task-mctx-field-swap` memory).
- **Effort**: Large. Wire all 12 artifacts into a `P3_HTTP_OUTBOUND` roster after the fix.

#### Step 10 — Resource-quota / cancellation harness *(architectural)*
- **File**: `p3_cli_many_tasks.component.wasm`
- **Issue**: Guest is designed to trap after 1000 `[async-lower]` calls — exercises the spec's resource-quota path. Host needs a counter and trap-on-overflow plumbed through the canon builtins.
- **Fix**: Add the quota counter; assert the guest traps at exactly 1000.
- **Effort**: Largest — touches canon-builtin call paths.

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
