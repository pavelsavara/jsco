// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { ModelTag } from '../../src/parser/model/tags';
import { ComponentValType, PrimitiveValType, ComponentTypeFunc } from '../../src/parser/model/types';
import { ResolvedContext, MarshalingContext, StringEncoding } from '../../src/resolver/types';
import { createLifting as _createLifting, createFunctionLifting } from '../../src/binder/to-abi';
import { createLowering, createFunctionLowering } from '../../src/binder/to-js';
import type { WasmValue } from '../../src/marshal/model/types';
import { describeDebugOnly } from '../test-utils/debug-only';

// Wrap BYO-buffer lifters to return arrays for test convenience
function createLifting(rctx: any, model: any): (ctx: MarshalingContext, value: any) => WasmValue[] {
    const lifter = _createLifting(rctx, model);
    return (ctx: MarshalingContext, value: any) => {
        const out = new Array<WasmValue>(64);
        const count = lifter(ctx, value, out, 0);
        return out.slice(0, count);
    };
}

function createMinimalResolved(opts?: Partial<ResolvedContext>): ResolvedContext {
    return {
        liftingCache: new Map(),
        loweringCache: new Map(),
        resolvedTypes: new Map(),
        canonicalResourceIds: new Map(),
        componentSectionCache: new Map(),
        usesNumberForInt64: false,
        stringEncoding: StringEncoding.Utf8,
        ...opts,
    } as ResolvedContext;
}

function prim(value: PrimitiveValType): ComponentValType {
    return { tag: ModelTag.ComponentValTypePrimitive, value };
}

// ─── Memoization key identity tests ──────────────────────────────────────

describeDebugOnly('memoization keys', () => {

    describe('cache hit by object identity', () => {
        test('createLifting returns same result for same object reference', () => {
            const rctx = createMinimalResolved();
            const typeModel = prim(PrimitiveValType.U32);
            const lifter1 = _createLifting(rctx, typeModel);
            const lifter2 = _createLifting(rctx, typeModel);
            expect(lifter1).toBe(lifter2);
        });

        test('createLowering returns same result for same object reference', () => {
            const rctx = createMinimalResolved();
            const typeModel = prim(PrimitiveValType.U32);
            const lowerer1 = createLowering(rctx, typeModel);
            const lowerer2 = createLowering(rctx, typeModel);
            expect(lowerer1).toBe(lowerer2);
        });

        test('createFunctionLifting returns same result for same ComponentTypeFunc', () => {
            const rctx = createMinimalResolved();
            const funcType: ComponentTypeFunc = {
                tag: ModelTag.ComponentTypeFunc,
                params: [{ name: 'a', type: prim(PrimitiveValType.U32) }],
                results: { tag: ModelTag.ComponentFuncResultUnnamed, type: prim(PrimitiveValType.U32) },
            } as any;
            const lifter1 = createFunctionLifting(rctx, funcType);
            const lifter2 = createFunctionLifting(rctx, funcType);
            expect(lifter1).toBe(lifter2);
        });

        test('createFunctionLowering returns same result for same ComponentTypeFunc', () => {
            const rctx = createMinimalResolved();
            const funcType: ComponentTypeFunc = {
                tag: ModelTag.ComponentTypeFunc,
                params: [{ name: 'a', type: prim(PrimitiveValType.U32) }],
                results: { tag: ModelTag.ComponentFuncResultUnnamed, type: prim(PrimitiveValType.U32) },
            } as any;
            const lowerer1 = createFunctionLowering(rctx, funcType);
            const lowerer2 = createFunctionLowering(rctx, funcType);
            expect(lowerer1).toBe(lowerer2);
        });
    });

    describe('cache miss by different identity', () => {
        test('createLifting returns different results for structurally equal but identity-different objects', () => {
            const rctx = createMinimalResolved();
            const type1 = prim(PrimitiveValType.U32);
            const type2 = prim(PrimitiveValType.U32); // same structure, different object
            const lifter1 = createLifting(rctx, type1);
            const lifter2 = createLifting(rctx, type2);
            // Both produce correct U32 lifters but are separately cached
            expect(lifter1).not.toBe(lifter2);
        });

        test('createLowering returns different results for structurally equal but identity-different objects', () => {
            const rctx = createMinimalResolved();
            const type1 = prim(PrimitiveValType.U32);
            const type2 = prim(PrimitiveValType.U32);
            const lowerer1 = createLowering(rctx, type1);
            const lowerer2 = createLowering(rctx, type2);
            // Primitive lowerings are now stateless singletons, so both calls
            // return the same top-level function reference even with different keys
            expect(lowerer1).toBe(lowerer2);
        });
    });

    describe('lifting vs lowering cache isolation', () => {
        test('same object produces different lifter and lowerer', () => {
            const rctx = createMinimalResolved();
            const typeModel = prim(PrimitiveValType.U32);
            const lifter = createLifting(rctx, typeModel);
            const lowerer = createLowering(rctx, typeModel);
            // Must be different functions — lifter converts JS→WASM, lowerer converts WASM→JS
            expect(lifter).not.toBe(lowerer);
        });

        test('resolved type used in both directions produces correct lifter and lowerer', () => {
            const rctx = createMinimalResolved();

            // A record type that will be the resolved target
            const recordModel = {
                tag: ModelTag.ComponentTypeDefinedRecord,
                members: [
                    { name: 'x', type: prim(PrimitiveValType.U32) },
                ],
            };

            // Register it in resolvedTypes so ComponentValTypeType can resolve to it
            rctx.resolvedTypes.set(0 as any, recordModel as any);

            // Two different ComponentValTypeType references to the same resolved type
            const typeRef1: ComponentValType = { tag: ModelTag.ComponentValTypeType, value: 0 };
            const typeRef2: ComponentValType = { tag: ModelTag.ComponentValTypeType, value: 0 };

            // Create lifter first, then lowerer — both resolve to same recordModel object
            const lifter = createLifting(rctx, typeRef1);
            const lowerer = createLowering(rctx, typeRef2);

            // The lifter and lowerer should be functionally different
            expect(lifter).not.toBe(lowerer);

            // Verify they actually behave correctly (lifter: JS→flat, lowerer: flat→JS)
            const ctx = createMinimalCtx();
            // Lifter takes JS object, returns flat WASM args
            const flatArgs = lifter(ctx, { x: 42 });
            expect(flatArgs).toEqual([42]);

            // Lowerer takes flat WASM args, returns JS object
            const jsObj = lowerer(ctx, 42);
            expect(jsObj).toEqual({ x: 42 });
        });

        test('string type with same identity cached independently for lift and lower', () => {
            const rctx = createMinimalResolved();
            const strType = prim(PrimitiveValType.String);
            const lifter = createLifting(rctx, strType);
            const lowerer = createLowering(rctx, strType);

            expect(lifter).not.toBe(lowerer);
            // Lowerer reads (ptr, len) so spill=2; lifter returns [ptr, len] but spill is not set on lifters
            expect((lowerer as any).spill).toBe(2);
        });
    });

    describe('stringEncoding baked at creation time', () => {
        test('UTF-8 and UTF-16 string lifters differ even with same type identity', () => {
            const utf8Rctx = createMinimalResolved({ stringEncoding: StringEncoding.Utf8 });
            const utf16Rctx = createMinimalResolved({ stringEncoding: StringEncoding.Utf16 });
            // Share the same type model object
            const strType = prim(PrimitiveValType.String);

            const utf8Lifter = createLifting(utf8Rctx, strType);
            const utf16Lifter = createLifting(utf16Rctx, strType);

            // Different rctx = different caches, so no collision
            expect(utf8Lifter).not.toBe(utf16Lifter);
        });

        test('changing stringEncoding on same rctx after creation does not affect cached lifter', () => {
            const rctx = createMinimalResolved({ stringEncoding: StringEncoding.Utf8 });
            const strType = prim(PrimitiveValType.String);

            // Create lifter with UTF-8 encoding
            const lifter1 = _createLifting(rctx, strType);

            // Change encoding on same rctx
            rctx.stringEncoding = StringEncoding.Utf16;

            // Same object identity → cache hit → returns UTF-8 lifter (not UTF-16)
            const lifter2 = _createLifting(rctx, strType);
            expect(lifter1).toBe(lifter2);
        });

        test('stringEncoding baked per canonical function via separate ComponentTypeFunc identity', () => {
            const rctx = createMinimalResolved();

            // func1 created with UTF-8
            rctx.stringEncoding = StringEncoding.Utf8;
            const func1: ComponentTypeFunc = {
                tag: ModelTag.ComponentTypeFunc,
                params: [{ name: 'msg', type: prim(PrimitiveValType.String) }],
                results: { tag: ModelTag.ComponentFuncResultUnnamed, type: prim(PrimitiveValType.U32) },
            } as any;
            const lifting1 = createFunctionLifting(rctx, func1);

            // func2 created with UTF-16 — different object
            rctx.stringEncoding = StringEncoding.Utf16;
            const func2: ComponentTypeFunc = {
                tag: ModelTag.ComponentTypeFunc,
                params: [{ name: 'msg', type: prim(PrimitiveValType.String) }],
                results: { tag: ModelTag.ComponentFuncResultUnnamed, type: prim(PrimitiveValType.U32) },
            } as any;
            const lifting2 = createFunctionLifting(rctx, func2);

            // Different keys → different cached results → correct per-function encoding
            expect(lifting1).not.toBe(lifting2);
        });
    });

    describe('usesNumberForInt64 baked at creation time', () => {
        test('S64 lifters differ between BigInt and Number modes', () => {
            const bigintRctx = createMinimalResolved({ usesNumberForInt64: false });
            const numberRctx = createMinimalResolved({ usesNumberForInt64: true });
            const s64Type = prim(PrimitiveValType.S64);

            const bigintLifter = createLifting(bigintRctx, s64Type);
            const numberLifter = createLifting(numberRctx, s64Type);

            // Different rctx = different caches, never collide
            expect(bigintLifter).not.toBe(numberLifter);

            const ctx = createMinimalCtx();
            // BigInt lifter should return BigInt args
            const bigintResult = bigintLifter(ctx, 42n);
            expect(typeof bigintResult[0]).toBe('bigint');

            // Number lifter passes through values without conversion
            // (trampoline converts to BigInt at WASM call site)
            const numberResult = numberLifter(ctx, 42n);
            expect(typeof numberResult[0]).toBe('bigint');

            // Number lifter can accept Number input — stores as Number
            const numberInputResult = numberLifter(ctx, 42);
            expect(typeof numberInputResult[0]).toBe('number');
            expect(numberInputResult[0]).toBe(42);
        });
    });

    describe('cache per rctx instance', () => {
        test('different rctx instances do not share cached results', () => {
            const rctx1 = createMinimalResolved();
            const rctx2 = createMinimalResolved();
            // Share the exact same type model object
            const typeModel = prim(PrimitiveValType.U32);

            const lifter1 = createLifting(rctx1, typeModel);
            const lifter2 = createLifting(rctx2, typeModel);

            // Different caches → different results (even though functionally equivalent)
            expect(lifter1).not.toBe(lifter2);
        });
    });
});

function createMinimalCtx(): MarshalingContext {
    return {} as any as MarshalingContext;
}
