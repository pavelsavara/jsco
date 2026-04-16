// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { initializeAsserts } from '../utils/assert';
initializeAsserts();

import { ModelTag } from '../model/tags';
import { PrimitiveValType, ComponentValType } from '../model/types';
import {
    sizeOf, alignOf, flatCount, flattenType, alignUp,
    discriminantSize, joinFlatType, FlatType,
    determineFunctionCallingConvention, CallingConvention,
    deepResolveType, flattenVariant, resolveValType, resolveValTypePure,
    MAX_FLAT_PARAMS,
} from './calling-convention';
import type { ResolvedType } from './type-resolution';
import type { ResolvedContext } from './types';

function prim(v: PrimitiveValType): ResolvedType {
    return { tag: ModelTag.ComponentValTypePrimitive, value: v } as ResolvedType;
}
function primVT(v: PrimitiveValType): ComponentValType {
    return { tag: ModelTag.ComponentValTypePrimitive, value: v };
}
function resolvedVT(resolved: ResolvedType): ComponentValType {
    return { tag: ModelTag.ComponentValTypeResolved, resolved } as any;
}

// --- alignUp ---

describe('alignUp', () => {
    test('already aligned', () => expect(alignUp(8, 4)).toBe(8));
    test('needs padding', () => expect(alignUp(5, 4)).toBe(8));
    test('offset 0', () => expect(alignUp(0, 8)).toBe(0));
    test('align 1', () => expect(alignUp(7, 1)).toBe(7));
});

// --- discriminantSize ---

describe('discriminantSize', () => {
    test('0 cases → 1', () => expect(discriminantSize(0)).toBe(1));
    test('1 case → 1', () => expect(discriminantSize(1)).toBe(1));
    test('255 cases → 1', () => expect(discriminantSize(255)).toBe(1));
    test('256 cases → 2', () => expect(discriminantSize(256)).toBe(2));
    test('65535 cases → 2', () => expect(discriminantSize(65535)).toBe(2));
    test('65536 cases → 2', () => expect(discriminantSize(65536)).toBe(4));
    test('100000 cases → 4', () => expect(discriminantSize(100000)).toBe(4));
});

// --- joinFlatType ---

describe('joinFlatType', () => {
    test('same I32', () => expect(joinFlatType(FlatType.I32, FlatType.I32)).toBe(FlatType.I32));
    test('same F64', () => expect(joinFlatType(FlatType.F64, FlatType.F64)).toBe(FlatType.F64));
    test('I32+F32 → I32', () => expect(joinFlatType(FlatType.I32, FlatType.F32)).toBe(FlatType.I32));
    test('F32+I32 → I32', () => expect(joinFlatType(FlatType.F32, FlatType.I32)).toBe(FlatType.I32));
    test('I32+I64 → I64', () => expect(joinFlatType(FlatType.I32, FlatType.I64)).toBe(FlatType.I64));
    test('F32+F64 → I64', () => expect(joinFlatType(FlatType.F32, FlatType.F64)).toBe(FlatType.I64));
    test('I32+F64 → I64', () => expect(joinFlatType(FlatType.I32, FlatType.F64)).toBe(FlatType.I64));
    test('F64+I32 → I64', () => expect(joinFlatType(FlatType.F64, FlatType.I32)).toBe(FlatType.I64));
});

// --- sizeOf ---

describe('sizeOf', () => {
    describe('primitives', () => {
        test('bool', () => expect(sizeOf(prim(PrimitiveValType.Bool))).toBe(1));
        test('u8', () => expect(sizeOf(prim(PrimitiveValType.U8))).toBe(1));
        test('u16', () => expect(sizeOf(prim(PrimitiveValType.U16))).toBe(2));
        test('u32', () => expect(sizeOf(prim(PrimitiveValType.U32))).toBe(4));
        test('u64', () => expect(sizeOf(prim(PrimitiveValType.U64))).toBe(8));
        test('f32', () => expect(sizeOf(prim(PrimitiveValType.Float32))).toBe(4));
        test('f64', () => expect(sizeOf(prim(PrimitiveValType.Float64))).toBe(8));
        test('char', () => expect(sizeOf(prim(PrimitiveValType.Char))).toBe(4));
        test('string', () => expect(sizeOf(prim(PrimitiveValType.String))).toBe(8));
    });

    describe('record', () => {
        test('empty record', () => {
            expect(sizeOf({ tag: ModelTag.ComponentTypeDefinedRecord, members: [] } as any)).toBe(0);
        });
        test('record {u8, u32}', () => {
            const type = {
                tag: ModelTag.ComponentTypeDefinedRecord,
                members: [
                    { name: 'a', type: primVT(PrimitiveValType.U8) },
                    { name: 'b', type: primVT(PrimitiveValType.U32) },
                ],
            } as any;
            // u8(1) + padding(3) + u32(4) = 8
            expect(sizeOf(type)).toBe(8);
        });
    });

    describe('tuple', () => {
        test('tuple (u8, u32)', () => {
            const type = {
                tag: ModelTag.ComponentTypeDefinedTuple,
                members: [primVT(PrimitiveValType.U8), primVT(PrimitiveValType.U32)],
            } as any;
            expect(sizeOf(type)).toBe(8);
        });
    });

    describe('list', () => {
        test('list<u8> size is 8 (ptr+len)', () => {
            expect(sizeOf({ tag: ModelTag.ComponentTypeDefinedList, value: primVT(PrimitiveValType.U8) } as any)).toBe(8);
        });
    });

    describe('option', () => {
        test('option<u32>', () => {
            const type = { tag: ModelTag.ComponentTypeDefinedOption, value: primVT(PrimitiveValType.U32) } as any;
            // disc(1) + pad(3) + u32(4) = 8
            expect(sizeOf(type)).toBe(8);
        });
        test('option<u8>', () => {
            const type = { tag: ModelTag.ComponentTypeDefinedOption, value: primVT(PrimitiveValType.U8) } as any;
            // disc(1) + u8(1) = 2, aligned to 1 → 2
            expect(sizeOf(type)).toBe(2);
        });
    });

    describe('result', () => {
        test('result<u32, u8>', () => {
            const type = {
                tag: ModelTag.ComponentTypeDefinedResult,
                ok: primVT(PrimitiveValType.U32),
                err: primVT(PrimitiveValType.U8),
            } as any;
            // disc(1) + pad(3) + max(u32=4, u8=1) = 8
            expect(sizeOf(type)).toBe(8);
        });
        test('result<_, string>', () => {
            const type = {
                tag: ModelTag.ComponentTypeDefinedResult,
                ok: undefined,
                err: primVT(PrimitiveValType.String),
            } as any;
            // disc(1) + pad(3) + string(8) = 12
            expect(sizeOf(type)).toBe(12);
        });
        test('result<u32, _>', () => {
            const type = {
                tag: ModelTag.ComponentTypeDefinedResult,
                ok: primVT(PrimitiveValType.U32),
                err: undefined,
            } as any;
            expect(sizeOf(type)).toBe(8);
        });
    });

    describe('variant', () => {
        test('variant with single u32 case', () => {
            const type = {
                tag: ModelTag.ComponentTypeDefinedVariant,
                variants: [{ name: 'a', ty: primVT(PrimitiveValType.U32) }],
            } as any;
            // disc(1) + pad(3) + u32(4) = 8
            expect(sizeOf(type)).toBe(8);
        });
        test('variant with no-payload case', () => {
            const type = {
                tag: ModelTag.ComponentTypeDefinedVariant,
                variants: [{ name: 'a', ty: undefined }, { name: 'b', ty: primVT(PrimitiveValType.U8) }],
            } as any;
            // disc(1) + u8(1) = 2
            expect(sizeOf(type)).toBe(2);
        });
        test('variant with many cases (>255)', () => {
            const cases = Array.from({ length: 300 }, (_, i) => ({ name: `c${i}`, ty: undefined }));
            cases[0]!.ty = primVT(PrimitiveValType.U8) as any;
            const type = { tag: ModelTag.ComponentTypeDefinedVariant, variants: cases } as any;
            // disc(2) + u8(1) + pad(1) = 4
            expect(sizeOf(type)).toBe(4);
        });
    });

    describe('enum', () => {
        test('small enum', () => {
            expect(sizeOf({ tag: ModelTag.ComponentTypeDefinedEnum, members: ['a', 'b', 'c'] } as any)).toBe(1);
        });
        test('large enum (>255)', () => {
            const members = Array.from({ length: 300 }, (_, i) => `e${i}`);
            expect(sizeOf({ tag: ModelTag.ComponentTypeDefinedEnum, members } as any)).toBe(2);
        });
    });

    describe('flags', () => {
        test('0 flags → 4', () => {
            expect(sizeOf({ tag: ModelTag.ComponentTypeDefinedFlags, members: [] } as any)).toBe(4);
        });
        test('1 flag → 4', () => {
            expect(sizeOf({ tag: ModelTag.ComponentTypeDefinedFlags, members: ['a'] } as any)).toBe(4);
        });
        test('32 flags → 4', () => {
            const members = Array.from({ length: 32 }, (_, i) => `f${i}`);
            expect(sizeOf({ tag: ModelTag.ComponentTypeDefinedFlags, members } as any)).toBe(4);
        });
        test('33 flags → 8', () => {
            const members = Array.from({ length: 33 }, (_, i) => `f${i}`);
            expect(sizeOf({ tag: ModelTag.ComponentTypeDefinedFlags, members } as any)).toBe(8);
        });
    });

    describe('own/borrow', () => {
        test('own → 4', () => expect(sizeOf({ tag: ModelTag.ComponentTypeDefinedOwn, value: 0 } as any)).toBe(4));
        test('borrow → 4', () => expect(sizeOf({ tag: ModelTag.ComponentTypeDefinedBorrow, value: 0 } as any)).toBe(4));
    });

    describe('stream/future/error-context', () => {
        test('stream → 4', () => expect(sizeOf({ tag: ModelTag.ComponentTypeDefinedStream } as any)).toBe(4));
        test('future → 4', () => expect(sizeOf({ tag: ModelTag.ComponentTypeDefinedFuture } as any)).toBe(4));
        test('error-context → 4', () => expect(sizeOf({ tag: ModelTag.ComponentTypeDefinedErrorContext } as any)).toBe(4));
    });

    describe('func', () => {
        test('func → 0', () => {
            expect(sizeOf({ tag: ModelTag.ComponentTypeFunc, params: [], results: { tag: ModelTag.ComponentFuncResultNamed, values: [] } } as any)).toBe(0);
        });
    });
});

// --- alignOf ---

describe('alignOf', () => {
    test('u32 → 4', () => expect(alignOf(prim(PrimitiveValType.U32))).toBe(4));
    test('u64 → 8', () => expect(alignOf(prim(PrimitiveValType.U64))).toBe(8));
    test('string → 4', () => expect(alignOf(prim(PrimitiveValType.String))).toBe(4));

    test('record {u8, u32} → 4', () => {
        const type = {
            tag: ModelTag.ComponentTypeDefinedRecord,
            members: [
                { name: 'a', type: primVT(PrimitiveValType.U8) },
                { name: 'b', type: primVT(PrimitiveValType.U32) },
            ],
        } as any;
        expect(alignOf(type)).toBe(4);
    });

    test('tuple (u8, u64) → 8', () => {
        const type = {
            tag: ModelTag.ComponentTypeDefinedTuple,
            members: [primVT(PrimitiveValType.U8), primVT(PrimitiveValType.U64)],
        } as any;
        expect(alignOf(type)).toBe(8);
    });

    test('list → 4', () => {
        expect(alignOf({ tag: ModelTag.ComponentTypeDefinedList, value: primVT(PrimitiveValType.U64) } as any)).toBe(4);
    });

    test('option<u32> → 4', () => {
        expect(alignOf({ tag: ModelTag.ComponentTypeDefinedOption, value: primVT(PrimitiveValType.U32) } as any)).toBe(4);
    });

    test('result<u64, u8> → 8', () => {
        const type = {
            tag: ModelTag.ComponentTypeDefinedResult,
            ok: primVT(PrimitiveValType.U64),
            err: primVT(PrimitiveValType.U8),
        } as any;
        expect(alignOf(type)).toBe(8);
    });

    test('result<_, u32> → 4', () => {
        const type = {
            tag: ModelTag.ComponentTypeDefinedResult,
            ok: undefined,
            err: primVT(PrimitiveValType.U32),
        } as any;
        expect(alignOf(type)).toBe(4);
    });

    test('variant → max(disc, payload)', () => {
        const type = {
            tag: ModelTag.ComponentTypeDefinedVariant,
            variants: [
                { name: 'a', ty: primVT(PrimitiveValType.U64) },
                { name: 'b', ty: undefined },
            ],
        } as any;
        expect(alignOf(type)).toBe(8);
    });

    test('enum → discriminant alignment', () => {
        expect(alignOf({ tag: ModelTag.ComponentTypeDefinedEnum, members: ['a', 'b'] } as any)).toBe(1);
        const members = Array.from({ length: 300 }, (_, i) => `e${i}`);
        expect(alignOf({ tag: ModelTag.ComponentTypeDefinedEnum, members } as any)).toBe(2);
    });

    test('flags → 4', () => {
        expect(alignOf({ tag: ModelTag.ComponentTypeDefinedFlags, members: ['a'] } as any)).toBe(4);
    });

    test('own/borrow → 4', () => {
        expect(alignOf({ tag: ModelTag.ComponentTypeDefinedOwn, value: 0 } as any)).toBe(4);
        expect(alignOf({ tag: ModelTag.ComponentTypeDefinedBorrow, value: 0 } as any)).toBe(4);
    });

    test('stream/future/error-context → 4', () => {
        expect(alignOf({ tag: ModelTag.ComponentTypeDefinedStream } as any)).toBe(4);
        expect(alignOf({ tag: ModelTag.ComponentTypeDefinedFuture } as any)).toBe(4);
        expect(alignOf({ tag: ModelTag.ComponentTypeDefinedErrorContext } as any)).toBe(4);
    });

    test('func → 0', () => {
        expect(alignOf({ tag: ModelTag.ComponentTypeFunc, params: [], results: { tag: ModelTag.ComponentFuncResultNamed, values: [] } } as any)).toBe(0);
    });
});

// --- flatCount ---

describe('flatCount', () => {
    test('u32 → 1', () => expect(flatCount(prim(PrimitiveValType.U32))).toBe(1));
    test('string → 2', () => expect(flatCount(prim(PrimitiveValType.String))).toBe(2));

    test('record {u32, string} → 3', () => {
        const type = {
            tag: ModelTag.ComponentTypeDefinedRecord,
            members: [
                { name: 'a', type: primVT(PrimitiveValType.U32) },
                { name: 'b', type: primVT(PrimitiveValType.String) },
            ],
        } as any;
        expect(flatCount(type)).toBe(3);
    });

    test('tuple (u32, u32) → 2', () => {
        const type = {
            tag: ModelTag.ComponentTypeDefinedTuple,
            members: [primVT(PrimitiveValType.U32), primVT(PrimitiveValType.U32)],
        } as any;
        expect(flatCount(type)).toBe(2);
    });

    test('list → 2', () => {
        expect(flatCount({ tag: ModelTag.ComponentTypeDefinedList, value: primVT(PrimitiveValType.U32) } as any)).toBe(2);
    });

    test('option<u32> → 2', () => {
        expect(flatCount({ tag: ModelTag.ComponentTypeDefinedOption, value: primVT(PrimitiveValType.U32) } as any)).toBe(2);
    });

    test('result<u32, u8> → 2', () => {
        const type = {
            tag: ModelTag.ComponentTypeDefinedResult,
            ok: primVT(PrimitiveValType.U32),
            err: primVT(PrimitiveValType.U8),
        } as any;
        expect(flatCount(type)).toBe(2);
    });

    test('result<_, _> → 1', () => {
        const type = {
            tag: ModelTag.ComponentTypeDefinedResult,
            ok: undefined,
            err: undefined,
        } as any;
        expect(flatCount(type)).toBe(1);
    });

    test('variant → 1 + max case', () => {
        const type = {
            tag: ModelTag.ComponentTypeDefinedVariant,
            variants: [
                { name: 'a', ty: primVT(PrimitiveValType.U32) },
                { name: 'b', ty: primVT(PrimitiveValType.String) },
                { name: 'c', ty: undefined },
            ],
        } as any;
        // disc(1) + max(u32=1, string=2, 0) = 3
        expect(flatCount(type)).toBe(3);
    });

    test('enum → 1', () => {
        expect(flatCount({ tag: ModelTag.ComponentTypeDefinedEnum, members: ['a', 'b'] } as any)).toBe(1);
    });

    test('flags 0 → 1', () => {
        expect(flatCount({ tag: ModelTag.ComponentTypeDefinedFlags, members: [] } as any)).toBe(1);
    });

    test('flags 33 → 2', () => {
        const members = Array.from({ length: 33 }, (_, i) => `f${i}`);
        expect(flatCount({ tag: ModelTag.ComponentTypeDefinedFlags, members } as any)).toBe(2);
    });

    test('own → 1', () => {
        expect(flatCount({ tag: ModelTag.ComponentTypeDefinedOwn, value: 0 } as any)).toBe(1);
    });

    test('borrow → 1', () => {
        expect(flatCount({ tag: ModelTag.ComponentTypeDefinedBorrow, value: 0 } as any)).toBe(1);
    });

    test('stream → 1', () => {
        expect(flatCount({ tag: ModelTag.ComponentTypeDefinedStream } as any)).toBe(1);
    });

    test('future → 1', () => {
        expect(flatCount({ tag: ModelTag.ComponentTypeDefinedFuture } as any)).toBe(1);
    });

    test('error-context → 1', () => {
        expect(flatCount({ tag: ModelTag.ComponentTypeDefinedErrorContext } as any)).toBe(1);
    });

    test('func → 0', () => {
        expect(flatCount({ tag: ModelTag.ComponentTypeFunc, params: [], results: { tag: ModelTag.ComponentFuncResultNamed, values: [] } } as any)).toBe(0);
    });
});

// --- flattenType ---

describe('flattenType', () => {
    test('u32 → [I32]', () => expect(flattenType(prim(PrimitiveValType.U32))).toEqual([FlatType.I32]));
    test('u64 → [I64]', () => expect(flattenType(prim(PrimitiveValType.U64))).toEqual([FlatType.I64]));
    test('f32 → [F32]', () => expect(flattenType(prim(PrimitiveValType.Float32))).toEqual([FlatType.F32]));
    test('f64 → [F64]', () => expect(flattenType(prim(PrimitiveValType.Float64))).toEqual([FlatType.F64]));
    test('string → [I32, I32]', () => expect(flattenType(prim(PrimitiveValType.String))).toEqual([FlatType.I32, FlatType.I32]));

    test('list → [I32, I32]', () => {
        expect(flattenType({ tag: ModelTag.ComponentTypeDefinedList, value: primVT(PrimitiveValType.U32) } as any)).toEqual([FlatType.I32, FlatType.I32]);
    });

    test('option<f32> → [I32, F32]', () => {
        expect(flattenType({ tag: ModelTag.ComponentTypeDefinedOption, value: primVT(PrimitiveValType.Float32) } as any)).toEqual([FlatType.I32, FlatType.F32]);
    });

    test('enum → [I32]', () => {
        expect(flattenType({ tag: ModelTag.ComponentTypeDefinedEnum, members: ['a', 'b'] } as any)).toEqual([FlatType.I32]);
    });

    test('flags 33 → [I32, I32]', () => {
        const members = Array.from({ length: 33 }, (_, i) => `f${i}`);
        expect(flattenType({ tag: ModelTag.ComponentTypeDefinedFlags, members } as any)).toEqual([FlatType.I32, FlatType.I32]);
    });

    test('own → [I32]', () => {
        expect(flattenType({ tag: ModelTag.ComponentTypeDefinedOwn, value: 0 } as any)).toEqual([FlatType.I32]);
    });

    test('stream → [I32]', () => {
        expect(flattenType({ tag: ModelTag.ComponentTypeDefinedStream } as any)).toEqual([FlatType.I32]);
    });

    test('future → [I32]', () => {
        expect(flattenType({ tag: ModelTag.ComponentTypeDefinedFuture } as any)).toEqual([FlatType.I32]);
    });

    test('error-context → [I32]', () => {
        expect(flattenType({ tag: ModelTag.ComponentTypeDefinedErrorContext } as any)).toEqual([FlatType.I32]);
    });

    test('record {u32, f32} → [I32, F32]', () => {
        const type = {
            tag: ModelTag.ComponentTypeDefinedRecord,
            members: [
                { name: 'a', type: primVT(PrimitiveValType.U32) },
                { name: 'b', type: primVT(PrimitiveValType.Float32) },
            ],
        } as any;
        expect(flattenType(type)).toEqual([FlatType.I32, FlatType.F32]);
    });

    test('tuple (f64, u32) → [F64, I32]', () => {
        const type = {
            tag: ModelTag.ComponentTypeDefinedTuple,
            members: [primVT(PrimitiveValType.Float64), primVT(PrimitiveValType.U32)],
        } as any;
        expect(flattenType(type)).toEqual([FlatType.F64, FlatType.I32]);
    });

    test('result<f32, u32> joins → [I32, I32]', () => {
        const type = {
            tag: ModelTag.ComponentTypeDefinedResult,
            ok: primVT(PrimitiveValType.Float32),
            err: primVT(PrimitiveValType.U32),
        } as any;
        // disc I32 + join(F32, I32) = I32
        expect(flattenType(type)).toEqual([FlatType.I32, FlatType.I32]);
    });

    test('result<_, _> → [I32]', () => {
        const type = {
            tag: ModelTag.ComponentTypeDefinedResult,
            ok: undefined,
            err: undefined,
        } as any;
        expect(flattenType(type)).toEqual([FlatType.I32]);
    });

    test('func → []', () => {
        expect(flattenType({ tag: ModelTag.ComponentTypeFunc, params: [], results: { tag: ModelTag.ComponentFuncResultNamed, values: [] } } as any)).toEqual([]);
    });
});

// --- flattenVariant ---

describe('flattenVariant', () => {
    test('variant with joined types', () => {
        const type = {
            tag: ModelTag.ComponentTypeDefinedVariant,
            variants: [
                { name: 'a', ty: primVT(PrimitiveValType.Float32) },
                { name: 'b', ty: primVT(PrimitiveValType.U32) },
            ],
        } as any;
        // disc I32, join(F32, I32) = I32
        expect(flattenVariant(type)).toEqual([FlatType.I32, FlatType.I32]);
    });

    test('variant with no-payload cases', () => {
        const type = {
            tag: ModelTag.ComponentTypeDefinedVariant,
            variants: [
                { name: 'a', ty: undefined },
                { name: 'b', ty: primVT(PrimitiveValType.U64) },
            ],
        } as any;
        expect(flattenVariant(type)).toEqual([FlatType.I32, FlatType.I64]);
    });

    test('variant with different-length payloads', () => {
        const type = {
            tag: ModelTag.ComponentTypeDefinedVariant,
            variants: [
                { name: 'a', ty: primVT(PrimitiveValType.U32) },
                { name: 'b', ty: primVT(PrimitiveValType.String) }, // [I32, I32]
            ],
        } as any;
        // disc I32, join(I32, I32)=I32, then I32 from string's second slot
        expect(flattenVariant(type)).toEqual([FlatType.I32, FlatType.I32, FlatType.I32]);
    });
});

// --- resolveValType / resolveValTypePure ---

describe('resolveValType', () => {
    test('primitive passes through', () => {
        const vt = primVT(PrimitiveValType.U32);
        const rctx = { resolvedTypes: new Map() } as any as ResolvedContext;
        expect(resolveValType(rctx, vt)).toEqual(prim(PrimitiveValType.U32));
    });

    test('resolved passes through', () => {
        const inner = prim(PrimitiveValType.U32);
        const vt = resolvedVT(inner);
        const rctx = { resolvedTypes: new Map() } as any as ResolvedContext;
        expect(resolveValType(rctx, vt)).toBe(inner);
    });

    test('type reference resolves from map', () => {
        const inner = prim(PrimitiveValType.U32);
        const rctx = { resolvedTypes: new Map([[0, inner]]) } as any as ResolvedContext;
        const vt: ComponentValType = { tag: ModelTag.ComponentValTypeType, value: 0 } as any;
        expect(resolveValType(rctx, vt)).toBe(inner);
    });

    test('unresolved type reference throws', () => {
        const rctx = { resolvedTypes: new Map() } as any as ResolvedContext;
        const vt: ComponentValType = { tag: ModelTag.ComponentValTypeType, value: 99 } as any;
        expect(() => resolveValType(rctx, vt)).toThrow('Unresolved type');
    });
});

describe('resolveValTypePure', () => {
    test('primitive passes through', () => {
        expect(resolveValTypePure(primVT(PrimitiveValType.U32))).toEqual(prim(PrimitiveValType.U32));
    });

    test('resolved passes through', () => {
        const inner = prim(PrimitiveValType.U32);
        expect(resolveValTypePure(resolvedVT(inner))).toBe(inner);
    });

    test('type reference throws', () => {
        const vt: ComponentValType = { tag: ModelTag.ComponentValTypeType, value: 0 } as any;
        expect(() => resolveValTypePure(vt)).toThrow('resolveValTypePure');
    });
});

// --- determineFunctionCallingConvention ---

describe('determineFunctionCallingConvention', () => {
    test('no params, no results → Flat', () => {
        const funcType = {
            tag: ModelTag.ComponentTypeFunc,
            params: [],
            results: { tag: ModelTag.ComponentFuncResultNamed, values: [] },
        } as any;
        const cc = determineFunctionCallingConvention(funcType);
        expect(cc.params).toBe(CallingConvention.Flat);
        expect(cc.results).toBe(CallingConvention.Flat);
    });

    test('single u32 param, single u32 result → Scalar/Scalar', () => {
        const funcType = {
            tag: ModelTag.ComponentTypeFunc,
            params: [{ name: 'x', type: primVT(PrimitiveValType.U32) }],
            results: { tag: ModelTag.ComponentFuncResultUnnamed, type: primVT(PrimitiveValType.U32) },
        } as any;
        const cc = determineFunctionCallingConvention(funcType);
        expect(cc.params).toBe(CallingConvention.Scalar);
        expect(cc.results).toBe(CallingConvention.Scalar);
        expect(cc.paramFlatCount).toBe(1);
        expect(cc.resultFlatCount).toBe(1);
    });

    test('2 params → Flat', () => {
        const funcType = {
            tag: ModelTag.ComponentTypeFunc,
            params: [
                { name: 'a', type: primVT(PrimitiveValType.U32) },
                { name: 'b', type: primVT(PrimitiveValType.U32) },
            ],
            results: { tag: ModelTag.ComponentFuncResultUnnamed, type: primVT(PrimitiveValType.U32) },
        } as any;
        const cc = determineFunctionCallingConvention(funcType);
        expect(cc.params).toBe(CallingConvention.Flat);
        expect(cc.paramFlatCount).toBe(2);
    });

    test('many params → Spilled', () => {
        const params = Array.from({ length: MAX_FLAT_PARAMS + 1 }, (_, i) => ({
            name: `p${i}`,
            type: primVT(PrimitiveValType.U32),
        }));
        const funcType = {
            tag: ModelTag.ComponentTypeFunc,
            params,
            results: { tag: ModelTag.ComponentFuncResultUnnamed, type: primVT(PrimitiveValType.U32) },
        } as any;
        const cc = determineFunctionCallingConvention(funcType);
        expect(cc.params).toBe(CallingConvention.Spilled);
    });

    test('result with 2 flat values → Spilled', () => {
        // MAX_FLAT_RESULTS=1, so string (2 flat) spills
        const funcType = {
            tag: ModelTag.ComponentTypeFunc,
            params: [{ name: 'x', type: primVT(PrimitiveValType.U32) }],
            results: { tag: ModelTag.ComponentFuncResultUnnamed, type: primVT(PrimitiveValType.String) },
        } as any;
        const cc = determineFunctionCallingConvention(funcType);
        expect(cc.results).toBe(CallingConvention.Spilled);
        expect(cc.resultFlatCount).toBe(2);
    });

    test('named results', () => {
        const funcType = {
            tag: ModelTag.ComponentTypeFunc,
            params: [],
            results: {
                tag: ModelTag.ComponentFuncResultNamed,
                values: [
                    { name: 'a', type: primVT(PrimitiveValType.U32) },
                    { name: 'b', type: primVT(PrimitiveValType.U32) },
                ],
            },
        } as any;
        const cc = determineFunctionCallingConvention(funcType);
        expect(cc.results).toBe(CallingConvention.Spilled);
        expect(cc.resultFlatCount).toBe(2);
    });
});

// --- deepResolveType ---

describe('deepResolveType', () => {
    function makeRctx(types?: Map<number, ResolvedType>): ResolvedContext {
        return { resolvedTypes: types ?? new Map() } as any as ResolvedContext;
    }

    test('primitive stays as-is', () => {
        const rctx = makeRctx();
        const type = prim(PrimitiveValType.U32);
        expect(deepResolveType(rctx, type)).toBe(type);
    });

    test('enum stays as-is', () => {
        const rctx = makeRctx();
        const type = { tag: ModelTag.ComponentTypeDefinedEnum, members: ['a', 'b'] } as any;
        expect(deepResolveType(rctx, type)).toBe(type);
    });

    test('flags stays as-is', () => {
        const rctx = makeRctx();
        const type = { tag: ModelTag.ComponentTypeDefinedFlags, members: ['f'] } as any;
        expect(deepResolveType(rctx, type)).toBe(type);
    });

    test('own stays as-is', () => {
        const rctx = makeRctx();
        const type = { tag: ModelTag.ComponentTypeDefinedOwn, value: 0 } as any;
        expect(deepResolveType(rctx, type)).toBe(type);
    });

    test('stream stays as-is', () => {
        const rctx = makeRctx();
        const type = { tag: ModelTag.ComponentTypeDefinedStream } as any;
        expect(deepResolveType(rctx, type)).toBe(type);
    });

    test('future stays as-is', () => {
        const rctx = makeRctx();
        const type = { tag: ModelTag.ComponentTypeDefinedFuture } as any;
        expect(deepResolveType(rctx, type)).toBe(type);
    });

    test('error-context stays as-is', () => {
        const rctx = makeRctx();
        const type = { tag: ModelTag.ComponentTypeDefinedErrorContext } as any;
        expect(deepResolveType(rctx, type)).toBe(type);
    });

    test('resolves ComponentValTypeType in record members', () => {
        const inner = prim(PrimitiveValType.U32);
        const rctx = makeRctx(new Map([[0, inner]]));
        const type = {
            tag: ModelTag.ComponentTypeDefinedRecord,
            members: [{ name: 'x', type: { tag: ModelTag.ComponentValTypeType, value: 0 } }],
        } as any;
        const resolved = deepResolveType(rctx, type) as any;
        expect(resolved.members[0].type.tag).toBe(ModelTag.ComponentValTypeResolved);
        expect(resolved.members[0].type.resolved).toBe(inner);
    });

    test('resolves ComponentValTypeType in tuple members', () => {
        const inner = prim(PrimitiveValType.Float64);
        const rctx = makeRctx(new Map([[1, inner]]));
        const type = {
            tag: ModelTag.ComponentTypeDefinedTuple,
            members: [{ tag: ModelTag.ComponentValTypeType, value: 1 }],
        } as any;
        const resolved = deepResolveType(rctx, type) as any;
        expect(resolved.members[0].tag).toBe(ModelTag.ComponentValTypeResolved);
    });

    test('resolves list value type', () => {
        const inner = prim(PrimitiveValType.U8);
        const rctx = makeRctx(new Map([[0, inner]]));
        const type = {
            tag: ModelTag.ComponentTypeDefinedList,
            value: { tag: ModelTag.ComponentValTypeType, value: 0 },
        } as any;
        const resolved = deepResolveType(rctx, type) as any;
        expect(resolved.value.tag).toBe(ModelTag.ComponentValTypeResolved);
    });

    test('resolves option value type', () => {
        const inner = prim(PrimitiveValType.U32);
        const rctx = makeRctx(new Map([[0, inner]]));
        const type = {
            tag: ModelTag.ComponentTypeDefinedOption,
            value: { tag: ModelTag.ComponentValTypeType, value: 0 },
        } as any;
        const resolved = deepResolveType(rctx, type) as any;
        expect(resolved.value.tag).toBe(ModelTag.ComponentValTypeResolved);
    });

    test('resolves result ok/err', () => {
        const u32 = prim(PrimitiveValType.U32);
        const u8 = prim(PrimitiveValType.U8);
        const rctx = makeRctx(new Map([[0, u32], [1, u8]]));
        const type = {
            tag: ModelTag.ComponentTypeDefinedResult,
            ok: { tag: ModelTag.ComponentValTypeType, value: 0 },
            err: { tag: ModelTag.ComponentValTypeType, value: 1 },
        } as any;
        const resolved = deepResolveType(rctx, type) as any;
        expect(resolved.ok.tag).toBe(ModelTag.ComponentValTypeResolved);
        expect(resolved.err.tag).toBe(ModelTag.ComponentValTypeResolved);
    });

    test('resolves result with undefined ok/err', () => {
        const rctx = makeRctx();
        const type = {
            tag: ModelTag.ComponentTypeDefinedResult,
            ok: undefined,
            err: undefined,
        } as any;
        const resolved = deepResolveType(rctx, type) as any;
        expect(resolved.ok).toBeUndefined();
        expect(resolved.err).toBeUndefined();
    });

    test('resolves variant case types', () => {
        const inner = prim(PrimitiveValType.U32);
        const rctx = makeRctx(new Map([[0, inner]]));
        const type = {
            tag: ModelTag.ComponentTypeDefinedVariant,
            variants: [
                { name: 'a', ty: { tag: ModelTag.ComponentValTypeType, value: 0 } },
                { name: 'b', ty: undefined },
            ],
        } as any;
        const resolved = deepResolveType(rctx, type) as any;
        expect(resolved.variants[0].ty.tag).toBe(ModelTag.ComponentValTypeResolved);
        expect(resolved.variants[1].ty).toBeUndefined();
    });

    test('resolves func params and unnamed result', () => {
        const inner = prim(PrimitiveValType.U32);
        const rctx = makeRctx(new Map([[0, inner]]));
        const type = {
            tag: ModelTag.ComponentTypeFunc,
            params: [{ name: 'x', type: { tag: ModelTag.ComponentValTypeType, value: 0 } }],
            results: { tag: ModelTag.ComponentFuncResultUnnamed, type: { tag: ModelTag.ComponentValTypeType, value: 0 } },
        } as any;
        const resolved = deepResolveType(rctx, type) as any;
        expect(resolved.params[0].type.tag).toBe(ModelTag.ComponentValTypeResolved);
        expect(resolved.results.type.tag).toBe(ModelTag.ComponentValTypeResolved);
    });

    test('resolves func named results', () => {
        const inner = prim(PrimitiveValType.U32);
        const rctx = makeRctx(new Map([[0, inner]]));
        const type = {
            tag: ModelTag.ComponentTypeFunc,
            params: [],
            results: {
                tag: ModelTag.ComponentFuncResultNamed,
                values: [{ name: 'out', type: { tag: ModelTag.ComponentValTypeType, value: 0 } }],
            },
        } as any;
        const resolved = deepResolveType(rctx, type) as any;
        expect(resolved.results.values[0].type.tag).toBe(ModelTag.ComponentValTypeResolved);
    });

    test('handles circular references', () => {
        const inner = prim(PrimitiveValType.U32);
        const rctx = makeRctx(new Map([[0, inner]]));
        const type = {
            tag: ModelTag.ComponentTypeDefinedList,
            value: primVT(PrimitiveValType.U32),
        } as any;
        // Call twice with same type — second should hit cache
        const r1 = deepResolveType(rctx, type);
        const r2 = deepResolveType(rctx, type);
        expect(r1).toEqual(r2);
    });

    test('already-resolved ComponentValTypeResolved is deep-resolved', () => {
        const innerRecord = {
            tag: ModelTag.ComponentTypeDefinedRecord,
            members: [{ name: 'x', type: { tag: ModelTag.ComponentValTypeType, value: 0 } }],
        } as any;
        const u32 = prim(PrimitiveValType.U32);
        const rctx = makeRctx(new Map([[0, u32]]));
        const type = {
            tag: ModelTag.ComponentTypeDefinedOption,
            value: { tag: ModelTag.ComponentValTypeResolved, resolved: innerRecord },
        } as any;
        const resolved = deepResolveType(rctx, type) as any;
        expect(resolved.value.resolved.members[0].type.tag).toBe(ModelTag.ComponentValTypeResolved);
    });

    test('unresolved type index left as-is', () => {
        const rctx = makeRctx(); // no types registered
        const type = {
            tag: ModelTag.ComponentTypeDefinedList,
            value: { tag: ModelTag.ComponentValTypeType, value: 99 },
        } as any;
        const resolved = deepResolveType(rctx, type) as any;
        // unresolved reference is left unchanged
        expect(resolved.value.tag).toBe(ModelTag.ComponentValTypeType);
        expect(resolved.value.value).toBe(99);
    });
});
