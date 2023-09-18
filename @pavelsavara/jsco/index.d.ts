//! Pavel Savara licenses this file to you under the MIT license.

type u32 = number;
type u64 = number;
type usize = number;
type RefType = number;

declare const enum ExternalKind {
    Func = "func",
    Table = "table",
    Memory = "memory",
    Global = "global",
    Tag = "tag"
}
type TypeRef = TypeRefFunc | TypeRefTable | TypeRefMemory | TypeRefGlobal | TypeRefTag;
type TypeRefFunc = {
    tag: ModelTag.TypeRefFunc;
    value: u32;
};
type TypeRefTable = TableType & {
    tag: ModelTag.TypeRefTable;
};
type TypeRefMemory = MemoryType & {
    tag: ModelTag.TypeRefMemory;
};
type TypeRefGlobal = GlobalType & {
    tag: ModelTag.TypeRefGlobal;
};
type TypeRefTag = {
    tag: ModelTag.TypeRefTag;
    value: u32;
};
type Import = {
    module: string;
    name: string;
    ty: TypeRef;
};
type Export = {
    name: string;
    kind: ExternalKind;
    index: u32;
};
type ValType = ValTypeI32 | ValTypeI64 | ValTypeF32 | ValTypeF64 | ValTypeV128 | ValTypeRef;
type ValTypeI32 = {
    tag: ModelTag.ValTypeI32;
};
type ValTypeI64 = {
    tag: ModelTag.ValTypeI64;
};
type ValTypeF32 = {
    tag: ModelTag.ValTypeF32;
};
type ValTypeF64 = {
    tag: ModelTag.ValTypeF64;
};
type ValTypeV128 = {
    tag: ModelTag.ValTypeV128;
};
type ValTypeRef = {
    tag: ModelTag.ValTypeRef;
    value: RefType;
};
type GlobalType = {
    content_type: ValType;
    mutable: boolean;
};
type MemoryType = {
    memory64: boolean;
    shared: boolean;
    initial: u64;
    maximum?: u64;
};
type SubType = {
    is_final: boolean;
    supertype_idx?: u32;
    structural_type: StructuralType;
};
type StructuralType = StructuralTypeFunc | StructuralTypeArray | StructuralTypeStruct;
type StructuralTypeFunc = FuncType & {
    tag: ModelTag.StructuralTypeFunc;
};
type StructuralTypeArray = ArrayType & {
    tag: ModelTag.StructuralTypeArray;
};
type StructuralTypeStruct = StructType & {
    tag: ModelTag.StructuralTypeStruct;
};
type TableType = {
    element_type: RefType;
    initial: u32;
    maximum?: u32;
};
type StructType = {
    fields: FieldType[];
};
type FieldType = {
    element_type: StorageType;
    mutable: boolean;
};
type StorageType = StorageTypeI8 | StorageTypeI16 | StorageTypeVal;
type StorageTypeI8 = {
    tag: ModelTag.StorageTypeI8;
};
type StorageTypeI16 = {
    tag: ModelTag.StorageTypeI16;
};
type StorageTypeVal = {
    tag: ModelTag.StorageTypeVal;
    type: ValType;
};
type ArrayType = {
    value: FieldType;
};
type FuncType = {
    params_results: ValType[];
    len_params: usize;
};

type CanonicalOption = CanonicalOptionUTF8 | CanonicalOptionUTF16 | CanonicalOptionCompactUTF16 | CanonicalOptionMemory | CanonicalOptionRealloc | CanonicalOptionPostReturn;
type CanonicalOptionUTF8 = {
    tag: ModelTag.CanonicalOptionUTF8;
};
type CanonicalOptionUTF16 = {
    tag: ModelTag.CanonicalOptionUTF16;
};
type CanonicalOptionCompactUTF16 = {
    tag: ModelTag.CanonicalOptionCompactUTF16;
};
type CanonicalOptionMemory = {
    tag: ModelTag.CanonicalOptionMemory;
    value: u32;
};
type CanonicalOptionRealloc = {
    tag: ModelTag.CanonicalOptionRealloc;
    value: u32;
};
type CanonicalOptionPostReturn = {
    tag: ModelTag.CanonicalOptionPostReturn;
    value: u32;
};
type CanonicalFunction = CanonicalFunctionLift | CanonicalFunctionLower | CanonicalFunctionResourceNew | CanonicalFunctionResourceDrop | CanonicalFunctionResourceRep;
type CanonicalFunctionLift = IndexedElement & {
    tag: ModelTag.CanonicalFunctionLift;
    core_func_index: u32;
    type_index: u32;
    options: CanonicalOption[];
};
type CanonicalFunctionLower = IndexedElement & {
    tag: ModelTag.CanonicalFunctionLower;
    func_index: u32;
    options: CanonicalOption[];
};
type CanonicalFunctionResourceNew = {
    tag: ModelTag.CanonicalFunctionResourceNew;
    resource: u32;
};
type CanonicalFunctionResourceDrop = {
    tag: ModelTag.CanonicalFunctionResourceDrop;
    resource: u32;
};
type CanonicalFunctionResourceRep = {
    tag: ModelTag.CanonicalFunctionResourceRep;
    resource: u32;
};

type OuterAliasKind = OuterAliasKindType;
type OuterAliasKindType = {
    tag: ModelTag.OuterAliasKindType;
};
type CoreType = CoreTypeFunc | CoreTypeModule;
type CoreTypeFunc = FuncType & {
    tag: ModelTag.CoreTypeFunc;
};
type CoreTypeModule = {
    tag: ModelTag.CoreTypeModule;
    declarations: ModuleTypeDeclaration[];
};
type ModuleTypeDeclaration = ModuleTypeDeclarationType | ModuleTypeDeclarationExport | ModuleTypeDeclarationOuterAlias | ModuleTypeDeclarationImport;
type ModuleTypeDeclarationType = SubType & {
    tag: ModelTag.ModuleTypeDeclarationType;
};
type ModuleTypeDeclarationExport = {
    name: string;
    ty: TypeRef;
};
type ModuleTypeDeclarationOuterAlias = {
    kind: OuterAliasKind;
    count: u32;
    index: u32;
};
type ModuleTypeDeclarationImport = Import & {
    tag: ModelTag.ModuleTypeDeclarationImport;
};
type ComponentValType = ComponentValTypePrimitive | ComponentValTypeType;
type ComponentValTypePrimitive = {
    tag: ModelTag.ComponentValTypePrimitive;
    value: PrimitiveValType;
};
type ComponentValTypeType = {
    tag: ModelTag.ComponentValTypeType;
    value: u32;
};
declare const enum PrimitiveValType {
    Bool = "bool",
    S8 = "s8",
    U8 = "u8",
    S16 = "s16",
    U16 = "u16",
    S32 = "s32",
    U32 = "u32",
    S64 = "s64",
    U64 = "u64",
    Float32 = "f32",
    Float64 = "f64",
    Char = "char",
    String = "string"
}
type ComponentType = ComponentTypeDefined | ComponentTypeFunc | ComponentTypeComponent | ComponentTypeInstance | ComponentTypeResource | ComponentSection | ComponentAliasInstanceExport;
type ComponentTypeFunc = IndexedElement & ComponentFuncType & {
    tag: ModelTag.ComponentTypeFunc;
};
type ComponentTypeComponent = IndexedElement & {
    tag: ModelTag.ComponentTypeComponent;
    declarations: ComponentTypeDeclaration[];
};
type ComponentTypeInstance = IndexedElement & {
    tag: ModelTag.ComponentTypeInstance;
    declarations: InstanceTypeDeclaration[];
};
type ComponentTypeResource = IndexedElement & {
    tag: ModelTag.ComponentTypeResource;
    rep: ValType;
    dtor?: u32;
};
type ComponentTypeDeclaration = ComponentTypeDeclarationCoreType | ComponentTypeDeclarationType | ComponentTypeDeclarationAlias | ComponentTypeDeclarationExport | ComponentTypeDeclarationImport;
type ComponentTypeDeclarationCoreType = {
    tag: ModelTag.ComponentTypeDeclarationCoreType;
    value: CoreType;
};
type ComponentTypeDeclarationType = {
    tag: ModelTag.ComponentTypeDeclarationType;
    value: ComponentType;
};
type ComponentTypeDeclarationAlias = {
    tag: ModelTag.ComponentTypeDeclarationAlias;
    value: ComponentAlias;
};
type ComponentTypeDeclarationExport = {
    tag: ModelTag.ComponentTypeDeclarationExport;
    name: ComponentExternName;
    ty: ComponentTypeRef;
};
type ComponentTypeDeclarationImport = ComponentImport & {};
type InstanceTypeDeclaration = InstanceTypeDeclarationCoreType | InstanceTypeDeclarationType | InstanceTypeDeclarationAlias | InstanceTypeDeclarationExport;
type InstanceTypeDeclarationCoreType = {
    tag: ModelTag.InstanceTypeDeclarationCoreType;
    value: CoreType;
};
type InstanceTypeDeclarationType = {
    tag: ModelTag.InstanceTypeDeclarationType;
    value: ComponentType;
};
type InstanceTypeDeclarationAlias = {
    tag: ModelTag.InstanceTypeDeclarationAlias;
    value: ComponentAlias;
};
type InstanceTypeDeclarationExport = {
    tag: ModelTag.InstanceTypeDeclarationExport;
    name: ComponentExternName;
    ty: ComponentTypeRef;
};
type ComponentFuncResult = ComponentFuncResultUnnamed | ComponentFuncResultNamed;
type ComponentFuncResultUnnamed = {
    tag: ModelTag.ComponentFuncResultUnnamed;
    type: ComponentValType;
};
type NamedValue = {
    name: string;
    type: ComponentValType;
};
type ComponentFuncResultNamed = {
    tag: ModelTag.ComponentFuncResultNamed;
    values: NamedValue[];
};
type ComponentFuncType = {
    params: NamedValue[];
    results: ComponentFuncResult;
};
type VariantCase = {
    name: string;
    ty?: ComponentValType;
    refines?: u32;
};
type ComponentTypeDefined = ComponentTypeDefinedPrimitive | ComponentTypeDefinedRecord | ComponentTypeDefinedVariant | ComponentTypeDefinedList | ComponentTypeDefinedTuple | ComponentTypeDefinedFlags | ComponentTypeDefinedEnum | ComponentTypeDefinedOption | ComponentTypeDefinedResult | ComponentTypeDefinedOwn | ComponentTypeDefinedBorrow;
type ComponentTypeDefinedPrimitive = IndexedElement & {
    tag: ModelTag.ComponentTypeDefinedPrimitive;
    value: PrimitiveValType;
};
type ComponentTypeDefinedRecord = IndexedElement & {
    tag: ModelTag.ComponentTypeDefinedRecord;
    members: {
        name: string;
        type: ComponentValType;
    }[];
};
type ComponentTypeDefinedVariant = IndexedElement & {
    tag: ModelTag.ComponentTypeDefinedVariant;
    variants: VariantCase[];
};
type ComponentTypeDefinedList = IndexedElement & {
    tag: ModelTag.ComponentTypeDefinedList;
    value: ComponentValType;
};
type ComponentTypeDefinedTuple = IndexedElement & {
    tag: ModelTag.ComponentTypeDefinedTuple;
    members: ComponentValType[];
};
type ComponentTypeDefinedFlags = IndexedElement & {
    tag: ModelTag.ComponentTypeDefinedFlags;
    members: string[];
};
type ComponentTypeDefinedEnum = IndexedElement & {
    tag: ModelTag.ComponentTypeDefinedEnum;
    members: string[];
};
type ComponentTypeDefinedOption = IndexedElement & {
    tag: ModelTag.ComponentTypeDefinedOption;
    value: ComponentValType;
};
type ComponentTypeDefinedResult = IndexedElement & {
    tag: ModelTag.ComponentTypeDefinedResult;
    ok?: ComponentValType;
    err?: ComponentValType;
};
type ComponentTypeDefinedOwn = IndexedElement & {
    tag: ModelTag.ComponentTypeDefinedOwn;
    value: u32;
};
type ComponentTypeDefinedBorrow = IndexedElement & {
    tag: ModelTag.ComponentTypeDefinedBorrow;
    value: u32;
};

type TypeBounds = TypeBoundsEq | TypeBoundsSubResource;
type TypeBoundsEq = {
    tag: ModelTag.TypeBoundsEq;
    value: u32;
};
type TypeBoundsSubResource = {
    tag: ModelTag.TypeBoundsSubResource;
};
type ComponentTypeRef = ComponentTypeRefModule | ComponentTypeRefFunc | ComponentTypeRefValue | ComponentTypeRefType | ComponentTypeRefInstance | ComponentTypeRefComponent;
type ComponentTypeRefModule = {
    tag: ModelTag.ComponentTypeRefModule;
    value: u32;
};
type ComponentTypeRefFunc = {
    tag: ModelTag.ComponentTypeRefFunc;
    value: u32;
};
type ComponentTypeRefValue = {
    tag: ModelTag.ComponentTypeRefValue;
    value: ComponentValType;
};
type ComponentTypeRefType = {
    tag: ModelTag.ComponentTypeRefType;
    value: TypeBounds;
};
type ComponentTypeRefInstance = {
    tag: ModelTag.ComponentTypeRefInstance;
    value: u32;
};
type ComponentTypeRefComponent = {
    tag: ModelTag.ComponentTypeRefComponent;
    value: u32;
};
type ComponentImport = IndexedElement & {
    tag: ModelTag.ComponentImport;
    name: ComponentExternName;
    ty: ComponentTypeRef;
};
type ComponentExternName = ComponentExternNameKebab | ComponentExternNameInterface;
type ComponentExternNameKebab = {
    tag: ModelTag.ComponentExternNameKebab;
    name: string;
};
type ComponentExternNameInterface = {
    tag: ModelTag.ComponentExternNameInterface;
    name: string;
};

declare const enum ComponentExternalKind {
    Module = "module",
    Func = "func",
    Value = "value",
    Type = "type",
    Instance = "instance",
    Component = "component"
}
type ComponentExport = IndexedElement & {
    tag: ModelTag.ComponentExport;
    name: ComponentExternName;
    kind: ComponentExternalKind;
    index: u32;
    ty?: ComponentTypeRef;
};

declare const enum ComponentOuterAliasKind {
    CoreModule = "coremodule",
    CoreType = "coretype",
    Type = "type",
    Component = "component"
}
type ComponentAlias = ComponentAliasInstanceExport | ComponentAliasCoreInstanceExport | ComponentAliasOuter;
type ComponentFunction = CanonicalFunctionLift | ComponentAliasInstanceExport;
type ComponentAliasInstanceExport = IndexedElement & {
    tag: ModelTag.ComponentAliasInstanceExport;
    kind: ComponentExternalKind;
    instance_index: u32;
    name: string;
};
type ComponentAliasCoreInstanceExport = IndexedElement & {
    tag: ModelTag.ComponentAliasCoreInstanceExport;
    kind: ExternalKind;
    instance_index: u32;
    name: string;
};
type CoreFunction = ComponentAliasCoreInstanceExport | CanonicalFunctionLower;
type ComponentAliasOuter = {
    tag: ModelTag.ComponentAliasOuter;
    kind: ComponentOuterAliasKind;
    count: u32;
    index: u32;
};

declare const enum InstantiationArgKind {
    Instance = "instance"
}
type InstantiationArg = {
    name: string;
    kind: InstantiationArgKind;
    index: u32;
};
type CoreInstance = CoreInstanceInstantiate | CoreInstanceFromExports;
type CoreInstanceInstantiate = IndexedElement & {
    tag: ModelTag.CoreInstanceInstantiate;
    module_index: u32;
    args: InstantiationArg[];
};
type CoreInstanceFromExports = IndexedElement & {
    tag: ModelTag.CoreInstanceFromExports;
    exports: Export[];
};
type ComponentInstantiationArg = {
    name: string;
    kind: ComponentExternalKind;
    index: u32;
};
type ComponentInstance = ComponentInstanceInstantiate | ComponentInstanceFromExports | ComponentTypeInstance;
type ComponentInstanceInstantiate = IndexedElement & {
    tag: ModelTag.ComponentInstanceInstantiate;
    component_index: u32;
    args: ComponentInstantiationArg[];
};
type ComponentInstanceFromExports = IndexedElement & {
    tag: ModelTag.ComponentInstanceFromExports;
    exports: ComponentExport[];
};

declare const enum ModelTag {
    Model = "Model",
    ModelElement = "ModelElement",
    CustomSection = "CustomSection",
    CoreModule = "CoreModule",
    SkippedSection = "SkippedSection",
    ComponentSection = "ComponentSection",
    ComponentStartFunction = "ComponentStartFunction",
    ComponentImport = "ComponentImport",
    ComponentExport = "ComponentExport",
    ComponentAliasCoreInstanceExport = "ComponentAliasCoreInstanceExport",
    ComponentAliasInstanceExport = "ComponentAliasInstanceExport",
    ComponentAliasOuter = "ComponentAliasOuter",
    ComponentInstanceFromExports = "ComponentInstanceFromExports",
    ComponentInstanceInstantiate = "ComponentInstanceInstantiate",
    CoreInstanceFromExports = "CoreInstanceFromExports",
    CoreInstanceInstantiate = "CoreInstanceInstantiate",
    CanonicalFunctionLift = "CanonicalFunctionLift",
    CanonicalFunctionLower = "CanonicalFunctionLower",
    CanonicalFunctionResourceDrop = "CanonicalFunctionResourceDrop",
    CanonicalFunctionResourceNew = "CanonicalFunctionResourceNew",
    CanonicalFunctionResourceRep = "CanonicalFunctionResourceRep",
    CanonicalOptionCompactUTF16 = "CanonicalOptionCompactUTF16",
    CanonicalOptionMemory = "CanonicalOptionMemory",
    CanonicalOptionPostReturn = "CanonicalOptionPostReturn",
    CanonicalOptionRealloc = "CanonicalOptionRealloc",
    CanonicalOptionUTF16 = "CanonicalOptionUTF16",
    CanonicalOptionUTF8 = "CanonicalOptionUTF8",
    ComponentTypeDefinedBorrow = "ComponentTypeDefinedBorrow",
    ComponentTypeDefinedEnum = "ComponentTypeDefinedEnum",
    ComponentTypeDefinedFlags = "ComponentTypeDefinedFlags",
    ComponentTypeDefinedList = "ComponentTypeDefinedList",
    ComponentTypeDefinedOption = "ComponentTypeDefinedOption",
    ComponentTypeDefinedOwn = "ComponentTypeDefinedOwn",
    ComponentTypeDefinedPrimitive = "ComponentTypeDefinedPrimitive",
    ComponentTypeDefinedRecord = "ComponentTypeDefinedRecord",
    ComponentTypeDefinedResult = "ComponentTypeDefinedResult",
    ComponentTypeDefinedTuple = "ComponentTypeDefinedTuple",
    ComponentTypeDefinedVariant = "ComponentTypeDefinedVariant",
    ComponentExternNameInterface = "ComponentExternNameInterface",
    ComponentExternNameKebab = "ComponentExternNameKebab",
    ComponentFuncResultNamed = "ComponentFuncResultNamed",
    ComponentFuncResultUnnamed = "ComponentFuncResultUnnamed",
    ComponentNameComponents = "ComponentNameComponents",
    ComponentNameCoreFuncs = "ComponentNameCoreFuncs",
    ComponentNameCoreGlobals = "ComponentNameCoreGlobals",
    ComponentNameCoreInstances = "ComponentNameCoreInstances",
    ComponentNameCoreMemories = "ComponentNameCoreMemories",
    ComponentNameCoreModules = "ComponentNameCoreModules",
    ComponentNameCoreTables = "ComponentNameCoreTables",
    ComponentNameCoreTypes = "ComponentNameCoreTypes",
    ComponentNameFuncs = "ComponentNameFuncs",
    ComponentNameInstances = "ComponentNameInstances",
    ComponentNameTypes = "ComponentNameTypes",
    ComponentNameValues = "ComponentNameValues",
    ComponentTypeComponent = "ComponentTypeComponent",
    ComponentTypeDeclarationAlias = "ComponentTypeDeclarationAlias",
    ComponentTypeDeclarationExport = "ComponentTypeDeclarationExport",
    ComponentTypeDeclarationCoreType = "ComponentTypeDeclarationCoreType",
    ComponentTypeDeclarationImport = "ComponentTypeDeclarationImport",
    ComponentTypeDeclarationType = "ComponentTypeDeclarationType",
    ComponentTypeFunc = "ComponentTypeFunc",
    ComponentTypeInstance = "ComponentTypeInstance",
    ComponentTypeResource = "ComponentTypeResource",
    ComponentValTypePrimitive = "ComponentValTypePrimitive",
    ComponentValTypeType = "ComponentValTypeType",
    CoreTypeFunc = "CoreTypeFunc",
    CoreTypeModule = "CoreTypeModule",
    InstanceTypeDeclarationAlias = "InstanceTypeDeclarationAlias",
    InstanceTypeDeclarationExport = "InstanceTypeDeclarationExport",
    InstanceTypeDeclarationCoreType = "InstanceTypeDeclarationCoreType",
    InstanceTypeDeclarationType = "InstanceTypeDeclarationType",
    InstantiationArgKindInstance = "InstantiationArgKindInstance",
    ModuleTypeDeclarationType = "ModuleTypeDeclarationType",
    ModuleTypeDeclarationExport = "ModuleTypeDeclarationExport",
    ModuleTypeDeclarationOuterAlias = "ModuleTypeDeclarationOuterAlias",
    ModuleTypeDeclarationImport = "ModuleTypeDeclarationImport",
    OuterAliasKindType = "OuterAliasKindType",
    StorageTypeI16 = "StorageTypeI16",
    StorageTypeI8 = "StorageTypeI8",
    StorageTypeVal = "StorageTypeVal",
    StructuralTypeArray = "StructuralTypeArray",
    StructuralTypeFunc = "StructuralTypeFunc",
    StructuralTypeStruct = "StructuralTypeStruct",
    ComponentTypeRefModule = "ComponentTypeRefModule",
    ComponentTypeRefFunc = "ComponentTypeRefFunc",
    ComponentTypeRefValue = "ComponentTypeRefValue",
    ComponentTypeRefType = "ComponentTypeRefType",
    ComponentTypeRefInstance = "ComponentTypeRefInstance",
    ComponentTypeRefComponent = "ComponentTypeRefComponent",
    TypeBoundsEq = "TypeBoundsEq",
    TypeBoundsSubResource = "TypeBoundsSubResource",
    TypeRefFunc = "TypeRefFunc",
    TypeRefGlobal = "TypeRefGlobal",
    TypeRefMemory = "TypeRefMemory",
    TypeRefTable = "TypeRefTable",
    TypeRefTag = "TypeRefTag",
    ValTypeF32 = "ValTypeF32",
    ValTypeF64 = "ValTypeF64",
    ValTypeI32 = "ValTypeI32",
    ValTypeI64 = "ValTypeI64",
    ValTypeRef = "ValTypeRef",
    ValTypeV128 = "ValTypeV128"
}
type IndexedElement = {
    selfSortIndex?: number;
};
type WITSection = CustomSection | SkippedSection | ComponentSection | ComponentImport | ComponentExport | ComponentAlias | CanonicalFunction | ComponentType | ComponentInstance | CoreModule | CoreInstance;

type CoreModule = IndexedElement & {
    tag: ModelTag.CoreModule;
    data?: Uint8Array;
    module?: Promise<WebAssembly.Module>;
};
type CustomSection = {
    tag: ModelTag.CustomSection;
    name: string;
    data?: Uint8Array;
};
type SkippedSection = {
    tag: ModelTag.SkippedSection;
    type: number;
    data?: Uint8Array;
};
type ComponentSection = IndexedElement & {
    tag: ModelTag.ComponentSection;
    sections: WITSection[];
};
type WITModel = WITSection[];
type ParserOptions = {
    otherSectionData?: boolean;
    compileStreaming?: typeof WebAssembly.compileStreaming;
    processCustomSection?: (section: CustomSection) => CustomSection;
};

declare function parse(componentOrUrl: string | ArrayLike<number> | ReadableStream<Uint8Array> | Response | PromiseLike<Response>, options?: ParserOptions): Promise<WITModel>;

type JsInterface = Record<string, Function>;
type JsInterfaceCollection = Record<string, JsInterface>;
type WasmComponentInstance<TJSExports> = {
    exports: JsExports<TJSExports>;
    abort: () => void;
};
type JsExports<TJSExports> = TJSExports & JsInterfaceCollection;
type JsImports = JsInterfaceCollection;
type WasmComponent<TJSExports> = {
    instantiate: WasmComponentFactory<TJSExports>;
};
type WasmComponentFactory<TJSExports> = (imports?: JsImports) => Promise<WasmComponentInstance<TJSExports>>;

type WasmPointer = number;
type WasmNumber = number | bigint;
type WasmSize = number;
type WasmValue = WasmPointer | WasmSize | WasmNumber;
type JsString = string;
type JsBoolean = boolean;
type JsNumber = number | bigint;
type JsValue = JsNumber | JsString | JsBoolean | any;
type LoweringToJs = (ctx: BindingContext, ...args: WasmValue[]) => JsValue;
type LiftingFromJs = (ctx: BindingContext, srcJsValue: JsValue) => WasmValue[];
type TCabiRealloc = (oldPtr: WasmPointer, oldSize: WasmSize, align: WasmSize, newSize: WasmSize) => WasmPointer;

type ComponentFactoryOptions = {
    useNumberForInt64?: boolean;
    wasmInstantiate?: typeof WebAssembly.instantiate;
};
type ComponentFactoryInput = WITModel | string | ArrayLike<number> | ReadableStream<Uint8Array> | Response | PromiseLike<Response>;
type IndexedModel = {
    coreModules: CoreModule[];
    coreInstances: CoreInstance[];
    coreFunctions: CoreFunction[];
    coreMemories: ComponentAliasCoreInstanceExport[];
    coreGlobals: ComponentAliasCoreInstanceExport[];
    coreTables: ComponentAliasCoreInstanceExport[];
    componentImports: ComponentImport[];
    componentExports: ComponentExport[];
    componentInstances: ComponentInstance[];
    componentTypeResource: ComponentTypeResource[];
    componentFunctions: ComponentFunction[];
    componentTypes: ComponentType[];
    componentSections: ComponentSection[];
};
type ResolverContext = {
    indexes: IndexedModel;
    usesNumberForInt64: boolean;
    wasmInstantiate: (moduleObject: WebAssembly.Module, importObject?: WebAssembly.Imports) => Promise<WebAssembly.Instance>;
};
type BindingContext = {
    componentImports: JsImports;
    coreInstances: BinderRes[];
    componentInstances: BinderRes[];
    initializeMemory(memory: WebAssembly.Memory): void;
    initializeRealloc(cabi_realloc: TCabiRealloc): void;
    utf8Decoder: TextDecoder;
    utf8Encoder: TextEncoder;
    getMemory: () => WebAssembly.Memory;
    getView: (ptr: WasmPointer, len: WasmSize) => DataView;
    getViewU8: (ptr: WasmPointer, len: WasmSize) => Uint8Array;
    alloc: (newSize: WasmSize, align: WasmSize) => WasmPointer;
    realloc: (oldPtr: WasmPointer, oldSize: WasmSize, align: WasmSize, newSize: WasmSize) => WasmPointer;
    readI32: (ptr: WasmPointer) => number;
    writeI32: (ptr: WasmPointer, value: number) => void;
    abort: () => void;
    debugStack?: string[];
};
type BinderRes = {
    result: any;
};

declare function instantiateComponent<TJSExports>(modelOrComponentOrUrl: ComponentFactoryInput, imports?: JsImports, options?: ComponentFactoryOptions & ParserOptions): Promise<WasmComponentInstance<TJSExports>>;
declare function createComponent<TJSExports>(modelOrComponentOrUrl: ComponentFactoryInput, options?: ComponentFactoryOptions & ParserOptions): Promise<WasmComponent<TJSExports>>;

declare function createLifting(rctx: ResolverContext, typeModel: ComponentValType | ComponentTypeInstance | InstanceTypeDeclaration | ComponentTypeDefined | ComponentAliasInstanceExport): LiftingFromJs;

declare function createLowering(rctx: ResolverContext, typeModel: ComponentValType): LoweringToJs;

declare function getBuildInfo(): {
    gitHash: any;
    configuration: any;
};

export { type WITModel, createComponent, createLifting, createLowering, getBuildInfo, instantiateComponent, parse };
