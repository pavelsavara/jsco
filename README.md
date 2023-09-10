# jsco - Browser polyfill for running WASM components

## Goals
- create browser polyfill for running WASM components
- streaming parser of binary WIT
- streaming compilation of WASM module during .wasm file download
- in-the-browser creation of instances and necessary JavaScript interop
- small download size, fast enough

# How
- parser: read binary WIT to produce model of the component, it's sub components, modules and types
- compile modules via Browser API [`WebAssembly.compileStreaming`](https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/compileStreaming)
- composer: resolve dependencies, create instances, glue it together.
- JS binding: for component's top level imports and exports create lifting/lowering of the data types passed.
- just JS (no rust dependency), TypeScript, RollupJS

### Scope
- hello world demo [wit](hello\wit\hello.wit) [wat](hello\wat\hello.wat)
- this is just small attempt in limited time. It may grow into something larger ...
- binding for `string` and `i32`, `record` as stretch goal.
- minimal JS API for this polyfill: 
    - `async function parse(url: string): Promise<Model>`
    - `async function instantiate(model: Model, imports: Imports): Promise<Exports>`

### stretch goals
- generator of typeScript for imports/exports and their arguments
- loading WASI preview 2 polyfill would be amazing stretch goal. I have no idea how to.

## Why
- as a hackathon week project: https://hackbox.microsoft.com/hackathons/hackathon2023/project/32678
- to learn more about WASM component model
- because JCO is too large
- because independent implementation will help the WASM/WIT/WASI to make progress
- browsers currently don't implement WASM component model host

## Inspiration
- https://github.com/bytecodealliance/jco
- https://github.com/bytecodealliance/jco/blob/main/crates/js-component-bindgen/src/transpile_bindgen.rs
- https://github.com/bytecodealliance/wasm-tools/tree/main/crates/wit-parser
- https://github.com/bytecodealliance/wasm-tools/blob/main/crates/wit-component/src/decoding.rs
- https://github.com/bytecodealliance/wasmtime/blob/main/crates/environ/src/component/types.rs
- https://github.com/bytecodealliance/jco/blob/main/src/cmd/transpile.js
- https://github.com/yskszk63/stream-wasm-parser
- https://github.com/WebAssembly/component-model/blob/main/design/mvp/canonical-abi/definitions.py

## Documentation
- https://github.com/WebAssembly/component-model/blob/main/design/mvp/WIT.md
- https://github.com/WebAssembly/component-model/blob/main/design/mvp/Binary.md
- https://github.com/WebAssembly/module-linking/blob/main/proposals/module-linking/Explainer.md
- https://www.fermyon.com/blog/webassembly-component-model

## Notes
- for now we have dependency on JCO, so that we could learn from it. It will go away later.

## Contribute
- install rust
- `cargo install wasm-tools`
- install nodejs + npm
- `npm install`
- `npm run build`
- `npm run build:hello && npm run build:hello-wat`
- `npm run test`
- see "scripts" in package.json
- use eslint plugin to VS code, with format on save