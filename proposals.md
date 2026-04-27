# Proposals: Event-Loop Starvation & DOS Mitigation in JSPI Path

> **STATUS — 2026-04-27:**
> - **Group 1 (DOS mitigations) LANDED.** D2 stream double-drop trap, A6 `subtask.cancel`, B4 async-lower throttle (`wrapWithThrottle`), and B6 `maxHandles` cap. Verified by `tests/host/wasip3/bad-guests-integration.test.ts`.
> - **Multi-async concurrency mechanic VALIDATED.** `integration-tests/multi-async-p3-wat/multi-async-p3.wat` + `tests/host/wasip3/multi-async.test.ts` — N parallel guest subtasks on one waitable set, per-task ctx, concurrent JS-side export invocations.
> - **OPEN — real wasi:http reactor concurrency.** See "HTTP Reactor Concurrency". Resource-flattening fix landed in `src/host/wasip3/http.ts`; guest-side `assertion failed: handle != 0` blocker parked.
> - **OPEN — Group 2: yield-from-cancel-only.** Decision pending: default-on when JSPI is enabled vs. opt-in `RuntimeConfig` flag.

## Problem Recap

Two skipped tests in `tests/host/wasip3/sockets-integration.test.ts`:
- `p3_sockets_tcp_streams` — OOM in `test_tcp_read_cancellation` (2.5M `read → cancelRead` cycles without yielding).
- `p3_sockets_udp_connect` — `client.send(...).await` hangs.

Root cause (from `node-event-loop-problem.md`): canonical-ABI stream/future ops are synchronous `i32`-returning calls. Only `waitable-set.wait()` returns a `Promise`, so JSPI only suspends there. Tight poll-once-cancel loops never call `wait()` and Node.js can't process I/O ticks → sockets starved → OOM/hang.

## Why "suspend on BLOCKED" doesn't work

The original proposal was: instead of returning `BLOCKED`, the host returns a `Promise<i32>` so JSPI suspends until data arrives. **Attempted and rejected** — it deadlocks `p3_cli_hello_stdout`:

```rust
futures::join!(
    async { wasi::cli::stdout::write_via_stream(rx).await.unwrap(); },
    async { tx.write(b"hello, world\n").await; drop(tx); },
);
```

`WebAssembly.Suspending` suspends the *entire* WASM thread. Suspending the read side freezes the write side too — the read can never complete. Wit-bindgen's async runtime is a single-threaded cooperative executor: `stream.read` MUST return synchronously (ready / DROPPED / BLOCKED), and the runtime polls a different future on BLOCKED. Only `waitable-set.wait()` is allowed to block.

**Implication:** the host can yield only via *microtasks*, not via JSPI suspends, on the per-call sync built-ins. This drove Group-1's `wrapWithThrottle` design (yield every N ops) and the still-open Group-2 (yield on every real cancel).

## Group 2 — yield from cancel-read/cancel-write only (PENDING)

Make `stream.cancel-read`, `stream.cancel-write`, `future.cancel-read`, `future.cancel-write` return `Promise.resolve(code)` (Suspending wrap) **only when there was something to cancel** (`(code & 0xF) === STREAM_STATUS_CANCELLED`). Otherwise return sync.

- Does NOT widen any types.
- Does NOT change `read`/`write` behavior.
- Forces one microtask per real cancel → breaks the OOM tight loop in `test_tcp_read_cancellation`.
- `cli_hello_stdout` unaffected (no cancel calls).

Implementation sketch: add `wrapMaybeYield(fn, predicate, mctx, jspiEnabled)` sibling to `wrapWithThrottle` in `src/resolver/core-functions.ts`; apply to the four cancel resolvers. Test harness: A1-style spin in `bad-guests-p3-wat` *without* `yieldThrottle` config; assert `tickedDuringCall > 0` purely from per-cancel yields.

**Open decision (user):** default-on when JSPI is enabled, or gated behind a new `RuntimeConfig.yieldOnCancel` flag?

## Proposal 3 — UDP send hang (TBD)

`p3_sockets_udp_connect` `client.send(...).await` hangs. Likely: future returned by `send()` is never registered such that the guest's await sees completion. Investigate after Group 2 lands; may be subsumed by future-table changes there.

## Out of Scope

- Changing the canonical ABI `BLOCKED` return code — remains the documented protocol value and the non-JSPI fallback.
- Browser polyfills for JSPI — non-JSPI path keeps `BLOCKED`; async-heavy components require JSPI.
- Cooperative `task.yield` injection by the guest — guest-toolchain concern (cargo-component / wit-bindgen).

---

## DOS / Event-Loop-Starvation Attack Surface

Any canon built-in that returns synchronously is a vector by which a malicious or buggy guest can monopolize the WASM thread and prevent the JS event loop from processing I/O, timers or microtasks. Motivates the integration suite at `integration-tests/bad-guests-p3-wat/` and `tests/host/wasip3/bad-guests-integration.test.ts`.

Rows marked **DONE** are shipped in Group 1.

### Class A — Tight polling loops on canon built-ins (no `wait()`)

| # | Spin pattern | Built-ins | Status |
|---|---|---|---|
| A1 | `stream.read` → `stream.cancel-read` | `stream.read`, `stream.cancel-read` | **OPEN — Group 2 target.** OOM repro in `test_tcp_read_cancellation`. |
| A2 | `stream.write` → `stream.cancel-write` | same shape, write side | OPEN. |
| A3 | `future.read` → `future.cancel-read` | `future.read`, `future.cancel-read` | OPEN. |
| A4 | `future.write` → `future.cancel-write` | same, write side | OPEN. |
| A5 | `waitable-set.poll` loop | `waitable-set.poll` | OPEN. |
| A6 | `subtask.cancel` after async-lower | `subtask.cancel`, `subtask.drop` | **DONE** — `wrapWithThrottle`. |
| A7 | `stream.new` / `future.new` + drop churn | resource-table churn | OPEN. |
| A8 | `waitable-set.new` / `waitable.join` / `waitable-set.drop` | same | OPEN. |
| A9 | `task.backpressure` flip-flop | `task.backpressure` | OPEN. |

### Class B — Resource exhaustion (sync allocation churn)

| # | Vector | Status |
|---|---|---|
| B1 | Unbounded `stream.new` | OPEN — extend `maxHandles`-style cap to streams. |
| B2 | Unbounded `future.new` | OPEN — same. |
| B3 | Unbounded `waitable-set.new` | OPEN — same. |
| B4 | Unbounded subtask creation via async-lower | **DONE** — `wrapWithThrottle` on async-lower. |
| B5 | Buffered chunk pile-up on `stream.write` while no reader exists; `pumpIterable` queues forever | OPEN — particularly nasty; sync fast-path means no yield even with Group 2. |
| B6 | Resource handle table growth (`resource.new` loop) | **DONE** — `maxHandles` cap in `createResourceTable`. |
| B7 | `memory.grow` to OOM the JS process | OPEN — `maxMemoryBytes` partially enforced; verify. |

### Class C — Re-entrant / nested call abuse

| # | Vector |
|---|---|
| C1 | Reentrant export call from inside an import handler — unbounded JS stack |
| C2 | `task.return` during a still-pending subtask |
| C3 | `resource.drop` on a borrowed handle the host still references |

### Class D — Trap-flooding / error-path spin

| # | Vector | Status |
|---|---|---|
| D1 | Read from a dropped stream handle in a loop | OPEN. |
| D2 | Drop-already-dropped (double-free) loop | **DONE** — `dropReadable`/`dropWritable` now trap. |
| D3 | Wait on an empty waitable-set in `poll` form | OPEN. |

### Class E — JSPI-specific (after we add Promise returns)

| # | Vector | Mechanism |
|---|---|---|
| E1 | Suspend in a `futures::join!` arm starves the other arm | The `cli_hello_stdout` deadlock — host MUST NOT suspend a single Rust future, only yield a microtask. |
| E2 | Forcing host to allocate a Promise per call with no upper bound | 10⁹ calls → 10⁹ Promises in microtask queue → OOM. |
| E3 | Cancel-read/cancel-write Promise that resolves but never lets the suspending guest continue | Misuse of `WebAssembly.Suspending` could leave the guest permanently parked. |
| E4 | Mixing JSPI-yielding built-ins with non-JSPI hosts | Same bytecode behaves differently — security audit must cover both paths. |

### Class F — Host-implementation-specific (jsco today)

| # | Vector |
|---|---|
| F1 | `pumpIterable` pulling from a JS async iterable while the guest spins — `.next()` Promise sits in microtask queue forever |
| F2 | `signalReady` callbacks queued in `entry.onReady[]` accumulating without drain |
| F3 | AbortSignal listeners accumulating on a stream that is read/cancel-read spun |
| F4 | Debug-mode `verboseLogger` accumulating messages in the test buffer |

### Mitigation strategy taxonomy

1. **Per-call yield** — `WebAssembly.Suspending` + `Promise.resolve(code)` to force one microtask tick. Cost: O(1) microtask per call, breaks tight spin. Risks: E1.
2. **Adaptive throttle** — track per-call counters; after N (e.g. 1000) sync ops without `wait()`, force the next call to yield. Cost: one Promise per N calls. **(Group 1's `wrapWithThrottle` uses this.)**
3. **Quota / rate-limit** — refuse to service more than N built-ins per JS task; trap on overflow. Strongest, but may break legitimate guests.

---

## HTTP Reactor Concurrency (OPEN — opened 2026-04-27)

### Goal

Prove end-to-end that a real `wasi:http/handler` P3 reactor can serve multiple HTTP requests concurrently against a single component instance, using the existing `serve()` adapter.

1. Boot `integration-tests/wasmtime/p3_http_echo.component.wasm` (real wasi:http reactor from wasmtime test-programs — uses `wit_future`, `wit_stream`, `wit_bindgen::spawn`).
2. Plumb its `wasi:http/handler@0.3.0-rc-2026-03-15` export into `serve()`.
3. Fire `Promise.all([request(/a), request(/b), request(/c), …])` against the same instance.
4. Assert all responses round-trip headers/body correctly and overlapping pending count > 1 at some point.

### Status

- **Test scaffold:** `tests/host/wasip3/node/http-reactor-concurrent.test.ts`. Component instantiates, all 12 imports bind, handler export reachable.
- **Blocker 1 (FIXED):** `wasi:http/types` was returning resource classes only, no flat `[constructor]/[static]/[method]/[resource-drop]` table — every WASM call to e.g. `[method]request.get-headers` failed with "Export not found in instance". Added `buildHttpTypesFlat()` in `src/host/wasip3/http.ts` covering `fields`, `request`, `request-options`, `response`.
- **Blocker 2 (OPEN):** Guest panics with `assertion failed: handle != 0 && handle != u32::MAX` at `crates/test-programs/src/p3/mod.rs:4:1`. Panic reaches host via stderr; HTTP response is 500. The JS `HttpRequest` instance handed to `handler.handle(request)` is being lifted into a resource handle of `0` (or u32::MAX). `resources.add()` starts at 1, so the 0 comes from elsewhere.

### Hypotheses for handle-0 origin

1. **Wrong export resolved** — `instance.exports[wasi:http/handler@…]` may not be the lifted-handler trampoline; we may be invoking an unlifted core `funcref` and passing the JS object straight onto the WASM stack.
2. **Stream/future handle leaking into resource slot** — `consume-body` returns `(stream, future)`; either may have handle 0 in some race, mis-typed as a resource handle. The Rust assert is in the `wit_bindgen` resource shim.
3. **Canonical resource ID not yet registered** — host calls `handler.handle(...)` before `start_task()` has populated the per-instance resource map; `getCanonicalResourceId(borrow<request>)` returns `-1` or `undefined`, lifting silently emits 0.

Diagnostic next step: enable `executor: LogLevel.Detailed` and grep for `ownLifting`/`borrowLifting` calls and the `resource.add` they produce, correlate with the trampoline `args=[…]` print of the handler call.

### Test goals (deferred until handle-0 cleared)

- **G1 — basic concurrent POSTs:** N parallel POSTs with `x-host-to-host: true` (echo fast-path), expect all 200 with correct body, overlapping pending > 1.
- **G2 — non-fast-path:** drop `x-host-to-host`; reactor uses `wit_bindgen::spawn` + `wit_stream` to forward body. Stresses spawned-task waitable-set machinery.
- **G3 — interleaved blocking + concurrent:** see "JSPI + Parallel" matrix.

---

## JSPI + Parallel — interleaved blocking & concurrent request scenarios

Once HTTP Reactor Concurrency is green, cover how a single component instance behaves when JSPI-suspending host calls are mixed with multiple in-flight guest tasks. The Group-1 multi-async test only covered Promise-resolving host imports without JSPI involvement.

### Why these matter

JSPI suspends the **whole WASM execution** (one thread). The guest's wit-bindgen runtime expects to interleave futures cooperatively. Whenever the host suspends mid-call:
- All other in-flight guest tasks on the same instance are frozen.
- Microtasks scheduled *before* the suspend still run — JS `serve()` keeps accepting new TCP connections.
- New `handler.handle(request)` invocations queue but cannot enter the guest until the suspend resolves.

### Scenario matrix

Assume one instance, the `serve()` adapter, N concurrent `request(/X)` clients. "Blocking host" = a host import wrapped in `WebAssembly.Suspending` returning a Promise (e.g. `wasi:http/client.send`).

| # | Pattern | Expected | Risk if broken |
|---|---|---|---|
| **P1** | One JSPI-blocking host call, N concurrent JS-side handler invocations queued behind it | All N proceed in turn after suspend resolves. JS event loop stays responsive. | Server stalls, clients time out. |
| **P2** | N concurrent handlers each making one JSPI-blocking host call (fan-out fetches) | Suspends interleave: A suspends → B enters guest → B suspends → A resumes. Per-task ctx + waitable-set isolation across suspend boundaries. | Cross-task ctx slot bleed; only one suspend honored. |
| **P3** | Handler issues JSPI-blocking call, then guest spawns internal subtask via `wit_bindgen::spawn` that itself blocks on JSPI | Inner subtask suspends independently. Outer Promise resolves first → outer resumes; inner remains suspended. | Subtask handle reused or cancelled when outer resumes; inner leaks. |
| **P4** | Mixed: one handler awaits a Promise host import while another awaits a JSPI-suspending host import on the same instance | Per-`asyncLowerTrampoline` Promise machinery + JSPI suspension must not deadlock each other. | Promise-mode subtask sees `BLOCKED` while JSPI suspend never gets scheduled. Hang. |
| **P5** | N concurrent handlers each holding a `borrow<request>` handle that spans a JSPI suspend | Borrow valid post-suspend (numLends accounting unchanged). | Resource-table GC during suspend drops still-borrowed handle; post-suspend get fails with "type X != Y". |
| **P6** | Backpressure: while one handler suspends on JSPI, host signals `task.backpressure=1` from JS | Queued handlers stop entering guest until backpressure clears. Suspended task can still complete. | New handlers enter anyway; or suspended task killed when backpressure fires. |
| **P7** | Cancellation across suspend: client disconnects mid-request while handler is JSPI-suspended | `serve()` aborts response stream; suspended Promise rejects (via AbortSignal); guest sees `CANCELLED`/`DROPPED`. | Suspended Promise never rejects → handler permanently parked → leaks until OOM. |
| **P8** | JSPI-suspending call inside a `futures::join!` arm (cli_hello_stdout pattern) in server context | Already proven to deadlock for streams. Confirm whether also deadlocks for `wasi:http/client.send` when guest does `join!(send_a, send_b)`. | If yes → document as known guest-toolchain incompatibility; do not add new JSPI suspends without auditing. |
| **P9** | Many concurrent handlers create + drop short-lived streams/futures while another is JSPI-suspended | Tables grow during suspend, drain after resume. Must not exceed `maxHandles`. | Long suspend → unbounded growth → cap fires → all handlers fail. Need adaptive backpressure. |
| **P10** | Re-entrant JSPI: host import suspends, during the await another `serve()` `handler.handle()` begins for the same instance | Reentrancy intentional. Validate: per-task ctx slot, per-task waitable-set, partitioned resource handles, per-task `mctx.opsSinceYield`. | Global counters in `wrapWithThrottle` bleed across reentrant tasks → false positives/negatives on yield. |
| **P11** | JSPI-suspending host call fails synchronously after Node.js I/O error (socket reset during `wasi:http/client.send`) | Promise rejects; trampoline converts to `result.err`; concurrent handlers untouched. | Rejection propagates as unhandled, aborts the whole instance. |
| **P12** | Client closes connection while server is reading request body (JSPI-suspended on `stream.read`) | Body stream closes → `pendingRead` resolves with `DROPPED`; guest sees end-of-stream. Other handlers continue. | `pendingRead` not resolved on close → handler hangs forever. |

### Test design

One Jest test per scenario in a new file `tests/host/wasip3/node/http-reactor-jspi-parallel.test.ts`:
- Use `p3_http_echo.component.wasm` for basic shape; P3/P8/P10 likely need a custom WAT or rust reactor that issues outgoing host calls — likely build `integration-tests/jspi-parallel-p3-wat/jspi-parallel-p3.wat` once handle-0 is cleared.
- Use a controllable JSPI-blocking host import: stub `wasi:http/client.send` returning a deferred Promise so the test owns suspend timing.
- Assert: HTTP status, overlapping pending count, `resources.size`/`subtasks.size` invariants before/during/after suspend, JS event-loop liveness via `setImmediate` watchdog.

### Acceptance criteria (per scenario)

1. Functional assertion passes (status / body / order).
2. No resource handle leaks (table sizes return to baseline after `instance.dispose()`).
3. No `unhandledRejection` / `uncaughtException`.
4. Watchdog `setImmediate` ticks during every suspend window > 0.
5. With `verbose: { executor: LogLevel.Detailed }`: no `resource.get` returns wrong typeIdx; no `subtask.cancel: unknown handle` errors.

### Priority

P1, P2, P10 highest-value (multi-task ctx + JSPI). P5, P7, P12 correctness-critical for production. P3, P4, P8 research-grade — may uncover spec-level questions about wit-bindgen + JSPI compatibility.

---

## Other goals discovered today

- **`wasi:http/types` static-then-tuple-result method coverage.** `request.new`, `request.consume-body`, `response.new`, `response.consume-body` return tuples; tuple-result lifting may also need attention once handle-0 is cleared.
- **`flattenResource` helper unification.** `src/host/wasip3/sockets.ts:flattenResource()` and the new ad-hoc `buildHttpTypesFlat()` do similar work. Fold into one shared utility (e.g. `src/host/wasip3/resource-flatten.ts`).
- **Unit test for resource flattening completeness** — none exists today; sockets path was only validated indirectly via integration tests. A unit test asserting every WIT method on `Fields`/`Request`/`Response` has a matching `[method]…` entry would have caught today's blocker pre-runtime.
- **Test-side guard (defensive, low priority)** — Debug-only counter for "max sync canon ops between suspends"; warn after N consecutive sync stream/future ops without any Promise return. Catches regressions that re-introduce a sync `BLOCKED` path.
