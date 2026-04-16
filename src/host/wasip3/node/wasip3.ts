// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

// WASIp3 Host — Node.js-specific extensions
// Provides real filesystem mounts, TCP/UDP sockets, HTTP server, DNS lookup.
// Import from '@pavelsavara/jsco/wasip3-node'

import type { WasiP3Imports } from '../../../../wit/wasip3/types/index';
import type { WasiP3Config } from '../types';

/**
 * Create Node.js-specific WASI P3 host overrides.
 *
 * Returns a partial WasiP3Imports that the browser-side `createHost()`
 * merges over its defaults (node wins for sockets, real FS, HTTP server).
 *
 * **Stub** — not yet implemented.
 */
export async function createHost(_config?: WasiP3Config): Promise<Partial<WasiP3Imports>> {
    // Will be filled in by later stages (filesystem-node, sockets, http-server)
    return {};
}

/**
 * Start an HTTP server that routes incoming requests to a WASM handler export.
 *
 * **Stub** — not yet implemented.
 */
export async function serve(_handler: unknown): Promise<void> {
    throw new Error('WASIp3 node: serve() not implemented');
}
