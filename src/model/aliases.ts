import { CanonicalFunctionLift, CanonicalFunctionLower } from './canonicals';
import { u32, ExternalKind } from './core';
import { ComponentExternalKind } from './exports';
import { IndexedElement, ModelTag } from './tags';

/// Represents the kind of an outer alias in a WebAssembly component.
export const enum ComponentOuterAliasKind {
    /// The alias is to an outer core module.
    CoreModule = 'coremodule',
    /// The alias is to an outer core type.
    CoreType = 'coretype',
    /// The alias is to an outer type.
    Type = 'type',
    /// The alias is to an outer component.
    Component = 'component',
}

/// Represents an alias in a WebAssembly component.
export type ComponentAlias =
    | ComponentAliasInstanceExport
    | ComponentAliasCoreInstanceExport
    | ComponentAliasOuter

export type ComponentFunction =
    | CanonicalFunctionLift
    | ComponentAliasInstanceExport

/// The alias is to an export of a component instance.
export type ComponentAliasInstanceExport = IndexedElement & {
    tag: ModelTag.ComponentAliasInstanceExport,
    /// The alias kind.
    kind: ComponentExternalKind,
    /// The instance index.
    instance_index: u32,
    /// The export name.
    name: string,
}

/// The alias is to an export of a module instance.
export type ComponentAliasCoreInstanceExport = IndexedElement & {
    tag: ModelTag.ComponentAliasCoreInstanceExport,
    /// The alias kind.
    kind: ExternalKind,
    /// The instance index.
    instance_index: u32,
    /// The export name.
    name: string,
}

export type CoreFunction =
    | ComponentAliasCoreInstanceExport
    | CanonicalFunctionLower

/// The alias is to an outer item.
export type ComponentAliasOuter = {
    tag: ModelTag.ComponentAliasOuter,
    /// The alias kind.
    kind: ComponentOuterAliasKind,
    /// The outward count, starting at zero for the current component.
    count: u32,
    /// The index of the item within the outer component.
    index: u32,
}

