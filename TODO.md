# Resolver todo
- cache component instance
- `resolveComponentAliasInstanceExport` should not be cheating about function names
- cleanup `confused:`
- resolve data types, `TODO types`
- `resolveCanonicalFunctionLower` need to load function type without cheating
- remove or simplify debugging helpers
- be able to run `zoo` sample
- invoke start section ?
- nested modules
- export and import ABI interfaces for direct binding without JS. Something needs to copy the bytes ...
- bind WASI preview 2 `@bytecodealliance/preview2-shim` npm package when necessary
- make sure we don't keep references to model after component was created. To not leak memory. How to test this ?

# Binder todo
- implement all data types
- implement argument spilling
- implement record flattening
- implement size and alignment
- implement `CallContext` and own/borrow
- respect model options (UTF8/UTF16)
- trap exceptions and kill the component or marshall the error

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
- use JSCO to bind 2 components on the runtime
- improve test coverage

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