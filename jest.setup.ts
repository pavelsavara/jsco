// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

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
