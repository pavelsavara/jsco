### 2026-04-08: R4 — Decompose BindingContext
**By:** Dev
**What:** Split monolithic `BindingContext` into `InstanceTable`, `MemoryView`, and `Allocator` sub-types. Each has its own factory and closure state. `BindingContext` now composes them as `instances`, `memory`, `allocator` properties.
**Why:** Cleaner separation of concerns — memory ops, allocation, and instance tracking are independent. Makes future multi-memory and per-component allocator support straightforward. Zero runtime behavior change; all 11 tests pass.
