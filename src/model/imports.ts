import { u32 } from './core';
import { ComponentValType } from './types';
import { ModelTag } from './tags';

/// Represents the type bounds for imports and exports.
export type TypeBounds =
    | TypeBoundsEq
    | TypeBoundsSubResource

/// The type is bounded by equality.
export type TypeBoundsEq = {
    tag: ModelTag.TypeBoundsEq
    value: u32
}

/// A fresh resource type,
export type TypeBoundsSubResource = {
    tag: ModelTag.TypeBoundsSubResource
}

/// Represents a reference to a component type.
export type ComponentTypeRef =
    | ComponentTypeRefModule
    | ComponentTypeRefFunc
    | ComponentTypeRefValue
    | ComponentTypeRefType
    | ComponentTypeRefInstance
    | ComponentTypeRefComponent

/// The reference is to a core module type.
///
/// The index is expected to be core type index to a core module type.
export type ComponentTypeRefModule = {
    tag: ModelTag.ComponentTypeRefModule,
    value: u32
}
/// The reference is to a function type.
///
/// The index is expected to be a type index to a function type.
export type ComponentTypeRefFunc = {
    tag: ModelTag.ComponentTypeRefFunc
    value: u32
}
/// The reference is to a value type.
export type ComponentTypeRefValue = {
    tag: ModelTag.ComponentTypeRefValue,
    value: ComponentValType
}
/// The reference is to a bounded type.
///
/// The index is expected to be a type index.
export type ComponentTypeRefType = {
    tag: ModelTag.ComponentTypeRefType
    value: TypeBounds
}
/// The reference is to an instance type.
///
/// The index is a type index to an instance type.
export type ComponentTypeRefInstance = {
    tag: ModelTag.ComponentTypeRefInstance
    value: u32
}
/// The reference is to a component type.
///
/// The index is a type index to a component type.
export type ComponentTypeRefComponent = {
    tag: ModelTag.ComponentTypeRefComponent
    value: u32
}

/// Represents an import in a WebAssembly component
export type ComponentImport = {
    tag: ModelTag.ComponentImport,
    /// The name of the imported item.
    name: ComponentExternName,
    /// The type reference for the import.
    ty: ComponentTypeRef | undefined,
}

/// Represents an export in a WebAssembly component.
export type ComponentExternName =
    | ComponentExternNameKebab
    | ComponentExternNameInterface


export type ComponentExternNameKebab = {
    tag: ModelTag.ComponentExternNameKebab
    name: string
}

export type ComponentExternNameInterface = {
    tag: ModelTag.ComponentExternNameInterface
    name: string
}
