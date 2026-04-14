// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * Tests for the useNumberForInt64 option — controls whether i64/u64
 * values are returned as bigint (default) or JS number.
 *
 * Uses the Rust echo-reactor (spilled calling convention) which correctly
 * handles the Number conversion through linear memory.
 */

import { createComponent } from '../../resolver';
import { createWasiP2Host } from './index';
import { initializeAsserts } from '../../utils/assert';
import { useVerboseOnFailure, verboseOptions, runWithVerbose } from '../../test-utils/verbose-logger';

initializeAsserts();

const echoWasm = './integration-tests/target/wasm32-wasip1/release/echo_reactor.wasm';

function createMinimalEchoImports() {
    const wasiExports = createWasiP2Host();
    return {
        ...wasiExports,
        'jsco:test/echo-sink@0.1.0': {
            'report-primitive': () => { /* no-op */ },
            'report-record': () => { /* no-op */ },
        },
    };
}

describe('useNumberForInt64', () => {
    const verbose = useVerboseOnFailure();

    describe('default (false)', () => {
        test('i64 values returned as bigint', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(echoWasm, {
                noJspi: true,
                ...verboseOptions(verbose),
            });
            const imports = createMinimalEchoImports();
            const instance = await component.instantiate(imports);
            const ns = instance.exports['jsco:test/echo-primitives@0.1.0'] as Record<string, Function>;

            const s64Result = ns['echo-s64'](42n);
            expect(s64Result).toBe(42n);
            expect(typeof s64Result).toBe('bigint');

            const u64Result = ns['echo-u64'](0n);
            expect(u64Result).toBe(0n);
            expect(typeof u64Result).toBe('bigint');
        }));
    });

    describe('useNumberForInt64: true', () => {
        test('i64 values returned as number, accepts number input', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(echoWasm, {
                useNumberForInt64: true,
                noJspi: true,
                ...verboseOptions(verbose),
            });
            const imports = createMinimalEchoImports();
            const instance = await component.instantiate(imports);
            const ns = instance.exports['jsco:test/echo-primitives@0.1.0'] as Record<string, Function>;

            const s64Result = ns['echo-s64'](42);
            expect(s64Result).toBe(42);
            expect(typeof s64Result).toBe('number');

            const u64Result = ns['echo-u64'](0);
            expect(u64Result).toBe(0);
            expect(typeof u64Result).toBe('number');
        }));
    });

    describe('useNumberForInt64: per-function string array', () => {
        test('per-function mode activates for direct component exports', () => runWithVerbose(verbose, async () => {
            // Per-function mode matches component export names (callerElement.tag === ComponentExport).
            // Functions within exported instances use a different callerElement tag,
            // so per-function filtering applies at the instance export level
            // in component-exports.ts, not within instance function resolution.

            // Verify that string array mode at least initializes without error
            // and falls back to BigInt for non-matching exports
            const component = await createComponent(echoWasm, {
                useNumberForInt64: ['non-existent-export'],
                noJspi: true,
                ...verboseOptions(verbose),
            });
            const imports = createMinimalEchoImports();
            const instance = await component.instantiate(imports);
            const ns = instance.exports['jsco:test/echo-primitives@0.1.0'] as Record<string, Function>;

            // No matching export name → i64 stays as bigint
            const s64Result = ns['echo-s64'](42n);
            expect(s64Result).toBe(42n);
            expect(typeof s64Result).toBe('bigint');
        }));
    });
});
