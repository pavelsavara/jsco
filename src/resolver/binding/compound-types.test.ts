import { setConfiguration } from '../../utils/assert';
setConfiguration('Debug');

import { ModelTag } from '../../model/tags';
import { ComponentValType, PrimitiveValType } from '../../model/types';
import { ResolverContext, BindingContext } from '../types';
import { createLifting as _createLifting } from './to-abi';
import { createLowering } from './to-js';
import { WasmPointer, WasmSize, WasmValue } from './types';

// Wrap BYO-buffer lifters to return arrays for test convenience
function createLifting(rctx: any, model: any): (ctx: BindingContext, value: any) => WasmValue[] {
    const lifter = _createLifting(rctx, model);
    return (ctx: BindingContext, value: any) => {
        const out = new Array<WasmValue>(64);
        const count = lifter(ctx, value, out, 0);
        return out.slice(0, count);
    };
}

function createMinimalRctx(): ResolverContext {
    return {
        resolved: {
            liftingCache: new Map(), loweringCache: new Map(),
            resolvedTypes: new Map(),
            usesNumberForInt64: false,
        },
    } as any as ResolverContext;
}

function createMinimalBctx(): BindingContext {
    return {} as any as BindingContext;
}

function createMockMemoryContext(): { ctx: BindingContext, buffer: ArrayBuffer } {
    const buffer = new ArrayBuffer(1024);
    let nextAlloc = 0;

    const memory = {
        getMemory() {
            return { buffer } as any;
        },
        getView(ptr: WasmPointer, len: WasmSize): DataView {
            return new DataView(buffer, ptr, len);
        },
        getViewU8(ptr: WasmPointer, len: WasmSize): Uint8Array {
            return new Uint8Array(buffer, ptr, len);
        },
        readI32(ptr: WasmPointer): number {
            return new DataView(buffer).getInt32(ptr, true);
        },
        writeI32(ptr: WasmPointer, value: number): void {
            new DataView(buffer).setInt32(ptr, value, true);
        },
    };

    const allocator = {
        realloc(oldPtr: WasmPointer, oldSize: WasmSize, align: WasmSize, newSize: WasmSize): WasmPointer {
            if (newSize === 0) return 0 as WasmPointer;
            const aligned = ((nextAlloc + (align as number) - 1) & ~((align as number) - 1));
            const ptr = aligned;
            nextAlloc = aligned + (newSize as number);
            if ((oldPtr as number) !== 0 && (oldSize as number) > 0) {
                const copyLen = Math.min(oldSize as number, newSize as number);
                new Uint8Array(buffer, ptr, copyLen).set(
                    new Uint8Array(buffer, oldPtr as number, copyLen)
                );
            }
            return ptr as WasmPointer;
        },
    };

    const ctx = {
        memory,
        allocator,
        utf8Encoder: new TextEncoder(),
        utf8Decoder: new TextDecoder(),
    } as any as BindingContext;

    return { ctx, buffer };
}

function optionModel(inner: ComponentValType) {
    return {
        tag: ModelTag.ComponentTypeDefinedOption as const,
        value: inner,
    };
}

function prim(value: PrimitiveValType): ComponentValType {
    return { tag: ModelTag.ComponentValTypePrimitive, value };
}

// ─── Option lifting (JS → WASM) ───────────────────────────────────────────

describe('option lifting (JS → WASM)', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    test('null lifts to [0, 0] (None)', () => {
        const lifter = createLifting(rctx.resolved, optionModel(prim(PrimitiveValType.U32)));
        expect(lifter(bctx, null)).toEqual([0, 0]);
    });

    test('undefined lifts to [0, 0] (None)', () => {
        const lifter = createLifting(rctx.resolved, optionModel(prim(PrimitiveValType.U32)));
        expect(lifter(bctx, undefined)).toEqual([0, 0]);
    });

    test('42 lifts to [1, 42] (Some(42))', () => {
        const lifter = createLifting(rctx.resolved, optionModel(prim(PrimitiveValType.U32)));
        expect(lifter(bctx, 42)).toEqual([1, 42]);
    });

    test('0 lifts to [1, 0] (Some(0), not None)', () => {
        const lifter = createLifting(rctx.resolved, optionModel(prim(PrimitiveValType.U32)));
        expect(lifter(bctx, 0)).toEqual([1, 0]);
    });

    test('false lifts to [1, 0] for option<bool>', () => {
        const lifter = createLifting(rctx.resolved, optionModel(prim(PrimitiveValType.Bool)));
        expect(lifter(bctx, false)).toEqual([1, 0]);
    });

    test('true lifts to [1, 1] for option<bool>', () => {
        const lifter = createLifting(rctx.resolved, optionModel(prim(PrimitiveValType.Bool)));
        expect(lifter(bctx, true)).toEqual([1, 1]);
    });
});

// ─── Option lowering (WASM → JS) ──────────────────────────────────────────

describe('option lowering (WASM → JS)', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    test('discriminant 0 lowers to null (None)', () => {
        const lowerer = createLowering(rctx.resolved, optionModel(prim(PrimitiveValType.U32)));
        expect(lowerer(bctx, 0, 0)).toBeNull();
    });

    test('discriminant 1 with 42 lowers to 42 (Some(42))', () => {
        const lowerer = createLowering(rctx.resolved, optionModel(prim(PrimitiveValType.U32)));
        expect(lowerer(bctx, 1, 42)).toBe(42);
    });

    test('discriminant 1 with 0 lowers to 0 (Some(0))', () => {
        const lowerer = createLowering(rctx.resolved, optionModel(prim(PrimitiveValType.U32)));
        expect(lowerer(bctx, 1, 0)).toBe(0);
    });

    test('spill is 2 (1 discriminant + 1 u32)', () => {
        const lowerer = createLowering(rctx.resolved, optionModel(prim(PrimitiveValType.U32)));
        expect((lowerer as any).spill).toBe(2);
    });
});

// ─── Nested option (option<option<u32>>) ───────────────────────────────────

describe('nested option<option<u32>>', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    const nestedOptionModel = () => optionModel({
        tag: ModelTag.ComponentValTypePrimitive,
        value: PrimitiveValType.U32,
    } as ComponentValType);

    const _outerModel = () => optionModel(nestedOptionModel() as any as ComponentValType);

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
        // Register inner option as a resolved type so the outer can resolve it
        // The inner option is option<u32> and when used as ComponentValTypeType
        // we need it in resolvedTypes. But here we use it inline as ComponentValTypePrimitive won't work.
        // Actually, for nested options to work with inline models, the inner model
        // needs to be a ComponentTypeDefinedOption directly. Let's use resolvedTypes.
        const innerOption = optionModel(prim(PrimitiveValType.U32));
        rctx.resolved.resolvedTypes = new Map([[0 as any, innerOption as any]]);
    });

    test('null lifts to [0, 0, 0] (outer None)', () => {
        const model = optionModel({ tag: ModelTag.ComponentValTypeType, value: 0 } as ComponentValType);
        const lifter = createLifting(rctx.resolved, model);
        expect(lifter(bctx, null)).toEqual([0, 0, 0]);
    });

    test('null inner lifts to [1, 0, 0] (outer Some, inner None)', () => {
        const model = optionModel({ tag: ModelTag.ComponentValTypeType, value: 0 } as ComponentValType);
        const lifter = createLifting(rctx.resolved, model);
        expect(lifter(bctx, null)).toEqual([0, 0, 0]);
        // Passing null → inner None: the inner lifter is called with null
        // outer Some(null) means the JS value is null, which means inner is None
        // For this to work, we pass null as the value to the inner lifter
    });

    test('42 lifts to [1, 1, 42] (outer Some, inner Some(42))', () => {
        const model = optionModel({ tag: ModelTag.ComponentValTypeType, value: 0 } as ComponentValType);
        const lifter = createLifting(rctx.resolved, model);
        expect(lifter(bctx, 42)).toEqual([1, 1, 42]);
    });

    test('nested option lowering: [0, 0, 0] → null (outer None)', () => {
        const model = optionModel({ tag: ModelTag.ComponentValTypeType, value: 0 } as ComponentValType);
        const lowerer = createLowering(rctx.resolved, model);
        expect(lowerer(bctx, 0, 0, 0)).toBeNull();
    });

    test('nested option lowering: [1, 0, 0] → null (outer Some, inner None)', () => {
        const model = optionModel({ tag: ModelTag.ComponentValTypeType, value: 0 } as ComponentValType);
        const lowerer = createLowering(rctx.resolved, model);
        expect(lowerer(bctx, 1, 0, 0)).toBeNull();
    });

    test('nested option lowering: [1, 1, 42] → 42 (outer Some, inner Some(42))', () => {
        const model = optionModel({ tag: ModelTag.ComponentValTypeType, value: 0 } as ComponentValType);
        const lowerer = createLowering(rctx.resolved, model);
        expect(lowerer(bctx, 1, 1, 42)).toBe(42);
    });

    test('nested option spill is 3 (1 + 1 + 1)', () => {
        const model = optionModel({ tag: ModelTag.ComponentValTypeType, value: 0 } as ComponentValType);
        const lowerer = createLowering(rctx.resolved, model);
        expect((lowerer as any).spill).toBe(3);
    });
});

// ─── Result lifting (JS → WASM) ───────────────────────────────────────────

describe('result lifting (JS → WASM)', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    const resultU32S32Model = {
        tag: ModelTag.ComponentTypeDefinedResult as const,
        ok: prim(PrimitiveValType.U32),
        err: prim(PrimitiveValType.S32),
    };

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    test('{tag:"ok", val:42} lifts to [0, 42]', () => {
        const lifter = createLifting(rctx.resolved, resultU32S32Model);
        expect(lifter(bctx, { tag: 'ok', val: 42 })).toEqual([0, 42]);
    });

    test('{tag:"err", val:-1} lifts to [1, -1]', () => {
        const lifter = createLifting(rctx.resolved, resultU32S32Model);
        expect(lifter(bctx, { tag: 'err', val: -1 })).toEqual([1, -1]);
    });

    test('{tag:"ok", val:0} lifts to [0, 0]', () => {
        const lifter = createLifting(rctx.resolved, resultU32S32Model);
        expect(lifter(bctx, { tag: 'ok', val: 0 })).toEqual([0, 0]);
    });
});

// ─── Result lowering (WASM → JS) ──────────────────────────────────────────

describe('result lowering (WASM → JS)', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    const resultU32S32Model = {
        tag: ModelTag.ComponentTypeDefinedResult as const,
        ok: prim(PrimitiveValType.U32),
        err: prim(PrimitiveValType.S32),
    };

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    test('discriminant 0 with 42 lowers to {tag:"ok", val:42}', () => {
        const lowerer = createLowering(rctx.resolved, resultU32S32Model);
        expect(lowerer(bctx, 0, 42)).toEqual({ tag: 'ok', val: 42 });
    });

    test('discriminant 1 with -1 lowers to {tag:"err", val:-1}', () => {
        const lowerer = createLowering(rctx.resolved, resultU32S32Model);
        expect(lowerer(bctx, 1, -1)).toEqual({ tag: 'err', val: -1 });
    });

    test('discriminant 0 with 0 lowers to {tag:"ok", val:0}', () => {
        const lowerer = createLowering(rctx.resolved, resultU32S32Model);
        expect(lowerer(bctx, 0, 0)).toEqual({ tag: 'ok', val: 0 });
    });

    test('spill is 2 (1 discriminant + max(1,1))', () => {
        const lowerer = createLowering(rctx.resolved, resultU32S32Model);
        expect((lowerer as any).spill).toBe(2);
    });
});

// ─── Result with no error type ─────────────────────────────────────────────

describe('result with no error type', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    const resultOkOnlyModel = {
        tag: ModelTag.ComponentTypeDefinedResult as const,
        ok: prim(PrimitiveValType.U32),
    };

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    test('{tag:"ok", val:42} lifts to [0, 42]', () => {
        const lifter = createLifting(rctx.resolved, resultOkOnlyModel);
        expect(lifter(bctx, { tag: 'ok', val: 42 })).toEqual([0, 42]);
    });

    test('{tag:"err"} lifts to [1, 0]', () => {
        const lifter = createLifting(rctx.resolved, resultOkOnlyModel);
        expect(lifter(bctx, { tag: 'err' })).toEqual([1, 0]);
    });

    test('lowering ok: discriminant 0 with 42 → {tag:"ok", val:42}', () => {
        const lowerer = createLowering(rctx.resolved, resultOkOnlyModel);
        expect(lowerer(bctx, 0, 42)).toEqual({ tag: 'ok', val: 42 });
    });

    test('lowering err: discriminant 1 → {tag:"err", val:undefined}', () => {
        const lowerer = createLowering(rctx.resolved, resultOkOnlyModel);
        expect(lowerer(bctx, 1, 0)).toEqual({ tag: 'err', val: undefined });
    });

    test('spill is 2 (1 discriminant + max(1,0)=1)', () => {
        const lowerer = createLowering(rctx.resolved, resultOkOnlyModel);
        expect((lowerer as any).spill).toBe(2);
    });
});

// ─── Result with no ok type ────────────────────────────────────────────────

describe('result with no ok type (error-only)', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    const resultErrOnlyModel = {
        tag: ModelTag.ComponentTypeDefinedResult as const,
        err: prim(PrimitiveValType.S32),
    };

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    test('{tag:"ok"} lifts to [0, 0]', () => {
        const lifter = createLifting(rctx.resolved, resultErrOnlyModel);
        expect(lifter(bctx, { tag: 'ok' })).toEqual([0, 0]);
    });

    test('{tag:"err", val:-99} lifts to [1, -99]', () => {
        const lifter = createLifting(rctx.resolved, resultErrOnlyModel);
        expect(lifter(bctx, { tag: 'err', val: -99 })).toEqual([1, -99]);
    });

    test('lowering ok: discriminant 0 → {tag:"ok", val:undefined}', () => {
        const lowerer = createLowering(rctx.resolved, resultErrOnlyModel);
        expect(lowerer(bctx, 0, 0)).toEqual({ tag: 'ok', val: undefined });
    });

    test('lowering err: discriminant 1 with -99 → {tag:"err", val:-99}', () => {
        const lowerer = createLowering(rctx.resolved, resultErrOnlyModel);
        expect(lowerer(bctx, 1, -99)).toEqual({ tag: 'err', val: -99 });
    });
});

// ─── List lifting (JS → WASM) ─────────────────────────────────────────────

describe('list lifting (JS → WASM)', () => {
    const listU32Model = {
        tag: ModelTag.ComponentTypeDefinedList as const,
        value: prim(PrimitiveValType.U32),
    };

    const listBoolModel = {
        tag: ModelTag.ComponentTypeDefinedList as const,
        value: prim(PrimitiveValType.Bool),
    };

    test('[1, 2, 3] lifts to [ptr, 3] with correct memory layout', () => {
        const rctx = createMinimalRctx();
        const { ctx, buffer } = createMockMemoryContext();
        const lifter = createLifting(rctx.resolved, listU32Model);
        const result = lifter(ctx, [1, 2, 3]);

        expect(result).toHaveLength(2);
        const [ptr, len] = result;
        expect(len).toBe(3);

        // Verify memory contents: 3 x u32 little-endian
        const dv = new DataView(buffer, ptr as number, 12);
        expect(dv.getUint32(0, true)).toBe(1);
        expect(dv.getUint32(4, true)).toBe(2);
        expect(dv.getUint32(8, true)).toBe(3);
    });

    test('empty array lifts to [0, 0]', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();
        const lifter = createLifting(rctx.resolved, listU32Model);
        expect(lifter(ctx, [])).toEqual([0, 0]);
    });

    test('single-element list lifts correctly', () => {
        const rctx = createMinimalRctx();
        const { ctx, buffer } = createMockMemoryContext();
        const lifter = createLifting(rctx.resolved, listU32Model);
        const result = lifter(ctx, [99]);

        expect(result).toHaveLength(2);
        const [ptr, len] = result;
        expect(len).toBe(1);

        const dv = new DataView(buffer, ptr as number, 4);
        expect(dv.getUint32(0, true)).toBe(99);
    });

    test('list<bool> [true, false, true] stores [1, 0, 1] in memory', () => {
        const rctx = createMinimalRctx();
        const { ctx, buffer } = createMockMemoryContext();
        const lifter = createLifting(rctx.resolved, listBoolModel);
        const result = lifter(ctx, [true, false, true]);

        expect(result).toHaveLength(2);
        const [ptr, len] = result;
        expect(len).toBe(3);

        // bool is 1 byte each
        const view = new Uint8Array(buffer, ptr as number, 3);
        expect(view[0]).toBe(1);
        expect(view[1]).toBe(0);
        expect(view[2]).toBe(1);
    });
});

// ─── List lowering (WASM → JS) ────────────────────────────────────────────

describe('list lowering (WASM → JS)', () => {
    const listU32Model = {
        tag: ModelTag.ComponentTypeDefinedList as const,
        value: prim(PrimitiveValType.U32),
    };

    const listBoolModel = {
        tag: ModelTag.ComponentTypeDefinedList as const,
        value: prim(PrimitiveValType.Bool),
    };

    test('[ptr, 3] of u32 lowers to [1, 2, 3]', () => {
        const rctx = createMinimalRctx();
        const { ctx, buffer } = createMockMemoryContext();

        // Write [1, 2, 3] as u32 little-endian at offset 0
        const dv = new DataView(buffer, 0, 12);
        dv.setUint32(0, 1, true);
        dv.setUint32(4, 2, true);
        dv.setUint32(8, 3, true);

        const lowerer = createLowering(rctx.resolved, listU32Model);
        expect(lowerer(ctx, 0, 3)).toEqual([1, 2, 3]);
    });

    test('[ptr, 0] lowers to empty array', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();
        const lowerer = createLowering(rctx.resolved, listU32Model);
        expect(lowerer(ctx, 0, 0)).toEqual([]);
    });

    test('list<bool> lowers correctly', () => {
        const rctx = createMinimalRctx();
        const { ctx, buffer } = createMockMemoryContext();

        // Write [1, 0, 1] as bool bytes at offset 0
        const view = new Uint8Array(buffer, 0, 3);
        view[0] = 1;
        view[1] = 0;
        view[2] = 1;

        const lowerer = createLowering(rctx.resolved, listBoolModel);
        expect(lowerer(ctx, 0, 3)).toEqual([true, false, true]);
    });

    test('spill is 2 (ptr + len)', () => {
        const rctx = createMinimalRctx();
        const lowerer = createLowering(rctx.resolved, listU32Model);
        expect((lowerer as any).spill).toBe(2);
    });
});

// ─── Compound type spill counts ────────────────────────────────────────────

describe('compound type spill counts', () => {
    let rctx: ResolverContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
    });

    test('option<u32> spill = 2', () => {
        const lowerer = createLowering(rctx.resolved, optionModel(prim(PrimitiveValType.U32)));
        expect((lowerer as any).spill).toBe(2);
    });

    test('option<bool> spill = 2', () => {
        const lowerer = createLowering(rctx.resolved, optionModel(prim(PrimitiveValType.Bool)));
        expect((lowerer as any).spill).toBe(2);
    });

    test('option<f64> spill = 2', () => {
        const lowerer = createLowering(rctx.resolved, optionModel(prim(PrimitiveValType.Float64)));
        expect((lowerer as any).spill).toBe(2);
    });

    test('result<u32, s32> spill = 2', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedResult as const,
            ok: prim(PrimitiveValType.U32),
            err: prim(PrimitiveValType.S32),
        };
        const lowerer = createLowering(rctx.resolved, model);
        expect((lowerer as any).spill).toBe(2);
    });

    test('result<_, s32> (no ok) spill = 2', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedResult as const,
            err: prim(PrimitiveValType.S32),
        };
        const lowerer = createLowering(rctx.resolved, model);
        expect((lowerer as any).spill).toBe(2);
    });

    test('result<u32, _> (no err) spill = 2', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedResult as const,
            ok: prim(PrimitiveValType.U32),
        };
        const lowerer = createLowering(rctx.resolved, model);
        expect((lowerer as any).spill).toBe(2);
    });

    test('list<u32> spill = 2', () => {
        const model = {
            tag: ModelTag.ComponentTypeDefinedList as const,
            value: prim(PrimitiveValType.U32),
        };
        const lowerer = createLowering(rctx.resolved, model);
        expect((lowerer as any).spill).toBe(2);
    });
});

// ─── List round-trip (lift then lower) ─────────────────────────────────────

describe('list round-trip', () => {
    test('list<u32> lifts then lowers back to original', () => {
        const rctx = createMinimalRctx();
        const { ctx } = createMockMemoryContext();
        const listU32Model = {
            tag: ModelTag.ComponentTypeDefinedList as const,
            value: prim(PrimitiveValType.U32),
        };

        const lifter = createLifting(rctx.resolved, listU32Model);
        // Need a separate rctx to avoid memoization returning the same object
        const rctx2 = createMinimalRctx();
        const lowerer = createLowering(rctx2.resolved, listU32Model);

        const original = [10, 20, 30, 40, 50];
        const [ptr, len] = lifter(ctx, original);
        const result = lowerer(ctx, ptr, len);
        expect(result).toEqual(original);
    });
});

// ─── Variant lifting (JS → WASM) ──────────────────────────────────────────

describe('variant lifting', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    const variantModel = {
        tag: ModelTag.ComponentTypeDefinedVariant as const,
        variants: [
            { name: 'none' },
            { name: 'some-int', ty: prim(PrimitiveValType.U32) },
            { name: 'some-bool', ty: prim(PrimitiveValType.Bool) },
        ],
    };

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    test('{tag:"none"} lifts to [0, 0]', () => {
        const lifter = createLifting(rctx.resolved, variantModel);
        expect(lifter(bctx, { tag: 'none' })).toEqual([0, 0]);
    });

    test('{tag:"some-int", val:42} lifts to [1, 42]', () => {
        const lifter = createLifting(rctx.resolved, variantModel);
        expect(lifter(bctx, { tag: 'some-int', val: 42 })).toEqual([1, 42]);
    });

    test('{tag:"some-bool", val:true} lifts to [2, 1]', () => {
        const lifter = createLifting(rctx.resolved, variantModel);
        expect(lifter(bctx, { tag: 'some-bool', val: true })).toEqual([2, 1]);
    });

    test('unknown tag throws', () => {
        const lifter = createLifting(rctx.resolved, variantModel);
        expect(() => lifter(bctx, { tag: 'unknown' })).toThrow('Unknown variant case: unknown');
    });
});

// ─── Variant lowering (WASM → JS) ─────────────────────────────────────────

describe('variant lowering', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    const variantModel = {
        tag: ModelTag.ComponentTypeDefinedVariant as const,
        variants: [
            { name: 'none' },
            { name: 'some-int', ty: prim(PrimitiveValType.U32) },
            { name: 'some-bool', ty: prim(PrimitiveValType.Bool) },
        ],
    };

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    test('discriminant 0 lowers to {tag:"none"}', () => {
        const lowerer = createLowering(rctx.resolved, variantModel);
        expect(lowerer(bctx, 0, 0)).toEqual({ tag: 'none' });
    });

    test('discriminant 1 with 42 lowers to {tag:"some-int", val:42}', () => {
        const lowerer = createLowering(rctx.resolved, variantModel);
        expect(lowerer(bctx, 1, 42)).toEqual({ tag: 'some-int', val: 42 });
    });

    test('discriminant 2 with 1 lowers to {tag:"some-bool", val:true}', () => {
        const lowerer = createLowering(rctx.resolved, variantModel);
        expect(lowerer(bctx, 2, 1)).toEqual({ tag: 'some-bool', val: true });
    });

    test('spill is 2 (1 discriminant + max 1 payload)', () => {
        const lowerer = createLowering(rctx.resolved, variantModel);
        expect((lowerer as any).spill).toBe(2);
    });
});

// ─── Enum lifting (JS → WASM) ─────────────────────────────────────────────

describe('enum lifting', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    const enumModel = {
        tag: ModelTag.ComponentTypeDefinedEnum as const,
        members: ['red', 'green', 'blue'],
    };

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    test('"red" lifts to [0]', () => {
        const lifter = createLifting(rctx.resolved, enumModel);
        expect(lifter(bctx, 'red')).toEqual([0]);
    });

    test('"green" lifts to [1]', () => {
        const lifter = createLifting(rctx.resolved, enumModel);
        expect(lifter(bctx, 'green')).toEqual([1]);
    });

    test('"blue" lifts to [2]', () => {
        const lifter = createLifting(rctx.resolved, enumModel);
        expect(lifter(bctx, 'blue')).toEqual([2]);
    });

    test('unknown name throws', () => {
        const lifter = createLifting(rctx.resolved, enumModel);
        expect(() => lifter(bctx, 'yellow')).toThrow('Unknown enum value: yellow');
    });
});

// ─── Enum lowering (WASM → JS) ────────────────────────────────────────────

describe('enum lowering', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    const enumModel = {
        tag: ModelTag.ComponentTypeDefinedEnum as const,
        members: ['red', 'green', 'blue'],
    };

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    test('discriminant 0 lowers to "red"', () => {
        const lowerer = createLowering(rctx.resolved, enumModel);
        expect(lowerer(bctx, 0)).toBe('red');
    });

    test('discriminant 1 lowers to "green"', () => {
        const lowerer = createLowering(rctx.resolved, enumModel);
        expect(lowerer(bctx, 1)).toBe('green');
    });

    test('discriminant 2 lowers to "blue"', () => {
        const lowerer = createLowering(rctx.resolved, enumModel);
        expect(lowerer(bctx, 2)).toBe('blue');
    });

    test('spill is 1', () => {
        const lowerer = createLowering(rctx.resolved, enumModel);
        expect((lowerer as any).spill).toBe(1);
    });
});

// ─── Flags lifting (JS → WASM) ────────────────────────────────────────────

describe('flags lifting', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    const flagsModel = {
        tag: ModelTag.ComponentTypeDefinedFlags as const,
        members: ['readable', 'writable', 'executable'],
    };

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    test('{readable:true, writable:false, executable:true} lifts to [5]', () => {
        const lifter = createLifting(rctx.resolved, flagsModel);
        expect(lifter(bctx, { readable: true, writable: false, executable: true })).toEqual([5]);
    });

    test('all false lifts to [0]', () => {
        const lifter = createLifting(rctx.resolved, flagsModel);
        expect(lifter(bctx, { readable: false, writable: false, executable: false })).toEqual([0]);
    });

    test('all true lifts to [7]', () => {
        const lifter = createLifting(rctx.resolved, flagsModel);
        expect(lifter(bctx, { readable: true, writable: true, executable: true })).toEqual([7]);
    });

    test('empty object lifts to [0] (missing flags are false)', () => {
        const lifter = createLifting(rctx.resolved, flagsModel);
        expect(lifter(bctx, {})).toEqual([0]);
    });

    test('>32 flags produces 2 i32 words', () => {
        const bigFlagsModel = {
            tag: ModelTag.ComponentTypeDefinedFlags as const,
            members: Array.from({ length: 33 }, (_, i) => `flag${i}`),
        };
        const lifter = createLifting(rctx.resolved, bigFlagsModel);
        // Set flag0 (bit 0 of word 0) and flag32 (bit 0 of word 1)
        const flags: Record<string, boolean> = {};
        for (let i = 0; i < 33; i++) flags[`flag${i}`] = false;
        flags['flag0'] = true;
        flags['flag32'] = true;
        expect(lifter(bctx, flags)).toEqual([1, 1]);
    });
});

// ─── Flags lowering (WASM → JS) ───────────────────────────────────────────

describe('flags lowering', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    const flagsModel = {
        tag: ModelTag.ComponentTypeDefinedFlags as const,
        members: ['readable', 'writable', 'executable'],
    };

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    test('5 lowers to {readable:true, writable:false, executable:true}', () => {
        const lowerer = createLowering(rctx.resolved, flagsModel);
        expect(lowerer(bctx, 5)).toEqual({ readable: true, writable: false, executable: true });
    });

    test('0 lowers to all false', () => {
        const lowerer = createLowering(rctx.resolved, flagsModel);
        expect(lowerer(bctx, 0)).toEqual({ readable: false, writable: false, executable: false });
    });

    test('7 lowers to all true', () => {
        const lowerer = createLowering(rctx.resolved, flagsModel);
        expect(lowerer(bctx, 7)).toEqual({ readable: true, writable: true, executable: true });
    });

    test('spill is 1', () => {
        const lowerer = createLowering(rctx.resolved, flagsModel);
        expect((lowerer as any).spill).toBe(1);
    });

    test('>32 flags lowering with 2 words', () => {
        const bigFlagsModel = {
            tag: ModelTag.ComponentTypeDefinedFlags as const,
            members: Array.from({ length: 33 }, (_, i) => `flag${i}`),
        };
        const lowerer = createLowering(rctx.resolved, bigFlagsModel);
        expect((lowerer as any).spill).toBe(2);
        // word0 = 1 (flag0 set), word1 = 1 (flag32 set)
        const result = lowerer(bctx, 1, 1);
        expect(result['flag0']).toBe(true);
        expect(result['flag1']).toBe(false);
        expect(result['flag32']).toBe(true);
    });
});

// ─── Tuple lifting (JS → WASM) ────────────────────────────────────────────

describe('tuple lifting', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    const tupleModel = {
        tag: ModelTag.ComponentTypeDefinedTuple as const,
        members: [
            prim(PrimitiveValType.S8),
            prim(PrimitiveValType.U8),
        ],
    };

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    test('[-5, 200] lifts to [-5, 200]', () => {
        const lifter = createLifting(rctx.resolved, tupleModel);
        expect(lifter(bctx, [-5, 200])).toEqual([-5, 200]);
    });

    test('[0, 0] lifts to [0, 0]', () => {
        const lifter = createLifting(rctx.resolved, tupleModel);
        expect(lifter(bctx, [0, 0])).toEqual([0, 0]);
    });
});

// ─── Tuple lowering (WASM → JS) ───────────────────────────────────────────

describe('tuple lowering', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    const tupleModel = {
        tag: ModelTag.ComponentTypeDefinedTuple as const,
        members: [
            prim(PrimitiveValType.S8),
            prim(PrimitiveValType.U8),
        ],
    };

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    test('(-5, 200) lowers to [-5, 200]', () => {
        const lowerer = createLowering(rctx.resolved, tupleModel);
        expect(lowerer(bctx, -5, 200)).toEqual([-5, 200]);
    });

    test('spill is 2', () => {
        const lowerer = createLowering(rctx.resolved, tupleModel);
        expect((lowerer as any).spill).toBe(2);
    });
});
