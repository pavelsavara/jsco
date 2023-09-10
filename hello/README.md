# Build with cargo_component_bindings

```shell
cargo component build --release --target wasm32-unknown-unknown
jco transpile --instantiation --no-wasi-shim -b 0 --out-dir target/js-jco target/wasm32-unknown-unknown/release/hello.wasm
```