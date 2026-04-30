// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { initializeAsserts } from '../../src/utils/assert';
initializeAsserts();

import { modelTagName, primitiveValTypeName, callingConventionName, planOpKindName } from '../../src/utils/debug-names';
import { describeDebugOnly } from '../test-utils/debug-only';

describe('debug-names.ts', () => {
    describeDebugOnly('modelTagName (debug)', () => {
        test('returns name for known tag', () => {
            const name = modelTagName(0 as any);
            expect(name).toBe('Model');
        });
    });

    describe('modelTagName', () => {
        test('returns fallback for unknown tag', () => {
            const name = modelTagName(9999 as any);
            expect(name).toMatch(/ModelTag\(9999\)/);
        });
    });

    describeDebugOnly('primitiveValTypeName (debug)', () => {
        test('returns name for known type', () => {
            expect(primitiveValTypeName(0 as any)).toBe('Bool');
        });
    });

    describe('primitiveValTypeName', () => {
        test('returns fallback for unknown type', () => {
            expect(primitiveValTypeName(9999 as any)).toMatch(/PrimitiveValType\(9999\)/);
        });
    });

    describeDebugOnly('callingConventionName (debug)', () => {
        test('returns name for known convention', () => {
            expect(callingConventionName(0 as any)).toBe('Scalar');
        });
    });

    describe('callingConventionName', () => {
        test('returns fallback for unknown value', () => {
            expect(callingConventionName(9999 as any)).toMatch(/CallingConvention\(9999\)/);
        });
    });

    describeDebugOnly('planOpKindName (debug)', () => {
        test('returns name for known kind', () => {
            expect(planOpKindName(0 as any)).toBe('CoreInstantiate');
        });
    });

    describe('planOpKindName', () => {
        test('returns fallback for unknown value', () => {
            expect(planOpKindName(9999 as any)).toMatch(/PlanOpKind\(9999\)/);
        });
    });
});
