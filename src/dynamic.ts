// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import type { WasiP3Imports } from './host/wasip3';
import type { JsImports } from './resolver/api-types';
import type { HostConfig, AllocationLimits } from './host/wasip3';
import type { WasiP2Imports } from './host/wasip2-via-wasip3';
import type { WasiHttpHandlerExport, ServeHandle, ServeConfig } from './host/wasip3/node/wasip3';
import type { WasiP1Adapter } from './host/wasip1-via-wasip3';

export async function loadWasiP3Host(): Promise<{ createWasiP3Host(config?: HostConfig): WasiP3Imports & JsImports }> {
    if (typeof process !== 'undefined' && process.versions?.node) {
        return import('./host/wasip3/node/wasip3');
    }
    return import('./host/wasip3');
}

export async function loadWasiP2ViaP3Adapter(): Promise<{ createWasiP2ViaP3Adapter(p3: WasiP3Imports, options?: { limits?: AllocationLimits }): WasiP2Imports & JsImports }> {
    return import('./host/wasip2-via-wasip3');
}

export async function loadWasiP3Serve(): Promise<{ serve(handler: WasiHttpHandlerExport, config?: ServeConfig): Promise<ServeHandle> }> {
    return import('./host/wasip3/node/wasip3');
}

export async function loadWasiP1ViaP3Adapter(): Promise<{ createWasiP1ViaP3Adapter(config?: HostConfig): WasiP1Adapter }> {
    return import('./host/wasip1-via-wasip3');
}
