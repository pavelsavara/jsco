// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

// Names that must NEVER be mangled by `terser.mangle.properties`. Terser
// already reserves DOM and built-in JS property names when `builtins:false`
// (default), and any property accessed via quoted form anywhere in the source
// is auto-reserved when `keep_quoted:true`. This list captures the remainder:
//
//   - User-facing API field names on objects we hand back to callers
//     (e.g. `verbose`, `logger`, `parser`, `resolver`, `binder`, `executor`).
//   - WASM ABI / canonical-ABI field names that may otherwise be referenced
//     only via dotted access on objects whose shape leaks out of the bundle.
//
// Project-internal data shapes (MarshalingContext, ResolverContext, BinderArgs,
// PlanOp, etc.) intentionally are NOT in this list and DO get mangled — that's
// the whole point of property mangling for bundle size.

module.exports = [
    // === user-facing top-level config ===
    'verbose',
    'logger',
    'parser',
    'resolver',
    'binder',
    'executor',

    // === public API on the WasmComponent / WasmComponentInstance objects ===
    'instantiate',
    'imports',
    'exports',
    'abort',
    'dispose',
    'bindMemory',

    // === CLI entry point on the dynamically-imported cli.js namespace ===
    // index.js does `import('./cli').then(m => m.cliMain())` — terser would
    // mangle `m.cliMain` (a property access) but rollup keeps the matching
    // ES module `export { cliMain }` literal, so the names must agree.
    'cliMain',

    // === HostConfig fields users construct ===
    'stdin',
    'stdout',
    'stderr',
    'env',
    'args',
    'preopens',
    'random',
    'monotonicClock',
    'wallClock',
    'fetch',
    'serve',

    // === WASI host method names invoked from the wasm side via lookup ===
    // These are looked up by canonical name through host import maps. Many are
    // accessed via bracket syntax already, but list to be safe.
    'handle',
    'run',
    'getDirectories',
    'getRandomBytes',
    'getInsecureRandomBytes',
    'now',
    'resolution',
    'subscribeDuration',
    'subscribeInstant',
    'getEnvironment',
    'getArguments',
    'initialCwd',

    // === module/instance shape that we both build and consume ===
    '_start',
    '_initialize',
    'memory',
    'realloc',

    // === embedded @thi.ng/leb128 WASM module exports ===
    // The leb128 helper inlines a base64 WASM blob whose exports are accessed
    // via `wasm[op]` with `op` computed at runtime — terser cannot see these
    // names. WASM-export names are real strings on the JS side and cannot be
    // renamed.
    'leb128EncodeU64',
    'leb128DecodeU64',
    'leb128EncodeI64',
    'leb128DecodeI64',
    'buf',

    // === cross-bundle re-exports from wasip3.ts ===
    // The Release build emits separate chunks. ESM `export { X }` keeps the
    // public name, but several of these are also accessed via property
    // lookup on the imported namespace and via runtime string lookup.
    'createWasiP3Host',
    'createWasiP2ViaP3Adapter',
    'createWasiP1ViaP3Adapter',
    'createStreamPair',
    'readableFromStream',
    'readableFromAsyncIterable',
    'collectStream',
    'collectBytes',
    'WasiError',
    'WasiExit',
    'NETWORK_DEFAULTS',
    'LIMIT_DEFAULTS',
    '_HttpFields',
    '_HttpRequest',
    '_HttpResponse',
    '_getHttpLimits',
    'createHandleTable',
    'ok',
    'err',

    // === HostConfig.limits sub-fields used by CLI / runtime ===
    'limits',
    'maxAllocationSize',
    'maxHandles',
    'maxPathLength',
    'maxMemoryBytes',
    'maxCanonOpsWithoutYield',
    'maxBlockingTimeMs',
    'maxHeapGrowthPerYield',
    'networkLimits',

    // === HostConfig fields touched dynamically ===
    'fs',
    'cwd',
    'enable',
    'envInherit',
    'noJspi',
    'useNumberForI64',
    'validateTypes',
    'yieldThrottle',
    'addr',

    // === options bag fields used by createComponent / instantiateComponent ===
    'instantiateModule',
    'collectStats',
    'wasmCompileOptions',
    'compileStreaming',
    'transform',

    // === BuildInfo fields returned by getBuildInfo() ===
    'gitHash',
    'configuration',

    // === HTTP types: fields on _HttpRequest / _HttpResponse / Fields ===
    'method',
    'scheme',
    'authority',
    'pathWithQuery',
    'headers',
    'body',
    'contents',
    'trailers',
    'statusCode',

    // === filesystem entry / descriptor shape ===
    'type',
    'path',
    'mode',
    'flags',

    // === DOM / Node API names that terser's builtin list may miss ===
    // Web Streams used in our stream marshaling.
    'getReader',
    'releaseLock',
    'cancel',
    'pull',
    'enqueue',
    'desiredSize',
    'highWaterMark',
    'aborted',
    'reason',
    'signal',
    'AbortController',
    'AbortSignal',
    'addEventListener',
    'removeEventListener',
    // Response/Request fields accessed via bracket form
    'arrayBuffer',
    'status',
    'statusText',
    'ok',

    // === component model verbose-options sub-fields (already covered above) ===
    // (parser/resolver/binder/executor)
];
