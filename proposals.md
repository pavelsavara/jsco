# Proposals: Fixing Node.js Event-Loop Starvation in JSPI Stream/Future Path

> **STATUS — Investigation Update (after attempting Proposal 1):**
> Proposal 1 as designed below **does not work** with the cargo-component / wit-bindgen async runtime. See **"Investigation Findings"** at the end of this file. The proposals below remain documented for context. A revised plan needs to be designed.

## Problem Recap

Two skipped tests in `tests/host/wasip3/sockets-integration.test.ts`:
- `p3_sockets_tcp_streams` — OOM in `test_tcp_read_cancellation` (2.5M `read → cancelRead` cycles without yielding).
- `p3_sockets_udp_connect` — `client.send(...).await` hangs.

Root cause (from `node-event-loop-problem.md`): all canonical-ABI stream/future ops are synchronous `i32`-returning calls. Only `waitable-set.wait()` returns a `Promise`, so JSPI only suspends there. When the guest enters a tight poll-once-cancel loop, `wait()` is never called and Node.js can't process I/O ticks. Sockets stay starved → loop stays starved → OOM/hang.

## Spec Check (sockets-explained.md vs WASI/CM)

`sockets-explained.md` correctly describes the implementation but understates one important freedom:

- The Component Model canonical ABI lets `stream.read`/`stream.write` return either a completed status (count > 0) or `BLOCKED` (`0xFFFFFFFF`). It does **not** prohibit the host from suspending the call instead of returning `BLOCKED`. From the guest's view, the import is still an `i32`-returning function — JSPI just stretches the call across an event-loop tick.
- `waitable-set.wait()` already exploits this: it returns a `Promise<number>` when no events are ready.
- The current jsco JSPI wiring (`createJspiWrappers` in `src/resolver/context.ts`) wraps every lowered import in `WebAssembly.Suspending`, so any host function may legitimately return a `Promise<i32>` and JSPI will suspend transparently. **The mechanism we need is already in place; we just don't use it for streams/futures/cancel.**

So `BLOCKED` is a *protocol-level optimization*, not the only legal return path. Suspending instead of returning `BLOCKED` is spec-conforming.

## Design Principle (from your answers)

1. **Fast path stays sync.** When data is ready / buffer has space, the call returns an `i32` immediately — no Promise, no microtask hop, no JSPI suspend. Performance unchanged for the non-blocking case.
2. **Slow path suspends.** When the call would otherwise return `BLOCKED`, it instead returns a `Promise<i32>` that resolves with the eventual completion code. JSPI suspends, the event loop runs, sockets/timers tick, and the Promise resolves.
3. **Non-JSPI fallback.** When `hasJspi() === false`, keep current behavior (return `BLOCKED` synchronously). Browsers without JSPI continue to work; they just can't run async-heavy components.

## Proposal 1: Suspending stream/future/cancel calls (primary fix)

### 1A. `stream.read` — suspend when buffer is empty

`src/runtime/stream-table.ts` `read()` currently:

```typescript
if (entry.closed) return (0 << 4) | STREAM_STATUS_DROPPED;
entry.pendingRead = { ptr, len };
return STREAM_BLOCKED;            // ← guest must wait() to find out when data arrives
```

Change to (pseudocode):

```typescript
if (entry.closed) return (0 << 4) | STREAM_STATUS_DROPPED;
if (!jspiAvailable) {
    entry.pendingRead = { ptr, len };
    return STREAM_BLOCKED;        // legacy path
}
return new Promise<number>((resolve) => {
    entry.pendingRead = { ptr, len, resolve };
    // existing onReady/data paths must call entry.pendingRead.resolve(code)
});
```

When `pumpIterable`/`waitingReader` delivers a chunk *and* `entry.pendingRead.resolve` is set, immediately fulfill the read using `fulfillPendingRead()` and resolve the Promise instead of just signalling the waitable-set. This collapses the two-step `BLOCKED → wait → fulfillPendingRead` dance into a single suspending call.

**Effect on the failing test:** the `read → cancelRead` poll loop can no longer spin — `read()` itself suspends until data arrives. The Rust `poll_fn` future now sees `Poll::Ready` on the first poll (because the JSPI suspend completes underneath the Rust executor's poll). `cancel_read` rarely runs, but the test only asserts on data correctness, not on cancel count.

### 1B. `stream.write` — suspend when buffer is full

`src/runtime/stream-table.ts` `write()` currently returns `STREAM_BLOCKED` when `bufferedBytes >= backpressureThreshold` and there's no waiting reader.

Change: if JSPI is available, return a `Promise<number>` that resolves once `checkWriteReady()` fires (buffer drained below threshold *or* stream closed). Reuse the existing `entry.onWriteReady[]` callback list — push the Promise's `resolve` and then call `write()` recursively (or inline the same logic) once space is available.

**Effect:** `test_tcp_send_drops_stream_when_remote_shutdown` no longer needs ~35k synchronous burst writes to discover the socket error; the first time the buffer fills, the guest yields → I/O tick fires → `'error'`/`'close'` runs → `entry.closed = true` → next write sees `DROPPED`.

### 1C. `future.read` / `future.write` — same treatment

`src/runtime/future-table.ts` returns `STREAM_BLOCKED` for not-yet-resolved futures. Apply the same pattern: return a `Promise<number>` that resolves when the future resolves.

This is the path that fixes `p3_sockets_udp_connect` if the hang turns out to be a future never being polled (TBD — see open questions).

### 1D. `cancel-read` / `cancel-write` — yield one tick

`stream-table.ts` `cancelRead()`/`cancelWrite()` currently return synchronously (`(0 << 4) | STREAM_STATUS_COMPLETED`).

If 1A is adopted, `cancelRead` becomes effectively unreachable on the read side (read suspends instead of returning BLOCKED). But for safety — and to match the spec's expectation that cancel "may have to wait for the cancellation to be observed" — wrap cancel returns in a `Promise.resolve(code)` *only when there is something to cancel*. Otherwise return sync.

This costs one microtask per real cancel call — negligible — and guarantees the loop yields even if a future combination still produces a synchronous BLOCKED somewhere we missed.

### Implementation surface

Files that need to change:

| File | Change |
|------|--------|
| `src/runtime/model/types.ts` | Widen return types: `read`/`write` → `number \| Promise<number>`; same for future ops |
| `src/runtime/stream-table.ts` | New helper `suspendOnBlocked(entry, kind, fn)`; modify `read`/`write`/`cancelRead`/`cancelWrite` |
| `src/runtime/future-table.ts` | Same pattern for read/write/cancel |
| `src/runtime/binding-context.ts` | Pass `hasJspi()` flag (or a `RuntimeConfig.suspendOnBlocked`) into table factories |
| `src/resolver/core-functions.ts` | No change required — `streamReadFn`/`streamWriteFn` already return whatever the table returns; JSPI wrapping at lower-side handles `Promise<number>` transparently |

### Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Some guest code may rely on observing `BLOCKED` (e.g. to issue `cancel-read` deterministically) | Provide a `RuntimeConfig.streamSuspendOnBlocked` (default `true`) that lets the user opt out per-instantiation |
| Unresolved Promise leaks if the entry is dropped while a read is pending | `dispose()` and `dropReadable()`/`dropWritable()` must walk `entry.pendingRead.resolve` (and the new write-side equivalent) and resolve them with `DROPPED` |
| AbortSignal aborts must reject/resolve any pending suspended call | Add `signal.addEventListener('abort', …)` per Promise creation, mirror what `makeAsyncIterable` already does |
| `wait()` ordering: if read suspends in 1A, the waitable-set never fires `EVENT_STREAM_READ` for that handle | OK — the spec says events are *one* way to learn of completion; direct return is also valid. The guest's async runtime sees the read complete naturally |

## Proposal 2: Runtime detection of "do we need to suspend?"

Per your follow-up: the call should stay synchronous when there's no problem. Concretely:

```typescript
// stream.read
const sync = readBufferedBytes(entry, ptr, len);   // existing fast path
if (sync !== STREAM_BLOCKED) return sync;          // data delivered → sync i32

// blocked: only suspend if (a) JSPI is available AND (b) the stream is open
if (entry.closed) return (0 << 4) | STREAM_STATUS_DROPPED;
if (!hasJspi() || config.streamSuspendOnBlocked === false) {
    entry.pendingRead = { ptr, len };
    return STREAM_BLOCKED;
}
return suspendForData(entry, ptr, len);            // Promise<number>
```

The decision is made per call, on the actual entry state. No wrapper-layer choices needed.

## Proposal 3: UDP send hang (TBD)

Marked TBD pending investigation. Likely candidates:

- The future returned by `client.send(data, None)` is constructed but never registered in a way that lets the guest's `await` see completion — i.e. the future-table side of the same starvation problem. Proposal 1C may resolve it once applied.
- Or: the UDP `send` host function pushes data to a stream that has no consumer, and the guest never gets a chance to drain — a different pattern that requires reading `src/host/wasip3/node/sockets.ts` UDP code.

Action item: investigate after Proposal 1 lands so we can re-test `p3_sockets_udp_connect` against the new suspending-stream/future behavior before designing UDP-specific fixes.

## Proposal 4: Test-side guard (defensive)

Independent of the runtime fix, add a "max sync canon ops between suspends" counter in Debug builds (guarded by `isDebug`, tree-shaken in Release). After N consecutive sync stream/future ops without any Promise return from any import, log a warning. This catches regressions where someone accidentally re-introduces a sync `BLOCKED` path that breaks JSPI scheduling.

## Recommended Order

1. **Implement Proposal 2 + 1A + 1B** (suspending stream `read`/`write` with sync fast path + JSPI detection). Re-run `p3_sockets_tcp_streams`. Expect pass.
2. **Implement 1C** (future read/write suspending). Re-run `p3_sockets_udp_connect`. If still hangs → Proposal 3 investigation.
3. **Implement 1D** (cancel-read/write yield) only if any test still spins.
4. **Add Proposal 4** as a Debug guard once green.
5. Update `sockets-explained.md` to document the suspending-on-blocked behavior and add a "Sync vs Promise return" decision table.

## Out of Scope (intentionally)

- Changing the canonical ABI `BLOCKED` return code — it remains the documented protocol value and the non-JSPI fallback.
- Browser polyfills for JSPI — non-JSPI path keeps `BLOCKED`, components requiring async sockets simply require JSPI.
- Cooperative `task.yield` injection by the guest — that's a guest-toolchain concern (cargo-component / wit-bindgen), not a host fix.

---

## Investigation Findings (2026-04, after attempting Proposal 1)

### Approach attempted
Implemented Proposal 1A end-to-end:
- Widened `StreamTable.read` to `number | Promise<number>`.
- Made `read()` return a `Promise<number>` when blocked AND `hasJspi()` is true.
- Added `WebAssembly.Suspending` wrap on the `stream.read` import in `core-functions.ts` so the WASM guest legally suspends on the returned Promise.
- Hooked `signalReady`/`dropReadable`/`cancelRead`/`dispose` to resolve the in-flight Promise.

### What broke
With the changes applied, **even `p3_cli_hello_stdout` hangs** — not just the originally-failing `p3_sockets_tcp_streams`.

Adding a debug log to `stream.read` revealed:

```
[DBG stream.read] handle=6 ptr=0 len=1 entry=true chunks=0 closed=false hasJspi=true
```

The guest issues `stream.read` once at startup (handle=6, len=1, no chunks, stream open). With JSPI suspension this returns a `Promise` that suspends the **entire WASM thread**. But `p3_cli_hello_stdout` is structured as:

```rust
let (mut tx, rx) = wit_stream::new();
futures::join!(
    async { wasi::cli::stdout::write_via_stream(rx).await.unwrap(); },
    async { tx.write(b"hello, world\n".to_vec()).await; drop(tx); },
);
```

Both arms run on a single-threaded `futures::join!` executor inside the WASM guest. When the host suspends the read mid-poll, the **other arm** (which would write "hello, world\n") cannot make progress, so the read never gets data, so the suspension never resolves. Deadlock.

### Why this is a fundamental incompatibility
Wit-bindgen's async runtime is a **cooperative single-threaded executor**. Its protocol is:
- `stream.read` is required to return synchronously: either ready data, `DROPPED`, or `BLOCKED`.
- On `BLOCKED`, the runtime registers a waker and **polls a different future**.
- Eventually the runtime calls `waitable-set.wait()` (the only place blocking is allowed).

`WebAssembly.Suspending` suspends the entire WASM execution. There is no way to suspend a *single Rust future* from the host side — when the host returns a Promise, every future in the guest's `join!` set is frozen.

### Implication for the failing tests

- **`p3_cli_hello_stdout` (passing on baseline)**: only stays passing if the host preserves the legacy `BLOCKED` return semantics.
- **`p3_sockets_tcp_streams` (skipped on baseline; OOM in `test_tcp_read_cancellation`)**: spins because the Rust test uses `Waker::noop()` and manually polls/cancels in a tight loop. The OS-preemption that lets this work on native wasmtime is absent in Node.js.

### What might still work
1. **Yield from `cancel-read` only.** Make `stream.cancel-read` return `Promise.resolve(code)` (Suspending wrap). This forces a microtask yield per cancel, letting the JS event loop process socket I/O. Would NOT break `cli_hello_stdout` because it never calls cancel. Would help `test_tcp_read_cancellation`'s tight loop.
2. **Yield from `waitable-set.wait()` even when events are immediately ready.** Currently `wait()` returns sync when an event is ready. Changing it to always return `Promise.resolve(code)` would force yields. Risk: regresses fast-path performance.
3. **Detect spin pattern in host.** Track consecutive `read → cancel` cycles per stream; after N (e.g. 1000), have `cancel-read` return a Promise to force yield. Adaptive — only kicks in for the buggy spin pattern.
4. **Guest-side fix (out of host scope).** The Rust test uses `Waker::noop()` which is the actual bug — the test program assumes OS preemption. Could also make wit-bindgen's runtime call `task.yield` periodically.

### Recommended next investigation
Try **option 1** (yield from `cancel-read` only) in isolation:
- Does NOT widen any types.
- Does NOT change `stream.read` behavior.
- ONLY makes `cancel-read`'s canonical built-in return a Promise (via Suspending wrap), giving up control for one microtask.
- Should preserve `cli_hello_stdout` (no cancel calls) and break the OOM in `test_tcp_read_cancellation`.

If option 1 doesn't suffice, consider option 3 (adaptive throttling on read-cancel spin).

---

## DOS / Event-Loop-Starvation Attack Surface

The `read → cancel-read` pattern that produced the OOM is one instance of a broader class of attacks: **any canon built-in that returns synchronously is a vector by which a malicious or buggy guest can monopolize the WASM thread** and prevent the JS event loop from processing I/O, timers or microtasks. Enumerated below for completeness; these motivate the integration test suite at `integration-tests/bad-guests-p3-wat/` and `tests/host/wasip3/bad-guests-integration.test.ts`.

### Class A — Tight polling loops on canon built-ins (no `wait()`)

The guest spins on a built-in that returns immediately, never calling `waitable-set.wait`. JS event loop never ticks → no I/O, timers, microtasks. CPU 100%, eventual OOM.

| # | Spin pattern | Built-ins involved | Why it can spin sync |
|---|---|---|---|
| A1 | `stream.read` → `stream.cancel-read` | `stream.read`, `stream.cancel-read` | `read` returns BLOCKED sync; `cancel-read` returns COMPLETED sync. **Currently the OOM in `test_tcp_read_cancellation`.** |
| A2 | `stream.write` → `stream.cancel-write` | `stream.write`, `stream.cancel-write` | Same shape, write side. Fill buffer to threshold, cancel, retry. |
| A3 | `future.read` → `future.cancel-read` | `future.read`, `future.cancel-read` | Future never resolves; read returns BLOCKED forever. |
| A4 | `future.write` → `future.cancel-write` | `future.write`, `future.cancel-write` | Same, write side. |
| A5 | `waitable-set.poll` loop | `waitable-set.poll` | Non-blocking variant of `wait` — returns NONE sync. Guest can poll forever. |
| A6 | `subtask.cancel` after async export call | `subtask.cancel`, `subtask.drop` | Each async-lower of a JS host import that returned a Promise creates a subtask handle. Guest can cancel + recreate. |
| A7 | `stream.new` / `future.new` + drop | `stream.new`, `future.new`, `stream.drop-readable`, `stream.drop-writable`, `future.drop-readable`, `future.drop-writable` | Pure resource-table churn, never blocks. |
| A8 | `waitable-set.new` / `waitable.join` / `waitable-set.drop` | the three above | Same pattern on waitable-set tables. |
| A9 | `task.backpressure` flip-flop | `task.backpressure` | Toggling backpressure repeatedly never blocks. |

All of A1–A9 are pure resource-table / state-machine ops serviced synchronously by the host. Without a host-injected yield, the guest never hits `wait()` and the JS event loop never gets a tick.

### Class B — Resource exhaustion (sync allocation churn)

Sync built-ins that allocate host objects. The guest never yields, so GC pressure builds up and the JS heap OOMs before any timer/handler fires.

| # | Vector | Built-ins |
|---|---|---|
| B1 | Unbounded stream creation | `stream.new` in a loop, never disposed (or disposed sync) |
| B2 | Unbounded future creation | `future.new` in a loop |
| B3 | Unbounded waitable-set creation | `waitable-set.new` |
| B4 | Unbounded subtask creation via async-lower | repeated `call.async` of a JS import that returns Promise; subtask handle table grows |
| B5 | Buffered chunk pile-up on a stream | `stream.write` while no reader exists; `pumpIterable` queues chunks in JS until heap dies |
| B6 | Resource handle table growth | repeated `resource.new` (per-component resources) |
| B7 | Memory growth via `memory.grow` | guest grows linear memory to OOM the JS process |

B5 is particularly nasty: even with JSPI, if `write` is fast-pathed sync when there is a waiting reader, a malicious guest can flood by alternating `write` / fast-path-success.

### Class C — Re-entrant / nested call abuse

| # | Vector | Built-ins |
|---|---|---|
| C1 | Reentrant export call from inside an import handler | guest calls JS, JS calls a guest export, guest calls JS — unbounded depth on JS stack |
| C2 | `task.return` during a still-pending subtask | `task.return` |
| C3 | `resource.drop` on a borrowed handle the host still references | `resource.drop` triggering host-side `[dtor]` reentrancy |

### Class D — Trap-flooding / error-path spin

Sync built-ins that the spec says should trap on misuse but where the host validates and returns an error code instead of trapping, allowing the guest to spin in error handling.

| # | Vector |
|---|---|
| D1 | Read from a dropped stream handle in a loop |
| D2 | Drop-already-dropped (double-free) loop |
| D3 | Wait on an empty waitable-set in `poll` form |

Usually benign per-call (O(1)) but combined with class A produce the same starvation effect.

### Class E — JSPI-specific attacks (after we add Promise returns)

If we add `WebAssembly.Suspending` Promise returns to *some* built-ins, new vectors open:

| # | Vector | Mechanism |
|---|---|---|
| E1 | Suspending in a `futures::join!` arm starves the other arm | the `cli_hello_stdout` deadlock we already reproduced — host must *never* suspend a single Rust future, only yield a microtask |
| E2 | Forcing host to allocate a Promise per call with no upper bound | guest calls a sync-but-now-yielding built-in 10⁹ times → 10⁹ Promise objects in microtask queue → JS process OOM |
| E3 | Cancel-read/cancel-write Promise that resolves but never lets the suspending guest continue | misuse of `WebAssembly.Suspending` could leave the guest permanently parked |
| E4 | Mixing JSPI-yielding built-ins with non-JSPI hosts | hosts without JSPI fall back to sync return; the same bytecode behaves differently — security audit must cover both paths |

### Class F — Host-implementation-specific (jsco today)

| # | Vector |
|---|---|
| F1 | `pumpIterable` pulling from a JS async iterable while the guest spins — the iterable's `.next()` Promise sits in microtask queue forever, source side keeps producing, queue grows |
| F2 | `signalReady` callbacks queued as Promises in `entry.onReady[]` accumulating without drain |
| F3 | AbortSignal listeners accumulating on a stream that is read/cancel-read spun |
| F4 | Debug-mode `verboseLogger` accumulating messages in the test buffer (not a runtime DOS but breaks tests under spin) |

### Mitigation strategy taxonomy

Independent of which specific class we patch first, the fixes fall into three categories:

1. **Per-call yield** — wrap selected canon imports in `WebAssembly.Suspending` and have them return `Promise.resolve(code)` to force one microtask tick. Cost: O(1) microtask per call, breaks tight spin. Risks: E1 (must NOT suspend mid-`join!`).
2. **Adaptive throttle** — track per-call counters; after N (e.g. 1000) sync ops without `wait()`, force the next call to yield. Cost: one Promise per N calls, harder to abuse.
3. **Quota / rate-limit** — refuse to service more than N built-ins per JS task; trap on overflow. Strongest, but requires choosing N carefully and may break legitimate guests.

### Recommended order of inquiry

A1 is the only class with a known reproducer (the OOM). Before designing a generic mitigation:
1. Pick **one** of the three mitigation strategies on **only** A1 (cancel-read yield).
2. Re-run full sockets test to confirm no regression in non-spin tests (especially `cli_hello_stdout`, the `join!` case).
3. If green, generalize to A2–A9 by mechanism.
4. B-class needs separate analysis (allocation rate-limit), not a yield strategy.
