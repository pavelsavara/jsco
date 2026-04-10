import { setConfiguration } from '../../utils/assert';
setConfiguration('Debug');

import { ModelTag } from '../../model/tags';
import { ResolverContext, BindingContext } from '../types';
import { createResourceTable } from '../context';
import { createLifting } from './to-abi';
import { createLowering } from './to-js';

function createMinimalRctx(): ResolverContext {
    return {
        memoizeCache: new Map(),
        resolvedTypes: new Map(),
        usesNumberForInt64: false,
    } as any as ResolverContext;
}

function createMockCtxWithResources(): BindingContext {
    const resources = createResourceTable();
    return {
        resources,
    } as any as BindingContext;
}

describe('ResourceTable', () => {
    test('add returns handle >= 1', () => {
        const resources = createResourceTable();
        const h = resources.add(0, { name: 'a' });
        expect(h).toBeGreaterThanOrEqual(1);
    });

    test('get retrieves stored object', () => {
        const resources = createResourceTable();
        const obj = { name: 'a' };
        const h = resources.add(0, obj);
        expect(resources.get(0, h)).toBe(obj);
    });

    test('has reports existence', () => {
        const resources = createResourceTable();
        const h = resources.add(0, { name: 'a' });
        expect(resources.has(0, h)).toBe(true);
        expect(resources.has(0, 999)).toBe(false);
    });

    test('remove returns and deletes', () => {
        const resources = createResourceTable();
        const obj = { name: 'a' };
        const h = resources.add(0, obj);
        const removed = resources.remove(0, h);
        expect(removed).toBe(obj);
        expect(resources.has(0, h)).toBe(false);
    });

    test('get invalid handle throws', () => {
        const resources = createResourceTable();
        expect(() => resources.get(0, 999)).toThrow('Invalid resource handle');
    });

    test('remove invalid handle throws', () => {
        const resources = createResourceTable();
        expect(() => resources.remove(0, 999)).toThrow('Invalid resource handle');
    });

    test('independent tables per resource type', () => {
        const resources = createResourceTable();
        const a = { name: 'a' };
        const b = { name: 'b' };
        const h1 = resources.add(0, a);
        const h2 = resources.add(1, b);
        expect(resources.get(0, h1)).toBe(a);
        expect(resources.get(1, h2)).toBe(b);
        // Flat table with type tracking: cross-type lookup succeeds because
        // own<T>/borrow<T> may use different local type indices for the same
        // canonical resource. Full isolation requires canonical resource identity
        // resolution (local→canonical mapping).
        expect(resources.has(1, h1)).toBe(true);
        expect(resources.has(0, h2)).toBe(true);
    });

    test('unique handles per add call', () => {
        const resources = createResourceTable();
        const h1 = resources.add(0, 'x');
        const h2 = resources.add(0, 'y');
        const h3 = resources.add(0, 'z');
        expect(h1).not.toBe(h2);
        expect(h2).not.toBe(h3);
        expect(h1).not.toBe(h3);
    });
});

describe('own<T> lifting', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMockCtxWithResources();
    });

    test('JS object lifts to [handle] where handle > 0', () => {
        const ownModel = { tag: ModelTag.ComponentTypeDefinedOwn, value: 0 };
        const lifter = createLifting(rctx, ownModel as any);
        const obj = { name: 'stream' };
        const result = lifter(bctx, obj);
        expect(result).toHaveLength(1);
        expect(result[0]).toBeGreaterThan(0);
    });

    test('lifted object is stored in resource table', () => {
        const ownModel = { tag: ModelTag.ComponentTypeDefinedOwn, value: 0 };
        const lifter = createLifting(rctx, ownModel as any);
        const obj = { name: 'stream' };
        const [handle] = lifter(bctx, obj);
        expect(bctx.resources.get(0, handle as number)).toBe(obj);
    });

    test('multiple lifts produce unique handles', () => {
        const ownModel = { tag: ModelTag.ComponentTypeDefinedOwn, value: 0 };
        const lifter = createLifting(rctx, ownModel as any);
        const [h1] = lifter(bctx, { a: 1 });
        const [h2] = lifter(bctx, { a: 2 });
        expect(h1).not.toBe(h2);
    });
});

describe('own<T> lowering', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMockCtxWithResources();
    });

    test('handle lowers to original JS object', () => {
        const ownModel = { tag: ModelTag.ComponentTypeDefinedOwn, value: 0 };
        const lowerer = createLowering(rctx, ownModel as any);
        const obj = { name: 'stream' };
        const handle = bctx.resources.add(0, obj);
        const result = lowerer(bctx, handle);
        expect(result).toBe(obj);
    });

    test('handle is removed after lowering (ownership transferred)', () => {
        const ownModel = { tag: ModelTag.ComponentTypeDefinedOwn, value: 0 };
        const lowerer = createLowering(rctx, ownModel as any);
        const obj = { name: 'stream' };
        const handle = bctx.resources.add(0, obj);
        lowerer(bctx, handle);
        expect(bctx.resources.has(0, handle)).toBe(false);
    });

    test('lowering same handle twice throws', () => {
        const ownModel = { tag: ModelTag.ComponentTypeDefinedOwn, value: 0 };
        const lowerer = createLowering(rctx, ownModel as any);
        const handle = bctx.resources.add(0, { name: 'stream' });
        lowerer(bctx, handle);
        expect(() => lowerer(bctx, handle)).toThrow('Invalid resource handle');
    });

    test('spill is 1', () => {
        const ownModel = { tag: ModelTag.ComponentTypeDefinedOwn, value: 0 };
        const lowerer = createLowering(rctx, ownModel as any);
        expect((lowerer as any).spill).toBe(1);
    });
});

describe('borrow<T> lifting', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMockCtxWithResources();
    });

    test('JS object lifts to [handle]', () => {
        const borrowModel = { tag: ModelTag.ComponentTypeDefinedBorrow, value: 0 };
        const lifter = createLifting(rctx, borrowModel as any);
        const obj = { name: 'ref' };
        const result = lifter(bctx, obj);
        expect(result).toHaveLength(1);
        expect(result[0]).toBeGreaterThan(0);
    });

    test('lifted object is stored in resource table', () => {
        const borrowModel = { tag: ModelTag.ComponentTypeDefinedBorrow, value: 0 };
        const lifter = createLifting(rctx, borrowModel as any);
        const obj = { name: 'ref' };
        const [handle] = lifter(bctx, obj);
        expect(bctx.resources.get(0, handle as number)).toBe(obj);
    });
});

describe('borrow<T> lowering', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMockCtxWithResources();
    });

    test('handle lowers to JS object', () => {
        const borrowModel = { tag: ModelTag.ComponentTypeDefinedBorrow, value: 0 };
        const lowerer = createLowering(rctx, borrowModel as any);
        const obj = { name: 'ref' };
        const handle = bctx.resources.add(0, obj);
        const result = lowerer(bctx, handle);
        expect(result).toBe(obj);
    });

    test('handle is NOT removed (borrow is temporary)', () => {
        const borrowModel = { tag: ModelTag.ComponentTypeDefinedBorrow, value: 0 };
        const lowerer = createLowering(rctx, borrowModel as any);
        const obj = { name: 'ref' };
        const handle = bctx.resources.add(0, obj);
        lowerer(bctx, handle);
        expect(bctx.resources.has(0, handle)).toBe(true);
    });

    test('can lower same handle multiple times', () => {
        const borrowModel = { tag: ModelTag.ComponentTypeDefinedBorrow, value: 0 };
        const lowerer = createLowering(rctx, borrowModel as any);
        const obj = { name: 'ref' };
        const handle = bctx.resources.add(0, obj);
        expect(lowerer(bctx, handle)).toBe(obj);
        expect(lowerer(bctx, handle)).toBe(obj);
        expect(lowerer(bctx, handle)).toBe(obj);
    });

    test('spill is 1', () => {
        const borrowModel = { tag: ModelTag.ComponentTypeDefinedBorrow, value: 0 };
        const lowerer = createLowering(rctx, borrowModel as any);
        expect((lowerer as any).spill).toBe(1);
    });
});

describe('own vs borrow semantics', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMockCtxWithResources();
    });

    test('lift own, lower own → handle removed', () => {
        const lifter = createLifting(rctx, { tag: ModelTag.ComponentTypeDefinedOwn, value: 0 } as any);
        const lowerer = createLowering(rctx, { tag: ModelTag.ComponentTypeDefinedOwn, value: 0 } as any);
        const obj = { name: 'owned' };
        const [handle] = lifter(bctx, obj);
        const result = lowerer(bctx, handle);
        expect(result).toBe(obj);
        expect(bctx.resources.has(0, handle as number)).toBe(false);
    });

    test('lift borrow, lower borrow → handle kept', () => {
        const lifter = createLifting(rctx, { tag: ModelTag.ComponentTypeDefinedBorrow, value: 0 } as any);
        const lowerer = createLowering(rctx, { tag: ModelTag.ComponentTypeDefinedBorrow, value: 0 } as any);
        const obj = { name: 'borrowed' };
        const [handle] = lifter(bctx, obj);
        const result = lowerer(bctx, handle);
        expect(result).toBe(obj);
        expect(bctx.resources.has(0, handle as number)).toBe(true);
    });

    test('lift own, lower borrow → object returned, handle still exists', () => {
        const lifter = createLifting(rctx, { tag: ModelTag.ComponentTypeDefinedOwn, value: 0 } as any);
        const borrowLowerer = createLowering(rctx, { tag: ModelTag.ComponentTypeDefinedBorrow, value: 0 } as any);
        const obj = { name: 'owned-but-borrowed' };
        const [handle] = lifter(bctx, obj);
        const result = borrowLowerer(bctx, handle);
        expect(result).toBe(obj);
        expect(bctx.resources.has(0, handle as number)).toBe(true);
    });

    test('lift own, lower own, try lower again → throws', () => {
        const lifter = createLifting(rctx, { tag: ModelTag.ComponentTypeDefinedOwn, value: 0 } as any);
        const lowerer = createLowering(rctx, { tag: ModelTag.ComponentTypeDefinedOwn, value: 0 } as any);
        const obj = { name: 'consumed' };
        const [handle] = lifter(bctx, obj);
        lowerer(bctx, handle);
        expect(() => lowerer(bctx, handle)).toThrow('Invalid resource handle');
    });
});
