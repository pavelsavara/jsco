// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * String constants for property names that cross the public API boundary.
 *
 * Used with computed bracket notation (e.g. `obj[EXPORTS]`, `{ [TAG]: OK }`)
 * to prevent terser property mangling from renaming them. Terser cannot
 * resolve computed property accesses, so these are inherently safe.
 *
 * Internal-only property names do NOT need constants — terser mangles them
 * consistently within the bundle.
 */

// WasmComponent
export const INSTANTIATE = 'instantiate';

// WasmComponentInstance
export const EXPORTS = 'exports';
export const ABORT = 'abort';

// Variant / Result convention — consumers create { tag: 'ok', val: 42 }
export const TAG = 'tag';
export const VAL = 'val';
export const OK = 'ok';
export const ERR = 'err';

// getBuildInfo() return value
export const GIT_HASH = 'gitHash';
export const CONFIGURATION = 'configuration';

// ComponentFactoryOptions
export const USE_NUMBER_FOR_INT64 = 'useNumberForInt64';
export const VALIDATE_TYPES = 'validateTypes';
export const NO_JSPI = 'noJspi';
export const WASM_INSTANTIATE = 'wasmInstantiate';
export const VERBOSE = 'verbose';
export const LOGGER = 'logger';

// ParserOptions
export const OTHER_SECTION_DATA = 'otherSectionData';
export const COMPILE_STREAMING = 'compileStreaming';
export const PROCESS_CUSTOM_SECTION = 'processCustomSection';

// WebAssembly JSPI experimental APIs (not in terser's domprops)
export const PROMISING = 'promising';
export const SUSPENDING = 'Suspending';
