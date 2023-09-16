import { u32 } from './core';
import { IndexedElement, ModelTag } from './tags';

export type ComponentStartFunction = IndexedElement & {
    tag: ModelTag.ComponentStartFunction
    /// The index to the start function.
    func_index: u32,
    /// The start function arguments.
    ///
    /// The arguments are specified by value index.
    arguments: u32[],
    /// The number of expected results for the start function.
    results: u32,
}
