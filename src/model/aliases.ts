import { u32, ExternalKind } from './core';
import { ComponentExternalKind } from './exports';

/// Represents the kind of an outer alias in a WebAssembly component.
export type ComponentOuterAliasKind =
    /// The alias is to a core module.
    | 'CoreModule'
    /// The alias is to a core type.
    | 'CoreType'
    /// The alias is to a component type.
    | 'Type'
    /// The alias is to a component.
    | 'Component'

/// Represents an alias in a WebAssembly component.
export type ComponentAlias =
    | ComponentAliasInstanceExport
    | ComponentAliasCoreInstanceExport
    | ComponentAliasOuter

/// The alias is to an export of a component instance.
export type ComponentAliasInstanceExport = {
    tag: 'ComponentAliasInstanceExport',
    /// The alias kind.
    kind: ComponentExternalKind,
    /// The instance index.
    instance_index: u32,
    /// The export name.
    name: string,
}

/// The alias is to an export of a module instance.
export type ComponentAliasCoreInstanceExport = {
    tag: 'ComponentAliasCoreInstanceExport',
    /// The alias kind.
    kind: ExternalKind,
    /// The instance index.
    instance_index: u32,
    /// The export name.
    name: string,
}

/// The alias is to an outer item.
export type ComponentAliasOuter = {
    tag: 'ComponentAliasOuter',
    /// The alias kind.
    kind: ComponentOuterAliasKind,
    /// The outward count, starting at zero for the current component.
    count: u32,
    /// The index of the item within the outer component.
    index: u32,
}

