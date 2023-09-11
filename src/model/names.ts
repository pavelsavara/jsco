import { NameMap, u8 } from './core';

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
    tag: 'ComponentNameCoreFuncs',
    value: NameMap,
}
export type ComponentNameCoreGlobals = {
    tag: 'ComponentNameCoreGlobals',
    value: NameMap,
}
export type ComponentNameCoreMemories = {
    tag: 'ComponentNameCoreMemories',
    value: NameMap,
}
export type ComponentNameCoreTables = {
    tag: 'ComponentNameCoreTables',
    value: NameMap,
}
export type ComponentNameCoreModules = {
    tag: 'ComponentNameCoreModules',
    value: NameMap,
}
export type ComponentNameCoreInstances = {
    tag: 'ComponentNameCoreInstances',
    value: NameMap,
}
export type ComponentNameCoreTypes = {
    tag: 'ComponentNameCoreTypes',
    value: NameMap,
}
export type ComponentNameTypes = {
    tag: 'ComponentNameTypes',
    value: NameMap,
}
export type ComponentNameInstances = {
    tag: 'ComponentNameInstances',
    value: NameMap,
}
export type ComponentNameComponents = {
    tag: 'ComponentNameComponents',
    value: NameMap,
}
export type ComponentNameFuncs = {
    tag: 'ComponentNameFuncs',
    value: NameMap,
}
export type ComponentNameValues = {
    tag: 'ComponentNameValues',
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

