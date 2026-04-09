# Resolver todo
- be able to run `zoo` sample
- invoke start section
- nested components/modules
- fused adapters — direct binding without JS, something needs to copy the bytes
- bind WASI preview 2 `@bytecodealliance/preview2-shim` npm package when necessary
- make sure we don't keep references to model after component was created, to not leak memory
- consider "inlining" https://github.com/bytecodealliance/wasmtime/blob/main/crates/environ/src/component/translate/inline.rs
- convert `export const enum` to numeric literals via rollup transform to save download size

# Binder todo
- respect model options for UTF-16 encoding (currently UTF-8 only)
- trap exceptions and poison the component instance, or marshall the error
- option to bind lazily only when methods are called
- fused adapters https://github.com/bytecodealliance/wasmtime/blob/main/crates/environ/src/component/translate/adapt.rs

# Parser todo
- load start section
- add options to delay parsing core modules
- add options to skip parsing/storing custom sections

# Testing
- add more WIT text based test scenarios into parser tests
- change `zoo` to be program with main, not lib
- create sample app with nested modules
- create sample app in go
- create sample app in JS
- use JSCO to bind multiple components at runtime
- improve test coverage — currently ~4400 lines of binding tests, needs broader integration coverage
- add Firefox browser test (Chrome done via Playwright)

# Build
- add coverage to CI, fail if lower than some %
- produce NPM package and release it to www.npmjs.com
- get rid of rollup `Circular dependencies` warning
- rollup magic to eliminate debug helpers and asserts

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