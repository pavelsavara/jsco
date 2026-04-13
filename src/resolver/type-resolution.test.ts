// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { initializeAsserts } from '../utils/assert';
initializeAsserts();

import { ModelTag } from '../model/tags';
import { PrimitiveValType } from '../model/types';
import { ComponentExternalKind } from '../model/exports';
import { buildResolvedTypeMap } from './type-resolution';
import type { ResolverContext } from './types';

function makeRctx(componentTypes: any[], componentInstances?: any[]): ResolverContext {
    return {
        indexes: {
            componentTypes,
            componentInstances: componentInstances ?? [],
            componentExports: [],
            componentImports: [],
            componentFunctions: [],
            componentTypeResource: [],
            coreModules: [],
            coreInstances: [],
            coreFunctions: [],
            coreMemories: [],
            coreTables: [],
            coreGlobals: [],
            componentSections: [],
        },
    } as any as ResolverContext;
}

describe('type-resolution.ts', () => {
    describe('buildResolvedTypeMap', () => {
        test('resolves primitive defined type', () => {
            const types = [{
                tag: ModelTag.ComponentTypeDefinedPrimitive,
                value: PrimitiveValType.U32,
            }];
            const rctx = makeRctx(types);
            const map = buildResolvedTypeMap(rctx);
            expect(map.size).toBe(1);
            expect(map.get(0 as any)!.tag).toBe(ModelTag.ComponentTypeDefinedPrimitive);
        });

        test('resolves record type', () => {
            const types = [{
                tag: ModelTag.ComponentTypeDefinedRecord,
                members: [{ name: 'x', type: { tag: ModelTag.ComponentValTypePrimitive, value: PrimitiveValType.U32 } }],
            }];
            const rctx = makeRctx(types);
            const map = buildResolvedTypeMap(rctx);
            expect(map.get(0 as any)!.tag).toBe(ModelTag.ComponentTypeDefinedRecord);
        });

        test('resolves func type', () => {
            const types = [{
                tag: ModelTag.ComponentTypeFunc,
                params: [{ name: 'a', type: { tag: ModelTag.ComponentValTypePrimitive, value: PrimitiveValType.U32 } }],
                results: { tag: ModelTag.ComponentFuncResultUnnamed, type: { tag: ModelTag.ComponentValTypePrimitive, value: PrimitiveValType.U32 } },
            }];
            const rctx = makeRctx(types);
            const map = buildResolvedTypeMap(rctx);
            expect(map.get(0 as any)!.tag).toBe(ModelTag.ComponentTypeFunc);
        });

        test('skips resource type', () => {
            const types = [{
                tag: ModelTag.ComponentTypeResource,
                rep: 0,
                dtor: undefined,
            }];
            const rctx = makeRctx(types);
            const map = buildResolvedTypeMap(rctx);
            expect(map.size).toBe(0);
        });

        test('skips component section type', () => {
            const types = [{
                tag: ModelTag.ComponentSection,
                sections: [],
            }];
            const rctx = makeRctx(types);
            const map = buildResolvedTypeMap(rctx);
            expect(map.size).toBe(0);
        });

        test('skips component type (component)', () => {
            const types = [{
                tag: ModelTag.ComponentTypeComponent,
                declarations: undefined,
            }];
            const rctx = makeRctx(types);
            const map = buildResolvedTypeMap(rctx);
            expect(map.size).toBe(0);
        });

        test('resolves instance type with type declaration', () => {
            const types = [{
                tag: ModelTag.ComponentTypeInstance,
                declarations: [{
                    tag: ModelTag.InstanceTypeDeclarationType,
                    value: {
                        tag: ModelTag.ComponentTypeDefinedPrimitive,
                        value: PrimitiveValType.U32,
                    },
                }],
            }];
            const rctx = makeRctx(types);
            const map = buildResolvedTypeMap(rctx);
            expect(map.get(0 as any)!.tag).toBe(ModelTag.ComponentTypeDefinedPrimitive);
        });

        test('instance type without type declaration returns undefined', () => {
            const types = [{
                tag: ModelTag.ComponentTypeInstance,
                declarations: [{
                    tag: ModelTag.InstanceTypeDeclarationExport,
                    name: { tag: ModelTag.ComponentExternNameKebab, name: 'foo' },
                    ty: { tag: ModelTag.ComponentTypeRefFunc, value: 0 },
                }],
            }];
            const rctx = makeRctx(types);
            const map = buildResolvedTypeMap(rctx);
            expect(map.size).toBe(0);
        });

        test('resolves alias to instance export type', () => {
            // Type 0: the record inside the instance
            // Type 1: instance type containing the record
            // Type 2: alias pointing to instance export
            const recordType = {
                tag: ModelTag.ComponentTypeDefinedRecord,
                members: [{ name: 'v', type: { tag: ModelTag.ComponentValTypePrimitive, value: PrimitiveValType.U32 } }],
            };
            const instanceType = {
                tag: ModelTag.ComponentTypeInstance,
                declarations: [
                    {
                        tag: ModelTag.InstanceTypeDeclarationType,
                        value: recordType,
                    },
                    {
                        tag: ModelTag.InstanceTypeDeclarationExport,
                        name: { tag: ModelTag.ComponentExternNameKebab, name: 'my-record' },
                        ty: {
                            tag: ModelTag.ComponentTypeRefType,
                            value: { tag: ModelTag.TypeBoundsEq, value: 0 },
                        },
                    },
                ],
            };
            const alias = {
                tag: ModelTag.ComponentAliasInstanceExport,
                kind: ComponentExternalKind.Type,
                instance_index: 0,
                name: 'my-record',
            };
            const rctx = makeRctx([recordType, instanceType, alias], [instanceType]);
            const map = buildResolvedTypeMap(rctx);
            expect(map.get(2 as any)!.tag).toBe(ModelTag.ComponentTypeDefinedRecord);
        });

        test('alias to non-type kind returns undefined', () => {
            const alias = {
                tag: ModelTag.ComponentAliasInstanceExport,
                kind: ComponentExternalKind.Func,
                instance_index: 0,
                name: 'my-func',
            };
            const rctx = makeRctx([alias], []);
            const map = buildResolvedTypeMap(rctx);
            expect(map.size).toBe(0);
        });

        test('resolves all defined type variants', () => {
            const types = [
                { tag: ModelTag.ComponentTypeDefinedList, value: { tag: ModelTag.ComponentValTypePrimitive, value: PrimitiveValType.U8 } },
                { tag: ModelTag.ComponentTypeDefinedTuple, members: [{ tag: ModelTag.ComponentValTypePrimitive, value: PrimitiveValType.U32 }] },
                { tag: ModelTag.ComponentTypeDefinedFlags, members: ['a', 'b'] },
                { tag: ModelTag.ComponentTypeDefinedEnum, members: ['x', 'y'] },
                { tag: ModelTag.ComponentTypeDefinedOption, value: { tag: ModelTag.ComponentValTypePrimitive, value: PrimitiveValType.U32 } },
                { tag: ModelTag.ComponentTypeDefinedResult, ok: { tag: ModelTag.ComponentValTypePrimitive, value: PrimitiveValType.U32 }, err: undefined },
                { tag: ModelTag.ComponentTypeDefinedOwn, value: 0 },
                { tag: ModelTag.ComponentTypeDefinedBorrow, value: 0 },
                { tag: ModelTag.ComponentTypeDefinedVariant, variants: [{ name: 'a', ty: { tag: ModelTag.ComponentValTypePrimitive, value: PrimitiveValType.U32 } }] },
            ];
            const rctx = makeRctx(types);
            const map = buildResolvedTypeMap(rctx);
            expect(map.size).toBe(9);
        });

        test('deep-resolves cross-references between types', () => {
            // Type 0: u32 primitive
            // Type 1: record with field referencing type 0
            const types = [
                { tag: ModelTag.ComponentTypeDefinedPrimitive, value: PrimitiveValType.U32 },
                {
                    tag: ModelTag.ComponentTypeDefinedRecord,
                    members: [{
                        name: 'field',
                        type: { tag: ModelTag.ComponentValTypeType, value: 0 },
                    }],
                },
            ];
            const rctx = makeRctx(types);
            const map = buildResolvedTypeMap(rctx);
            const record = map.get(1 as any) as any;
            expect(record.tag).toBe(ModelTag.ComponentTypeDefinedRecord);
            // The field type should be resolved to ComponentValTypeResolved
            expect(record.members[0].type.tag).toBe(ModelTag.ComponentValTypeResolved);
        });
    });
});
