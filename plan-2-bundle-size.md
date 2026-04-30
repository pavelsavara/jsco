# Plan 2: Reduce Release bundle size

## Motivation
JSCO is positioned as a *browser polyfill* for the WASM component model. Every kilobyte shipped to clients matters — JCO's core-model transpiler is too large for dynamic-host scenarios, and that gap is JSCO's reason for existing.

## Current status (bundle-size branch)

Baseline progression on `dist/release/*.js` (raw / gzip totals):

| Stage | raw | gzip | Δ vs prev | Notes |
|---|---|---|---|---|
| `3dbcf9c` — `mangle.properties` disabled (CI fix) | 320,581 | 80,360 | — | Initial CI-green state |
| `d81ba88` — re-enabled with WIT-driven reserved list | 288,846 | 77,635 | **−9.9% raw / −3.4% gzip** | Current `HEAD` |

The branch is shippable as-is.

## What got done

- ✅ **Step 1 — Baseline measurement and CI guard.** [bundle-size.json](bundle-size.json) tracks per-bundle raw/gzip with a 5% tolerance. `npm run size` prints sizes; `npm run size:write` rebases the baseline. CI fails on regression beyond tolerance.
- ✅ **Step 2 — Strip `jsco_assert` and `debugStack` in Release.** `stripDebugCalls()` Rollup transform in [rollup.config.js](rollup.config.js) replaces every `jsco_assert(...)` / `debugStack(...)` call (including its message-factory closure) with `void 0;` before terser sees the source. Definitions in [src/utils/assert.ts](src/utils/assert.ts) are preserved and tree-shake on their own.
- ✅ **Step 3 — Quoted-property strategy & terser-survivable identifiers.** Re-enabled `mangle.properties` with two-part reserved list:
  - [scripts/reserved-props.cjs](scripts/reserved-props.cjs) — hand-curated runtime names: leb128 WASM exports, cross-bundle re-exports, `HostConfig` / `HostConfig.limits` fields, options-bag fields, HTTP types, DOM/Node API names.
  - [scripts/reserved-wit-names.cjs](scripts/reserved-wit-names.cjs) — auto-generated from `wit/wasip3/types/**/*.d.ts` via [scripts/extract-wit-names.mjs](scripts/extract-wit-names.mjs). Run that script when WIT changes.
  - Combined with `keep_quoted: true`, terser mangles internal identifiers but leaves every name reachable via `imports[interfaceName][methodName]` intact.
- ✅ **Step 4 — Verbose logging tree-shakes.** All `if (isDebug)` blocks disappear in Release; `setLogger` and `LogLevel` constants survive only as numeric inlined values.
- ✅ **Step 5 — Numeric `const enum` audit.** No string-valued enums survive (already enforced as a project convention).
- ✅ **Step 6 — Code-split lazy-loaded hosts.** Six bundles produced: `index.js`, `wasip1-via-wasip3.js`, `wasip2-via-wasip3.js`, `wasip2-via-wasip3-node.js`, `wasip3.js`, `wasip3-node.js`. `externalizeSiblingModules` in [rollup.config.js](rollup.config.js) keeps the host implementations on dynamic-import boundaries.
- ✅ **Cross-bundle name consistency.** Single shared terser `nameCache` mutated in place across all 6 bundle invocations, so an internal symbol mangled to `e` in `wasip3.js` stays `e` when re-exported from `index.js`.
- ✅ **Verification.** ESLint clean, ~1,800 unit/integration tests pass, Playwright browser suite passes against `dist/release` on Chromium and Firefox.

## What's worth doing next (in priority order)

### A. Land + stabilize (highest ROI, lowest risk)
- [x] Merge `bundle-size` (PR #82) to `main`.
- [x] Add `npm run reserved:wit` script (alias for `node scripts/extract-wit-names.mjs`) so contributors don't need to remember the path. Companion `npm run reserved:wit:check` mode validates the committed file is up to date.
- [x] CI step that re-runs `extract-wit-names.mjs --check` and fails if `reserved-wit-names.cjs` would change. Wired into [.github/workflows/lint.yml](.github/workflows/lint.yml). Prevents a stale list from silently mangling new WIT methods after a WIT bump.

### B. Investigate top hotspots (Step 7 from original plan, still pending)
We didn't run a source-map analyzer yet. Quick wins likely remain:
- [ ] Run `rollup-plugin-visualizer` (or `source-map-explorer`) against `dist/release/index.js` and rank modules by post-minify size.
- [ ] Likely culprits: marshalling lambdas in `src/marshal/` (per-type code paths), resolver dispatcher (large switch-on-tag), encoder/decoder caching layer.
- [ ] For each top-N module, decide: inline & dedupe, lazy-load, or accept.

### C. Diminishing-return frontier — **not recommended**
Constants-extraction (move long property names like `directory`, `maxPathLength`, `resolveNode` to a shared module accessed as `obj[K]` so terser can mangle the alias) was investigated. Analysis tools committed: [scripts/count-reserved-usage.mjs](scripts/count-reserved-usage.mjs) and [scripts/estimate-mangle-savings.mjs](scripts/estimate-mangle-savings.mjs). Findings:
- Top 50 candidates yield ≈ 5,200 raw bytes net savings.
- Gzip already compresses repeated property strings well — realistic gzip ceiling is **~600–900 B (≈ 1%)**.
- Cost: either ~200 source edits across `src/host/**` and `src/runtime/**`, or a custom Rollup AST-rewrite plugin (~80 lines + corner cases for destructuring / class methods / shorthand). No off-the-shelf Rollup plugin does this transform; Closure Compiler ADVANCED could but is incompatible with our reserved-list workflow.
- **Verdict: not worth the churn.** Recorded here so future contributors don't re-investigate.

### D. Other ideas not yet investigated
- [ ] Audit error-message strings (variant tags, error names) — many are long and infrequently hit. Could be deduped or moved behind a single mapping object.
- [ ] Marshalling: investigate whether the per-call closure factories in `src/marshal/to-abi.ts` / `src/marshal/from-abi.ts` could share more code via a small interpreter for common type combinations (record-of-flat-primitives, list-of-u8, etc.).
- [ ] Confirm WIT-types `.d.ts` files contribute zero bytes to the runtime bundle (type-only imports). Currently looks right but worth a sanity check.

## Acceptance criteria (status)

- [x] Baseline established and tracked in CI.
- [x] `jsco_assert` / `debugStack` calls fully eliminated (calls + message factories).
- [ ] Source-map analysis recorded with top-20 modules pre/post. _Pending — Step B above._
- [x] Material size reduction achieved: −31.7 KB raw / −2.7 KB gzip vs the mangling-disabled baseline.
- [x] No test regressions.

## Non-goals
- Functionality cuts. The bundle still ships every documented public API.
- A specific gzipped target. Earlier TODO speculated "<40 KB" for `index.js`; current is 31.8 KB gzip — already under that target *before* Step B.

## Risks (residual)
- `mangle.properties` reserved list can drift from reality if WIT changes and `extract-wit-names.mjs` isn't re-run. Mitigation: CI guard (Step A).
- Dynamic-import chunking depends on `externalizeSiblingModules`. If a refactor accidentally creates a static path from `index.ts` to a host file, the host gets pulled into the main bundle and inflates size silently — only the size-tolerance CI check would catch it.
