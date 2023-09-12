import { u32 } from './core';
import { ComponentExternName, ComponentTypeRef } from './imports';

/// Represents the kind of an external items of a WebAssembly component.
export enum ComponentExternalKind {
    /// The external kind is a core module.
    Module,
    /// The external kind is a function.
    Func,
    /// The external kind is a value.
    Value,
    /// The external kind is a type.
    Type,
    /// The external kind is an instance.
    Instance,
    /// The external kind is a component.
    Component,
}

/// Represents an export in a WebAssembly component.
export type ComponentExport = {
    tag: 'ComponentExport',
    /// The name of the exported item.
    name: ComponentExternName,
    /// The kind of the export.
    kind: ComponentExternalKind,
    /// The index of the exported item.
    index: u32,
    /// An optionally specified type ascribed to this export.
    ty?: ComponentTypeRef,
}
