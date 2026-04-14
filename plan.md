# Plan: Close api.ts ↔ WIT Spec Gaps

## Summary

Close all gaps between `api.ts` and the WASI P2 v0.2.11 WIT spec. Remove internal implementation details from public interfaces. Add missing entries to `WasiP2Interfaces`. Add integration test with replaced stdout.

---

## Step 1: Remove internals from api.ts interfaces

Remove implementation-detail members from public-facing interfaces. Internal code casts to extended types.

### Changes

- **api.ts**: Remove `_node()` from `WasiDescriptor`, `_resolve` from `WasiResponseOutparam`, `_tag` from `WasiNetwork`
- **api.ts**: Add `WasiResponseOutparam` as an opaque resource interface (empty or with just `[Symbol.dispose]?`)
- **types.ts**: Add internal extended interfaces: `WasiDescriptorInternal extends WasiDescriptor { _node(): unknown }`, `WasiResponseOutparamInternal extends WasiResponseOutparam { _resolve(...): void }`, `WasiNetworkInternal extends WasiNetwork { _tag: string }`
- **filesystem.ts, filesystem-node.ts**: Cast to `WasiDescriptorInternal` where `_node()` is accessed
- **http-server.ts**: Cast to `WasiResponseOutparamInternal` where `_resolve` is called
- **sockets.ts**: Cast to `WasiNetworkInternal` where `_tag` is checked

---

## Step 2: Add missing enum/variant types to api.ts

### 2a: `ShutdownType` enum

- **api.ts**: Add `type ShutdownType = 'receive' | 'send' | 'both'`
- **api.ts**: Change `WasiTcpSocket.shutdown(shutdownType: string)` → `shutdown(shutdownType: ShutdownType)`
- **api.ts**: Update `WasiP2Interfaces['wasi:sockets/tcp']` signature
- **sockets.ts**: Already validates the string; no runtime change needed

### 2b: `Advice` enum

- **api.ts**: Add `type Advice = 'normal' | 'sequential' | 'random' | 'will-need' | 'dont-need' | 'no-reuse'`
- **api.ts**: Change `WasiDescriptor.advise(offset, length, advice: string)` → `advice: Advice`
- **api.ts**: Update `WasiP2Interfaces['wasi:filesystem/types']` signature
- **filesystem.ts**: No runtime change (still a no-op)

### 2c: `NewTimestamp` variant

- **api.ts**: Add `type NewTimestamp = { tag: 'no-change' } | { tag: 'now' } | { tag: 'timestamp'; val: WasiDatetime }`
- **api.ts**: Change `setTimes` and `setTimesAt` to use `NewTimestamp` instead of `WasiDatetime | undefined`
- **api.ts**: Update `WasiP2Interfaces` signatures
- **filesystem.ts, filesystem-node.ts**: Update implementation to handle the variant (match on `tag`)

### 2d: `DescriptorFlags.requestedWriteSync`

- **api.ts**: Add `requestedWriteSync?: boolean` to `DescriptorFlags`
- No runtime change (VFS ignores sync flags)

### 2e: Complete `HttpErrorCode` variants

- **api.ts**: Add the ~14 missing variants: `destination-IP-prohibited`, `destination-IP-unroutable`, `connection-read-timeout`, `connection-write-timeout`, `connection-limit-reached`, `TLS-certificate-error`, `HTTP-request-length-required`, `HTTP-request-URI-too-long`, `HTTP-request-trailer-section-size`, `HTTP-request-trailer-size`, `HTTP-response-trailer-section-size`, `HTTP-response-trailer-size`, `HTTP-upgrade-failed`, `HTTP-protocol-error`, `loop-detected`, `configuration-error`
- Remove `size-exceeded` (not in WIT)

### 2f: Complete `ErrorCode` (filesystem)

- **api.ts**: Remove `'other'` (not in WIT). Add `'would-block'`

---

## Step 3: Add `splice` / `blocking-splice` to streams

### Changes

- **api.ts**: Add `splice(src: WasiInputStream, len: bigint): StreamResult<bigint>` and `blockingSplice(src: WasiInputStream, len: bigint): StreamResult<bigint>` to `WasiOutputStream`
- **api.ts**: Add corresponding entries in `WasiP2Interfaces['wasi:io/streams']`
- **streams.ts**: Implement `splice` — read from input stream, write to output buffer. `blockingSplice` — same but call input's `blockingRead`
- **index.ts**: Wire `[method]output-stream.splice` and `[method]output-stream.blocking-splice` in the register call

---

## Step 4: Add missing HTTP lifecycle to api.ts + implementations

### 4a: `outgoing-body.finish(trailers?)` static

- **api.ts**: Add `finish` to `WasiOutgoingBody` interface: `finish?(trailers?: WasiFields): HttpResult<void>`
- **api.ts**: Add `'[static]outgoing-body.finish'` to `WasiP2Interfaces['wasi:http/types']`
- **http.ts**: Add `finishOutgoingBody` — flush the output stream, mark body complete. Accept optional trailers (ignored for now).
- **http-server.ts**: Same for server-side body
- **index.ts**: Wire `[static]outgoing-body.finish`

### 4b: `incoming-body.finish(this) → future-trailers` static

- **api.ts**: Add `'[static]incoming-body.finish'` to `WasiP2Interfaces['wasi:http/types']`
- **index.ts**: Wire — calls `createFutureTrailers()` (already exists in http-server.ts)

### 4c: `outgoing-response` constructor + resource-drop

- **api.ts**: Add `'[constructor]outgoing-response'` and `'[resource-drop]outgoing-response'` to `WasiP2Interfaces['wasi:http/types']`
- **index.ts**: Wire — delegates to `createOutgoingResponse` from http-server.ts

### 4d: `response-outparam.set` static

- **api.ts**: Replace `_resolve` with a clean resource interface. Add `'[static]response-outparam.set'` to `WasiP2Interfaces['wasi:http/types']`
- **index.ts**: Wire — delegates to `responseOutparamSet` from http-server.ts

### 4e: `future-trailers` resource lifecycle

- **api.ts**: Add `'[resource-drop]future-trailers'`, `'[method]future-trailers.subscribe'`, `'[method]future-trailers.get'` to `WasiP2Interfaces['wasi:http/types']`
- **index.ts**: Wire

### 4f: Missing `[resource-drop]` entries

- **api.ts**: Add `[resource-drop]incoming-request`, `[resource-drop]outgoing-response`, `[resource-drop]response-outparam` to `WasiP2Interfaces['wasi:http/types']`
- **index.ts**: Wire (no-op, GC handles cleanup)

---

## Step 5: Add `network-error-code` and `exit-with-code`

### 5a: `network-error-code`

- **api.ts**: Add `'network-error-code'` to `WasiP2Interfaces['wasi:sockets/network']`
- **sockets.ts**: Export a `networkErrorCode(err: WasiError) → SocketErrorCode | undefined` function
- **index.ts**: Wire in `sockets/network` register

### 5b: `exit-with-code`

- **api.ts**: Add `exitWithCode(statusCode: number): never` to `WasiCliExit`
- **api.ts**: Add `'exit-with-code'` to `WasiP2Interfaces['wasi:cli/exit']`
- **cli.ts**: Implement — throws `WasiExit(statusCode)` directly
- **index.ts**: Wire

---

## Step 6: Fix result-wrapping in WasiP2Interfaces

### Changes

- **api.ts**: `'create-tcp-socket'` → return `SocketResult<WasiTcpSocket>` (already returns this at runtime, just fix the type)
- **api.ts**: `'create-udp-socket'` → return `SocketResult<WasiUdpSocket>`
- **api.ts**: `'resolve-addresses'` → return `SocketResult<WasiResolveAddressStream>`
- **api.ts**: `'[static]fields.from-list'` → return `{ tag: 'ok'; val: WasiFields } | { tag: 'err'; val: HeaderError }`
- **api.ts**: `'[method]future-incoming-response.get'` → double-result `option<result<result<incoming-response, error-code>>>`

---

## Step 7: Add index.ts re-exports

- Export new types: `ShutdownType`, `Advice`, `NewTimestamp`
- Export new function: `networkErrorCode` from sockets
- Export `finishOutgoingBody` from http.ts

---

## Step 8: Integration test — custom stdout

Create a new test in `hello-world.test.ts` (or a new file `stdout-replacement.test.ts`):

```typescript
test('custom stdout replacement captures all output', async () => {
    const lines: string[] = [];
    const wasiExports = createWasiP2Host({
        stdout: (bytes) => {
            const text = new TextDecoder().decode(bytes);
            lines.push(...text.split('\n').filter(l => l.length > 0));
        },
    });

    const component = await createComponent(helloWasm);
    const instance = await component.instantiate(wasiExports);
    // run and assert lines captured
});
```

Key assertion: verify that `lines` contains expected output AND that console.log was NOT called (stdout fully replaced).

---

## Step 9: Verify

1. `npx eslint src/` — 0 errors, 0 warnings
2. `npm run build` — succeeds
3. `node --experimental-vm-modules --experimental-wasm-jspi node_modules/jest-cli/bin/jest.js --no-coverage` — all tests pass

---

## File Edit Summary

| File | Changes |
|------|---------|
| `api.ts` | Add types (ShutdownType, Advice, NewTimestamp), complete HttpErrorCode, fix ErrorCode, add requestedWriteSync, splice/blockingSplice to WasiOutputStream, clean up internals, complete WasiP2Interfaces |
| `types.ts` | Add WasiDescriptorInternal, WasiResponseOutparamInternal, WasiNetworkInternal |
| `streams.ts` | Implement splice, blockingSplice |
| `http.ts` | Add finishOutgoingBody |
| `http-server.ts` | Update outparam usage |
| `filesystem.ts` | Handle NewTimestamp variant |
| `filesystem-node.ts` | Handle NewTimestamp variant |
| `sockets.ts` | Export networkErrorCode |
| `cli.ts` | Add exitWithCode |
| `index.ts` | Wire all new entries, add exports |
| `hello-world.test.ts` or new test | Custom stdout test |
| Existing .test.ts files | Update any tests broken by type changes |
