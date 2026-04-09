### 2026-04-08: R5 — Explicit Instantiation Plan
**By:** Dev
**What:** Introduced `PlanOp[]` intermediate representation between resolution and execution. `createComponent()` now builds an inspectable plan of operations (CoreInstantiate, ImportBind, ExportBind), each wrapping the existing `ResolverRes`. Plan is sorted for correct execution order (imports → exports → core instances) and exposed on `WasmComponent.plan` for debugging. Execution delegated to new `executePlan()` in `binding-plan.ts`.
**Why:** Opaque closure trees were not inspectable or validatable. The plan IR enables future plan validation, dependency checking, and eventual closure elimination — while preserving all current behavior (11/11 tests pass).
