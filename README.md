# jsco - Browser polyfill for running WASM components

### Demo

See [live demo](https://pavelsavara.github.io/jsco/) and [browser demo sources](https://github.com/pavelsavara/jsco/tree/demo-page)

# Usage

### Browser usage

For most WASI components, `instantiateWasiComponent` is the simplest way:

```js
import { instantiateWasiComponent } from '@pavelsavara/jsco';

// Works with both WASIp2 and WASIp3 components (auto-detected)
const instance = await instantiateWasiComponent('./my-component.wasm');
await instance.exports['wasi:cli/run@0.3.0'].run();
```

For advanced use cases (custom imports, non-WASI components), use `createComponent` directly:

```js
import { createComponent } from '@pavelsavara/jsco';

const component = await createComponent('./my-component.wasm');
const instance = await component.instantiate({
    'my:app/logger@1.0.0': { log: console.log },
});
await instance.exports['my:app/greeter@1.0.0'].run({ name: 'World' });
```

### Node.js usage

```js
import { instantiateWasiComponent } from '@pavelsavara/jsco';

// Run a CLI component with real filesystem access
const instance = await instantiateWasiComponent('./my-cli-component.wasm', {
    args: ['input.txt'],
    env: [['HOME', '/home/user']],
    mounts: [{ hostPath: './data', guestPath: '/data' }],
});
await instance.exports['wasi:cli/run@0.3.0'].run();
```

To serve an HTTP handler component:

```js
import { createComponent, loadWasiP3Host, loadWasiP3Serve } from '@pavelsavara/jsco';

const { createWasiP3Host } = await loadWasiP3Host();
const host = createWasiP3Host();
const component = await createComponent('./my-http-component.wasm');
const instance = await component.instantiate(host);
const handler = instance.exports['wasi:http/incoming-handler@0.2.0'];
const { serve } = await loadWasiP3Serve();
const handle = await serve(handler, { network: { httpRequestTimeoutMs: 30_000 } });
console.log(`Listening on port ${handle.port}`);
```

### Configuration

`createWasiP3Host()` accepts an optional `WasiP3Config`:

| Option | Type | Description |
|--------|------|-------------|
| `env` | `[string, string][]` | Environment variables |
| `args` | `string[]` | Command-line arguments |
| `cwd` | `string` | Initial working directory |
| `stdin` | `ReadableStream<Uint8Array>` | Stdin input stream |
| `stdout` | `WritableStream<Uint8Array>` | Stdout output stream |
| `stderr` | `WritableStream<Uint8Array>` | Stderr output stream |
| `fs` | `Map<string, Uint8Array \| string>` | In-memory VFS files |
| `mounts` | `MountConfig[]` | Host filesystem mounts (Node.js only) |
| `network` | `NetworkConfig` | Network limits and timeouts |
| `limits` | `AllocationLimits` | Allocation and size limits |
| `enabledInterfaces` | `string[]` | Whitelist of WASI interface prefixes |

### WASI interfaces provided

| Interface | Browser | Node.js |
|-----------|---------|---------|
| `wasi:cli/*` (environment, exit, stdio) | ✅ | ✅ |
| `wasi:clocks/*` (monotonic, system, timezone) | ✅ | ✅ |
| `wasi:random/*` (secure, insecure, seed) | ✅ | ✅ |
| `wasi:filesystem/*` (VFS, preopens) | ✅ in-memory | ✅ + real mounts |
| `wasi:http/client` (Fetch API) | ✅ | ✅ |
| `wasi:http/handler` (server) | ❌ not-supported | ✅ via `serve()` |
| `wasi:sockets/*` (TCP, UDP, DNS) | ❌ not-supported | ✅ |

# CLI

jsco follows a command-based CLI similar to [wasmtime](https://wasmtime.dev/).
If no subcommand is provided, `run` is used by default.

```sh
# Run a component (default command)
jsco run ./integration-tests/hello-p2-world-wat/hello.wasm
# or without the subcommand
jsco ./integration-tests/hello-p2-world-wat/hello.wasm

# Serve an HTTP proxy component
jsco serve --addr 0.0.0.0:8080 ./my-http-component.wasm

# Show help
jsco --help
jsco run --help
jsco serve --help
```

When installed locally or via npx:
```sh
npx @pavelsavara/jsco run ./integration-tests/hello-p2-world-wat/hello.wasm
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

# Contribute

## Goals
- browser polyfill for running WASM components.
- streaming parser of binary WIT
- streaming compilation of WASM core modules during .wasm file download
- in-the-browser creation of instances and necessary JavaScript interop
- WASIp2 and WASIp3 host
- small download size (~150KB), fast enough

## Why
- to provide host which could do the binding in the browser
- browsers currently don't implement built-in WASM component model host
- because independent implementation will help the WASM/WIT/WASI to make progress
- [JCO](https://github.com/bytecodealliance/jco) is great alternative, really. 
    - But it is too large to use as dynamic host, because download size matters to browser folks.
    - When you have all your components available at dev machine, JCO transpiler could be better choice.

# How
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

## JSPI

See [./jspi.md](./jspi.md) for more details about JSPI - synchronous calls to JS APIs which are blocking, like I/O.
