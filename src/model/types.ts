import { ComponentSection } from '../parser/types';
import { ComponentAlias, ComponentAliasInstanceExport } from './aliases';
import { FuncType, Import, SubType, TypeRef, ValType, u32 } from './core';
import { ComponentExternName, ComponentImport, ComponentTypeRef } from './imports';
import { IndexedElement, ModelTag } from './tags';

/// Represents the kind of an outer core alias in a WebAssembly component.
export type OuterAliasKind =
    | OuterAliasKindType

export type OuterAliasKindType = {
    tag: ModelTag.OuterAliasKindType
}

/// Represents a core type in a WebAssembly component.
export type CoreType =
    | CoreTypeFunc
    | CoreTypeModule


/// The type is for a core function.
export type CoreTypeFunc = FuncType & {
    tag: ModelTag.CoreTypeFunc
}

/// The type is for a core module.
export type CoreTypeModule = {
    tag: ModelTag.CoreTypeModule
    declarations: ModuleTypeDeclaration[]
}

/// Represents a module type declaration in a WebAssembly component.
export type ModuleTypeDeclaration =
    | ModuleTypeDeclarationType
    | ModuleTypeDeclarationExport
    | ModuleTypeDeclarationOuterAlias
    | ModuleTypeDeclarationImport

/// The module type definition is for a type.
export type ModuleTypeDeclarationType = SubType & {
    tag: ModelTag.ModuleTypeDeclarationType
}

/// The module type definition is for an export.
export type ModuleTypeDeclarationExport = {
    /// The name of the exported item.
    name: string,
    /// The type reference of the export.
    ty: TypeRef,
}

/// The module type declaration is for an outer alias.
export type ModuleTypeDeclarationOuterAlias = {
    /// The alias kind.
    kind: OuterAliasKind,
    /// The outward count, starting at zero for the current type.
    count: u32,
    /// The index of the item within the outer type.
    index: u32,
}

/// The module type definition is for an import.
export type ModuleTypeDeclarationImport = Import & {
    tag: ModelTag.ModuleTypeDeclarationImport
}

/// Represents a value type in a WebAssembly component.
export type ComponentValType =
    | ComponentValTypePrimitive
    | ComponentValTypeType

/// The value type is a primitive type.
export type ComponentValTypePrimitive = {
    tag: ModelTag.ComponentValTypePrimitive
    value: PrimitiveValType
}

/// The value type is a reference to a defined type.
export type ComponentValTypeType = {
    tag: ModelTag.ComponentValTypeType
    value: u32
}

/// Represents a primitive value type.
export const enum PrimitiveValType {
    /// The type is a boolean.
    Bool = 'bool',
    /// The type is a signed 8-bit integer.
    S8 = 's8',
    /// The type is an unsigned 8-bit integer.
    U8 = 'u8',
    /// The type is a signed 16-bit integer.
    S16 = 's16',
    /// The type is an unsigned 16-bit integer.
    U16 = 'u16',
    /// The type is a signed 32-bit integer.
    S32 = 's32',
    /// The type is an unsigned 32-bit integer.
    U32 = 'u32',
    /// The type is a signed 64-bit integer.
    S64 = 's64',
    /// The type is an unsigned 64-bit integer.
    U64 = 'u64',
    /// The type is a 32-bit floating point number.
    Float32 = 'f32',
    /// The type is a 64-bit floating point number.
    Float64 = 'f64',
    /// The type is a Unicode character.
    Char = 'char',
    /// The type is a string.
    String = 'string',
}

/// Represents a type in a WebAssembly component.
export type ComponentType =
    | ComponentTypeDefined
    | ComponentTypeFunc
    | ComponentTypeComponent
    | ComponentTypeInstance
    | ComponentTypeResource
    | ComponentSection
    | ComponentAliasInstanceExport

/// The type is a function type.
export type ComponentTypeFunc = IndexedElement & ComponentFuncType & {
    tag: ModelTag.ComponentTypeFunc
}

/// The type is a component type.
export type ComponentTypeComponent = IndexedElement & {
    tag: ModelTag.ComponentTypeComponent
    declarations: ComponentTypeDeclaration[]
}

/// The type is an instance type.
export type ComponentTypeInstance = IndexedElement & {
    tag: ModelTag.ComponentTypeInstance
    declarations: InstanceTypeDeclaration[]
}

/// The type is a fresh new resource type.
export type ComponentTypeResource = IndexedElement & {
    tag: ModelTag.ComponentTypeResource
    /// The representation of this resource type in core WebAssembly.
    rep: ValType,
    /// An optionally-specified destructor to use for when this resource is
    /// no longer needed.
    dtor?: u32,
}


/// Represents part of a component type declaration in a WebAssembly component.
export type ComponentTypeDeclaration =
    | ComponentTypeDeclarationCoreType
    | ComponentTypeDeclarationType
    | ComponentTypeDeclarationAlias
    | ComponentTypeDeclarationExport
    | ComponentTypeDeclarationImport


/// The component type declaration is for a core type.
export type ComponentTypeDeclarationCoreType = {
    tag: ModelTag.ComponentTypeDeclarationCoreType
    value: CoreType,
}

/// The component type declaration is for a type.
export type ComponentTypeDeclarationType = {
    tag: ModelTag.ComponentTypeDeclarationType
    value: ComponentType,
}

/// The component type declaration is for an alias.
export type ComponentTypeDeclarationAlias = {
    tag: ModelTag.ComponentTypeDeclarationAlias
    value: ComponentAlias,
}

/// The component type declaration is for an export.
export type ComponentTypeDeclarationExport = {
    tag: ModelTag.ComponentTypeDeclarationExport
    /// The name of the export.
    name: ComponentExternName,
    /// The type reference for the export.
    ty: ComponentTypeRef,
}

/// The component type declaration is for an import.
export type ComponentTypeDeclarationImport = ComponentImport & {
}


/// Represents an instance type declaration in a WebAssembly component.
export type InstanceTypeDeclaration =
    | InstanceTypeDeclarationCoreType
    | InstanceTypeDeclarationType
    | InstanceTypeDeclarationAlias
    | InstanceTypeDeclarationExport

/// The component type declaration is for a core type.
export type InstanceTypeDeclarationCoreType = {
    tag: ModelTag.InstanceTypeDeclarationCoreType,
    value: CoreType,
}

/// The instance type declaration is for a type.
export type InstanceTypeDeclarationType = {
    tag: ModelTag.InstanceTypeDeclarationType,
    value: ComponentType,
}

/// The instance type declaration is for an alias.
export type InstanceTypeDeclarationAlias = {
    tag: ModelTag.InstanceTypeDeclarationAlias,
    value: ComponentAlias,
}

/// The instance type declaration is for an export.
export type InstanceTypeDeclarationExport = {
    tag: ModelTag.InstanceTypeDeclarationExport
    /// The name of the export.
    name: ComponentExternName,
    /// The type reference for the export.
    ty: ComponentTypeRef,
}


/// Represents the result type of a component function.
export type ComponentFuncResult =
    | ComponentFuncResultUnnamed
    | ComponentFuncResultNamed


/// The function returns a singular, unnamed type.
export type ComponentFuncResultUnnamed = {
    tag: ModelTag.ComponentFuncResultUnnamed,
    type: ComponentValType,
}

export type NamedValue = {
    name: string,
    type: ComponentValType
}

/// The function returns zero or more named types.
export type ComponentFuncResultNamed = {
    tag: ModelTag.ComponentFuncResultNamed,
    values: NamedValue[]
}

/// Represents a type of a function in a WebAssembly component.
export type ComponentFuncType = {
    /// The function parameters.
    params: NamedValue[],
    /// The function result.
    results: ComponentFuncResult,
}

/// Represents a case in a variant type.
export type VariantCase = {
    /// The name of the variant case.
    name: string,
    /// The value type of the variant case.
    ty?: ComponentValType,
    /// The index of the variant case that is refined by this one.
    refines?: u32,
}

/// Represents a defined type in a WebAssembly component.
export type ComponentTypeDefined =
    | ComponentTypeDefinedPrimitive
    | ComponentTypeDefinedRecord
    | ComponentTypeDefinedVariant
    | ComponentTypeDefinedList
    | ComponentTypeDefinedTuple
    | ComponentTypeDefinedFlags
    | ComponentTypeDefinedEnum
    | ComponentTypeDefinedOption
    | ComponentTypeDefinedResult
    | ComponentTypeDefinedOwn
    | ComponentTypeDefinedBorrow

/// The type is one of the primitive value types.
export type ComponentTypeDefinedPrimitive = IndexedElement & {
    tag: ModelTag.ComponentTypeDefinedPrimitive,
    value: PrimitiveValType,
}

/// The type is a record with the given fields.
export type ComponentTypeDefinedRecord = IndexedElement & {
    tag: ModelTag.ComponentTypeDefinedRecord,
    members: { name: string, type: ComponentValType }[],
}

/// The type is a variant with the given cases.
export type ComponentTypeDefinedVariant = IndexedElement & {
    tag: ModelTag.ComponentTypeDefinedVariant,
    variants: VariantCase[],
}

/// The type is a list of the given value type.
export type ComponentTypeDefinedList = IndexedElement & {
    tag: ModelTag.ComponentTypeDefinedList,
    value: ComponentValType,
}

/// The type is a tuple of the given value types.
export type ComponentTypeDefinedTuple = IndexedElement & {
    tag: ModelTag.ComponentTypeDefinedTuple,
    members: ComponentValType[],
}

/// The type is flags with the given names.
export type ComponentTypeDefinedFlags = IndexedElement & {
    tag: ModelTag.ComponentTypeDefinedFlags,
    members: string[],
}
/// The type is an enum with the given tags.
export type ComponentTypeDefinedEnum = IndexedElement & {
    tag: ModelTag.ComponentTypeDefinedEnum,
    members: string[],
}

/// The type is an option of the given value type.
export type ComponentTypeDefinedOption = IndexedElement & {
    tag: ModelTag.ComponentTypeDefinedOption,
    value: ComponentValType,
}

/// The type is a result type.
export type ComponentTypeDefinedResult = IndexedElement & {
    tag: ModelTag.ComponentTypeDefinedResult,
    /// The type returned for success.
    ok?: ComponentValType,
    /// The type returned for failure.
    err?: ComponentValType,
}

/// An owned handle to a resource.
export type ComponentTypeDefinedOwn = IndexedElement & {
    tag: ModelTag.ComponentTypeDefinedOwn,
    value: u32,
}

/// A borrowed handle to a resource.
export type ComponentTypeDefinedBorrow = IndexedElement & {
    tag: ModelTag.ComponentTypeDefinedBorrow,
    value: u32,
}
