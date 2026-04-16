# WASI P2-to-P3 Adapter Design

## Goal

Implement a **forwarding shim** in jsco that exposes the full **WASI P2 host API** to existing `wasm32-wasip2` guest components, while internally delegating to a **WASI P3 host implementation**. The P3 host is the "real" implementation; the P2 adapter wraps it for backward compatibility.

- **Primary target**: jsco's own host layer
- **Secondary target**: jco compatibility (jco doesn't have P3 yet; TS API not defined)
- **Guest scope**: Any WASM component compiled for the `wasi:cli/command@0.2.x` or `wasi:http/proxy@0.2.x` worlds
- **Implementation language**: JavaScript/TypeScript
- **Async strategy**: JS Promises for all internal async; JSPI (`WebAssembly.Suspending` / `WebAssembly.promising`) at the WASM boundary

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│  WASM Guest (compiled for wasip2)               │
│  imports: wasi:io/*, wasi:cli/*, wasi:fs/*, ... │
└──────────────────────┬──────────────────────────┘
                       │ P2 canonical ABI (sync calls + resources)
                       │ JSPI suspends WASM stack when blocking
                       ▼
┌─────────────────────────────────────────────────┐
│  P2 Adapter Layer (wasip2-adapter/*.ts)         │
│  - Implements all P2 interfaces                 │
│  - Manages P2 resources (input-stream,          │
│    output-stream, pollable, descriptor,         │
│    directory-entry-stream, tcp-socket, ...)      │
│  - Translates types (datetime↔instant, enum↔variant) │
│  - Bridges sync P2 calls to async P3 calls      │
└──────────────────────┬──────────────────────────┘
                       │ Internal JS calls (async, Promises)
                       ▼
┌─────────────────────────────────────────────────┐
│  P3 Host Implementation (wasip3/*.ts)           │
│  - Native stream<T>, future<T> JS objects       │
│  - async functions returning Promises           │
│  - The "real" implementations                   │
└─────────────────────────────────────────────────┘
```

## P3 `stream<T>` and `future<T>` JS Representation

Three options evaluated:

### Option A: Native CM Async ABI

The jsco resolver would natively understand `stream`, `future`, and `error-context` as component model built-in types, with canonical lifting/lowering.

- **Pros**: Correct by spec; enables P3 guests directly; no impedance mismatch
- **Cons**: Requires significant resolver/parser work (planned but not implemented); the CM async ABI spec is still evolving
- **Verdict**: This is the long-term target. The P2 adapter should be designed so it can work with this once available.

### Option B: Web Streams API (`ReadableStream` / `WritableStream`)

Map P3 `stream<u8>` to Web `ReadableStream<Uint8Array>` / `WritableStream<Uint8Array>`.

- **Pros**: Browser-native; backpressure built-in; composable with `fetch()` body streams; available in Node.js too
- **Cons**: Only works for `stream<u8>` (byte streams); `stream<directory-entry>` or `stream<tcp-socket>` need a different approach; overhead from WHATWG stream controller machinery
- **Verdict**: Good fit for byte streams (stdio, file I/O, HTTP bodies). Not universal for typed streams like `stream<directory-entry>`.

### Option C: Custom JS Objects (async iterators + push interface)

```typescript
interface JscoStream<T> {
    // Reading side (consumer)
    read(): Promise<{ value: T; done: false } | { value: undefined; done: true }>;
    // Writing side (producer)  
    write(value: T): Promise<void>;
    close(): void;
    error(reason?: any): void;
    // Signaling
    readonly closed: Promise<void>;
}

interface JscoFuture<T> {
    get(): Promise<T>;          // Await the value
    readonly ready: boolean;     // Non-blocking check
    readonly promise: Promise<T>; // Underlying promise
}
```

- **Pros**: Works for any `T`; maps naturally to `async`/`await`; lightweight; trivially wraps a Promise for `future<T>`
- **Cons**: Non-standard; can't pipe directly into `fetch()` without conversion
- **Verdict**: Most flexible. Can wrap Web Streams for byte-specific paths.

### Recommendation

**Hybrid approach**: Use **Option C** as the internal P3 host API representation, with a **Web Streams bridge** for byte-stream-heavy paths (HTTP bodies, file I/O, stdio). When the CM async ABI lands in the resolver (Option A), the adapter layer stays the same — only the lifting/lowering changes.

```typescript
// P3 host API example
interface WasiP3Stdin {
    readViaStream(): { stream: JscoStream<Uint8Array>; completion: JscoFuture<Result<void, ErrorCode>> };
}

// P3 host API — filesystem descriptor
interface WasiP3Descriptor {
    readViaStream(offset: bigint): { stream: JscoStream<Uint8Array>; completion: JscoFuture<Result<void, ErrorCode>> };
    writeViaStream(data: JscoStream<Uint8Array>, offset: bigint): JscoFuture<Result<void, ErrorCode>>;
    stat(): Promise<Result<DescriptorStat, ErrorCode>>;  // async func
    // ...
}
```

## Interface-by-Interface Adapter Design

### 1. `wasi:io` — The Core Bridge (Hardest Part)

P2 has three interfaces (`error`, `poll`, `streams`) that are **completely absent** in P3. The adapter must synthesize all three.

#### 1.1 `wasi:io/error`

| P2 | P3 |
|---|---|
| `resource error { to-debug-string() -> string }` | `error-context` CM built-in (not yet in jsco) |

**Adapter**: Keep the existing `createWasiError(message)` implementation. P3 `error-context` values from stream close signals map to P2 `error` resources. Trivial.

#### 1.2 `wasi:io/poll` — Pollable + poll()

| P2 | P3 |
|---|---|
| `resource pollable { ready() -> bool; block() }` | No equivalent — async is built into CM |
| `poll(list<borrow<pollable>>) -> list<u32>` | `Promise.race()` / `Promise.any()` over futures |

**Adapter strategy using JS Promises:**

Every P2 pollable wraps a JS Promise internally (this is already how jsco works today via `createAsyncPollable`). The P2 `poll()` function:

1. **Non-blocking check**: Iterate all pollables, collect indices where `ready() === true`
2. **If any ready**: Return immediately (no JSPI needed)
3. **If none ready**: Race the underlying promises via `Promise.race()`, then re-check all
4. **JSPI boundary**: The `block()` call throws `JspiBlockSignal(promise)` which the resolver catches and returns as a Promise. `WebAssembly.Suspending` suspends the WASM stack; `WebAssembly.promising` on the export resumes it when resolved.

This is **exactly what jsco already does**. No fundamental change needed — the adapter just needs to ensure all P3-sourced async operations produce pollables with the right promises.

```typescript
// Adapter creates pollables from P3 futures
function pollableFromFuture<T>(future: JscoFuture<T>): WasiPollable {
    return createAsyncPollable(future.promise.then(() => {}));
}
```

#### 1.3 `wasi:io/streams` — InputStream + OutputStream

This is the **hardest adaptation**. P2 streams are resource objects with synchronous read/write methods. P3 has built-in `stream<T>` which is async and producer/consumer paired.

**InputStream adapter** (wrapping a P3 `stream<u8>` readable end):

```typescript
function createP2InputStreamFromP3(
    p3stream: JscoStream<Uint8Array>,
    p3completion: JscoFuture<Result<void, ErrorCode>>
): WasiInputStream {
    // Internal buffer: data read from P3 stream but not yet consumed by P2 guest
    let buffer: Uint8Array = new Uint8Array(0);
    let streamDone = false;
    let pendingRead: Promise<void> | null = null;

    // Eagerly pull from P3 stream to fill buffer
    async function pullIfNeeded() {
        if (streamDone || pendingRead) return;
        pendingRead = (async () => {
            const chunk = await p3stream.read();
            if (chunk.done) {
                streamDone = true;
            } else {
                buffer = concat(buffer, chunk.value);
            }
            pendingRead = null;
        })();
    }

    return {
        read(len: bigint): StreamResult<Uint8Array> {
            if (streamDone && buffer.length === 0) return streamClosed();
            if (buffer.length === 0) return streamOk(new Uint8Array(0)); // non-blocking: no data yet
            const count = Math.min(Number(len), buffer.length);
            const result = buffer.slice(0, count);
            buffer = buffer.slice(count);
            pullIfNeeded(); // trigger next pull
            return streamOk(result);
        },

        blockingRead(len: bigint): StreamResult<Uint8Array> {
            // If buffer has data, return immediately
            if (buffer.length > 0) return this.read(len);
            if (streamDone) return streamClosed();
            // Need to block — pull from P3 and suspend via JSPI
            // This returns a Promise that JSPI will handle
            throw new JspiBlockSignal(
                pullIfNeeded()!.then(() => {})
            );
            // After JSPI resume, the caller (resolver) will re-invoke
        },

        subscribe(): WasiPollable {
            if (buffer.length > 0 || streamDone) return createSyncPollable(() => true);
            pullIfNeeded();
            return createAsyncPollable(pendingRead ?? Promise.resolve());
        },
        // ... skip(), blockingSkip() similar
    };
}
```

**Key insight**: The P2 `blockingRead` → JSPI pattern already exists in jsco. The adapter just changes the data source from an in-memory buffer to a P3 stream's async read.

**OutputStream adapter** (wrapping a P3 `stream<u8>` writable end):

```typescript
function createP2OutputStreamFromP3(
    p3stream: JscoStream<Uint8Array>
): WasiOutputStream {
    let closed = false;
    const CAPACITY = 1024 * 1024;
    let buffered = 0;

    return {
        checkWrite(): StreamResult<bigint> {
            if (closed) return streamClosed();
            return streamOk(BigInt(CAPACITY - buffered));
        },

        write(contents: Uint8Array): StreamResult<void> {
            if (closed) return streamClosed();
            buffered += contents.length;
            // Fire-and-forget write to P3 stream
            p3stream.write(contents).catch(() => { closed = true; });
            return streamOk(undefined);
        },

        blockingWriteAndFlush(contents: Uint8Array): StreamResult<void> {
            if (closed) return streamClosed();
            // Block via JSPI until P3 write completes
            throw new JspiBlockSignal(p3stream.write(contents));
        },

        flush(): StreamResult<void> {
            return streamOk(undefined); // P3 streams have no separate flush
        },

        subscribe(): WasiPollable {
            return createSyncPollable(() => !closed && buffered < CAPACITY);
        },
        // ... splice, writeZeroes, etc.
    };
}
```

### 2. `wasi:cli` — Mostly Trivial

| Interface | P2 → P3 Change | Adapter Difficulty |
|---|---|---|
| `environment` | `initial-cwd` → `get-initial-cwd` | **Trivial** — rename |
| `exit` | Identical | **None** |
| `run` | `func() -> result` → `async func() -> result` | **Easy** — Promise |
| `terminal-*` | Identical | **None** |
| `stdin` | `get-stdin() -> input-stream` → `read-via-stream() -> (stream<u8>, future<result>)` | **Medium** |
| `stdout` | `get-stdout() -> output-stream` → `write-via-stream(stream<u8>) -> future<result>` | **Medium** |
| `stderr` | Same as stdout | **Medium** |
| `types` | New in P3: `error-code { io, illegal-byte-sequence, pipe }` | **Easy** — map |

#### Stdin adapter

P2 `get-stdin()` returns a long-lived `input-stream` resource. P3 `read-via-stream()` returns a `(stream<u8>, future<result>)` per call.

```typescript
function createP2StdinAdapter(p3stdin: WasiP3Stdin): WasiP2Stdin {
    // Lazily create the P3 stream on first call
    let cachedStream: WasiInputStream | null = null;

    return {
        getStdin(): WasiInputStream {
            if (!cachedStream) {
                const { stream, completion } = p3stdin.readViaStream();
                cachedStream = createP2InputStreamFromP3(stream, completion);
            }
            return cachedStream;
        }
    };
}
```

#### Stdout/stderr adapter

P2 `get-stdout()` returns a long-lived `output-stream`. P3 `write-via-stream(data)` expects to receive a stream.

The adapter creates a `stream<u8>` internally, hands the readable end to P3 `write-via-stream()`, and wraps the writable end as a P2 `output-stream`:

```typescript
function createP2StdoutAdapter(p3stdout: WasiP3Stdout): WasiP2Stdout {
    let cachedStream: WasiOutputStream | null = null;

    return {
        getStdout(): WasiOutputStream {
            if (!cachedStream) {
                const { readable, writable } = createJscoStreamPair<Uint8Array>();
                // Hand readable end to P3 — fire and forget
                p3stdout.writeViaStream(readable); // returns future, we ignore completion for now
                cachedStream = createP2OutputStreamFromP3(writable);
            }
            return cachedStream;
        }
    };
}
```

### 3. `wasi:clocks` — Easy with Renames

| P2 | P3 | Change |
|---|---|---|
| `monotonic-clock.instant` type | `monotonic-clock.mark` type | Rename only |
| `monotonic-clock.duration` type | `types.duration` type | Moved to shared `types` interface |
| `monotonic-clock.resolution()` | `monotonic-clock.get-resolution()` | Rename |
| `subscribe-instant(when) -> pollable` | `wait-until(when)` async func | Pollable from Promise |
| `subscribe-duration(dur) -> pollable` | `wait-for(dur)` async func | Pollable from Promise |
| `wall-clock.datetime{seconds: u64, ns: u32}` | `system-clock.instant{seconds: s64, ns: u32}` | Signed seconds + rename |
| `wall-clock.resolution() -> datetime` | `system-clock.get-resolution() -> duration` | Type change |
| `timezone.display(when) -> timezone-display` | `timezone.iana-id()`, `utc-offset(when)`, `to-debug-string()` | Restructured |

```typescript
function createP2MonotonicClockAdapter(p3clock: WasiP3MonotonicClock): WasiP2MonotonicClock {
    return {
        now: () => p3clock.now(),         // mark === instant, both u64
        resolution: () => p3clock.getResolution(),

        subscribeInstant(when: bigint): WasiPollable {
            // P3 wait-until is async — wrap its Promise as a pollable
            const promise = p3clock.waitUntil(when);
            return createAsyncPollable(promise);
        },

        subscribeDuration(nanos: bigint): WasiPollable {
            const promise = p3clock.waitFor(nanos);
            return createAsyncPollable(promise);
        },
    };
}

function createP2WallClockAdapter(p3systemClock: WasiP3SystemClock): WasiP2WallClock {
    return {
        now(): WasiDatetime {
            const instant = p3systemClock.now();
            return {
                seconds: BigInt(instant.seconds),  // s64 → u64 (safe for positive times)
                nanoseconds: instant.nanoseconds,
            };
        },
        resolution(): WasiDatetime {
            const dur = p3systemClock.getResolution(); // duration in nanoseconds
            return {
                seconds: dur / 1_000_000_000n,
                nanoseconds: Number(dur % 1_000_000_000n),
            };
        },
    };
}
```

**Signed-to-unsigned seconds**: P3 `system-clock.instant.seconds` is `s64` (can represent dates before 1970). P2 `wall-clock.datetime.seconds` is `u64`. For dates before epoch, the adapter must clamp to 0 or trap — pre-epoch times are not representable in P2.

**Timezone**: P2 returns a `timezone-display` record with `{ utc-offset: s32, name: string, in-daylight-saving-time: bool }`. P3 has separate functions. The adapter synthesizes the record:

```typescript
function createP2TimezoneAdapter(p3tz: WasiP3Timezone): WasiP2Timezone {
    return {
        display(when: WasiDatetime): TimezoneDisplay {
            const instant = datetimeToP3Instant(when);
            const offset = p3tz.utcOffset(instant);  // option<s64> nanoseconds
            const name = p3tz.ianaId() ?? p3tz.toDebugString();
            return {
                utcOffset: offset ? Number(offset / 1_000_000_000n) : 0,  // ns → seconds, s64→s32
                name: name ?? 'UTC',
                inDaylightSavingTime: false,  // P3 doesn't expose this — approximate via offset change
            };
        },
        utcOffset(when: WasiDatetime): number {
            const instant = datetimeToP3Instant(when);
            const offset = p3tz.utcOffset(instant);
            return offset ? Number(offset / 1_000_000_000n) : 0;
        },
    };
}
```

**Loss**: `in-daylight-saving-time` is not directly available in P3. The adapter returns `false` or attempts heuristic detection (compare offsets at different dates). This is a minor compatibility gap.

### 4. `wasi:filesystem` — Medium Difficulty

#### Type changes

| P2 | P3 | Impact |
|---|---|---|
| `descriptor-type` is `enum` (8 values) | `variant` with `other(option<string>)` | Map `unknown` → `other(none)`, strip `other(...)` → `unknown` |
| `error-code` is `enum` (36 values) | `variant` with `other(option<string>)` | Map `would-block` → not needed in P3; strip `other(...)` → closest P2 code |
| `new-timestamp.timestamp(datetime)` | `new-timestamp.timestamp(instant)` | s64→u64 conversion |
| `descriptor-stat` timestamps use `datetime` | uses `instant` | s64→u64 conversion |
| Uses `wasi:io/streams` | Uses CM built-in `stream<u8>` | Stream adapter (Section 1.3) |
| Uses `wasi:clocks/wall-clock.datetime` | Uses `wasi:clocks/system-clock.instant` | Type conversion |

#### Descriptor method changes

| P2 method | P3 method | Change |
|---|---|---|
| `read-via-stream(offset) -> result<input-stream, error-code>` | `read-via-stream(offset) -> (stream<u8>, future<result>)` | Return type; adapter wraps P3 stream as P2 input-stream |
| `write-via-stream(offset) -> result<output-stream, error-code>` | `write-via-stream(data: stream<u8>, offset) -> future<result>` | Signature inverted: P2 returns a stream, P3 accepts one |
| `append-via-stream() -> result<output-stream, error-code>` | `append-via-stream(data: stream<u8>) -> future<result>` | Same inversion |
| `read(length, offset) -> result<(list<u8>, bool), error-code>` | **Removed** | Must synthesize from `read-via-stream` |
| `write(buffer, offset) -> result<filesize, error-code>` | **Removed** | Must synthesize from `write-via-stream` |
| `read-directory() -> result<directory-entry-stream, error-code>` | `read-directory() -> (stream<directory-entry>, future<result>)` | Wrap as P2 directory-entry-stream resource |
| `advise`, `sync-data`, `get-flags`, etc. | Now `async func` | Wrap Promise, block via JSPI |
| `stat.timestamps` use `datetime` | uses `instant` | Type conversion |

#### Synthesizing removed `read()` / `write()` methods

P2 has convenience `descriptor.read(length, offset)` and `descriptor.write(buffer, offset)` methods that P3 removed (only stream-based I/O remains). The adapter synthesizes them:

```typescript
// P2 descriptor.read(length, offset) → result<(list<u8>, bool), error-code>
async function descriptorRead(p3desc: WasiP3Descriptor, length: bigint, offset: bigint) {
    const { stream, completion } = p3desc.readViaStream(offset);
    const chunks: Uint8Array[] = [];
    let totalRead = 0n;

    while (totalRead < length) {
        const chunk = await stream.read();
        if (chunk.done) break;
        chunks.push(chunk.value);
        totalRead += BigInt(chunk.value.length);
    }

    // Close the stream (we only wanted `length` bytes)
    stream.close?.();

    const result = concat(...chunks);
    const atEnd = totalRead < length; // got less than asked = EOF
    const completionResult = await completion.get();
    if (completionResult.tag === 'err') {
        return err(completionResult.val);
    }
    return ok({ val: result.slice(0, Number(length)), eof: atEnd });
}
```

#### `write-via-stream` inversion

P2: Guest calls `descriptor.write-via-stream(offset)` and gets back an `output-stream` to write into.
P3: Guest (or adapter) provides a `stream<u8>` to `descriptor.write-via-stream(data, offset)` and gets back a `future<result>`.

The adapter creates a stream pair, returns the writable end as a P2 `output-stream`, and passes the readable end to P3:

```typescript
function adaptWriteViaStream(p3desc: WasiP3Descriptor, offset: bigint): Result<WasiOutputStream, ErrorCode> {
    const { readable, writable } = createJscoStreamPair<Uint8Array>();

    // Start P3 write in background — it reads from the readable end
    const completion = p3desc.writeViaStream(readable, offset);

    // Return writable end wrapped as P2 output-stream
    return ok(createP2OutputStreamFromP3(writable, completion));
}
```

### 5. `wasi:sockets` — Medium Difficulty (Interface Consolidation)

P2 has 7 interfaces; P3 has 2. Major structural change but the operations map well.

| P2 Interface | P3 Equivalent |
|---|---|
| `network` (types: network resource, error-code enum) | `types` (error-code variant, ip types) |
| `instance-network` (get-network() → network) | **Removed** — not needed |
| `tcp` (resource tcp-socket) | `types` (resource tcp-socket with `create` static) |
| `tcp-create-socket` (create-tcp-socket(af) → tcp-socket) | `types.tcp-socket.create(af)` static method |
| `udp` (resource udp-socket) | `types` (resource udp-socket with `create` static) |
| `udp-create-socket` | `types.udp-socket.create(af)` static method |
| `ip-name-lookup` (resolve-addresses → stream of addresses) | `ip-name-lookup.resolve-addresses` async func → `list<ip-address>` |

#### Key changes

1. **Socket creation**: P2 `create-tcp-socket(network, address-family)` → P3 `tcp-socket.create(address-family)`. The adapter drops the `network` parameter.

2. **Connection state machine**: P2 TCP has `start-connect()` → `finish-connect()` two-phase pattern with pollables. P3 has `connect: async func(remote-address) -> result`. The adapter wraps:

```typescript
// P2: start-connect(network, remote-address) → result  
//     finish-connect() → result<(input-stream, output-stream)>
// P3: connect(remote-address) → async result

function adaptTcpSocket(p3socket: WasiP3TcpSocket): WasiP2TcpSocket {
    let connectPromise: Promise<Result<void, ErrorCode>> | null = null;
    let sendStream: JscoStream<Uint8Array> | null = null;
    let recvStream: JscoStream<Uint8Array> | null = null;

    return {
        startConnect(network: any, remoteAddress: IpSocketAddress): Result<void, ErrorCode> {
            // Initiate P3 async connect, store promise
            connectPromise = p3socket.connect(remoteAddress);
            return ok(undefined);
        },

        finishConnect(): Result<[WasiInputStream, WasiOutputStream], ErrorCode> {
            if (!connectPromise) return err('invalid-state');
            // This will block via JSPI if not yet resolved
            // After connect succeeds, get send/receive streams from P3 socket
            // ... wrap as P2 input-stream / output-stream
        },

        subscribe(): WasiPollable {
            if (connectPromise) return createAsyncPollable(connectPromise.then(() => {}));
            return createSyncPollable(() => true);
        },
        // ...
    };
}
```

3. **Listen**: P2 `listen() → result` + `accept() → result<(tcp-socket, input-stream, output-stream)>`. P3 `listen() → (stream<tcp-socket>, future<result>)`. The adapter wraps the stream of sockets:

```typescript
// P2: listen() → result; then repeated accept() → result<(socket, in, out)>
// P3: listen() → (stream<tcp-socket>, future<result>)

function adaptListen(p3socket: WasiP3TcpSocket) {
    let listenerStream: JscoStream<WasiP3TcpSocket> | null = null;

    return {
        listen(): Result<void, ErrorCode> {
            const { stream, completion } = p3socket.listen();
            listenerStream = stream;
            return ok(undefined);
        },

        accept(): Result<[TcpSocket, InputStream, OutputStream], ErrorCode> {
            // Read next socket from P3 stream
            // This blocks via JSPI if no connection pending
            const nextSocket = /* await via JSPI */ listenerStream.read();
            // Get I/O streams from the accepted socket
            // Wrap everything as P2 resources
        },
    };
}
```

4. **Name lookup**: P2 returns a `resolve-address-stream` resource (streaming via pollable). P3 returns `async func → list<ip-address>`. The adapter creates a one-shot stream from the list:

```typescript
function adaptResolveAddresses(p3lookup: WasiP3IpNameLookup) {
    return {
        resolveAddresses(network: any, name: string): ResolveAddressStream {
            const promise = p3lookup.resolveAddresses(name);
            let addresses: IpAddress[] | null = null;
            let index = 0;

            promise.then(result => {
                if (result.tag === 'ok') addresses = result.val;
            });

            return {
                resolveNextAddress(): Result<Option<IpAddress>, ErrorCode> {
                    if (!addresses) return err('would-block');
                    if (index >= addresses.length) return ok(null);
                    return ok(addresses[index++]);
                },
                subscribe(): WasiPollable {
                    return createAsyncPollable(promise.then(() => {}));
                },
            };
        },
    };
}
```

5. **Error code mapping**: P2 `error-code` is an enum with values like `connection-refused`, `connection-reset`. P3 is a variant with `other(option<string>)`. Forward mapping is straightforward; reverse mapping of `other(...)` → closest P2 enum value requires string matching or returning a generic code.

### 6. `wasi:http` — Medium Difficulty

| P2 | P3 | Change |
|---|---|---|
| `outgoing-handler.handle(request, options?) -> future-incoming-response` | `handler.handle(request) -> async result<response, error-code>` | Simplified |
| `incoming-handler.handle(request, response-outparam)` | `handler.handle(request) -> async result<response, error-code>` | Response is return value, not outparam |
| Request body: `outgoing-body` resource with `write() -> output-stream` | Request constructor takes `option<stream<u8>>` + `future<result<option<trailers>>>` | Stream-based |
| Response body: `incoming-body` resource with `stream() -> input-stream` | `response.consume-body()` returns `(stream<u8>, future<result<option<trailers>>>)` | Stream-based |
| `future-incoming-response` resource with `subscribe() -> pollable` | Return type is direct `async result<response, error-code>` | No future resource needed |

The HTTP adapter is structurally similar to the filesystem adapter — wrapping P3 streams as P2 body resources.

```typescript
function adaptOutgoingHandler(p3handler: WasiP3Handler): WasiP2OutgoingHandler {
    return {
        handle(request: WasiP2OutgoingRequest, options?: WasiP2RequestOptions): WasiP2FutureIncomingResponse {
            // 1. Convert P2 request to P3 request
            //    - Extract body from P2 outgoing-body → create P3 stream<u8>
            //    - Map headers, method, URI, scheme, authority
            //    - Map request options (timeouts)
            // 2. Call P3 handler.handle(p3request)
            // 3. Wrap the resulting Promise as a FutureIncomingResponse
            //    - subscribe() returns pollable from the promise
            //    - get() returns the P3 response wrapped as P2 IncomingResponse
            const p3promise = callP3Handler(p3handler, request, options);
            return createFutureIncomingResponse(p3promise);
        }
    };
}
```

### 7. `wasi:random` — Trivial

P2 and P3 are nearly identical:

| Interface | Change |
|---|---|
| `random.get-random-bytes(len) -> list<u8>` | Identical |
| `random.get-random-u64() -> u64` | Identical |
| `insecure.get-insecure-random-bytes(len) -> list<u8>` | Identical |
| `insecure.get-insecure-random-u64() -> u64` | Identical |
| `insecure-seed.insecure-seed() -> (u64, u64)` | Identical |

**Adapter**: Direct passthrough. No changes needed.

## JSPI Integration Details

### Current jsco JSPI Flow

1. **Export side**: `WebAssembly.promising(coreFn)` wraps each component export. Any call to the export returns a `Promise`.
2. **Import side**: When a WASI host function needs to block, it throws `JspiBlockSignal(promise)`. The resolver's lowering trampoline catches it and returns the promise. `WebAssembly.Suspending` suspends the WASM stack.
3. **Resume**: When the promise resolves, the WASM stack resumes and the host function "returns" its result.

### How the P2 Adapter Uses JSPI

The P2 adapter doesn't change the JSPI mechanism. It just changes **what promises** the `JspiBlockSignal` carries:

| P2 blocking operation | Promise source |
|---|---|
| `input-stream.blocking-read()` | P3 `stream.read()` promise |
| `output-stream.blocking-write-and-flush()` | P3 `stream.write()` promise |
| `poll(pollables)` when none ready | `Promise.race()` of underlying P3 futures |
| `monotonic-clock subscribe-*` | P3 `wait-until` / `wait-for` promises |
| `tcp-socket.finish-connect()` | P3 `tcp-socket.connect()` promise |
| `http future-incoming-response.get()` | P3 `handler.handle()` promise |

### Interleaved Suspension (Future Work)

Currently jsco does **not** support interleaved JSPI suspension (re-entering the WASM instance while it's suspended). This means:

- Only **one** blocking call can be in flight at a time per WASM instance
- `poll()` with multiple async pollables works because `Promise.race()` is a single suspension point
- True concurrent I/O (e.g., reading from two sockets simultaneously in separate threads) is not possible

This is a **pre-existing limitation** not introduced by the adapter. When interleaved suspension support is added, the adapter benefits automatically.

## Enum/Variant Type Mappings

### `descriptor-type`: P2 enum → P3 variant

```typescript
function p3DescriptorTypeToP2(p3type: P3DescriptorType): P2DescriptorType {
    switch (p3type.tag ?? p3type) {
        case 'block-device': return 'block-device';
        case 'character-device': return 'character-device';
        case 'directory': return 'directory';
        case 'fifo': return 'fifo';
        case 'symbolic-link': return 'symbolic-link';
        case 'regular-file': return 'regular-file';
        case 'socket': return 'socket';
        case 'other': return 'unknown';   // P3 other(...) → P2 unknown
        default: return 'unknown';
    }
}
```

### `error-code` (filesystem): P2 enum → P3 variant

P2 has `would-block` which P3 dropped (async eliminates it). If P3 returns `other("would-block")`, map it back. P3 adds `other(option<string>)` catch-all which P2 doesn't have — map to closest code or `io`.

### `datetime` ↔ `instant`

```typescript
function p3InstantToP2Datetime(instant: P3Instant): WasiDatetime {
    return {
        seconds: instant.seconds < 0n ? 0n : BigInt(instant.seconds),  // clamp negative
        nanoseconds: instant.nanoseconds,
    };
}

function p2DatetimeToP3Instant(dt: WasiDatetime): P3Instant {
    return {
        seconds: dt.seconds,  // u64 fits in s64 for reasonable dates
        nanoseconds: dt.nanoseconds,
    };
}
```

## Implementation Plan

### Phase 1: Core Infrastructure
1. Define `JscoStream<T>` and `JscoFuture<T>` types (P3 host API surface)
2. Implement `createJscoStreamPair<T>()` — creates linked readable/writable ends
3. Implement P2 stream adapters: `createP2InputStreamFromP3()`, `createP2OutputStreamFromP3()`
4. Verify pollable-from-future works with existing `poll()` implementation

### Phase 2: Simple Interfaces
5. `wasi:random` — direct passthrough (validate P3 API matches)
6. `wasi:clocks` — type conversions + subscribe→wait-* wrapping
7. `wasi:cli/environment` — rename `initial-cwd` → `get-initial-cwd`
8. `wasi:cli/exit` — passthrough
9. `wasi:cli/terminal-*` — passthrough

### Phase 3: Stdio
10. `wasi:cli/stdin` — `get-stdin()` → lazy `read-via-stream()` wrapper
11. `wasi:cli/stdout` — `get-stdout()` → stream pair + `write-via-stream()`
12. `wasi:cli/stderr` — same as stdout

### Phase 4: Filesystem
13. Type mapping functions (descriptor-type, error-code, datetime↔instant)
14. Descriptor resource adapter (all methods)
15. Synthesize removed `read()` / `write()` from stream-based I/O
16. Directory entry stream adapter
17. Preopens passthrough

### Phase 5: HTTP
18. Fields/headers adapter (likely unchanged or minor)
19. Request/response body stream adapters
20. Outgoing handler adapter (P2 future-incoming-response from P3 async result)
21. Incoming handler adapter (response outparam → return value)

### Phase 6: Sockets
22. Type mapping (7 interfaces → 2)
23. TCP socket adapter (two-phase connect → async connect)
24. TCP listen/accept adapter (stream of sockets)
25. UDP socket adapter
26. IP name lookup adapter (stream → list)

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| P3 spec not yet stable | **High** | Design adapter as a thin wrapper; changes in P3 types only affect the mapping layer |
| CM async ABI not in jsco resolver | **Medium** | P3 host uses plain JS async internally; CM async ABI is only needed for P3 *guests* |
| Interleaved suspension not supported | **Medium** | P2 guests are single-threaded anyway; `poll()` handles multiplexing via `Promise.race()` |
| `write-via-stream` inversion (P2 returns stream, P3 accepts stream) | **Medium** | Stream pair pattern solves it cleanly |
| `in-daylight-saving-time` lost in timezone | **Low** | Minor compatibility gap; can heuristically detect |
| Pre-epoch timestamps (s64 vs u64) | **Low** | Clamp to 0; pre-epoch dates are extremely rare in practice |
| Synthesized `descriptor.read/write` performance | **Low** | Creating a stream per synchronous read/write has overhead; cache streams per descriptor+offset for sequential access patterns |

## Summary

The P2-to-P3 adapter is **feasible** and maps well onto jsco's existing architecture:

- **JSPI mechanism**: Unchanged — the adapter just provides different promises to `JspiBlockSignal`
- **Pollable/poll()**: Unchanged — `createAsyncPollable(promise)` works for P3 futures
- **Streams**: Hardest part, but pattern is clear: P3 `stream<T>` ↔ internal buffer ↔ P2 `input-stream`/`output-stream`
- **Most interfaces**: Minor renames, type conversions, and sync→async wrapping
- **Biggest structural change**: `write-via-stream` inversion (solved by stream pairs)
- **No new JSPI features needed**: Existing `Suspending`/`promising` handles all cases
