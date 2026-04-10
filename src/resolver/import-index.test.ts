import { setConfiguration } from '../utils/assert';
setConfiguration('Debug');

import { ModelTag, WITSection } from '../model/tags';
import { PrimitiveValType, ComponentTypeInstance, ComponentTypeFunc } from '../model/types';
import { ComponentImport } from '../model/imports';
import { createResolverContext } from './context';

/**
 * Tests for import→sort index mapping.
 *
 * Each import kind contributes to its respective sort's index space:
 *   - ComponentTypeRefInstance → componentInstances[]
 *   - ComponentTypeRefFunc → componentFunctions[]
 *   - ComponentTypeRefComponent → componentInstances[] + componentSections[]
 *
 * importToInstanceIndex maps componentImports[] positions to componentInstances[]
 * positions for instance-kind and component-kind imports.
 */

function makeInstanceType(funcName: string): ComponentTypeInstance {
    return {
        tag: ModelTag.ComponentTypeInstance,
        declarations: [
            {
                tag: ModelTag.InstanceTypeDeclarationType,
                value: {
                    tag: ModelTag.ComponentTypeFunc,
                    params: [
                        { name: 'x', type: { tag: ModelTag.ComponentValTypePrimitive, value: PrimitiveValType.U32 } },
                    ],
                    results: { tag: ModelTag.ComponentFuncResultNamed, values: [] },
                },
            },
            {
                tag: ModelTag.InstanceTypeDeclarationExport,
                name: { tag: ModelTag.ComponentExternNameKebab, name: funcName },
                ty: { tag: ModelTag.ComponentTypeRefFunc, value: 0 },
            },
        ],
    } as ComponentTypeInstance;
}

function makeFuncType(): ComponentTypeFunc {
    return {
        tag: ModelTag.ComponentTypeFunc,
        params: [
            { name: 'v', type: { tag: ModelTag.ComponentValTypePrimitive, value: PrimitiveValType.U32 } },
        ],
        results: { tag: ModelTag.ComponentFuncResultNamed, values: [] },
    } as ComponentTypeFunc;
}

describe('import index mapping', () => {
    test('instance import populates importToInstanceIndex', () => {
        const instanceType = makeInstanceType('do-thing');
        const funcType = makeFuncType();

        const sections: WITSection[] = [
            instanceType,
            funcType,
            {
                tag: ModelTag.ComponentImport,
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'my-instance' },
                ty: { tag: ModelTag.ComponentTypeRefInstance, value: 0 as any },
            } as ComponentImport as any,
        ];

        const rctx = createResolverContext(sections, {});

        // Import 0 (instance kind) → instance 0
        expect(rctx.importToInstanceIndex.get(0)).toBe(0);
        expect(rctx.indexes.componentInstances.length).toBe(1);
        expect(rctx.indexes.componentImports.length).toBe(1);
    });

    test('func import before instance import shifts instance index', () => {
        const instanceType = makeInstanceType('do-thing');
        const funcType = makeFuncType();

        const sections: WITSection[] = [
            instanceType,
            funcType,
            // Import 0: func import
            {
                tag: ModelTag.ComponentImport,
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'my-func' },
                ty: { tag: ModelTag.ComponentTypeRefFunc, value: 1 as any },
            } as ComponentImport as any,
            // Import 1: instance import
            {
                tag: ModelTag.ComponentImport,
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'my-instance' },
                ty: { tag: ModelTag.ComponentTypeRefInstance, value: 0 as any },
            } as ComponentImport as any,
        ];

        const rctx = createResolverContext(sections, {});

        // Func import is import 0 — no instance mapping
        expect(rctx.importToInstanceIndex.has(0)).toBe(false);
        // Instance import is import 1 → instance 0
        expect(rctx.importToInstanceIndex.get(1)).toBe(0);
        // Func import contributed to componentFunctions[]
        expect(rctx.indexes.componentFunctions.length).toBe(1);
        expect(rctx.indexes.componentInstances.length).toBe(1);
    });

    test('multiple instance imports get correct indices', () => {
        const instanceType0 = makeInstanceType('func-a');
        const instanceType1 = makeInstanceType('func-b');

        const sections: WITSection[] = [
            instanceType0,
            instanceType1,
            // Import 0: instance
            {
                tag: ModelTag.ComponentImport,
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'iface-a' },
                ty: { tag: ModelTag.ComponentTypeRefInstance, value: 0 as any },
            } as ComponentImport as any,
            // Import 1: instance
            {
                tag: ModelTag.ComponentImport,
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'iface-b' },
                ty: { tag: ModelTag.ComponentTypeRefInstance, value: 1 as any },
            } as ComponentImport as any,
        ];

        const rctx = createResolverContext(sections, {});

        expect(rctx.importToInstanceIndex.get(0)).toBe(0);
        expect(rctx.importToInstanceIndex.get(1)).toBe(1);
        expect(rctx.indexes.componentInstances.length).toBe(2);
    });

    test('component import populates importToInstanceIndex and componentSections', () => {
        const instanceType = makeInstanceType('do-thing');

        const sections: WITSection[] = [
            instanceType,
            // Import 0: component import
            {
                tag: ModelTag.ComponentImport,
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'my-component' },
                ty: { tag: ModelTag.ComponentTypeRefComponent, value: 0 as any },
            } as ComponentImport as any,
        ];

        const rctx = createResolverContext(sections, {});

        // Component import → instance 0
        expect(rctx.importToInstanceIndex.get(0)).toBe(0);
        expect(rctx.indexes.componentInstances.length).toBe(1);
        // Also in component sort
        expect(rctx.indexes.componentSections.length).toBe(1);
    });

    test('mixed imports: type, func, component, instance all get correct indices', () => {
        const instanceType0 = makeInstanceType('func-a');
        const funcType = makeFuncType();
        const instanceType1 = makeInstanceType('func-b');

        const sections: WITSection[] = [
            instanceType0,
            funcType,
            instanceType1,
            // Import 0: type import (no instance entry)
            {
                tag: ModelTag.ComponentImport,
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'my-type' },
                ty: {
                    tag: ModelTag.ComponentTypeRefType,
                    value: { tag: ModelTag.TypeBoundsEq, value: 0 },
                },
            } as ComponentImport as any,
            // Import 1: func import (no instance entry, goes to componentFunctions)
            {
                tag: ModelTag.ComponentImport,
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'my-func' },
                ty: { tag: ModelTag.ComponentTypeRefFunc, value: 1 as any },
            } as ComponentImport as any,
            // Import 2: component import (instance entry + componentSections entry)
            {
                tag: ModelTag.ComponentImport,
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'my-component' },
                ty: { tag: ModelTag.ComponentTypeRefComponent, value: 0 as any },
            } as ComponentImport as any,
            // Import 3: instance import (instance entry)
            {
                tag: ModelTag.ComponentImport,
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'my-instance' },
                ty: { tag: ModelTag.ComponentTypeRefInstance, value: 2 as any },
            } as ComponentImport as any,
        ];

        const rctx = createResolverContext(sections, {});

        // Type import (0) — no instance mapping
        expect(rctx.importToInstanceIndex.has(0)).toBe(false);
        // Func import (1) — no instance mapping
        expect(rctx.importToInstanceIndex.has(1)).toBe(false);
        // Component import (2) → instance 0
        expect(rctx.importToInstanceIndex.get(2)).toBe(0);
        // Instance import (3) → instance 1
        expect(rctx.importToInstanceIndex.get(3)).toBe(1);

        expect(rctx.indexes.componentImports.length).toBe(4);
        expect(rctx.indexes.componentInstances.length).toBe(2);
        expect(rctx.indexes.componentFunctions.length).toBe(1);
        expect(rctx.indexes.componentSections.length).toBe(1);
    });
});
