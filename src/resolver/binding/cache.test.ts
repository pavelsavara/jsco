import { initializeAsserts } from '../../utils/assert';
initializeAsserts();

import { memoize } from './cache';
import { LogLevel } from '../../utils/assert';
import { ModelTag } from '../../model/tags';
import { describeDebugOnly } from '../../test-utils/debug-only';

function mockFn<T extends (...args: any[]) => any>(impl: T): T & { calls: any[][] } {
    const calls: any[][] = [];
    const fn = ((...args: any[]) => {
        calls.push(args);
        return impl(...args);
    }) as T & { calls: any[][] };
    fn.calls = calls;
    return fn;
}

describe('memoize', () => {
    test('calls factory on miss', () => {
        const cache = new Map();
        const factory = mockFn(() => 42);
        const result = memoize(cache, 'key1', factory);
        expect(result).toBe(42);
        expect(factory.calls.length).toBe(1);
        expect(cache.get('key1')).toBe(42);
    });

    test('returns cached value on hit', () => {
        const cache = new Map();
        cache.set('key1', 99);
        const factory = mockFn(() => 42);
        const result = memoize(cache, 'key1', factory);
        expect(result).toBe(99);
        expect(factory.calls.length).toBe(0);
    });

    describeDebugOnly('verbose logging', () => {
        test('logs cache HIT when verbose binder >= Detailed', () => {
            const cache = new Map();
            cache.set('key1', 99);
            const logger = mockFn((() => {}) as any);
            const verbose = {
                parser: LogLevel.Off,
                resolver: LogLevel.Off,
                binder: LogLevel.Detailed,
                executor: LogLevel.Off,
            };
            memoize(cache, 'key1', () => 42, verbose, logger);
            expect(logger.calls.length).toBeGreaterThan(0);
            expect(logger.calls[0][2]).toContain('HIT');
        });

        test('logs cache MISS when verbose binder >= Detailed', () => {
            const cache = new Map();
            const logger = mockFn((() => {}) as any);
            const verbose = {
                parser: LogLevel.Off,
                resolver: LogLevel.Off,
                binder: LogLevel.Detailed,
                executor: LogLevel.Off,
            };
            memoize(cache, 'key1', () => 42, verbose, logger);
            expect(logger.calls.length).toBeGreaterThan(0);
            expect(logger.calls[0][2]).toContain('MISS');
        });

        test('describeKey formats tagged objects with selfSortIndex', () => {
            const cache = new Map();
            const logger = mockFn((() => {}) as any);
            const verbose = {
                parser: LogLevel.Off,
                resolver: LogLevel.Off,
                binder: LogLevel.Detailed,
                executor: LogLevel.Off,
            };
            const key = { tag: ModelTag.ComponentTypeFunc, selfSortIndex: 3 };
            memoize(cache, key, () => 'val', verbose, logger);
            expect(logger.calls[0][2]).toMatch(/MISS.*\[3\]/);
        });

        test('describeKey formats tagged objects without selfSortIndex', () => {
            const cache = new Map();
            const logger = mockFn((() => {}) as any);
            const verbose = {
                parser: LogLevel.Off,
                resolver: LogLevel.Off,
                binder: LogLevel.Detailed,
                executor: LogLevel.Off,
            };
            const key = { tag: ModelTag.ComponentTypeFunc };
            memoize(cache, key, () => 'val', verbose, logger);
            expect(logger.calls[0][2]).toContain('MISS');
        });

        test('no logging when verbose is undefined', () => {
            const cache = new Map();
            const logger = mockFn((() => {}) as any);
            memoize(cache, 'key1', () => 42, undefined, logger);
            expect(logger.calls.length).toBe(0);
        });
    });
});
