# join-http-p3

P8 verification fixture: a minimal WASIp3 component that issues two
`wasi:http/client.send` calls concurrently via `futures::join!` from a
single guest task. Used by [tests/host/wasip3/node/jspi-parallel-http.test.ts](../../tests/host/wasip3/node/jspi-parallel-http.test.ts)
to confirm that the JSPI suspension at `waitable-set.wait` does NOT
deadlock when the join arms are independent (no shared pipe).

Build:

```
cd integration-tests
cargo build --release --target wasm32-wasip1 -p join-http-p3
wasm-tools component new \
  target/wasm32-wasip1/release/join_http_p3.wasm \
  --adapt wasi_snapshot_preview1.reactor.wasm \
  -o join-http-p3/join_http_p3.wasm
```

Or run `npm run build:integration-p3` from the repo root.
