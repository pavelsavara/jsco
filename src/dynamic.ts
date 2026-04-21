// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { WasiP3Imports } from '../wit/wasip3/types/index';
import type { JsImports } from './resolver/api-types';
import type { WasiP3Config } from './host/wasip3';
import type { WasiP2Imports } from '../wit/wasip2/types/index';
import type { WasiHttpHandlerExport, ServeHandle } from './host/wasip3/node/wasip3';
import type { WasiP1Adapter } from './host/wasip1-via-wasip3';

export async function loadWasiP3Host(): Promise<{ createWasiP3Host(config?: WasiP3Config): WasiP3Imports & JsImports }> {
    if (typeof process !== 'undefined' && process.versions?.node) {
        return import('./host/wasip3/node/wasip3');
    }
    return import('./host/wasip3');
}

export async function loadWasiP2ViaP3Adapter(): Promise<{ createWasiP2ViaP3Adapter(p3: WasiP3Imports): WasiP2Imports & JsImports }> {
    return import('./host/wasip2-via-wasip3');
}

export async function loadWasiP3Serve(): Promise<{ serve(handler: WasiHttpHandlerExport, config?: WasiP3Config): Promise<ServeHandle> }> {
    return import('./host/wasip3/node/wasip3');
}

export async function loadWasiP1ViaP3Adapter(): Promise<{ createWasiP1ViaP3Adapter(config?: WasiP3Config): WasiP1Adapter }> {
    return import('./host/wasip1-via-wasip3');
}
