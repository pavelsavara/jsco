// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

/**
 * Orphan-rejection guard helpers.
 *
 * Companion to the process-wide `unhandledRejection` listener installed in
 * `jest.setup.ts`. Tests that want to assert no orphan rejections occur
 * during their body call `useOrphanRejectionGuard()` inside a `describe()`,
 * which wires up `beforeEach`/`afterEach` hooks to snapshot the orphan list
 * and fail the test if any new entries appear.
 *
 * Why this matters: see user-memory note `async-lift-orphan-rejection.md`.
 * An unawaited rejected Promise from one test surfaces as a process-level
 * `unhandledRejection` *much* later (on the next macrotask), which Jest then
 * attributes to whichever test happens to be running. By guarding the
 * suspect test directly we localize the failure.
 */

interface OrphanRecord {
    reason: unknown;
    promise: Promise<unknown>;
    at: string;
}

function getOrphanList(): OrphanRecord[] {
    const list = (globalThis as { __jscoOrphanRejections?: OrphanRecord[] }).__jscoOrphanRejections;
    if (!Array.isArray(list)) {
        throw new Error('orphan-rejection list missing — jest.setup.ts must install the unhandledRejection listener');
    }
    return list;
}

/** Drain pending microtasks/macrotasks so any late rejections surface. */
async function drainAsync(): Promise<void> {
    // Two macrotask hops + microtask drain: empirically enough on Node 22 to
    // surface unhandledRejection from a synchronously-rejected promise that
    // was abandoned during the previous test.
    await new Promise<void>(r => setImmediate(r));
    await new Promise<void>(r => setImmediate(r));
    await Promise.resolve();
}

/**
 * Install per-test guard inside a describe(). After each test, drains the
 * event loop and fails if any new orphan rejections are recorded.
 */
export function useOrphanRejectionGuard(): void {
    let baseline = 0;
    beforeEach(() => {
        baseline = getOrphanList().length;
    });
    afterEach(async () => {
        await drainAsync();
        const list = getOrphanList();
        const fresh = list.slice(baseline);
        if (fresh.length > 0) {
            const summary = fresh.map((r, i) => {
                const reason = r.reason instanceof Error
                    ? `${r.reason.name}: ${r.reason.message}`
                    : String(r.reason);
                return `  [${i}] ${reason}`;
            }).join('\n');
            // Trim from the global list so subsequent tests are not blamed.
            list.length = baseline;
            throw new Error(`Detected ${fresh.length} orphan unhandledRejection(s) during this test:\n${summary}`);
        }
    });
}
