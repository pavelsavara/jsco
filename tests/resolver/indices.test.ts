// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { initializeAsserts } from '../../src/utils/assert';
initializeAsserts();

import { ModelTag } from '../../src/parser/model/tags';
import type { CoreFuncIndex, CoreInstanceIndex, CoreModuleIndex, ComponentFuncIndex, ComponentInstanceIndex, ComponentTypeIndex } from '../../src/parser/model/indices';
import type { ResolverContext } from '../../src/resolver/types';
import {
    getCoreFunction,
    getCoreInstance,
    getCoreModule,
    getComponentFunction,
    getComponentInstance,
    getComponentType,
} from '../../src/resolver/indices';

function makeRctx(overrides: Partial<ResolverContext['indexes']> = {}): ResolverContext {
    return {
        indexes: {
            coreFunctions: [],
            coreInstances: [],
            coreModules: [],
            componentFunctions: [],
            componentInstances: [],
            componentTypes: [],
            coreMemories: [],
            coreGlobals: [],
            coreTables: [],
            componentImports: [],
            componentExports: [],
            componentTypeResource: [],
            componentSections: [],
            ...overrides,
        },
    } as any as ResolverContext;
}

describe('resolver/indices.ts', () => {
    describe('getCoreFunction', () => {
        test('returns function at valid index', () => {
            const fn = { tag: ModelTag.CanonicalFunctionLift, selfSortIndex: 0 };
            const rctx = makeRctx({ coreFunctions: [fn as any] });
            expect(getCoreFunction(rctx, 0 as CoreFuncIndex)).toBe(fn);
        });

        test('throws on negative index', () => {
            const rctx = makeRctx();
            expect(() => getCoreFunction(rctx, -1 as CoreFuncIndex)).toThrow();
        });

        test('throws on out-of-bounds index', () => {
            const rctx = makeRctx({ coreFunctions: [{ tag: ModelTag.CanonicalFunctionLift, selfSortIndex: 0 } as any] });
            expect(() => getCoreFunction(rctx, 5 as CoreFuncIndex)).toThrow();
        });
    });

    describe('getCoreInstance', () => {
        test('returns instance at valid index', () => {
            const inst = { tag: ModelTag.CoreInstanceInstantiate, selfSortIndex: 0 };
            const rctx = makeRctx({ coreInstances: [inst as any] });
            expect(getCoreInstance(rctx, 0 as CoreInstanceIndex)).toBe(inst);
        });

        test('throws on out-of-bounds index', () => {
            const rctx = makeRctx();
            expect(() => getCoreInstance(rctx, 0 as CoreInstanceIndex)).toThrow();
        });
    });

    describe('getCoreModule', () => {
        test('returns module at valid index', () => {
            const mod = { tag: ModelTag.CoreModule, selfSortIndex: 0 };
            const rctx = makeRctx({ coreModules: [mod as any] });
            expect(getCoreModule(rctx, 0 as CoreModuleIndex)).toBe(mod);
        });

        test('throws on out-of-bounds index', () => {
            const rctx = makeRctx();
            expect(() => getCoreModule(rctx, 0 as CoreModuleIndex)).toThrow();
        });
    });

    describe('getComponentFunction', () => {
        test('returns function at valid index', () => {
            const fn = { tag: ModelTag.CanonicalFunctionLift, selfSortIndex: 0 };
            const rctx = makeRctx({ componentFunctions: [fn as any] });
            expect(getComponentFunction(rctx, 0 as ComponentFuncIndex)).toBe(fn);
        });

        test('throws on out-of-bounds index', () => {
            const rctx = makeRctx();
            expect(() => getComponentFunction(rctx, 0 as ComponentFuncIndex)).toThrow();
        });

        test('throws on negative index', () => {
            const rctx = makeRctx({ componentFunctions: [{ tag: ModelTag.CanonicalFunctionLift, selfSortIndex: 0 } as any] });
            expect(() => getComponentFunction(rctx, -1 as ComponentFuncIndex)).toThrow();
        });
    });

    describe('getComponentInstance', () => {
        test('returns instance at valid index', () => {
            const inst = { tag: ModelTag.ComponentInstanceInstantiate, selfSortIndex: 0 };
            const rctx = makeRctx({ componentInstances: [inst as any] });
            expect(getComponentInstance(rctx, 0 as ComponentInstanceIndex)).toBe(inst);
        });

        test('throws on out-of-bounds index', () => {
            const rctx = makeRctx();
            expect(() => getComponentInstance(rctx, 0 as ComponentInstanceIndex)).toThrow();
        });
    });

    describe('getComponentType', () => {
        test('returns type at valid index', () => {
            const ty = { tag: ModelTag.ComponentTypeFunc, selfSortIndex: 0 };
            const rctx = makeRctx({ componentTypes: [ty as any] });
            expect(getComponentType(rctx, 0 as ComponentTypeIndex)).toBe(ty);
        });

        test('throws on out-of-bounds index', () => {
            const rctx = makeRctx();
            expect(() => getComponentType(rctx, 0 as ComponentTypeIndex)).toThrow();
        });

        test('returns correct item from multi-element array', () => {
            const ty0 = { tag: ModelTag.ComponentTypeFunc, selfSortIndex: 0 };
            const ty1 = { tag: ModelTag.ComponentTypeInstance, selfSortIndex: 1 };
            const rctx = makeRctx({ componentTypes: [ty0, ty1] as any[] });
            expect(getComponentType(rctx, 1 as ComponentTypeIndex)).toBe(ty1);
        });
    });
});
