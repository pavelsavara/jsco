import { CustomSection, SkippedSection, ComponentSection, CoreModule } from '../parser/types';
import { ComponentAlias } from './aliases';
import { CanonicalFunction } from './canonicals';
import { ComponentExport } from './exports';
import { ComponentImport } from './imports';
import { ComponentInstance, CoreInstance } from './instances';
import { ComponentType } from './types';

export const enum ModelTag {
    Model = 'Model',
    ModelElement = 'ModelElement',

    /// sections
    CustomSection = 'CustomSection',
    CoreModule = 'CoreModule',
    SkippedSection = 'SkippedSection',
    ComponentSection = 'ComponentSection',
    ComponentStartFunction = 'ComponentStartFunction',
    ComponentImport = 'ComponentImport',
    ComponentExport = 'ComponentExport',
    ComponentAliasCoreInstanceExport = 'ComponentAliasCoreInstanceExport',
    ComponentAliasInstanceExport = 'ComponentAliasInstanceExport',
    ComponentAliasOuter = 'ComponentAliasOuter',
    ComponentInstanceFromExports = 'ComponentInstanceFromExports',
    ComponentInstanceInstantiate = 'ComponentInstanceInstantiate',
    CoreInstanceFromExports = 'CoreInstanceFromExports',
    CoreInstanceInstantiate = 'CoreInstanceInstantiate',

    CanonicalFunctionLift = 'CanonicalFunctionLift',
    CanonicalFunctionLower = 'CanonicalFunctionLower',
    CanonicalFunctionResourceDrop = 'CanonicalFunctionResourceDrop',
    CanonicalFunctionResourceNew = 'CanonicalFunctionResourceNew',
    CanonicalFunctionResourceRep = 'CanonicalFunctionResourceRep',
    CanonicalOptionCompactUTF16 = 'CanonicalOptionCompactUTF16',
    CanonicalOptionMemory = 'CanonicalOptionMemory',
    CanonicalOptionPostReturn = 'CanonicalOptionPostReturn',
    CanonicalOptionRealloc = 'CanonicalOptionRealloc',
    CanonicalOptionUTF16 = 'CanonicalOptionUTF16',
    CanonicalOptionUTF8 = 'CanonicalOptionUTF8',
    ComponentTypeDefinedBorrow = 'ComponentTypeDefinedBorrow',
    ComponentTypeDefinedEnum = 'ComponentTypeDefinedEnum',
    ComponentTypeDefinedFlags = 'ComponentTypeDefinedFlags',
    ComponentTypeDefinedList = 'ComponentTypeDefinedList',
    ComponentTypeDefinedOption = 'ComponentTypeDefinedOption',
    ComponentTypeDefinedOwn = 'ComponentTypeDefinedOwn',
    ComponentTypeDefinedPrimitive = 'ComponentTypeDefinedPrimitive',
    ComponentTypeDefinedRecord = 'ComponentTypeDefinedRecord',
    ComponentTypeDefinedResult = 'ComponentTypeDefinedResult',
    ComponentTypeDefinedTuple = 'ComponentTypeDefinedTuple',
    ComponentTypeDefinedVariant = 'ComponentTypeDefinedVariant',
    ComponentExternNameInterface = 'ComponentExternNameInterface',
    ComponentExternNameKebab = 'ComponentExternNameKebab',
    ComponentFuncResultNamed = 'ComponentFuncResultNamed',
    ComponentFuncResultUnnamed = 'ComponentFuncResultUnnamed',
    ComponentNameComponents = 'ComponentNameComponents',
    ComponentNameCoreFuncs = 'ComponentNameCoreFuncs',
    ComponentNameCoreGlobals = 'ComponentNameCoreGlobals',
    ComponentNameCoreInstances = 'ComponentNameCoreInstances',
    ComponentNameCoreMemories = 'ComponentNameCoreMemories',
    ComponentNameCoreModules = 'ComponentNameCoreModules',
    ComponentNameCoreTables = 'ComponentNameCoreTables',
    ComponentNameCoreTypes = 'ComponentNameCoreTypes',
    ComponentNameFuncs = 'ComponentNameFuncs',
    ComponentNameInstances = 'ComponentNameInstances',
    ComponentNameTypes = 'ComponentNameTypes',
    ComponentNameValues = 'ComponentNameValues',
    ComponentTypeComponent = 'ComponentTypeComponent',
    ComponentTypeDeclarationAlias = 'ComponentTypeDeclarationAlias',
    ComponentTypeDeclarationExport = 'ComponentTypeDeclarationExport',
    ComponentTypeDeclarationCoreType = 'ComponentTypeDeclarationCoreType',
    ComponentTypeDeclarationImport = 'ComponentTypeDeclarationImport',
    ComponentTypeDeclarationType = 'ComponentTypeDeclarationType',
    ComponentTypeFunc = 'ComponentTypeFunc',
    ComponentTypeInstance = 'ComponentTypeInstance',
    ComponentTypeResource = 'ComponentTypeResource',
    ComponentValTypePrimitive = 'ComponentValTypePrimitive',
    ComponentValTypeType = 'ComponentValTypeType',
    CoreTypeFunc = 'CoreTypeFunc',
    CoreTypeModule = 'CoreTypeModule',
    InstanceTypeDeclarationAlias = 'InstanceTypeDeclarationAlias',
    InstanceTypeDeclarationExport = 'InstanceTypeDeclarationExport',
    InstanceTypeDeclarationCoreType = 'InstanceTypeDeclarationCoreType',
    InstanceTypeDeclarationType = 'InstanceTypeDeclarationType',
    InstantiationArgKindInstance = 'InstantiationArgKindInstance',
    ModuleTypeDeclarationType = 'ModuleTypeDeclarationType',
    ModuleTypeDeclarationExport = 'ModuleTypeDeclarationExport',
    ModuleTypeDeclarationOuterAlias = 'ModuleTypeDeclarationOuterAlias',
    ModuleTypeDeclarationImport = 'ModuleTypeDeclarationImport',
    OuterAliasKindType = 'OuterAliasKindType',
    StorageTypeI16 = 'StorageTypeI16',
    StorageTypeI8 = 'StorageTypeI8',
    StorageTypeVal = 'StorageTypeVal',
    StructuralTypeArray = 'StructuralTypeArray',
    StructuralTypeFunc = 'StructuralTypeFunc',
    StructuralTypeStruct = 'StructuralTypeStruct',
    ComponentTypeRefModule = 'ComponentTypeRefModule',
    ComponentTypeRefFunc = 'ComponentTypeRefFunc',
    ComponentTypeRefValue = 'ComponentTypeRefValue',
    ComponentTypeRefType = 'ComponentTypeRefType',
    ComponentTypeRefInstance = 'ComponentTypeRefInstance',
    ComponentTypeRefComponent = 'ComponentTypeRefComponent',
    TypeBoundsEq = 'TypeBoundsEq',
    TypeBoundsSubResource = 'TypeBoundsSubResource',
    TypeRefFunc = 'TypeRefFunc',
    TypeRefGlobal = 'TypeRefGlobal',
    TypeRefMemory = 'TypeRefMemory',
    TypeRefTable = 'TypeRefTable',
    TypeRefTag = 'TypeRefTag',
    ValTypeF32 = 'ValTypeF32',
    ValTypeF64 = 'ValTypeF64',
    ValTypeI32 = 'ValTypeI32',
    ValTypeI64 = 'ValTypeI64',
    ValTypeRef = 'ValTypeRef',
    ValTypeV128 = 'ValTypeV128',
}

export type ModelElement = any;

export type TaggedElement = {
    tag: ModelTag
}

export type BrandedElement = {
    __brand: string // this is purely TS type system trickery, it has no runtime effect
}

export type IndexedElement = {
    selfSortIndex?: number
}

export type WITSection =
    | CustomSection
    | SkippedSection
    | ComponentSection
    | ComponentImport
    | ComponentExport
    | ComponentAlias
    | CanonicalFunction
    | ComponentType
    | ComponentInstance
    | CoreModule
    | CoreInstance

