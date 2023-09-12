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
    value: NameMap,
}
export type ComponentNameCoreGlobals = {
    tag: ModelTag.ComponentNameCoreGlobals,
    value: NameMap,
}
export type ComponentNameCoreMemories = {
    tag: ModelTag.ComponentNameCoreMemories,
    value: NameMap,
}
export type ComponentNameCoreTables = {
    tag: ModelTag.ComponentNameCoreTables,
    value: NameMap,
}
export type ComponentNameCoreModules = {
    tag: ModelTag.ComponentNameCoreModules,
    value: NameMap,
}
export type ComponentNameCoreInstances = {
    tag: ModelTag.ComponentNameCoreInstances,
    value: NameMap,
}
export type ComponentNameCoreTypes = {
    tag: ModelTag.ComponentNameCoreTypes,
    value: NameMap,
}
export type ComponentNameTypes = {
    tag: ModelTag.ComponentNameTypes,
    value: NameMap,
}
export type ComponentNameInstances = {
    tag: ModelTag.ComponentNameInstances,
    value: NameMap,
}
export type ComponentNameComponents = {
    tag: ModelTag.ComponentNameComponents,
    value: NameMap,
}
export type ComponentNameFuncs = {
    tag: ModelTag.ComponentNameFuncs,
    value: NameMap,
}
export type ComponentNameValues = {
    tag: ModelTag.ComponentNameValues,
    value: NameMap,
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

