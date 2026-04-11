/**
 * Echo-reactor integration test — type round-trip through component model
 *
 * A wasm32-wasip2 reactor that exports echo functions for every WIT type.
 * JS calls wasm export(value) → wasm processes and calls sink import → returns value → JS asserts.
 * Covers record, enum, variant, flags, option, result, list, tuple, and all primitives.
 */

import { createComponent } from '../../resolver';
import { setConfiguration } from '../../utils/assert';
import { useVerboseOnFailure, verboseOptions, runWithVerbose } from '../../test-utils/verbose-logger';

setConfiguration('Debug');

const echoWasm = './integration-tests/target/wasm32-unknown-unknown/release/echo_reactor.wasm';

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

    return {
        imports: {
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

describe('echo-reactor', () => {
    const verbose = useVerboseOnFailure();

    describe('primitives', () => {
        test('echo-bool round-trips true and false', () => runWithVerbose(verbose, async () => {
            const { imports, primitiveReports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-bool'](true)).toBe(true);
            expect(ns['echo-bool'](false)).toBe(false);
            expect(primitiveReports).toContainEqual({ label: 'bool', value: 'true' });
            expect(primitiveReports).toContainEqual({ label: 'bool', value: 'false' });
        }));

        test('echo-u8 round-trips boundary values', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-u8'](0)).toBe(0);
            expect(ns['echo-u8'](255)).toBe(255);
            expect(ns['echo-u8'](42)).toBe(42);
        });

        test('echo-u16 round-trips', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-u16'](0)).toBe(0);
            expect(ns['echo-u16'](65535)).toBe(65535);
        });

        test('echo-u32 round-trips', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-u32'](0)).toBe(0);
            expect(ns['echo-u32'](0xFFFFFFFF)).toBe(0xFFFFFFFF);
        });

        test('echo-u64 round-trips as bigint', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-u64'](0n)).toBe(0n);
            expect(ns['echo-u64'](BigInt('18446744073709551615'))).toBe(BigInt('18446744073709551615'));
        });

        test('echo-s8 round-trips negative values', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-s8'](-128)).toBe(-128);
            expect(ns['echo-s8'](127)).toBe(127);
            expect(ns['echo-s8'](0)).toBe(0);
        });

        test('echo-s16 round-trips', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-s16'](-32768)).toBe(-32768);
            expect(ns['echo-s16'](32767)).toBe(32767);
        });

        test('echo-s32 round-trips', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-s32'](-2147483648)).toBe(-2147483648);
            expect(ns['echo-s32'](2147483647)).toBe(2147483647);
        });

        test('echo-s64 round-trips as bigint', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-s64'](BigInt('-9223372036854775808'))).toBe(BigInt('-9223372036854775808'));
            expect(ns['echo-s64'](BigInt('9223372036854775807'))).toBe(BigInt('9223372036854775807'));
        });

        test('echo-f32 round-trips', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-f32'](0)).toBe(0);
            const pi = ns['echo-f32'](3.14);
            expect(pi).toBeCloseTo(3.14, 2);
        });

        test('echo-f64 round-trips', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-f64'](0)).toBe(0);
            expect(ns['echo-f64'](3.141592653589793)).toBe(3.141592653589793);
            expect(ns['echo-f64'](-1.23e45)).toBe(-1.23e45);
        });

        test('echo-char round-trips', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-char']('A')).toBe('A');
            expect(ns['echo-char']('🌍')).toBe('🌍');
        });

        test('echo-string round-trips', async () => {
            const { imports, primitiveReports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-string']('')).toBe('');
            expect(ns['echo-string']('hello world')).toBe('hello world');
            expect(ns['echo-string']('unicode: àáâãäå 日本語 🎉')).toBe('unicode: àáâãäå 日本語 🎉');

            expect(primitiveReports).toContainEqual({ label: 'string', value: 'hello world' });
        });
    });

    describe('compound types', () => {
        test('echo-tuple2 round-trips', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-compound@0.1.0']) as any;

            const result = ns['echo-tuple2']([42, 'hello']);
            expect(result).toEqual([42, 'hello']);
        });

        test('echo-tuple3 round-trips', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-compound@0.1.0']) as any;

            const result = ns['echo-tuple3']([1.0, 2.0, 3.0]);
            expect(result[0]).toBeCloseTo(1.0);
            expect(result[1]).toBeCloseTo(2.0);
            expect(result[2]).toBeCloseTo(3.0);
        });

        test('echo-record round-trips point', async () => {
            const { imports, recordReports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-compound@0.1.0']) as any;

            const result = ns['echo-record']({ x: 1.5, y: 2.5 });
            expect(result).toEqual({ x: 1.5, y: 2.5 });
            expect(recordReports).toContainEqual({ label: 'point', x: 1.5, y: 2.5 });
        });

        test('echo-nested-record round-trips labeled point', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-compound@0.1.0']) as any;

            const input = {
                label: 'origin',
                coords: { x: 0.0, y: 0.0 },
                elevation: 100.5,
            };
            const result = ns['echo-nested-record'](input);
            expect(result.label).toBe('origin');
            expect(result.coords).toEqual({ x: 0.0, y: 0.0 });
            expect(result.elevation).toBe(100.5);
        });

        test('echo-nested-record with none elevation', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-compound@0.1.0']) as any;

            const input = {
                label: 'flat',
                coords: { x: 3.0, y: 4.0 },
                elevation: undefined,
            };
            const result = ns['echo-nested-record'](input);
            expect(result.label).toBe('flat');
            expect(result.elevation).toBeNull();
        });

        test('echo-list-u8 round-trips bytes', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-compound@0.1.0']) as any;

            const input = new Uint8Array([1, 2, 3, 255, 0]);
            const result = ns['echo-list-u8'](input);
            expect(new Uint8Array(result)).toEqual(input);
        });

        test('echo-list-string round-trips', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-compound@0.1.0']) as any;

            const result = ns['echo-list-string'](['alpha', 'beta', 'gamma']);
            expect(result).toEqual(['alpha', 'beta', 'gamma']);
        });

        test('echo-list-record round-trips list of points', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-compound@0.1.0']) as any;

            const input = [
                { x: 1.0, y: 2.0 },
                { x: 3.0, y: 4.0 },
                { x: 5.0, y: 6.0 },
            ];
            const result = ns['echo-list-record'](input);
            expect(result).toEqual(input);
        });

        test('echo-option-u32 with some and none', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-compound@0.1.0']) as any;

            expect(ns['echo-option-u32'](42)).toBe(42);
            expect(ns['echo-option-u32'](undefined)).toBeNull();
        });

        test('echo-option-string with some and none', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-compound@0.1.0']) as any;

            expect(ns['echo-option-string']('hello')).toBe('hello');
            expect(ns['echo-option-string'](undefined)).toBeNull();
        });

        test('echo-result ok and err variants', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-compound@0.1.0']) as any;

            expect(ns['echo-result-ok']({ tag: 'ok', val: 'success' }))
                .toEqual({ tag: 'ok', val: 'success' });
            expect(ns['echo-result-ok']({ tag: 'err', val: 'failure' }))
                .toEqual({ tag: 'err', val: 'failure' });
        });
    });

    describe('algebraic types', () => {
        test('echo-enum round-trips all variants', async () => {
            const { imports, primitiveReports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-algebraic@0.1.0']) as any;

            expect(ns['echo-enum']('red')).toBe('red');
            expect(ns['echo-enum']('green')).toBe('green');
            expect(ns['echo-enum']('blue')).toBe('blue');
            expect(ns['echo-enum']('yellow')).toBe('yellow');

            expect(primitiveReports.filter(r => r.label === 'enum').map(r => r.value))
                .toEqual(['red', 'green', 'blue', 'yellow']);
        });

        test('echo-flags round-trips individual and combined', async () => {
            const { imports, primitiveReports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-algebraic@0.1.0']) as any;

            // Single flag
            expect(ns['echo-flags']({ read: true })).toEqual({ read: true, write: false, execute: false });

            // Multiple flags
            expect(ns['echo-flags']({ read: true, write: true, execute: true }))
                .toEqual({ read: true, write: true, execute: true });

            // Empty flags
            expect(ns['echo-flags']({})).toEqual({ read: false, write: false, execute: false });

            expect(primitiveReports).toContainEqual({ label: 'flags', value: 'read|write|execute' });
        });

        // TODO: variant with mixed payload types (f64/tuple/string) causes flat-type join issue
        // The component model spec requires "joining" flat types across variant cases,
        // e.g., f64 and i32 join to i64. The current lifting code doesn't handle this.
        test.skip('echo-variant round-trips all cases', async () => {
            const { imports, primitiveReports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-algebraic@0.1.0']) as any;

            // Variant with f64 payload
            const circle = ns['echo-variant']({ tag: 'circle', val: 5.0 });
            expect(circle).toEqual({ tag: 'circle', val: 5.0 });

            // Variant with tuple payload
            const rect = ns['echo-variant']({ tag: 'rectangle', val: [10.0, 20.0] });
            expect(rect).toEqual({ tag: 'rectangle', val: [10.0, 20.0] });

            // Variant with string payload
            const poly = ns['echo-variant']({ tag: 'named-polygon', val: 'hexagon' });
            expect(poly).toEqual({ tag: 'named-polygon', val: 'hexagon' });

            // Variant with no payload
            const dot = ns['echo-variant']({ tag: 'dot' });
            expect(dot).toEqual({ tag: 'dot' });

            expect(primitiveReports).toContainEqual({ label: 'variant', value: 'circle(5)' });
            expect(primitiveReports).toContainEqual({ label: 'variant', value: 'dot' });
        });
    });

    describe('sink round-trip', () => {
        test('wasm calls JS sink imports during echo', async () => {
            const { imports, primitiveReports, recordReports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);

            const prim = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;
            const comp = (instance.exports['jsco:test/echo-compound@0.1.0']) as any;

            // Call several exports
            prim['echo-u32'](999);
            comp['echo-record']({ x: 7.0, y: 8.0 });

            // Verify the sink was called (import direction)
            expect(primitiveReports).toContainEqual({ label: 'u32', value: '999' });
            expect(recordReports).toContainEqual({ label: 'point', x: 7.0, y: 8.0 });
        });
    });
});
