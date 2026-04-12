# jsco - Browser polyfill for running WASM components

### Demo

See [live demo](https://pavelsavara.github.io/jsco/) and [browser demo sources](https://github.com/pavelsavara/jsco/tree/demo-page)

## Goals
- browser polyfill for running WASM components.
- streaming parser of binary WIT
- streaming compilation of WASM module during .wasm file download
- in-the-browser creation of instances and necessary JavaScript interop
- small download size, fast enough (current release bundle is ~86 KB)

## How
- parser: read binary WIT to produce model of the component, it's sub components, modules and types
- compile modules via Browser API [`WebAssembly.compileStreaming`](https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/compileStreaming)
- resolver: [resolve dependencies, create instances, bind it together](./src/resolver/README.md).
- JS binding: for component's imports and exports
- just JS at runtime (no rust dependency)
- TypeScript, RollupJS, rust as dev time dependencies

## Status
🚧 Work in progress — core engine is solid, integration still maturing 🚧

| Layer | Progress | Notes |
|-------|----------|-------|
| Parser | 90% | Binary WIT streaming parser, all 11 sections covered |
| Resolver | 75% | Type resolution, instances, imports/exports, binding plan IR; missing: nested components, fused adapters |
| Lifting/Lowering | 95% | All CM types (primitives, records, tuples, lists, options, results, variants, enums, flags, own/borrow); flat + spilled calling conventions; canonical ABI compliance |
| WASI Host | 85% | All preview 2 interfaces: random, clocks, I/O, CLI, filesystem, HTTP, sockets (stubs); JSPI integration |
| Testing | ✅ | 1456 tests across 39 suites; CI-gated at 95% coverage |


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

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `validateTypes` | `false` | Validate export/import type annotations against the component's type index. Catches kind mismatches and structural function type differences. |
| `useNumberForInt64` | `false` | Convert 64-bit integers to `number` instead of `bigint`. `false` (default) — all exports use `bigint`. `true` — all exports use `number`. `string[]` — only the listed export names use `number`; all others use `bigint`. |
| `noJspi` | `false` | Disable JSPI wrapping of exports. `false` (default) — all exports are wrapped with `WebAssembly.promising()` and return `Promise`s. `true` — no exports are wrapped (synchronous, blocking WASI will not work). `string[]` — only the listed export names are synchronous; all others remain async. |
| `wasmInstantiate` | `WebAssembly.instantiate` | Custom WASM instantiation function (used by JSPI wrapping) |

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

**Exports are async by default:** When JSPI is available (the default), all component exports are wrapped with `WebAssembly.promising()` and return `Promise`s. Callers must `await` every export call:
```js
const result = await ns.myFunction(arg); // ← await required
```
You can selectively opt out specific exports with an array of export names:
```js
// Only 'my:pkg/fast-path' is synchronous; everything else returns Promises
const component = await createComponent(wasm, {
    noJspi: ['my:pkg/fast-path']
});
```
Pass `{ noJspi: true }` to `createComponent` or `instantiateWasiComponent` to make all exports synchronous — but blocking WASI operations will not work in that mode.

Non-blocking WASI APIs (random, wall-clock, environment, exit) and pure component model bindings (no WASI) work with `{ noJspi: true }`.

**WASIp3 outlook:** WASI preview 3 replaces the current blocking-call pattern with native async support via the Component Model [async proposal](https://github.com/WebAssembly/component-model/blob/main/design/mvp/Async.md) (`stream`, `future`, `error-context` built-ins). On the **host side**, this eliminates JSPI — async imports/exports become first-class, and the host can use native `Promise`/`async` directly. However, **guest components** compiled from languages with synchronous calling conventions (C, C#, Rust with blocking I/O) still need the async canonical ABI to suspend the WASM stack while awaiting the host's async result. In a browser JS host, that suspension mechanism **is JSPI** (`WebAssembly.Suspending` + `WebAssembly.promising`). JSPI is only fully eliminated when the guest uses async/callback patterns natively (e.g., async Rust reactor). jsco plans to support WASIp3 when the spec stabilizes.

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
