// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

// WASI Preview 2 — host module
// Provides all WASI P2 host implementations.
// Import from '@pavelsavara/jsco/wasip2'

// Import createComponent from the core module (externalized by rollup to ./index.js)
import { createComponent } from './index';
import { setCreateComponent } from './host/wasip2/instantiate';

// Wire up createComponent so instantiateWasiComponent can use it
// without pulling the entire parser/resolver into this bundle.
setCreateComponent(createComponent);

export * from './host/wasip2';
export { instantiateWasiComponent } from './host/wasip2/instantiate';
export type { WasiInstantiateOptions } from './host/wasip2/instantiate';
