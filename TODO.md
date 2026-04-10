# Resolver todo
- nested modules / nested components
- export and import ABI interfaces for direct binding without JS ("fused adapters")
- make sure we don't keep references to model after component was created (memory leak risk)
- consider "inlining" https://github.com/bytecodealliance/wasmtime/blob/main/crates/environ/src/component/translate/inline.rs
- convert `export const enum` to numeric literals via rollup transform to save download size
- instance-local type isolation: `registerInstanceLocalTypes` overwrites global `resolvedTypes` entries — could cause bugs if multiple instances share type indices

# Binder todo
- respect model options for UTF-16 encoding (currently UTF-8 only)
- option to bind lazily only when methods are called
- fused adapters https://github.com/bytecodealliance/wasmtime/blob/main/crates/environ/src/component/translate/adapt.rs

# Parser todo
- add options to delay parsing core modules
- add options to skip parsing/storing custom sections

# Testing
- improve zoo test coverage (currently test.failing — debug remaining resolver gaps)
- add more WIT text based test scenarios into parser tests (parser coverage 67% — needs improvement)
- change `zoo` to be program with main, not lib
- create sample app with nested modules
- create sample app in go
- create sample app in JS
- use JSCO to bind multiple components at runtime
- add Firefox browser test (Chrome done via Playwright)
- improve utils/ coverage (47% — lowest in project)

# Build
- add coverage to CI, fail if lower than some %
- produce NPM package and release it to www.npmjs.com
- rollup magic to eliminate debug helpers and asserts (jsco_assert TODO in assert.ts)
- use quoted properties for identifiers that must survive terser mangling (e.g. `leb128DecodeU64`, `buf`, `memory`)
- reduce Release bundle size (264KB debug — target <40KB minified+gzipped)

# Demo
- create demo web site
- command line in the browser for WASI cli programs

# Other
- convert this TODO into github issues (this is more convenient for now)
- attract more contributors
- review license & add CoC
- donate this project to @bytecodealliance
- write article on how it works
- multi-memory https://github.com/bytecodealliance/jco/blob/main/crates/js-component-bindgen/src/core.rs
- implement WASIp3 (async model with native WASM stack switching, replaces JSPI workaround)

# WASI Preview 2 Implementation Status

Browser-native WASI preview 2 host. Independent implementation from first principles.

## Approach

- **Source location:** `src/host/wasip2/`
- **Async strategy:** JSPI experimental support for blocking calls
- **Spec conformance:** Pragmatic — make real components work, fix spec gaps as encountered
- **No external dependencies:** Not wrapping `@bytecodealliance/preview2-shim`

## Implemented (all with tests, 84% coverage)

- wasi:random/random, insecure, insecure-seed
- wasi:clocks/wall-clock, monotonic-clock
- wasi:io/error, poll, streams
- wasi:cli/environment, exit, stdin, stdout, stderr, terminal-*
- wasi:filesystem/types (in-memory VFS), preopens
- wasi:http/types, outgoing-handler (fetch() backend)
- wasi:sockets/* (stubs — not-supported, browser limitation)
- JSPI integration with WebAssembly.promising/Suspending

## Remaining Work

### Resolver: Import index space unification
- `importToInstanceIndex` only covers instance-kind imports
- Function imports work via name lookup; unified index spaces would allow `CanonicalFunctionLower` to reference them by index

### Build: Assert elimination
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

## Current Stats (April 2026)
- **775 tests** across **25 suites** (774 pass, 1 skipped)
- **69 source files**, **25 test files**
- **264KB bundle** (debug), 28KB types
- Coverage: Model 100%, Binding 95%, WASI 84%, Resolver 76%, Parser 67%, Utils 47%
- Overall: 81% statements, 70% branches

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