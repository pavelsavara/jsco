# jsco Copilot Instructions

## Coding Conventions

- **Always use numeric `const enum`** — never string-valued enum members. Numeric enums inline to integer literals in the bundle, saving significant minified code size. String enums emit string comparisons and string literals that cannot be minified.
- **Never use inline `import()` for types** — always use top-level `import` or `import type` statements. Inline `import('...').SomeType` in type annotations is prohibited; add the type to an existing top-level import (or create a new `import type` line) instead.

## Testing

- **Always run tests with `--experimental-vm-modules --experimental-wasm-jspi`** — Jest requires `--experimental-vm-modules` to load ESM-only node_modules (like `@bytecodealliance/jco`) as native ESM. WASI tests require `--experimental-wasm-jspi`. Use `npm run test:ci` or `node --experimental-vm-modules --experimental-wasm-jspi node_modules/jest-cli/bin/jest.js` on Windows. Never use bare `npx jest` — it won't pass the Node flags.
- **`transformIgnorePatterns`** excludes `@bytecodealliance/` from SWC transformation. ESM packages using `import.meta` break when SWC converts them to CJS. If adding new ESM-only deps that use `import.meta`, add them to `transformIgnorePatterns` in `jest.config.js`.

## Verification

- **After large code changes, always verify by running lint, build, and tests** in this order:
  1. `npx eslint src/` — must produce 0 errors and 0 warnings.
  2. `npm run build` — must succeed (produces `dist/index.js` and `dist/index.d.ts`).
  3. `node --experimental-vm-modules --experimental-wasm-jspi node_modules/jest-cli/bin/jest.js --no-coverage` — all tests must pass.
