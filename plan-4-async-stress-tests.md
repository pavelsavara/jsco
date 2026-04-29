# Plan 4: Async-lift / re-entry stress tests (WASIp3)

## Motivation
TODO calls out two missing test categories explicitly:
- **WASIp3: interleaved suspension**
- **WASIp3: re-entry on async — queue**

Recent commit history (`async-lift correctness`, the *orphan-rejection* lesson, the *per-task-mctx-field-swap* lesson — both already captured in user memory) shows this is the area most prone to *spooky-action-at-a-distance* bugs that surface as flakes in unrelated tests. The fixes are in; the tests proving the invariants are not. Adding focused stress tests now locks down what's been learned and prevents regressions.

## Goal
A stress-test suite that exercises:
- Multiple async-lifted exports concurrently in flight, with interleaved settlement orders.
- Re-entrancy (an async-lifted export's task triggers another async-lifted export before the first returns).
- Cancellation at every yield boundary.
- Resource accounting under concurrency (tables don't leak, borrow counters balance).

## Approach

### Step 1: Test components
Author or adapt existing WAT components that expose multiple async-lifted exports calling host imports that suspend. Two routes:
- **Hand-written WAT** in `integration-tests/multi-async-p3-wat/` (folder already exists — extend it).
- **Composed wac files** in `integration-tests/compositions/` that wire multiple async forwarders together (the `*forwarder*p3*` files already exist — exploit them).

### Step 2: Concurrency matrix
For each async export pair `(A, B)`, run scenarios:
- Sequential: A completes before B starts.
- Overlapping: A starts, suspends; B starts, suspends; both resolve in interleaved order.
- Re-entrant: A's task body invokes B synchronously from a host import callback.
- Aborted: A starts, suspends, then `instance.abort()` is called.

### Step 3: Per-task `MarshalingContext` invariant assertion
Per the [user-memory note](memories/per-task-mctx-field-swap.md): `mctx.currentTaskReturn`, `mctx.currentTaskSlots`, etc. are *single fields* on a shared context. The fix is to re-install them at every WASM boundary. Tests should:
- Run a "tolerant" handler scenario (current passing test).
- Run an *intolerant* handler scenario where each task's handler closure-captures state that *must* belong only to that task. If the wrong handler is invoked, this scenario fails loudly. This is the pattern that originally surfaced the bug.

### Step 4: Orphan-rejection regression test
Per the [user-memory note](memories/async-lift-orphan-rejection.md): an unawaited rejected `Promise` from one test could surface as a failure in a *later, unrelated* test.
- Add a Jest-level guard: `process.on('unhandledRejection', ...)` in test setup that records and fails the suite if any orphan rejection is detected.
- Add a focused test that *would* have triggered the original orphan-rejection bug (force a rejection on a deferred result that nothing awaits) and asserts no orphan promise leaks via the guard above.

### Step 5: Resource accounting under concurrency
- Spawn N concurrent async-lifted calls that each `resource.new` and `resource.drop` a handle.
- Assert the resource table is empty post-completion.
- Assert no borrow handles leak (borrow counter returns to zero).

### Step 6: Cancellation at every yield boundary
For each `await` inside `createAsyncLiftWrapper` (in [src/resolver/component-functions.ts](src/resolver/component-functions.ts)):
- Build a test that triggers cancellation/abort at exactly that yield.
- Assert the instance ends in the expected poisoned-or-clean state and that no resources leak.

### Step 7: Verbose logging on failure
Use the existing `useVerboseOnFailure()` infrastructure (per copilot-instructions) so that any flake produces full executor + binder logs without rerun.

## Acceptance criteria
- [ ] Suite runs in CI under both Debug and Release.
- [ ] No orphan rejections detected by the global guard across a full suite run.
- [ ] All N×M concurrency-matrix scenarios pass deterministically (no flakes over 100 reruns locally).
- [ ] Cancellation tests cover every `await` in the async-lift trampoline.

## Risks
- True concurrency stress can hit V8 / JSPI scheduler edge cases that vary by Node version. Pin Node version in CI for this suite and document.
- Some scenarios may be impossible to express without modifying the host or the wasm — limit those to TODO follow-ups rather than blocking the plan.

## Out of scope
- Fuzzing (separate TODO item).
- Performance benchmarking under concurrency.
