# WASI Preview 2 Implementation Plan

Browser-native WASI preview 2 host for jsco. Independent implementation from first principles.

## Approach

- **Source location:** `src/host/wasip2/`
- **Async strategy:** JSPI experimental support for blocking calls
- **Spec conformance:** Pragmatic — make real components work, fix spec gaps as encountered
- **No external dependencies:** Not wrapping `@bytecodealliance/preview2-shim`

## Completed Tracks

### Track R: Architecture Refactoring ✅
All 7 phases (R0–R6). Type safety foundations, scoped memoization, type resolution pass, calling convention types, decomposed BindingContext, explicit instantiation plan, resolver bug fixes.

### Track A: Resolver + Binding Completion ✅
All 6 phases (A1–A6) + spec compliance audit. All CM types: primitives, records, tuples, lists, options, results, variants, enums, flags, own/borrow. Calling convention with param/result spilling. 304 tests.

### Track C: Canonical ABI Completion ✅
All 4 phases (C1–C4). Memory alignment & bounds validation, string encoding validation, complex spilling & nested memory layout, runtime behavioral guarantees (poisoning, reentrance, post-return). 77 tests.

### Track D: WASI Host Interfaces ✅
All 6 phases (D1–D6). Pure TypeScript in `src/host/wasip2/`:
- `wasi:random/*`, `wasi:clocks/*`, `wasi:io/*` (poll, streams, error)
- `wasi:cli/*`, `wasi:filesystem/*`, `wasi:http/*`, `wasi:sockets/*` (stubs)
- 308 tests across 10 suites.

### Track E: Integration (E1–E2) ✅
- E1: `createWasiHost()` factory + `instantiateWasiComponent()` with JSPI wrapping
- E2: First WASI component (`wasi-hello`) runs end-to-end, stdout captured. 6 bugs fixed during integration.

### Known Code TODOs (resolved)
- ✅ Type exports/imports (7 resolver locations) — all handled
- ✅ Alias chain tracing — recursive resolution with bounded depth
- ✅ Parser sections 3 & 9 — core type and start section parsing
- N/A Inner-record heap allocation — correct as-is (function-level calling convention)

## Remaining Work

### Phase E3: Full CLI World
- Support the full `wasi:cli/command` world
- Components that use env vars, args, file I/O, clocks, random
- Integration test: Rust program that reads a file, processes it, writes output

### Open TODOs

#### Resolver: Import index space unification
- `importToInstanceIndex` only covers instance-kind imports. Component-kind imports may need work for multi-import components.
- Function imports work via name lookup; unified index spaces would allow `CanonicalFunctionLower` to reference them by index.

#### Build: Assert elimination
- `jsco_assert` should be eliminated in Release builds via Rollup plugin (inline macro)
- Jest can't resolve Rollup virtual modules for build-time constant injection

### Test Coverage Gaps

| Category | Detail | Priority |
|----------|--------|----------|
| Nested compound types | `option<option<u8>>`, `result<list<u8>, string>` | High |
| Resource borrow accounting | `trap_if(h.num_lends != 0)` for own lift/drop | High |
| Discriminant size boundaries | Variant/enum 255 vs 256 cases | Medium |
| Multi-word flags | >32 flag members | Medium |
| Empty containers | Empty record, empty tuple | Low |

### Integration Test Plan
- Implementation, consumer, forwarder components
- For each WASI API
- All parameter types (core + component), as param and return value
- Sync and async, in Rust and JS
- Cross-component callbacks (A→B→A) and multi-component instantiation

## Current Stats
- **759 tests** across **24 suites** (758 pass, 1 skipped)
- Parser ~90%, Resolver ~65%, Lifting/Lowering ~70%, WASI host complete

## JSPI Strategy

1. **Detection:** Probe for `WebAssembly.Suspending` at `createWasiHost()` time
2. **Fail-early:** Throw if unavailable — JSPI is required for WASI blocking calls
3. **`noJspi` option:** Available for non-JSPI environments
4. Internal APIs are async; WASI-facing functions use `WebAssembly.promising()` / `WebAssembly.Suspending`

## Key Reference Specs

- [Component Model Binary Format](https://github.com/WebAssembly/component-model/blob/main/design/mvp/Binary.md)
- [Canonical ABI definitions.py](https://github.com/WebAssembly/component-model/blob/main/design/mvp/canonical-abi/definitions.py)
- [JCO transpile_bindgen.rs](https://github.com/bytecodealliance/jco/blob/main/crates/js-component-bindgen/src/transpile_bindgen.rs)
- [Wasmtime component types.rs](https://github.com/bytecodealliance/wasmtime/blob/main/crates/environ/src/component/types.rs)

## Minify
- internal fields