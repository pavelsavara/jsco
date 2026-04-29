# Plan 5: Boundary OOM / size validation (string, list, buffer)

## Motivation
TODO: *validate string, list and buffer sizes to not cause OOM or out of range*.

JSCO already enforces several DoS-mitigation budgets at the runtime level (`--max-allocation-size`, `--max-handles`, `--max-memory-bytes`, `--max-canon-ops-without-yield`, `--max-blocking-time-ms`, etc. — see README). What's still missing is a systematic boundary-validation pass at the **canonical-ABI lifting/lowering layer** for compound values whose declared length comes from guest-controlled bytes. A malicious or buggy component can declare a list of length `2^31-1` and a tiny element type, causing the host to attempt a multi-gigabyte allocation before any other limit kicks in.

Per [copilot-instructions.md](.github/copilot-instructions.md), system-boundary validation has explicit rules for each value kind. Compound types (record, list, tuple, flags, result, variant) require null/undefined guards, but *length* validation against an upper bound is not yet uniform.

## Goal
Every length-bearing canonical-ABI primitive crossing the boundary (lift *or* lower) is bounded against an explicit limit, with a clear `RangeError` (or canonical trap, per spec) when exceeded.

## Approach

### Step 1: Inventory length-bearing types
- **string lift**: `(ptr, len)` → JS string. Length is element count; bytes = `len * encoding-width`.
- **list<T> lift**: `(ptr, len)` → JS array. Bytes = `len * sizeof(T)`.
- **buffer / fixed-list (P3)**: similar to list but with fixed shape.
- **stream / future read** (P3): read result has length too.
- **flags lower**: bit-vector size; bounded by type, not guest input — likely safe but verify.
- **variant / option / result discriminant**: bounded by type — verify.

### Step 2: Define limits surface
Extend `AllocationLimits` (already in `WasiP3Config`) to include:
- `maxStringLength` (default e.g. 16 MiB — already implied via `--max-allocation-size` but make explicit).
- `maxListLength` (default e.g. 1M elements; also gated by `--max-allocation-size` for total bytes).
- `maxBufferBytes` (default e.g. 16 MiB).
- `maxStreamChunkBytes`.

These flow through to the `BindingContext` / `MarshalingContext` so lifting code can read them in the hot path.

### Step 3: Add validation at the lift boundary in `to-abi.ts`
At each `len`-consuming lift:
```ts
if ((len >>> 0) > limits.maxListLength) {
    throw new RangeError(`list length ${len} exceeds limit ${limits.maxListLength}`);
}
const totalBytes = len * elementSize;
if (totalBytes > limits.maxAllocationSize) {
    throw new RangeError(`list payload ${totalBytes} bytes exceeds maxAllocationSize`);
}
```
Apply uniformly to:
- string (UTF-8: bytes; UTF-16/Latin1: post-decode length).
- list<T> (compute element size from type).
- buffer / fixed-list / stream chunk.

### Step 4: Lower-side validation
Reject obviously-bogus *JS* inputs at lower:
- `Array.isArray(val) && val.length > limit` → `RangeError` before allocating.
- string length × max encoding width > `maxAllocationSize` → reject.
- This protects against host bugs that would otherwise corrupt the WASM heap.

### Step 5: Tests
- For each type, a positive test (just under limit, succeeds).
- For each type, a negative test (just over limit, throws `RangeError`).
- A fuzz-style test: random lengths sampled across log-scale, asserting either success or a *clean* `RangeError` (never a crash, never an unhandled rejection).
- WAT components in [integration-tests/bad-guests-p3-wat/](integration-tests/bad-guests-p3-wat/) already exist for hostile-guest scenarios — extend with size-bomb cases.

### Step 6: Documentation
- README's "Resource Limits" table gains the new options.
- CHANGELOG note: tightened canonical-ABI boundary validation.

## Acceptance criteria
- [ ] Every lift path that reads a guest-controlled length validates against an explicit cap *before* allocating.
- [ ] Every lower path that takes a JS-controlled length validates before allocating.
- [ ] Errors are `RangeError` with the offending value and limit in the message.
- [ ] Tests cover every size-bearing type, both directions.
- [ ] No measurable performance regression on the non-malicious happy path (validate with the existing micro-benchmarks).

## Risks
- Per-call validation in the hot path could slow down legitimate workloads. Mitigation: branch on a single integer compare against a context-level field; modern V8 inlines and predicts well.
- Default limits set too tight could break legitimate components. Mitigation: defaults are generous (multi-MB), users opt into stricter via CLI/config.

## Out of scope
- Streaming back-pressure (separate TODO).
- Memory-leak / handle-leak detection (separate TODO).
- Fuzzing (separate TODO).
