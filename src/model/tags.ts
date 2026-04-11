import { CustomSection, SkippedSection, ComponentSection, CoreModule } from '../parser/types';
import { ComponentAlias } from './aliases';
import { CanonicalFunction } from './canonicals';
import { ComponentExport } from './exports';
import { ComponentImport } from './imports';
import { ComponentInstance, CoreInstance } from './instances';
import { ComponentStartFunction } from './start';
import { ComponentType, CoreType } from './types';

export const enum ModelTag {
    Model,
    ModelElement,

    /// sections
    CustomSection,
    CoreModule,
    SkippedSection,
    ComponentSection,
    ComponentStartFunction,
    ComponentImport,
    ComponentExport,
    ComponentAliasCoreInstanceExport,
    ComponentAliasInstanceExport,
    ComponentAliasOuter,
    ComponentInstanceFromExports,
    ComponentInstanceInstantiate,
    CoreInstanceFromExports,
    CoreInstanceInstantiate,

    CanonicalFunctionLift,
    CanonicalFunctionLower,
    CanonicalFunctionResourceDrop,
    CanonicalFunctionResourceNew,
    CanonicalFunctionResourceRep,
    CanonicalOptionCompactUTF16,
    CanonicalOptionMemory,
    CanonicalOptionPostReturn,
    CanonicalOptionRealloc,
    CanonicalOptionUTF16,
    CanonicalOptionUTF8,
    ComponentTypeDefinedBorrow,
    ComponentTypeDefinedEnum,
    ComponentTypeDefinedFlags,
    ComponentTypeDefinedList,
    ComponentTypeDefinedOption,
    ComponentTypeDefinedOwn,
    ComponentTypeDefinedPrimitive,
    ComponentTypeDefinedRecord,
    ComponentTypeDefinedResult,
    ComponentTypeDefinedTuple,
    ComponentTypeDefinedVariant,
    ComponentExternNameInterface,
    ComponentExternNameKebab,
    ComponentFuncResultNamed,
    ComponentFuncResultUnnamed,
    ComponentNameComponents,
    ComponentNameCoreFuncs,
    ComponentNameCoreGlobals,
    ComponentNameCoreInstances,
    ComponentNameCoreMemories,
    ComponentNameCoreModules,
    ComponentNameCoreTables,
    ComponentNameCoreTypes,
    ComponentNameFuncs,
    ComponentNameInstances,
    ComponentNameTypes,
    ComponentNameValues,
    ComponentTypeComponent,
    ComponentTypeDeclarationAlias,
    ComponentTypeDeclarationExport,
    ComponentTypeDeclarationCoreType,
    ComponentTypeDeclarationImport,
    ComponentTypeDeclarationType,
    ComponentTypeFunc,
    ComponentTypeInstance,
    ComponentTypeResource,
    ComponentValTypePrimitive,
    ComponentValTypeResolved,
    ComponentValTypeType,
    CoreTypeFunc,
    CoreTypeModule,
    InstanceTypeDeclarationAlias,
    InstanceTypeDeclarationExport,
    InstanceTypeDeclarationCoreType,
    InstanceTypeDeclarationType,
    InstantiationArgKindInstance,
    ModuleTypeDeclarationType,
    ModuleTypeDeclarationExport,
    ModuleTypeDeclarationOuterAlias,
    ModuleTypeDeclarationImport,
    OuterAliasKindType,
    StorageTypeI16,
    StorageTypeI8,
    StorageTypeVal,
    StructuralTypeArray,
    StructuralTypeFunc,
    StructuralTypeStruct,
    ComponentTypeRefModule,
    ComponentTypeRefFunc,
    ComponentTypeRefValue,
    ComponentTypeRefType,
    ComponentTypeRefInstance,
    ComponentTypeRefComponent,
    TypeBoundsEq,
    TypeBoundsSubResource,
    TypeRefFunc,
    TypeRefGlobal,
    TypeRefMemory,
    TypeRefTable,
    TypeRefTag,
    ValTypeF32,
    ValTypeF64,
    ValTypeI32,
    ValTypeI64,
    ValTypeRef,
    ValTypeV128,
}

export const ModelTag_Count = ModelTag.ValTypeV128 + 1;

/** @deprecated Use TaggedElement instead */
export type ModelElement = TaggedElement;

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
    | CoreType
    | ComponentStartFunction

