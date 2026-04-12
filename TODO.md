# Resolver todo
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
- multiple memories

# Parser todo
- add options to delay parsing core modules
- add options to skip parsing/storing custom sections

# Testing
- create sample app in go
- compose 2 different JSCO instantiated components JSCO(WASM) -> JSCO(WASM)
- add more WIT text based test scenarios into parser tests (parser coverage 67% — needs improvement)
- improve utils/ coverage (47% — lowest in project)
- add Firefox browser test (Chrome done via Playwright)
- scenarios testing memory leaks
- consider too many HTTP headers or too large body

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
