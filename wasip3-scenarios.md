# WASIp3 Host Test Scenarios

## Overview

Test scenarios for the WASIp3 host implementation in TypeScript.
Covers unit tests (with mocked browser/Node.js APIs), and integration tests (real disk folders, HTTP/socket servers).

### Conventions

- **Unit tests** mock underlying platform APIs (`crypto`, `performance`, `fetch`, `node:fs`, `node:net`, etc.)
- **Integration tests** create real temporary directories, start real HTTP/socket servers, run against actual Node.js and browser (Playwright) runtimes
- **Handle confusion tests** attempt to use handles across resource-type boundaries (e.g. pass a filesystem descriptor handle to a socket API)
- **Async ordering tests** exercise concurrent streams, futures, and interleaved operations including JSPI stack suspension edge cases

---

## 1. Infrastructure

### 1.1 HandleTable

#### Happy path
- Allocate a handle, get it back, verify the stored value matches
- Allocate multiple handles, verify each returns a unique integer
- Drop a handle, verify it is removed
- Drop a handle, allocate a new one — verify the dropped slot is reused (free-list)
- Allocate handles up to a configured limit, verify all are retrievable

#### Error path
- Get with a handle that was never allocated — returns undefined or throws
- Drop a handle that was never allocated — throws or returns silently
- Drop the same handle twice (double-free) — second drop throws use-after-drop error

#### Edge cases
- Allocate, drop all, allocate again — handles are reused from free-list in correct order
- Allocate handle 0 — verify 0 is a valid handle (not confused with falsy)
- Concurrent allocations in the same microtask — no duplicate handles

#### Invalid arguments
- Allocate with `undefined` value — should reject or store (decide: is null a valid resource?)
- Get with negative number, NaN, Infinity, string, object as handle — should not return a valid resource
- Get with a floating-point number that looks like a valid handle (e.g. `1.0`) — should either reject or truncate consistently

#### Evil arguments
- Pass a handle from one HandleTable instance to another — must not cross-contaminate
- Pass a descriptor handle to a socket API and vice versa — must be rejected (tests handle-table-per-type isolation)
- Pass `Number.MAX_SAFE_INTEGER` as handle — must not cause out-of-bounds access
- Pass `__proto__`, `constructor`, `toString` as handle or value — must not pollute prototype chain
- Rapidly allocate and drop in a loop to exhaust memory — should hit configured limit and throw

### 1.2 Stream Bridge

#### Happy path
- Create a `ReadableStream<Uint8Array>` → wrap as `WasiStreamReadable<u8>` → iterate to completion, verify bytes match
- Create a `WritableStream<Uint8Array>` → wrap as `WasiStreamWritable<u8>` → write chunks, verify flushed data matches
- Round-trip: readable → writable → collect all bytes, verify identical
- Stream of non-byte type (e.g. `stream<directory-entry>`) — verify struct values survive the bridge
- Empty stream — iterate yields zero elements, completes normally

#### Error path
- Readable stream that errors mid-stream — bridge propagates error to consumer
- Writable stream that rejects a write — bridge propagates backpressure error to producer
- Close readable stream prematurely — consumer sees stream-closed error
- Cancel writable stream — pending writes are rejected

#### Edge cases
- Single-byte reads — verify correct behavior without buffering assumptions
- Very large chunk (1MB+) — verify no copy overhead when ownership transfers
- Backpressure: slow consumer, fast producer — verify producer is paused
- Backpressure: fast consumer, slow producer — verify consumer awaits without spinning
- Zero-length chunk — should be skipped or passed through (decide policy)
- Stream with exactly one chunk — iteration yields one value then completes

#### Invalid arguments
- Pass non-iterable object as stream — should throw TypeError
- Pass `null` or `undefined` where stream is expected — should throw immediately
- Yield `null` from an async iterable pretending to be a stream — should throw on the consumer side

#### Evil arguments
- Yield a Proxy object that throws on property access — stream bridge should catch and propagate error
- Yield an object with a malicious `then` property (thenable) — should not confuse the async iteration
- Iterator that never completes (infinite stream) — consumer must be able to cancel/abort
- Iterator that throws on `.next()` after returning `done: true` — bridge must not call `.next()` after done
- Iterator whose `.return()` method throws — stream cleanup must still complete

#### Multi-step: chunked vs element-by-element
- Verify stream<u8> works when yielding Uint8Array chunks (batch mode)
- Verify stream<u8> works when yielding individual bytes (element mode)
- Verify stream<directory-entry> works per-entry
- Switch modes mid-stream (if applicable) — verify no corruption

### 1.3 Result/Error Helpers

#### Happy path
- `ok(value)` produces `{ tag: 'ok', val: value }`
- `err(code)` produces `{ tag: 'err', val: errorCode }`
- WasiError wraps an error code and is throwable, carries phase/interface context

#### Edge cases
- `ok(undefined)` for void-returning functions — verify `val` is `undefined` not missing
- Nested result: `ok(err(...))` — verify outer tag is 'ok'

---

## 2. Random

### 2.1 wasi:random/random

#### Happy path
- `getRandomBytes(16n)` returns a `Uint8Array` of exactly 16 bytes
- `getRandomBytes(0n)` returns an empty `Uint8Array`
- `getRandomU64()` returns a `bigint` in range `[0, 2^64)`
- Two consecutive calls to `getRandomU64()` return different values (probabilistic, retry-safe)
- `getRandomBytes(1n)` returns a single byte

#### Error path
- Underlying `crypto.getRandomValues` throws (e.g. entropy exhaustion) — error propagates

#### Edge cases
- `getRandomBytes(65536n)` — maximum single `crypto.getRandomValues` call size; verify no silent truncation
- `getRandomBytes(65537n)` — exceeds single call limit; verify host loops or chunks correctly
- `getRandomBytes(1_000_000n)` — large allocation; verify within config limits

#### Invalid arguments
- `getRandomBytes(-1n)` — negative length, must throw
- `getRandomBytes(undefined)` — missing argument
- `getRandomBytes(42)` — number instead of bigint, must reject or coerce per boundary rules

#### Evil arguments
- `getRandomBytes(BigInt(Number.MAX_SAFE_INTEGER) * 1000n)` — absurdly large allocation, must be rejected by config limit before allocating
- `getRandomBytes(2n ** 64n)` — overflow u64 range
- Request random bytes in a tight loop to try to exhaust entropy pool — should not crash

### 2.2 wasi:random/insecure

#### Happy path
- `getInsecureRandomBytes(32n)` returns 32 bytes
- `getInsecureRandomU64()` returns a bigint
- Values are different from `random` interface (different entropy source is acceptable)

#### Edge cases
- Same edge cases as `random` for length bounds
- Insecure random should be faster — verify it doesn't accidentally use crypto

### 2.3 wasi:random/insecure-seed

#### Happy path
- `getInsecureSeed()` returns `[bigint, bigint]` tuple
- Both values are in `[0, 2^64)` range
- Calling twice in same instance returns the same seed (it's per-instance, not per-call)

#### Edge cases
- Verify seed is deterministic within an instance but different across instances (unless seeded)

---

## 3. Clocks

### 3.1 wasi:clocks/monotonic-clock

#### Happy path
- `now()` returns a `bigint` (nanoseconds)
- Two consecutive `now()` calls: second >= first (monotonic guarantee)
- `getResolution()` returns a positive `bigint`
- `waitFor(1_000_000n)` (1ms) resolves after approximately 1ms
- `waitUntil(now() + 10_000_000n)` resolves after approximately 10ms
- `waitFor(0n)` resolves immediately

#### Error path
- (Monotonic clock is infallible per spec — no error results)

#### Edge cases
- `waitFor(1n)` — 1 nanosecond, resolves immediately (setTimeout minimum is ~1ms)
- `waitUntil(now() - 1n)` — time already passed, should resolve immediately
- `waitFor(BigInt(Number.MAX_SAFE_INTEGER) * 1_000_000_000n)` — extremely long wait, should not crash (may just pend forever)
- Multiple concurrent `waitFor` calls — all resolve independently
- `now()` called in rapid succession — values are non-decreasing

#### Invalid arguments
- `waitFor(-1n)` — negative duration
- `waitFor(undefined)` — missing argument
- `waitUntil("not a bigint")` — wrong type

#### Evil arguments
- `waitFor(2n ** 64n)` — exceeds u64 range
- Spawn thousands of concurrent `waitFor(1n)` — verify no timer leak or memory exhaustion

### 3.2 wasi:clocks/system-clock

#### Happy path
- `now()` returns `{ seconds: bigint, nanoseconds: number }` (Instant)
- `now().seconds` is approximately current Unix epoch seconds
- `now().nanoseconds` is in `[0, 999_999_999]`
- `getResolution()` returns a positive duration

#### Edge cases
- System clock can go backwards (NTP adjustment) — verify no crash but document non-monotonic
- Verify nanoseconds field is a u32, not bigint

### 3.3 wasi:clocks/timezone

#### Happy path
- `ianaId()` returns a string like `"America/New_York"` or `undefined` if unknown
- `utcOffset(instant)` returns seconds offset (e.g. `-18000n` for EST)
- `toDebugString()` returns a human-readable string

#### Edge cases
- `utcOffset` for an instant during DST transition — verify correct offset
- `ianaId()` returns `undefined` on platforms without timezone info

#### Invalid arguments
- `utcOffset` with malformed instant (negative nanoseconds, nanoseconds > 999_999_999)

---

## 4. CLI

### 4.1 wasi:cli/environment

#### Happy path
- `getEnvironment()` returns configured env vars as `Array<[string, string]>`
- `getArguments()` returns configured args as `string[]`
- `getInitialCwd()` returns configured cwd or `undefined`
- Empty config → empty arrays, undefined cwd

#### Edge cases
- Env var with empty key or empty value — should be preserved
- Env var with `=` in value — should not be split
- Env var with null bytes in key or value — should be rejected or sanitized
- Arguments with spaces, special chars, unicode — should be preserved as-is
- Very long argument list (10,000+ entries) — should work within memory limits

#### Invalid arguments
- (These are config-driven, not guest-callable with arbitrary args)

#### Evil arguments (config injection)
- Env var key `__proto__` — must not pollute prototype
- Env var key `constructor` — must not pollute prototype
- Env var value containing shell injection patterns (`$(rm -rf /)`) — must be treated as opaque string, never evaluated

### 4.2 wasi:cli/exit

#### Happy path
- `exit({ tag: 'ok' })` — signals successful exit, host catches and returns 0
- `exit({ tag: 'err' })` — signals failure, host returns 1
- `exitWithCode(0)` — explicit exit code 0
- `exitWithCode(42)` — arbitrary exit code

#### Error path
- Exit during pending async operations — verify cleanup runs (streams closed, handles dropped)

#### Edge cases
- `exitWithCode(255)` — max u8 value
- Double exit — second call should be ignored or throw (already exiting)

#### Invalid arguments
- `exitWithCode(256)` — exceeds u8 range
- `exitWithCode(-1)` — negative
- `exitWithCode(NaN)` — not a number
- `exit("not a result")` — wrong type

#### Evil arguments
- `exit` called from within a stream callback — verify no deadlock
- Rapid repeated exit calls — verify no double-free of resources

### 4.3 wasi:cli/stdin

#### Happy path
- `readViaStream()` returns `[stream<u8>, future<result<_, error-code>>]`
- Reading from the stream yields the configured stdin data
- Reading all data then the stream ends — future resolves with `ok`
- Multiple reads accumulate all stdin bytes

#### Error path
- Stdin stream errors (e.g. pipe broken) — future resolves with `err(pipe)`
- Reading after stream is already consumed — get empty or error

#### Edge cases
- Empty stdin — stream yields nothing, future resolves with ok immediately
- Very large stdin (10MB) — verify streaming without full buffering
- Read with backpressure — slow consumer pauses production

#### Multi-step
- Read partial data, pause, read more — verify no data loss
- Read stdin while simultaneously writing to stdout — no interference

### 4.4 wasi:cli/stdout and wasi:cli/stderr

#### Happy path
- `writeViaStream(dataStream)` returns `future<result<_, error-code>>`
- Writing bytes to the stream → they appear in the configured output
- Future resolves with `ok` when stream completes
- Stderr and stdout are independent — interleaved writes don't mix

#### Error path
- Write to a closed/broken output — future resolves with `err(pipe)` or `err(io)`
- Stream cancelled mid-write — future resolves with error

#### Edge cases
- Zero-length write — no-op, no error
- Write UTF-8 multibyte characters split across chunks — output should reassemble correctly
- Very rapid small writes — verify no data loss or reordering

#### Multi-step
- Write to stdout, then stderr, then stdout again — verify ordering within each stream
- Start stdout write, exit before completion — verify partial output is flushed or error is reported

### 4.5 wasi:cli/terminal-*

#### Happy path
- `getTerminalStdin()` returns `TerminalInput` or `undefined` (not a terminal in most test envs)
- `getTerminalStdout()` returns `TerminalOutput` or `undefined`
- `getTerminalStderr()` returns `TerminalOutput` or `undefined`
- In non-terminal environments, all return `undefined`

#### Edge cases
- Verify resources are opaque — no accessible methods beyond existence check

---

## 5. Filesystem

### 5.1 wasi:filesystem/preopens

#### Happy path
- `getDirectories()` returns configured preopened directories as `Array<[Descriptor, string]>`
- Each descriptor is a valid handle to a directory
- Mount path strings match configuration

#### Edge cases
- No preopens configured → empty array
- Multiple preopens with overlapping paths — verify each is independent
- Preopen to root `/` — should work

#### Evil arguments (config)
- Mount path with `..` — should be normalized or rejected at config time
- Mount path with null bytes — should be rejected

### 5.2 wasi:filesystem/types — Descriptor resource

#### 5.2.1 File I/O: read-via-stream, write-via-stream, append-via-stream

##### Happy path
- Open a file, `readViaStream(0n)` → read all contents via stream, verify matches written data
- `writeViaStream(data, 0n)` → write data at offset 0, read back, verify
- `appendViaStream(data)` → append to file, read back, verify original + appended data
- `readViaStream(offset)` with non-zero offset — skips first `offset` bytes
- Write, then read — round-trip preserves data

##### Error path
- Read from a write-only descriptor — returns error (access denied or unsupported)
- Write to a read-only descriptor — returns error
- Read/write on a directory descriptor — returns error (is-directory)
- Write to a descriptor after it's been dropped — use-after-drop error

##### Edge cases
- Read empty file — stream yields nothing, future resolves ok
- Write empty stream — file unchanged or truncated (depending on offset)
- Read at offset beyond file size — stream yields nothing
- Write at offset beyond file size — file extended with zeros (or error, depending on impl)
- Concurrent reads on same file — both see consistent data
- Concurrent read and write on same file — write visibility to read (implementation-defined)
- Very large file read (100MB+) — verify streaming without full memory buffering

##### Invalid arguments
- `readViaStream(-1n)` — negative offset
- `writeViaStream(null, 0n)` — null stream
- `readViaStream(2n ** 64n)` — offset exceeding u64

##### Evil arguments
- Write a stream that yields extremely large chunks (1GB) — must be bounded by allocation limits
- Write a stream that never ends — must be bounded by file size limits
- Pass a stream from one descriptor's read to another descriptor's write (pipe between files) — should work or fail gracefully
- Write stream that yields non-Uint8Array objects — must reject

#### 5.2.2 Directory operations: create-directory-at, read-directory, remove-directory-at

##### Happy path
- `createDirectoryAt("subdir")` → directory created, `statAt` confirms type is directory
- `readDirectory()` on a directory → stream yields entries with name and type
- `removeDirectoryAt("subdir")` → directory removed, subsequent stat returns no-entry
- Create nested directories one level at a time

##### Error path
- Create directory that already exists → `exist` error
- Remove non-empty directory → `not-empty` error
- Remove non-existent directory → `no-entry` error
- Create directory on a file descriptor (not directory) → `not-directory` error

##### Edge cases
- Create directory with empty string name — should fail
- Create directory with `.` or `..` as name — should fail (reserved)
- Read directory with no entries — stream yields nothing
- Read directory with many entries (10,000+) — verify streaming
- Directory entry names with unicode, spaces, special characters

##### Evil arguments
- `createDirectoryAt("../../escape")` — path traversal, must be confined to mount
- `createDirectoryAt("/absolute/path")` — absolute path, must be rejected or confined
- `createDirectoryAt("a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p")` — deeply nested, may hit OS limits
- `createDirectoryAt("a".repeat(10000))` — very long name, must reject (name-too-long)
- `createDirectoryAt("dir\x00hidden")` — null byte in path, must reject
- `readDirectory()` while concurrently modifying directory contents — verify no crash

#### 5.2.3 File metadata: stat, stat-at, get-type, get-flags, set-times, set-times-at

##### Happy path
- `stat()` on a regular file → returns descriptor-stat with correct type, size, timestamps
- `stat()` on a directory → type is directory, size is implementation-defined
- `statAt(pathFlags, "file.txt")` → same result as opening then stat
- `getType()` returns the descriptor type
- `getFlags()` returns the descriptor flags
- `setTimes(accessTs, modTs)` — sets timestamps, subsequent stat reflects them
- `setTimesAt(flags, path, accessTs, modTs)` — sets timestamps on path

##### Error path
- `statAt` on non-existent path → `no-entry` error
- `setTimes` on a read-only descriptor → `not-permitted` or `read-only` error

##### Edge cases
- `setTimes` with `no-change` for one and `now` for another — only one timestamp updated
- `setTimes` with `timestamp(instant)` — exact timestamp set
- Symlink: `statAt` with and without `symlink-follow` flag — returns link vs target stats
- File size 0 vs file with content — stat reflects correct size

#### 5.2.4 File operations: open-at, link-at, symlink-at, readlink-at, rename-at, unlink-file-at

##### Happy path
- `openAt(flags, "newfile", {create}, {read, write})` → creates and opens file
- `openAt(flags, "existing", {}, {read})` → opens existing file for reading
- `openAt(flags, "newfile", {create, exclusive}, {write})` → creates only if not exists
- `openAt(flags, "existing", {truncate}, {write})` → opens and truncates
- `linkAt(flags, "src", targetDescriptor, "dst")` → hard link created
- `symlinkAt("target", "linkname")` → symlink created
- `readlinkAt("linkname")` → returns "target"
- `renameAt("old", targetDescriptor, "new")` → file renamed
- `unlinkFileAt("file")` → file removed

##### Error path
- `openAt` with `exclusive` on existing file → `exist` error
- `openAt` non-existent without `create` → `no-entry` error
- `openAt` with `directory` flag on a regular file → error
- `unlinkFileAt` on a directory → error (use removeDirectoryAt)
- `renameAt` source doesn't exist → `no-entry`
- `linkAt` across different mount points → `cross-device` error

##### Edge cases
- `openAt` with both `create` and `truncate` on existing file — file emptied
- `renameAt` to same path — no-op or error (implementation-defined)
- `unlinkFileAt` while file has open descriptors — file removed from directory but data accessible through existing descriptors
- Open same file multiple times — multiple independent descriptors

##### Evil arguments
- `openAt(flags, "../../etc/passwd", ...)` — path traversal escape from mount
- `openAt(flags, "/etc/shadow", ...)` — absolute path escape
- `symlinkAt("/etc/passwd", "evil-link")` — symlink pointing outside mount
- `readlinkAt` on a symlink pointing outside mount — must not reveal host paths
- `openAt` with symlink-follow on a symlink chain that escapes mount — must be caught
- `renameAt` targeting a different mount's descriptor — cross-mount attack
- `openAt` with path containing `\x00` — null byte injection
- `openAt` with path containing `%2e%2e` — URL-encoded traversal (should not be decoded)
- `linkAt` with a descriptor handle from a different resource type — type confusion

#### 5.2.5 Sync and advice: sync, sync-data, advise, set-size

##### Happy path
- `sync()` → flushes metadata and data, returns ok
- `syncData()` → flushes data only, returns ok
- `advise(0n, fileSize, 'sequential')` → hint accepted, returns ok
- `setSize(100n)` → file truncated or extended to 100 bytes

##### Error path
- `sync` on a closed/dropped descriptor → error
- `setSize` on a read-only descriptor → error

##### Edge cases
- `setSize(0n)` → file emptied
- `setSize` to same size → no-op
- `advise` with all advice variants — no errors

##### Evil arguments
- `setSize(2n ** 63n)` — absurdly large size, must reject (quota or insufficient-space)
- `advise` with negative offset or length — must reject

#### 5.2.6 Descriptor identity: is-same-object, metadata-hash, metadata-hash-at

##### Happy path
- Two descriptors to same file → `isSameObject` returns true
- Two descriptors to different files → returns false
- `metadataHash()` same for same file, different for different files
- `metadataHashAt(flags, path)` matches `metadataHash` of opened file

##### Edge cases
- Descriptor compared with itself → true
- Hard-linked files → same or different (implementation-defined)
- Renamed file → same object identity preserved
- Hash stability after file modification — may change

##### Evil arguments
- `isSameObject` with descriptor from different resource type — type error
- `metadataHashAt` with path traversal — confined to mount

### 5.3 Filesystem multi-step scenarios

#### Happy path
- Create directory → create file inside → write data → read back → stat → remove file → remove directory
- Open file → write stream → close stream → reopen → read stream → verify data
- Create multiple files → read directory → verify all entries present → unlink all → read directory → empty
- Preopen root → open subdirectory → open file in subdirectory → read file → all through cascading descriptors

#### Error path
- Create file → drop descriptor → try to read via dropped descriptor → use-after-drop error
- Write to file → set-size to smaller → read → get truncated content
- Open file read-only → attempt write → error → open file read-write → write succeeds

#### Unexpected async order
- Start reading file A, start writing file B, complete write B before read A — both succeed independently
- Start `readDirectory()` → delete entries while iterating → no crash (may see partial results)
- Start `writeViaStream` → close descriptor before stream completes → future resolves with error
- Start two concurrent `writeViaStream` to same file at different offsets — both complete without corruption
- `waitFor(clock)` interleaved with filesystem operations — both resolve correctly
- Open file → start read stream → rename file → continue reading → data still accessible (open descriptor survives rename)

#### Security: mixed handles
- Obtain descriptor from preopens → extract its handle number → pass that number as a socket handle → must fail
- Create file descriptor and directory descriptor → swap them in API calls → must get correct errors (is-directory vs not-directory)
- Open file from mount A → use it in a path operation scoped to mount B → must not cross mount boundaries
- Drop a descriptor → reuse handle is allocated to a new resource → old references must not reach new resource

---

## 6. HTTP

### 6.1 wasi:http/types — Fields resource

#### Happy path
- `new Fields()` creates empty headers
- `fromList([["content-type", encode("text/html")]])` → creates headers from list
- `get("content-type")` → returns `[encode("text/html")]`
- `has("content-type")` → true
- `has("x-missing")` → false
- `set("x-custom", [encode("value")])` → replaces all values for that key
- `append("x-custom", encode("value2"))` → adds second value
- `get("x-custom")` → returns both values
- `delete("x-custom")` → removes header
- `getAndDelete("x-custom")` → returns values and removes
- `copyAll()` → returns all entries as array of tuples
- `clone()` → returns independent copy, modifications don't affect original

#### Error path
- `fromList` with invalid header name (control characters) → `invalid-syntax` error
- `set` on immutable fields (e.g. from received response) → `immutable` error
- `set` forbidden header (e.g. `host` on outgoing request) → `forbidden` error
- `delete` non-existent header → `header-error` (or silent no-op, per spec)

#### Edge cases
- Header name case insensitivity: `get("Content-Type")` finds `"content-type"`
- Multiple values for same header — preserved in order
- Empty header value — valid, stored as empty Uint8Array
- Header value with non-ASCII bytes — valid in HTTP, stored as-is
- Very long header value (64KB+) → `size-exceeded` error
- Many headers (1000+) → verify no performance degradation
- Clone then modify original — clone is unaffected

#### Invalid arguments
- `get(null)` — null header name
- `set("", [encode("value")])` — empty header name
- `append` with undefined value
- `fromList` with non-array

#### Evil arguments
- Header name `__proto__` — must not pollute prototype
- Header name `constructor` — must not pollute prototype
- Header name with `\r\n` (CRLF injection) — must reject
- Header value with `\r\n` followed by new header (response splitting) — must reject
- Header name with null byte — must reject
- `fromList` with millions of entries — allocation bomb, must be bounded
- `set` called in loop to add gigabytes of header data — must be bounded by size limits
- Header name ` Transfer-Encoding` (with leading space) — must reject or normalize

### 6.2 wasi:http/types — Request resource

#### Happy path
- `Request.new(headers, bodyStream, trailersFuture, options)` → returns `[request, completionFuture]`
- `getMethod()` → returns configured method
- `setMethod('POST')` → updates method
- `getPathWithQuery()` → returns `/path?query=value`
- `setPathWithQuery("/new-path")` → updates path
- `getScheme()` → returns `{ tag: 'HTTPS' }`
- `setScheme({ tag: 'HTTP' })` → updates scheme
- `getAuthority()` → returns `"example.com"`
- `setAuthority("new-host.com")` → updates authority
- `getHeaders()` → returns the headers resource
- `getOptions()` → returns the request options
- `Request.consumeBody(request, completionFuture)` → returns `[bodyStream, trailersFuture]`

#### Error path
- `setMethod` after request is sent/consumed → `immutable` error
- `consumeBody` called twice → second call fails (body already consumed)
- `setPathWithQuery` with invalid path → error

#### Edge cases
- Request with no body (GET) — `contents` is `undefined`, body stream is empty
- Request with empty body — body stream ends immediately
- Request with trailers — trailer future resolves after body stream completes
- Request without trailers — trailer future resolves with `undefined`
- Request without options — `getOptions()` returns `undefined`

#### Invalid arguments
- `setMethod({ tag: 'other', val: '' })` — empty custom method
- `setAuthority` with very long string (10KB+)
- `setPathWithQuery` with control characters

#### Evil arguments
- `setAuthority("evil.com\r\nX-Injected: true")` — CRLF injection in authority
- `setPathWithQuery("/../../../etc/passwd")` — path traversal in URL
- `setScheme({ tag: 'other', val: 'javascript' })` — scheme injection
- `setMethod({ tag: 'other', val: 'CONNECT' })` — method that could open tunnels
- Pass a response handle where a request handle is expected — type confusion

### 6.3 wasi:http/types — RequestOptions resource

#### Happy path
- `new RequestOptions()` creates default options
- `setConnectTimeout(5_000_000_000n)` → 5 second connect timeout
- `getConnectTimeout()` → returns the set value
- `setFirstByteTimeout(10_000_000_000n)` → 10 second first byte timeout
- `setBetweenBytesTimeout(1_000_000_000n)` → 1 second between bytes
- `clone()` → independent copy

#### Error path
- Set timeout after options are attached to sent request → `immutable` error

#### Edge cases
- All timeouts undefined — use defaults
- Zero timeout — immediate timeout on next operation
- Very large timeout — effectively no timeout

#### Invalid arguments
- Negative timeout value (if representable as bigint)
- Timeout exceeding u64 range

### 6.4 wasi:http/types — Response resource

#### Happy path
- `Response.new(headers, bodyStream, trailersFuture)` → returns `[response, completionFuture]`
- `getStatusCode()` → returns 200
- `setStatusCode(404)` → updates status
- `getHeaders()` → returns headers resource
- `Response.consumeBody(response, completionFuture)` → returns `[stream, trailersFuture]`

#### Error path
- `setStatusCode` after response is consumed → `immutable`
- `consumeBody` called twice → error

#### Edge cases
- Status code 0 — minimum value
- Status code 999 — maximum valid (though HTTP only defines up to 599)
- Response with no body (204 No Content) — empty body stream
- Response with trailers (chunked transfer encoding)

#### Invalid arguments
- `setStatusCode(70000)` — exceeds u16
- `setStatusCode(-1)` — negative

### 6.5 wasi:http/client

#### Happy path
- `send(request)` with GET to valid URL → returns response with status 200, correct body
- `send(request)` with POST and body stream → server receives body, returns response
- Response body streamed back — read all chunks, verify content
- Response with headers — all headers accessible
- HTTPS request — TLS handled transparently
- Request with custom timeout options — respected

#### Error path
- `send` to unreachable host → `destination-not-found` or `connection-refused`
- `send` to host that times out → `connection-timeout`
- `send` with invalid URL → `HTTP-request-URI-invalid`
- `send` to HTTPS with bad cert → `TLS-certificate-error`
- Server returns malformed response → `HTTP-response-incomplete`
- Connection reset mid-body → `connection-reset`, body stream errors

#### Edge cases
- Response with chunked transfer encoding — streamed correctly
- Response with content-encoding (gzip) — passed through or decoded (implementation-defined)
- Redirect (302) — not followed automatically (per WASI spec)
- Very large response body (100MB+) — streamed without full buffering
- Empty response body — stream ends immediately
- Multiple concurrent sends — all complete independently

#### Invalid arguments
- `send(null)` — null request
- `send` with request missing scheme and authority

#### Evil arguments
- `send` to `http://localhost` — access to host loopback, should be blocked or configurable
- `send` to `http://169.254.169.254` — SSRF to cloud metadata service, must be blocked
- `send` to `http://[::1]` — IPv6 loopback SSRF
- `send` to `http://0x7f000001` — hex-encoded loopback
- `send` to `http://127.0.0.1.nip.io` — DNS rebinding
- `send` with request body stream that never ends — server-side timeout should handle
- `send` with extremely large headers — must be bounded
- `send` with `Transfer-Encoding: chunked` manually set — verify no double-encoding

### 6.6 wasi:http/handler (guest export)

#### Happy path
- Host constructs request → calls guest `handle(request)` → guest returns response → host reads response
- Guest reads request headers, body, returns response with custom headers and body
- Guest returns response with trailers

#### Error path
- Guest returns error code → host receives the error
- Guest throws/traps → host receives `internal-error`
- Guest takes too long → host-side timeout fires

#### Edge cases
- Guest reads request body slowly (backpressure) — host stream pauses
- Guest returns response before reading full request body — request body cancelled
- Guest returns response with streaming body — host reads it incrementally

### 6.7 HTTP multi-step scenarios

#### Happy path
- Create fields → create request options → create request with body stream → send → read response headers → stream response body → read trailers
- Clone fields → modify clone → verify original unchanged → use both in different requests
- Create response for handler → set status → set headers → attach body stream → return

#### Error path
- Send request → connection drops mid-response body → future resolves with error → cleanup headers/body
- Send request → timeout → verify all resources (fields, body streams) are cleaned up
- Create request → consume body → try to send consumed request → error

#### Unexpected async order
- Start sending request A → start sending request B → B completes before A → both results correct
- Start reading response body → send another request before first body is fully read → both streams operate independently
- Create request with body stream → start sending → body stream errors after partial send → send future resolves with error
- Read response body stream → drop response resource before body is fully read → stream cancelled, future errors
- Send request → read first chunk of response body → wait (monotonic-clock) → read next chunk → verify continuity
- Start body stream write → abort mid-stream → verify completion future resolves with error
- Request trailers future resolves before body stream completes — should not happen (trailers come after body)

#### Security
- Guest handler receives request → tries to use request handle as response handle → type confusion rejected
- Guest handler creates response with Fields cloned from request headers → verify no mutable aliasing
- Pipelining attack: send malformed request that causes the host to misparse and treat part of the body as a new request
- Header smuggling: `Transfer-Encoding` and `Content-Length` both present with conflicting values

---

## 7. Sockets

### 7.1 wasi:sockets/types — TcpSocket resource

#### Happy path
- `TcpSocket.create('ipv4')` → returns a new TCP socket
- `bind({ tag: 'ipv4', val: { port: 0, address: [127, 0, 0, 1] } })` → binds to loopback, ephemeral port
- `getLocalAddress()` → returns assigned address with actual port
- `connect(remoteAddress)` → connects to a listening server
- `getRemoteAddress()` → returns server's address
- `send(dataStream)` → sends data, future resolves ok
- `receive()` → returns `[stream, future]`, read data matches what server sent
- `listen()` → returns stream of accepted connections
- `getAddressFamily()` → returns 'ipv4'
- `getIsListening()` → true after listen, false before

#### Error path
- `connect` to unreachable address → `connection-refused` or `remote-unreachable`
- `connect` on already connected socket → `invalid-state`
- `bind` to address already in use → `address-in-use`
- `bind` to address not on this host → `address-not-bindable`
- `listen` on unbound socket → `invalid-state`
- `send` on unconnected socket → `invalid-state`
- `receive` on unconnected socket → `invalid-state`
- Connection reset by peer → `connection-reset`
- Connection timed out → `timeout`

#### Edge cases
- Bind to port 0 → OS assigns ephemeral port
- Connect then immediately send — data arrives
- Send empty stream — no-op
- Receive when no data yet — stream blocks until data arrives or timeout
- Very large send (1MB+ in one stream) — data split into TCP segments, all arrive
- IPv6 socket with IPv4-mapped address
- Half-close: send completes, then receive remaining data

#### Invalid arguments
- `create` with invalid address family string
- `bind` with port > 65535
- `bind` with malformed IP address tuple (wrong number of elements)
- `setHopLimit(0)` — may be invalid
- `setHopLimit(256)` — exceeds u8
- `setKeepAliveIdleTime(-1n)` — negative duration
- `setReceiveBufferSize(0n)` — zero buffer

#### Evil arguments
- `connect` to `0.0.0.0:0` — degenerate address
- `connect` to broadcast address `255.255.255.255` — should reject
- `connect` to multicast address — should reject
- `bind` to privileged port (< 1024) without permission
- Create thousands of sockets without closing — resource exhaustion
- `send` a stream that yields data infinitely — must be bounded
- Pass a filesystem descriptor handle as socket handle — cross-resource-type confusion

### 7.2 wasi:sockets/types — UdpSocket resource

#### Happy path
- `UdpSocket.create('ipv4')` → new UDP socket
- `bind` to loopback ephemeral port → ok
- `connect(remoteAddress)` → set default destination
- `send(data, remoteAddress)` → send datagram
- `receive()` → receive datagram with sender address
- `disconnect()` → clear default destination
- `getLocalAddress()` → returns bound address
- `getRemoteAddress()` → returns connected address (after connect)
- `getAddressFamily()` → returns 'ipv4'

#### Error path
- `send` datagram larger than MTU → `datagram-too-large`
- `receive` when no data → blocks (async), eventually times out
- `send` to unreachable address → may succeed (UDP is connectionless) or fail on next receive
- `disconnect` when not connected → `invalid-state`

#### Edge cases
- Send without connect, with explicit remote address — valid
- Send without connect and without remote address — error (no destination)
- Receive after sender closes — no more data, not necessarily error
- Multiple datagrams sent rapidly — may arrive out of order
- Maximum UDP datagram size (65535 bytes minus headers)

#### Invalid arguments
- `send` with empty data — is it valid? (likely yes, zero-length UDP)
- `send` with data exceeding 65535 bytes
- `setUnicastHopLimit(0)` — may be rejected

#### Evil arguments
- UDP amplification: small send to a service that generates large response — rate-limit
- Send to broadcast address — should be configurable or blocked
- Create thousands of UDP sockets — resource exhaustion
- `receive` loop without `send` — blocks indefinitely, must be cancellable

### 7.3 wasi:sockets/ip-name-lookup

#### Happy path
- `resolveAddresses("localhost")` → returns addresses including `127.0.0.1` or `::1`
- `resolveAddresses("example.com")` → returns valid IP addresses
- Result contains both IPv4 and IPv6 addresses when available

#### Error path
- `resolveAddresses("nonexistent.invalid")` → `name-unresolvable`
- `resolveAddresses("")` → `invalid-argument`
- DNS server unreachable → `temporary-resolver-failure`

#### Edge cases
- `resolveAddresses("127.0.0.1")` — IP literal, should return the same address
- `resolveAddresses("::1")` — IPv6 literal
- Very long hostname (255+ characters) — `invalid-argument`
- Concurrent DNS resolutions — all complete independently
- DNS result with many addresses — all returned

#### Invalid arguments
- `resolveAddresses(null)` — null hostname
- `resolveAddresses(42)` — number instead of string

#### Evil arguments
- `resolveAddresses("evil.com\x00.example.com")` — null byte in hostname, must reject
- `resolveAddresses` in rapid loop (1000s of requests) — DNS flood, must be rate-limited
- `resolveAddresses("A".repeat(10000))` — very long hostname
- `resolveAddresses("169.254.169.254")` — IP literal for cloud metadata, may need policy
- DNS rebinding: resolve hostname that returns different IPs on each query — host should not cache dangerously

### 7.4 Sockets multi-step scenarios

#### Happy path: TCP echo server
- Create server socket → bind to loopback → listen → create client socket → connect to server → accept connection from listen stream → client sends data → server reads from accepted connection → server sends response → client reads response → verify echo matches → close all

#### Happy path: TCP multiple clients
- Create server → listen → connect 3 clients → accept 3 connections → each client sends unique data → server echoes each → clients verify their own responses → close all

#### Happy path: UDP ping-pong
- Create two UDP sockets → bind both → socket A sends to socket B → socket B receives → socket B sends response → socket A receives → verify round-trip

#### Error path
- Connect → server dies → send → receive error → cleanup
- Listen → accept → accepted socket resets → error on accepted socket's streams, server continues listening

#### Unexpected async order
- Connect → start receive before send → send data → receive resolves
- Listen → accept connection → start receiving on accepted socket → client hasn't sent yet → client sends → data arrives
- Start multiple concurrent connects to different servers — all complete independently
- Send data on socket A → receive on socket B → send on socket B → receive on socket A — interleaved operations across sockets
- Connect → send large stream → drop socket mid-send → send future resolves with error
- Accept → start reading accepted socket → close listener → accepted socket continues to work (already established)

#### Security: mixed handles
- Use a TcpSocket handle as a UdpSocket → must be rejected
- Use a filesystem descriptor handle as a socket → must be rejected
- Use an accepted TcpSocket handle from listener A as if it came from listener B → handle is valid regardless of origin (it's just a TcpSocket)
- Create socket → bind → drop → reuse handle value (now points to different resource) → operations on old reference fail

---

## 8. Cross-Interface Scenarios

### 8.1 Clock + Filesystem

- Write file → wait 10ms (monotonic clock) → write again → stat → verify modification timestamp changed
- Start file read stream → waitFor(100ms) → continue reading → verify data continuity
- Set file timestamps to a specific system-clock instant → stat → verify timestamps match

### 8.2 Clock + HTTP

- Send HTTP request with 1s timeout → server delays 2s → timeout error at ~1s
- Send HTTP request → waitFor(0) interleaved → response arrives → verify no interference
- Measure round-trip: record monotonic `now()` → send request → receive response → record `now()` again → verify elapsed time is reasonable

### 8.3 HTTP + Filesystem

- Receive HTTP response → stream body to file via write-via-stream → read file back → verify matches response
- Read file → stream as HTTP request body → server echoes → verify

### 8.4 Sockets + Clock

- Connect with timeout → connection exceeds timeout → verify timeout error
- Measure socket latency with monotonic clock — send, receive, compare timestamps

### 8.5 Stdio + HTTP (handler)

- Guest handler writes to stderr while processing request — stderr output appears, response still returned correctly
- Guest handler reads stdin (unusual but possible) — stdin data available independently of request

### 8.6 Resource handle cross-type confusion (comprehensive)

- Pass a Fields handle where a Request is expected → type error
- Pass a Request handle where a Response is expected → type error
- Pass a RequestOptions handle where a Fields is expected → type error
- Pass a Descriptor handle where a TcpSocket is expected → type error
- Pass a TcpSocket handle where a UdpSocket is expected → type error
- Pass a TerminalInput handle where a Descriptor is expected → type error
- After dropping a Fields resource, its handle number gets reused for a new Request → old Fields references must not reach the new Request

### 8.7 Exit during complex operations

- Start file write stream → exit mid-write → verify cleanup (stream cancelled, future errors or resolves)
- Start HTTP request → exit before response → verify cleanup
- Multiple open sockets → exit → all sockets closed
- Exit during DNS resolution → resolution cancelled
- Exit code correctly propagated despite pending async operations

### 8.8 JSPI edge cases

- Long async chain: filesystem read → HTTP send → socket write → all using JSPI stack suspension → verify correct resumption order
- JSPI suspension during stream iteration → verify iterator state preserved after resume
- Nested JSPI suspensions (e.g. during a lifted function that calls another async host function) → verify stack integrity
- JSPI suspension timeout — host has configurable max suspension time → verify timeout fires and error propagates

---

## 9. Integration Tests (Real Infrastructure)

### 9.1 Filesystem (Node.js with real temp directories)

- Create temp directory on host → mount into WASI → create/read/write/delete files → verify on host filesystem
- Mount read-only directory → attempt write → error
- Mount nested directories → access at various depths
- Large file I/O: write 10MB file → read back → verify
- Concurrent file operations from same WASI instance
- Verify symlinks within mount are followed, symlinks escaping mount are blocked
- Verify `.` and `..` resolution stays within mount
- Verify file permissions are respected (read-only, write-only, read-write)
- Verify preopens match configured mounts

### 9.2 HTTP Client (real HTTP server)

- Start local HTTP server → WASI sends GET → verify response
- POST with JSON body → server parses → echoes back → verify
- Server returns various status codes (200, 404, 500) → WASI sees correct status
- Server returns streaming response → WASI reads incrementally
- Server returns large response (10MB) → verify streaming without OOM
- HTTPS with self-signed cert → configure trust → verify or reject
- Server deliberately delays → verify timeout behavior
- Server resets connection → verify error propagation

### 9.3 Sockets (real TCP/UDP servers)

- Start TCP echo server on host → WASI connects → send/receive round-trip
- WASI creates TCP server → host connects → data exchange
- UDP datagram exchange between WASI and host
- DNS resolution of real hostnames → verify results
- Multiple concurrent socket connections
- Socket keep-alive settings → verify system-level socket options applied

### 9.4 Browser tests (Playwright)

- `createHost()` in browser context → verify random, clocks, CLI work
- HTTP client via browser fetch → verify CORS handling
- Filesystem VFS in browser → create/read/write/delete files
- Sockets in browser → verify `not-supported` errors returned
- Stdout/stderr in browser → verify output captured
- Verify no Node.js APIs leak into browser bundle

### 9.5 End-to-end WASM component tests

- Compile Rust/WAT component targeting WASIp3 → instantiate with host → run → verify output
- Hello-world component: reads args/env, writes to stdout
- Echo component: reads stdin, writes to stdout
- HTTP handler component: receives request, returns response
- Filesystem component: creates files, reads them back
- Component that uses multiple interfaces simultaneously
