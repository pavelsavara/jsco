# Specification Gaps and Differences

This document catalogs gaps between the jsco unit test expectations and the
WASM Component Model Canonical ABI / WASIp3 specifications.

## 1. Canonical ABI Compliance

### 1.1 Float NaN Canonicalization — Tests Missing
**Spec**: Lifting floats from WASM must replace arbitrary NaN payloads with the canonical
NaN bit pattern (`0x7fc00000` for f32, `0x7ff8000000000000` for f64). Lowering floats
into WASM may scramble NaN payloads nondeterministically (deterministic profile must
canonicalize).
**Implementation**: Correct — both `f32Lifting`/`f64Lifting` and `f32Lowering`/`f64Lowering`
replace NaN with the canonical NaN value.
**Test gap**: Tests verify `NaN` is preserved as `NaN` but do not verify that the resulting
value has the *canonical* bit pattern (payload bits zeroed). A signaling NaN or a NaN
with a custom payload must produce the same canonical quiet NaN after lifting or lowering.

### 1.2 Bool Lowering — Non-Canonical i32 Values
**Spec**: `convert_int_to_bool` treats `0` as `false` and all other i32 values as `true`
(`bool(i)` in the reference Python).
**Implementation**: `args[0] !== 0` — matches the spec behavior.
**Status**: Compliant. No gap.

### 1.3 Char Lifting — Missing >0x10FFFF Guard
**Spec**: `trap_if(i >= 0x110000)` on the i32 value read from WASM.
**Implementation**: Lifting uses `srcJsValue.codePointAt(0)` which cannot produce values
above `0x10FFFF` from a valid JS string. However, when a raw i32 arrives from WASM
(lowering direction), the check `i >= 0x110000` is present.
**Test gap**: No explicit test passes a raw i32 > `0x10FFFF` through the lowering path
to confirm the trap message and boundary.

### 1.4 String Encoding — `latin1+utf16` Not Tested
**Spec**: Three string encodings: `utf8`, `utf16`, `latin1+utf16`.
**Implementation**: All three are implemented.
**Test gap**: The `latin1+utf16` encoding path has no dedicated unit tests for the dynamic
Latin-1 / UTF-16 switching or the high-bit tagging of the code-unit count.

### 1.5 MAX_FLAT_RESULTS = 1
**Spec**: `MAX_FLAT_RESULTS = 1`, `MAX_FLAT_PARAMS = 16`, `MAX_FLAT_ASYNC_PARAMS = 4`.
**Implementation**: Matches exactly.
**Status**: Compliant. No gap.

### 1.6 Flags — Empty Flags Not Validated
**Spec**: `assert(0 < n <= 32)` — flags must have at least 1 and at most 32 labels.
**Test gap**: No test verifies that a flags type with 0 labels is rejected.

### 1.7 Empty Records
**Spec**: `assert(s > 0)` in `elem_size_record` — zero-field records are disallowed.
**Test gap**: No test verifies rejection of empty records.

## 2. WASIp3 Random

### 2.1 Short Reads Allowed
**Spec**: `get-random-bytes(max-len)` and `get-insecure-random-bytes(max-len)` state:
"Implementations MAY return fewer bytes than requested (a short read). Callers that
require exactly `max-len` bytes MUST call this function in a loop."
**Implementation**: Always returns exactly `max-len` bytes, which is compliant.
**Test gap**: Tests assert `bytes.length === N` as an exact match. While the implementation
is compliant, the tests would break if the implementation were changed to return short
reads. Tests should document this expectation and additionally verify the spec invariant:
"at least 1 byte when `max-len` > 0".

### 2.2 getRandomBytes — Non-BigInt Input Not Spec-Conformant
**Spec**: The `max-len` parameter is `u64` — a BigInt in the JS binding.
**Implementation**: Silently accepts `number` and `undefined` via implicit coercion.
**Test gap**: The tests for non-bigint inputs (`undefined`, `number`) document current
behavior but these are outside the spec contract. The spec expects a `u64` (BigInt).

## 3. WASIp3 Clocks

### 3.1 System Clock Nanoseconds Range
**Spec**: "The nanoseconds field of the output is always less than 1000000000."
**Implementation**: `(ms % 1000) * 1_000_000` — always produces 0–999_000_000, compliant.
**Status**: Already tested in `clocks.test.ts` (nanoseconds is in [0, 999_999_999]). No gap.

### 3.2 Monotonic Clock Overflow
**Spec**: "This function traps if it's not possible to represent the value of the clock
in a `mark`" (u64).
**Implementation**: Uses `BigInt(Math.round(performance.now() * 1_000_000))` which will not
overflow u64 in practice.
**Status**: Compliant. No test gap (impractical to test).

## 4. WASIp3 CLI

### 4.1 Exit Code Range
**Spec**: `exit` takes a `result` type (`{tag: 'ok'}` or `{tag: 'err'}`), not an integer.
`exitWithCode` takes a `u32` exit code.
**Implementation**: `exitWithCode(256)` passes through without u32 range validation.
**Test gap**: Tests pass 256 without checking whether it should be masked to u8 or u32.
The WIT shows `u32`, so 256 is valid. The current test expectation is correct for u32 but
the test description could be more explicit.

## 5. WASIp2-via-WASIp3 Adapter

### 5.1 Socket Adapter — Near-Zero Coverage
**Coverage**: 38.88% functions, 18.18% branches.
**Gap**: `adaptTcpCreateSocket`, `adaptUdpCreateSocket`, `adaptIpNameLookup`, and the
resolve-address-stream internals are entirely untested. WASIp2 networking components will
exercise these paths.

### 5.2 I/O Stream Blocking — Untested Paths
**Coverage**: 67.69% functions, 40.47% branches.
**Gap**: `blockingRead`, `blockingSkip`, `blockingWriteAndFlush`, `blockingSplice`, and
the internal pump/iterator logic have no test coverage. Programs that do synchronous
blocking I/O rely on these.

### 5.3 Adapter Index — 85% Functions Uncovered
**Coverage**: 15.6% functions.
**Gap**: ~146 adapter wrapper functions in the P2-via-P3 index are not exercised.
These are thin wrappers but cover filesystem, HTTP, and socket adapter paths.

## 6. WASIp1-via-WASIp3

### 6.1 Filesystem Syscalls — Partial Coverage
**Coverage**: 63.32% lines, 32.77% branches.
**Gap**: `fd_filestat_set_size`, `fd_filestat_set_times`, `fd_pread`, `fd_pwrite`,
`fd_readdir`, `fd_allocate`, `fd_fdstat_set_flags`, `fd_fdstat_set_rights` are untested.
`fd_readdir` with cookie-based pagination is particularly important.

### 6.2 Scatter-Gather I/O — Barely Tested
**Coverage**: vfs-helpers.ts at 41.77% lines, 17.24% branches.
**Gap**: Multi-buffer reads/writes (`vfsReadScatter`, `vfsReadScatterAt`,
`vfsWriteGatherAt`) with partial EOF handling, zero-length iovs, and short reads
are not tested.

## 7. Summary of Required Actions

| # | Area | Action | Impact |
|---|------|--------|--------|
| 1 | Float NaN canonicalization | Add bit-pattern tests for f32/f64 NaN lifting/lowering | Spec compliance |
| 2 | Char boundary | Add test for lowering codepoint 0x110000 | Spec compliance |
| 3 | System clock nanoseconds | Add assertion `< 1_000_000_000` | Spec compliance |
| 4 | Random at-least-1-byte | Add invariant test for non-empty result when maxLen > 0 | Spec compliance |
| 5 | Socket adapter | Add tests for TCP/UDP create and IP name lookup | Coverage +~2% |
| 6 | P1 filesystem syscalls | Add tests for pread/pwrite/readdir/set_times | Coverage +~1.5% |
| 7 | Scatter-gather I/O | Add tests for multi-iov reads with EOF | Coverage +~0.5% |
| 8 | Blocking I/O streams | Add tests for blockingRead/blockingWrite | Coverage +~1% |
