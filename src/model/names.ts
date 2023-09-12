import { NameMap, u8 } from './core';
import { ModelTag } from './tags';

/// Represents a name read from the names custom section.
export type ComponentName =
    | ComponentNameComponent
    | ComponentNameCoreFuncs
    | ComponentNameCoreGlobals
    | ComponentNameCoreMemories
    | ComponentNameCoreTables
    | ComponentNameCoreModules
    | ComponentNameCoreInstances
    | ComponentNameCoreTypes
    | ComponentNameTypes
    | ComponentNameInstances
    | ComponentNameComponents
    | ComponentNameFuncs
    | ComponentNameValues
    | ComponentNameUnknown


export type ComponentNameComponent = {
    name: string,
    name_range: any // TODO type
}
export type ComponentNameCoreFuncs = {
    tag: ModelTag.ComponentNameCoreFuncs,
    names: NameMap,
}
export type ComponentNameCoreGlobals = {
    tag: ModelTag.ComponentNameCoreGlobals,
    names: NameMap,
}
export type ComponentNameCoreMemories = {
    tag: ModelTag.ComponentNameCoreMemories,
    names: NameMap,
}
export type ComponentNameCoreTables = {
    tag: ModelTag.ComponentNameCoreTables,
    names: NameMap,
}
export type ComponentNameCoreModules = {
    tag: ModelTag.ComponentNameCoreModules,
    names: NameMap,
}
export type ComponentNameCoreInstances = {
    tag: ModelTag.ComponentNameCoreInstances,
    names: NameMap,
}
export type ComponentNameCoreTypes = {
    tag: ModelTag.ComponentNameCoreTypes,
    names: NameMap,
}
export type ComponentNameTypes = {
    tag: ModelTag.ComponentNameTypes,
    names: NameMap,
}
export type ComponentNameInstances = {
    tag: ModelTag.ComponentNameInstances,
    names: NameMap,
}
export type ComponentNameComponents = {
    tag: ModelTag.ComponentNameComponents,
    names: NameMap,
}
export type ComponentNameFuncs = {
    tag: ModelTag.ComponentNameFuncs,
    names: NameMap,
}
export type ComponentNameValues = {
    tag: ModelTag.ComponentNameValues,
    names: NameMap,
}

/// An unknown [name subsection](https://webassembly.github.io/spec/core/appendix/custom.html#subsections).
export type ComponentNameUnknown = {
    /// The identifier for this subsection.
    ty: u8,
    /// The contents of this subsection.
    data: u8[],
    /// The range of bytes, relative to the start of the original data
    /// stream, that the contents of this subsection reside in.
    range: any // TODO type
}

