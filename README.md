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

`createWasiP3Host()` accepts an optional `HostConfig`:

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

Each WASI interface is implemented for one or more preview generations
(P1 = `wasi_snapshot_preview1`, P2 = `wasi:*@0.2.x`, P3 = `wasi:*@0.3.x`),
and may behave differently in the browser vs. Node.js.

| Interface | Browser | Node.js | P3 | P2 | P1 |
|-----------|---------|---------|----|----|----|
| `cli/*` (environment, exit, stdio) | ✅ | ✅ | ✅ | ✅ | ✅ via adapter |
| `clocks/*` (monotonic, system, timezone) | ✅ | ✅ | ✅ | ✅ | ✅ via adapter |
| `random/*` (secure, insecure, seed) | ✅ | ✅ | ✅ | ✅ | ✅ via adapter |
| `filesystem/*` (VFS, preopens) | ✅ in-memory | ✅ + real mounts | ✅ | ✅ | ✅ via adapter |
| `http/client` (Fetch API) | ✅ | ✅ | ✅ | ✅ | — |
| `http/handler` (server) | ❌ not-supported | ✅ via `serve()` | ✅ | ✅ | — |
| `sockets/*` (TCP, UDP, DNS) | ❌ not-supported | ✅ | ✅ | ✅ | — |

P1 modules are served by the `wasip1-via-wasip3` adapter (`wasi_snapshot_preview1`
shim layered on top of the P3 host); same configuration, same VFS/mount/network
options apply.

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

### Resource Limits

DOS-mitigation budgets enforced by the runtime. Each can be tuned via CLI flag or programmatically via `instantiate(..., { limits: { ... } })`.

| Option | Default | Description |
|--------|---------|-------------|
| `--max-allocation-size <N>` | `16777216` | Max single allocation (bytes). |
| `--max-handles <N>` | `10000` | Max live resource handles per table. |
| `--max-path-length <N>` | `4096` | Max filesystem path length (bytes). |
| `--max-memory-bytes <N>` | `268435456` | Max WASM linear-memory size (bytes); `0` disables. |
| `--max-canon-ops-without-yield <N>` | `1000000` | Max canon built-in calls between JSPI yields; `0` disables. Mitigates `stream.read → stream.cancel-read` spin DOS. |
| `--max-blocking-time-ms <N>` | `0` (off) | Max ms any single JSPI suspension may block. `0` disables. Recommended for CI: `10000`. Off by default so legitimately slow host I/O isn't killed. |
| `--max-heap-growth-per-yield <N>` | `0` (off) | Max host heap growth (bytes) between JSPI yields; `0` disables. Catches host-side state DOS that stays inside `--max-canon-ops-without-yield`. |

### Networking Options

HTTP/socket budgets enforced by the host. Run `jsco run --help` for the full list.

| Option | Default | Description |
|--------|---------|-------------|
| `--max-http-body-bytes <N>` | host default | Max HTTP body size in bytes. |
| `--max-http-headers-bytes <N>` | host default | Max HTTP headers size in bytes. |
| `--socket-buffer-bytes <N>` | host default | Per-connection socket buffer in bytes. |
| `--max-tcp-pending <N>` | host default | Max pending TCP connections. |
| `--tcp-idle-timeout-ms <N>` | host default | TCP idle timeout (ms). |
| `--http-request-timeout-ms <N>` | host default | HTTP request timeout (ms). |
| `--max-udp-datagrams <N>` | host default | Max queued UDP datagrams. |
| `--dns-timeout-ms <N>` | host default | DNS lookup timeout (ms). |
| `--max-concurrent-dns <N>` | host default | Max concurrent DNS lookups. |
| `--max-http-connections <N>` | host default | Max concurrent HTTP server connections. |
| `--max-request-url-bytes <N>` | host default | Max request URL length (bytes). |
| `--http-headers-timeout-ms <N>` | host default | Slowloris protection: headers timeout (ms). |
| `--http-keep-alive-timeout-ms <N>` | host default | HTTP keep-alive timeout (ms). |

# Contribute

## Goals
- browser polyfill for running WASM/WASI components.
- streaming parser of binary WIT
- streaming compilation of WASM core modules during .wasm file download
- in-the-browser creation of instances and necessary JavaScript interop
- keep download size small enough to be practical for browser use

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

## License

This project is licensed under the Apache License, Version 2.0, with the LLVM exception. See [LICENSE](LICENSE) for details, and [THIRD-PARTY-NOTICES.TXT](THIRD-PARTY-NOTICES.TXT) for attribution of code adapted from upstream projects.

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in this project by you, as defined in the Apache-2.0 license, shall be licensed as above, without any additional terms or conditions.
