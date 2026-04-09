# jsco - Browser polyfill for running WASM components

### Demo

See [live demo](https://pavelsavara.github.io/jsco/) and [browser demo sources](https://github.com/pavelsavara/jsco/tree/demo-page)

## Goals
- browser polyfill for running WASM components.
- streaming parser of binary WIT
- streaming compilation of WASM module during .wasm file download
- in-the-browser creation of instances and necessary JavaScript interop
- small download size, fast enough (current prototype is 35 KB)

## How
- parser: read binary WIT to produce model of the component, it's sub components, modules and types
- compile modules via Browser API [`WebAssembly.compileStreaming`](https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/compileStreaming)
- resolver: resolve dependencies, create instances, bind it together.
- JS binding: for component's imports and exports
- just JS (no rust dependency), TypeScript, RollupJS

## Status
🚧 Work in progress — core engine is solid, integration still maturing 🚧

| Layer | Progress | Notes |
|-------|----------|-------|
| Parser | 90% | Binary WIT streaming parser, all sections covered |
| Resolver | 65% | Type resolution, instances, imports/exports, type graph; missing: nested components, fused adapters |
| Lifting/Lowering | 70% | All CM types (primitives, records, tuples, lists, options, results, variants, enums, flags, own/borrow); calling convention with param/result spilling; spec compliance audit done |
| WASI Host | 100% | All preview 2 interfaces: random, clocks, I/O, CLI, filesystem, HTTP, sockets (stubs) |
| Integration | E2 | First WASI CLI component runs end-to-end with JSPI |
| Testing | 70% | 759 tests across 24 suites; Playwright browser test; missing: broader integration coverage |

See [./TODO.md](./TODO.md), contributors are welcome!

[![test](https://github.com/pavelsavara/jsco/actions/workflows/jest.yml/badge.svg)](https://github.com/pavelsavara/jsco/actions/workflows/jest.yml)

### Demo scope
- hello world demo [hello.wit](./hello/wit/hello.wit) [hello.wat](./hello/wat/hello.wat) [lib.rs](./hello/src/lib.rs)
- this is just small attempt in limited time. It may grow into something larger ...
- binding for `string` and `i32`, `record` just one direction. Only necessary resolver.
- as a hackathon week project in 2023
- to learn more about WASM component model

## Why
- to provide host which could do the binding in the browser
- browsers currently don't implement built-in WASM component model host
- because independent implementation will help the WASM/WIT/WASI to make progress
- [JCO](https://github.com/bytecodealliance/jco) is great alternative, really. 
    - But it is too large to use as dynamic host, because download size matters to browser folks.
    - When you have all your components available at dev machine, JCO transpiler could be better choice.

## Usage
```js
import { instantiateComponent } from '@pavelsavara/jsco';
const instance = await instantiateComponent('./hello/wasm/hello.wasm', {
    'hello:city/city': { sendMessage: console.log }
});
const run = instance.exports['hello:city/greeter'].run;
run({ name: 'Kladno', headCount: 100000, budget: 0n});
```
Prints `Welcome to Kladno!` to the console.

See [./usage.mjs](./usage.mjs) for full commented sample.

## Contribute
- install [rust](https://www.rust-lang.org/tools/install)
- install [nodejs + npm](https://nodejs.org/en/download)
- use eslint plugin to VS code, with format on save
- see "scripts" in package.json

```bash
npm install
npm run setup:rust
npm run build
npm run build:hello && npm run build:hello-wat && npm run build:hello-js
npm run test:jco
npm run test:unix
```
