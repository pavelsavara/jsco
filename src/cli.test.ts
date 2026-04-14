// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { parseCliArgs } from './cli';

describe('parseCliArgs', () => {
    test('bare .wasm path as last argument', () => {
        const result = parseCliArgs(['component.wasm']);
        expect(result.componentUrl).toBe('component.wasm');
        expect(result.error).toBeUndefined();
        expect(result.options).toEqual({
            useNumberForInt64: false,
            noJspi: false,
            validateTypes: true,
        });
    });

    test('--component= flag', () => {
        const result = parseCliArgs(['--component=/path/to/my.wasm']);
        expect(result.componentUrl).toBe('/path/to/my.wasm');
        expect(result.error).toBeUndefined();
    });

    test('--use-number-for-int64 flag', () => {
        const result = parseCliArgs(['--use-number-for-int64', 'test.wasm']);
        expect(result.options.useNumberForInt64).toBe(true);
        expect(result.componentUrl).toBe('test.wasm');
        expect(result.error).toBeUndefined();
    });

    test('--no-jspi flag', () => {
        const result = parseCliArgs(['--no-jspi', 'test.wasm']);
        expect(result.options.noJspi).toBe(true);
        expect(result.error).toBeUndefined();
    });

    test('--validate-types flag', () => {
        const result = parseCliArgs(['--validate-types', 'test.wasm']);
        expect(result.options.validateTypes).toBe(true);
        expect(result.error).toBeUndefined();
    });

    test('all flags combined', () => {
        const result = parseCliArgs(['--use-number-for-int64', '--no-jspi', '--validate-types', '--component=app.wasm']);
        expect(result.options).toEqual({
            useNumberForInt64: true,
            noJspi: true,
            validateTypes: true,
        });
        expect(result.componentUrl).toBe('app.wasm');
        expect(result.error).toBeUndefined();
    });

    test('unknown argument returns error', () => {
        const result = parseCliArgs(['--unknown', 'test.wasm']);
        expect(result.error).toBe('Unknown argument: --unknown');
    });

    test('no arguments returns usage error', () => {
        const result = parseCliArgs([]);
        expect(result.error).toContain('usage:');
        expect(result.componentUrl).toBeUndefined();
    });

    test('.wasm only recognized as last argument', () => {
        const result = parseCliArgs(['foo.wasm', 'bar.wasm']);
        expect(result.error).toBe('Unknown argument: foo.wasm');
    });

    test('empty strings are skipped', () => {
        const result = parseCliArgs(['', '', 'test.wasm']);
        expect(result.componentUrl).toBe('test.wasm');
        expect(result.error).toBeUndefined();
    });

    test('--component= with empty value', () => {
        const result = parseCliArgs(['--component=']);
        expect(result.componentUrl).toBe('');
        // empty string is falsy, so usage error is returned
        expect(result.error).toContain('usage:');
    });
});
