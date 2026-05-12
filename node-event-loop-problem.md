# Node.js Event Loop / JSPI Scheduling Problem

## Summary

WASM components running under JSPI (JavaScript Promise Integration) can starve the Node.js event loop, preventing I/O callbacks from firing between synchronous WASM calls. This causes OOM crashes and hangs in tests that depend on timely TCP/UDP event delivery.

## How JSPI Works

When a WASM component calls a JS import that returns a Promise, JSPI **suspends** the WASM stack and returns control to the JS event loop. When the Promise resolves, JSPI **resumes** the WASM stack.

The critical constraint: **microtasks and I/O callbacks do not run while WASM is executing synchronously.** They only run when WASM suspends (via JSPI) or returns to JS.

## The Problem

### Canonical ABI calls are synchronous

The component model's `stream.read()`, `stream.write()`, `cancel-read()`, and `cancel-write()` are **synchronous** calls from WASM into JS. They return integer status codes, not Promises. JSPI does not suspend on these.

Only `waitable-set.wait()` returns a Promise (when no events are ready), causing JSPI to suspend.

### Synchronous bursts between suspensions

Between two `wait()` suspensions, WASM can make thousands of synchronous calls:

```
wait() → JSPI suspends → event loop tick → JSPI resumes
  ↓
write() → COMPLETED     (synchronous, no event loop tick)
write() → COMPLETED     (synchronous, no event loop tick)
write() → COMPLETED     (synchronous, no event loop tick)
...hundreds more...
write() → BLOCKED       (buffer full, synchronous)
wait() → events ready → returns synchronously! (no event loop tick)
  ↓
write() → COMPLETED     (another burst begins...)
```

When `wait()` finds events already ready (e.g. write-space available), it returns the count **synchronously** — no Promise, no JSPI suspend, no event loop tick. This means WASM can loop through `write → wait → write → wait` thousands of times without ever yielding to the event loop.

### Consequences

1. **Socket errors don't propagate**: TCP RST/FIN are discovered during libuv I/O polling. Node.js updates socket state via event callbacks (`'error'`, `'end'`). These callbacks can't fire during synchronous WASM execution. The guest keeps writing to a dead socket.

2. **Data doesn't flow through async chains**: Data from guest writes must traverse multiple async hops before reaching the guest reader:
   ```
   guest write → stream entry A → makeAsyncIterable (microtask) → send() →
   socket.write() (I/O) → TCP → 'data' event (I/O) → pumpIterable (microtask) →
   stream entry B → guest read
   ```
   Each hop requires an event loop tick. But between `wait()` calls, no ticks happen.

3. **Tight synchronous loops**: When `read()` returns `BLOCKED` and the guest immediately calls `cancel-read()`, this creates a tight loop that never yields. Millions of iterations allocate small objects faster than GC can collect them → OOM.

## Affected Tests

### `test_tcp_send_drops_stream_when_remote_shutdown`

- **Source**: `d:\wasmtime\crates\test-programs\src\bin\p3_sockets_tcp_streams.rs` (line ~91)
- **Pattern**: `drop(server)` then loop `client.send_stream.write("undeliverable")` until `StreamResult::Dropped`
- **Problem**: Socket error (from server drop) only fires during I/O callbacks. Guest writes ~35k times synchronously before error propagates. With backpressure limiting buffer to 64KB, it eventually passes but slowly.

### `test_tcp_read_cancellation`

- **Source**: `d:\wasmtime\crates\test-programs\src\bin\p3_sockets_tcp_streams.rs` (line ~212)
- **Pattern**: `join!` of a sender (8192 × 256-byte writes) and a receiver using poll-once-cancel:
  ```rust
  let mut fut = pin!(server.receive_stream.read(buf));
  match fut.as_mut().poll(&mut cx) {
      Poll::Ready(pair) => pair,
      Poll::Pending => fut.cancel(),  // cancel and retry
  }
  ```
- **Problem**: `read()` always returns `BLOCKED` (no data in buffer), then `cancel-read()` runs, then loop repeats — **2.5M+ iterations** with zero data ever arriving. The `read(Vec::new()).await` recovery path in the `Cancelled` branch never reaches our `stream.read` built-in (the CM short-circuits zero-length reads). Only 1 `wait()` call total observed vs 2.5M read/cancel cycles. OOM from short-lived object allocation.

### `p3_sockets_udp_connect`

- **Source**: `d:\wasmtime\crates\test-programs\src\bin\p3_sockets_udp_connect.rs`
- **Pattern**: `client.send(data, None).await` — the send future can't process data while WASM runs synchronously.
- **Problem**: Hang — the async send function never completes.

## What We Tried

### `setTimeout(0)` yield in `wait()` when events are already ready

Made `wait()` always return a Promise: `new Promise(resolve => setTimeout(() => resolve(count), 0))`.

**Result**: Did not help for `read_cancellation`. The tight `read → cancelRead` loop never calls `wait()` at all (only 1 `wait()` call observed total). The yield only helps if WASM actually calls `wait()`.

### `setTimeout(0)` yield in `wait()` when Promise resolves

Added `setTimeout` wrapper around the resolver callback in `wait()`.

**Result**: Helps for the `send_drops` case (more I/O ticks between write bursts), but irrelevant for `read_cancellation` (doesn't call `wait()`).

### Backpressure in stream buffer

Limits buffer to 64KB before returning `BLOCKED`.

**Result**: Prevents unbounded memory growth from writes, but doesn't help with the read/cancel loop (buffer is always empty on the read side).

### Synchronous socket error propagation

Close the stream entry from the socket `'error'` handler so `write()` sees `entry.closed` immediately.

**Result**: Can't help — the `'error'` handler itself only fires during an event loop tick, which doesn't happen during synchronous WASM execution.

## Root Cause

The fundamental mismatch: the component model's poll/cancel pattern assumes that **polling can observe state changes from concurrent async operations**. In native Wasmtime, the async executor can interleave futures. In JSPI, synchronous WASM calls can't observe any state changes until WASM yields via a Promise-returning import.

## Potential Solutions

1. **Make `stream.read()` return a Promise when buffer is empty** — forces JSPI suspend, gives event loop a tick. Breaks the canonical ABI contract (read is specified as synchronous returning `i32`).

2. **Limit synchronous iterations** — after N consecutive `read → BLOCKED → cancelRead` cycles without a `wait()`, artificially return `DROPPED` or force a yield. Semantically incorrect but prevents OOM.

3. **Batch event loop yields into `cancelRead`** — make `cancelRead` return a Promise every Nth call, forcing JSPI to suspend. Similar ABI concern.

4. **Cooperative scheduling at the CM level** — the component model's `task.yield` built-in (if available) could be used by the generated code to yield between poll attempts.

5. **Detect and break tight loops** — track consecutive `read BLOCKED → cancelRead` cycles per entry. After a threshold, inject a `setTimeout(0)` yield by making the next `read()` return a Promise instead of `BLOCKED`.
