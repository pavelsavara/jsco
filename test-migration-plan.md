# Test Migration Plan: wasip2 → wasip2-via-wasip3

## Goal

Migrate all tests from `src/host/wasip2/` to `src/host/wasip2-via-wasip3/` so that the P2-via-P3 adapter is exercised with the same coverage as the direct P2 host.

## Current State

| Layer | Host creation | Tests exist? |
|-------|--------------|--------------|
| **CLI** (`main.ts`) | `createWasiP3Host()` → `createWasiP2ViaP3Adapter()` | cli-conformance, cli-integration ✅ already test adapter path |
| **Library** (`instantiate.ts`) | `createWasiP2Host()` directly | N/A |
| **P2 unit tests** | `createWasiCli()`, `createWasiRandom()`, etc. | 14 test files in `wasip2/` |
| **Adapter tests** | `createMockP3()` → `createWasiP2ViaP3Adapter()` | 1 file (`adapter.test.ts`) with basic coverage |

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

### Tier 1 — Unit Tests (mock P3 → adapter → assert P2 behavior)

These test P2 interface behavior in isolation. Each gets a new file in `wasip2-via-wasip3/` using `createMockP3()` → `createWasiP2ViaP3Adapter()`.

| Source file | Target file | Notes |
|-------------|-------------|-------|
| `wasip2/cli.test.ts` | `wasip2-via-wasip3/cli.test.ts` | Reuse `createMockP3()` from adapter.test.ts (extract to shared helper). Test env, args, cwd, exit, stdin, stdout, stderr, terminal-* through adapter. |
| `wasip2/random.test.ts` | `wasip2-via-wasip3/random.test.ts` | Test getRandomBytes length, getRandomU64 range, insecure, insecure-seed through adapter. |
| `wasip2/monotonic-clock.test.ts` | `wasip2-via-wasip3/monotonic-clock.test.ts` | Test now(), resolution(), subscribeDuration() → pollable, subscribeInstant() → pollable through adapter. |
| `wasip2/wall-clock.test.ts` | `wasip2-via-wasip3/wall-clock.test.ts` | Test now() → WasiDatetime, resolution() through adapter. |
| `wasip2/poll.test.ts` | `wasip2-via-wasip3/poll.test.ts` | Test sync/async pollables, poll() array, JSPI blocking through adapter's `wasi:io/poll`. |
| `wasip2/streams.test.ts` | `wasip2-via-wasip3/streams.test.ts` | Test InputStream (read, skip, blockingRead, subscribe) and OutputStream (write, flush, checkWrite, blockingWriteAndFlush) through adapter. Stdin/stdout streams come from P3 mock → adapter. |
| `wasip2/filesystem.test.ts` | `wasip2-via-wasip3/filesystem.test.ts` | Test VFS tree construction, path resolution, descriptor operations, stat, read/write through full stack: real `createWasiP3Host({ fs })` → adapter. |
| `wasip2/http.test.ts` | `wasip2-via-wasip3/http.test.ts` | Test Fields, OutgoingRequest, OutgoingHandler through adapter's HTTP adaptation. |
| `wasip2/wasi-host.test.ts` | `wasip2-via-wasip3/wasi-host.test.ts` | Test that adapter output has all expected P2 interface keys, versioned aliases, kebab-case methods. |

**Pattern for each unit test file:**

```typescript
import { createWasiP2ViaP3Adapter } from './index';
import { createMockP3 } from './test-helpers'; // extracted shared mock

describe('wasi:FOO via P3 adapter', () => {
    it('...', () => {
        const p3 = createMockP3({ /* overrides */ });
        const p2 = createWasiP2ViaP3Adapter(p3);
        // same assertions as direct P2 tests
    });
});
```

### Tier 2 — Integration Tests (real P3 host → adapter → real WASM components)

These test real P2 WASM components running through the adapter. Each gets a new file using `createWasiP3Host()` → `createWasiP2ViaP3Adapter()`.

| Source file | Target file | Notes |
|-------------|-------------|-------|
| `wasip2/echo-reactor.test.ts` | `wasip2-via-wasip3/echo-reactor.test.ts` | Replace `createWasiP2Host()` with `createWasiP2ViaP3Adapter(createWasiP3Host())`. Same echo-reactor.wasm, same type round-trip assertions. |
| `wasip2/hello-world.test.ts` | `wasip2-via-wasip3/hello-world.test.ts` | Replace `createWasiP2Host({ stdout })` with adapter. P3 config uses `WritableStream` for stdout instead of callback — inline conversion. |
| `wasip2/integration.test.ts` | `wasip2-via-wasip3/integration.test.ts` | Replace host creation in integration-helpers pattern. All composition scenarios (A–L) should work through adapter. |
| `wasip2/use-number-for-int64.test.ts` | `wasip2-via-wasip3/use-number-for-int64.test.ts` | Replace host creation. Same echo-reactor.wasm, same int64 mode assertions. |

**Config conversion (inline, no helper):**

```typescript
// P2 style:
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

### Tier 3 — CLI Tests (already covered)

| Source file | Action | Notes |
|-------------|--------|-------|
| `wasip2/cli-conformance.test.ts` | **No migration needed** | CLI (`main.ts`) already uses `createWasiP3Host()` → `createWasiP2ViaP3Adapter()`. These tests already exercise the adapter path via subprocess. Verify this is still true. |
| `wasip2/cli-integration.test.ts` | **No migration needed** | Same — CLI already goes through adapter. Tests CLI arg parsing and help output. |

**Verification:** `main.ts` lines 53–60 confirm the CLI creates P3 host first, then wraps with adapter for P2 components.

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

## Migration Order

1. **Extract `createMockP3()`** to `test-helpers.ts`
2. **wasi-host.test.ts** — simplest, validates adapter structure
3. **random.test.ts** — pure passthrough, simplest behavior
4. **wall-clock.test.ts** — simple, few tests
5. **monotonic-clock.test.ts** — pollable creation, moderate complexity
6. **cli.test.ts** — env/args/exit passthrough + stdin/stdout streams
7. **poll.test.ts** — adapter's synthesized polling
8. **streams.test.ts** — most complex unit migration (async buffering)
9. **http.test.ts** — adapter HTTP wrappers
10. **filesystem.test.ts** — most complex unit migration (P3 descriptor adapter)
11. **hello-world.test.ts** — first real WASM integration
12. **echo-reactor.test.ts** — full type round-trip through adapter
13. **use-number-for-int64.test.ts** — int64 mode through adapter
14. **integration.test.ts** — multi-component composition through adapter
15. **Merge adapter.test.ts** — absorb remaining tests into the new files, delete adapter.test.ts

## Estimated New Files

| File | Type | Est. tests |
|------|------|-----------|
| `wasip2-via-wasip3/test-helpers.ts` | Shared infrastructure | — |
| `wasip2-via-wasip3/integration-helpers.ts` | Shared infrastructure | — |
| `wasip2-via-wasip3/cli.test.ts` | Unit | ~33 |
| `wasip2-via-wasip3/random.test.ts` | Unit | ~10 |
| `wasip2-via-wasip3/monotonic-clock.test.ts` | Unit | ~14 |
| `wasip2-via-wasip3/wall-clock.test.ts` | Unit | ~6 |
| `wasip2-via-wasip3/poll.test.ts` | Unit | ~18 |
| `wasip2-via-wasip3/streams.test.ts` | Unit | ~42 |
| `wasip2-via-wasip3/filesystem.test.ts` | Unit | ~40 |
| `wasip2-via-wasip3/http.test.ts` | Unit | ~30 |
| `wasip2-via-wasip3/wasi-host.test.ts` | Unit | ~35 |
| `wasip2-via-wasip3/echo-reactor.test.ts` | Integration | ~20 |
| `wasip2-via-wasip3/hello-world.test.ts` | Integration | ~5 |
| `wasip2-via-wasip3/use-number-for-int64.test.ts` | Integration | ~3 |
| `wasip2-via-wasip3/integration.test.ts` | Integration | ~12 |

**Total: ~268 tests across 15 new files**

## Decisions

1. **adapter.test.ts** → Merge its tests into the new per-interface files as the **last step** (step 15 in migration order). Delete adapter.test.ts when all its tests have been absorbed.

2. **Filesystem** → Test the **whole stack**: real `createWasiP3Host({ fs })` with VFS → adapter → P2 descriptor operations. No mocked P3 filesystem descriptors.

3. **Stream timing** → Accept `await` delays where the adapter's async pump needs time. In production, WASM components always go through JSPI which suspends/resumes automatically — the explicit `await` in tests is only needed because test code is plain JS, not WASM behind a JSPI boundary.
