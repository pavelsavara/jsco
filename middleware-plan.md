# jsco middleware / handler-import composition plan

## Status — May 2026

Phases 1, 2, 3, 4, 6, 7 landed. Partial: phase 5 (S1, S2, S3, S4, S5, S7 landed). Pending:
phase 5 remainder (S6, S8). See `S6+S8-plan.md` for the S6/S8
follow-up design (bespoke WAT pairs + tests).

| Phase | Item | Status | Notes |
|-------|------|--------|-------|
| 1 | `linkHandler()` helper, `WASI_HTTP_HANDLER_INTERFACE` const, re-exports | ✅ | `src/host/wasip3/node/http-server.ts`, `src/host/wasip3/node/wasip3.ts` |
| 1 | I1a–I1d, I2 integration (echo+middleware composed via JS) | ✅ | `tests/host/wasip3/wasmtime-corpus.test.ts` |
| 1 | KNOWN_UNSUPPORTED entries removed for `p3_http_middleware*.wasm` | ✅ | |
| 2 | Forbidden-header strip on incoming (wasmtime parity) | ✅ | `HttpFields.fromIncomingList` in `src/host/wasip3/http.ts` |
| 3 | U4 — `linkHandler` shape/error unit tests | ✅ | `tests/host/wasip3/node/link-handler.test.ts` |
| 3 | U1–U3 — cross-instance own/stream/future round-trip | ✅ | covered transitively by I1 (echo+middleware exercise own<request>, own<response>, stream<u8>, future<unit>) |
| 4 | S1 — recursion-depth cap on `linkHandler` chain | ✅ | `AsyncLocalStorage`-scoped depth, default 8, `opts.maxDepth`; `tests/host/wasip3/node/link-handler-depth.test.ts` (U5) |
| 5 | S2 — forbidden-header rejection on `Fields::from-list` | ✅ | already enforced by existing `checkForbiddenHeader`; covered by `tests/host/wasip3/http.test.ts` |
| 5 | S5 — trust-boundary documentation | ✅ | `linkHandler` docstring |
| 5 | S3 — aggregate inflight-bytes cap across chain | ✅ | `NetworkConfig.maxAggregateInflightBytes` (16 MiB default); per-request `AsyncLocalStorage` counter in `serve()`; enforced at HTTP boundary (request body read + response body write); `tests/host/wasip3/node/link-handler-bytes.test.ts` (U7) + corpus integration tests |
| 5 | S4 — cancellation cascade across chain | ✅ | Per-request `AbortController` in `serve()` gated by `res.writableFinished`; `writeWasiResponse` checks signal to stop body writing on client disconnect; `tests/host/wasip3/node/link-handler-cancel.test.ts` (U8) + corpus integration test |
| 5 | S6 — resource-ownership regression test | ⏸ deferred | design captured in `S6+S8-plan.md`; needs bespoke WAT pair (`integration-tests/own-roundtrip-p3-wat/`) plus runtime resource-table introspection helper |
| 5 | S7 — JSPI deadlock diagnosis pointer | ✅ | chained-instance note added to `/memories/repo/wat-stream-write-blocked-resume.md` |
| 5 | S8 — disposal-while-mid-flight test | ⏸ deferred | design captured in `S6+S8-plan.md`; needs bespoke WAT pair (`integration-tests/slow-stream-p3-wat/`) and may require dispose-path fan-out fix |
| 6 | I3 — three-deep chain (mw → mw → echo) | ✅ | |
| 6 | I4 — 16-parallel under chain (per-task isolation) | ✅ | |
| 6 | I5 — arbitrary rename test | ✅ via I2 + U4 | I2 covers `local:local/chain-http`; U4 covers arbitrary rename via mocks. Synthetic third WAT skipped — would not add coverage |
| 6 | I6 — inventory hygiene | ✅ | |
| — | README row for `http/handler` middleware | ✅ | `README.md` |
| 7 | Rename `liftStream`/`liftFuture`/`liftErrorContext` ↔ `lower*` (and `*LiftPlan` → `*LowerPlan`) | ✅ | mechanical rename via TS language server; comments + test names updated |

Test count delta: 3610 → **3641** passing across **108 suites**, 2 skipped.
ESLint and `npm run build` clean.

## Outstanding work (the remaining S items)

**S3 — aggregate body-size cap.** ✅ Landed. Added `NetworkConfig.maxAggregateInflightBytes`
(default 16 MiB). `serve()` creates a per-request `AggregateByteCounter`
tracked via `AsyncLocalStorage`. Request body bytes (in `nodeRequestToWasi`)
and response body bytes (in `writeWasiResponse`) are counted against the
limit. When exceeded during request body reading, the body stream closes
(guest sees EOF); when exceeded during response writing, the response is
truncated. Per-request counters mean concurrent requests get independent
budgets. Tests: `tests/host/wasip3/node/link-handler-bytes.test.ts` (5 tests)
and 2 corpus integration tests.

**S4 — cancellation cascade.** ✅ Landed. `serve()` creates a per-request
`AbortController` that fires when the client disconnects before the response
is fully written (`res.on('close')` gated by `!res.writableFinished`).
`writeWasiResponse` checks `signal.aborted` before each body chunk write,
stopping response streaming on client disconnect. The handler promise
continues running but its output is ignored. Tests:
`tests/host/wasip3/node/link-handler-cancel.test.ts` (3 tests) and 1 corpus
integration test.

**S7 — chained-instance JSPI deadlock note.** ✅ Landed in repo memory at
`/memories/repo/wat-stream-write-blocked-resume.md` (added "Chained-instance
form" section). Diagnosis pattern documented; treatment is identical to the
single-instance case.

**S6 — resource-ownership regression** and **S8 — dispose mid-flight**: full
designs captured in `S6+S8-plan.md`, including WAT authoring sketches, build
steps, runtime-introspection helper notes, test code skeletons, and known
pitfalls. Estimated 0.5–1.5 focused sessions per item.

These items don't block landing the middleware feature — the chain works,
all corpus tests pass, security-critical S1 (recursion bomb) and S2
(forbidden-header smuggling) are enforced. They are listed here so the next
session can pick them up without re-deriving the design.

## Goal

Enable jsco to run WASI HTTP guests that *import* `wasi:http/handler` (or a
renamed equivalent) and forward requests through one or more inner components
or JS-side handlers. The two concrete corpus targets are:

- `p3_http_middleware.component.wasm` — exports `wasi:http/handler` and
  imports `wasi:http/handler` (same interface name). The guest deflate-decodes
  the request body, forwards through the import, then deflate-encodes the
  response if the client asked for it.
- `p3_http_middleware_with_chain.component.wasm` — exports `wasi:http/handler`
  but imports the inner handler under a renamed interface
  `local:local/chain-http` whose `handle` shape matches.

Wasmtime's working solution for these tests is **build-time fusion via
`wasm-compose`**: the middleware and an inner component (`p3_http_echo`) are
linked into a single composed component before instantiation. A "host-to-host"
variant that tries to satisfy the import via a runtime callback exists but
currently fails inside wasmtime with `non-numeric payload` errors crossing
intra-component futures.

jsco's design choice is the inverse: **no binary manipulation, ever**.
Composition is a JavaScript wiring concern — every component instance already
exposes its exports as a plain `Record<string, unknown>` and accepts imports
the same way. Linking is therefore an `instantiate({ ...A.exports })` call.

## Public surface

The intended user-facing pattern is:

1. Instantiate the inner component (`echo`) with the normal WASI host.
2. Instantiate the outer component (`middleware`), passing as imports the
   union of the WASI host plus a record that maps the handler interface name
   the outer guest expects to the export object the inner guest provides.
3. Drive the outer component's exported handler with the existing `serve()`
   adapter exactly as for `p3_cli_serve_hello_world` and `p3_api_proxy`.

A small optional helper `linkHandler(provider, opts?)` returns the record
described in step (2). It is sugar; users may construct the record
manually. The helper handles two shapes:

- Same interface name in and out: omit `opts.as`. The default is
  `wasi:http/handler@0.3.0-rc-2026-03-15`.
- Renamed import (the `chain` shape): pass `opts.as = 'local:local/chain-http'`.
  The helper still reads from the provider's canonical
  `wasi:http/handler@0.3.0-rc-2026-03-15` export and exposes it under the
  requested name. No type structure differs; only the WIT path changes.
- Recursion-depth cap: `opts.maxDepth` (default 8) caps the chain depth via
  Node `AsyncLocalStorage` (S1). Concurrent unrelated requests get
  independent counters.

There is **no** host-side stub, no `createWasiHttpHandlerImport(jsCallback)`
factory, no synthetic outer component. A user who wants a JS-implemented
middleware can write a tiny adapter component (or use jsco's existing
`createWasiP3Host` extension points) — that is a separate feature outside the
scope of this plan.

## Resolution mechanics

For (2) to actually work, jsco must already do — and in most cases does — the
following correctly:

1. **Cross-instance resource handle lifetime.** A handle returned by the inner
   guest's `handle(req) -> response` lives in the inner instance's resource
   table. When the outer guest calls its imported `handle(req)`, the request
   resource it passes was constructed inside the outer guest. Lowering the
   handle into JS, then lifting it into the inner guest, must allocate a new
   handle in the inner instance's table that *aliases* the same underlying JS
   object. The canonical-resource-id machinery in `src/resolver` already
   models this for the WIT package shared between the two components; the
   plan does not introduce new resource semantics, only stresses existing
   ones.
2. **Stream/future handles cross instance.** A `stream<u8>` constructed by the
   outer guest with `wit_stream::new()` produces a writer handle in the outer
   instance and a reader handle that is lowered through JS, then lifted into
   the inner instance's stream table. The waitable-state graph in
   `src/runtime/waitable*.ts` is process-global and already brokers reads and
   writes between the two ends without caring which instance produced which
   end — this is the same path exercised in-process by the `p3_http_echo`
   reactor concurrent test.
3. **`future<unit>` for trailers.** Both middleware programs use a
   zero-payload `future<()>` for trailers in the common path. jsco's marshal
   layer already special-cases `future<unit>` in lift/lower; the wasmtime
   "host-to-host" failure does not apply here.
4. **Disposal ordering.** When the outer component disposes (test teardown
   or `serve()` close), the inner component must remain alive for any
   in-flight inner calls and must dispose only after its own resource tables
   drain. The simplest invariant: the user disposes in reverse instantiation
   order. The plan does not introduce automatic lifetime tying.

Items 1–3 are the ones most likely to hide latent bugs surfaced by this
work. The plan does not prescribe code changes for them; instead it commits
to writing tests (below) that pinpoint exactly which path breaks first, and
fixing those in isolation.

## Security scenarios and proposed checks

Composition by JS wiring is a user-driven act — the user explicitly chose
which export satisfies which import. That removes several concerns that
applied to a host-mediated handler-callback design, but introduces a few new
ones tied to chained execution.

### S1 — Re-entrancy and recursion bombs

*Scenario.* User wires `a` to import `b.handle` and `b` to import `a.handle`,
or wires a single component such that its export and its import resolve
through JS to the same function. Each request triggers an unbounded chain of
cross-instance calls until JSPI stack or the host event loop collapses.

*Check.* Track an integer recursion depth on `mctx.currentTask` (or the
parent-chain it is part of). Increment on entry to every guest-export
trampoline that originates from another guest's host-import call; decrement
on settle. Compare against a host-configured `maxHandlerChainDepth` (default
8). On overflow, abort with a `WasiError` mapped to `internal-error`. The
counter lives on `TaskState` so the existing per-task swap mechanics
propagate it without new boundary plumbing.

### S2 — Header smuggling through synthesised requests

*Scenario.* Middleware reads inbound headers, calls `Headers::from_list(...)`
with a list it controls, and forwards. Without validation, the inner
component receives a request whose `host`, `content-length`, `connection`,
`transfer-encoding`, etc. were rewritten by middleware, defeating the
forbidden-header protections jsco applies on outbound.

*Check.* Apply `AdapterFields.fromListChecked` on **every** path that
constructs a `fields` resource from user-provided entries — the same path
already used for outbound. Concretely, the canon binding for
`[static]fields.from-list` invokes the checked variant and surfaces a
`Result<fields, header-error>` to the guest. No new code is required for the
P2-via-P3 adapter; the P3 host's `Fields::from-list` must use the same
checked constructor (verify and align if it does not). The validation
applies *uniformly to inbound and outbound*; there is no asymmetry to widen.

### S3 — Streaming amplification / decompression bombs

*Scenario.* The middleware corpus example deflate-decodes the request body
into a new `wit_stream::new()` and forwards. A malicious encoded body whose
decoded size is orders of magnitude larger than the encoded size can exhaust
host memory or cause unbounded buffering in the bridging stream tables. With
chained middlewares, each layer can amplify again.

*Check.* The existing `maxNetworkBufferSize` is per-stream and per-instance;
chained instances multiply the budget. Add a host-level
`maxAggregateInflightBytes` quota tracked on a parent `TaskState` and
inherited by spawned host-import calls. Each `stream<u8>` write that the
host brokers across an instance boundary contributes to the parent's
aggregate. Overflow surfaces as a stream-write `last-operation-failed`. The
existing per-stream cap remains as a local backstop. Default the aggregate
to 16 MiB; overridable per `serve()` instance.

### S4 — Cancellation propagation across the chain

*Scenario.* The outer `fetch()` is aborted (Node `req.destroy()` or browser
abort signal). The outer guest's `handle` future is cancelled, but the inner
guest's task — driven by the outer's import call — is still running and
holding stream readers, file descriptors, or sockets. Leaks accumulate.

*Check.* When the host cancels a task (`serve()` cleanup path), walk the
`TaskState` parent chain in the opposite direction: any child task spawned
through a host-import boundary must observe an `abort` and propagate it into
its own stream/future writers as `cancelled`. The `WaitableSetTable` already
supports waking blocked waits; introduce a `cancel(reason)` op on
`TaskState` that fans out to direct children, and have the outer cancellation
walk children before settling its own promise.

### S5 — Authority forwarding

*Scenario.* Inbound request carries `Authorization`, `Cookie`, capability
tokens. Middleware forwards them to the inner component, which is a
different trust domain (separate component, possibly third-party). The
inner component now sees the user's credentials without an explicit user
decision.

*Check.* Not enforced by jsco. This is a policy decision belonging to the
user who composed the chain. Document explicitly: jsco's `linkHandler`
helper does **no** header filtering; if the chain crosses a trust boundary,
the user must place a JS- or component-level filter between layers. The
documentation should call out the standard forbidden-forwarding list
(Authorization, Cookie, Proxy-Authorization, Set-Cookie) as a starting point.

### S6 — Resource ownership confusion

*Scenario.* The middleware destructures a request into headers + body
streams and re-assembles a new request via `Request::new(...)`, then either
returns the *new* request through the export (impossible by signature, but
imagine a host-callback variant) or aliases the *original* request handle
in two places. Double-free of the original resource handle on dispose.

*Check.* The component-model `own<request>` semantics already enforce
linearity through lift/lower: a handle is consumed by the call. jsco's
resource tables free on `remove` and the trampoline removes on lower-out of
`own`. Verify (test) that when middleware consumes a request and constructs
a new one, the inner guest's resource table receives a *fresh* handle and
the outer guest's table no longer carries the original. No new check
required; this is a regression test target.

### S7 — JSPI deadlock surface

*Scenario.* Middleware writes to a stream the inner guest reads in the same
JSPI event loop. The repo memory note `wat-stream-write-blocked-resume.md`
documents the single-instance form of this hazard. Two-instance chains add
new producer/consumer pairs.

*Check.* No new code; the fix mechanism (yield via host microtask between
write and read) is the same as the existing single-instance case. The plan
flags this as a likely first failure mode and calls out the diagnosis
pattern: enable `executor: LogLevel.Detailed` and look for a chain of
`stream-read` waits with no matching `stream-write` settle.

### S8 — Disposal of upstream while downstream still active

*Scenario.* User disposes the inner instance before the outer instance has
finished its in-flight request. Outer guest's stream reads land on a
disposed resource table and crash the host.

*Check.* Soft check: jsco's `instance.dispose()` already drains pending
operations. The plan documents the recommended dispose order (outer first)
and adds a test that verifies disposing the inner instance while a request
is mid-flight surfaces a clean error (`canceled` or `internal-error`) rather
than a host crash.

## Test plan

### Unit tests (`tests/host/`, `tests/resolver/`, `tests/runtime/`)

U1. **Cross-instance own-resource round-trip.** Build (or use existing) two
    tiny WAT components A and B sharing a single resource type. A's export
    takes `own<R>` and returns it; B's export does the same. A test wires
    `B.foo = A.exports.foo` (i.e. routes B's import to A's export), creates
    an `own<R>` in B, calls B's export, observes B forwards it through to A
    and back. Assert the resource is alive at each step and finalises
    exactly once on dispose.

U2. **Cross-instance stream<u8> handle.** A produces a stream and writes
    `[1,2,3]`; B reads it. Wire as in U1. Assert the bytes arrive intact and
    both stream ends close cleanly. Variants: (a) writer closes before
    reader starts; (b) reader cancels mid-stream.

U3. **Cross-instance future<unit> settle.** A's export returns a
    `future<unit>`; B awaits it. Wire as in U1. Assert the await resolves
    once on settle and dispose drains cleanly. Mirror with `future<u32>` to
    confirm payload-bearing futures also work (or document if they do not).

U4. **`linkHandler` helper unit.** Pure JS unit test: given a fake
    `provider.exports['wasi:http/handler@0.3.0-rc-2026-03-15'] = obj`,
    assert `linkHandler(provider)` returns `{ 'wasi:http/handler@...': obj }`
    and `linkHandler(provider, 'local:local/chain-http')` returns the same
    object under the renamed key. Throws if the provider lacks the export.

U5. **Recursion-depth check (S1).** Build a self-referential wiring (A's
    handler import resolved to A's own export through a JS shim). Issue one
    request; assert the request fails with the configured limit's mapped
    error after `maxHandlerChainDepth` levels and that no host stack
    overflow occurs.

U6. **Forbidden-header rejection on `from-list` (S2).** Call a guest that
    invokes `Headers::from_list([("host","x"), ("content-length","5")])`.
    Assert the call returns `header-error::forbidden` for both names on
    inbound and outbound paths uniformly.

U7. **Aggregate body-size cap (S3).** Construct a chain where layer 1 emits
    1 MiB, layer 2 doubles it via decompression. Configure
    `maxAggregateInflightBytes = 1.5 MiB`. Assert the second write surfaces
    `last-operation-failed` and the chain unwinds cleanly.

U8. **Cancellation cascade (S4).** Outer fetch aborts; assert the inner
    guest's body-read operation observes a cancellation and the inner
    instance's task settles within one event-loop turn (no leak).

U9. **Disposal ordering (S8).** Begin a request; before it completes,
    dispose the inner instance. Assert the outer guest sees a clean error
    and the host process does not crash.

### Integration tests (`tests/host/wasip3/wasmtime-corpus.test.ts`)

I1. **`p3_http_middleware` end-to-end.** Move the entry from
    `KNOWN_UNSUPPORTED` to a new `P3_MIDDLEWARE_CHAIN` roster. The test
    instantiates `p3_http_echo` first, then instantiates
    `p3_http_middleware` with `linkHandler(echo)` merged into its imports,
    serves the outer's `wasi:http/handler` export, issues a `POST /` with a
    deflate-encoded body and `Accept-Encoding: deflate`, asserts the
    response body decodes back to the request body. A second sub-case
    issues a plain (non-deflate) `GET /` and asserts pass-through.

I2. **`p3_http_middleware_with_chain` end-to-end.** Same as I1 but the
    inner is wired under `local:local/chain-http` via
    `linkHandler(echo, 'local:local/chain-http')`. Asserts a 10ms host
    monotonic-clock delay is observed (the guest sleeps before forwarding).

I3. **Three-deep chain.** Stack `middleware → middleware → echo` to verify
    chain depth > 1 works and surfaces the right diagnostics if it does
    not. This is the integration analogue of U5 with depth below the cap.

I4. **Concurrency under chain.** Drive 32 parallel requests through I1's
    setup; assert all succeed and per-task isolation holds (no header or
    body cross-contamination, no resource-handle aliasing). Mirrors the
    existing `p3_http_echo` concurrent test.

I5. **Renamed-and-renamed case.** Synthetic test using a hand-written WAT
    middleware that imports the handler under yet another name (e.g.
    `acme:proxy/upstream`) to confirm the helper supports arbitrary
    interface renames, not just the two corpus examples.

I6. **Inventory hygiene.** Update the corpus inventory test to include the
    new roster names so the inventory check stays exhaustive.

### Verbose-logging hooks for diagnosis

When any of the above tests fail, the `useVerboseOnFailure` harness should
already capture enough; this plan recommends the following first-pass
diagnostics:

- I1 / I2 failure: enable `executor: LogLevel.Summary` to see the lift/lower
  values entering and leaving each cross-instance call. A handle that comes
  in as `5` and goes out as `undefined` indicates a resource-table miss.
- I3 / U5 failure: enable `resolver: LogLevel.Detailed` to see canonical
  resource-id remapping per instance and confirm both instances agree on
  the WIT type identity.
- U2 / U3 / S7 deadlocks: enable `executor: LogLevel.Detailed` and grep for
  `stream-read` / `stream-write` op pairs without matching settles.

## Out of scope

- Build-time fusion via `wasm-compose` or `wac`. jsco does not ship binary
  manipulation tooling.
- Host-implemented `wasi:http/handler` import (a JS-callback handler that
  satisfies a guest's import without an inner component). Possible later
  extension; not needed for the corpus targets.
- Automatic lifetime tying between linked instances. Users dispose
  explicitly; documentation covers the recommended order.
- Cross-process composition (one jsco process serving another's import over
  IPC). Tests use only same-process JS wiring.

## Acceptance criteria

1. `p3_http_middleware.component.wasm` and
   `p3_http_middleware_with_chain.component.wasm` are removed from
   `KNOWN_UNSUPPORTED` and exercised by integration tests I1 and I2.
2. Unit tests U1–U4 pass without skips. U5–U9 pass once the corresponding
   security checks are in place.
3. Existing 104 test suites / ~3610 tests remain green; eslint and build
   stay clean.
4. The plan's "out of scope" boundary is documented in the public README
   section that introduces `linkHandler`.
