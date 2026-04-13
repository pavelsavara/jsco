// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { initializeAsserts } from '../../utils/assert';
initializeAsserts();

import { ModelTag } from '../../model/tags';
import { resolveComponentImport } from '../component-imports';
import { ResolverContext, BindingContext, BinderArgs } from '../types';
import { ComponentImport } from '../../model/imports';

function createMinimalRctx(): ResolverContext {
    return {
        resolved: {
            liftingCache: new Map(), loweringCache: new Map(),
            resolvedTypes: new Map(),
            usesNumberForInt64: false,
        },
        importToInstanceIndex: new Map(),
        indexes: {
            componentTypes: [],
            componentImports: [],
            componentExports: [],
            componentInstances: [],
            componentFunctions: [],
            componentTypeResource: [],
            componentSections: [],
            coreModules: [],
            coreInstances: [],
            coreFunctions: [],
            coreMemories: [],
            coreGlobals: [],
            coreTables: [],
        },
    } as any as ResolverContext;
}

function createMinimalBctx(): BindingContext {
    return {} as any as BindingContext;
}

function makeImport(name: string, tyTag: ModelTag, tyValue: number = 0, nameTag: ModelTag = ModelTag.ComponentExternNameKebab): ComponentImport {
    return {
        tag: ModelTag.ComponentImport,
        selfSortIndex: 0,
        name: { tag: nameTag, name } as any,
        ty: { tag: tyTag, value: tyValue } as any,
    } as ComponentImport;
}

describe('ComponentTypeRefFunc import resolution', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    describe('direct key lookup', () => {
        test('function found in imports by direct name', async () => {
            const myFunc = (x: number) => x + 1;
            const imp = makeImport('my-func', ModelTag.ComponentTypeRefFunc);
            const resolved = resolveComponentImport(rctx, { callerElement: undefined, element: imp });
            const bargs: BinderArgs = {
                imports: { 'my-func': myFunc } as any,
            };
            const result = await resolved.binder(bctx, bargs);
            expect(result.result).toBe(myFunc);
        });

        test('import name not found returns undefined', async () => {
            const imp = makeImport('missing-func', ModelTag.ComponentTypeRefFunc);
            const resolved = resolveComponentImport(rctx, { callerElement: undefined, element: imp });
            const bargs: BinderArgs = {
                imports: { 'other-func': () => { } } as any,
            };
            const result = await resolved.binder(bctx, bargs);
            expect(result.result).toBeUndefined();
        });

        test('undefined imports returns undefined', async () => {
            const imp = makeImport('my-func', ModelTag.ComponentTypeRefFunc);
            const resolved = resolveComponentImport(rctx, { callerElement: undefined, element: imp });
            const bargs: BinderArgs = {};
            const result = await resolved.binder(bctx, bargs);
            expect(result.result).toBeUndefined();
        });

        test('empty string key with matching import', async () => {
            const fn = () => 'empty';
            const imp = makeImport('', ModelTag.ComponentTypeRefFunc);
            const resolved = resolveComponentImport(rctx, { callerElement: undefined, element: imp });
            const bargs: BinderArgs = {
                imports: { '': fn } as any,
            };
            const result = await resolved.binder(bctx, bargs);
            expect(result.result).toBe(fn);
        });
    });

    describe('namespaced lookup with #', () => {
        test('wasi-style namespace resolves through hash separator', async () => {
            const getStdin = () => 'stdin-handle';
            const imp = makeImport('wasi:cli/stdin#get-stdin', ModelTag.ComponentTypeRefFunc);
            const resolved = resolveComponentImport(rctx, { callerElement: undefined, element: imp });
            const bargs: BinderArgs = {
                imports: {
                    'wasi:cli/stdin': { 'get-stdin': getStdin },
                } as any,
            };
            const result = await resolved.binder(bctx, bargs);
            expect(result.result).toBe(getStdin);
        });

        test('missing namespace returns undefined', async () => {
            const imp = makeImport('wasi:cli/stdout#write', ModelTag.ComponentTypeRefFunc);
            const resolved = resolveComponentImport(rctx, { callerElement: undefined, element: imp });
            const bargs: BinderArgs = {
                imports: {
                    'wasi:cli/stdin': { 'get-stdin': () => { } },
                } as any,
            };
            const result = await resolved.binder(bctx, bargs);
            expect(result.result).toBeUndefined();
        });

        test('namespace exists but sub-key does not', async () => {
            const imp = makeImport('wasi:cli/stdin#missing', ModelTag.ComponentTypeRefFunc);
            const resolved = resolveComponentImport(rctx, { callerElement: undefined, element: imp });
            const bargs: BinderArgs = {
                imports: {
                    'wasi:cli/stdin': { 'get-stdin': () => { } },
                } as any,
            };
            const result = await resolved.binder(bctx, bargs);
            expect(result.result).toBeUndefined();
        });

        test('prefers direct key over namespaced split', async () => {
            const directFn = () => 'direct';
            const imp = makeImport('ns#func', ModelTag.ComponentTypeRefFunc);
            const resolved = resolveComponentImport(rctx, { callerElement: undefined, element: imp });
            const bargs: BinderArgs = {
                imports: {
                    'ns#func': directFn,
                    'ns': { func: () => 'split' },
                } as any,
            };
            const result = await resolved.binder(bctx, bargs);
            expect(result.result).toBe(directFn);
        });
    });
});

describe('ComponentTypeRefType import resolution', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
    });

    test('returns result undefined', async () => {
        const imp = makeImport('my-type', ModelTag.ComponentTypeRefType, 0);
        (imp.ty as any).value = { tag: ModelTag.TypeBoundsEq, value: 0 };
        const resolved = resolveComponentImport(rctx, { callerElement: undefined, element: imp });
        const bargs: BinderArgs = {
            imports: { 'my-type': {} } as any,
        };
        const result = await resolved.binder(bctx, bargs);
        expect(result.result).toBeUndefined();
    });

    test('does not throw when imports missing', async () => {
        const imp = makeImport('my-type', ModelTag.ComponentTypeRefType, 0);
        (imp.ty as any).value = { tag: ModelTag.TypeBoundsEq, value: 0 };
        const resolved = resolveComponentImport(rctx, { callerElement: undefined, element: imp });
        const bargs: BinderArgs = {};
        const result = await resolved.binder(bctx, bargs);
        expect(result.result).toBeUndefined();
    });
});

describe('ComponentTypeRefInstance import resolution', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMinimalBctx();
        bctx.instances = { coreInstances: [], componentInstances: [] };
    });

    test('stores imports in instance table', async () => {
        const imp = makeImport('my-instance', ModelTag.ComponentTypeRefInstance);
        const resolved = resolveComponentImport(rctx, { callerElement: undefined, element: imp });
        const instanceFuncs = { sendMessage: () => { } };
        const bargs: BinderArgs = {
            imports: { 'my-instance': instanceFuncs } as any,
        };
        const result = await resolved.binder(bctx, bargs);
        expect(result.result).toBeDefined();
        expect((result.result as any).exports.sendMessage).toBe(instanceFuncs.sendMessage);
    });

    test('creates empty instance when imports missing', async () => {
        const imp = makeImport('my-instance', ModelTag.ComponentTypeRefInstance);
        const resolved = resolveComponentImport(rctx, { callerElement: undefined, element: imp });
        const bargs: BinderArgs = {};
        const result = await resolved.binder(bctx, bargs);
        expect(result.result).toBeDefined();
        expect((result.result as any).exports).toEqual({});
    });
});
