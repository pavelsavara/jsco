# JSPI Requirement

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
