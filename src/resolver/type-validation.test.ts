// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { validateExportType, validateImportType } from './type-validation';
import { ModelTag } from '../model/tags';
import { ComponentExternalKind } from '../model/exports';
import { PrimitiveValType } from '../model/types';
import { ResolverContext } from './types';

function makeMinimalRctx(overrides?: Partial<ResolverContext['indexes']>): ResolverContext {
    return {
        usesNumberForInt64: false,
        validateTypes: true,
        wasmInstantiate: async (m: WebAssembly.Module, i: WebAssembly.Imports | undefined) => WebAssembly.instantiate(m, i),
        liftingCache: new Map(), loweringCache: new Map(),
        resolvedTypes: new Map(),
        importToInstanceIndex: new Map(),
        canonicalResourceIds: new Map(),
        componentSectionCache: new Map(),
        resourceAliasGroups: new Map(),
        indexes: {
            componentExports: [],
            componentImports: [],
            componentFunctions: [],
            componentInstances: [],
            componentTypes: [],
            componentTypeResource: [],
            coreModules: [],
            coreInstances: [],
            coreFunctions: [],
            coreMemories: [],
            coreTables: [],
            coreGlobals: [],
            componentSections: [],
            ...overrides,
        },
    } as unknown as ResolverContext;
}

describe('type-validation', () => {
    describe('validateExportType', () => {
        test('no ty — skips validation', () => {
            const rctx = makeMinimalRctx();
            expect(() => validateExportType(rctx, {
                tag: ModelTag.ComponentExport,
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'foo' },
                kind: ComponentExternalKind.Func,
                index: 0,
                ty: undefined,
            })).not.toThrow();
        });

        test('kind mismatch throws', () => {
            const rctx = makeMinimalRctx();
            expect(() => validateExportType(rctx, {
                tag: ModelTag.ComponentExport,
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'bar' },
                kind: ComponentExternalKind.Func,
                index: 0,
                ty: { tag: ModelTag.ComponentTypeRefInstance, value: 0 },
            })).toThrow(/kind.*expects type ref/);
        });

        test('func export with matching type passes', () => {
            const funcType = {
                tag: ModelTag.ComponentTypeFunc as const,
                params: [{ name: 'x', type: { tag: ModelTag.ComponentValTypePrimitive as const, value: PrimitiveValType.U32 } }],
                results: { tag: ModelTag.ComponentFuncResultUnnamed as const, type: { tag: ModelTag.ComponentValTypePrimitive as const, value: PrimitiveValType.U32 } },
            };
            const rctx = makeMinimalRctx({
                componentTypes: [funcType],
                componentFunctions: [{
                    tag: ModelTag.CanonicalFunctionLift,
                    core_func_index: 0,
                    type_index: 0,
                    options: [],
                } as any],
            });
            expect(() => validateExportType(rctx, {
                tag: ModelTag.ComponentExport,
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'add' },
                kind: ComponentExternalKind.Func,
                index: 0,
                ty: { tag: ModelTag.ComponentTypeRefFunc, value: 0 },
            })).not.toThrow();
        });

        test('func export with param count mismatch throws', () => {
            const declaredType = {
                tag: ModelTag.ComponentTypeFunc as const,
                params: [
                    { name: 'x', type: { tag: ModelTag.ComponentValTypePrimitive as const, value: PrimitiveValType.U32 } },
                    { name: 'y', type: { tag: ModelTag.ComponentValTypePrimitive as const, value: PrimitiveValType.U32 } },
                ],
                results: { tag: ModelTag.ComponentFuncResultUnnamed as const, type: { tag: ModelTag.ComponentValTypePrimitive as const, value: PrimitiveValType.U32 } },
            };
            const actualType = {
                tag: ModelTag.ComponentTypeFunc as const,
                params: [{ name: 'x', type: { tag: ModelTag.ComponentValTypePrimitive as const, value: PrimitiveValType.U32 } }],
                results: { tag: ModelTag.ComponentFuncResultUnnamed as const, type: { tag: ModelTag.ComponentValTypePrimitive as const, value: PrimitiveValType.U32 } },
            };
            const rctx = makeMinimalRctx({
                componentTypes: [declaredType, actualType],
                componentFunctions: [{
                    tag: ModelTag.CanonicalFunctionLift,
                    core_func_index: 0,
                    type_index: 1,
                    options: [],
                } as any],
            });
            expect(() => validateExportType(rctx, {
                tag: ModelTag.ComponentExport,
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'add' },
                kind: ComponentExternalKind.Func,
                index: 0,
                ty: { tag: ModelTag.ComponentTypeRefFunc, value: 0 },
            })).toThrow(/declared type has 2 params.*actual has 1/);
        });

        test('func type ref pointing to non-func type throws', () => {
            const rctx = makeMinimalRctx({
                componentTypes: [{
                    tag: ModelTag.ComponentTypeInstance,
                    declarations: [],
                } as any],
            });
            expect(() => validateExportType(rctx, {
                tag: ModelTag.ComponentExport,
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'run' },
                kind: ComponentExternalKind.Func,
                index: 0,
                ty: { tag: ModelTag.ComponentTypeRefFunc, value: 0 },
            })).toThrow(/does not resolve to a function type/);
        });

        test('instance type ref pointing to non-instance type throws', () => {
            const rctx = makeMinimalRctx({
                componentTypes: [{
                    tag: ModelTag.ComponentTypeFunc,
                    params: [],
                    results: { tag: ModelTag.ComponentFuncResultNamed, values: [] },
                } as any],
            });
            expect(() => validateExportType(rctx, {
                tag: ModelTag.ComponentExport,
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'ifc' },
                kind: ComponentExternalKind.Instance,
                index: 0,
                ty: { tag: ModelTag.ComponentTypeRefInstance, value: 0 },
            })).toThrow(/does not resolve to an instance type/);
        });

        test('out-of-range type index skips validation (nested scope)', () => {
            const rctx = makeMinimalRctx();
            expect(() => validateExportType(rctx, {
                tag: ModelTag.ComponentExport,
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'run' },
                kind: ComponentExternalKind.Func,
                index: 0,
                ty: { tag: ModelTag.ComponentTypeRefFunc, value: 99 },
            })).not.toThrow();
        });
    });

    describe('validateImportType', () => {
        test('func import with valid type passes', () => {
            const rctx = makeMinimalRctx({
                componentTypes: [{
                    tag: ModelTag.ComponentTypeFunc,
                    params: [],
                    results: { tag: ModelTag.ComponentFuncResultNamed, values: [] },
                } as any],
            });
            expect(() => validateImportType(rctx, {
                tag: ModelTag.ComponentImport,
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'log' },
                ty: { tag: ModelTag.ComponentTypeRefFunc, value: 0 },
            } as any)).not.toThrow();
        });

        test('func import pointing to non-func type throws', () => {
            const rctx = makeMinimalRctx({
                componentTypes: [{
                    tag: ModelTag.ComponentTypeInstance,
                    declarations: [],
                } as any],
            });
            expect(() => validateImportType(rctx, {
                tag: ModelTag.ComponentImport,
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'log' },
                ty: { tag: ModelTag.ComponentTypeRefFunc, value: 0 },
            } as any)).toThrow(/does not resolve to a function type/);
        });

        test('instance import pointing to non-instance type throws', () => {
            const rctx = makeMinimalRctx({
                componentTypes: [{
                    tag: ModelTag.ComponentTypeFunc,
                    params: [],
                    results: { tag: ModelTag.ComponentFuncResultNamed, values: [] },
                } as any],
            });
            expect(() => validateImportType(rctx, {
                tag: ModelTag.ComponentImport,
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'env' },
                ty: { tag: ModelTag.ComponentTypeRefInstance, value: 0 },
            } as any)).toThrow(/does not resolve to an instance type/);
        });

        test('component/type/module/value import kinds pass without extra validation', () => {
            const rctx = makeMinimalRctx();
            for (const refTag of [
                ModelTag.ComponentTypeRefComponent,
                ModelTag.ComponentTypeRefType,
                ModelTag.ComponentTypeRefModule,
                ModelTag.ComponentTypeRefValue,
            ]) {
                expect(() => validateImportType(rctx, {
                    tag: ModelTag.ComponentImport,
                    name: { tag: ModelTag.ComponentExternNameKebab, name: 'x' },
                    ty: { tag: refTag, value: 0 },
                } as any)).not.toThrow();
            }
        });
    });

    describe('validateExportType — named results', () => {
        test('matching named results pass', () => {
            const funcType = {
                tag: ModelTag.ComponentTypeFunc as const,
                params: [],
                results: {
                    tag: ModelTag.ComponentFuncResultNamed as const,
                    values: [
                        { name: 'out', type: { tag: ModelTag.ComponentValTypePrimitive as const, value: PrimitiveValType.U32 } },
                    ],
                },
            };
            const rctx = makeMinimalRctx({
                componentTypes: [funcType, funcType],
                componentFunctions: [{
                    tag: ModelTag.CanonicalFunctionLift,
                    core_func_index: 0,
                    type_index: 1,
                    options: [],
                } as any],
            });
            expect(() => validateExportType(rctx, {
                tag: ModelTag.ComponentExport,
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'run' },
                kind: ComponentExternalKind.Func,
                index: 0,
                ty: { tag: ModelTag.ComponentTypeRefFunc, value: 0 },
            })).not.toThrow();
        });

        test('named result count mismatch throws', () => {
            const declaredType = {
                tag: ModelTag.ComponentTypeFunc as const,
                params: [],
                results: {
                    tag: ModelTag.ComponentFuncResultNamed as const,
                    values: [
                        { name: 'a', type: { tag: ModelTag.ComponentValTypePrimitive as const, value: PrimitiveValType.U32 } },
                        { name: 'b', type: { tag: ModelTag.ComponentValTypePrimitive as const, value: PrimitiveValType.U32 } },
                    ],
                },
            };
            const actualType = {
                tag: ModelTag.ComponentTypeFunc as const,
                params: [],
                results: {
                    tag: ModelTag.ComponentFuncResultNamed as const,
                    values: [
                        { name: 'a', type: { tag: ModelTag.ComponentValTypePrimitive as const, value: PrimitiveValType.U32 } },
                    ],
                },
            };
            const rctx = makeMinimalRctx({
                componentTypes: [declaredType, actualType],
                componentFunctions: [{
                    tag: ModelTag.CanonicalFunctionLift,
                    core_func_index: 0,
                    type_index: 1,
                    options: [],
                } as any],
            });
            expect(() => validateExportType(rctx, {
                tag: ModelTag.ComponentExport,
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'run' },
                kind: ComponentExternalKind.Func,
                index: 0,
                ty: { tag: ModelTag.ComponentTypeRefFunc, value: 0 },
            })).toThrow(/declared type has 2 result values.*actual has 1/);
        });

        test('named result type mismatch throws', () => {
            const declaredType = {
                tag: ModelTag.ComponentTypeFunc as const,
                params: [],
                results: {
                    tag: ModelTag.ComponentFuncResultNamed as const,
                    values: [
                        { name: 'out', type: { tag: ModelTag.ComponentValTypePrimitive as const, value: PrimitiveValType.U32 } },
                    ],
                },
            };
            const actualType = {
                tag: ModelTag.ComponentTypeFunc as const,
                params: [],
                results: {
                    tag: ModelTag.ComponentFuncResultNamed as const,
                    values: [
                        { name: 'out', type: { tag: ModelTag.ComponentValTypePrimitive as const, value: PrimitiveValType.Float64 } },
                    ],
                },
            };
            const rctx = makeMinimalRctx({
                componentTypes: [declaredType, actualType],
                componentFunctions: [{
                    tag: ModelTag.CanonicalFunctionLift,
                    core_func_index: 0,
                    type_index: 1,
                    options: [],
                } as any],
            });
            expect(() => validateExportType(rctx, {
                tag: ModelTag.ComponentExport,
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'run' },
                kind: ComponentExternalKind.Func,
                index: 0,
                ty: { tag: ModelTag.ComponentTypeRefFunc, value: 0 },
            })).toThrow(/result 0.*type mismatch/);
        });

        test('unnamed result type mismatch throws', () => {
            const declaredType = {
                tag: ModelTag.ComponentTypeFunc as const,
                params: [],
                results: {
                    tag: ModelTag.ComponentFuncResultUnnamed as const,
                    type: { tag: ModelTag.ComponentValTypePrimitive as const, value: PrimitiveValType.U32 },
                },
            };
            const actualType = {
                tag: ModelTag.ComponentTypeFunc as const,
                params: [],
                results: {
                    tag: ModelTag.ComponentFuncResultUnnamed as const,
                    type: { tag: ModelTag.ComponentValTypePrimitive as const, value: PrimitiveValType.Float64 },
                },
            };
            const rctx = makeMinimalRctx({
                componentTypes: [declaredType, actualType],
                componentFunctions: [{
                    tag: ModelTag.CanonicalFunctionLift,
                    core_func_index: 0,
                    type_index: 1,
                    options: [],
                } as any],
            });
            expect(() => validateExportType(rctx, {
                tag: ModelTag.ComponentExport,
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'run' },
                kind: ComponentExternalKind.Func,
                index: 0,
                ty: { tag: ModelTag.ComponentTypeRefFunc, value: 0 },
            })).toThrow(/result type mismatch/);
        });

        test('param type mismatch throws', () => {
            const declaredType = {
                tag: ModelTag.ComponentTypeFunc as const,
                params: [{ name: 'x', type: { tag: ModelTag.ComponentValTypePrimitive as const, value: PrimitiveValType.U32 } }],
                results: { tag: ModelTag.ComponentFuncResultUnnamed as const, type: { tag: ModelTag.ComponentValTypePrimitive as const, value: PrimitiveValType.U32 } },
            };
            const actualType = {
                tag: ModelTag.ComponentTypeFunc as const,
                params: [{ name: 'x', type: { tag: ModelTag.ComponentValTypePrimitive as const, value: PrimitiveValType.Float64 } }],
                results: { tag: ModelTag.ComponentFuncResultUnnamed as const, type: { tag: ModelTag.ComponentValTypePrimitive as const, value: PrimitiveValType.U32 } },
            };
            const rctx = makeMinimalRctx({
                componentTypes: [declaredType, actualType],
                componentFunctions: [{
                    tag: ModelTag.CanonicalFunctionLift,
                    core_func_index: 0,
                    type_index: 1,
                    options: [],
                } as any],
            });
            expect(() => validateExportType(rctx, {
                tag: ModelTag.ComponentExport,
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'add' },
                kind: ComponentExternalKind.Func,
                index: 0,
                ty: { tag: ModelTag.ComponentTypeRefFunc, value: 0 },
            })).toThrow(/param 0.*type mismatch/);
        });

        test('result kind mismatch (unnamed vs named) throws', () => {
            const declaredType = {
                tag: ModelTag.ComponentTypeFunc as const,
                params: [],
                results: {
                    tag: ModelTag.ComponentFuncResultUnnamed as const,
                    type: { tag: ModelTag.ComponentValTypePrimitive as const, value: PrimitiveValType.U32 },
                },
            };
            const actualType = {
                tag: ModelTag.ComponentTypeFunc as const,
                params: [],
                results: {
                    tag: ModelTag.ComponentFuncResultNamed as const,
                    values: [{ name: 'out', type: { tag: ModelTag.ComponentValTypePrimitive as const, value: PrimitiveValType.U32 } }],
                },
            };
            const rctx = makeMinimalRctx({
                componentTypes: [declaredType, actualType],
                componentFunctions: [{
                    tag: ModelTag.CanonicalFunctionLift,
                    core_func_index: 0,
                    type_index: 1,
                    options: [],
                } as any],
            });
            expect(() => validateExportType(rctx, {
                tag: ModelTag.ComponentExport,
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'run' },
                kind: ComponentExternalKind.Func,
                index: 0,
                ty: { tag: ModelTag.ComponentTypeRefFunc, value: 0 },
            })).toThrow(/result kind mismatch/);
        });

        test('non-lift function skips structural validation', () => {
            const funcType = {
                tag: ModelTag.ComponentTypeFunc as const,
                params: [],
                results: { tag: ModelTag.ComponentFuncResultNamed as const, values: [] },
            };
            const rctx = makeMinimalRctx({
                componentTypes: [funcType],
                // not a CanonicalFunctionLift
                componentFunctions: [{
                    tag: ModelTag.CanonicalFunctionLower,
                    func_index: 0,
                    options: [],
                } as any],
            });
            expect(() => validateExportType(rctx, {
                tag: ModelTag.ComponentExport,
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'run' },
                kind: ComponentExternalKind.Func,
                index: 0,
                ty: { tag: ModelTag.ComponentTypeRefFunc, value: 0 },
            })).not.toThrow();
        });
    });
});
