# Stream Write Call Chain: Guest → Host Socket

## 1. Guest WASM → Canonical ABI Dispatch

The guest calls `stream.write(handle, ptr, len)` — a core WASM import provided by the component model. The resolver in `src/resolver/core-functions.ts` creates the trampoline:

```
streamWriteFn(handle, ptr, len) → mctx.streams.write(typeIdx, handle, ptr, len)
```

This is a **synchronous** call from the guest's perspective — it returns an `i32` status code immediately.

## 2. Stream Table `write()` — Buffering + Backpressure

`src/runtime/stream-table.ts` copies bytes from WASM linear memory into a JS `Uint8Array` and pushes it to `entry.chunks[]`:

| Condition | Return value | Meaning |
|-----------|-------------|---------|
| `entry.waitingReader` exists | `(len << 4) \| 0` | **Fast path**: chunk handed directly to the host consumer, no buffering |
| `bufferedBytes < 64KB` | `(len << 4) \| 0` | Buffered successfully (`STREAM_STATUS_COMPLETED`) |
| `bufferedBytes >= 64KB` and no reader | `0xFFFFFFFF` | **`STREAM_BLOCKED`** — backpressure, guest must wait |
| Stream closed or missing | `(0 << 4) \| 1` | `STREAM_STATUS_DROPPED` |

The backpressure threshold is `STREAM_BACKPRESSURE = 65536` (64 KB), configurable via `RuntimeConfig.streamBackpressureBytes`.

## 3. When BLOCKED → Waitable-Set Async Wait

If the guest gets `STREAM_BLOCKED`, the p3 async calling convention kicks in. The guest's async lift wrapper (`src/resolver/component-functions.ts`) enters a loop:

1. Guest returns status `2 | (waitableSetId << 4)` ("I'm blocked, here's my waitable set").
2. The host calls `waitableSets.wait(setId, eventPtr)` — this returns a **`Promise<number>`** that suspends the JS execution.
3. The guest joins its writable handle (odd number) into the waitable set via `join(writHandle, setId)`.

In `src/runtime/waitable-set.ts`, `join()` wires up readiness:
- Calls `streamTable.onWriteReady(baseHandle, callback)` which registers in `entry.onWriteReady[]`.
- If the buffer already has space, marks `ready = true` immediately.

## 4. Host Consumer Drains the Buffer → Triggers Write-Readiness

The host side (socket, stdout, etc.) consumes the stream as an **`AsyncIterable`**. The stream table's `makeAsyncIterable()` or `pumpIterable()` provide iterator semantics:

- `iter.next()` pulls from `entry.chunks[]`.
- Each pull decrements `entry.bufferedBytes` and calls `checkWriteReady()`.
- `checkWriteReady()` fires all `entry.onWriteReady[]` callbacks when `bufferedBytes < threshold` or the stream closes.

## 5. Waitable-Set Resolves → Guest Resumes

When `checkWriteReady()` fires:
1. The waitable entry's `ready` flag becomes `true`.
2. The resolver callbacks in `entry.resolvers[]` fire.
3. The `wait()` **Promise resolves**, writing event `(EVENT_STREAM_WRITE=3, handle, returnCode)` to the guest's event buffer.
4. Guest wakes, retries `stream.write()` — buffer now has space, write succeeds.

## 6. Host Socket Write (Concrete I/O)

For TCP sockets in `src/host/wasip3/node/sockets.ts`:

```
send(data: WasiStreamReadable<Uint8Array>) → WasiFuture<void>
  └─ const iter = data[Symbol.asyncIterator]()
     └─ loop: result = await iter.next()     // pulls from stream table buffer
        └─ await socket.write(result.value)   // Node.js net.Socket I/O
     └─ await socket.end()                    // FIN
```

The `send()` method returns a **`WasiFuture<void>`** (backed by a Promise). The host iterates the `AsyncIterable` — each `iter.next()` either:
- Returns a buffered chunk immediately (if `entry.chunks[]` is non-empty), or
- Returns a **Promise** that suspends until the guest writes more data (via `entry.waitingReader` callback).

For stdout, `src/host/wasip3/stdio.ts` does `for await (const chunk of data) { writer.write(chunk) }`.

## Summary Flow

```
GUEST                          STREAM TABLE                    HOST (socket)
  │                              │                               │
  │─stream.write(h,ptr,len)────►│                               │
  │                              │─copy from linear memory       │
  │                              │─check backpressure            │
  │◄──COMPLETED or BLOCKED──────│                               │
  │                              │                               │
  │  [if BLOCKED]                │                               │
  │─join(writH, waitableSet)───►│                               │
  │─await wait(setId)──────────►│  (Promise suspends)           │
  │                              │                               │
  │                              │◄──iter.next()────────────────│
  │                              │──chunk──────────────────────►│
  │                              │  bufferedBytes decreases      │─socket.write()
  │                              │─checkWriteReady()             │
  │                              │──onWriteReady fires──►        │
  │                              │                               │
  │◄──Promise resolves──────────│  EVENT_STREAM_WRITE           │
  │─stream.write() retries─────►│                               │
  │◄──COMPLETED─────────────────│                               │
```

## Key Sync/Async Boundaries

- **Sync**: `stream.write()` call and return (i32 status)
- **Promise**: `waitableSets.wait()` suspends JS, resumes when buffer drains
- **AsyncIterable**: host pulls chunks from stream table via `for await`/`iter.next()`
- **Future**: `send()` returns a `WasiFuture<void>` (Promise wrapper) that resolves when all data is written to the network

## Constants

| Constant | Value | Meaning |
|----------|-------|---------|
| `STREAM_BACKPRESSURE` | 65536 | 64 KB threshold before blocking |
| `STREAM_BLOCKED` | 0xFFFFFFFF | Write cannot proceed, buffer full |
| `STREAM_STATUS_COMPLETED` | 0 | Success |
| `STREAM_STATUS_DROPPED` | 1 | Stream closed |
| `EVENT_STREAM_WRITE` | 3 | Waitable event: write side ready |

## Key Files

| File | Role |
|------|------|
| `src/resolver/core-functions.ts` | Canonical ABI dispatch for `stream.write` |
| `src/runtime/stream-table.ts` | Buffer management, backpressure, `pumpIterable()`, `makeAsyncIterable()` |
| `src/runtime/waitable-set.ts` | Event polling, `wait()`/`join()` for async resume |
| `src/runtime/constants.ts` | Status codes, event codes, thresholds |
| `src/binder/to-abi.ts` | Stream lifting (JS → WASM handle) |
| `src/binder/to-js.ts` | Stream lowering (WASM handle → JS AsyncIterable) |
| `src/marshal/lift.ts` | `streamLifting()` — `addReadable()` call |
| `src/marshal/lower.ts` | `streamLowering()` — `removeReadable()` call |
| `src/host/wasip3/node/sockets.ts` | TCP socket `send()` consuming stream |
| `src/host/wasip3/stdio.ts` | Stdout consuming stream |
