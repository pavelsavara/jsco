// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

// WASI Preview 2 — host module
// Provides all WASI P2 host implementations.
// Import from '@pavelsavara/jsco/wasip2'

export * from '.';
export { instantiateWasiComponent, setCreateComponent } from './instantiate';
export type { WasiInstantiateOptions } from './instantiate';
