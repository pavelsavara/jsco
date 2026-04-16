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

jsco follows a command-based CLI similar to [wasmtime](https://wasmtime.dev/).
If no subcommand is provided, `run` is used by default.

```sh
# Run a component (default command)
jsco run ./integration-tests/hello-world-wat/hello.wasm
# or without the subcommand
jsco ./integration-tests/hello-world-wat/hello.wasm

# Serve an HTTP proxy component
jsco serve --addr 0.0.0.0:8080 ./my-http-component.wasm

# Show help
jsco --help
jsco run --help
jsco serve --help
```

When installed locally or via npx:
```sh
npx @pavelsavara/jsco run ./integration-tests/hello-world-wat/hello.wasm
```

### Common Options

| Option | Default | Description |
|--------|---------|-------------|
| `--dir <HOST[::GUEST[::ro]]>` | — | Mount a host directory into the guest. `--dir .` maps cwd, `--dir /data::/mnt` remaps. |
| `--env <NAME[=VAL]>` | — | Set (`--env FOO=bar`) or inherit (`--env FOO`) an environment variable. |
| `--env-inherit` | — | Inherit all host environment variables. |
| `--cwd <PATH>` | — | Set the working directory for the component. |
| `--enable <PREFIX>` | all | Enable only WASI interfaces matching prefix (e.g. `--enable wasi:http`). |
| `--use-number-for-int64` | `false` | Use `number` instead of `bigint` for i64. |
| `--no-jspi` | `false` | Disable JSPI wrapping of exports. |
| `--validate-types` | `true` | Validate export/import type annotations. |

### `serve` Options

| Option | Default | Description |
|--------|---------|-------------|
| `--addr <HOST:PORT>` | `0.0.0.0:8080` | Socket address for the HTTP server to bind to. |

### Networking Options

All networking limits are configurable via CLI flags. Run `jsco run --help` for the full list.

See [./jspi.md](./jspi.md) for more details about JSPI - synchronous calls to JS APIs which are blocking, like I/O.
