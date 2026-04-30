// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { initializeAsserts, jsco_assert, setLogger, jsco_log, LogLevel, defaultVerbosity, debugStack, withDebugTrace, registerInitDebugNames } from '../../src/utils/assert';
import { describeDebugOnly } from '../test-utils/debug-only';

describe('assert.ts', () => {
    beforeEach(() => {
        initializeAsserts();
    });

    describe('jsco_assert', () => {
        test('passes on truthy condition', () => {
            expect(() => jsco_assert(true, 'should not throw')).not.toThrow();
        });

        test('passes on truthy non-boolean', () => {
            expect(() => jsco_assert(1, 'should not throw')).not.toThrow();
            expect(() => jsco_assert('x', 'should not throw')).not.toThrow();
        });

        test('throws on false with string message', () => {
            expect(() => jsco_assert(false, 'test message')).toThrow('Assert failed: test message');
        });

        test('throws on false with factory function', () => {
            expect(() => jsco_assert(false, () => 'computed message')).toThrow('Assert failed: computed message');
        });

        test('throws on null/undefined', () => {
            expect(() => jsco_assert(null, 'null')).toThrow('Assert failed: null');
            expect(() => jsco_assert(undefined, 'undef')).toThrow('Assert failed: undef');
        });
    });

    describe('setLogger / jsco_log', () => {
        test('default logger does not throw', () => {
            setLogger(() => { /* suppress console output in tests */ });
            expect(() => jsco_log('test', LogLevel.Summary, 'msg')).not.toThrow();
        });

        test('custom logger receives calls', () => {
            const calls: unknown[][] = [];
            setLogger((...args) => calls.push(args));
            jsco_log('parser', LogLevel.Summary, 'hello', 42);
            expect(calls).toHaveLength(1);
            expect(calls[0]).toEqual(['parser', LogLevel.Summary, 'hello', 42]);
        });
    });

    describe('defaultVerbosity', () => {
        test('all phases are Off', () => {
            expect(defaultVerbosity.parser).toBe(LogLevel.Off);
            expect(defaultVerbosity.resolver).toBe(LogLevel.Off);
            expect(defaultVerbosity.binder).toBe(LogLevel.Off);
            expect(defaultVerbosity.executor).toBe(LogLevel.Off);
        });
    });

    describeDebugOnly('debugStack', () => {
        test('populates debugStack on target from src', () => {
            const src = { debugStack: ['a', 'b'] };
            const target: any = {};
            debugStack(src, target, 'pos1');
            expect(target.debugStack).toEqual(['pos1', 'a', 'b']);
        });

        test('handles missing debugStack on src', () => {
            const src = {};
            const target: any = {};
            debugStack(src, target, 'pos1');
            expect(target.debugStack).toEqual(['pos1']);
        });
    });

    describeDebugOnly('withDebugTrace', () => {
        test('wraps binder to add label to debugStack', async () => {
            const calls: any[] = [];
            const binder = async (_mctx: any, bargs: any) => {
                calls.push(bargs);
                return 'result';
            };
            const traced = withDebugTrace(binder, 'myLabel');
            const result = await (traced as any)({}, { foo: 1, debugStack: ['prev'] });
            expect(result).toBe('result');
            expect(calls[0].debugStack).toEqual(['myLabel', 'prev']);
        });

        test('handles missing debugStack on bargs', async () => {
            const binder = async (_mctx: any, bargs: any) => bargs.debugStack;
            const traced = withDebugTrace(binder, 'label');
            const debugStack = await (traced as any)({}, { foo: 1 });
            expect(debugStack).toEqual(['label']);
        });
    });

    describeDebugOnly('registerInitDebugNames / initializeAsserts', () => {
        test('calls registered init function', () => {
            let called = false;
            registerInitDebugNames(() => { called = true; });
            initializeAsserts();
            expect(called).toBe(true);
        });
    });
});
