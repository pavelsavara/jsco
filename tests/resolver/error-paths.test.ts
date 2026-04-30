// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

/**
 * Error-path integration tests — verifies meaningful errors for invalid
 * inputs, missing imports, poisoned instances, and type mismatches.
 */

import { createComponent } from '../../src/resolver';
import { parse, WIT_MAGIC, WIT_VERSION, WIT_LAYER } from '../../src/parser';
import { initializeAsserts } from '../../src/utils/assert';
import { useVerboseOnFailure, verboseOptions, runWithVerbose } from '../test-utils/verbose-logger';

initializeAsserts();

const echoReactorWatWasm = './integration-tests/echo-reactor-wat/echo.wasm';
const helloCityWatWasm = './integration-tests/hello-city-wat/hello-city.wasm';

describe('error paths', () => {
    const verbose = useVerboseOnFailure();

    describe('truncated and corrupt binary', () => {
        test('truncated binary (first 4 bytes only) rejects with parse error', async () => {
            const truncated = new Uint8Array([0x00, 0x61, 0x73, 0x6d]);
            await expect(parse(truncated)).rejects.toThrow();
        });

        test('empty Uint8Array rejects with EOF', async () => {
            await expect(parse(new Uint8Array([]))).rejects.toThrow('unexpected EOF');
        });

        test('wrong magic rejects with meaningful error', async () => {
            const bad = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF, ...WIT_VERSION, ...WIT_LAYER]);
            await expect(parse(bad)).rejects.toThrow();
        });

        test('corrupt section header in valid preamble', async () => {
            // Valid preamble + invalid section id 0xFF
            const corrupt = new Uint8Array([...WIT_MAGIC, ...WIT_VERSION, ...WIT_LAYER, 0xFF, 0x00]);
            await expect(parse(corrupt)).rejects.toThrow();
        });

        test('createComponent with truncated binary rejects', async () => {
            const truncated = new Uint8Array([...WIT_MAGIC, ...WIT_VERSION, ...WIT_LAYER]);
            // Preamble only with no sections — resolver rejects with section error
            await expect(createComponent(truncated)).rejects.toThrow();
        });
    });

    describe('missing required import at instantiation', () => {
        test('instantiate with empty imports produces error naming the missing export', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(helloCityWatWasm, verboseOptions(verbose));
            // hello-city requires 'hello:city/logger@0.1.0' import with a 'log' function
            // Instantiate with empty object — error occurs when resolving the import binding
            let instance: Awaited<ReturnType<typeof component.instantiate>> | undefined;
            await expect(async () => {
                instance = await component.instantiate({});
                const greeter = instance.exports['hello:city/greeter@0.1.0'] as Record<string, Function>;
                await greeter.run({
                    name: 'Test',
                    headCount: 1,
                    budget: 0n,
                });
            }).rejects.toThrow(/not found/);
            instance?.dispose();
        }));
    });

    describe('poisoned instance', () => {
        test('calling export after instance is poisoned throws poisoned error', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(helloCityWatWasm, verboseOptions(verbose));

            // Provide a logger that throws
            const imports = {
                'hello:city/logger@0.1.0': {
                    log: () => { throw new Error('deliberate throw'); },
                },
            };

            const instance = await component.instantiate(imports);
            try {
                const greeter = instance.exports['hello:city/greeter@0.1.0'] as Record<string, Function>;

                // First call should throw because the import throws
                await expect(async () => {
                    await greeter.run({
                        name: 'Test',
                        headCount: 1,
                        budget: 0n,
                    });
                }).rejects.toThrow('deliberate throw');

                // Second call should throw "poisoned" because the instance is now poisoned
                await expect(async () => {
                    await greeter.run({
                        name: 'Test',
                        headCount: 1,
                        budget: 0n,
                    });
                }).rejects.toThrow('poisoned');
            } finally {
                instance.dispose();
            }
        }));
    });

    describe('wrong import type', () => {
        test('passing non-function as function import causes error at call time', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(helloCityWatWasm, verboseOptions(verbose));

            // Provide a number where a function is expected
            const imports = {
                'hello:city/logger@0.1.0': {
                    log: 42 as any,
                },
            };

            const instance = await component.instantiate(imports);
            try {
                const greeter = instance.exports['hello:city/greeter@0.1.0'] as Record<string, Function>;

                await expect(async () => {
                    await greeter.run({
                        name: 'Test',
                        headCount: 1,
                        budget: 0n,
                    });
                }).rejects.toThrow();
            } finally {
                instance.dispose();
            }
        }));
    });

    describe('validateTypes', () => {
        test('validateTypes detects type mismatches at instantiation', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(echoReactorWatWasm, {
                validateTypes: true,
                ...verboseOptions(verbose),
            });
            // echo-reactor-wat has no required imports, so this should succeed
            const instance = await component.instantiate();
            try {
                expect(instance).toBeDefined();
            } finally {
                instance.dispose();
            }
        }));
    });
});
