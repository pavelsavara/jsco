// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

// WASIp3 Host — Node.js bundle
// Contains everything from the browser bundle PLUS Node.js-specific implementations:
// real TCP/UDP sockets, DNS lookup, HTTP server.
// Import from '@pavelsavara/jsco/wasip3-node'

import type { WasiP3Imports } from '../../../../wit/wasip3/types/index';
import type { WasiP3Config } from '../types';
import { createWasiP3Host as createBrowserHost } from '../index';
import { createNodeSocketsTypes, createNodeIpNameLookup } from './sockets';
import { addNodeMounts } from './filesystem-node';
import { initFilesystem, createPreopens, createFilesystemTypes } from '../filesystem';
import { nodeStdioDefaults } from './stdio-node';
import { serve as serveImpl } from './http-server';
import type { WasiHttpHandlerExport, ServeConfig, ServeHandle } from './http-server';
import { JsImports } from '../../../resolver/api-types';

// Re-export everything from the browser module so consumers need only one import
export * from '../index';

/**
 * Create a WASIp3 host import object with Node.js implementations.
 *
 * Calls the browser `createHost()` for all shared interfaces, then
 * replaces browser socket stubs with real Node.js TCP/UDP/DNS.
 * When `config.mounts` is present, adds real filesystem mount preopens.
 * Defaults stdin/stdout/stderr to process streams when not explicitly provided.
 */
export function createWasiP3Host(config?: WasiP3Config): WasiP3Imports & JsImports {
    // Only inject Node.js process streams when user didn't provide their own
    const nodeConfig: WasiP3Config = { ...config };
    if (!nodeConfig.stdin) {
        const { stdin } = nodeStdioDefaults();
        nodeConfig.stdin = stdin;
    }
    if (!nodeConfig.stdout) {
        const { stdout } = nodeStdioDefaults();
        nodeConfig.stdout = stdout;
    }
    if (!nodeConfig.stderr) {
        const { stderr } = nodeStdioDefaults();
        nodeConfig.stderr = stderr;
    }

    const host = createBrowserHost(nodeConfig) as unknown as Record<string, unknown>;

    // Helper: override both unversioned and versioned alias
    const p3version = '0.3.0-rc-2026-03-15';
    function override(key: string, value: unknown) {
        host[key] = value;
        host[key + '@' + p3version] = value;
    }

    // Replace browser socket stubs with real Node.js implementations
    override('wasi:sockets/types', createNodeSocketsTypes());
    override('wasi:sockets/ip-name-lookup', createNodeIpNameLookup());

    // Wire real filesystem mounts
    if (config?.mounts && config.mounts.length > 0) {
        const fsState = initFilesystem(config);
        addNodeMounts(fsState, config.mounts, config.limits);
        override('wasi:filesystem/preopens', createPreopens(fsState));
        override('wasi:filesystem/types', createFilesystemTypes(fsState));
    }

    return host as unknown as WasiP3Imports & JsImports;
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
