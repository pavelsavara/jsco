### 2026-04-08: Scoped memoize cache & debug trace decorator
**By:** Dev
**What:** The module-level `memoizeCache` in `binding/cache.ts` has been moved into `ResolverContext`. Each `createComponent()` call now gets a fresh cache that is GC'd with the component. The `memoize()` function takes the cache as its first parameter.

A `withDebugTrace()` decorator in `utils/assert.ts` replaces manual `debugStack(bargs, args, ...)` calls in binder functions. It returns the binder unchanged when `isDebug` is false (zero runtime cost). Secondary `debugStack(args, args, ...)` self-prepend calls inside loops are kept for per-iteration trace context.

**Why:** Cache leak prevention across multiple `createComponent()` calls; cleaner separation of debug instrumentation from business logic in binders.
