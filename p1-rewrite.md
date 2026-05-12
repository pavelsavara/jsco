## P1 Adapter Review

### Architecture

The P1 adapter (`wasip1-via-wasip3`, ~1,523 lines total) does **NOT** go through P3's public API at all. Despite the name, it directly uses the shared `MemoryVfsBackend` and `resolvePathComponents` from vfs.ts, and implements its own clock/random/poll logic from scratch using browser primitives (`Date.now()`, `performance.now()`, `crypto.getRandomValues`).

### What it duplicates

| Area | P1 implementation | P3 implementation | Duplication? |
|------|------------------|-------------------|--------------|
| **Filesystem** | Calls `MemoryVfsBackend` directly, does its own iovec scatter/gather + position tracking + fd table | P3's filesystem.ts wraps the same VFS with `Descriptor` class, stream-based read/write | **Shared VFS backend** — no logic duplication, just different ABI surfaces |
| **Clocks** | `Date.now()` + `performance.now()` → raw i64 nanoseconds written to linear memory | P3's clocks.ts does the same `Date.now()`/`performance.now()` calls wrapped in WIT interface shape | **Trivial duplication** (~40 lines; both do the same 2-line time calls) |
| **Random** | `crypto.getRandomValues()` directly into linear memory | P3's random.ts does `crypto.getRandomValues()` into a `Uint8Array` | **Trivial duplication** (~9 lines) |
| **Args/Env/Exit** | Serializes args/env from arrays directly into linear memory with null terminators | P3 just returns the arrays | **No duplication** — P1's job is ABI serialization, P3 returns JS objects |
| **Error mapping** | `vfsErrorToErrno()`: VfsError code → WASI P1 numeric errno | P3 filesystem.ts: VfsError → WIT `error-code` variant | **Parallel but not duplicated** — different target types |
| **Poll** | `poll_oneoff`: instant-ready stub (always fires all subscriptions immediately) | P3 has no poll — uses Promises/CM async | **Unique to P1** — P3 has no equivalent |
| **Sockets** | Returns `ENOTSUP` for all 4 functions | P3 browser stubs throw `not-supported` | **Same logic, different ABI** — trivial |

### Gaps in functionality

| Gap | Severity | Description |
|-----|----------|-------------|
| **`poll_oneoff` doesn't actually wait** | **High** | Clock subscriptions resolve instantly (no sleep). FD read/write subscriptions always report "ready". This means any P1 guest doing `sleep()` or blocking I/O via poll will spin rather than wait. |
| **No stdin blocking read** | **Medium** | `fd_read` on stdin drains `stdinChunks[]` synchronously. If empty, returns 0 bytes (EOF). No way to block until data arrives. Guests expecting interactive stdin will see immediate EOF. |
| **No network/sockets** | **Low** | All `sock_*` return `ENOTSUP`. (Same as P3 browser stubs — this is by design.) |
| **`fd_advise`/`fd_allocate`** | **Low** | `fd_advise` is a no-op (correct per spec), `fd_allocate` returns `ENOTSUP` (should probably do nothing for in-memory files). |
| **No file locking** | **Low** | No `fd_fdstat_set_rights` enforcement — rights are accepted but never checked. |
| **`clock_time_get` ignores precision** | **Negligible** | The `precision` parameter is ignored. This matches wasmtime behavior. |
| **Symlink follow in `path_filestat_get`** | **Low** | The `followSymlinks` flag is parsed but not actually used differently — both branches call `ctx.vfs.stat(resolved)`. The VFS itself may or may not auto-resolve symlinks. |
| **No `proc_raise`** | **Negligible** | Not part of `wasi_snapshot_preview1` — this is fine. |

### The "via-wasip3" naming is misleading

The P1 adapter doesn't actually route through P3's public API. It:
- Imports `MemoryVfsBackend` and `resolvePathComponents` directly from P3's VFS module
- Implements clocks, random, and poll from browser primitives
- Does its own ABI serialization (scatter-gather iovecs, struct packing into linear memory)

This is architecturally correct — going P1 → P2 → P3 would add unnecessary overhead for what is essentially just "write i32 errno codes and pack structs into linear memory". The P1 ABI is fundamentally different (raw memory offsets) from P2/P3 (Component Model typed values).

### Summary

**Duplication**: Minimal. Only clocks and random (~50 lines total) repeat the same browser API calls that P3 does. This is acceptable — the alternative (calling through P3's typed interface then re-serializing to i32/i64) would add overhead with no benefit.

**Gaps**: The main gap is `poll_oneoff` being a no-wait stub. Any P1 guest that relies on `poll_oneoff` for sleeping or blocking I/O will busy-spin. Fixing this would require JSPI integration (throw a `JspiBlockSignal` with a timeout Promise for clock subscriptions).

Completed: *Review P1 adapter for duplication and gaps* (1/3)