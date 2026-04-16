// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

// Ensure debug name tables are registered before setConfiguration('Debug') is called in tests
import './src/utils/debug-names';

// Make require() available in ESM mode for Node.js module loading (e.g., node:net, node:fs)
import { createRequire } from 'node:module';
if (typeof globalThis.require === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    (globalThis as any).require = createRequire(import.meta.url);
}
