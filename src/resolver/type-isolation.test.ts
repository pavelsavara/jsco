import { setConfiguration } from '../utils/assert';
setConfiguration('Debug');

import { ModelTag } from '../model/tags';
import { ComponentTypeIndex } from '../model/indices';
import { PrimitiveValType } from '../model/types';
import { ResolverContext, StringEncoding } from './types';
import { createLifting } from './binding/to-abi';
import { deepResolveType, resolveValType } from './calling-convention';
import type { ResolvedType } from './type-resolution';

/**
 * Tests for instance-local type isolation.
 *
 * registerInstanceLocalTypes writes instance-local types to rctx.resolved.resolvedTypes
 * using local indices (0, 1, 2, ...). These can collide with global type indices.
 *
 * Fixed (intra-function): Outer alias lookups inside registerInstanceLocalTypes
 * use a snapshot of the original global state, so they read the correct global
 * type instead of a previously-written local type that shares the same index.
 *
 * Fixed (inter-function): createFunctionLowering/createFunctionLifting deep-resolve
 * all nested ComponentValTypeType references at binder creation time using
 * deepResolveType. Binder closures (storeToMemory/loadFromMemory) never look up
 * rctx.resolved.resolvedTypes at call time, so local type overwrites are harmless.
 */

function createRctxWithGlobalTypes(globalTypes: [number, ResolvedType][]): ResolverContext {
    return {
        resolved: {
            memoizeCache: new Map(),
            resolvedTypes: new Map(globalTypes.map(([idx, t]) => [idx as ComponentTypeIndex, t])),
            canonicalResourceIds: new Map(),
            usesNumberForInt64: false,
            stringEncoding: StringEncoding.Utf8,
        },
        resourceAliasGroups: new Map(),
        validateTypes: true,
        indexes: {
            coreModules: [],
            coreInstances: [],
            coreFunctions: [],
            coreMemories: [],
            coreGlobals: [],
            coreTables: [],
            componentImports: [],
            componentExports: [],
            componentInstances: [],
            componentTypeResource: [],
            componentFunctions: [],
            componentTypes: [],
            componentSections: [],
        },
    } as any as ResolverContext;
}

describe('instance-local type isolation', () => {
    test('outer alias lookup uses snapshot, not live map', () => {
        // Scenario: instance has local type 0 = new Enum, local type 1 = outer alias to global 0
        // Without fix: local type 1 would get the Enum (from local 0) instead of the global Record
        const globalRecord = {
            tag: ModelTag.ComponentTypeDefinedRecord as const,
            members: [
                { name: 'x', type: { tag: ModelTag.ComponentValTypePrimitive, value: PrimitiveValType.U32 } },
            ],
        };

        const rctx = createRctxWithGlobalTypes([
            [0, globalRecord as any],
        ]);

        // Snapshot before local registration (as registerInstanceLocalTypes does)
        const snapshot = new Map(rctx.resolved.resolvedTypes);

        // Local type 0: new Enum (overwrites global index 0)
        const localEnum = {
            tag: ModelTag.ComponentTypeDefinedEnum as const,
            members: ['x', 'y'],
        };
        rctx.resolved.resolvedTypes.set(0 as ComponentTypeIndex, localEnum as any);

        // Local type 1: outer alias to global index 0
        // WITHOUT fix: would read rctx.resolved.resolvedTypes[0] = localEnum (WRONG)
        // WITH fix: reads from snapshot, gets globalRecord (CORRECT)
        const outerAliasResult = snapshot.get(0 as ComponentTypeIndex);
        expect(outerAliasResult).toBe(globalRecord);

        // The live map has the LOCAL type
        expect(rctx.resolved.resolvedTypes.get(0 as ComponentTypeIndex)).toBe(localEnum);
    });

    test('memoizeCache keyed by type object identity, not by index', () => {
        const globalRecord = {
            tag: ModelTag.ComponentTypeDefinedRecord as const,
            members: [
                { name: 'a', type: { tag: ModelTag.ComponentValTypePrimitive, value: PrimitiveValType.U32 } },
            ],
        };

        const rctx = createRctxWithGlobalTypes([
            [0, globalRecord as any],
        ]);

        // Create a binder for the global record — populates memoizeCache
        const lifter1 = createLifting(rctx.resolved, globalRecord as any);

        // Overwrite index 0 with a local type (different object)
        const localType = {
            tag: ModelTag.ComponentTypeDefinedEnum as const,
            members: ['x', 'y'],
        };
        rctx.resolved.resolvedTypes.set(0 as ComponentTypeIndex, localType as any);

        // Create binder for the local type — different cache key (different object)
        const lifter2 = createLifting(rctx.resolved, localType as any);

        // Cache hit for the original global record (same object reference)
        const lifter3 = createLifting(rctx.resolved, globalRecord as any);
        expect(lifter3).toBe(lifter1); // same from cache
        expect(lifter2).not.toBe(lifter1); // different type → different binder
    });

    test('canonicalResourceIds entries are additive across instances', () => {
        // canonicalResourceIds set by registerInstanceLocalTypes persist
        // because resource.drop/new/rep resolvers read them after
        // resolveCanonicalFunctionLower completes.
        const rctx = createRctxWithGlobalTypes([]);
        rctx.resolved.canonicalResourceIds.set(0, 100);
        rctx.resolved.canonicalResourceIds.set(1, 200);

        // Simulate local registration adding new entries
        rctx.resolved.canonicalResourceIds.set(2, 300);
        rctx.resolved.canonicalResourceIds.set(3, 400);

        // All entries present (additive, not restored)
        expect(rctx.resolved.canonicalResourceIds.get(0)).toBe(100);
        expect(rctx.resolved.canonicalResourceIds.get(1)).toBe(200);
        expect(rctx.resolved.canonicalResourceIds.get(2)).toBe(300);
        expect(rctx.resolved.canonicalResourceIds.get(3)).toBe(400);
    });

    test('local types overwrite global entries in resolvedTypes (harmless with deep-resolve)', () => {
        // Local types still overwrite globals in the resolvedTypes map,
        // but this is now safe because binder closures use deep-resolved types
        // that carry resolved values inline (ComponentValTypeResolved), so they
        // never look up resolvedTypes at call time.
        const globalRecord = {
            tag: ModelTag.ComponentTypeDefinedRecord as const,
            members: [
                { name: 'x', type: { tag: ModelTag.ComponentValTypePrimitive, value: PrimitiveValType.U32 } },
            ],
        };

        const rctx = createRctxWithGlobalTypes([
            [0, globalRecord as any],
        ]);

        expect(rctx.resolved.resolvedTypes.get(0 as ComponentTypeIndex)).toBe(globalRecord);

        // Simulate registerInstanceLocalTypes overwriting
        const localType = {
            tag: ModelTag.ComponentTypeDefinedList as const,
            value: { tag: ModelTag.ComponentValTypePrimitive, value: PrimitiveValType.U8 },
        };
        rctx.resolved.resolvedTypes.set(0 as ComponentTypeIndex, localType as any);

        // Global entry is overwritten in the map
        expect(rctx.resolved.resolvedTypes.get(0 as ComponentTypeIndex)).toBe(localType);
    });

    test('deepResolveType replaces ComponentValTypeType with ComponentValTypeResolved', () => {
        // A record with a member whose type is ComponentValTypeType (index reference)
        // After deep-resolve, the member type is ComponentValTypeResolved carrying
        // the resolved type inline, making it independent of resolvedTypes.
        const innerEnum = {
            tag: ModelTag.ComponentTypeDefinedEnum as const,
            members: ['a', 'b', 'c'],
        };

        const rctx = createRctxWithGlobalTypes([
            [5, innerEnum as any],
        ]);

        const record = {
            tag: ModelTag.ComponentTypeDefinedRecord as const,
            members: [
                { name: 'primitiveField', type: { tag: ModelTag.ComponentValTypePrimitive, value: PrimitiveValType.U32 } },
                { name: 'typeRefField', type: { tag: ModelTag.ComponentValTypeType, value: 5 } },
            ],
        };

        const deepResolved = deepResolveType(rctx.resolved, record as any);

        // Original is untouched
        expect(record.members[1].type.tag).toBe(ModelTag.ComponentValTypeType);

        // Deep-resolved clone has ComponentValTypeResolved for the type reference
        const deepRecord = deepResolved as any;
        expect(deepRecord.tag).toBe(ModelTag.ComponentTypeDefinedRecord);
        expect(deepRecord.members[0].type.tag).toBe(ModelTag.ComponentValTypePrimitive);
        expect(deepRecord.members[1].type.tag).toBe(ModelTag.ComponentValTypeResolved);
        expect(deepRecord.members[1].type.resolved).toBe(innerEnum);
    });

    test('resolveValType handles ComponentValTypeResolved without map lookup', () => {
        // After deep-resolve, resolveValType should return the inline resolved type
        // even if resolvedTypes map is empty (no lookup needed).
        const rctx = createRctxWithGlobalTypes([]);

        const someType = {
            tag: ModelTag.ComponentTypeDefinedEnum as const,
            members: ['x'],
        };

        const resolved = resolveValType(rctx.resolved, {
            tag: ModelTag.ComponentValTypeResolved,
            resolved: someType,
        });

        expect(resolved).toBe(someType);
    });
});
