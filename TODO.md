# Testing
- create sample app in go
- compose 2 different JSCO instantiated components JSCO(WASM) -> JSCO(WASM)
- add more WIT text based test scenarios into parser tests (parser coverage 67% — needs improvement)
- improve utils/ coverage (47% — lowest in project)
- add Firefox browser test (Chrome done via Playwright)
- scenarios testing memory leaks
- consider too many HTTP headers or too large body
- update consumer,forwarder,implementer to cover all wasip2 functions and fix tests
- fix `collectCoverageFrom` many exclusions are just excuses
- dedicated tests for new p3 types. future, stream
- validate string, list and buffer sizes to not cause OOM or out of range
- WASIp3: interleaved suspension
- WASIp3: re-entry on async - queue
- WASIp2: at the moment we test with wasm32-wasip1, which also has preview1-to-preview2 adapter shim

# Build
- add coverage to CI, fail if lower than some %
- produce NPM package and release it to www.npmjs.com
- rollup magic to eliminate debug helpers and asserts (jsco_assert TODO in assert.ts)
- use quoted properties for identifiers that must survive terser mangling (e.g. `leb128DecodeU64`, `buf`, `memory`)
- reduce Release bundle size (264KB debug — target <40KB minified+gzipped)

# WASI Preview 1
- implement by forwarding to WASIp2 or WASIp3
- test with D:\nesm\tests\samples\wasi\

# WASI Preview 3
- zero copy bring-your-own-buffer

# Demo
- create demo web site
- command line in the browser for WASI cli programs
- update `Demo scope` in readme

# Other
- pass CLI args to wasi:cli
- OCI download
- explore webidl2wit
- review license & add CoC
- donate this project to @bytecodealliance
- write article on how it works

# Resolver todo
- export and import ABI interfaces for direct binding without JS ("fused adapters")
- consider "inlining" https://github.com/bytecodealliance/wasmtime/blob/main/crates/environ/src/component/translate/inline.rs

# Binder todo
- respect model options for CompactUTF-16 (latin1+utf16) encoding
- option to bind lazily only when methods are called
- fused adapters https://github.com/bytecodealliance/wasmtime/blob/main/crates/environ/src/component/translate/adapt.rs
- validate HTTP API to not receive evil payload, like unlimited body or headers
- multiple memories

# Parser todo
- add options to delay parsing core modules
- add options to skip parsing/storing custom sections
