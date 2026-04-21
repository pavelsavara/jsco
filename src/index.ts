// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./__mocks__/.types.d.ts" />

import type { WasiP3Config } from './host/wasip3';
import type { ComponentFactoryInput, ComponentFactoryOptions } from './resolver/types';
import type { WasmComponentInstance } from './resolver/api-types';
import type { ParserOptions } from './parser/types';
import gitHash from 'env:gitHash';
import configuration from 'env:configuration';
import { initializeAsserts } from './utils/assert';
import './utils/debug-names';
import { cliMain } from './main';
import { createComponent as resolverCreateComponent } from './resolver';
import { detectWasiType, createWasiImports, WasiType } from './wasi-auto';

export type { WasmComponent, WasmComponentInstance } from './resolver/api-types';
export type { WasiP3Config } from './host/wasip3';
export { instantiateComponent, createComponent } from './resolver';
export { LogLevel, setLogger } from './utils/assert';
export { loadWasiP3Host, loadWasiP2ViaP3Adapter, loadWasiP3Serve } from './dynamic';

/**
 * Create and instantiate a WASI component with automatic host detection.
 * Detects WASI P2 or P3 from the component's exports/imports and provides
 * the appropriate host. Defaults to P3 if no WASI interfaces are detected.
 */
export async function instantiateWasiComponent<TJSExports>(
    componentBytesOrUrl: ComponentFactoryInput,
    config?: WasiP3Config,
    options?: ComponentFactoryOptions & ParserOptions,
): Promise<WasmComponentInstance<TJSExports>> {
    const component = await resolverCreateComponent<TJSExports>(componentBytesOrUrl, options);
    const exportNames = component.exports();
    const importNames = component.imports();
    const wasiType = detectWasiType(exportNames, importNames);
    // Always provide a host — default to P3 when WASI version is not detected
    const effectiveType = wasiType === WasiType.None ? WasiType.P3 : wasiType;
    const imports = await createWasiImports(effectiveType, config);
    return component.instantiate(imports);
}

export function getBuildInfo() {
    return {
        gitHash: gitHash,
        configuration: configuration,
    };
}

initializeAsserts();

await cliMain();