// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * instantiateWasiComponent — Dedicated WASI component instantiator
 *
 * Wraps createComponent + createWasiP2Host with JSPI integration.
 * JSPI wraps blocking WASI imports with WebAssembly.Suspending
 * and component exports with WebAssembly.promising, so WASM can
 * call async host functions synchronously.
 *
 * JSPI is enabled by default and can be disabled via options.
 *
 * NOTE: createComponent is injected via setCreateComponent() by the
 * wasip2 entry module to avoid pulling the entire resolver/parser
 * into the wasip2 bundle. Falls back to dynamic import from
 * ../../resolver for direct usage (e.g. tests).
 */

import type { ComponentFactoryInput, ComponentFactoryOptions } from '../../resolver/types';
import type { ParserOptions } from '../../parser/types';
import type { JsImports, WasmComponent, WasmComponentInstance } from '../../resolver/api-types';
import type { WasiConfig } from './types';
import { createWasiP2Host } from './index';
import { hasJspi } from '../../utils/jspi';

/** Options for WASI component instantiation */
export interface WasiInstantiateOptions extends ComponentFactoryOptions, ParserOptions {
}

type CreateComponentFn = <T>(source: ComponentFactoryInput, options?: ComponentFactoryOptions & ParserOptions) => Promise<WasmComponent<T>>;

let _createComponent: CreateComponentFn | undefined;

/** Inject the createComponent function (called from wasip2 entry module) */
export function setCreateComponent(fn: CreateComponentFn): void {
    _createComponent = fn;
}

/**
 * Instantiate a WASM component with WASI host implementations.
 *
 * 1. Parses and creates the component
 * 2. Builds WASI host imports from config
 * 3. Merges with user-provided extra imports
 * 4. Wraps WASM instantiation to apply WebAssembly.promising on exports (unless noJspi)
 *
 * @param source Component URL, bytes, or stream
 * @param wasiConfig Optional WASI configuration (env, args, fs, etc.)
 * @param extraImports Additional non-WASI imports (merged after WASI)
 * @param options Parser and instantiation options
 */
export async function instantiateWasiComponent<TJSExports>(
    source: ComponentFactoryInput,
    wasiConfig?: WasiConfig,
    extraImports?: JsImports,
    options?: WasiInstantiateOptions,
): Promise<WasmComponentInstance<TJSExports>> {
    if (!_createComponent) {
        throw new Error('createComponent not initialized. Call setCreateComponent() or import the wasip2 entry module first.');
    }

    const noJspi = options?.noJspi;
    const needsJspi = noJspi !== true; // false or array both need JSPI available

    if (needsJspi && !hasJspi()) {
        throw new Error(
            'JSPI required for WASI components. ' +
            'Enable with --experimental-wasm-jspi (Node.js) or ' +
            'chrome://flags/#enable-experimental-webassembly-jspi (Chrome). ' +
            'Pass { noJspi: true } to disable.'
        );
    }

    // Build WASI host
    const wasiExports = createWasiP2Host(wasiConfig);

    // Merge: WASI first, then user extras override
    const mergedImports: JsImports = { ...wasiExports };
    if (extraImports) {
        Object.assign(mergedImports, extraImports);
    }

    // Create component — noJspi flows through from options
    const componentOptions: ComponentFactoryOptions & ParserOptions = {
        ...(options ?? {}),
    };

    const component = await _createComponent<TJSExports>(source, componentOptions);
    return component.instantiate(mergedImports);
}
