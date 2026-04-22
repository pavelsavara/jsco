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
import { parse } from './parser';
import { detectWasiType, createWasiImports, WasiType, isCoreModule, isWasiP1Module } from './wasi-auto';
import { loadWasiP1ViaP3Adapter } from './dynamic';
import { fetchLike, getBodyIfResponse } from './utils/fetch-like';

export type { WasmComponent, WasmComponentInstance } from './resolver/api-types';
export type { WasiP3Config } from './host/wasip3';
export { instantiateComponent, createComponent } from './resolver';
export { LogLevel, setLogger } from './utils/assert';
export { loadWasiP3Host, loadWasiP2ViaP3Adapter, loadWasiP3Serve, loadWasiP1ViaP3Adapter } from './dynamic';

/**
 * Create and instantiate a WASI component with automatic host detection.
 * Detects WASI P1 core modules, P2, or P3 components and provides
 * the appropriate host. Defaults to P3 if no WASI interfaces are detected.
 *
 * For P1 core modules: bypasses the component model pipeline entirely and
 * uses native WebAssembly.compile/instantiate with a P1 adapter.
 */
export async function instantiateWasiComponent<TJSExports>(
    componentBytesOrUrl: ComponentFactoryInput,
    config?: WasiP3Config,
    options?: ComponentFactoryOptions & ParserOptions,
): Promise<WasmComponentInstance<TJSExports>> {
    // Normalize input to bytes for core module detection
    const bytes = await toBytes(componentBytesOrUrl);

    // Check if this is a core WASM module (P1) rather than a component
    if (isCoreModule(bytes)) {
        return instantiateCoreWasiModule<TJSExports>(bytes, config);
    }

    // Component path (P2/P3) — parse bytes first, then create component from parsed model
    const parsed = await parse(bytes, options);
    const component = await resolverCreateComponent<TJSExports>(parsed as unknown as ComponentFactoryInput, options);
    const exportNames = component.exports();
    const importNames = component.imports();
    const wasiType = detectWasiType(exportNames, importNames);
    // Always provide a host — default to P3 when WASI version is not detected
    const effectiveType = wasiType === WasiType.None ? WasiType.P3 : wasiType;
    const imports = await createWasiImports(effectiveType, config);
    return component.instantiate(imports);
}

/**
 * Instantiate a core WASM module with WASI P1 imports.
 * Bypasses the component model pipeline entirely.
 */
async function instantiateCoreWasiModule<TJSExports>(
    bytes: Uint8Array,
    config?: WasiP3Config,
): Promise<WasmComponentInstance<TJSExports>> {
    const module = await WebAssembly.compile(bytes as BufferSource);

    if (!isWasiP1Module(module)) {
        throw new Error('Core WebAssembly module does not import wasi_snapshot_preview1. Use createComponent() for component-model modules.');
    }

    const { createWasiP1ViaP3Adapter } = await loadWasiP1ViaP3Adapter();
    const adapter = createWasiP1ViaP3Adapter(config);
    const instance = await WebAssembly.instantiate(module, adapter.imports as unknown as WebAssembly.Imports);

    // Bind the module's memory so adapter functions can access linear memory
    const wasmMemory = instance.exports['memory'] as WebAssembly.Memory | undefined;
    if (wasmMemory) {
        adapter.bindMemory(wasmMemory);
    }

    // Detect entry point convention
    const moduleExports = WebAssembly.Module.exports(module);
    const hasStart = moduleExports.some(e => e.name === '_start' && e.kind === 'function');
    const hasInitialize = moduleExports.some(e => e.name === '_initialize' && e.kind === 'function');

    // For reactor modules, call _initialize if present
    if (!hasStart && hasInitialize) {
        (instance.exports['_initialize'] as Function)();
    }

    // Build exports map: expose all exported functions
    const exports: Record<string, unknown> = {};
    for (const exp of moduleExports) {
        if (exp.kind === 'function') {
            exports[exp.name] = instance.exports[exp.name];
        }
    }

    // If this is a command module, expose _start under a run-like interface
    if (hasStart) {
        exports['_start'] = instance.exports['_start'];
    }

    return {
        exports: exports as TJSExports & Record<string, Record<string, Function>>,
        abort(): void {
            // No-op for core modules
        },
    };
}

/**
 * Normalize ComponentFactoryInput to Uint8Array.
 */
async function toBytes(input: ComponentFactoryInput): Promise<Uint8Array> {
    if (input instanceof Uint8Array) {
        return input;
    }
    if (typeof input === 'string') {
        // URL or file path — use fetchLike (handles Node fs.readFile for local paths)
        const result = await fetchLike(input);
        if (result instanceof Uint8Array) {
            // Node.js fs.readFile returns Buffer (extends Uint8Array)
            // Buffer.buffer may be a shared pool — must copy to own ArrayBuffer
            return new Uint8Array(result);
        }
        const body = await getBodyIfResponse(result as any);
        if (body instanceof Uint8Array) {
            return new Uint8Array(body);
        }
        // ReadableStream
        return await streamToBytes(body as ReadableStream<Uint8Array>);
    }
    if (input instanceof ArrayBuffer) {
        return new Uint8Array(input);
    }
    if (ArrayBuffer.isView(input)) {
        return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    }
    if (input instanceof ReadableStream) {
        return await streamToBytes(input as ReadableStream<Uint8Array>);
    }
    if (input instanceof Response || (typeof input === 'object' && input !== null && 'then' in input)) {
        const response = await (input as PromiseLike<Response>);
        return new Uint8Array(await response.arrayBuffer());
    }
    // ArrayLike<number>
    if (typeof input === 'object' && input !== null && 'length' in input) {
        return new Uint8Array(Array.from(input as ArrayLike<number>));
    }
    throw new Error('Unsupported input type for instantiateWasiComponent');
}

async function streamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    const reader = stream.getReader();
    for (; ;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
    }
    const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    return result;
}

export function getBuildInfo() {
    return {
        gitHash: gitHash,
        configuration: configuration,
    };
}

initializeAsserts();

await cliMain();