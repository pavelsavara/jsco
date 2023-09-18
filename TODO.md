# Resolver todo
- `resolveCanonicalFunctionLower` has **hardcoded lookup of the data type**, this would not work outside of this demo!
- handling of the import/export names/namespaces is probably wrong
- resolve data types, `TODO types`
- remove or simplify debugging helpers
- simplify Resolver types
- be able to run `zoo` sample
- invoke start section ?
- nested modules
- export and import ABI interfaces for direct binding without JS. Something needs to copy the bytes ... "fused adapters" ?
- bind WASI preview 2 `@bytecodealliance/preview2-shim` npm package when necessary
- make sure we don't keep references to model after component was created. To not leak memory. How to test this ?
- consider "inlining" https://github.com/bytecodealliance/wasmtime/blob/main/crates/environ/src/component/translate/inline.rs
- all `export const enum` could be converted to numeric, which will be faster and save few KB of the download. But debugging and JSON would have numbers. Maybe regexp in rollup.

# Binder todo
- implement all data types
- implement argument spilling
- implement record flattening 
    - https://github.com/bytecodealliance/wasmtime/blob/2ad057d735edc43f8ba89428d483f2b2430c1068/crates/environ/src/component.rs#L29-L38
    - https://github.com/WebAssembly/component-model/blob/673d5c43c3cc0f4aeb8996a5c0931af623f16808/design/mvp/canonical-abi/definitions.py#L788
- implement size and alignment
- implement `CallContext` and own/borrow
- respect model options (UTF8/UTF16)
- trap exceptions and kill the component or marshall the error
- option to bind lazily only when methods all called
- fused adapters https://github.com/bytecodealliance/wasmtime/blob/main/crates/environ/src/component/translate/adapt.rs

# Parser todo
- load start section
- add options to delay parsing core modules
- add options to skip parsing/storing custom sections

# Testing
- add more WIT text based test scenarios into parser tests like[](src/parser/alias.test.ts)
- change `zoo` to be program with main, not lib
- create sample app with nested modules
- create sample app in go
- create sample app in JS
- use JSCO to bind multiple components at runtime
- improve test coverage
- add test with Chrome, FF

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