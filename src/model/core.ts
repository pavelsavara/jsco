export type u32 = number;
export type u64 = number;
export type u8 = number;
export type usize = number;
export type RefType = number;

/// External types as defined https://webassembly.github.io/spec/core/syntax/types.html#external-types.
export const enum ExternalKind {
    /// The external kind is a function.
    Func = 'func',
    /// The external kind if a table.
    Table = 'table',
    /// The external kind is a memory.
    Memory = 'memory',
    /// The external kind is a global.
    Global = 'global',
    /// The external kind is a tag.
    Tag = 'tag',
}

/// Represents a reference to a type definition in a WebAssembly module.
export type TypeRef =
    | TypeRefFunc
    | TypeRefTable
    | TypeRefMemory
    | TypeRefGlobal
    | TypeRefTag


/// The type is a function.
///
/// The value is an index into the type section.
export type TypeRefFunc = {
    tag: 'TypeRefFunc'
    value: u32
}
/// The type is a table.
export type TypeRefTable = {
    tag: 'TypeRefTable'
    value: TableType
}

/// The type is a memory.
export type TypeRefMemory = {
    tag: 'TypeRefMemory'
    value: MemoryType
}

/// The type is a global.
export type TypeRefGlobal = {
    tag: 'TypeRefGlobal'
    value: GlobalType
}

/// The type is a tag.
///
/// This variant is only used for the exception handling proposal.
///
/// The value is an index in the types index space.
export type TypeRefTag = {
    tag: 'TypeRefTag'
    value: u32
}

/// Represents an import in a WebAssembly module.
export type Import = {
    /// The module being imported from.
    module: string,
    /// The name of the imported item.
    name: string,
    /// The type of the imported item.
    ty: TypeRef,
}


export type Export = {
    /// The name of the exported item.
    name: string,
    /// The kind of the export.
    kind: ExternalKind,
    /// The index of the exported item.
    index: u32,
}

export type NameMap = Naming[];

export type Naming = {
    /// The index being named.
    index: u32,
    /// The name for the index.
    name: string,
}

/// Represents the types of values in a WebAssembly module.
export type ValType =
    | ValTypeI32
    | ValTypeI64
    | ValTypeF32
    | ValTypeF64
    | ValTypeV128
    | ValTypeRef

/// The value type is i32.
export type ValTypeI32 = {
    tag: 'ValTypeI32'
}

/// The value type is i64.
export type ValTypeI64 = {
    tag: 'ValTypeI64'
}

/// The value type is f32.
export type ValTypeF32 = {
    tag: 'ValTypeF32'
}

/// The value type is f64.
export type ValTypeF64 = {
    tag: 'ValTypeF64'
}

/// The value type is v128.
export type ValTypeV128 = {
    tag: 'ValTypeV128'
}

/// The value type is a reference.
export type ValTypeRef = {
    tag: 'ValTypeRef'
    value: RefType
}

/// Represents a global's type.
export type GlobalType = {
    /// The global's type.
    content_type: ValType,
    /// Whether or not the global is mutable.
    mutable: boolean,
}

/// Represents a memory's type.
export type MemoryType = {
    /// Whether or not this is a 64-bit memory, using i64 as an index. If this
    /// is false it's a 32-bit memory using i32 as an index.
    ///
    /// This is part of the memory64 proposal in WebAssembly.
    memory64: boolean,

    /// Whether or not this is a "shared" memory, indicating that it should be
    /// send-able across threads and the `maximum` field is always present for
    /// valid types.
    ///
    /// This is part of the threads proposal in WebAssembly.
    shared: boolean,

    /// Initial size of this memory, in wasm pages.
    ///
    /// For 32-bit memories (when `memory64` is `false`) this is guaranteed to
    /// be at most `u32::MAX` for valid types.
    initial: u64,

    /// Optional maximum size of this memory, in wasm pages.
    ///
    /// For 32-bit memories (when `memory64` is `false`) this is guaranteed to
    /// be at most `u32::MAX` for valid types. This field is always present for
    /// valid wasm memories when `shared` is `true`.
    maximum?: u64,
}

/// Represents a subtype of possible other types in a WebAssembly module.
export type SubType = {
    /// Is the subtype final.
    is_final: boolean,
    /// The list of supertype indexes. As of GC MVP, there can be at most one supertype.
    supertype_idx?: u32,
    /// The structural type of the subtype.
    structural_type: StructuralType,
}


/// Represents a structural type in a WebAssembly module.
export type StructuralType =
    | StructuralTypeFunc
    | StructuralTypeArray
    | StructuralTypeStruct


/// The type is for a function.
export type StructuralTypeFunc = {
    tag: 'StructuralTypeFunc'
    value: FuncType
}

/// The type is for an array.
export type StructuralTypeArray = {
    tag: 'StructuralTypeArray'
    value: ArrayType
}

/// The type is for a struct.
export type StructuralTypeStruct = {
    tag: 'StructuralTypeStruct'
    value: StructType
}

/// Represents a table's type.
export type TableType = {
    /// The table's element type.
    element_type: RefType,
    /// Initial size of this table, in elements.
    initial: u32,
    /// Optional maximum size of the table, in elements.
    maximum?: u32,
}

/// Represents a type of a struct in a WebAssembly module.
export type StructType = {
    /// Struct fields.
    fields: FieldType[],
}

/// Represents a field type of an array or a struct.
export type FieldType = {
    /// Array element type.
    element_type: StorageType,
    /// Are elements mutable.
    mutable: boolean,
}

/// Represents storage types introduced in the GC spec for array and struct fields.
export type StorageType =
    | StorageTypeI8
    | StorageTypeI16
    | StorageTypeVal

/// The storage type is i8.
export type StorageTypeI8 = {
    tag: 'StorageTypeI8'
}

/// The storage type is i16.
export type StorageTypeI16 = {
    tag: 'StorageTypeI16'
}

/// The storage type is a value type.
export type StorageTypeVal = {
    tag: 'StorageTypeVal'
    value: ValType
}

/// Represents a type of an array in a WebAssembly module.
export type ArrayType = {
    value: FieldType
}

/// Represents a type of a function in a WebAssembly module.
export type FuncType = {
    /// The combined parameters and result types.
    params_results: ValType[],
    /// The number of parameter types.
    len_params: usize,
}
