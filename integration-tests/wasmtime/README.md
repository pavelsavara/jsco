# Wasmtime WASI Conformance Test Binaries

Pre-built WebAssembly component binaries from the
[Wasmtime](https://github.com/bytecodealliance/wasmtime) project, used to
validate jsco's WASI implementation against the same test suite that Wasmtime
uses.

## Source

- **Repository:** <https://github.com/bytecodealliance/wasmtime>
- **Test programs source:** <https://github.com/bytecodealliance/wasmtime/tree/main/crates/test-programs/src/bin>
- **Built from commit:** `51959f238e5c65f535047a8bf4615b8b28a14429`
- **License:** Apache-2.0 WITH LLVM-exception

## Contents

- `*.component.wasm` — Standard WASI component binaries with built-in assertions.
  Exit code 0 = pass, non-zero = fail.
- `fixtures/` — Pre-created files expected by filesystem tests
  (`bar.txt`, `foo.txt`, `baz.txt`, `sub/wow.txt`, `sub/yay.txt`).

## Test categories

| Prefix | WASI Version | What it tests |
|--------|-------------|---------------|
| `p2_cli_*` | Preview 2 | CLI: args, env, exit, stdin/stdout, clocks, filesystem |
| `p2_tcp_*` | Preview 2 | TCP sockets (self-contained, localhost) |
| `p2_udp_*` | Preview 2 | UDP sockets (self-contained, localhost) |
| `p2_http_*` | Preview 2 | HTTP outbound requests (needs mock server) |
| `p2_api_*` | Preview 2 | Reactor, read-only fs, time |
| `p2_random` | Preview 2 | Random number generation |
| `p2_sleep` | Preview 2 | Monotonic clock sleep |
| `p2_ip_name_lookup` | Preview 2 | DNS resolution |
| `p2_stream_*` | Preview 2 | Stream/pollable correctness |
| `p3_cli_*` | Preview 3 | CLI with async component model |
| `p3_filesystem_*` | Preview 3 | Filesystem (async) |
| `p3_sockets_*` | Preview 3 | TCP/UDP sockets (async) |
| `p3_http_*` | Preview 3 | HTTP outbound/echo/proxy (async) |
| `p3_clocks_*` | Preview 3 | Clocks and sleep (async) |
| `p3_random_*` | Preview 3 | Random (async) |

## Rebuilding

From a wasmtime checkout:

```bash
cargo build -p test-programs-artifacts --release
# Components appear in target/release/build/test-programs-artifacts-*/out/wasm32-wasip1/debug/
```
