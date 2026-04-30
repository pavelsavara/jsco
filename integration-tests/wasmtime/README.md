# Wasmtime WASI Conformance Test Binaries

Pre-built WebAssembly component binaries from the
[Wasmtime](https://github.com/bytecodealliance/wasmtime) project, used to
validate jsco's WASI implementation against the same test programs Wasmtime
uses.

- **Source:** <https://github.com/bytecodealliance/wasmtime/tree/main/crates/test-programs/src/bin>
- **Built from commit:** `51959f238e5c65f535047a8bf4615b8b28a14429`
- **License:** Apache-2.0 WITH LLVM-exception

## Contents

- `p2_*.component.wasm` — WASIp2 (sync) test components.
- `p3_*.component.wasm` — WASIp3 (async) test components.
- `fixtures/` — Pre-created files expected by filesystem tests.

Each component embeds its own assertions: exit code 0 = pass, non-zero = fail.

## Rebuilding

From a wasmtime checkout:

```bash
cargo build -p test-programs-artifacts --release
```

Components appear under `target/release/build/test-programs-artifacts-*/out/`.
