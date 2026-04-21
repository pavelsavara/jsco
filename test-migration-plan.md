# Test Migration Plan: wasip2 → wasip2-via-wasip3

## Status: MOSTLY COMPLETE (as of 2026-04-21)

The `src/host/wasip2/` directory has been fully removed. All production code now routes through the P3 host + P2-via-P3 adapter. Most test files have been migrated.

## Current State

| Layer | Host creation | Tests exist? |
|-------|--------------|--------------|
| **CLI** (`main.ts`) | `createWasiP3Host()` → `createWasiP2ViaP3Adapter()` | ❌ cli-conformance, cli-integration NOT migrated to `tests/` |
| **Library** (`index.ts`) | `loadWasiP3Host()` → `loadWasiP2ViaP3Adapter()` | ✅ `src/index.test.ts` uses adapter |
| **P2-via-P3 unit tests** | `createMockP3()` → `createWasiP2ViaP3Adapter()` | ✅ 14 test files in `wasip2-via-wasip3/` |
| **P2-via-P3 integration tests** | `createWasiP3Host()` → `createWasiP2ViaP3Adapter()` | ✅ `integration.test.ts`, `echo-reactor.test.ts`, etc. |
| **P2-via-P3 Node adapter** | Node.js extensions | ⚠️ filesystem + http-server tested, sockets NOT tested |

## Remaining Gaps

1. **`src/host/wasip2-via-wasip3/node/sockets.test.ts`** — Node.js socket adapter tests not created
2. **`tests/cli-conformance.test.ts`** — CLI conformance tests not migrated (tests wasmtime reference binaries via built CLI)
3. **`tests/cli-integration.test.ts`** — CLI integration tests not migrated (tests --help, run, serve, etc.)

## Architecture of Migrated Tests

```
                 Unit Tests                    Integration Tests
                 ──────────                    ─────────────────
  createMockP3()                    createWasiP3Host(p3Config)
        │                                       │
        ▼                                       ▼
  createWasiP2ViaP3Adapter(p3)     createWasiP2ViaP3Adapter(p3)
        │                                       │
        ▼                                       ▼
  Assert P2 interface behavior     component.instantiate(p2Imports)
                                   Assert WASM component behavior
```

## Files to Migrate

### Tier 1 — Unit Tests ✅ COMPLETE

All unit test files migrated to `wasip2-via-wasip3/`.

| Source file | Target file | Status |
|-------------|-------------|--------|
| `wasip2/cli.test.ts` | `wasip2-via-wasip3/cli.test.ts` | ✅ |
| `wasip2/random.test.ts` | `wasip2-via-wasip3/random.test.ts` | ✅ |
| `wasip2/monotonic-clock.test.ts` | `wasip2-via-wasip3/monotonic-clock.test.ts` | ✅ |
| `wasip2/wall-clock.test.ts` | `wasip2-via-wasip3/wall-clock.test.ts` | ✅ |
| `wasip2/poll.test.ts` | `wasip2-via-wasip3/poll.test.ts` | ✅ |
| `wasip2/streams.test.ts` | `wasip2-via-wasip3/streams.test.ts` | ✅ |
| `wasip2/filesystem.test.ts` | `wasip2-via-wasip3/filesystem.test.ts` | ✅ |
| `wasip2/http.test.ts` | `wasip2-via-wasip3/http.test.ts` | ✅ |
| `wasip2/wasi-host.test.ts` | `wasip2-via-wasip3/wasi-host.test.ts` | ✅ |

### Tier 2 — Integration Tests ✅ COMPLETE

All integration test files migrated.

| Source file | Target file | Status |
|-------------|-------------|--------|
| `wasip2/echo-reactor.test.ts` | `wasip2-via-wasip3/echo-reactor.test.ts` | ✅ |
| `wasip2/hello-world.test.ts` | `wasip2-via-wasip3/hello-world.test.ts` | ✅ |
| `wasip2/integration.test.ts` | `wasip2-via-wasip3/integration.test.ts` | ✅ |
| `wasip2/use-number-for-int64.test.ts` | `wasip2-via-wasip3/use-number-for-int64.test.ts` | ✅ |

### Tier 3 — CLI Tests ❌ NOT MIGRATED
const wasiExports = createWasiP2Host({
    stdout: (bytes) => { chunks.push(new Uint8Array(bytes)); },
});

// Adapter style:
const chunks: Uint8Array[] = [];
const p3 = createWasiP3Host({
    stdout: new WritableStream({
        write(chunk) { chunks.push(new Uint8Array(chunk)); },
    }),
});
const wasiExports = createWasiP2ViaP3Adapter(p3);
```

### Tier 3 — CLI Tests ❌ NOT MIGRATED

The original files in `src/host/wasip2/` have been deleted but the test files were never recreated at the planned locations.

| Source file | Planned target | Status |
|-------------|----------------|--------|
| `wasip2/cli-conformance.test.ts` | `tests/cli-conformance.test.ts` | ❌ Not created |
| `wasip2/cli-integration.test.ts` | `tests/cli-integration.test.ts` | ❌ Not created |

These tests exercise the CLI (`main.ts`) via subprocess, testing wasmtime reference binaries and CLI argument parsing. Since `main.ts` already routes through P3 host + adapter, the tests just need to be recreated at the new locations with updated import paths.

## Shared Test Infrastructure

### Extract `createMockP3()` to shared helper

The existing `createMockP3()` in `adapter.test.ts` should be extracted to a shared file:

**New file:** `wasip2-via-wasip3/test-helpers.ts`

Contents:
- `createMockP3(overrides?)` — current mock from adapter.test.ts
- Any shared type helpers needed across test files

### Integration test helper

For Tier 2 tests, create a thin helper mirroring `wasip2/integration-helpers.ts`:

**New file:** `wasip2-via-wasip3/integration-helpers.ts`

Contents:
- Reuse/copy from `wasip2/integration-helpers.ts`
- Replace `createWasiP2Host(config)` with `createWasiP2ViaP3Adapter(createWasiP3Host(p3Config))`
- Inline config conversion (callback stdout → WritableStream)

## Test Differences from P2 Originals

### Behavioral differences to expect

| Area | P2 direct | P2-via-P3 adapter | Impact |
|------|-----------|-------------------|--------|
| **Streams** | Synchronous buffer with cursor | Async pump from P3 ReadableStream → internal buffer | May need `await` + setTimeout for data availability in stdin tests |
| **Polling** | Direct pollable creation | Pollable wrapping P3 Promise | `ready()` may need a microtask tick to resolve |
| **Filesystem** | Direct VFS operations | P3 descriptor → P2 adapter wrapper | Same semantics but through extra layer |
| **Clocks** | Direct `performance.now()` | P3 clock → adapter mapping | `resolution()` maps to `getResolution()` |
| **HTTP** | Direct Fields/Request objects | Adapter-created wrapper objects | Same API shape |

### Tests that may need adaptation

1. **streams.test.ts** — P2 `createInputStream(buffer)` creates a synchronous buffer. Adapter creates async-pumped stream from P3. Tests checking immediate data availability may need `await` for pump completion.
2. **poll.test.ts** — Adapter pollables wrap P3 promises. Tests for `createSyncPollable` / `createAsyncPollable` need to test adapter's versions instead.
3. **filesystem.test.ts** — P2 tests use `createWasiFilesystem(fileMap)` directly. Adapter tests need P3 filesystem with same file map, then adapter wrapping. P3 filesystem API differs (stream-based read/write).

## Migration Order — ✅ ALL COMPLETED (except CLI)

Steps 1–15 are complete. All adapter unit tests and integration tests exist in `wasip2-via-wasip3/`.

## Remaining Work

| Task | Priority |
|------|----------|
| Create `tests/cli-conformance.test.ts` | Medium — exercises wasmtime reference binaries through built CLI |
| Create `tests/cli-integration.test.ts` | Medium — exercises CLI arg parsing, --help, run, serve |
| Create `src/host/wasip2-via-wasip3/node/sockets.test.ts` | Low — Node.js TCP/UDP/DNS through adapter chain |
