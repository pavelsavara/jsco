import { ComponentAlias } from './aliases';
import { FuncType, Import, SubType, TypeRef, ValType, u32 } from './core';
import { ComponentExternName, ComponentImport, ComponentTypeRef } from './imports';

/// Represents the kind of an outer core alias in a WebAssembly component.
export type OuterAliasKind =
    | OuterAliasKindType

export type OuterAliasKindType = {
    tag: 'OuterAliasKindType'
}

/// Represents a core type in a WebAssembly component.
export type CoreType =
    | CoreTypeFunc
    | CoreTypeModule


/// The type is for a core function.
export type CoreTypeFunc = {
    tag: 'CoreTypeFunc'
    value: FuncType
}
/// The type is for a core module.
export type CoreTypeModule = {
    tag: 'CoreTypeModule'
    value: ModuleTypeDeclaration[]
}

/// Represents a module type declaration in a WebAssembly component.
export type ModuleTypeDeclaration =
    | ModuleTypeDeclarationType
    | ModuleTypeDeclarationExport
    | ModuleTypeDeclarationOuterAlias
    | ModuleTypeDeclarationImport

/// The module type definition is for a type.
export type ModuleTypeDeclarationType = {
    tag: 'ModuleTypeDeclarationType'
    value: SubType,
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
export type ModuleTypeDeclarationImport = {
    value: Import,
}

/// Represents a value type in a WebAssembly component.
export type ComponentValType =
    | ComponentValTypePrimitive
    | ComponentValTypeType

/// The value type is a primitive type.
export type ComponentValTypePrimitive = {
    tag: 'ComponentValTypePrimitive'
    value: PrimitiveValType
}

/// The value type is a reference to a defined type.
export type ComponentValTypeType = {
    tag: 'ComponentValTypeType'
    value: u32
}

/// Represents a primitive value type.
export enum PrimitiveValType {
    /// The type is a boolean.
    Bool,
    /// The type is a signed 8-bit integer.
    S8,
    /// The type is an unsigned 8-bit integer.
    U8,
    /// The type is a signed 16-bit integer.
    S16,
    /// The type is an unsigned 16-bit integer.
    U16,
    /// The type is a signed 32-bit integer.
    S32,
    /// The type is an unsigned 32-bit integer.
    U32,
    /// The type is a signed 64-bit integer.
    S64,
    /// The type is an unsigned 64-bit integer.
    U64,
    /// The type is a 32-bit floating point number.
    Float32,
    /// The type is a 64-bit floating point number.
    Float64,
    /// The type is a Unicode character.
    Char,
    /// The type is a string.
    String,
}

/// Represents a type in a WebAssembly component.
export type ComponentType =
    | ComponentTypeDefined
    | ComponentTypeFunc
    | ComponentTypeComponent
    | ComponentTypeInstance
    | ComponentTypeResource


/// The type is a component defined type.
export type ComponentTypeDefined = {
    tag: 'ComponentTypeDefined'
    value: ComponentDefinedType
}

/// The type is a function type.
export type ComponentTypeFunc = {
    tag: 'ComponentTypeFunc'
    value: ComponentFuncType
}

/// The type is a component type.
export type ComponentTypeComponent = {
    tag: 'ComponentTypeComponent'
    value: ComponentTypeDeclaration[]
}

/// The type is an instance type.
export type ComponentTypeInstance = {
    tag: 'ComponentTypeInstance'
    value: InstanceTypeDeclaration[]
}

/// The type is a fresh new resource type.
export type ComponentTypeResource = {
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
    tag: 'ComponentTypeDeclarationCoreType'
    value: CoreType,
}

/// The component type declaration is for a type.
export type ComponentTypeDeclarationType = {
    tag: 'ComponentTypeDeclarationType'
    value: ComponentType,
}

/// The component type declaration is for an alias.
export type ComponentTypeDeclarationAlias = {
    tag: 'ComponentTypeDeclarationAlias'
    value: ComponentAlias,
}

/// The component type declaration is for an export.
export type ComponentTypeDeclarationExport = {
    /// The name of the export.
    name: ComponentExternName,
    /// The type reference for the export.
    ty: ComponentTypeRef,
}

/// The component type declaration is for an import.
export type ComponentTypeDeclarationImport = {
    tag: 'ComponentTypeDeclarationImport'
    value: ComponentImport,
}


/// Represents an instance type declaration in a WebAssembly component.
export type InstanceTypeDeclaration =
    | InstanceTypeDeclarationCoreType
    | InstanceTypeDeclarationType
    | InstanceTypeDeclarationAlias
    | InstanceTypeDeclarationExport

/// The component type declaration is for a core type.
export type InstanceTypeDeclarationCoreType = {
    tag: 'InstanceTypeDeclarationCoreType',
    value: CoreType,
}

/// The instance type declaration is for a type.
export type InstanceTypeDeclarationType = {
    tag: 'InstanceTypeDeclarationType',
    value: ComponentType,
}

/// The instance type declaration is for an alias.
export type InstanceTypeDeclarationAlias = {
    tag: 'InstanceTypeDeclarationAlias',
    value: ComponentAlias,
}

/// The instance type declaration is for an export.
export type InstanceTypeDeclarationExport = {
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
    tag: 'ComponentFuncResultUnnamed',
    value: ComponentValType,
}

/// The function returns zero or more named types.
export type ComponentFuncResultNamed = {
    tag: 'ComponentFuncResultNamed',
    value: [string, ComponentValType][]
}

/// Represents a type of a function in a WebAssembly component.
export type ComponentFuncType = {
    /// The function parameters.
    params: [string, ComponentValType][],
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
export type ComponentDefinedType =
    | ComponentDefinedTypePrimitive
    | ComponentDefinedTypeRecord
    | ComponentDefinedTypeVariant
    | ComponentDefinedTypeList
    | ComponentDefinedTypeTuple
    | ComponentDefinedTypeFlags
    | ComponentDefinedTypeEnum
    | ComponentDefinedTypeOption
    | ComponentDefinedTypeResult
    | ComponentDefinedTypeOwn
    | ComponentDefinedTypeBorrow

/// The type is one of the primitive value types.
export type ComponentDefinedTypePrimitive = {
    tag: 'ComponentDefinedTypePrimitive',
    value: PrimitiveValType,
}

/// The type is a record with the given fields.
export type ComponentDefinedTypeRecord = {
    tag: 'ComponentDefinedTypeRecord',
    members: { name: string, type: ComponentValType }[],
}

/// The type is a variant with the given cases.
export type ComponentDefinedTypeVariant = {
    tag: 'ComponentDefinedTypeVariant',
    variants: VariantCase[],
}

/// The type is a list of the given value type.
export type ComponentDefinedTypeList = {
    tag: 'ComponentDefinedTypeList',
    value: ComponentValType,
}

/// The type is a tuple of the given value types.
export type ComponentDefinedTypeTuple = {
    tag: 'ComponentDefinedTypeTuple',
    members: ComponentValType[],
}

/// The type is flags with the given names.
export type ComponentDefinedTypeFlags = {
    tag: 'ComponentDefinedTypeFlags',
    members: string[],
}
/// The type is an enum with the given tags.
export type ComponentDefinedTypeEnum = {
    tag: 'ComponentDefinedTypeEnum',
    members: string[],
}

/// The type is an option of the given value type.
export type ComponentDefinedTypeOption = {
    tag: 'ComponentDefinedTypeOption',
    value: ComponentValType,
}

/// The type is a result type.
export type ComponentDefinedTypeResult = {
    /// The type returned for success.
    ok?: ComponentValType,
    /// The type returned for failure.
    err?: ComponentValType,
}

/// An owned handle to a resource.
export type ComponentDefinedTypeOwn = {
    tag: 'ComponentDefinedTypeOwn',
    value: u32,
}

/// A borrowed handle to a resource.
export type ComponentDefinedTypeBorrow = {
    tag: 'ComponentDefinedTypeBorrow',
    value: u32,
}