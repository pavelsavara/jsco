// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

// Branded index types for compile-time safety across WASM component index spaces.
// These are purely type-level — zero runtime cost.

export type CoreFuncIndex = number & { readonly __brand: 'CoreFuncIndex' }
export type CoreInstanceIndex = number & { readonly __brand: 'CoreInstanceIndex' }
export type CoreModuleIndex = number & { readonly __brand: 'CoreModuleIndex' }
export type ComponentFuncIndex = number & { readonly __brand: 'ComponentFuncIndex' }
export type ComponentInstanceIndex = number & { readonly __brand: 'ComponentInstanceIndex' }
export type ComponentTypeIndex = number & { readonly __brand: 'ComponentTypeIndex' }
