# jsco - Browser polyfill for running WASM components

### Demo

See [live demo](https://pavelsavara.github.io/jsco/) and [browser demo sources](https://github.com/pavelsavara/jsco/tree/demo-page)

## Goals
- browser polyfill for running WASM components.
- streaming parser of binary WIT
- streaming compilation of WASM core modules during .wasm file download
- in-the-browser creation of instances and necessary JavaScript interop
- WASIp2 host
- small download size, fast enough (current release bundle is ~86 KB)

## How
- parser: read binary WIT to produce model of the component, it's sub components, modules and types
- compile modules via Browser API [`WebAssembly.compileStreaming`](https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/compileStreaming)
- resolver: [resolve dependencies, create instances, bind it together](./src/resolver/README.md).
- JS binding: for component's imports and exports
- just JS at runtime (no rust dependency)
- TypeScript, RollupJS, rust as dev time dependencies

## Status
🚧 Work in progress 🚧

[![test](https://github.com/pavelsavara/jsco/actions/workflows/jest.yml/badge.svg)](https://github.com/pavelsavara/jsco/actions/workflows/jest.yml)

See [./TODO.md](./TODO.md), contributors are welcome!

## Why
- to provide host which could do the binding in the browser
- browsers currently don't implement built-in WASM component model host
- because independent implementation will help the WASM/WIT/WASI to make progress
- [JCO](https://github.com/bytecodealliance/jco) is great alternative, really. 
    - But it is too large to use as dynamic host, because download size matters to browser folks.
    - When you have all your components available at dev machine, JCO transpiler could be better choice.

## Usage
```js
import { instantiateWasiComponent } from '@pavelsavara/jsco';
const componentUrl = './integration-tests/hello-world-wat/hello.wasm';
const instance = await instantiateWasiComponent(componentUrl);
const run = instance.exports['wasi:cli/run@0.2.11'].run;

await run();
```
Prints `hello from jsco` to the console.
See also [demo-verbose.mjs](./demo-verbose.mjs) for more details.

# CLI
```sh
node ./dist/index.js ./integration-tests/hello-world-wat/hello.wasm
# or
npx @pavelsavara/jsco ./integration-tests/hello-world-wat/hello.wasm
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `validateTypes` | `false` | Validate export/import type annotations against the component's type index. Catches kind mismatches and structural function type differences. |
| `useNumberForInt64` | `false` | Convert 64-bit integers to 52-bit `number` instead of `bigint`. `false` (default) — all exports use `bigint`. `true` — all exports use `number`. `string[]` — only the listed export names use `number`; all others use `bigint`. |
| `noJspi` | `false` | Disable JSPI wrapping of exports. `false` (default) — all exports are wrapped with `WebAssembly.promising()` and return `Promise`s. `true` — no exports are wrapped (synchronous, blocking WASI will not work). `string[]` — only the listed export names are synchronous; all others remain async. |
| `wasmInstantiate` | `WebAssembly.instantiate` | Custom WASM instantiation function (used by JSPI wrapping) |

See [./jspi.md](./jspi.md) for more details about JSPI - synchronous calls to JS APIs which are blocking, like I/O.
