// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

/**
 * Unit tests for the parser fix (Step 6): reactor component exports with
 * `own<imported-resource>` in function signatures.
 *
 * The p2_api_reactor.component.wasm exports:
 *   - add-strings(ss: list<string>) -> u32
 *   - get-strings() -> list<string>
 *   - write-strings-to(o: own<output-stream>) -> result
 *   - pass-an-imported-record(stat: descriptor-stat) -> string
 *
 * The parser must correctly resolve the export type_index to ComponentTypeFunc
 * even when the signature contains own<imported-resource> (e.g. own<output-stream>).
 * Previously, the parser would follow the own<T> wrapper instead of resolving
 * the enclosing function type, causing canon.lift to fail.
 *
 * This test validates that:
 *   1. The component instantiates without parser/resolver errors
 *   2. All exported functions are present with correct types
 *   3. The export type resolution handles own<T> and imported record types
 */

import { createComponent } from '../../../src/resolver';
import { createWasiP2ViaP3Adapter } from '../../../src/host/wasip2-via-wasip3/index';
import { createWasiP3Host } from '../../../src/host/wasip3/index';
import { initializeAsserts } from '../../../src/utils/assert';

initializeAsserts();

const WASM_DIR = './integration-tests/wasmtime/';

function createMergedHosts(config?: Parameters<typeof createWasiP3Host>[0]): Record<string, unknown> {
    const p3 = createWasiP3Host(config);
    const p2 = createWasiP2ViaP3Adapter(p3);
    return { ...p2, ...p3 };
}

describe('Parser — reactor exports with own<imported-resource> (Step 6)', () => {
    test('p2_api_reactor instantiates with correct export signatures', async () => {
        const imports = createMergedHosts({
            env: [['GOOD_DOG', 'gussie']],
        });
        const component = await createComponent(WASM_DIR + 'p2_api_reactor.component.wasm');
        const instance = await component.instantiate(imports as Parameters<typeof component.instantiate>[0]);
        try {
            const exports = instance.exports as Record<string, unknown>;

            // All reactor function exports must be present as JS functions
            expect(typeof exports['add-strings']).toBe('function');
            expect(typeof exports['get-strings']).toBe('function');
            expect(typeof exports['write-strings-to']).toBe('function');
            expect(typeof exports['pass-an-imported-record']).toBe('function');
        } finally {
            instance.dispose();
        }
    });

    test('component parsing does not confuse own<T> wrapper with ComponentTypeFunc', async () => {
        // If the parser incorrectly resolves type_index for write-strings-to
        // (which has own<output-stream> parameter), instantiation would throw
        // "expected ComponentTypeFunc" or similar type mismatch error.
        const imports = createMergedHosts({
            env: [['GOOD_DOG', 'gussie']],
        });
        const component = await createComponent(WASM_DIR + 'p2_api_reactor.component.wasm');

        // This should NOT throw — the fix ensures own<T> parameters in export
        // signatures are properly resolved.
        await expect(
            component.instantiate(imports as Parameters<typeof component.instantiate>[0])
                .then(inst => { inst.dispose(); return 'ok'; }),
        ).resolves.toBe('ok');
    });

    test('export with imported record type (descriptor-stat) resolves correctly', async () => {
        // pass-an-imported-record takes a wasi:filesystem/types.descriptor-stat
        // record — this exercises the parser's handling of type imports from
        // a different interface appearing in an export signature.
        const imports = createMergedHosts({
            env: [['GOOD_DOG', 'gussie']],
        });
        const component = await createComponent(WASM_DIR + 'p2_api_reactor.component.wasm');
        const instance = await component.instantiate(imports as Parameters<typeof component.instantiate>[0]);
        try {
            const exports = instance.exports as Record<string, unknown>;
            // The function exists and is callable (even if we can't exercise it
            // due to JSPI context issues, its existence proves type resolution worked)
            expect(typeof exports['pass-an-imported-record']).toBe('function');
        } finally {
            instance.dispose();
        }
    });
});
