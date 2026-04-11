# Component Model Resolution Algorithm

This document describes how jsco resolves a parsed WebAssembly Component into executable JavaScript bindings. The algorithm has four phases: **Parse**, **Resolve**, **Bind**, and **Execute**.

## Overview

```
Binary WASM Component
        │
    ┌───▼───┐
    │ Parse │   Decode binary sections → WITModel (tagged elements)
    └───┬───┘   Compile core WASM modules (async)
        │
    ┌───▼───┐
    │Resolve│   Populate index spaces → Build canonical IDs → Create binding plan
    └───┬───┘   Pre-compile lifting/lowering trampolines (cached)
        │
    ┌───▼───┐
    │ Bind  │   Execute plan: wire JS imports → instantiate WASM → wrap exports
    └───┬───┘
        │
    ┌───▼───┐
    │Execute│   JS calls exported function →
    └───────┘   lifting trampoline → WASM → lowering trampoline → JS result
```

The key architectural insight is a **two-stage compilation model**: resolution pre-compiles everything possible (trampolines, type layouts, calling conventions) so that binding and execution are fast. Binder closures are lazy — they capture what they need during resolution but execute only at instantiation time.

---

## Phase 1: Parse

The parser reads the binary WebAssembly Component format and produces a `WITModel` — an array of tagged `WITSection` elements. Each element has a `ModelTag` discriminating its kind (e.g., `CoreModule`, `ComponentImportFunc`, `ComponentTypeRecord`, `CanonicalFunctionLift`).

Core WASM modules embedded in the component are compiled asynchronously via `WebAssembly.compile()` during parsing. This allows compilation to overlap with subsequent resolution work.

The parser output is a flat list of sections in binary order. It does not resolve references or build index spaces — that is the resolver's job.

---

## Phase 2: Resolve

### 2.1 Create the Resolver Context

`createResolverContext` builds the central context (`rctx`) from the parsed model. This context holds:

- **13 index spaces** — typed arrays that map sort indices to model elements
- **`resolvedTypes`** — map from type index to deep-resolved type info
- **`canonicalResourceIds`** — map from type index to canonical resource type ID
- **`liftingCache` / `loweringCache`** — memoize compiled trampolines

### 2.2 Populate Index Spaces

The parsed sections are partitioned into 13 index spaces, each representing one "sort" in the Component Model spec:

| Sort | Array | Contents |
|------|-------|----------|
| Core Module | `coreModules` | Compiled `WebAssembly.Module` objects |
| Core Instance | `coreInstances` | Core module instantiations and alias composites |
| Core Function | `coreFunctions` | Core exports, canon.lower, resource.drop/new/rep |
| Core Memory | `coreMemories` | Memory aliases (usually 1) |
| Core Table | `coreTables` | Table aliases |
| Core Global | `coreGlobals` | Global aliases |
| Component Type | `componentTypes` | All type definitions: func, record, list, variant, resource, alias, etc. |
| Component Function | `componentFunctions` | Imported, aliased, and lifted functions |
| Component Instance | `componentInstances` | Typed instances, nested component instantiations, aliases |
| Component Section | `componentSections` | Nested components (COMPONENT sort ≠ TYPE sort) |
| Component Import | `componentImports` | Func, instance, and type imports from JS host |
| Component Export | `componentExports` | Func and instance exports to JS host |
| Component TypeResource | `componentTypeResource` | Separate tracking for resource type definitions |

Each element is appended in binary order. The index in each array IS the sort index used by references from other elements.

### 2.3 Build Canonical Resource IDs

Multiple type aliases can refer to the same underlying resource (e.g., `wasi:io/streams.output-stream` aliased from multiple instance exports). The `canonicalResourceIds` map unifies them.

**Algorithm** (`buildCanonicalResourceIds`):

1. For each type index `i` in `componentTypes`:
   - If `ComponentTypeResource` → identity: `map[i] = i`
   - If `ComponentAliasInstanceExport` of kind Type → group by `(instance_index, export_name)`
     - First alias with this key → `map[i] = i` (becomes the canonical representative)
     - All later aliases to the same `(instance, name)` → `map[i] = first_alias_idx`

**Result**: All aliases to the same resource instance export converge to one canonical ID. The resource table uses this canonical ID to enforce type isolation — a handle created for resource type A cannot be retrieved as resource type B.

### 2.4 Resolve Types

`resolvedTypes` maps each type index to a `ResolvedType` — a concrete, fully-dereferenced type. This is built in stages:

1. **Initial resolution**: Follow alias chains (instance export aliases, outer aliases) to reach concrete types (records, lists, primitives, functions).
2. **Deep resolution** (`deepResolveType`): Recursively replace all `ComponentValTypeType(index)` placeholders with `ComponentValTypeResolved(concreteType)`. This processes record fields, list elements, option/result payloads, variant cases, tuple members, and function params/results.

After deep resolution, call-time code uses `resolveValTypePure()` which requires no context lookup — everything is inlined in the type structure.

### 2.5 Build the Binding Plan

The resolver walks imports, core instances, and exports to produce a `PlanOp[]` array — an intermediate representation of the instantiation work:

| PlanOp Kind | What it does | Created by |
|---|---|---|
| `ImportBind` | Wire a JS import to a component import slot | `resolveComponentImport` |
| `CoreInstantiate` | Instantiate a core WASM module with imports | `resolveCoreInstance` |
| `ExportBind` | Wrap a WASM export as a JS function/object | `resolveComponentExport` |

Each op carries:
- `kind` — phase discriminant
- `resolution` — a `ResolverRes` containing a lazy **binder closure** (executes at instantiation time, not resolution time)
- `label` — debug string for verbose logging

The plan is sorted: ImportBind → CoreInstantiate → ExportBind. This guarantees imports are available before WASM instantiation, and WASM functions exist before export wrapping.

### 2.6 Instance-Local Type Isolation

When resolving a `canon.lower` that targets a function exported from an instance, the function type references local type indices (0, 1, 2...) that are meaningful only within that instance's type scope.

**`registerInstanceLocalTypes`** builds a temporary local→global mapping and rewrites own/borrow type references:

1. **Phase 1**: Iterate instance type declarations. Build `localTypes[]` (local index → model element) and `localResolvedTypes` (local index → resolved type).

2. **Phase 2a**: For each `TypeBoundsSubResource` export in the instance declarations, record its canonical resource ID in a `localCanonicalIds` map.

3. **Phase 2b**: For each own/borrow type in `localTypes`, rewrite `.value` from local type index to the canonical resource ID found in `localCanonicalIds`. A `fixedUpOwnBorrow` WeakSet prevents double-fixup when the same instance type is processed multiple times (since the same model objects are shared).

4. **Temporarily overwrite** `resolvedTypes` entries with the local versions so that `createFunctionLowering` deep-resolves against local types.

5. **Restore** original `resolvedTypes` entries after the lowering is compiled. This prevents local types from polluting the global type map used by subsequent export resolution.

### 2.7 Resolve Core Functions

Core functions appear in the `coreFunctions` index space. They come from several sources:

- **`ComponentAliasCoreInstanceExport`**: A direct export from a core WASM instance (e.g., a function named `"memory"` or `"cabi_realloc"`).
- **`CanonicalFunctionLower`**: A lowering trampoline — wraps a component-level function (JS) as a core WASM import. This is where `registerInstanceLocalTypes` + `createFunctionLowering` produce the actual JS→WASM adapter.
- **`CanonicalFunctionResourceDrop/New/Rep`**: Synthetic handlers for resource lifecycle operations. These interact with the resource table to create, drop, or get the representation of resource handles.

### 2.8 Resolve Component Functions

Component functions come from:

- **`ComponentImport`**: Direct import from JS host — the function is passed in at instantiation time.
- **`ComponentAliasInstanceExport`**: Aliased from a component instance's exports — resolved by looking up the instance and extracting the named export.
- **`CanonicalFunctionLift`**: A lifting trampoline — wraps a core WASM function as a component-level function. The lifting code converts WASM return values to JS types.

### 2.9 Resolve Component Instances

- **`ComponentInstanceInstantiate`**: Instantiate a nested component with supplied arguments. Creates a scoped resolver context with its own index spaces, resolved types, and canonical resource IDs. Runs all three binding phases within the scoped context.
- **`ComponentInstanceFromExports`**: Bundle component functions and sub-instances into a single exports object.
- **`ComponentAliasInstanceExport`**: Extract a named export from a parent instance, following alias chains.

### 2.10 Cleanup After Resolution

After building the plan, the resolver nulls index space arrays to allow GC. The `resolved` context (containing `resolvedTypes`, `canonicalResourceIds`, caches) survives for binding and multi-instantiation reuse.

---

## Phase 3: Bind (Instantiation)

`executePlan` runs the binding plan in three phases:

1. **Phase 1 — ImportBind** (parallel): Execute all import binders. Each binder looks up the JS import by name (with synthetic prefix stripping and camelCase conversion), validates it, and stores it in the binding context.

2. **Phase 2 — CoreInstantiate** (sequential): Execute all core instantiation binders. Each:
   - Collects `wasmImports` from previously-resolved import bindings
   - Calls `WebAssembly.instantiate(module, imports)`
   - Extracts `memory` and `cabi_realloc` from exports
   - Initializes the allocator (`MemoryView`) for string/list marshaling
   - Caches the core instance for dedup

3. **Phase 3 — ExportBind** (parallel): Execute all export binders. Each wraps a WASM function with its pre-compiled lifting trampoline and exposes it on the component's JS exports object.

The binding context (`bctx`) holds per-instantiation state: core instance caches, the resource table, memory views, and the allocator.

---

## Phase 4: Execute (Call Time)

When JS calls an exported function:

1. **Lowering** (JS args → WASM): Each JS argument is converted to its flat representation using pre-compiled lowerers.
2. **WASM call**: The core function executes.
3. **Lifting** (WASM results → JS): Return values are converted back to JS types using pre-compiled lifters.

### Calling Conventions

The calling convention determines how composite types are passed:

| Convention | When | How |
|---|---|---|
| **Scalar** | 1 flat value | Single register (i32/i64/f32/f64) |
| **Flat** | ≤16 params or ≤1 result | Spread as separate function arguments |
| **Spilled** | >16 params or >1 result | Allocate memory via `cabi_realloc`, pass pointer |

Decision logic:
- **Params**: 0 → Flat, 1 → Scalar, ≤16 → Flat, >16 → Spilled
- **Results**: 0 → Flat, 1 → Scalar, ≤1 → Flat, >1 → Spilled

### Type Marshaling Examples

| WIT Type | JS Representation | Flat Type(s) |
|---|---|---|
| `bool` | `true`/`false` | 1 × i32 |
| `u32` | `number` | 1 × i32 |
| `s64` | `BigInt` or `number` | 1 × i64 |
| `f64` | `number` | 1 × f64 |
| `string` | `string` | 2 × i32 (ptr, len) |
| `list<T>` | `Array` | 2 × i32 (ptr, len) |
| `option<T>` | `T \| null` | 1 × i32 (discriminant) + payload |
| `result<T, E>` | `{ tag: 'ok', val } \| { tag: 'err', val }` | 1 × i32 (discriminant) + payload |
| `record { fields }` | `{ field1, field2, ... }` | concatenated flat fields |
| `variant { cases }` | `{ tag, val }` | 1 × i32 (discriminant) + max(case sizes) |
| `enum` | `string` | 1 × i32 |
| `flags` | `{ flag1: bool, ... }` | N × i32 (1 word per 32 flags) |
| `own<T>` / `borrow<T>` | `ResourceHandle` wrapper | 1 × i32 (handle index) |

### Resource Lifecycle

Resources are tracked in a `ResourceTable` keyed by canonical resource ID:

- **`resource.new`**: Insert a JS representation into the table, get an integer handle back.
- **`resource.rep`**: Look up a handle, return the JS representation (with type check).
- **`resource.drop`**: Remove a handle from the table (with optional destructor call).

The canonical resource ID ensures type safety: a handle created for `descriptor` (canonical ID 16) cannot be used where `output-stream` (canonical ID 7) is expected.

---

## Scoped Contexts for Nested Components

When a component contains nested components (`ComponentSection`), each gets its own resolver context via `createScopedResolverContext`:

- Own 13 index spaces populated from nested sections
- Own `resolvedTypes` and `canonicalResourceIds`
- Own lifting/lowering caches
- Inherits `verbose` and `logger` from parent

At binding time, a separate `BindingContext` is created with isolated instance caches and resource tables. This prevents handle collisions between parent and child components.

---

## Memoization

Two caches survive across multiple instantiations of the same component:

- **`liftingCache`**: `Map<typeModel, lifterFactory>` — one lifter per unique type shape
- **`loweringCache`**: `Map<typeModel, lowererFactory>` — one lowerer per unique type shape

After the first instantiation, `resolvedTypes` and `canonicalResourceIds` can be GC'd. The caches contain pre-compiled trampolines that already have all type information baked in. Subsequent instantiations skip resolution entirely and reuse cached trampolines.

## See also
https://github.com/bytecodealliance/wasm-tools/blob/main/crates/wit-component/src/decoding.rs
https://github.com/bytecodealliance/wasm-tools/blob/main/crates/wit-component/src/linking.rs
https://github.com/bytecodealliance/jco/blob/main/crates/js-component-bindgen/src/function_bindgen.rs
