# Integration Tests

End‑to‑end tests for the jsco WebAssembly Component Model runtime.
Three Rust components (consumer, forwarder, implementer) are combined
in 11 topologies (A–K) to exercise parsing, resolution, binding and
execution of components, compositions, and resource lifecycle.

## Components

| Component     | Target                    | Role                                                     |
|---------------|---------------------------|----------------------------------------------------------|
| **consumer**  | `wasm32-wasip1`           | Runs tests, prints `[PASS]`/`[FAIL]` lines to stdout    |
| **forwarder** | `wasm32-wasip1`           | Pass-through proxy: imports → exports with logging       |
| **implementer** | `wasm32-unknown-unknown` | Deterministic fakes for all exported interfaces          |

## Interfaces

```
jsco:test@0.1.0
├── logger            log(level, msg), structured-log(level, msg, props)
├── counter           resource counter { new(name), increment, get → u64 }
├── echo-primitives   13 echo funcs: bool, u8–u64, s8–s64, f32, f64, char, string
├── echo-compound     records, tuples, lists, options, results
├── echo-algebraic    enums, flags, variants
├── echo-complex      deeply nested records, list-of-records, tuple-of-records,
│                     complex variants (geometry, message), kitchen-sink, nested lists
└── echo-resources    resource accumulator { new, add, get-total, snapshot }
                      resource byte-buffer { new, read, remaining, is-empty }
                      transform-owned, inspect-borrowed, merge-accumulators, echo-buffer
```

## Scenarios

### A – Direct consumer (no forwarder, no composition)

```
 ┌──────────┐      JS host provides
 │ consumer │ ───► WASI + logger + counter
 └──────────┘      + echo-* (identity)
```

Consumer wasm loaded directly, JS host supplies all imports.

### B – Consumer + forwarder (flat, JS host behind both)

```
 ┌──────────┐      ┌───────────┐      JS host provides
 │ consumer │ ───► │ forwarder │ ───► WASI + echo-*
 └──────────┘      └───────────┘
```

Forwarder instantiated first, its exports wired as consumer imports.
JS host supplies WASI + echo to both, plus logger + counter to consumer.

### C – Consumer + implementer (no forwarder)

```
 ┌──────────┐      ┌─────────────┐
 │ consumer │ ───► │ implementer │   (deterministic fakes)
 └──────────┘      └─────────────┘
```

Implementer exports wired to consumer. JS supplies WASI + logger + counter.

### D – Consumer + forwarder + implementer (flat, 3 JS instantiations)

```
 ┌──────────┐      ┌───────────┐      ┌─────────────┐
 │ consumer │ ───► │ forwarder │ ───► │ implementer │
 └──────────┘      └───────────┘      └─────────────┘
```

Three separate instantiations wired together in JS.

### E – Wrapped forwarder (WAC: forwarder wrapped in outer component)

```
 ┌──────────┐      ┌──────────────────────────┐
 │ consumer │ ───► │ WAC: wrapped-forwarder   │
 └──────────┘      │  ┌───────────┐           │
                   │  │ forwarder │ ──► ...   │
                   │  └───────────┘           │
                   └──────────────────────────┘
```

WAC `compose` wraps the forwarder into a new component.
Consumer sees a single component.

### F – Double forwarder (WAC: two forwarders, flat)

```
 ┌──────────┐      ┌─────────────────────────────────────┐
 │ consumer │ ───► │ WAC: double-forwarder               │
 └──────────┘      │  ┌───────┐      ┌───────┐           │
                   │  │ outer │ ───► │ inner │ ──► ...   │
                   │  └───────┘      └───────┘           │
                   └─────────────────────────────────────┘
```

Two copies of the forwarder component, flat composition.

### G – Nested double forwarder (WAC: wrapped-forwarder + outer forwarder)

```
 ┌──────────┐      ┌──────────────────────────────────────────────┐
 │ consumer │ ───► │ WAC: nested-double-forwarder                 │
 └──────────┘      │  ┌───────┐      ┌──────────────────────┐     │
                   │  │ outer │ ───► │ wrapped-forwarder    │     │
                   │  └───────┘      │  ┌───────┐           │     │
                   │                 │  │ inner │ ──► ...   │     │
                   │                 │  └───────┘           │     │
                   │                 └──────────────────────┘     │
                   └──────────────────────────────────────────────┘
```

Nested composition: inner forwarder pre-wrapped, then outer applied.

### H – Forwarder + implementer (WAC)

```
 ┌──────────┐      ┌───────────────────────────────────────────┐
 │ consumer │ ───► │ WAC: forwarder-implementer                │
 └──────────┘      │  ┌───────────┐      ┌─────────────┐       │
                   │  │ forwarder │ ───► │ implementer │       │
                   │  └───────────┘      └─────────────┘       │
                   └───────────────────────────────────────────┘
```

WAC wires implementer exports to forwarder imports (WASI + echo).

### I – Double forwarder + implementer (WAC: impl + inner + outer, flat)

```
 ┌──────────┐      ┌──────────────────────────────────────────────────────────┐
 │ consumer │ ───► │ WAC: double-forwarder-implementer                        │
 └──────────┘      │  ┌───────┐      ┌───────┐      ┌─────────────┐           │
                   │  │ outer │ ───► │ inner │ ───► │ implementer │           │
                   │  └───────┘      └───────┘      └─────────────┘           │
                   └──────────────────────────────────────────────────────────┘
```

Three components in flat WAC composition.

### J – Nested forwarder + implementer (WAC: forwarder-implementer + outer)

```
 ┌──────────┐      ┌─────────────────────────────────────────────────────┐
 │ consumer │ ───► │ WAC: nested-forwarder-implementer                   │
 └──────────┘      │  ┌───────┐      ┌────────────────────────────┐      │
                   │  │ outer │ ───► │ forwarder-implementer      │      │
                   │  └───────┘      │  ┌───────┐  ┌─────────┐    │      │
                   │                 │  │  fwd  │─►│  impl   │    │      │
                   │                 │  └───────┘  └─────────┘    │      │
                   │                 └────────────────────────────┘      │
                   └─────────────────────────────────────────────────────┘
```

Nested: inner forwarder+implementer pre-composed, then outer forwarder added.

### K – Consumer + forwarder (WAC) + implementer (flat, 3 instantiations)

```
 ┌──────────┐      ┌──────────────────────────┐      ┌─────────────┐
 │ consumer │ ───► │ WAC: wrapped-forwarder   │ ───► │ implementer │
 └──────────┘      │  ┌───────────┐           │      └─────────────┘
                   │  │ forwarder │ ──► ...   │
                   │  └───────────┘           │
                   └──────────────────────────┘
```

Mixed: implementer instantiated in JS, wired to WAC-composed forwarder,
which is then wired to consumer.

## Build Pipeline

```bash
# 1. Build Rust components
npm run build:integration
#    → cargo component build --release --target wasm32-wasip1
#    → cargo component build --release -p implementer --target wasm32-unknown-unknown

# 2. Compose components with WAC
npm run build:compositions
#    → wac compose × 6 (wrapped-forwarder, double-forwarder, nested-double-forwarder,
#       forwarder-implementer, double-forwarder-implementer, nested-forwarder-implementer)

# 3. Run integration tests
npm run test:integration
#    → jest --testPathPattern integration
```

## Echo Interfaces Coverage

| Interface          | Functions | Types tested                                                     |
|--------------------|-----------|------------------------------------------------------------------|
| echo-primitives    | 13        | bool, u8–u64, s8–s64, f32, f64, char, string                    |
| echo-compound      | 10        | tuple, record, nested record, list, option, result               |
| echo-algebraic     | 3         | enum, flags, variant                                             |
| echo-complex       | 10        | deeply nested records, list-of-records, tuple-of-records,        |
|                    |           | complex variants (geometry), messages, kitchen-sink,             |
|                    |           | nested lists, option/result of records, list of variants         |
| echo-resources     | 4+methods | own/borrow resources (accumulator, byte-buffer),                 |
|                    |           | transform-owned, inspect-borrowed, merge, echo-buffer            |
