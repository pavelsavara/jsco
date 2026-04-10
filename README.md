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
| Parser | 90% | Binary WIT streaming parser, all 11 sections covered |
| Resolver | 75% | Type resolution, instances, imports/exports, binding plan IR; missing: nested components, fused adapters |
| Lifting/Lowering | 95% | All CM types (primitives, records, tuples, lists, options, results, variants, enums, flags, own/borrow); flat + spilled calling conventions; canonical ABI compliance |
| WASI Host | 85% | All preview 2 interfaces: random, clocks, I/O, CLI, filesystem, HTTP, sockets (stubs); JSPI integration |
| Testing | 80% | 759 tests across 24 suites (81% statement coverage); Playwright browser test |

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
    'hello:city/city@0.1.0': { sendMessage: console.log }
});
const run = instance.exports['hello:city/greeter@0.1.0'].run;
run({ name: 'Kladno', headCount: 100000, budget: 0n});
```
Prints `Welcome to Kladno!` to the console.

See [./usage.mjs](./usage.mjs) for full commented sample.

## JSPI Requirement

WASI preview 2 APIs that perform blocking operations require [JSPI (JavaScript Promise Integration)](https://github.com/nicolo-ribaudo/tc39-proposal-wasm-esm-integration/blob/main/proposals/source-phase-imports/JSPI.md) — an experimental WebAssembly feature that enables WASM to call async host functions synchronously by suspending and resuming the WASM stack.

**Which APIs need JSPI:**
- `wasi:io/streams` — `blocking-read`, `blocking-write-and-flush`, `blocking-flush`
- `wasi:clocks/monotonic-clock` — `subscribe-duration`, `subscribe-instant`
- `wasi:io/poll` — `poll` (waiting for pollable readiness)
- `wasi:http/outgoing-handler` — `handle` (awaiting fetch response)

**How to enable:**
- **Node.js:** `--experimental-wasm-jspi`
- **Chrome:** Enable via `chrome://flags/#enable-experimental-webassembly-jspi`

Non-blocking WASI APIs (random, wall-clock, environment, exit) and pure component model bindings (no WASI) work without JSPI. Pass `{ noJspi: true }` to `instantiateWasiComponent` to disable JSPI wrapping.

**WASIp3 outlook:** WASI preview 3 will replace the current blocking-call pattern with native async support via the Component Model async proposal and WASM stack switching. When WASIp3 ships, JSPI will no longer be needed — async imports/exports will be first-class. jsco plans to support WASIp3 when the spec stabilizes.

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
