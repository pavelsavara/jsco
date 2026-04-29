# Plan 2: Reduce Release bundle size

## Motivation
JSCO is positioned as a *browser polyfill* for the WASM component model. The current Release bundle is **`dist/release/index.js` ≈ 145 KB raw** (≈ 50 KB+ gzipped, depending on minifier settings). For the browser-host use case, every kilobyte matters — JCO's core-model transpiler is too large for dynamic-host scenarios precisely because of this, and that gap is JSCO's reason for existing.

Reducing the Release bundle is the single change that most increases the project's value to its target audience.

## Goal
Make the Release bundle materially smaller without regressing functionality or test coverage. Track progress with a baseline measurement and a CI check.

## Approach

### Step 1: Establish the baseline and measurement
- Add an `npm run size` script that prints both raw and gzipped sizes of `dist/release/index.js` and the on-demand chunks (`wasip3.js`, `wasip2-via-wasip3.js`, etc.).
- Commit the current baseline to a `bundle-size.json` file.
- Add a CI step that fails if the gzipped size grows by more than X% over baseline (start permissive, e.g. 5%).

### Step 2: Eliminate `jsco_assert` and `debugStack` in Release
[src/utils/assert.ts](src/utils/assert.ts) already has `// TODO inline rollup macro`. Two paths:
- **Rollup transform**: write a small plugin that, when `isDebug === false`, replaces `jsco_assert(cond, msg)` and `debugStack(...)` calls with empty statements *before* terser sees them. Terser can then DCE the message-builder closures.
- **Verify**: every `jsco_assert` callsite where the *message factory* allocates (template literal, `JSON.stringify`, etc.) must be eliminated, not just the call.

### Step 3: Quoted property names for terser-survivable identifiers
TODO already lists this. Identifiers like `leb128DecodeU64`, `buf`, `memory` cross trampoline boundaries and cannot be mangled. Use quoted access (`obj['memory']`) and `/* @__KEEP__ */` style annotations (or terser `reserved` config) to:
- Allow aggressive `mangle.properties` on internal-only names.
- Stop accidental renames at WASM-boundary identifiers.

### Step 4: Audit verbose-logging code for tree-shaking
Per [copilot-instructions.md](.github/copilot-instructions.md), all logging is guarded by `isDebug` and "tree-shaken in Release builds". Verify:
- Every `if (isDebug)` block actually disappears (inspect the minified output).
- LogLevel string-formatting helpers (e.g. JSON-serializing trampoline args) are not retained as dead live-data.
- The four phase-specific logger modules can be split into a separate chunk that Release builds never import.

### Step 5: Const-enum audit
Per project convention, all enums must be numeric `const enum`. Re-verify:
- No `enum` (non-const) survives in the bundle.
- No string-valued enum members exist.
- ModelTag, PrimitiveValType, ComponentExternalKind etc. inline to integer literals.

### Step 6: Code-split lazy-loaded hosts
WASI hosts already split via `loadWasiP3Host`/`loadWasiP2ViaP3Adapter`/`loadWasiP1ViaP3Adapter` ([src/dynamic.ts](src/dynamic.ts)). Confirm:
- The core `index.js` does not statically reference any host implementation file.
- `import('./host/...')` boundaries survive Rollup's chunking.

### Step 7: Identify remaining hotspots
After steps 2–6, run a tool like `source-map-explorer` (or `rollup-plugin-visualizer`) on `dist/release/index.js` and rank modules by post-minify size. Likely culprits to examine:
- Marshalling lambdas in `src/marshal/` (lots of per-type code paths).
- Resolver dispatcher (large switch-on-tag).
- Encoder/decoder caching layer.

For each top-N module, decide: inline & dedupe, lazy-load, or accept.

## Acceptance criteria
- [ ] Baseline established and tracked in CI.
- [ ] `jsco_assert` / `debugStack` calls are *fully* gone (calls + message factories) from Release.
- [ ] Source-map analysis recorded in `bundle-size-analysis.md` with top-20 modules pre/post.
- [ ] Material size reduction achieved (concrete target to be set after step 1's baseline + step 7's analysis).
- [ ] No test regressions.

## Non-goals
- Functionality cuts. The bundle should still ship every documented public API.
- A specific gzipped target. Earlier TODO speculated "<40 KB"; in practice the right number depends on what's analytically possible without losing features. Set it after measuring, not before.

## Risks
- `mangle.properties` is dangerous — easy to break WASM↔JS boundary identifiers. Guard with a comprehensive integration smoke test in CI before+after minify.
- Splitting hosts further may regress cold-start time for common cases. Measure load time, not just bundle bytes.
