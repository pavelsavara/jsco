// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

// Monkeypatch JSON.stringify to coerce BigInt → Number.
// Jest IPC (process.send with JSON serialization) throws "Do not know how to serialize a BigInt".
const _origStringify = JSON.stringify;
JSON.stringify = function (value: unknown, replacer?: unknown, space?: unknown) {
    if (replacer === undefined || replacer === null) {
        return _origStringify(value, (_k: string, v: unknown) => typeof v === 'bigint' ? Number(v) : v, space as number);
    }
    return _origStringify(value, replacer as any, space as number);
} as typeof JSON.stringify;

// Ensure debug name tables are registered before setConfiguration('Debug') is called in tests
import './src/utils/debug-names';

// Make require() available in ESM mode for Node.js module loading (e.g., node:net, node:fs)
import { createRequire } from 'node:module';
if (typeof globalThis.require === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    (globalThis as any).require = createRequire(import.meta.url);
}

// Orphan-rejection guard. See user-memory note `async-lift-orphan-rejection.md`:
// an unawaited rejected Promise from one test could surface as a failure in a
// later, unrelated test. We capture every unhandledRejection process-wide and
// expose it via globalThis so tests can opt-in assert no orphans occurred.
//
// The list is exposed (not auto-failing) because some tests intentionally
// trigger rejections that are observed via assertions but may surface as a
// late `unhandledRejection` due to timing on slow CI runners. Tests that want
// to enforce zero orphans use `expectNoOrphanRejections()` from the helper in
// `tests/test-utils/orphan-guard.ts`.
type OrphanRejectionRecord = { reason: unknown; promise: Promise<unknown>; at: string };
const orphanRejections: OrphanRejectionRecord[] = [];
(globalThis as any).__jscoOrphanRejections = orphanRejections;
process.on('unhandledRejection', (reason, promise) => {
    orphanRejections.push({ reason, promise: promise as Promise<unknown>, at: new Error().stack ?? '' });
});
