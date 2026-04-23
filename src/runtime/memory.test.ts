// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { initializeAsserts } from '../utils/assert';
initializeAsserts();

import { createMemoryView, createAllocator } from './memory';

describe('MemoryView', () => {
    test('initialize and getMemory', () => {
        const mv = createMemoryView();
        const mem = new WebAssembly.Memory({ initial: 1 });
        mv.initialize(mem);
        expect(mv.getMemory()).toBe(mem);
    });

    test('getView returns DataView at correct offset and length', () => {
        const mv = createMemoryView();
        const mem = new WebAssembly.Memory({ initial: 1 });
        mv.initialize(mem);
        const view = mv.getView(0, 16);
        expect(view).toBeInstanceOf(DataView);
        expect(view.byteLength).toBe(16);
        expect(view.byteOffset).toBe(0);
    });

    test('getViewU8 returns Uint8Array at correct offset and length', () => {
        const mv = createMemoryView();
        const mem = new WebAssembly.Memory({ initial: 1 });
        mv.initialize(mem);
        const view = mv.getViewU8(8, 32);
        expect(view).toBeInstanceOf(Uint8Array);
        expect(view.length).toBe(32);
        expect(view.byteOffset).toBe(8);
    });

    test('writeI32 and readI32 round-trip', () => {
        const mv = createMemoryView();
        const mem = new WebAssembly.Memory({ initial: 1 });
        mv.initialize(mem);
        mv.writeI32(0, 42);
        expect(mv.readI32(0)).toBe(42);
        mv.writeI32(4, -1);
        expect(mv.readI32(4)).toBe(-1);
    });

    test('views reflect current memory buffer after growth', () => {
        const mv = createMemoryView();
        const mem = new WebAssembly.Memory({ initial: 1, maximum: 2 });
        mv.initialize(mem);
        mv.writeI32(0, 99);
        mem.grow(1);
        // After grow, the buffer is detached and replaced — getView should use the new buffer
        expect(mv.readI32(0)).toBe(99);
        const view = mv.getViewU8(0, 65536 * 2);
        expect(view.length).toBe(65536 * 2);
    });
});

describe('Allocator', () => {
    test('isInitialized returns false before initialization', () => {
        const alloc = createAllocator();
        expect(alloc.isInitialized()).toBe(false);
    });

    test('initialize and isInitialized', () => {
        const alloc = createAllocator();
        const realloc = ((_o: number, _os: number, _a: number, ns: number) => ns) as any;
        alloc.initialize(realloc);
        expect(alloc.isInitialized()).toBe(true);
    });

    test('alloc calls realloc with (0, 0, align, newSize)', () => {
        const alloc = createAllocator();
        const calls: number[][] = [];
        const realloc = ((o: number, os: number, a: number, ns: number) => { calls.push([o, os, a, ns]); return ns; }) as any;
        alloc.initialize(realloc);
        alloc.alloc(64, 8);
        expect(calls).toEqual([[0, 0, 8, 64]]);
    });

    test('realloc forwards all 4 arguments', () => {
        const alloc = createAllocator();
        const calls: number[][] = [];
        const realloc = ((o: number, os: number, a: number, ns: number) => { calls.push([o, os, a, ns]); return ns; }) as any;
        alloc.initialize(realloc);
        alloc.realloc(100 as any, 50 as any, 4 as any, 200 as any);
        expect(calls).toEqual([[100, 50, 4, 200]]);
    });
});
