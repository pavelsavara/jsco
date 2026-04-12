/**
 * instantiateWasiComponent — Dedicated WASI component instantiator
 *
 * Wraps createComponent + createWasiHost with JSPI integration.
 * JSPI wraps blocking WASI imports with WebAssembly.Suspending
 * and component exports with WebAssembly.promising, so WASM can
 * call async host functions synchronously.
 *
 * JSPI is enabled by default and can be disabled via options.
 */

import { createComponent } from '../../resolver';
import { ComponentFactoryInput, ComponentFactoryOptions } from '../../resolver/types';
import { ParserOptions } from '../../parser/types';
import { JsImports, WasmComponentInstance } from '../../resolver/api-types';
import { WasiConfig } from './types';
import { createWasiHost } from './index';
import { hasJspi } from './poll';
import { NO_JSPI, INSTANTIATE } from '../../constants';

/** Options for WASI component instantiation */
export interface WasiInstantiateOptions extends ComponentFactoryOptions, ParserOptions {
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
    const useJspi = options?.[NO_JSPI] !== true;

    if (useJspi && !hasJspi()) {
        throw new Error(
            'JSPI required for WASI components. ' +
            'Enable with --experimental-wasm-jspi (Node.js) or ' +
            'chrome://flags/#enable-experimental-webassembly-jspi (Chrome). ' +
            'Pass { noJspi: true } to disable.'
        );
    }

    // Build WASI host
    const wasiImports = createWasiHost(wasiConfig);

    // Merge: WASI first, then user extras override
    const mergedImports: JsImports = { ...wasiImports };
    if (extraImports) {
        Object.assign(mergedImports, extraImports);
    }

    // Create component — noJspi flows through from options
    const componentOptions: ComponentFactoryOptions & ParserOptions = {
        ...(options ?? {}),
    };

    const component = await createComponent<TJSExports>(source, componentOptions);
    return component[INSTANTIATE](mergedImports);
}
