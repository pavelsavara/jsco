# HTTP P3 WAT Integration Suite — Plan

Master plan for a hand-written WASIp3 component-model WAT integration suite that
mirrors the existing A–L topology (see [tests/host/wasip2-via-wasip3/integration.test.ts](tests/host/wasip2-via-wasip3/integration.test.ts)
and [tests/host/wasip3/integration-p3-native.test.ts](tests/host/wasip3/integration-p3-native.test.ts))
but exercises **streaming HTTP request/response bodies** through
`wasi:http/types@0.3.0-rc-2026-03-15` and `wasi:http/handler@0.3.0-rc-2026-03-15`.

All guests are hand-written WAT (no Rust). This deliberately avoids JSPI: every
async-lift uses the **callback form** of `canon lift`, and every host import that
might block returns to the host between resumptions.

---

## 1. Goals & non-goals

**Goals**

- Cover scenarios A–L over WASIp3 HTTP, using the same shape as the existing
  non-HTTP integration suites (forwarder / implementer / consumer composition).
- Exercise real streaming bodies: incrementally readable request body, incrementally
  written response body, plus trailers.
- Prove jsco's resolver/binder/executor handle:
  - async-lift in callback form
  - resource handles flowing through `canon lower` of `consume-body` / `response.new`
  - `stream<u8>` and `future<...>` canon ops (`stream.new`, `stream.read`, `stream.write`,
    `stream.drop-readable`, `stream.drop-writable`, `future.new`, `future.read`,
    `future.write`, `future.drop-readable`, `future.drop-writable`)
  - waitable-set / waitable.join re-arming
  - per-task `context.set` / `context.get`
- Discover and fix any production bugs along the way.

**Non-goals**

- No JSPI. Stackful async-lift is out of scope for this suite.
- Not a replacement for the Rust-based wasmtime corpus tests; this suite is
  hand-tuned to stress the canon ABI of streaming bodies in isolation.
- No real network I/O until Phase 4 (Scenario L via `startEchoServer` + `fetch`).

---

## 2. Decisions captured (open questions resolved)

| # | Question | Decision |
|---|---|---|
| 6.1 | Use callback-form async-lift instead of stackful? | **Yes.** Callback form. Avoids JSPI entirely. |
| 6.2 | Build via `wasm-tools parse` (not `validate`)? | **Yes.** `wasm-tools validate` is over-strict for handler exports; jsco runtime is the real validation. |
| 6.3 | `error-code` shape from `wasi:http/types`? | **Stub variant** `(variant (case "internal-error"))`. Same trick used by existing `hello-http-p3-wat`. Canon ABI cares only about the flat layout. |
| 6.4 | Will WAC link hand-written WAT for HTTP composition? | Risk to validate at Phase 1.3. Existing `compositions/forwarder-implementer-p3.wac` works for non-HTTP P3, so the only unknown is whether the imported `wasi:http/types` instance type matches across components. |

**Body-mutation contract** (so any topology is verifiable from response bytes alone):

```
response_body == request_body + "-fwd-" * N + "-handled-" + "-fwd-" * N
```

- Each forwarder appends `"-fwd-"` to **both** the request body (before forwarding upstream)
  and the response body (before returning downstream).
- The implementer appends `"-handled-"` to the body it received.

**Client streaming pattern (Phase 3):** Consumer sends 4 chunks:

1. `"hello"`
2. 32 random bytes
3. `"world"`
4. 2 MiB zero fill

This stresses small-chunk pumping, mid-stream binary, and backpressure boundary.

---

## 3. Component inventory

All under `integration-tests/http-p3-wat/`:

| File | Role | Imports | Exports |
|---|---|---|---|
| `server-impl-p3.wat` | leaf implementer | `wasi:http/types` | `wasi:http/handler` |
| `server-fwd-p3.wat` | middleware forwarder | `wasi:http/types`, upstream `wasi:http/handler` | downstream `wasi:http/handler` |
| `client-consumer-p3.wat` | consumer/driver | `wasi:http/types`, `wasi:http/handler` (or client.send) | a `run()`-like export the test invokes |

Compositions under `integration-tests/compositions/`:

| File | Topology | Phase |
|---|---|---|
| `forwarder-implementer-http-p3-server.wac` | fwd ← implementer, exports handler | 1.3 ✅ |
| `double-forwarder-implementer-http-p3.wac` | fwd ← fwd ← implementer (flat) | 2 ✅ |
| `nested-forwarder-implementer-http-p3.wac` | fwd ← fwd ← fwd ← implementer (flat-of-three) | 2 ✅ |
| `wrapped-forwarder-http-p3.wac` | single fwd, open upstream | 2 ✅ |
| `double-forwarder-http-p3.wac` | fwd ← fwd, open upstream | 2 ✅ |
| `nested-double-forwarder-http-p3.wac` | fwd ← fwd ← fwd, open upstream | 2 ✅ |
| (consumer-side compositions for Phase 3) | mirror the existing A–L set | 3 |

---

## 4. WAT design notes

### 4.1 Imports / instance type

The `wasi:http/types` instance must be declared with **positional numeric indices**
in the instance-type body — `wasm-tools` rejects `$name` bindings inside the body.
Pull names out via `(alias export …)` after the import.

Resource types **must be wrapped in `own<>` / `borrow<>` before** being used in
compound types (`option`, `result`, `tuple`). Bare `(option $resource)` parses
but fails validation with a misleading message.

Stub `error-code` to one case; canon ABI matches by flat layout regardless of
case names.

### 4.2 Canon ops needed per component

| Op | Implementer | Forwarder | Consumer |
|---|---|---|---|
| `stream.new`, `stream.read`, `stream.write`, `stream.drop-{readable,writable}` | ✓ | ✓ | ✓ |
| `future.new`, `future.read`, `future.write`, `future.drop-{readable,writable}` | ✓ | ✓ | ✓ |
| `waitable-set.new`, `waitable-set.drop`, `waitable.join` | ✓ | ✓ | ✓ |
| `context.get` 0, `context.set` 0 | ✓ | ✓ | ✓ |
| `task.return` | ✓ | ✓ | ✓ |
| `resource.drop $request` | ✓ (only if not consumed) | ✓ | — |
| `canon lower` of `[constructor]fields`, `[static]response.new`, `[static]request.consume-body` | ✓ | ✓ | — |
| `canon lower` of `[constructor]request`, `[static]response.consume-body` | — | ✓ | ✓ |
| `canon lower` of upstream `handler.handle` | — | ✓ | ✓ |

### 4.3 Status word & event encoding

From [src/runtime/stream-table.ts](src/runtime/stream-table.ts) and
[src/runtime/waitable-set.ts](src/runtime/waitable-set.ts):

- Sync return / event `returnCode`: `(count << 4) | STREAM_STATUS_xxx`
  - `STREAM_STATUS_COMPLETED = 0`
  - `STREAM_STATUS_DROPPED   = 1`
  - `STREAM_STATUS_CANCELLED = 2`
- Async pending: `0xFFFFFFFF` (BLOCKED, == `-1` as i32)
- Event codes (in `events[i].eventCode`):
  - `EVENT_SUBTASK = 1`
  - `EVENT_STREAM_READ = 2`
  - `EVENT_STREAM_WRITE = 3`
  - `EVENT_FUTURE_READ = 4`
  - `EVENT_FUTURE_WRITE = 5`

`onReady` callbacks are **fire-and-clear** — every BLOCKED requires `waitable.join 0`
(disjoin) followed by `waitable.join $ws` (rejoin) so the next readiness
notification re-fires.

### 4.4 Async-lift callback form — guest return word

```
EXIT  = 0
YIELD = 1
WAIT  = 2 | (ws << 4)
```

Host re-enters via `(callback $cb)` on each event delivery.

### 4.5 Implementer pseudocode

```
handle-start(req):
  rcu_pair = future.new<result<_,error-code>>
  future.write(rcu_w, ok-unit-buf)
  future.drop-writable(rcu_w)

  (req_body_r, req_trailers_r) = consume-body(req, rcu_r)   // consumes own<request>
  future.drop-readable(req_trailers_r)                       // phase 1.1: ignore trailers

  headers           = fields.new()
  body_pair         = stream.new<u8>
  trailers_pair     = future.new<result<option<trailers>, error-code>>
  (resp, completion) = response.new(headers, some(body_r), trailers_r)
  future.drop-readable(completion)

  ws = waitable-set.new
  state = { phase=READ_REQ_BODY, req_body_r, body_w, trailers_w, resp, ws, count=0 }
  context.set 0 = state_ptr
  drive(state, 0, post=false)

drive: loop {
  switch state.phase {
    READ_REQ_BODY:    rc = stream.read(req_body_r, buf, BUFLEN)
                      // on COMPLETED+count → WRITE_ECHO
                      // on DROPPED        → WRITE_HANDLED
    WRITE_ECHO:       rc = stream.write(body_w, buf, count)        ; → READ_REQ_BODY
    WRITE_HANDLED:    rc = stream.write(body_w, "-handled-", 9)
                      // on completion: stream.drop-writable(body_w) ; → WRITE_TRAILERS
    WRITE_TRAILERS:   rc = future.write(trailers_w, ok-none-buf)
                      // on completion: future.drop-writable(trailers_w) ; → DONE
    DONE:             waitable-set.drop(ws); task.return(ok(resp)); EXIT
  }
  if rc == BLOCKED: disjoin(handle, 0); join(handle, ws); return WAIT|(ws<<4)
}
```

### 4.6 Forwarder pseudocode (Phase 1.2)

Two body pumps run concurrently — request side (downstream → upstream) and
response side (upstream → downstream) — plus async subtask tracking for the
upstream `handler.handle` call.

```
handle-start(req_in):
  // 1. Get the incoming body
  rcu_in_pair = future.new<rcu>; write Ok(()); drop writable
  (req_in_body_r, req_in_trailers_r) = consume-body(req_in, rcu_in_r)

  // 2. Build a new outbound request whose body we control
  new_headers = fields.new()                     // could clone headers here
  out_body_pair = stream.new<u8>
  out_trailers_pair = future.new<rt>
  out_req = request.new(new_headers, some(out_body_r), out_trailers_r, none-options)

  // 3. Subtask: handler.handle(out_req) → future of result<own<response>, error-code>
  subtask = handler.handle-async(out_req)        // canon lower with `async`

  // 4. Pump request body: read req_in_body_r → write out_body_w
  //    On EOF write "-fwd-" then drop out_body_w; write Ok(none) to out_trailers_w
  //    Drop req_in_trailers_r

  // 5. Wait for subtask result → resp_in
  // 6. consume-body(resp_in) → (resp_in_body_r, resp_in_trailers_r)
  // 7. Allocate downstream response: stream/future pairs; response.new
  //    Pump resp_in_body_r → resp_out_body_w; on EOF write "-fwd-"; drop writable
  //    Forward trailers; drop readable
  // 8. task.return(ok(resp_out))
```

State machine has many phases; per-task struct grows accordingly. Use
`waitable-set` with multiple joined waitables (subtask + body streams + trailers
futures) and dispatch on `event.eventCode` + `event.handle`.

### 4.7 Memory layout (per-component, conventional)

```
0x0000  static literals ("-handled-", "-fwd-")
0x0010  trailers Ok(none) buffer (12 bytes, all zero)
0x0020  response.new retbuf       (8 bytes)
0x0028  consume-body retbuf       (8 bytes)
0x0030  rcu Ok(()) buffer         (1 byte)
0x0040  events buffer             (N × 12 bytes)
0x1000  per-task state struct
0x4000  chunk buffer (32 KiB)
```

Per-task state pointer is stored in `context.set 0`; loaded on every callback.

---

## 5. Scenario matrix

Mirrors the existing topology. All scenarios assert the body-mutation contract.

| Scn | Topology | Phase | Status |
|---|---|---|---|
| A | test → server-impl                       | 1.0 / 1.1 | ✅ |
| B | test → server-fwd → JS host (impl-in-JS) | 2 | ✅ |
| C | test → server-fwd → server-impl          | 1.3 | ✅ |
| D | test → fwd → fwd → server-impl (flat)    | 2 | ✅ |
| E | test → fwd → fwd → JS host (flat)        | 2 | ✅ |
| F | test → wac-wrapped fwd → JS host         | 2 | ✅ |
| G | test → (fwd ← fwd) wac → JS host         | 2 | ✅ |
| H | test → (fwd ← fwd ← fwd) wac → JS host   | 2 | ✅ |
| I | test → (fwd ← server-impl) wac           | 1.3 | ✅ |
| J | test → (fwd ← fwd ← server-impl) wac     | 2 | ✅ |
| K | test → (fwd ← fwd ← fwd ← server-impl) wac | 2 | ✅ |
| L | client-consumer → echo over real fetch + `startEchoServer` | 4b | ⏳ |

Error variants in Phase 2:
- ✅ JS impl returns `Err(internal-error)` — direct caller observes Err.
- ✅ JS impl trailers future resolves to `Err(...)` — caller observes trailers Err.
- ✅ WAT fwd propagates upstream Err via `task.return(Err)` (phase-10 branch).
- ⏳ Body stream cancels mid-pump — deferred; needs dedicated cancel-fwd WAT.

Phase 3 client-consumer scenarios:
- ✅ A' (consumer → JS impl) — 2 MiB streaming body, concurrent driver.
- ✅ B' (consumer → server-impl WAT) — early `task.return` enables WAT-to-WAT streaming.
- ⏳ C' (consumer → fwd → server-impl) — skipped, serial fwd deadlocks on 2 MiB body.
- ⏳ I' (consumer → composed fwd+impl) — skipped, same serial fwd deadlock.

---

## 6. Test plan

- Server-side suite: [tests/host/wasip3/http-integration.test.ts](tests/host/wasip3/http-integration.test.ts).
  Drives `handler.handle` directly via the host's `_HttpRequest` / `_HttpFields` /
  `_HttpResponse` test helpers. Synthetic AsyncIterable request bodies; drain
  response body via `_HttpResponse.consumeBody`.
- Client-side suite (Phase 3): same file or sibling. Uses `client-consumer-p3.wat`
  driving `wasi:http/handler.handle` (or a `client.send` equivalent).
- Phase 4 only: `tests/test-utils/echo-server-fixture.ts` + global `fetch` to
  wire a real HTTP server endpoint into `client-consumer-p3.wat`.

All tests use `useVerboseOnFailure()` + `runWithVerbose()` so a failing test
dumps captured `parser` / `resolver` / `binder` / `executor` logs.

---

## 7. Build & infrastructure

- `package.json` script per WAT: `"build:server-impl-p3-wat": "wasm-tools parse … -o …"`.
  Skip `wasm-tools validate` (over-strict). Runtime instantiation through jsco is
  the real validation gate.
- Every emitted `.wasm` is committed alongside its `.wat`.
- Compositions: `wac compose -d <deps> <input>.wac -o <output>.wasm`.

Tools verified:
- `wasm-tools` 1.246.2
- `wac-cli` 0.9.0

---

## 8. Phasing

### Phase 1 — minimal end-to-end implementer + first composition

- **1.0 ✅** `server-impl-p3.wat` synthesizing `"-handled-"` (no req body read).
  Scenario A passes.
- **1.1 ✅** Extend implementer to consume request body via `stream.read`, echo
  each chunk back via `stream.write`, then append `"-handled-"`. Scenario A
  asserts both empty and non-empty request bodies.
- **1.2 ✅** `server-fwd-p3.wat` consume+reconstruct middleware with `"-fwd-"`
  appended on both directions.
- **1.3 ✅** `forwarder-implementer-http-p3-server.wac` for Scenario I. Validates
  open question 6.4 (WAC linking of hand-written WAT for HTTP composition).

### Phase 2 — full server-side scenario matrix ✅

Scenarios B, D, E, F, G, H, J, K + 3 of 4 error variants. Built remaining
`.wac` compositions; implemented multi-fwd flattening cases. Body-cancel
variant deferred.

### Phase 3 — client suite ✅ (partial)

`client-consumer-p3.wat` exercising the streaming-chunks pattern (4 chunks
including 2 MiB tail). Drives `wasi:http/handler.handle` via the upstream
import. Scenarios A' (JS impl) and B' (WAT impl) passing. C' and I' skipped
pending concurrent fwd rewrite (Phase 4a).

Key design pattern discovered: **early `task.return`** — the implementer
must call `task.return(ok(resp))` before starting body writes so the caller
can begin reading the response concurrently. Without this, WAT-to-WAT
streaming deadlocks because neither side can make progress.

### Phase 4a — concurrent fwd rewrite

Rewrite `server-fwd-p3.wat` from a 10-phase serial driver to an
event-dispatched concurrent driver that interleaves req-pump and resp-pump
(same pattern as `client-consumer-p3.wat`). This unblocks Scenarios C' and I'
(and potentially D'–K' consumer-side variants).

### Phase 4b — real HTTP

Scenario L: `client-consumer-p3.wat` against `startEchoServer` via real `fetch`.
Validates the host `wasi:http` adapter end-to-end.

---

## 9. Verified facts (lessons captured during Phase 1)

Saved as `/memories/repo/wasip3-wat-component-types.md`:

1. **Instance-type bodies use numeric indices, not `$names`.** Inside an
   `(instance …)` type, `(export "x" (type (sub resource)))` is fine, but every
   subsequent type/func reference must be a numeric index `0`, `1`, … —
   `$name`-bindings inside the body produce `error: expected a string`.
2. **Resources need `own<>` / `borrow<>` wrapping** before they can appear inside
   `option` / `result` / `tuple`. `(option $fields)` parses but the validator
   later complains that the type index is undefined.
3. **`wasm-tools validate` is over-strict** for handler exports even with all
   relevant `--features=cm-async,cm-async-builtins,cm-async-stackful,cm-error-context,cm-fixed-length-lists,cm-gc,cm-nested-names,cm-values`
   flags. Use `wasm-tools parse` and rely on jsco runtime as the real validator.
4. **`request.consume-body` consumes `own<request>`** — do not also call
   `resource.drop $request` on the same handle (double-free → "Invalid resource handle").
5. **`onReady` is fire-and-clear in [src/runtime/stream-table.ts](src/runtime/stream-table.ts)** —
   re-arm via `waitable.join handle 0` + `waitable.join handle ws` after every
   BLOCKED.
6. **WAC compose requires a typed handler-export instance type** with re-exported
   resource types. For an exported instance whose function signatures use
   resources aliased from an imported instance, the export must ascribe an
   instance type that re-exports those resource types via
   `(alias outer $component $request (type))` + `(export "request" (type (eq N)))`.
   `wit-component` does this implicitly via the nested-sub-component pattern
   (parameterizing the inner component over resource types and instantiating
   it with the imported types). The hand-written WAT shortcut: declare a
   top-level `$handler-iface` instance type that pulls in the resource types
   via outer aliases, build a typed `$handler-inst` that re-exports them
   alongside `handle`, and ascribe the export with
   `(export "wasi:http/handler@..." (instance $handler-inst) (instance (type $handler-iface)))`.
   The jsco runtime accepts both the bare and typed forms; only WAC needs the
   ascription. See `server-impl-p3.wat` and `server-fwd-p3.wat`.
7. **Early `task.return` is critical for WAT-to-WAT streaming.** The
   implementer must call `task.return(ok(resp))` *before* entering its
   body/trailers write loop — this unblocks the caller's subtask-wait so
   it can begin reading `resp_body_r` concurrently with the implementer
   writing. Without early `task.return`, the caller blocks in subtask-wait
   (consumer's `resp_phase 0`) while the implementer blocks on
   backpressured body writes at the 64 KiB threshold → classic two-side
   streaming deadlock. See `server-impl-p3.wat` line 286.
8. **Serial fwd driver deadlocks on large streaming bodies.** The current
   `server-fwd-p3.wat` uses a 10-phase serial driver: req-side (0–3) →
   subtask-wait (4) → resp-side (5–8) → finalize (9–10). For 2 MiB
   bodies, the upstream impl backpressures `resp_body_w` while fwd is
   still in req-side phases; fwd can't read resp until phase 5; impl
   stops reading req → req bridge fills → fwd's req write BLOCKs →
   deadlock. Fix requires a concurrent event-dispatched driver mirroring
   `client-consumer-p3.wat`'s `pump-req` / `pump-resp` pattern.

---

## 10. Status

- [x] Phase 1.0 — server-impl synth `"-handled-"`, Scenario A passes.
- [x] Phase 1.1 — server-impl real body echo + `"-handled-"`, Scenario A passes
      with empty and non-empty bodies (including multi-chunk).
- [x] Phase 1.2 — server-fwd-p3.wat consume+reconstruct middleware. Scenario C
      passes (empty + "hello"). Found and fixed underlying jsco bug: callback-form
      async-lift trampoline was allocating an event buffer via
      `mctx.allocator.alloc()`; for guests without `cabi_realloc` (hand-written
      WAT) the pointer stayed at 0, corrupting low memory. Fixed by adding
      `WaitableSetTable.waitJs()` that returns events as a JS array — events are
      delivered directly to the callback as i32 params per spec, no memory
      roundtrip needed.
- [x] Phase 1.3 — Scenario I via WAC composition
      `forwarder-implementer-http-p3-server.wac`. Both empty and "hello" tests
      pass. Resolves open question 6.4: WAC linking of hand-written WAT for
      HTTP composition works, **but** the exported `wasi:http/handler`
      instance must declare an explicit instance type that re-exports the
      transitively-referenced resource types (`request`, `response`,
      `error-code`) via outer aliases. The default inline
      `(instance (export "handle" (func ...)))` form (which jsco runtime
      accepts) is rejected by `wac compose` with "instance not valid to be
      used as export" because wac cannot match resource identity against the
      importer's `wasi:http/types` resources. See lesson 6 below.
- [x] Phase 2 — Scenarios B, D, E, F, G, H, J, K + error variants
    - **B (test → fwd → JS impl)**, **D (test → fwd → fwd → server-impl, flat)**,
      **E (test → fwd → fwd → JS impl, flat)** — implemented as JS-side wiring
      using a `makeJsImpl()` helper (`tests/host/wasip3/http-integration.test.ts`).
      The helper drains the request body via `_HttpRequest.consumeBody`, appends
      `"-handled-"`, and constructs a response with `_HttpResponse.new`. No new
      WAT or WAC required.
    - **J (WAC fwd ← fwd ← impl)**, **K (WAC three flat fwds ← impl)** —
      implemented as `compositions/double-forwarder-implementer-http-p3.wac` and
      `compositions/nested-forwarder-implementer-http-p3.wac`. Both fully closed,
      handler is composed end-to-end. K is flat-of-three rather than a true
      sub-composition because wac cannot re-parse a composed HTTP P3 component
      as a dep due to cm-async type mismatch (same constraint noted in
      `nested-double-forwarder-p3.wac`).
    - **F (WAC wrapped-fwd ← JS impl)**, **G (WAC double-fwd ← JS impl)**,
      **H (WAC nested-double-fwd ← JS impl)** — implemented as
      `compositions/wrapped-forwarder-http-p3.wac`,
      `compositions/double-forwarder-http-p3.wac`,
      `compositions/nested-double-forwarder-http-p3.wac`. All leave
      `wasi:http/handler` as a top-level import that the host wires to the JS
      implementer at instantiation time.
    - **Error variants** — three implemented:
        - JS impl returns `Err(internal-error)` — direct caller observes Err.
        - JS impl trailers future resolves to `Err(...)` — caller observes
          trailers Err via `_HttpResponse.consumeBody`'s second tuple element.
        - WAT fwd propagates upstream Err — `server-fwd-p3.wat` phase 4
          extended with an err-finalize branch (phase 10) that does
          `task.return(Err(internal-error))`. Tested with a JS upstream that
          drains the request body and returns `Err`.
    - **Error variants deferred** (still require WAT-side work):
        - "Body stream cancels mid-pump" — requires `stream.cancel-read`
          issuance from a guest. Not currently exercised by either WAT;
          would need a dedicated cancel-fwd WAT variant.
    - All composition outputs wired into `package.json::build:compositions-http-p3`.
    - Total Phase 2 added: 5 new `.wac` files, 18 scenario tests, 3 error
      tests, plus a `task.return(Err)` propagation branch in `server-fwd-p3.wat`.
      Full suite: 3524 pass / 1 skipped / 0 fail.
- [x] Phase 3 — client-consumer-p3.wat
    - **Scenario A' (consumer → JS impl)** — implemented and passing with the
      full multi-chunk streaming pattern: `"hello"` (5 B) + 32-byte 0x42
      pattern + `"world"` (5 B) + 64 × 32 KiB zeros (= 2 MiB tail). Total
      request body 2 097 194 bytes; response body 2 097 203 bytes including
      `"-handled-"`. The JS upstream eagerly drains the request body before
      returning the response (a non-eager generator deadlocks because nothing
      pulls the response until the consumer's writes finish — which can't
      finish until the upstream reads them).
    - **Two key bugs found & fixed in `client-consumer-p3.wat` while wiring
      A'**:
        1. *Stream-write BLOCKED-resume must not advance.* When
           `stream.write` returns BLOCKED (jsco buffer at backpressure
           threshold = 64 KiB), the wake-up event delivers `rc=0` (count=0,
           status=0). Naively advancing the state machine on every post-event
           skips ~21/64 chunks. Fix: gate phase 0–3's "advance" branches on
           `count > 0` so BLOCKED-resume just re-issues the same write.
        2. *Future-write COMPLETED returns count=0.* Unlike streams, futures
           have no count, and `future.write` always returns
           `(0 << 4) | COMPLETED = 0` — indistinguishable from a stream-write
           BLOCKED-resume by `rc` alone. The count>0 gate must therefore NOT
           be applied to future-write phases (phase 4 in our consumer); they
           advance unconditionally on post-event, since `future.write` in
           jsco never blocks.
    - **Scenario B' (consumer → server-impl WAT)** — now **passing** (60 s
      timeout). The key enabler was the **early `task.return` pattern** in
      `server-impl-p3.wat`: the implementer calls `task.return(ok(resp))`
      *before* driving the body/trailers write loop. This lets the caller
      (consumer-WAT) receive the response handle and start reading
      `resp_body_r` concurrently while the implementer is still writing
      body chunks. Without early `task.return`, the consumer blocks in
      subtask-wait (resp_phase 0) while the impl blocks on backpressured
      body writes — classic two-side streaming deadlock. The original
      hypothesis (jsco `AsyncIterable` bridge / `onReady` wiring bug) was
      incorrect; the issue was purely a guest-side sequencing problem.
    - **Scenarios C', I' — SKIPPED.** These involve `server-fwd-p3.wat`
      in the chain, whose 10-phase **serial** driver (req-side phases 0–3 →
      subtask-wait phase 4 → resp-side phases 5–8 → finalize 9–10)
      deadlocks on 2 MiB streaming bodies. The forwarder doesn't start
      reading the upstream response (`resp_in_body_r`) until phase 5, but
      the upstream impl backpressures its `resp_body_w` at the 64 KiB
      threshold while the fwd is still pumping req-side phases — so the
      impl stops reading the request → the `req_out` bridge fills → fwd's
      `req_out` write BLOCKs → deadlock. **This is not a jsco runtime
      bug** — it's a WAT-side architectural limitation. Fixing it requires
      rewriting `server-fwd-p3.wat` to use a concurrent event-dispatched
      driver (mirroring `client-consumer-p3.wat`'s `pump-req` / `pump-resp`
      pattern) instead of a serial phase sequence. Filed as Phase 4 task.
    - **Body-mutation contract validated for A' and B'**:
      `collected_body == request_body + "-handled-"`.
- [ ] Phase 4a — Concurrent fwd rewrite: rewrite `server-fwd-p3.wat` to
      use an event-dispatched concurrent driver (interleaved req-pump /
      resp-pump) so C' and I' can pass with 2 MiB streaming bodies.
- [ ] Phase 4b — Scenario L: `client-consumer-p3.wat` against
      `startEchoServer` via real `fetch`.
