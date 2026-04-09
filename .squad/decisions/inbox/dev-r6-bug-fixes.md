### 2026-04-08: R6 Resolver Bug Fixes
**By:** Dev
**What:** Fixed 4 resolver bugs blocking components more complex than hello:
1. **core-functions.ts** — Dynamic function type resolution via `resolveLoweredFuncType()` replaces hardcoded `componentInstances[0].declarations[2]` lookup. Follows `CanonicalFunctionLift.type_index` or traces `ComponentAliasInstanceExport` through instance declarations.
2. **component-functions.ts + component-imports.ts** — Unified import/export semantics: user-imported functions are now stored in `.exports` on the instance data (matching Component Model semantics), and `ComponentAliasInstanceExport` consistently reads from `.exports`.
3. **component-imports.ts** — Documented the `selfSortIndex` → instance index alignment assumption. Works for single-import components; needs validation for multi-import.
4. **component-instances.ts** — Enabled `ComponentInstanceFromExports` resolver (was commented out).
**Why:** These fixes are required for zoo and any component with multiple imports, multiple function types, or component instances built from exports.
