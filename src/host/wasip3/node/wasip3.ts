// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

// WASIp3 Host — Node.js bundle
// Contains everything from the browser bundle PLUS Node.js-specific implementations:
// real TCP/UDP sockets, DNS lookup, HTTP server.
// Import from '@pavelsavara/jsco/wasip3-node'

import type { WasiP3Imports } from '../../../../wit/wasip3/types/index';
import type { WasiP3Config } from '../types';
import { createHost as createBrowserHost } from '../index';
import { createNodeSocketsTypes, createNodeIpNameLookup } from './sockets';
import { addNodeMounts } from './filesystem-node';
import { initFilesystem, createPreopens, createFilesystemTypes } from '../filesystem';
import { serve as serveImpl } from './http-server';
import type { WasiHttpHandlerExport, ServeConfig, ServeHandle } from './http-server';

// Re-export everything from the browser module so consumers need only one import
export * from '../index';

/**
 * Create a WASIp3 host import object with Node.js implementations.
 *
 * Calls the browser `createHost()` for all shared interfaces, then
 * replaces browser socket stubs with real Node.js TCP/UDP/DNS.
 * When `config.mounts` is present, adds real filesystem mount preopens.
 */
export function createHost(config?: WasiP3Config): WasiP3Imports {
    const host = createBrowserHost(config);
    // Replace browser socket stubs with real Node.js implementations
    host['wasi:sockets/types'] = createNodeSocketsTypes();
    host['wasi:sockets/ip-name-lookup'] = createNodeIpNameLookup();

    // Wire real filesystem mounts
    if (config?.mounts && config.mounts.length > 0) {
        const fsState = initFilesystem(config);
        addNodeMounts(fsState, config.mounts, config.limits);
        host['wasi:filesystem/preopens'] = createPreopens(fsState);
        host['wasi:filesystem/types'] = createFilesystemTypes(fsState);
    }

    return host;
}

/**
 * Start an HTTP server that routes incoming requests to a WASM handler export.
 *
 * The handler must implement `wasi:http/handler.handle(request): Promise<response>`.
 */
export async function serve(
    handler: WasiHttpHandlerExport,
    config?: ServeConfig,
): Promise<ServeHandle> {
    return serveImpl(handler, config);
}

export type { WasiHttpHandlerExport, ServeConfig, ServeHandle } from './http-server';
