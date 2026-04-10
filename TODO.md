# Resolver todo
- nested modules / nested components
- export and import ABI interfaces for direct binding without JS ("fused adapters")
- make sure we don't keep references to model after component was created (memory leak risk)
- consider "inlining" https://github.com/bytecodealliance/wasmtime/blob/main/crates/environ/src/component/translate/inline.rs

# Binder todo
- respect model options for CompactUTF-16 (latin1+utf16) encoding
- option to bind lazily only when methods are called
- fused adapters https://github.com/bytecodealliance/wasmtime/blob/main/crates/environ/src/component/translate/adapt.rs
- validate string, list and buffer sizes to not cause OOM or out of range
- validate HTTP API to not receive evil payload, like unlimited body or headers

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
- Nested compound types | `option<option<u8>>`, `result<list<u8>, string>` | High |
- Resource borrow accounting | `trap_if(h.num_lends != 0)` for own lift/drop | High |
- Discriminant size boundaries | Variant/enum 255 vs 256 cases | Medium |
- Multi-word flags | >32 flag members | Medium |
- Empty containers | Empty record, empty tuple | Low |

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

# WASI Preview 3
- interleaved suspension
- re-entry on async - queue

# Minification
- `jsco_assert` should be eliminated in Release builds via Rollup plugin (inline macro)
- Jest can't resolve Rollup virtual modules for build-time constant injection
- internal fields

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
