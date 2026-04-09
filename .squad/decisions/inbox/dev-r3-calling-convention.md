### 2026-04-08: R3 — Calling Convention Types

**By:** Dev
**What:** Created `src/resolver/calling-convention.ts` implementing canonical ABI size/alignment/flat-count calculations and function-level calling convention determination. Wired `determineFunctionCallingConvention` into `createFunctionLifting` (to-abi.ts) and `createFunctionLowering` (to-js.ts) — computed but not yet used to change runtime behavior.

**Design decisions:**
- `CallingConvention` enum has three values: `Scalar` (1 flat value), `Flat` (2..limit), `Spilled` (>limit)
- MAX_FLAT_PARAMS=16, MAX_FLAT_RESULTS=1 per canonical ABI spec
- All size/align/flatCount functions take `ResolverContext` to resolve type references through the R2 `resolvedTypes` map
- Discriminant sizing follows spec: 1 byte for ≤256 cases, 2 bytes for ≤65536, 4 bytes beyond

**Why:** Foundation for the binding layer to branch on flat vs spilled calling conventions when lifting/lowering function calls.
