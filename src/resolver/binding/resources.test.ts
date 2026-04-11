import { setConfiguration } from '../../utils/assert';
setConfiguration('Debug');

import { ModelTag } from '../../model/tags';
import { ResolverContext, BindingContext } from '../types';
import { createResourceTable } from '../context';
import { resolveCanonicalResourceType } from '../type-resolution';
import { createLifting as _createLifting } from './to-abi';
import { createLowering } from './to-js';
import type { WasmValue } from './types';

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

    test('per-type handle isolation', () => {
        const resources = createResourceTable();
        const a = { name: 'a' };
        const b = { name: 'b' };
        const h1 = resources.add(0, a);
        const h2 = resources.add(1, b);
        expect(resources.get(0, h1)).toBe(a);
        expect(resources.get(1, h2)).toBe(b);
        // Per-type isolation enforced: cross-type lookup fails because
        // own<T>/borrow<T> use the canonical resource type index (the unified
        // type index of the ComponentTypeResource definition).
        expect(resources.has(1, h1)).toBe(false);
        expect(resources.has(0, h2)).toBe(false);
        expect(() => resources.get(1, h1)).toThrow('belongs to type');
        expect(() => resources.get(0, h2)).toThrow('belongs to type');
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

describe('canonical resource identity resolution', () => {
    test('resolves own<T> to ComponentTypeResource via unified type index', () => {
        const rctx = {
            indexes: {
                componentTypes: [
                    { tag: ModelTag.ComponentTypeDefinedRecord }, // type 0
                    { tag: ModelTag.ComponentTypeResource, rep: 0x7F }, // type 1
                    { tag: ModelTag.ComponentTypeDefinedOwn, value: 1 }, // type 2, points to resource at 1
                ],
            },
        } as any as ResolverContext;

        const own = rctx.indexes.componentTypes[2] as any;
        const resource = resolveCanonicalResourceType(rctx, own);
        expect(resource.tag).toBe(ModelTag.ComponentTypeResource);
        expect(resource.rep).toBe(0x7F);
    });

    test('resolves borrow<T> to same resource as own<T>', () => {
        const rctx = {
            indexes: {
                componentTypes: [
                    { tag: ModelTag.ComponentTypeResource, rep: 0x7F }, // type 0
                    { tag: ModelTag.ComponentTypeDefinedOwn, value: 0 }, // type 1
                    { tag: ModelTag.ComponentTypeDefinedBorrow, value: 0 }, // type 2
                ],
            },
        } as any as ResolverContext;

        const own = rctx.indexes.componentTypes[1] as any;
        const borrow = rctx.indexes.componentTypes[2] as any;
        const fromOwn = resolveCanonicalResourceType(rctx, own);
        const fromBorrow = resolveCanonicalResourceType(rctx, borrow);
        expect(fromOwn).toBe(fromBorrow);
    });

    test('throws when type index does not point to a resource', () => {
        const rctx = {
            indexes: {
                componentTypes: [
                    { tag: ModelTag.ComponentTypeDefinedRecord }, // type 0
                    { tag: ModelTag.ComponentTypeDefinedOwn, value: 0 }, // type 1, points to record (wrong!)
                ],
            },
        } as any as ResolverContext;

        const own = rctx.indexes.componentTypes[1] as any;
        expect(() => resolveCanonicalResourceType(rctx, own)).toThrow('does not resolve to a resource type');
    });

    test('per-type ResourceTable isolation uses canonical resource index', () => {
        // Simulate two resources: stream (type 0), pollable (type 1)
        // own<stream> has value=0, own<pollable> has value=1
        const resources = createResourceTable();
        const stream = { kind: 'stream' };
        const pollable = { kind: 'pollable' };

        const h1 = resources.add(0, stream); // own<stream>
        const h2 = resources.add(1, pollable); // own<pollable>

        // Same-type access works
        expect(resources.get(0, h1)).toBe(stream);
        expect(resources.get(1, h2)).toBe(pollable);

        // Cross-type access fails
        expect(() => resources.get(1, h1)).toThrow('belongs to type');
        expect(() => resources.get(0, h2)).toThrow('belongs to type');

        // Cross-type remove fails
        expect(() => resources.remove(1, h1)).toThrow('belongs to type');
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
        const lifter = createLifting(rctx.resolved, ownModel as any);
        const obj = { name: 'stream' };
        const result = lifter(bctx, obj);
        expect(result).toHaveLength(1);
        expect(result[0]).toBeGreaterThan(0);
    });

    test('lifted object is stored in resource table', () => {
        const ownModel = { tag: ModelTag.ComponentTypeDefinedOwn, value: 0 };
        const lifter = createLifting(rctx.resolved, ownModel as any);
        const obj = { name: 'stream' };
        const [handle] = lifter(bctx, obj);
        expect(bctx.resources.get(0, handle as number)).toBe(obj);
    });

    test('multiple lifts produce unique handles', () => {
        const ownModel = { tag: ModelTag.ComponentTypeDefinedOwn, value: 0 };
        const lifter = createLifting(rctx.resolved, ownModel as any);
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
        const lowerer = createLowering(rctx.resolved, ownModel as any);
        const obj = { name: 'stream' };
        const handle = bctx.resources.add(0, obj);
        const result = lowerer(bctx, handle);
        expect(result).toBe(obj);
    });

    test('handle is removed after lowering (ownership transferred)', () => {
        const ownModel = { tag: ModelTag.ComponentTypeDefinedOwn, value: 0 };
        const lowerer = createLowering(rctx.resolved, ownModel as any);
        const obj = { name: 'stream' };
        const handle = bctx.resources.add(0, obj);
        lowerer(bctx, handle);
        expect(bctx.resources.has(0, handle)).toBe(false);
    });

    test('lowering same handle twice throws', () => {
        const ownModel = { tag: ModelTag.ComponentTypeDefinedOwn, value: 0 };
        const lowerer = createLowering(rctx.resolved, ownModel as any);
        const handle = bctx.resources.add(0, { name: 'stream' });
        lowerer(bctx, handle);
        expect(() => lowerer(bctx, handle)).toThrow('Invalid resource handle');
    });

    test('spill is 1', () => {
        const ownModel = { tag: ModelTag.ComponentTypeDefinedOwn, value: 0 };
        const lowerer = createLowering(rctx.resolved, ownModel as any);
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
        const lifter = createLifting(rctx.resolved, borrowModel as any);
        const obj = { name: 'ref' };
        const result = lifter(bctx, obj);
        expect(result).toHaveLength(1);
        expect(result[0]).toBeGreaterThan(0);
    });

    test('lifted object is stored in resource table', () => {
        const borrowModel = { tag: ModelTag.ComponentTypeDefinedBorrow, value: 0 };
        const lifter = createLifting(rctx.resolved, borrowModel as any);
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
        const lowerer = createLowering(rctx.resolved, borrowModel as any);
        const obj = { name: 'ref' };
        const handle = bctx.resources.add(0, obj);
        const result = lowerer(bctx, handle);
        expect(result).toBe(obj);
    });

    test('handle is NOT removed (borrow is temporary)', () => {
        const borrowModel = { tag: ModelTag.ComponentTypeDefinedBorrow, value: 0 };
        const lowerer = createLowering(rctx.resolved, borrowModel as any);
        const obj = { name: 'ref' };
        const handle = bctx.resources.add(0, obj);
        lowerer(bctx, handle);
        expect(bctx.resources.has(0, handle)).toBe(true);
    });

    test('can lower same handle multiple times', () => {
        const borrowModel = { tag: ModelTag.ComponentTypeDefinedBorrow, value: 0 };
        const lowerer = createLowering(rctx.resolved, borrowModel as any);
        const obj = { name: 'ref' };
        const handle = bctx.resources.add(0, obj);
        expect(lowerer(bctx, handle)).toBe(obj);
        expect(lowerer(bctx, handle)).toBe(obj);
        expect(lowerer(bctx, handle)).toBe(obj);
    });

    test('spill is 1', () => {
        const borrowModel = { tag: ModelTag.ComponentTypeDefinedBorrow, value: 0 };
        const lowerer = createLowering(rctx.resolved, borrowModel as any);
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
        const lifter = createLifting(rctx.resolved, { tag: ModelTag.ComponentTypeDefinedOwn, value: 0 } as any);
        const lowerer = createLowering(rctx.resolved, { tag: ModelTag.ComponentTypeDefinedOwn, value: 0 } as any);
        const obj = { name: 'owned' };
        const [handle] = lifter(bctx, obj);
        const result = lowerer(bctx, handle);
        expect(result).toBe(obj);
        expect(bctx.resources.has(0, handle as number)).toBe(false);
    });

    test('lift borrow, lower borrow → handle kept', () => {
        const lifter = createLifting(rctx.resolved, { tag: ModelTag.ComponentTypeDefinedBorrow, value: 0 } as any);
        const lowerer = createLowering(rctx.resolved, { tag: ModelTag.ComponentTypeDefinedBorrow, value: 0 } as any);
        const obj = { name: 'borrowed' };
        const [handle] = lifter(bctx, obj);
        const result = lowerer(bctx, handle);
        expect(result).toBe(obj);
        expect(bctx.resources.has(0, handle as number)).toBe(true);
    });

    test('lift own, lower borrow → object returned, handle still exists', () => {
        const lifter = createLifting(rctx.resolved, { tag: ModelTag.ComponentTypeDefinedOwn, value: 0 } as any);
        const borrowLowerer = createLowering(rctx.resolved, { tag: ModelTag.ComponentTypeDefinedBorrow, value: 0 } as any);
        const obj = { name: 'owned-but-borrowed' };
        const [handle] = lifter(bctx, obj);
        const result = borrowLowerer(bctx, handle);
        expect(result).toBe(obj);
        expect(bctx.resources.has(0, handle as number)).toBe(true);
    });

    test('lift own, lower own, try lower again → throws', () => {
        const lifter = createLifting(rctx.resolved, { tag: ModelTag.ComponentTypeDefinedOwn, value: 0 } as any);
        const lowerer = createLowering(rctx.resolved, { tag: ModelTag.ComponentTypeDefinedOwn, value: 0 } as any);
        const obj = { name: 'consumed' };
        const [handle] = lifter(bctx, obj);
        lowerer(bctx, handle);
        expect(() => lowerer(bctx, handle)).toThrow('Invalid resource handle');
    });
});
