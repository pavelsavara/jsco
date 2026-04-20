# Refactoring Plan: Extract Binder & Execute Layers

## Goal

Split `src/resolver/binding/` into two new top-level folders:
- **`src/binder/`** — bind-time code (runs once during `createComponent`): type resolution, plan construction, memoization
- **`src/marshal/`** — execution-time code (runs per WASM↔JS call): flat top-level functions with explicit plan structs

The key transformation: every `createXxxLifting`/`createXxxLowering` function currently returns a closure that captures local variables. We extract the closure body into a named top-level function, and the captured variables into an explicit "execution plan" data structure passed via `.bind(null, plan)`.

## Architecture Overview

```
src/binder/          ← NEW (bind-time, runs once)
  index.ts           ← public API: createLifting, createLowering, createFunctionLifting, createFunctionLowering
  to-abi.ts          ← createXxxLifting functions (produce LiftPlan + bound function)
  to-js.ts           ← createXxxLowering functions (produce LowerPlan + bound function)
  cache.ts           ← memoize() helper (moved from binding/)
  types.ts           ← LiftPlan, LowerPlan, FunctionLiftPlan, FunctionLowerPlan types

src/marshal/         ← NEW (execution-time, runs per call)
  lift.ts            ← top-level xxxLifting() functions (flat, no closures)
  lower.ts           ← top-level xxxLowering() functions (flat, no closures)
  memory-store.ts    ← top-level memory storer functions
  memory-load.ts     ← top-level memory loader functions
  trampoline-lift.ts ← liftingTrampoline, processWasmResult (extracted from createFunctionLifting)
  trampoline-lower.ts← loweringTrampoline (extracted from createFunctionLowering)
  validation.ts      ← validateAllocResult, validatePointerAlignment, etc. (moved from binding/)
  types.ts           ← WasmPointer, WasmValue, JsFunction, etc. (moved from binding/types.ts)

src/utils/
  shared.ts          ← _f32, _i32, canonicalNaN32, bigIntReplacer (moved from binding/shared.ts)
```

## Execution Plan Structs

### Lifting Plans (JS→WASM, to-abi)

```typescript
// Primitives — no plan needed (stateless), just direct function references

// Record
type RecordLiftPlan = { fields: { name: string, lifter: LiftingFromJs }[] }

// List  
type ListLiftPlan = { elemSize: number, elemAlign: number, elemStorer: MemoryStorer }

// Option
type OptionLiftPlan = { innerLifter: LiftingFromJs, totalSize: number }

// Result
type ResultLiftPlan = {
    okLifter?: LiftingFromJs, errLifter?: LiftingFromJs,
    totalSize: number, payloadJoined: FlatType[],
    okFlatTypes: FlatType[], errFlatTypes: FlatType[],
    okNeedsCoercion: boolean, errNeedsCoercion: boolean,
}

// Variant
type VariantLiftPlan = {
    totalSize: number, payloadJoined: FlatType[],
    nameToCase: Map<string, VariantCaseLiftPlan>,
}
type VariantCaseLiftPlan = {
    index: number, lifter?: LiftingFromJs,
    caseFlatTypes: FlatType[], needsCoercion: boolean,
}

// Enum
type EnumLiftPlan = { nameToIndex: Map<string, number> }

// Flags
type FlagsLiftPlan = { wordCount: number, memberNames: string[] }

// Tuple
type TupleLiftPlan = { elementLifters: LiftingFromJs[] }

// Own/Borrow resource
type ResourceLiftPlan = { resourceTypeIdx: number }

// String — encoding captured
type StringLiftPlan = { /* empty for utf8/utf16 — encoding chosen at create time */ }

// Function-level (trampoline)
type FunctionLiftPlan = {
    callingConvention: { params: CallingConvention, results: CallingConvention },
    paramLifters: LiftingFromJs[],   // for flat path
    paramStorers: MemoryStorer[],    // for spilled path
    resultLowerers: LoweringToJs[],  // for flat result
    resultLoader?: MemoryLoader,     // for spilled result
    spilledParamOffsets: number[],
    spilledParamsTotalSize: number,
    spilledParamsMaxAlign: number,
    totalFlatParams: number,
    i64ParamPositions: number[],
}
```

### Lowering Plans (WASM→JS, to-js)

```typescript
// Primitives — no plan needed

// Record  
type RecordLowerPlan = { fields: { name: string, lowerer: LoweringFn, spill: number }[], totalSpill: number }

// List
type ListLowerPlan = { elemSize: number, elemAlign: number, elemLoader: MemoryLoader, spill: 2 }

// Option
type OptionLowerPlan = { innerLowerer: LoweringFn, innerSpill: number, spill: number }

// Result
type ResultLowerPlan = {
    okLowerer?: LoweringFn, errLowerer?: LoweringFn,
    payloadJoined: FlatType[], totalSpill: number,
    okFlatTypes: FlatType[], errFlatTypes: FlatType[],
    okNeedsCoercion: boolean, errNeedsCoercion: boolean,
}

// Variant
type VariantLowerPlan = {
    cases: VariantCaseLowerPlan[], payloadJoined: FlatType[], totalSpill: number,
}

// Enum
type EnumLowerPlan = { members: string[], spill: 1 }

// Flags
type FlagsLowerPlan = { wordCount: number, memberNames: string[], spill: number }

// Tuple
type TupleLowerPlan = { elements: { lowerer: LoweringFn, spill: number }[], totalSpill: number }

// Own/Borrow resource
type ResourceLowerPlan = { resourceTypeIdx: number, spill: 1 }

// Function-level (trampoline)
type FunctionLowerPlan = {
    callingConvention: { params: CallingConvention, results: CallingConvention },
    paramLowerers: { fn: LoweringFn, spill: number }[],
    paramLoaders: MemoryLoader[],
    resultLifters: LiftingFromJs[],
    resultStorer?: MemoryStorer,
    spilledParamOffsets: number[],
    resultBuf: WasmValue[],
    resultIsI64: boolean,
}
```

### Memory Plans (Storer/Loader)

```typescript
// Memory Storer plans (writing JS→linear memory)
type PrimitiveStorerPlan = { kind: 'primitive', prim: PrimitiveValType, encoding?: StringEncoding }
type RecordStorerPlan = { kind: 'record', fields: { name: string, offset: number, storer: MemoryStorer }[] }
type ListStorerPlan = { kind: 'list', elemSize: number, elemAlign: number, elemStorer: MemoryStorer }
// ... etc for option, result, variant, enum, flags, tuple, own, borrow, stream, future, error-context

// Memory Loader plans (reading linear memory→JS)  
type PrimitiveLoaderPlan = { kind: 'primitive', prim: PrimitiveValType, encoding?: StringEncoding, usesNumberForInt64: boolean }
type RecordLoaderPlan = { kind: 'record', fields: { name: string, offset: number, loader: MemoryLoader }[] }
// ... etc
```

## Incremental Steps

Each step should be independently buildable and testable.

### Step 0: Preparation
- [ ] Move `shared.ts` → `src/utils/shared.ts`, update all imports
- [ ] Build + test

### Step 1: Create folder structure with re-exports
- [ ] Create `src/binder/` and `src/marshal/` folders
- [ ] Create `src/marshal/types.ts` — move `WasmPointer`, `WasmValue`, `JsFunction`, etc. from `binding/types.ts`
- [ ] Create `src/marshal/validation.ts` — move validation functions from `binding/validation.ts`
- [ ] Create `src/binder/cache.ts` — move `memoize()` from `binding/cache.ts`
- [ ] Update `src/resolver/binding/types.ts` to re-export from new locations (temporary shim)
- [ ] Update `src/resolver/binding/validation.ts` to re-export from new location
- [ ] Update `src/resolver/binding/cache.ts` to re-export from new location
- [ ] Build + test

### Step 2: Extract simple stateless lifting functions (to-abi primitives)
- [ ] Create `src/marshal/lift.ts` with top-level functions: `boolLifting`, `s8Lifting`, `u8Lifting`, `s16Lifting`, `u16Lifting`, `s32Lifting`, `u32Lifting`, `s64LiftingNumber`, `s64LiftingBigInt`, `u64LiftingNumber`, `u64LiftingBigInt`, `f32Lifting`, `f64Lifting`, `charLifting`
- [ ] These are trivial — no plan struct needed, just rename and make top-level
- [ ] Update `src/binder/to-abi.ts` (copy of old to-abi.ts) to return these directly
- [ ] Build + test

### Step 3: Extract string lifting functions
- [ ] Add `stringLiftingUtf8`, `stringLiftingUtf16` to `src/marshal/lift.ts`
- [ ] These are stateless (depend only on ctx), no plan needed
- [ ] Build + test

### Step 4: Extract simple stateless lowering functions (to-js primitives)
- [ ] Create `src/marshal/lower.ts` with top-level functions: `boolLowering`, `s8Lowering`, etc.
- [ ] Handle `spill` property — introduce `LoweringWithSpill = { fn: LoweringFn, spill: number }`
- [ ] Build + test

### Step 5: Extract string lowering functions
- [ ] Add `stringLoweringUtf8`, `stringLoweringUtf16` to `src/marshal/lower.ts`
- [ ] Build + test

### Step 6: Extract resource lifting/lowering (own, borrow)
- [ ] Define `ResourceLiftPlan = { resourceTypeIdx: number }`
- [ ] Extract `ownLifting(plan, ctx, ...)`, `borrowLifting(plan, ctx, ...)` to execute layer
- [ ] Same for lowering: `ownLowering(plan, ctx, ...)`, `borrowLowering(plan, ctx, ...)`
- [ ] Build + test

### Step 7: Extract enum/flags lifting/lowering
- [ ] Define `EnumLiftPlan`, `FlagsLiftPlan`, `EnumLowerPlan`, `FlagsLowerPlan`
- [ ] Extract functions to execute layer
- [ ] Build + test

### Step 8: Extract record lifting/lowering
- [ ] Define `RecordLiftPlan`, `RecordLowerPlan`
- [ ] Extract `recordLifting(plan, ctx, ...)`, `recordLowering(plan, ctx, ...)`
- [ ] Build + test

### Step 9: Extract tuple lifting/lowering
- [ ] Define `TupleLiftPlan`, `TupleLowerPlan`
- [ ] Extract functions
- [ ] Build + test

### Step 10: Extract list lifting/lowering
- [ ] Define `ListLiftPlan`, `ListLowerPlan`
- [ ] Extract functions
- [ ] Build + test

### Step 11: Extract option lifting/lowering
- [ ] Define `OptionLiftPlan`, `OptionLowerPlan`
- [ ] Extract functions
- [ ] Build + test

### Step 12: Extract result lifting/lowering
- [ ] Define `ResultLiftPlan`, `ResultLowerPlan` (includes coercion data)
- [ ] Extract `coerceFlatLift` and `coerceFlatLower` to execute layer
- [ ] Build + test

### Step 13: Extract variant lifting/lowering
- [ ] Define `VariantLiftPlan`, `VariantLowerPlan`
- [ ] Extract functions (most complex due to joined flat types + coercion)
- [ ] Build + test

### Step 14: Extract stream/future/error-context lifting/lowering
- [ ] These are mostly stateless (just handle table operations)
- [ ] Extract to execute layer
- [ ] Build + test

### Step 15: Extract memory storers
- [ ] Create `src/marshal/memory-store.ts`
- [ ] Extract primitive storers (stateless) and compound storers (with plans)
- [ ] Update `src/binder/to-abi.ts` `createMemoryStorer` to produce plan + bind
- [ ] Build + test

### Step 16: Extract memory loaders
- [ ] Create `src/marshal/memory-load.ts`
- [ ] Extract primitive loaders and compound loaders (with plans)
- [ ] Update `src/binder/to-js.ts` `createMemoryLoader` to produce plan + bind
- [ ] Build + test

### Step 17: Extract function lifting trampoline
- [ ] Define `FunctionLiftPlan` struct
- [ ] Extract `liftingTrampoline` and `processWasmResult` to `src/marshal/trampoline-lift.ts`
- [ ] `createFunctionLifting` in binder builds the plan and returns `liftingTrampoline.bind(null, plan)`
- [ ] Build + test

### Step 18: Extract function lowering trampoline
- [ ] Define `FunctionLowerPlan` struct
- [ ] Extract `loweringTrampoline` to `src/marshal/trampoline-lower.ts`
- [ ] Build + test

### Step 19: Move binder files to final location
- [ ] Move `to-abi.ts` → `src/binder/to-abi.ts` (if not already)
- [ ] Move `to-js.ts` → `src/binder/to-js.ts`
- [ ] Create `src/binder/index.ts` with public API
- [ ] Update all imports in `src/resolver/` to point to `src/binder/`
- [ ] Build + test

### Step 20: Move test files
- [ ] Move binder-focused tests to `src/binder/`
- [ ] Move execution-focused tests to `src/marshal/`
- [ ] Update all test imports
- [ ] Build + test

### Step 21: Delete old binding folder
- [ ] Remove `src/resolver/binding/` (already moved/deleted all files)
- [ ] Final build + full test suite
- [ ] Lint check

### Step 22: Alloc validation need to be pre-alloc too

### Step 23: trim in postReturnFn release build



## Function Inventory

### to-abi.ts (Lifting: JS → WASM flat args)

| Current Function | Binder (creates plan) | Execute (top-level fn) | Plan Struct |
|---|---|---|---|
| `createBoolLifting()` | `createBoolLifting()` | `boolLifting()` | none |
| `createS8Lifting()` | `createS8Lifting()` | `s8Lifting()` | none |
| `createU8Lifting()` | `createU8Lifting()` | `u8Lifting()` | none |
| `createS16Lifting()` | `createS16Lifting()` | `s16Lifting()` | none |
| `createU16Lifting()` | `createU16Lifting()` | `u16Lifting()` | none |
| `createS32Lifting()` | `createS32Lifting()` | `s32Lifting()` | none |
| `createU32Lifting()` | `createU32Lifting()` | `u32Lifting()` | none |
| `createS64LiftingNumber()` | returns `s64LiftingNumber` | `s64LiftingNumber()` | none |
| `createS64LiftingBigInt()` | returns `s64LiftingBigInt` | `s64LiftingBigInt()` | none |
| `createU64LiftingNumber()` | returns `u64LiftingNumber` | `u64LiftingNumber()` | none |
| `createU64LiftingBigInt()` | returns `u64LiftingBigInt` | `u64LiftingBigInt()` | none |
| `createF32Lifting()` | returns `f32Lifting` | `f32Lifting()` | none |
| `createF64Lifting()` | returns `f64Lifting` | `f64Lifting()` | none |
| `createCharLifting()` | returns `charLifting` | `charLifting()` | none |
| `createStringLiftingUtf8()` | returns `stringLiftingUtf8` | `stringLiftingUtf8()` | none |
| `createStringLiftingUtf16()` | returns `stringLiftingUtf16` | `stringLiftingUtf16()` | none |
| `createRecordLifting()` | builds `RecordLiftPlan` | `recordLifting(plan, ...)` | `{ fields: {name, lifter}[] }` |
| `createListLifting()` | builds `ListLiftPlan` | `listLifting(plan, ...)` | `{ elemSize, elemAlign, elemStorer }` |
| `createOptionLifting()` | builds `OptionLiftPlan` | `optionLifting(plan, ...)` | `{ innerLifter, totalSize }` |
| `createResultLifting()` | builds `ResultLiftPlan` | `resultLifting(plan, ...)` | `{ okLifter?, errLifter?, totalSize, coercion... }` |
| `createVariantLifting()` | builds `VariantLiftPlan` | `variantLifting(plan, ...)` | `{ nameToCase, totalSize, coercion... }` |
| `createEnumLifting()` | builds `EnumLiftPlan` | `enumLifting(plan, ...)` | `{ nameToIndex }` |
| `createFlagsLifting()` | builds `FlagsLiftPlan` | `flagsLifting(plan, ...)` | `{ wordCount, memberNames }` |
| `createTupleLifting()` | builds `TupleLiftPlan` | `tupleLifting(plan, ...)` | `{ elementLifters }` |
| `createOwnLifting()` | builds `ResourceLiftPlan` | `ownLifting(plan, ...)` | `{ resourceTypeIdx }` |
| `createBorrowLifting()` | builds plan | `borrowLifting(plan, ...)` / `borrowLiftingDirect(plan, ...)` | `{ resourceTypeIdx }` |
| `createStreamLifting()` | returns `streamLifting` | `streamLifting()` | none |
| `createFutureLifting()` | builds plan | `futureLifting(plan, ...)` | `{ storer? }` |
| `createErrorContextLifting()` | returns `errorContextLifting` | `errorContextLifting()` | none |
| `createFunctionLifting()` | builds `FunctionLiftPlan` | `liftingTrampoline(plan, ctx, wasmFn, ...args)` | complex struct |

### to-js.ts (Lowering: WASM → JS values)

| Current Function | Binder (creates plan) | Execute (top-level fn) | Plan Struct |
|---|---|---|---|
| `createBoolLowering()` | returns `{ fn: boolLowering, spill: 1 }` | `boolLowering()` | none |
| `createS8Lowering()` | similar | `s8Lowering()` | none |
| ... (all primitives) | similar | similar | none |
| `createRecordLowering()` | builds `RecordLowerPlan` | `recordLowering(plan, ...)` | `{ fields, totalSpill }` |
| `createListLowering()` | builds `ListLowerPlan` | `listLowering(plan, ...)` | `{ elemSize, elemAlign, elemLoader }` |
| `createOptionLowering()` | builds plan | `optionLowering(plan, ...)` | `{ innerLowerer, innerSpill }` |
| `createResultLowering()` | builds plan | `resultLowering(plan, ...)` | `{ okLowerer?, errLowerer?, coercion... }` |
| `createVariantLowering()` | builds plan | `variantLowering(plan, ...)` | `{ cases[], coercion... }` |
| `createEnumLowering()` | builds plan | `enumLowering(plan, ...)` | `{ members }` |
| `createFlagsLowering()` | builds plan | `flagsLowering(plan, ...)` | `{ wordCount, memberNames }` |
| `createTupleLowering()` | builds plan | `tupleLowering(plan, ...)` | `{ elements[] }` |
| `createOwnLowering()` | builds `ResourceLowerPlan` | `ownLowering(plan, ...)` | `{ resourceTypeIdx }` |
| `createBorrowLowering()` | builds plan | `borrowLowering(plan, ...)` | `{ resourceTypeIdx }` |
| `createStreamLowering()` | returns fn | `streamLowering()` | none |
| `createFutureLowering()` | returns fn | `futureLowering()` | none |
| `createErrorContextLowering()` | returns fn | `errorContextLowering()` | none |
| `createFunctionLowering()` | builds `FunctionLowerPlan` | `loweringTrampoline(plan, ctx, jsFn, ...args)` | complex struct |

### Memory Storers (createMemoryStorer → memory-store.ts)

Similar pattern: `createXxxStorer` in binder builds plan, `xxxStorer(plan, ctx, ptr, val)` in execute.

### Memory Loaders (createMemoryLoader → memory-load.ts)

Similar pattern: `createXxxLoader` in binder builds plan, `xxxLoader(plan, ctx, ptr)` in execute.

## Key Design Decisions

1. **`.bind(null, plan)` pattern**: Each `createXxx` function in the binder returns `xxxFn.bind(null, plan)` where `plan` is a plain object with pre-computed data. The execute-layer function signature is `(plan: XxxPlan, ctx: BindingContext, ...originalArgs)`.

2. **Spill becomes structural**: Instead of `fn.spill = N`, lowering functions return `{ fn: LoweringFn, spill: number }` or the plan struct includes `spill`.

3. **No closure captures in execute layer**: All execute-layer functions must be pure top-level functions. The only "state" they receive is via the plan parameter.

4. **Recursive plans**: For compound types (record, list, option, etc.), the plan contains references to child lifters/lowerers that are themselves bound functions. This preserves the recursive composition without closures.

5. **Memoization stays in binder**: The `memoize()` cache operates at the binder level. Execute functions are stateless.

## File Movement Summary

```
FROM                                    → TO
src/resolver/binding/to-abi.ts          → src/binder/to-abi.ts (createXxx stays, lambdas extracted)
src/resolver/binding/to-js.ts           → src/binder/to-js.ts (same)
src/resolver/binding/cache.ts           → src/binder/cache.ts
src/resolver/binding/types.ts           → src/marshal/types.ts
src/resolver/binding/validation.ts      → src/marshal/validation.ts
src/resolver/binding/shared.ts          → src/utils/shared.ts
src/resolver/binding/index.ts           → src/binder/index.ts
src/resolver/binding/test-helpers.ts    → src/marshal/test-helpers.ts (or binder/)
(new)                                   → src/marshal/lift.ts
(new)                                   → src/marshal/lower.ts
(new)                                   → src/marshal/memory-store.ts
(new)                                   → src/marshal/memory-load.ts
(new)                                   → src/marshal/trampoline-lift.ts
(new)                                   → src/marshal/trampoline-lower.ts
(new)                                   → src/binder/types.ts (plan structs)

Test files:
src/resolver/binding/primitives.test.ts     → src/marshal/primitives.test.ts
src/resolver/binding/compound-types.test.ts → src/marshal/compound-types.test.ts
src/resolver/binding/canonical-abi.test.ts  → src/marshal/canonical-abi.test.ts
src/resolver/binding/edge-cases.test.ts     → src/marshal/edge-cases.test.ts
src/resolver/binding/spilling.test.ts       → src/marshal/spilling.test.ts
src/resolver/binding/resources.test.ts      → src/marshal/resources.test.ts
src/resolver/binding/validation.test.ts     → src/marshal/validation.test.ts
src/resolver/binding/shared.test.ts         → src/utils/shared.test.ts
src/resolver/binding/cache.test.ts          → src/binder/cache.test.ts
src/resolver/binding/memoization.test.ts    → src/binder/memoization.test.ts
src/resolver/binding/function-imports.test.ts → stays in src/resolver/ (tests resolver logic)
```
