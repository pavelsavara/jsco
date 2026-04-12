import { initializeAsserts } from './assert';
initializeAsserts();

import { modelTagName, primitiveValTypeName, callingConventionName, planOpKindName } from './debug-names';

// When debug names have been initialized (isDebug=true in test env), the name functions
// should return human-readable strings. We also test that unknown/out-of-range values
// fall back to the numeric format.

describe('debug-names.ts', () => {
    describe('modelTagName', () => {
        test('returns name for known tag', () => {
            // ModelTag.Model = 0 (first enum member)
            const name = modelTagName(0 as any);
            expect(name).toBe('Model');
        });

        test('returns fallback for unknown tag', () => {
            const name = modelTagName(9999 as any);
            expect(name).toBe('ModelTag(9999)');
        });
    });

    describe('primitiveValTypeName', () => {
        test('returns name for known type', () => {
            // PrimitiveValType.Bool = 0
            expect(primitiveValTypeName(0 as any)).toBe('Bool');
        });

        test('returns fallback for unknown type', () => {
            expect(primitiveValTypeName(9999 as any)).toBe('PrimitiveValType(9999)');
        });
    });

    describe('callingConventionName', () => {
        test('returns name for known convention', () => {
            // CallingConvention.Scalar = 0
            expect(callingConventionName(0 as any)).toBe('Scalar');
        });

        test('returns fallback for unknown value', () => {
            expect(callingConventionName(9999 as any)).toBe('CallingConvention(9999)');
        });
    });

    describe('planOpKindName', () => {
        test('returns name for known kind', () => {
            // PlanOpKind.CoreInstantiate = 0
            expect(planOpKindName(0 as any)).toBe('CoreInstantiate');
        });

        test('returns fallback for unknown value', () => {
            expect(planOpKindName(9999 as any)).toBe('PlanOpKind(9999)');
        });
    });
});
