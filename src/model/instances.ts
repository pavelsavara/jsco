import { Export, u32 } from './core';
import { ComponentExport, ComponentExternalKind } from './exports';
import { IndexedElement, ModelTag } from './tags';
import { ComponentTypeInstance } from './types';

/// Represents the kind of an instantiation argument for a core instance.
export const enum InstantiationArgKind {
    /// The instantiation argument is a core instance.
    Instance = 'instance',
}

/// Represents an argument to instantiating a WebAssembly module.
export type InstantiationArg = {
    /// The name of the module argument.
    name: string,
    /// The kind of the module argument.
    kind: InstantiationArgKind,
    /// The index of the argument item.
    index: u32,
}

/// Represents an instance of a WebAssembly module.
export type CoreInstance =
    | CoreInstanceInstantiate
    | CoreInstanceFromExports


/// The instance is from instantiating a WebAssembly module.
export type CoreInstanceInstantiate = IndexedElement & {
    tag: ModelTag.CoreInstanceInstantiate,
    /// The module index.
    module_index: u32,
    /// The module's instantiation arguments.
    args: InstantiationArg[],
}

/// The instance is a from exporting local items.
export type CoreInstanceFromExports = IndexedElement & {
    tag: ModelTag.CoreInstanceFromExports,
    exports: Export[],
}

/// Represents an argument to instantiating a WebAssembly component.
export type ComponentInstantiationArg = {
    /// The name of the component argument.
    name: string,
    /// The kind of the component argument.
    kind: ComponentExternalKind,
    /// The index of the argument item.
    index: u32,
}

/// Represents an instance in a WebAssembly component.
export type ComponentInstance =
    | ComponentInstanceInstantiate
    | ComponentInstanceFromExports
    | ComponentTypeInstance

/// The instance is from instantiating a WebAssembly component.
export type ComponentInstanceInstantiate = IndexedElement & {
    tag: ModelTag.ComponentInstanceInstantiate,
    /// The component index.
    component_index: u32,
    /// The component's instantiation arguments.
    args: ComponentInstantiationArg[],
}

/// The instance is a from exporting local items.
export type ComponentInstanceFromExports = IndexedElement & {
    tag: ModelTag.ComponentInstanceFromExports,
    exports: ComponentExport[]
}
