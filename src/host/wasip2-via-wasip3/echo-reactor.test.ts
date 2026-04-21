// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * Echo-reactor integration test through the P2-via-P3 adapter.
 * Mirrors wasip2/echo-reactor.test.ts — same WASM binary, same type round-trip assertions,
 * but uses createWasiP3Host → createWasiP2ViaP3Adapter instead of createWasiP2Host.
 *
 * Covers a representative subset of primitives, compound types, algebraic types,
 * and resources to verify the adapter doesn't corrupt type round-trips.
 */

import { createComponent } from '../../resolver';
import { initializeAsserts } from '../../utils/assert';
import { useVerboseOnFailure, verboseOptions, runWithVerbose } from '../../test-utils/verbose-logger';
import { createWasiP3Host } from '../wasip3/index';
import { createWasiP2ViaP3Adapter } from './index';

initializeAsserts();

const echoWasm = './integration-tests/target/wasm32-wasip1/release/echo_reactor.wasm';
const echoOptions = (verbose: ReturnType<typeof useVerboseOnFailure>) => ({ noJspi: true as const, ...verboseOptions(verbose) });

interface SinkReport {
    label: string;
    value: string;
}

interface RecordReport {
    label: string;
    x: number;
    y: number;
}

function createEchoImports() {
    const primitiveReports: SinkReport[] = [];
    const recordReports: RecordReport[] = [];

    const p3 = createWasiP3Host();
    const wasiExports = createWasiP2ViaP3Adapter(p3);

    return {
        imports: {
            ...wasiExports,
            'jsco:test/echo-sink@0.1.0': {
                'report-primitive': (label: string, value: string) => {
                    primitiveReports.push({ label, value });
                },
                'report-record': (label: string, x: number, y: number) => {
                    recordReports.push({ label, x, y });
                },
            },
        },
        primitiveReports,
        recordReports,
    };
}

describe('echo-reactor (via P3 adapter)', () => {
    const verbose = useVerboseOnFailure();

    describe('primitives', () => {
        test('echo-bool round-trips true and false', () => runWithVerbose(verbose, async () => {
            const { imports, primitiveReports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-bool'](true)).toBe(true);
            expect(ns['echo-bool'](false)).toBe(false);
            expect(primitiveReports).toContainEqual({ label: 'bool', value: 'true' });
            expect(primitiveReports).toContainEqual({ label: 'bool', value: 'false' });
        }));

        test('echo-u8 round-trips boundary values', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-u8'](0)).toBe(0);
            expect(ns['echo-u8'](255)).toBe(255);
            expect(ns['echo-u8'](42)).toBe(42);
        }));

        test('echo-u32 round-trips', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-u32'](0)).toBe(0);
            expect(ns['echo-u32'](0xFFFFFFFF)).toBe(0xFFFFFFFF);
        }));

        test('echo-u64 round-trips as bigint', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-u64'](0n)).toBe(0n);
            expect(ns['echo-u64'](BigInt('18446744073709551615'))).toBe(BigInt('18446744073709551615'));
        }));

        test('echo-s64 round-trips as bigint', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-s64'](BigInt('-9223372036854775808'))).toBe(BigInt('-9223372036854775808'));
            expect(ns['echo-s64'](BigInt('9223372036854775807'))).toBe(BigInt('9223372036854775807'));
        }));

        test('echo-f64 round-trips', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-f64'](0)).toBe(0);
            expect(ns['echo-f64'](3.141592653589793)).toBe(3.141592653589793);
        }));

        test('echo-char round-trips', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-char']('A')).toBe('A');
            expect(ns['echo-char']('🌍')).toBe('🌍');
        }));

        test('echo-string round-trips', () => runWithVerbose(verbose, async () => {
            const { imports, primitiveReports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-string']('')).toBe('');
            expect(ns['echo-string']('hello world')).toBe('hello world');
            expect(ns['echo-string']('unicode: àáâãäå 日本語 🎉')).toBe('unicode: àáâãäå 日本語 🎉');
            expect(primitiveReports).toContainEqual({ label: 'string', value: 'hello world' });
        }));
    });

    describe('compound types', () => {
        test('echo-tuple2 round-trips', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-compound@0.1.0']) as any;

            const result = ns['echo-tuple2']([42, 'hello']);
            expect(result).toEqual([42, 'hello']);
        }));

        test('echo-record round-trips point', () => runWithVerbose(verbose, async () => {
            const { imports, recordReports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-compound@0.1.0']) as any;

            const result = ns['echo-record']({ x: 1.5, y: 2.5 });
            expect(result).toEqual({ x: 1.5, y: 2.5 });
            expect(recordReports).toContainEqual({ label: 'point', x: 1.5, y: 2.5 });
        }));

        test('echo-list-u8 round-trips bytes', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-compound@0.1.0']) as any;

            const input = new Uint8Array([1, 2, 3, 255, 0]);
            const result = ns['echo-list-u8'](input);
            expect(new Uint8Array(result)).toEqual(input);
        }));

        test('echo-list-string round-trips', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-compound@0.1.0']) as any;

            const result = ns['echo-list-string'](['alpha', 'beta', 'gamma']);
            expect(result).toEqual(['alpha', 'beta', 'gamma']);
        }));

        test('echo-list-record round-trips', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-compound@0.1.0']) as any;

            const input = [{ x: 1.0, y: 2.0 }, { x: 3.0, y: 4.0 }];
            const result = ns['echo-list-record'](input);
            expect(result).toEqual(input);
        }));
    });

    describe('algebraic types', () => {
        test('echo-option-u32 with some and none', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-compound@0.1.0']) as any;

            expect(ns['echo-option-u32'](42)).toBe(42);
            expect(ns['echo-option-u32'](undefined)).toBeNull();
        }));

        test('echo-option-string with some and none', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-compound@0.1.0']) as any;

            expect(ns['echo-option-string']('hello')).toBe('hello');
            expect(ns['echo-option-string'](undefined)).toBeNull();
        }));

        test('echo-result ok and err variants', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-compound@0.1.0']) as any;

            expect(ns['echo-result-ok']({ tag: 'ok', val: 'success' }))
                .toEqual({ tag: 'ok', val: 'success' });
            expect(ns['echo-result-ok']({ tag: 'err', val: 'failure' }))
                .toEqual({ tag: 'err', val: 'failure' });
        }));

        test('echo-variant round-trips all cases', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-algebraic@0.1.0']) as any;

            const circle = ns['echo-variant']({ tag: 'circle', val: 5.0 });
            expect(circle).toEqual({ tag: 'circle', val: 5.0 });

            const rect = ns['echo-variant']({ tag: 'rectangle', val: [10.0, 20.0] });
            expect(rect).toEqual({ tag: 'rectangle', val: [10.0, 20.0] });

            const poly = ns['echo-variant']({ tag: 'named-polygon', val: 'hexagon' });
            expect(poly).toEqual({ tag: 'named-polygon', val: 'hexagon' });

            const dot = ns['echo-variant']({ tag: 'dot' });
            expect(dot).toEqual({ tag: 'dot' });
        }));

        test('echo-enum round-trips all variants', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-algebraic@0.1.0']) as any;

            expect(ns['echo-enum']('red')).toBe('red');
            expect(ns['echo-enum']('green')).toBe('green');
            expect(ns['echo-enum']('blue')).toBe('blue');
            expect(ns['echo-enum']('yellow')).toBe('yellow');
        }));

        test('echo-flags round-trips individual and combined', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-algebraic@0.1.0']) as any;

            expect(ns['echo-flags']({ read: true })).toEqual({ read: true, write: false, execute: false });

            expect(ns['echo-flags']({ read: true, write: true, execute: true }))
                .toEqual({ read: true, write: true, execute: true });

            expect(ns['echo-flags']({})).toEqual({ read: false, write: false, execute: false });
        }));
    });

    describe('complex types', () => {
        test('echo-complex-record round-trips', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-complex@0.1.0'] ?? {}) as any;
            if (!ns['echo-complex-record']) return; // skip if not exported

            const input = {
                name: 'test',
                value: 42,
                nested: { x: 1.0, y: 2.0 },
                tags: ['a', 'b'],
            };
            const result = ns['echo-complex-record'](input);
            expect(result.name).toBe('test');
            expect(result.value).toBe(42);
        }));
    });
});
