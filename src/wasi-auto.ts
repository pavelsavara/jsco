// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { WasiP3Config } from './host/wasip3';
import type { JsImports } from './resolver/api-types';
import { loadWasiP3Host, loadWasiP2ViaP3Adapter } from './dynamic';

export const enum WasiType {
    None = 0,
    P1 = 1,
    P2 = 2,
    P3 = 3,
}

/**
 * Check if the given bytes are a core WebAssembly module (not a component).
 * Core modules: magic \0asm + version 1 (bytes [0x00,0x61,0x73,0x6D, 0x01,0x00,0x00,0x00]).
 * Components:   magic \0asm + version 13 + layer 1 (bytes [0x00,0x61,0x73,0x6D, 0x0D,0x00,0x01,0x00]).
 */
export function isCoreModule(bytes: ArrayLike<number>): boolean {
    return bytes.length >= 8
        && bytes[0] === 0x00 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6D
        && bytes[4] === 0x01 && bytes[5] === 0x00 && bytes[6] === 0x00 && bytes[7] === 0x00;
}

/**
 * Check if a compiled WebAssembly.Module imports from wasi_snapshot_preview1.
 */
export function isWasiP1Module(module: WebAssembly.Module): boolean {
    return WebAssembly.Module.imports(module).some(i => i.module === 'wasi_snapshot_preview1');
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
