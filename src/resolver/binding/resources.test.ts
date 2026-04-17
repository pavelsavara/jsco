// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { initializeAsserts } from '../../utils/assert';
initializeAsserts();

import { ModelTag } from '../../model/tags';
import { PrimitiveValType } from '../../model/types';
import { ResolverContext, BindingContext } from '../types';
import { createResourceTable } from '../context';
import { resolveCanonicalResourceType } from '../type-resolution';
import { createLifting as _createLifting } from './to-abi';
import { createLowering } from './to-js';
import type { WasmValue } from './types';
import { describeDebugOnly } from '../../test-utils/debug-only';

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
            canonicalResourceIds: new Map(),
            ownInstanceResources: new Set(),
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

function createMockHandleTable() {
    const table = new Map<number, unknown>();
    let nextHandle = 1;
    return {
        addReadable(_typeIdx: number, value: unknown): number {
            const h = nextHandle++;
            table.set(h, value);
            return h;
        },
        getReadable(_typeIdx: number, handle: number): unknown {
            if (!table.has(handle)) throw new Error('Invalid handle');
            return table.get(handle);
        },
        removeReadable(_typeIdx: number, handle: number): unknown {
            if (!table.has(handle)) throw new Error('Invalid handle');
            const val = table.get(handle);
            table.delete(handle);
            return val;
        },
    };
}

function createMockErrorContextTable() {
    const table = new Map<number, unknown>();
    let nextHandle = 1;
    return {
        add(value: unknown): number {
            const h = nextHandle++;
            table.set(h, value);
            return h;
        },
        get(handle: number): unknown {
            if (!table.has(handle)) throw new Error('Invalid handle');
            return table.get(handle);
        },
        remove(handle: number): unknown {
            if (!table.has(handle)) throw new Error('Invalid handle');
            const val = table.get(handle);
            table.delete(handle);
            return val;
        },
    };
}

function createMockCtxWithStreams(): BindingContext {
    return {
        resources: createResourceTable(),
        streams: createMockHandleTable() as any,
        futures: createMockHandleTable() as any,
        errorContexts: createMockErrorContextTable() as any,
    } as any as BindingContext;
}

describeDebugOnly('ResourceTable', () => {
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

describeDebugOnly('canonical resource identity resolution', () => {
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

describeDebugOnly('own<T> lifting', () => {
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

describeDebugOnly('own<T> lowering', () => {
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

describeDebugOnly('borrow<T> lifting', () => {
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

describeDebugOnly('borrow<T> lowering', () => {
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

describeDebugOnly('own vs borrow semantics', () => {
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
        const result = lowerer(bctx, handle!);
        expect(result).toBe(obj);
        expect(bctx.resources.has(0, handle as number)).toBe(false);
    });

    test('lift borrow, lower borrow → handle kept', () => {
        const lifter = createLifting(rctx.resolved, { tag: ModelTag.ComponentTypeDefinedBorrow, value: 0 } as any);
        const lowerer = createLowering(rctx.resolved, { tag: ModelTag.ComponentTypeDefinedBorrow, value: 0 } as any);
        const obj = { name: 'borrowed' };
        const [handle] = lifter(bctx, obj);
        const result = lowerer(bctx, handle!);
        expect(result).toBe(obj);
        expect(bctx.resources.has(0, handle as number)).toBe(true);
    });

    test('lift own, lower borrow → object returned, handle still exists', () => {
        const lifter = createLifting(rctx.resolved, { tag: ModelTag.ComponentTypeDefinedOwn, value: 0 } as any);
        const borrowLowerer = createLowering(rctx.resolved, { tag: ModelTag.ComponentTypeDefinedBorrow, value: 0 } as any);
        const obj = { name: 'owned-but-borrowed' };
        const [handle] = lifter(bctx, obj);
        const result = borrowLowerer(bctx, handle!);
        expect(result).toBe(obj);
        expect(bctx.resources.has(0, handle as number)).toBe(true);
    });

    test('lift own, lower own, try lower again → throws', () => {
        const lifter = createLifting(rctx.resolved, { tag: ModelTag.ComponentTypeDefinedOwn, value: 0 } as any);
        const lowerer = createLowering(rctx.resolved, { tag: ModelTag.ComponentTypeDefinedOwn, value: 0 } as any);
        const obj = { name: 'consumed' };
        const [handle] = lifter(bctx, obj);
        lowerer(bctx, handle!);
        expect(() => lowerer(bctx, handle!)).toThrow('Invalid resource handle');
    });
});

describeDebugOnly('borrow accounting (lend/unlend)', () => {
    test('new handle starts with zero lends', () => {
        const resources = createResourceTable();
        const h = resources.add(0, 'obj');
        expect(resources.lendCount(0, h)).toBe(0);
    });

    test('lend increments count', () => {
        const resources = createResourceTable();
        const h = resources.add(0, 'obj');
        resources.lend(0, h);
        expect(resources.lendCount(0, h)).toBe(1);
        resources.lend(0, h);
        expect(resources.lendCount(0, h)).toBe(2);
    });

    test('unlend decrements count', () => {
        const resources = createResourceTable();
        const h = resources.add(0, 'obj');
        resources.lend(0, h);
        resources.lend(0, h);
        resources.unlend(0, h);
        expect(resources.lendCount(0, h)).toBe(1);
        resources.unlend(0, h);
        expect(resources.lendCount(0, h)).toBe(0);
    });

    test('unlend below zero throws', () => {
        const resources = createResourceTable();
        const h = resources.add(0, 'obj');
        expect(() => resources.unlend(0, h)).toThrow('no outstanding borrows');
    });

    test('remove with outstanding borrows traps', () => {
        const resources = createResourceTable();
        const h = resources.add(0, 'obj');
        resources.lend(0, h);
        expect(() => resources.remove(0, h)).toThrow('outstanding borrow');
    });

    test('remove succeeds after all borrows returned', () => {
        const resources = createResourceTable();
        const h = resources.add(0, 'obj');
        resources.lend(0, h);
        resources.lend(0, h);
        resources.unlend(0, h);
        resources.unlend(0, h);
        expect(resources.remove(0, h)).toBe('obj');
    });

    test('lend on invalid handle throws', () => {
        const resources = createResourceTable();
        expect(() => resources.lend(0, 999)).toThrow('Invalid resource handle');
    });

    test('unlend on invalid handle throws', () => {
        const resources = createResourceTable();
        expect(() => resources.unlend(0, 999)).toThrow('Invalid resource handle');
    });

    test('lendCount on invalid handle throws', () => {
        const resources = createResourceTable();
        expect(() => resources.lendCount(0, 999)).toThrow('Invalid resource handle');
    });

    test('lend cross-type throws', () => {
        const resources = createResourceTable();
        const h = resources.add(0, 'obj');
        expect(() => resources.lend(1, h)).toThrow('belongs to type');
    });

    test('unlend cross-type throws', () => {
        const resources = createResourceTable();
        const h = resources.add(0, 'obj');
        resources.lend(0, h);
        expect(() => resources.unlend(1, h)).toThrow('belongs to type');
    });

    test('lend counts are per-handle, not per-type', () => {
        const resources = createResourceTable();
        const h1 = resources.add(0, 'a');
        const h2 = resources.add(0, 'b');
        resources.lend(0, h1);
        resources.lend(0, h1);
        resources.lend(0, h2);
        expect(resources.lendCount(0, h1)).toBe(2);
        expect(resources.lendCount(0, h2)).toBe(1);
        // Can remove h2 after its single lend is returned
        resources.unlend(0, h2);
        expect(resources.remove(0, h2)).toBe('b');
        // h1 still has outstanding borrows
        expect(() => resources.remove(0, h1)).toThrow('outstanding borrow');
    });
});

describeDebugOnly('resource handle isolation', () => {
    test('handles across types are globally unique', () => {
        const resources = createResourceTable();
        const h1 = resources.add(0, 'type0-a');
        const h2 = resources.add(1, 'type1-a');
        const h3 = resources.add(0, 'type0-b');
        const h4 = resources.add(2, 'type2-a');
        // All handles are unique regardless of type
        const allHandles = [h1, h2, h3, h4];
        expect(new Set(allHandles).size).toBe(4);
    });

    test('removing handle from one type does not affect other types', () => {
        const resources = createResourceTable();
        const h1 = resources.add(0, 'type0');
        const h2 = resources.add(1, 'type1');
        resources.remove(0, h1);
        // h2 still valid
        expect(resources.get(1, h2)).toBe('type1');
        expect(resources.has(1, h2)).toBe(true);
    });

    test('cross-type remove throws and does not affect the handle', () => {
        const resources = createResourceTable();
        const h = resources.add(0, 'obj');
        expect(() => resources.remove(1, h)).toThrow('belongs to type');
        // Original handle still intact
        expect(resources.get(0, h)).toBe('obj');
    });

    test('100 handles across 10 types maintain isolation', () => {
        const resources = createResourceTable();
        const handles: number[] = [];
        for (let type = 0; type < 10; type++) {
            for (let i = 0; i < 10; i++) {
                handles.push(resources.add(type, `type${type}-${i}`));
            }
        }
        // All 100 handles unique
        expect(new Set(handles).size).toBe(100);
        // Access within type works
        for (let type = 0; type < 10; type++) {
            for (let i = 0; i < 10; i++) {
                const h = handles[type * 10 + i]!;
                expect(resources.get(type, h)).toBe(`type${type}-${i}`);
            }
        }
        // Cross-type access fails
        expect(() => resources.get(1, handles[0]!)).toThrow('belongs to type');
        expect(() => resources.get(0, handles[10]!)).toThrow('belongs to type');
    });
});

describeDebugOnly('resource handle cleanup and ref counting', () => {
    test('remove all handles leaves table empty', () => {
        const resources = createResourceTable();
        const handles = [
            resources.add(0, 'a'),
            resources.add(0, 'b'),
            resources.add(0, 'c'),
        ];
        for (const h of handles) resources.remove(0, h);
        for (const h of handles) {
            expect(resources.has(0, h)).toBe(false);
            expect(() => resources.get(0, h)).toThrow('Invalid resource handle');
        }
    });

    test('removed handle cannot be lent', () => {
        const resources = createResourceTable();
        const h = resources.add(0, 'obj');
        resources.remove(0, h);
        expect(() => resources.lend(0, h)).toThrow('Invalid resource handle');
    });

    test('add after remove uses new handle, not old', () => {
        const resources = createResourceTable();
        const h1 = resources.add(0, 'first');
        resources.remove(0, h1);
        const h2 = resources.add(0, 'second');
        expect(h2).toBeGreaterThan(h1);
        expect(resources.get(0, h2)).toBe('second');
        expect(() => resources.get(0, h1)).toThrow('Invalid resource handle');
    });

    test('interleaved add/remove/lend stress test', () => {
        const resources = createResourceTable();
        const handles: number[] = [];
        // Add 5 handles
        for (let i = 0; i < 5; i++) handles.push(resources.add(0, `obj-${i}`));
        // Lend first 3
        for (let i = 0; i < 3; i++) resources.lend(0, handles[i]!);
        // Remove handles 3,4 (no borrows)
        resources.remove(0, handles[3]!);
        resources.remove(0, handles[4]!);
        // Try to remove handle 0 (has borrow) — should trap
        expect(() => resources.remove(0, handles[0]!)).toThrow('outstanding borrow');
        // Unlend, then remove
        resources.unlend(0, handles[0]!);
        expect(resources.remove(0, handles[0]!)).toBe('obj-0');
        // Handles 1,2 still have borrows
        expect(resources.lendCount(0, handles[1]!)).toBe(1);
        expect(resources.lendCount(0, handles[2]!)).toBe(1);
    });

    test('double remove throws', () => {
        const resources = createResourceTable();
        const h = resources.add(0, 'obj');
        resources.remove(0, h);
        expect(() => resources.remove(0, h)).toThrow('Invalid resource handle');
    });

    test('get after remove throws', () => {
        const resources = createResourceTable();
        const h = resources.add(0, 'obj');
        resources.remove(0, h);
        expect(() => resources.get(0, h)).toThrow('Invalid resource handle');
    });

    test('has returns false for removed handle', () => {
        const resources = createResourceTable();
        const h = resources.add(0, 'obj');
        expect(resources.has(0, h)).toBe(true);
        resources.remove(0, h);
        expect(resources.has(0, h)).toBe(false);
    });

    test('1000 handles: bulk add then bulk remove', () => {
        const resources = createResourceTable();
        const handles: number[] = [];
        for (let i = 0; i < 1000; i++) {
            handles.push(resources.add(0, `r${i}`));
        }
        expect(new Set(handles).size).toBe(1000);
        for (let i = 0; i < 1000; i++) {
            expect(resources.remove(0, handles[i]!)).toBe(`r${i}`);
        }
        // All gone
        for (let i = 0; i < 1000; i++) {
            expect(resources.has(0, handles[i]!)).toBe(false);
        }
    });
});

describeDebugOnly('stream<T> lifting and lowering', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMockCtxWithStreams();
    });

    test('JS async iterable lifts to [handle]', () => {
        const streamModel = { tag: ModelTag.ComponentTypeDefinedStream, value: { tag: ModelTag.ComponentValTypePrimitive, value: PrimitiveValType.S32 } };
        const lifter = createLifting(rctx.resolved, streamModel as any);
        const iterable = { [Symbol.asyncIterator]: () => ({}) };
        const result = lifter(bctx, iterable);
        expect(result).toHaveLength(1);
        expect(result[0]).toBeGreaterThan(0);
    });

    test('handle lowers to original async iterable', () => {
        const streamModel = { tag: ModelTag.ComponentTypeDefinedStream, value: { tag: ModelTag.ComponentValTypePrimitive, value: PrimitiveValType.S32 } };
        const lowerer = createLowering(rctx.resolved, streamModel as any);
        const iterable = { [Symbol.asyncIterator]: () => ({}) };
        const handle = (bctx.streams as any).addReadable(0, iterable);
        const result = lowerer(bctx, handle);
        expect(result).toBe(iterable);
    });

    test('spill is 1', () => {
        const streamModel = { tag: ModelTag.ComponentTypeDefinedStream };
        const lowerer = createLowering(rctx.resolved, streamModel as any);
        expect((lowerer as any).spill).toBe(1);
    });
});

describeDebugOnly('future<T> lifting and lowering', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMockCtxWithStreams();
    });

    test('JS promise lifts to [handle]', () => {
        const futureModel = { tag: ModelTag.ComponentTypeDefinedFuture, value: { tag: ModelTag.ComponentValTypePrimitive, value: PrimitiveValType.S32 } };
        const lifter = createLifting(rctx.resolved, futureModel as any);
        const promise = Promise.resolve(42);
        const result = lifter(bctx, promise);
        expect(result).toHaveLength(1);
        expect(result[0]).toBeGreaterThan(0);
    });

    test('handle lowers to original promise', () => {
        const futureModel = { tag: ModelTag.ComponentTypeDefinedFuture, value: { tag: ModelTag.ComponentValTypePrimitive, value: PrimitiveValType.S32 } };
        const lowerer = createLowering(rctx.resolved, futureModel as any);
        const promise = Promise.resolve(42);
        const handle = (bctx.futures as any).addReadable(0, promise);
        const result = lowerer(bctx, handle);
        expect(result).toBe(promise);
    });

    test('spill is 1', () => {
        const futureModel = { tag: ModelTag.ComponentTypeDefinedFuture };
        const lowerer = createLowering(rctx.resolved, futureModel as any);
        expect((lowerer as any).spill).toBe(1);
    });
});

describeDebugOnly('error-context lifting and lowering', () => {
    let rctx: ResolverContext;
    let bctx: BindingContext;

    beforeEach(() => {
        rctx = createMinimalRctx();
        bctx = createMockCtxWithStreams();
    });

    test('JS Error lifts to [handle]', () => {
        const errModel = { tag: ModelTag.ComponentTypeDefinedErrorContext };
        const lifter = createLifting(rctx.resolved, errModel as any);
        const err = new Error('test error');
        const result = lifter(bctx, err);
        expect(result).toHaveLength(1);
        expect(result[0]).toBeGreaterThan(0);
    });

    test('handle lowers to original Error', () => {
        const errModel = { tag: ModelTag.ComponentTypeDefinedErrorContext };
        const lowerer = createLowering(rctx.resolved, errModel as any);
        const err = new Error('test error');
        const handle = (bctx.errorContexts as any).add(err);
        const result = lowerer(bctx, handle);
        expect(result).toBe(err);
    });

    test('spill is 1', () => {
        const errModel = { tag: ModelTag.ComponentTypeDefinedErrorContext };
        const lowerer = createLowering(rctx.resolved, errModel as any);
        expect((lowerer as any).spill).toBe(1);
    });

    test('multiple lifts produce unique handles', () => {
        const errModel = { tag: ModelTag.ComponentTypeDefinedErrorContext };
        const lifter = createLifting(rctx.resolved, errModel as any);
        const [h1] = lifter(bctx, new Error('a'));
        const [h2] = lifter(bctx, new Error('b'));
        expect(h1).not.toBe(h2);
    });
});
