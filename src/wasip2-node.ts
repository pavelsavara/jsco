// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

// WASI Preview 2 — Node.js-specific extensions
// Provides HTTP server, Node.js filesystem, and CLI serve command.
// Import from '@pavelsavara/jsco/wasip2-node'

import type { NetworkConfig } from './host/wasip2/types';
import type { IncomingHandlerFn } from './host/wasip2/api';
import { createHttpServer } from './host/wasip2/http-server';

export { createHttpServer } from './host/wasip2/http-server';
export type { IncomingHandlerFn, WasiIncomingRequest, WasiOutgoingResponse, WasiResponseOutparam, WasiFutureTrailers } from './host/wasip2/api';
export type { HttpServerConfig, WasiHttpServer } from './host/wasip2/types';
export { createOutgoingResponse, responseOutparamSet, createFutureTrailers } from './host/wasip2/http-server';
export { createNodeFilesystem } from './host/wasip2/filesystem-node';
export type { FsMount } from './host/wasip2/types';

export interface ServeInstance {
    exports: Record<string, Record<string, Function> | undefined>;
}

/**
 * Run the HTTP serve command: start an HTTP server that routes requests
 * to the component's wasi:http/incoming-handler export.
 */
export async function runServe(instance: ServeInstance, addr?: string, network?: NetworkConfig): Promise<void> {
    const handle = instance.exports['wasi:http/incoming-handler@0.2.11']?.handle
        ?? instance.exports['wasi:http/incoming-handler']?.handle;
    if (!handle) throw new Error('Component does not export wasi:http/incoming-handler');

    const resolvedAddr = addr ?? '0.0.0.0:8080';
    const colonIdx = resolvedAddr.lastIndexOf(':');
    const hostname = colonIdx > 0 ? resolvedAddr.substring(0, colonIdx) : '0.0.0.0';
    const port = colonIdx > 0 ? parseInt(resolvedAddr.substring(colonIdx + 1), 10) : 8080;

    const server = createHttpServer(handle as IncomingHandlerFn, {
        hostname, port, network,
    });
    const actualPort = await server.start();
    // eslint-disable-next-line no-console
    console.log(`Serving HTTP on ${hostname}:${actualPort}`);
}
