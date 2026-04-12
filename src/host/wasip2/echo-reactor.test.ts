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
import { createWasiHost } from './index';

setConfiguration('Debug');

const echoWasm = './integration-tests/target/wasm32-wasip1/release/echo_reactor.wasm';

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
    const wasiImports = createWasiHost();

    return {
        imports: {
            ...wasiImports,
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

        test('echo-variant round-trips all cases', async () => {
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

    describe('edge cases', () => {
        test('result with ok-only payload', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-edge-cases@0.1.0']) as any;

            expect(ns['echo-result-ok-only']({ tag: 'ok', val: 'success' }))
                .toEqual({ tag: 'ok', val: 'success' });
            expect(ns['echo-result-ok-only']({ tag: 'err' }))
                .toEqual({ tag: 'err' });
        });

        test('result with err-only payload', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-edge-cases@0.1.0']) as any;

            expect(ns['echo-result-err-only']({ tag: 'ok' }))
                .toEqual({ tag: 'ok' });
            expect(ns['echo-result-err-only']({ tag: 'err', val: 'something broke' }))
                .toEqual({ tag: 'err', val: 'something broke' });
        });

        test('result with no payloads', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-edge-cases@0.1.0']) as any;

            expect(ns['echo-result-empty']({ tag: 'ok' }))
                .toEqual({ tag: 'ok' });
            expect(ns['echo-result-empty']({ tag: 'err' }))
                .toEqual({ tag: 'err' });
        });

        test('nested option round-trips all cases', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-edge-cases@0.1.0']) as any;

            // None (outer)
            expect(ns['echo-nested-option'](undefined)).toBeNull();
            // Some(None) — inner is none
            expect(ns['echo-nested-option'](null)).toBeNull();
            // Some(Some(42))
            expect(ns['echo-nested-option'](42)).toBe(42);
        });

        test('tuple5 round-trips', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-edge-cases@0.1.0']) as any;

            const result = ns['echo-tuple5']([1, 2, 3, 4n, 'five']);
            expect(result).toEqual([1, 2, 3, 4n, 'five']);
        });

        test('list of options round-trips', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-edge-cases@0.1.0']) as any;

            const result = ns['echo-list-option'](['hello', undefined, 'world']);
            expect(result).toEqual(['hello', null, 'world']);
        });

        test('list of results round-trips', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-edge-cases@0.1.0']) as any;

            const input = [
                { tag: 'ok', val: 42 },
                { tag: 'err', val: 'fail' },
                { tag: 'ok', val: 0 },
            ];
            const result = ns['echo-list-result'](input);
            expect(result).toEqual(input);
        });

        test('option containing list', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-edge-cases@0.1.0']) as any;

            // Some(list)
            expect(ns['echo-option-list']([1, 2, 3])).toEqual([1, 2, 3]);
            // None
            expect(ns['echo-option-list'](undefined)).toBeNull();
        });

        test('list of tuples round-trips', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-edge-cases@0.1.0']) as any;

            const input = [['alpha', 1], ['beta', 2], ['gamma', 3]];
            const result = ns['echo-list-tuple'](input);
            expect(result).toEqual(input);
        });

        test('big-flags (32 members) round-trips', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-edge-cases@0.1.0']) as any;

            // Single high bit
            const highBit = { b31: true };
            const result1 = ns['echo-big-flags'](highBit);
            expect(result1.b31).toBe(true);
            expect(result1.b0).toBe(false);

            // Multiple scattered bits
            const scattered = { b0: true, b15: true, b31: true };
            const result2 = ns['echo-big-flags'](scattered);
            expect(result2.b0).toBe(true);
            expect(result2.b15).toBe(true);
            expect(result2.b31).toBe(true);
            expect(result2.b1).toBe(false);

            // All flags set
            const allFlags: Record<string, boolean> = {};
            for (let i = 0; i < 32; i++) allFlags[`b${i}`] = true;
            const result3 = ns['echo-big-flags'](allFlags);
            for (let i = 0; i < 32; i++) expect(result3[`b${i}`]).toBe(true);

            // No flags set
            const empty = {};
            const result4 = ns['echo-big-flags'](empty);
            for (let i = 0; i < 32; i++) expect(result4[`b${i}`]).toBe(false);
        });

        test('zero-length list round-trips', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-edge-cases@0.1.0']) as any;

            const result = ns['echo-empty-list']([]);
            expect(result).toEqual([]);
        });

        test('empty string round-trips', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-edge-cases@0.1.0']) as any;

            expect(ns['echo-empty-string']('')).toBe('');
        });

        test('result with resource in error tuple (ok case)', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-edge-cases@0.1.0']) as any;

            // Ok case: list<u8>
            const okResult = ns['echo-result-complex']({ tag: 'ok', val: new Uint8Array([1, 2, 3]) });
            expect(okResult.tag).toBe('ok');
            expect(new Uint8Array(okResult.val)).toEqual(new Uint8Array([1, 2, 3]));
        });

        test('result with resource in error tuple (err case)', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-edge-cases@0.1.0']) as any;

            // Verify constructor + method work directly
            const ErrCtx = ns['[constructor]err-ctx'];
            const ctx1 = ErrCtx('direct test');
            const directMsg = ns['[method]err-ctx.get-message'](ctx1);
            expect(directMsg).toBe('direct test');

            // Create resource for the round-trip
            const ctx = ErrCtx('something went wrong');

            // Err case: tuple<string, err-ctx>
            const errResult = ns['echo-result-complex']({ tag: 'err', val: ['error msg', ctx] });
            expect(errResult.tag).toBe('err');
            expect(errResult.val[0]).toBe('error msg');
            // The returned resource should have get-message
            const returnedMsg = ns['[method]err-ctx.get-message'](errResult.val[1]);
            expect(returnedMsg).toBe('something went wrong');
        }));

        test('f32/f64 special values', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const prim = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            // Infinity
            expect(prim['echo-f64'](Infinity)).toBe(Infinity);
            expect(prim['echo-f64'](-Infinity)).toBe(-Infinity);
            expect(prim['echo-f32'](Infinity)).toBe(Infinity);

            // NaN (canonical)
            expect(prim['echo-f64'](NaN)).toBeNaN();
            expect(prim['echo-f32'](NaN)).toBeNaN();

            // Negative zero
            expect(Object.is(prim['echo-f64'](-0), -0)).toBe(true);
            expect(Object.is(prim['echo-f32'](-0), -0)).toBe(true);
        }));

        test('string edge cases: CJK, emoji, surrogate-safe', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, verboseOptions(verbose));
            const instance = await component.instantiate(imports);
            const prim = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            // CJK characters
            expect(prim['echo-string']('日本語テスト')).toBe('日本語テスト');
            // Emoji sequence (multi-codepoint)
            expect(prim['echo-string']('👨‍👩‍👧‍👦')).toBe('👨‍👩‍👧‍👦');
            // Mixed scripts
            expect(prim['echo-string']('Hello мир 世界 🌍')).toBe('Hello мир 世界 🌍');
            // Null byte in string
            expect(prim['echo-string']('a\0b')).toBe('a\0b');
        }));
    });
});
