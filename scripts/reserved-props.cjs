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

    // === component model verbose-options sub-fields (already covered above) ===
    // (parser/resolver/binder/executor)
];
