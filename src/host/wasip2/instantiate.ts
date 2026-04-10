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

/** Options for WASI component instantiation */
export interface WasiInstantiateOptions extends ComponentFactoryOptions, ParserOptions {
    /** Disable JSPI wrapping. Default: false (JSPI enabled). */
    noJspi?: boolean;
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
    const useJspi = !options?.noJspi;

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

    // Create component with optional JSPI-aware WASM instantiation
    const componentOptions: ComponentFactoryOptions & ParserOptions = {
        ...(options ?? {}),
    };

    if (useJspi) {
        // Wrap wasmInstantiate to apply WebAssembly.promising to WASM exports.
        // This makes WASM functions that call blocking host imports (via JspiBlockSignal)
        // return Promises and enable JSPI stack suspension/resumption.
        componentOptions.wasmInstantiate = async (module, importObject) => {
            const instance = await WebAssembly.instantiate(module, importObject);
            // WASM exports are frozen, so we create a proxy with promising-wrapped functions
            const promising = (WebAssembly as any).promising;
            const wrappedExports: Record<string, WebAssembly.ExportValue> = {};
            for (const [name, exp] of Object.entries(instance.exports)) {
                wrappedExports[name] = typeof exp === 'function' ? promising(exp) : exp;
            }
            return { exports: wrappedExports } as unknown as WebAssembly.Instance;
        };
    }

    const component = await createComponent<TJSExports>(source, componentOptions);
    return component.instantiate(mergedImports);
}
