# jsco Copilot Instructions

## Coding Conventions

- **Always add the MIT license banner** as the very first line of every new `.ts`, `.js`, or `.mjs` file: `// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.` followed by a blank line before any imports or code.
- **Always use numeric `const enum`** — never string-valued enum members. Numeric enums inline to integer literals in the bundle, saving significant minified code size. String enums emit string comparisons and string literals that cannot be minified.
- **Never use inline `import()` for types** — always use top-level `import` or `import type` statements. Inline `import('...').SomeType` in type annotations is prohibited; add the type to an existing top-level import (or create a new `import type` line) instead.

## Testing

- **Always run tests with `--experimental-vm-modules --experimental-wasm-jspi`** — Jest requires `--experimental-vm-modules` to load ESM-only node_modules (like `@bytecodealliance/jco`) as native ESM. WASI tests require `--experimental-wasm-jspi`. Use `npm run test:ci` or `node --experimental-vm-modules --experimental-wasm-jspi node_modules/jest-cli/bin/jest.js` on Windows. Never use bare `npx jest` — it won't pass the Node flags.
- **`transformIgnorePatterns`** excludes `@bytecodealliance/` from SWC transformation. ESM packages using `import.meta` break when SWC converts them to CJS. If adding new ESM-only deps that use `import.meta`, add them to `transformIgnorePatterns` in `jest.config.js`.

## Verbose Logging & Debugging

jsco has a phase-specific verbose logging system. All logging is guarded by `isDebug` and tree-shaken in Release builds.

### Phases and what they log

| Phase | LogLevel.Summary | LogLevel.Detailed |
|-------|-----------------|-------------------|
| `parser` | WAT-like dump of the parsed component model (types, imports, exports, instances, aliases, canonicals) | — |
| `resolver` | Index space population summary (13 arrays with counts), binding plan (numbered ops with kind/label), canonicalResourceIds map | Instance-local type registration: which instance, local→canonical ID mappings, own/borrow fixups applied |
| `binder` | Per-function lifting/lowering info: param names, counts, calling convention, flat params, spilled size. Type chain breadcrumbs: canon.lift/lower → component function → ComponentTypeFunc | Cache hit/miss for lifting/lowering function compilation (diagnose unnecessary recompilation) |
| `executor` | Trampoline args/results on every lift/lower call (JSON-serialized, BigInt-safe) | Per-plan-op execution trace (logs each `ImportBind`/`CoreInstantiate`/`ExportBind` as it runs). Resource table operations: every `resource.add`/`resource.get`/`resource.remove` with typeIdx and handle |

### Using verbose in tests

Import from `src/test-utils/verbose-logger.ts`:

```typescript
import { useVerboseOnFailure, verboseOptions, runWithVerbose } from '../../test-utils/verbose-logger';

describe('my suite', () => {
    const verbose = useVerboseOnFailure();

    test('my test', () => runWithVerbose(verbose, async () => {
        const component = await createComponent(wasm, verboseOptions(verbose));
        const instance = await component.instantiate(imports);
        // assertions...
    }));
});
```

- `useVerboseOnFailure()` — call in `describe()`. Creates a per-test message buffer, clears before each test.
- `verboseOptions(verbose)` — returns `{ verbose, logger }` fields for `createComponent()` or `instantiateWasiComponent()` options.
- `runWithVerbose(verbose, fn)` — wraps test body; on thrown error, dumps captured messages then re-throws.
- Custom levels: `verboseOptions(verbose, { executor: LogLevel.Detailed })` to override specific phases.

### Using verbose in scripts / programmatic use

```typescript
import { createComponent, setLogger, LogLevel } from '@pavelsavara/jsco';

setLogger((phase, level, ...args) => console.log(`[${phase}]`, ...args));

const component = await createComponent(wasmSource, {
    verbose: { parser: 1, resolver: 1, binder: 1, executor: 1 },
});
```

### Debugging by issue type

**Wrong values / type confusion** → enable `executor: LogLevel.Summary`. Shows the exact JS values flowing through each lifting/lowering trampoline. Compare args entering `→ lifting` with what the WASM function returned, and `← lowering result` with what JS receives.

**Resource handle mismatch ("belongs to type X, not Y")** → enable `resolver: LogLevel.Summary` to see the full index space and plan. Cross-reference type indices from the plan against the WAT dump (`parser: LogLevel.Summary`) to trace resource aliases. Check `canonicalResourceIds` mapping: which `own<T>`/`borrow<T>` type index maps to which canonical ID. Then enable `executor: LogLevel.Detailed` to see every `resource.add`/`resource.get`/`resource.remove` with the typeIdx and handle values. Enable `resolver: LogLevel.Detailed` to see instance-local type registration and own/borrow fixup mappings.

**Wrong function being called / missing import** → enable `resolver: LogLevel.Summary` to see the binding plan. Each plan op shows whether it's `ImportBind`, `CoreInstantiate`, or `ExportBind` with the interface/function name.

**Calling convention issues (spill, flat params)** → enable `binder: LogLevel.Summary`. Shows param counts, calling convention (`Flat`/`Spilled`), and flat param layout for each lifted/lowered function. Also shows the type chain breadcrumb: which `canon.lower`/`canon.lift` → component function → `ComponentTypeFunc` index was resolved.

**Component structure / parsing issues** → enable `parser: LogLevel.Summary`. Produces a WAT reconstruction of the component with index comments `(;N;)` and type annotations (`;;func`, `;;instance`) for cross-referencing.

**Execution order / plan step tracing** → enable `executor: LogLevel.Detailed`. Logs each binding plan operation (`ImportBind`, `CoreInstantiate`, `ExportBind`) as it executes, showing the exact sequence. Useful when Summary-level trampoline values look correct but something runs in the wrong order or is skipped.

**Lift/lower cache issues (duplicate compilation)** → enable `binder: LogLevel.Detailed`. Logs cache HIT/MISS for each lifting/lowering function key. Useful when diagnosing unnecessary recompilation or verifying deduplication works correctly.

## Verification

- **After large code changes, always verify by running lint, build, and tests** in this order:
  1. `npx eslint src/` — must produce 0 errors and 0 warnings.
  2. `npm run build` — must succeed (produces `dist/index.js` and `dist/index.d.ts`).
  3. `node --experimental-vm-modules --experimental-wasm-jspi node_modules/jest-cli/bin/jest.js --no-coverage` — all tests must pass.
