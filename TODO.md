# Resolver todo
- nested modules / nested components
- export and import ABI interfaces for direct binding without JS ("fused adapters")
- consider "inlining" https://github.com/bytecodealliance/wasmtime/blob/main/crates/environ/src/component/translate/inline.rs

# Binder todo
- respect model options for CompactUTF-16 (latin1+utf16) encoding
- option to bind lazily only when methods are called
- fused adapters https://github.com/bytecodealliance/wasmtime/blob/main/crates/environ/src/component/translate/adapt.rs
- validate string, list and buffer sizes to not cause OOM or out of range
- validate HTTP API to not receive evil payload, like unlimited body or headers
- limit runtime allocations: `for (const { name, lowerer } of fieldLowerers)`
- use decoder/encoder `String.fromCharCode(...u16)`
- unroll `loadFromMemory` during binding
- free memory and resource handles
- make i64 -> number vs bingint configurable again, add tests for it. usesNumberForInt64

# Parser todo
- add options to delay parsing core modules
- add options to skip parsing/storing custom sections

# Testing
- update `zoo` sample with new methods that have all possible types of parameters and return types. Use them in tests.
- create `city` component which be program with main, not a lib
- use `zoo` as nested component in `city`

- create sample app in go
- create sample app in JS
- use JSCO to bind multiple components at runtime
- improve zoo test coverage (currently test.failing — debug remaining resolver gaps)
- add more WIT text based test scenarios into parser tests (parser coverage 67% — needs improvement)
- improve utils/ coverage (47% — lowest in project)
- Nested compound types | `option<option<u8>>`, `result<list<u8>, string>` | High |
- Resource borrow accounting | `trap_if(h.num_lends != 0)` for own lift/drop | High |
- Discriminant size boundaries | Variant/enum 255 vs 256 cases | Medium |
- Multi-word flags | >32 flag members | Medium |
- Empty containers | Empty record, empty tuple | Low |
- add Firefox browser test (Chrome done via Playwright)
- scenarios testing own/borrow
- scenarios testing resource handles isolation
- scenarios testing resource handles ref counting and cleanup
- scenarios testing memory leaks


# Integration Test Plan
- Implementation, consumer, forwarder components
- For each WASI API
- All parameter types (core + component), as param and return value
- Sync and async, in Rust and JS
- Cross-component callbacks (A→B→A) and multi-component instantiation

# Build
- add coverage to CI, fail if lower than some %
- produce NPM package and release it to www.npmjs.com
- rollup magic to eliminate debug helpers and asserts (jsco_assert TODO in assert.ts)
- use quoted properties for identifiers that must survive terser mangling (e.g. `leb128DecodeU64`, `buf`, `memory`)
- reduce Release bundle size (264KB debug — target <40KB minified+gzipped)

# WASI Preview 1
- implement by forwarding to WASIp2 or WASIp3
- test with D:\nesm\tests\samples\wasi\

# WASI Preview 2 Implementation Status
- implement socket and http server on nodeJS
- have look at https://github.com/pavelsavara/node-mono-server
- at the moment we test with wasm32-wasip1, which also has preview1-to-preview2 adapter shim
- forwarder, implementer and echo-reactor should ideally use wasm32-unknown-unknown
- consumer could use either wasm32-wasip2

# WASI Preview 3
- interleaved suspension
- re-entry on async - queue
- zero copy bring-your-own-buffer

# Minification
- `jsco_assert` should be eliminated in Release builds via Rollup plugin (inline macro)
- Jest can't resolve Rollup virtual modules for build-time constant injection
- internal fields
- `isDebug` doesn't trim, use proper virtual/const import

# Demo
- create demo web site
- command line in the browser for WASI cli programs
- update `Demo scope` in readme

# Other
- convert this TODO into github issues (this is more convenient for now)
- attract more contributors
- review license & add CoC
- donate this project to @bytecodealliance
- write article on how it works
- multi-memory https://github.com/bytecodealliance/jco/blob/main/crates/js-component-bindgen/src/core.rs
- implement WASIp3 (async model with native WASM stack switching, replaces JSPI workaround)

# Skipped Tests

## JSPI — end-to-end with stdout capture (hello-world.test.ts)
`WebAssembly.promising()` wrapping causes the WASM adapter to receive a Promise where
it expects a sync i32 value, coercing handle to 0. The `descriptor.get-type` call then
fails with `Invalid resource handle: 0` because handle 0 was never created (handles
start at 1). Additionally, the JSPI test poisons Node.js state, causing subsequent
tests in the same file to fail. Root cause is in how JSPI suspension/resumption
interacts with the component model's synchronous resource handle creation chain
(fd_write → get-directories → descriptor.get-type).
**Blocked on**: understanding how `WebAssembly.promising()` interacts with adapter-
generated trampolines. May require WASIp3 async model (native WASM stack switching)
to solve properly.

## Non-JSPI error message — block() throws JSPI error (poll.test.ts)
Intentionally skipped when running with `--experimental-wasm-jspi`. The test verifies
the error message shown to users who don't have JSPI enabled. It only runs when JSPI
is absent. Not a bug — test infrastructure design.
