export const enum ModelTag {
    Model = 'Model',

    /// sections
    CustomSection = 'CustomSection',
    CoreModule = 'ComponentModule',
    SkippedSection = 'SkippedSection',
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
    ComponentDefinedTypeBorrow = 'ComponentDefinedTypeBorrow',
    ComponentDefinedTypeEnum = 'ComponentDefinedTypeEnum',
    ComponentDefinedTypeFlags = 'ComponentDefinedTypeFlags',
    ComponentDefinedTypeList = 'ComponentDefinedTypeList',
    ComponentDefinedTypeOption = 'ComponentDefinedTypeOption',
    ComponentDefinedTypeOwn = 'ComponentDefinedTypeOwn',
    ComponentDefinedTypePrimitive = 'ComponentDefinedTypePrimitive',
    ComponentDefinedTypeRecord = 'ComponentDefinedTypeRecord',
    ComponentDefinedTypeResult = 'ComponentDefinedTypeResult',
    ComponentDefinedTypeTuple = 'ComponentDefinedTypeTuple',
    ComponentDefinedTypeVariant = 'ComponentDefinedTypeVariant',
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
    ComponentTypeDefined = 'ComponentTypeDefined',
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
