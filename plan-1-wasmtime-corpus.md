# Plan 1: Wire the unused `integration-tests/wasmtime/*.component.wasm` corpus

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
