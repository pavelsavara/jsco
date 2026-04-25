// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * Tests for the useNumberForInt64 option through the P2-via-P3 adapter.
 * Mirrors wasip2/use-number-for-int64.test.ts.
 */

import { createComponent } from '../../../src/resolver';
import { createWasiP3Host } from '../../../src/host/wasip3/index';
import { createWasiP2ViaP3Adapter } from '../../../src/host/wasip2-via-wasip3/index';
import { initializeAsserts } from '../../../src/utils/assert';
import { useVerboseOnFailure, verboseOptions, runWithVerbose } from '../../test-utils/verbose-logger';

initializeAsserts();

const echoWasm = './integration-tests/target/wasm32-wasip1/release/echo_reactor.wasm';

function createMinimalEchoImports() {
    const p3 = createWasiP3Host();
    const wasiExports = createWasiP2ViaP3Adapter(p3);
    return {
        ...wasiExports,
        'jsco:test/echo-sink@0.1.0': {
            'report-primitive': () => { /* no-op */ },
            'report-record': () => { /* no-op */ },
        },
    };
}

describe('useNumberForInt64 (via P3 adapter)', () => {
    const verbose = useVerboseOnFailure();

    describe('default (false)', () => {
        test('i64 values returned as bigint', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(echoWasm, {
                noJspi: true,
                ...verboseOptions(verbose),
            });
            const imports = createMinimalEchoImports();
            const instance = await component.instantiate(imports);
            try {
                const ns = instance.exports['jsco:test/echo-primitives@0.1.0'] as Record<string, Function>;

                const s64Result = ns['echo-s64'](42n);
                expect(s64Result).toBe(42n);
                expect(typeof s64Result).toBe('bigint');

                const u64Result = ns['echo-u64'](0n);
                expect(u64Result).toBe(0n);
                expect(typeof u64Result).toBe('bigint');
            } finally {
                instance.dispose();
            }
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
            try {
                const ns = instance.exports['jsco:test/echo-primitives@0.1.0'] as Record<string, Function>;

                const s64Result = ns['echo-s64'](42);
                expect(s64Result).toBe(42);
                expect(typeof s64Result).toBe('number');

                const u64Result = ns['echo-u64'](0);
                expect(u64Result).toBe(0);
                expect(typeof u64Result).toBe('number');
            } finally {
                instance.dispose();
            }
        }));
    });

    describe('useNumberForInt64: per-function string array', () => {
        test('per-function mode falls back to bigint for non-matching exports', () => runWithVerbose(verbose, async () => {
            const component = await createComponent(echoWasm, {
                useNumberForInt64: ['non-existent-export'],
                noJspi: true,
                ...verboseOptions(verbose),
            });
            const imports = createMinimalEchoImports();
            const instance = await component.instantiate(imports);
            try {
                const ns = instance.exports['jsco:test/echo-primitives@0.1.0'] as Record<string, Function>;

                const s64Result = ns['echo-s64'](42n);
                expect(s64Result).toBe(42n);
                expect(typeof s64Result).toBe('bigint');
            } finally {
                instance.dispose();
            }
        }));
    });
});
