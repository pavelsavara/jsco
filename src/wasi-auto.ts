// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { WasiP3Config } from './host/wasip3';
import type { JsImports } from './resolver/api-types';
import { loadWasiP3Host, loadWasiP2ViaP3Adapter } from './dynamic';

export const enum WasiType {
    None = 0,
    P2 = 2,
    P3 = 3,
}

/**
 * Detect WASI type from component export and import names.
 * Checks exports first (most reliable), then falls back to imports.
 */
export function detectWasiType(exports: string[], imports: string[]): WasiType {
    return detectFromNames(exports) || detectFromNames(imports);
}

function detectFromNames(names: string[]): WasiType {
    for (const name of names) {
        if (!name.startsWith('wasi:')) continue;
        if (/@0\.2/.test(name)) return WasiType.P2;
        return WasiType.P3;
    }
    return WasiType.None;
}

/**
 * Create WASI host imports for the detected type.
 * Returns P3 host directly for P3 components, or P3 host wrapped with P2 adapter for P2 components.
 */
export async function createWasiImports(wasiType: WasiType, config?: WasiP3Config): Promise<JsImports | undefined> {
    if (wasiType === WasiType.None) return undefined;
    const { createWasiP3Host } = await loadWasiP3Host();
    const p3 = createWasiP3Host(config);
    if (wasiType === WasiType.P2) {
        return (await loadWasiP2ViaP3Adapter()).createWasiP2ViaP3Adapter(p3);
    }
    return p3;
}
