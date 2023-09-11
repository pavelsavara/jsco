import { u32 } from './core';

/// Represents options for component functions.
export type CanonicalOption =
    | CanonicalOptionUTF8
    | CanonicalOptionUTF16
    | CanonicalOptionCompactUTF16
    | CanonicalOptionMemory
    | CanonicalOptionRealloc
    | CanonicalOptionPostReturn

/// The string types in the function signature are UTF-8 encoded.
export type CanonicalOptionUTF8 = {
    tag: 'CanonicalOptionUTF8'
}

/// The string types in the function signature are UTF-16 encoded.
export type CanonicalOptionUTF16 = {
    tag: 'CanonicalOptionUTF16'
}

/// The string types in the function signature are compact UTF-16 encoded.
export type CanonicalOptionCompactUTF16 = {
    tag: 'CanonicalOptionCompactUTF16'
}

/// The memory to use if the lifting or lowering of a function requires memory access.
///
/// The value is an index to a core memory.
export type CanonicalOptionMemory = {
    tag: 'CanonicalOptionMemory'
    value: u32
}
/// The realloc function to use if the lifting or lowering of a function requires memory
/// allocation.
///
/// The value is an index to a core function of type `(func (param i32 i32 i32 i32) (result i32))`.
export type CanonicalOptionRealloc = {
    tag: 'CanonicalOptionRealloc'
    value: u32
}

/// The post-return function to use if the lifting of a function requires
/// cleanup after the function returns.
export type CanonicalOptionPostReturn = {
    tag: 'CanonicalOptionPostReturn'
    value: u32
}

/// Represents a canonical function in a WebAssembly component.
export type CanonicalFunction =
    | CanonicalFunctionLift
    | CanonicalFunctionLower
    | CanonicalFunctionResourceNew
    | CanonicalFunctionResourceDrop
    | CanonicalFunctionResourceRep

/// The function lifts a core WebAssembly function to the canonical ABI.
export type CanonicalFunctionLift = {
    tag: 'CanonicalFunctionLift'
    /// The index of the core WebAssembly function to lift.
    core_func_index: u32,
    /// The index of the lifted function's type.
    type_index: u32,
    /// The canonical options for the function.
    options: CanonicalOption[],
}

/// The function lowers a canonical ABI function to a core WebAssembly function.
export type CanonicalFunctionLower = {
    tag: 'CanonicalFunctionLower'
    /// The index of the function to lower.
    func_index: u32,
    /// The canonical options for the function.
    options: CanonicalOption[],
}

/// A function which creates a new owned handle to a resource.
export type CanonicalFunctionResourceNew = {
    tag: 'CanonicalFunctionResourceNew'
    /// The type index of the resource that's being created.
    resource: u32,
}

/// A function which is used to drop resource handles of the specified type.
export type CanonicalFunctionResourceDrop = {
    tag: 'CanonicalFunctionResourceDrop'
    /// The type index of the resource that's being dropped.
    resource: u32,
}

/// A function which returns the underlying i32-based representation of the
/// specified resource.
export type CanonicalFunctionResourceRep = {
    tag: 'CanonicalFunctionResourceRep'
    /// The type index of the resource that's being accessed.
    resource: u32,
}