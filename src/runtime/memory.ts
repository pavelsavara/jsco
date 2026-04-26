// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { TCabiRealloc, WasmPointer, WasmSize } from '../marshal/model/types';
import type { MemoryView, Allocator } from './model/types';

export function createMemoryView(): MemoryView {
    let memory: WebAssembly.Memory = undefined as any;

    function initialize(m: WebAssembly.Memory): void {
        memory = m;
    }
    function getView(pointer?: number, len?: number): DataView {
        return new DataView(memory.buffer, pointer, len);
    }
    function getViewU8(pointer?: number, len?: number): Uint8Array {
        return new Uint8Array(memory.buffer, pointer, len);
    }
    function getMemory(): WebAssembly.Memory {
        return memory;
    }
    function readI32(ptr: WasmPointer): number {
        return getView().getInt32(ptr);
    }
    function writeI32(ptr: WasmPointer, value: number): void {
        getView().setInt32(ptr, value);
    }
    return { initialize, getMemory, getView, getViewU8, readI32, writeI32 };
}

export function createAllocator(): Allocator {
    let cabi_realloc: TCabiRealloc = undefined as any;

    function initialize(realloc: TCabiRealloc): void {
        cabi_realloc = realloc;
    }
    function isInitialized(): boolean {
        return cabi_realloc !== undefined;
    }
    function realloc(oldPtr: WasmPointer, oldSize: WasmSize, align: WasmSize, newSize: WasmSize): WasmPointer {
        return cabi_realloc(oldPtr, oldSize, align, newSize);
    }
    function alloc(newSize: WasmSize, align: WasmSize): WasmPointer {
        return cabi_realloc(0 as any, 0 as any, align, newSize);
    }
    return { initialize, isInitialized, alloc, realloc };
}
