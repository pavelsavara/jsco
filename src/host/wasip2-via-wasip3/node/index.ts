// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * WASIp2-via-WASIp3 Node Adapter
 *
 * Thin wrapper providing P2 Node.js APIs (filesystem mounts, HTTP server,
 * sockets) backed by the P3 Node.js host.
 *
 * Re-exports the browser adapter's `createWasiP2ViaP3Adapter` and adds
 * Node.js-specific helpers:
 * - `createNodeFilesystem(mounts)` — real FS mounts via P3 NodeFsBackend
 * - `createHttpServer(handler, config)` — HTTP server via P3 serve()
 * - `runServe(instance, addr, network)` — CLI serve command
 */

import type { WasiP2Imports } from '../index';
import type { JsImports } from '../../../resolver/api-types';
import type { MountConfig, AllocationLimits } from '../../wasip3';
import type { IncomingHandlerFn, NetworkConfig, WasiHttpServer, HttpServerConfig, ServeInstance } from '../http-types';
import { createWasiP3Host } from '../../wasip3/node/wasip3';
import { createWasiP2ViaP3Adapter } from '../index';
import { createHttpServer as createLocalHttpServer } from './http-server';

// Re-export the browser adapter
export { createWasiP2ViaP3Adapter } from '../index';


/**
 * Create a P2-compatible host import object with Node.js filesystem mounts.
 *
 * Delegates to the P3 Node.js host (`createWasiP3Host`) with mount configuration,
 * then wraps through `createWasiP2ViaP3Adapter` for P2 compatibility.
 *
 * @param mounts — Array of host-to-guest directory mappings
 * @param config — Optional: additional P3 host configuration (env, args, network, etc.)
 */
export function createWasiP2ViaP3NodeHost(
    config?: {
        mounts?: MountConfig[];
        env?: [string, string][];
        args?: string[];
        cwd?: string;
        stdin?: ReadableStream<Uint8Array>;
        stdout?: WritableStream<Uint8Array>;
        stderr?: WritableStream<Uint8Array>;
        network?: NetworkConfig;
        limits?: AllocationLimits;
        enabledInterfaces?: string[];
    },
): WasiP2Imports & JsImports {
    const p3 = createWasiP3Host(config);
    return createWasiP2ViaP3Adapter(p3);
}

/**
 * Create a P2-compatible Node.js filesystem from mount points.
 *
 * Creates a P3 host with the specified mounts, wraps through the P2 adapter,
 * and returns the P2 filesystem interface (preopens + descriptor methods).
 *
 * This provides the same `createNodeFilesystem` API as `wasip2-node` but
 * backed by the P3 `NodeFsBackend` + `addNodeMounts()`.
 */
export function createNodeFilesystem(
    mounts: MountConfig[],
    limits?: AllocationLimits,
): { preopens: WasiP2Imports & JsImports } {
    if (mounts.length === 0) {
        throw new Error('At least one mount point is required');
    }
    const p3 = createWasiP3Host({ mounts, limits });
    const p2 = createWasiP2ViaP3Adapter(p3);
    return { preopens: p2 };
}

/**
 * Create a P2-compatible HTTP server.
 *
 * Delegates to the P3 HTTP server (serve()) and bridges P2 ↔ P3 semantics.
 */
export function createHttpServer(
    handler: IncomingHandlerFn,
    config?: HttpServerConfig,
): WasiHttpServer {
    return createLocalHttpServer(handler, config);
}

/**
 * Run the HTTP serve command: start an HTTP server that routes requests
 * to the component's wasi:http/incoming-handler export.
 *
 * Same API as `wasip2-node/runServe` but provided here for convenience.
 */
export async function runServe(instance: ServeInstance, addr?: string, network?: NetworkConfig): Promise<void> {
    const handle = instance.exports['wasi:http/incoming-handler@0.2.11']?.handle
        ?? instance.exports['wasi:http/incoming-handler']?.handle;
    if (!handle) throw new Error('Component does not export wasi:http/incoming-handler');

    const resolvedAddr = addr ?? '0.0.0.0:8080';
    const colonIdx = resolvedAddr.lastIndexOf(':');
    const hostname = colonIdx > 0 ? resolvedAddr.substring(0, colonIdx) : '0.0.0.0';
    const port = colonIdx > 0 ? parseInt(resolvedAddr.substring(colonIdx + 1), 10) : 8080;

    const server = createLocalHttpServer(handle as IncomingHandlerFn, {
        hostname, port, network,
    });
    const actualPort = await server.start();
    // eslint-disable-next-line no-console
    console.log(`Serving HTTP on ${hostname}:${actualPort}`);
}

// Re-export types
export type { MountConfig, AllocationLimits } from '../../wasip3';
export type { IncomingHandlerFn, NetworkConfig, WasiHttpServer, HttpServerConfig, ServeInstance } from '../http-types';
