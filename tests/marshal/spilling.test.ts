// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { initializeAsserts } from '../../src/utils/assert';
initializeAsserts();

import { ModelTag } from '../../src/parser/model/tags';
import { ComponentTypeFunc, ComponentValType, PrimitiveValType, ComponentTypeDefinedRecord } from '../../src/parser/model/types';
import { ResolverContext, MarshalingContext } from '../../src/resolver/types';
import { createFunctionLifting } from '../../src/binder/to-abi';
import { createFunctionLowering } from '../../src/binder/to-js';
import type { WasmPointer, WasmSize } from '../../src/marshal/model/types';
import { describeDebugOnly } from '../test-utils/debug-only';

// ─── Mock helpers ──────────────────────────────────────────────────────────

function createMockRctx(): ResolverContext {
    return {
        resolved: {
            liftingCache: new Map(), loweringCache: new Map(),
            resolvedTypes: new Map(),
            usesNumberForInt64: false,
        },
        indexes: {
            coreModules: [],
            coreInstances: [],
            coreFunctions: [],
            coreMemories: [],
            coreGlobals: [],
            coreTables: [],
            componentImports: [],
            componentExports: [],
            componentInstances: [],
            componentTypeResource: [],
            componentFunctions: [],
            componentTypes: [],
            componentSections: [],
        },
    } as any as ResolverContext;
}

function createMockmctx(): { ctx: MarshalingContext, buffer: ArrayBuffer } {
    const buffer = new ArrayBuffer(4096);
    let nextAlloc = 64; // Start after some offset to catch ptr=0 bugs

    const memory = {
        initialize() { },
        getMemory: () => ({ buffer } as any),
        getView(ptr: WasmPointer, len: WasmSize): DataView {
            return new DataView(buffer, ptr as number, len as number);
        },
        getViewU8(ptr: WasmPointer, len: WasmSize): Uint8Array {
            return new Uint8Array(buffer, ptr as number, len as number);
        },
        readI32(ptr: WasmPointer): number {
            return new DataView(buffer).getInt32(ptr as number, true);
        },
        writeI32(ptr: WasmPointer, val: number): void {
            new DataView(buffer).setInt32(ptr as number, val, true);
        },
    };

    const allocator = {
        initialize() { },
        alloc(newSize: WasmSize, align: WasmSize): WasmPointer {
            const aligned = ((nextAlloc + (align as number) - 1) & ~((align as number) - 1));
            nextAlloc = aligned + (newSize as number);
            return aligned as WasmPointer;
        },
        realloc(oldPtr: WasmPointer, oldSize: WasmSize, align: WasmSize, newSize: WasmSize): WasmPointer {
            if ((newSize as number) === 0) return 0 as WasmPointer;
            const aligned = ((nextAlloc + (align as number) - 1) & ~((align as number) - 1));
            nextAlloc = aligned + (newSize as number);
            if ((oldPtr as number) !== 0 && (oldSize as number) > 0) {
                const copyLen = Math.min(oldSize as number, newSize as number);
                new Uint8Array(buffer, aligned, copyLen).set(
                    new Uint8Array(buffer, oldPtr as number, copyLen)
                );
            }
            return aligned as WasmPointer;
        },
    };

    const ctx = {
        memory,
        allocator,
        utf8Encoder: new TextEncoder(),
        utf8Decoder: new TextDecoder(),
        instances: { coreInstances: [], componentInstances: [] },
        componentImports: {},
        abort: () => { },
    } as any as MarshalingContext;

    return { ctx, buffer };
}

function prim(v: PrimitiveValType): ComponentValType {
    return { tag: ModelTag.ComponentValTypePrimitive, value: v };
}

function makeFunc(paramCount: number, resultType?: ComponentValType): ComponentTypeFunc {
    return {
        tag: ModelTag.ComponentTypeFunc,
        params: Array.from({ length: paramCount }, (_, i) => ({
            name: `p${i}`,
            type: prim(PrimitiveValType.U32),
        })),
        results: resultType
            ? { tag: ModelTag.ComponentFuncResultUnnamed, type: resultType }
            : { tag: ModelTag.ComponentFuncResultNamed, values: [] },
    } as any as ComponentTypeFunc;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describeDebugOnly('function trampolines', () => {

    // ── Flat params (within MAX_FLAT_PARAMS) ────────────────────────────

    describe('flat params (within MAX_FLAT_PARAMS)', () => {
        const smallFunc = makeFunc(2, prim(PrimitiveValType.U32));

        test('lifting trampoline: JS args → flat WASM args → JS result', () => {
            const rctx = createMockRctx();
            const { ctx } = createMockmctx();
            const lifter = createFunctionLifting(rctx.resolved, smallFunc);

            // Mock WASM function that adds its two u32 args
            const mockWasm = (a: number, b: number) => a + b;
            const jsFunc = lifter(ctx, mockWasm as any);

            const result = jsFunc(10, 20);
            expect(result).toBe(30);
        });

        test('lifting trampoline: preserves u32 identity for single args', () => {
            const rctx = createMockRctx();
            const { ctx } = createMockmctx();
            const singleParam = makeFunc(1, prim(PrimitiveValType.U32));
            const lifter = createFunctionLifting(rctx.resolved, singleParam);

            const mockWasm = (x: number) => x * 3;
            const jsFunc = lifter(ctx, mockWasm as any);

            expect(jsFunc(7)).toBe(21);
        });

        test('lowering trampoline: flat WASM args → JS args → WASM result', () => {
            const rctx = createMockRctx();
            const { ctx } = createMockmctx();
            const lowerer = createFunctionLowering(rctx.resolved, smallFunc);

            // Mock JS function
            const mockJs = (a: number, b: number) => a + b;
            const wasmFunc = lowerer(ctx, mockJs as any);

            // Lowering trampoline receives flat WASM args, calls JS, lifts result back
            const result = wasmFunc(10, 20);
            // Result should be a single lifted WASM value (u32)
            expect(result).toEqual(30);
        });
    });

    // ── Void result ─────────────────────────────────────────────────────

    describe('void result', () => {
        const voidFunc = makeFunc(1); // no result

        test('lifting trampoline: no result returns undefined', () => {
            const rctx = createMockRctx();
            const { ctx } = createMockmctx();
            const lifter = createFunctionLifting(rctx.resolved, voidFunc);

            let called = false;
            const mockWasm = (_x: number) => { called = true; };
            const jsFunc = lifter(ctx, mockWasm as any);

            const result = jsFunc(42);
            expect(called).toBe(true);
            expect(result).toBeUndefined();
        });

        test('lowering trampoline: void result returns undefined', () => {
            const rctx = createMockRctx();
            const { ctx } = createMockmctx();
            const lowerer = createFunctionLowering(rctx.resolved, voidFunc);

            let received: number | undefined;
            const mockJs = (x: number) => { received = x; };
            const wasmFunc = lowerer(ctx, mockJs as any);

            const result = wasmFunc(99);
            expect(received).toBe(99);
            expect(result).toBeUndefined();
        });
    });

    // ── Spilled params (>16 flat values) ────────────────────────────────

    describe('spilled params (>16 flat values)', () => {
        // 18 u32 params = 18 flat values > MAX_FLAT_PARAMS (16)
        const largeFunc = makeFunc(18, prim(PrimitiveValType.U32));

        test('lifting trampoline: JS args → memory ptr → WASM reads from memory', () => {
            const rctx = createMockRctx();
            const { ctx, buffer } = createMockmctx();
            const lifter = createFunctionLifting(rctx.resolved, largeFunc);

            // Mock WASM function receives 1 arg (the pointer), reads 18 u32s from memory
            const mockWasm = (ptr: number) => {
                const dv = new DataView(buffer);
                let sum = 0;
                for (let i = 0; i < 18; i++) {
                    sum += dv.getUint32(ptr + i * 4, true);
                }
                return sum;
            };

            const jsFunc = lifter(ctx, mockWasm as any);
            // Pass 18 args: 1, 2, 3, ..., 18
            const args = Array.from({ length: 18 }, (_, i) => i + 1);
            const result = jsFunc(...args);
            // Sum 1..18 = 171
            expect(result).toBe(171);
        });

        test('lifting trampoline: spilled params are 4-byte aligned u32s', () => {
            const rctx = createMockRctx();
            const { ctx, buffer } = createMockmctx();
            const lifter = createFunctionLifting(rctx.resolved, largeFunc);

            // Verify individual values at their memory offsets
            const mockWasm = (ptr: number) => {
                const dv = new DataView(buffer);
                // Check first and last values
                const first = dv.getUint32(ptr, true);
                const last = dv.getUint32(ptr + 17 * 4, true);
                return first * 1000 + last;
            };

            const jsFunc = lifter(ctx, mockWasm as any);
            const args = Array.from({ length: 18 }, (_, i) => i + 100);
            const result = jsFunc(...args);
            expect(result).toBe(100 * 1000 + 117);
        });

        test('lowering trampoline: memory ptr → JS receives expanded args', () => {
            const rctx = createMockRctx();
            const { ctx, buffer } = createMockmctx();
            const lowerer = createFunctionLowering(rctx.resolved, largeFunc);

            let receivedArgs: number[] = [];
            const mockJs = (...args: number[]) => {
                receivedArgs = args;
                return args.reduce((a, b) => a + b, 0);
            };

            const wasmFunc = lowerer(ctx, mockJs as any);

            // Prepare memory: write 18 u32 values at some pointer
            const ptr = 128;
            const dv = new DataView(buffer);
            for (let i = 0; i < 18; i++) {
                dv.setUint32(ptr + i * 4, (i + 1) * 10, true);
            }

            // WASM calls lowering trampoline with single pointer
            const result = wasmFunc(ptr);
            expect(receivedArgs).toHaveLength(18);
            expect(receivedArgs[0]).toBe(10);
            expect(receivedArgs[17]).toBe(180);
            // Result is lifted back: sum of 10+20+...+180 = 1710
            expect(result).toEqual(1710);
        });
    });

    // ── Spilled results (>1 flat value) ─────────────────────────────────

    describe('spilled results (>1 flat value)', () => {
        // Record with 2 u32 fields = 2 flat values > MAX_FLAT_RESULTS (1) → spill
        const recordType: ComponentTypeDefinedRecord = {
            tag: ModelTag.ComponentTypeDefinedRecord,
            members: [
                { name: 'x', type: prim(PrimitiveValType.U32) },
                { name: 'y', type: prim(PrimitiveValType.U32) },
            ],
        } as any;

        function makeRecordResultFunc(rctx: ResolverContext): ComponentTypeFunc {
            // Put the record type at index 0 in resolvedTypes
            rctx.resolved.resolvedTypes = new Map([[0, recordType]]) as any;
            rctx.indexes.componentTypes = [recordType as any];

            return {
                tag: ModelTag.ComponentTypeFunc,
                params: [{ name: 'a', type: prim(PrimitiveValType.U32) }],
                results: {
                    tag: ModelTag.ComponentFuncResultUnnamed,
                    type: { tag: ModelTag.ComponentValTypeType, value: 0 },
                },
            } as any as ComponentTypeFunc;
        }

        test('lifting trampoline: WASM returns ptr → JS reads record from memory', () => {
            const rctx = createMockRctx();
            const { ctx, buffer } = createMockmctx();
            const func = makeRecordResultFunc(rctx);
            const lifter = createFunctionLifting(rctx.resolved, func);

            // Mock WASM function: writes record {x, y} to memory, returns pointer
            const mockWasm = (a: number) => {
                const ptr = 256;
                const dv = new DataView(buffer);
                dv.setUint32(ptr, a * 2, true); // x = a * 2
                dv.setUint32(ptr + 4, a * 3, true); // y = a * 3
                return ptr;
            };

            const jsFunc = lifter(ctx, mockWasm as any);
            const result = jsFunc(5);
            expect(result).toEqual({ x: 10, y: 15 });
        });

        test('lifting trampoline: WASM result ptr with zero values', () => {
            const rctx = createMockRctx();
            const { ctx, buffer } = createMockmctx();
            const func = makeRecordResultFunc(rctx);
            const lifter = createFunctionLifting(rctx.resolved, func);

            const mockWasm = (_a: number) => {
                const ptr = 256;
                const dv = new DataView(buffer);
                dv.setUint32(ptr, 0, true);
                dv.setUint32(ptr + 4, 0, true);
                return ptr;
            };

            const jsFunc = lifter(ctx, mockWasm as any);
            const result = jsFunc(0);
            expect(result).toEqual({ x: 0, y: 0 });
        });

        test('lowering trampoline: JS returns record → written to retptr', () => {
            const rctx = createMockRctx();
            const { ctx, buffer } = createMockmctx();
            const func = makeRecordResultFunc(rctx);
            const lowerer = createFunctionLowering(rctx.resolved, func);

            // Mock JS function returns a record
            const mockJs = (a: number) => ({ x: a + 1, y: a + 2 });
            const wasmFunc = lowerer(ctx, mockJs as any);

            // WASM calls lowering trampoline: last arg is retptr
            const retptr = 512;
            const result = wasmFunc(10, retptr);

            // When results are spilled, the function returns nothing (WASM reads from retptr)
            expect(result).toBeUndefined();

            // Read back from memory at retptr
            const dv = new DataView(buffer);
            expect(dv.getUint32(retptr, true)).toBe(11); // x = 10 + 1
            expect(dv.getUint32(retptr + 4, true)).toBe(12); // y = 10 + 2
        });

        test('lowering trampoline: retptr record with large values', () => {
            const rctx = createMockRctx();
            const { ctx, buffer } = createMockmctx();
            const func = makeRecordResultFunc(rctx);
            const lowerer = createFunctionLowering(rctx.resolved, func);

            const mockJs = (_a: number) => ({ x: 0xDEADBEEF, y: 0xCAFEBABE });
            const wasmFunc = lowerer(ctx, mockJs as any);

            const retptr = 512;
            wasmFunc(1, retptr);

            const dv = new DataView(buffer);
            expect(dv.getUint32(retptr, true)).toBe(0xDEADBEEF);
            expect(dv.getUint32(retptr + 4, true)).toBe(0xCAFEBABE);
        });
    });

    // ── Combined: spilled params + spilled results ──────────────────────

    describe('spilled params + spilled results', () => {
        const recordType: ComponentTypeDefinedRecord = {
            tag: ModelTag.ComponentTypeDefinedRecord,
            members: [
                { name: 'sum', type: prim(PrimitiveValType.U32) },
                { name: 'count', type: prim(PrimitiveValType.U32) },
            ],
        } as any;

        function makeBothSpilledFunc(rctx: ResolverContext): ComponentTypeFunc {
            rctx.resolved.resolvedTypes = new Map([[0, recordType]]) as any;
            rctx.indexes.componentTypes = [recordType as any];

            // 18 u32 params (spilled) + record result (spilled)
            return {
                tag: ModelTag.ComponentTypeFunc,
                params: Array.from({ length: 18 }, (_, i) => ({
                    name: `p${i}`,
                    type: prim(PrimitiveValType.U32),
                })),
                results: {
                    tag: ModelTag.ComponentFuncResultUnnamed,
                    type: { tag: ModelTag.ComponentValTypeType, value: 0 },
                },
            } as any as ComponentTypeFunc;
        }

        test('lifting: JS → spilled params → WASM → spilled result → JS', () => {
            const rctx = createMockRctx();
            const { ctx, buffer } = createMockmctx();
            const func = makeBothSpilledFunc(rctx);
            const lifter = createFunctionLifting(rctx.resolved, func);

            // Mock WASM: reads 18 u32s from params ptr, writes result record
            const mockWasm = (paramsPtr: number) => {
                const dv = new DataView(buffer);
                let sum = 0;
                for (let i = 0; i < 18; i++) {
                    sum += dv.getUint32(paramsPtr + i * 4, true);
                }
                // Write result to a known location
                const resPtr = 1024;
                dv.setUint32(resPtr, sum, true); // sum
                dv.setUint32(resPtr + 4, 18, true); // count
                return resPtr;
            };

            const jsFunc = lifter(ctx, mockWasm as any);
            const args = Array.from({ length: 18 }, (_, i) => i + 1);
            const result = jsFunc(...args);
            expect(result).toEqual({ sum: 171, count: 18 });
        });
    });

    // ── Edge cases ──────────────────────────────────────────────────────

    describe('edge cases', () => {
        test('exactly 16 params stays flat (not spilled)', () => {
            const rctx = createMockRctx();
            const { ctx } = createMockmctx();
            const func16 = makeFunc(16, prim(PrimitiveValType.U32));
            const lifter = createFunctionLifting(rctx.resolved, func16);

            // Mock WASM receives 16 flat args (not a pointer)
            let argCount = 0;
            const mockWasm = (...args: number[]) => {
                argCount = args.length;
                return args[0]! + args[15]!;
            };
            const jsFunc = lifter(ctx, mockWasm as any);

            const args = Array.from({ length: 16 }, (_, i) => i + 1);
            const result = jsFunc(...args);
            expect(argCount).toBe(16); // All 16 passed flat
            expect(result).toBe(1 + 16); // first + last
        });

        test('17 params triggers spill', () => {
            const rctx = createMockRctx();
            const { ctx, buffer } = createMockmctx();
            const func17 = makeFunc(17, prim(PrimitiveValType.U32));
            const lifter = createFunctionLifting(rctx.resolved, func17);

            let argCount = 0;
            const mockWasm = (...args: number[]) => {
                argCount = args.length;
                // Should receive 1 arg (the pointer)
                const ptr = args[0]!;
                const dv = new DataView(buffer);
                return dv.getUint32(ptr, true); // read first value
            };
            const jsFunc = lifter(ctx, mockWasm as any);

            const args = Array.from({ length: 17 }, (_, i) => i + 100);
            const result = jsFunc(...args);
            expect(argCount).toBe(1); // spilled: single ptr arg
            expect(result).toBe(100); // first value
        });
    });
});
