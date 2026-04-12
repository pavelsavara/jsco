/**
 * Echo-reactor integration test — type round-trip through component model
 *
 * A wasm32-wasip2 reactor that exports echo functions for every WIT type.
 * JS calls wasm export(value) → wasm processes and calls sink import → returns value → JS asserts.
 * Covers record, enum, variant, flags, option, result, list, tuple, and all primitives.
 */

import { createComponent } from '../../resolver';
import { initializeAsserts } from '../../utils/assert';
import { useVerboseOnFailure, verboseOptions, runWithVerbose } from '../../test-utils/verbose-logger';
import { createWasiHost } from './index';

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
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-bool'](true)).toBe(true);
            expect(ns['echo-bool'](false)).toBe(false);
            expect(primitiveReports).toContainEqual({ label: 'bool', value: 'true' });
            expect(primitiveReports).toContainEqual({ label: 'bool', value: 'false' });
        }));

        test('echo-u8 round-trips boundary values', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-u8'](0)).toBe(0);
            expect(ns['echo-u8'](255)).toBe(255);
            expect(ns['echo-u8'](42)).toBe(42);
        });

        test('echo-u16 round-trips', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-u16'](0)).toBe(0);
            expect(ns['echo-u16'](65535)).toBe(65535);
        });

        test('echo-u32 round-trips', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-u32'](0)).toBe(0);
            expect(ns['echo-u32'](0xFFFFFFFF)).toBe(0xFFFFFFFF);
        });

        test('echo-u64 round-trips as bigint', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-u64'](0n)).toBe(0n);
            expect(ns['echo-u64'](BigInt('18446744073709551615'))).toBe(BigInt('18446744073709551615'));
        });

        test('echo-s8 round-trips negative values', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-s8'](-128)).toBe(-128);
            expect(ns['echo-s8'](127)).toBe(127);
            expect(ns['echo-s8'](0)).toBe(0);
        });

        test('echo-s16 round-trips', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-s16'](-32768)).toBe(-32768);
            expect(ns['echo-s16'](32767)).toBe(32767);
        });

        test('echo-s32 round-trips', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-s32'](-2147483648)).toBe(-2147483648);
            expect(ns['echo-s32'](2147483647)).toBe(2147483647);
        });

        test('echo-s64 round-trips as bigint', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-s64'](BigInt('-9223372036854775808'))).toBe(BigInt('-9223372036854775808'));
            expect(ns['echo-s64'](BigInt('9223372036854775807'))).toBe(BigInt('9223372036854775807'));
        });

        test('echo-f32 round-trips', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-f32'](0)).toBe(0);
            const pi = ns['echo-f32'](3.14);
            expect(pi).toBeCloseTo(3.14, 2);
        });

        test('echo-f64 round-trips', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-f64'](0)).toBe(0);
            expect(ns['echo-f64'](3.141592653589793)).toBe(3.141592653589793);
            expect(ns['echo-f64'](-1.23e45)).toBe(-1.23e45);
        });

        test('echo-char round-trips', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;

            expect(ns['echo-char']('A')).toBe('A');
            expect(ns['echo-char']('🌍')).toBe('🌍');
        });

        test('echo-string round-trips', async () => {
            const { imports, primitiveReports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
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
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-compound@0.1.0']) as any;

            const result = ns['echo-tuple2']([42, 'hello']);
            expect(result).toEqual([42, 'hello']);
        });

        test('echo-tuple3 round-trips', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-compound@0.1.0']) as any;

            const result = ns['echo-tuple3']([1.0, 2.0, 3.0]);
            expect(result[0]).toBeCloseTo(1.0);
            expect(result[1]).toBeCloseTo(2.0);
            expect(result[2]).toBeCloseTo(3.0);
        });

        test('echo-record round-trips point', async () => {
            const { imports, recordReports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-compound@0.1.0']) as any;

            const result = ns['echo-record']({ x: 1.5, y: 2.5 });
            expect(result).toEqual({ x: 1.5, y: 2.5 });
            expect(recordReports).toContainEqual({ label: 'point', x: 1.5, y: 2.5 });
        });

        test('echo-nested-record round-trips labeled point', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
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
            const component = await createComponent(echoWasm, echoOptions(verbose));
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
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-compound@0.1.0']) as any;

            const input = new Uint8Array([1, 2, 3, 255, 0]);
            const result = ns['echo-list-u8'](input);
            expect(new Uint8Array(result)).toEqual(input);
        });

        test('echo-list-string round-trips', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-compound@0.1.0']) as any;

            const result = ns['echo-list-string'](['alpha', 'beta', 'gamma']);
            expect(result).toEqual(['alpha', 'beta', 'gamma']);
        });

        test('echo-list-record round-trips list of points', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
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
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-compound@0.1.0']) as any;

            expect(ns['echo-option-u32'](42)).toBe(42);
            expect(ns['echo-option-u32'](undefined)).toBeNull();
        });

        test('echo-option-string with some and none', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-compound@0.1.0']) as any;

            expect(ns['echo-option-string']('hello')).toBe('hello');
            expect(ns['echo-option-string'](undefined)).toBeNull();
        });

        test('echo-result ok and err variants', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
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
            const component = await createComponent(echoWasm, echoOptions(verbose));
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
            const component = await createComponent(echoWasm, echoOptions(verbose));
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
            const component = await createComponent(echoWasm, echoOptions(verbose));
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
            const component = await createComponent(echoWasm, echoOptions(verbose));
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
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-edge-cases@0.1.0']) as any;

            expect(ns['echo-result-ok-only']({ tag: 'ok', val: 'success' }))
                .toEqual({ tag: 'ok', val: 'success' });
            expect(ns['echo-result-ok-only']({ tag: 'err' }))
                .toEqual({ tag: 'err' });
        });

        test('result with err-only payload', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-edge-cases@0.1.0']) as any;

            expect(ns['echo-result-err-only']({ tag: 'ok' }))
                .toEqual({ tag: 'ok' });
            expect(ns['echo-result-err-only']({ tag: 'err', val: 'something broke' }))
                .toEqual({ tag: 'err', val: 'something broke' });
        });

        test('result with no payloads', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-edge-cases@0.1.0']) as any;

            expect(ns['echo-result-empty']({ tag: 'ok' }))
                .toEqual({ tag: 'ok' });
            expect(ns['echo-result-empty']({ tag: 'err' }))
                .toEqual({ tag: 'err' });
        });

        test('nested option round-trips all cases', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
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
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-edge-cases@0.1.0']) as any;

            const result = ns['echo-tuple5']([1, 2, 3, 4n, 'five']);
            expect(result).toEqual([1, 2, 3, 4n, 'five']);
        });

        test('list of options round-trips', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-edge-cases@0.1.0']) as any;

            const result = ns['echo-list-option'](['hello', undefined, 'world']);
            expect(result).toEqual(['hello', null, 'world']);
        });

        test('list of results round-trips', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
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
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-edge-cases@0.1.0']) as any;

            // Some(list)
            expect(ns['echo-option-list']([1, 2, 3])).toEqual([1, 2, 3]);
            // None
            expect(ns['echo-option-list'](undefined)).toBeNull();
        });

        test('list of tuples round-trips', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-edge-cases@0.1.0']) as any;

            const input = [['alpha', 1], ['beta', 2], ['gamma', 3]];
            const result = ns['echo-list-tuple'](input);
            expect(result).toEqual(input);
        });

        test('big-flags (32 members) round-trips', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
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
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-edge-cases@0.1.0']) as any;

            const result = ns['echo-empty-list']([]);
            expect(result).toEqual([]);
        });

        test('empty string round-trips', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-edge-cases@0.1.0']) as any;

            expect(ns['echo-empty-string']('')).toBe('');
        });

        test('result with resource in error tuple (ok case)', async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-edge-cases@0.1.0']) as any;

            // Ok case: list<u8>
            const okResult = ns['echo-result-complex']({ tag: 'ok', val: new Uint8Array([1, 2, 3]) });
            expect(okResult.tag).toBe('ok');
            expect(new Uint8Array(okResult.val)).toEqual(new Uint8Array([1, 2, 3]));
        });

        test('result with resource in error tuple (err case)', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
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
            const component = await createComponent(echoWasm, echoOptions(verbose));
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
            const component = await createComponent(echoWasm, echoOptions(verbose));
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

    describe('resources', () => {
        test('accumulator: constructor and get-total', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-resources@0.1.0']) as any;

            const acc = ns['[constructor]accumulator'](100n);
            const total = ns['[method]accumulator.get-total'](acc);
            expect(total).toBe(100n);
        }));

        test('accumulator: snapshot creates independent copy', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-resources@0.1.0']) as any;

            const acc = ns['[constructor]accumulator'](42n);
            const snap = ns['[method]accumulator.snapshot'](acc);
            // Both should have value 42
            expect(ns['[method]accumulator.get-total'](acc)).toBe(42n);
            expect(ns['[method]accumulator.get-total'](snap)).toBe(42n);
        }));

        test('transform-owned: doubles value via own transfer', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-resources@0.1.0']) as any;

            const acc = ns['[constructor]accumulator'](50n);
            const transformed = ns['transform-owned'](acc);
            expect(ns['[method]accumulator.get-total'](transformed)).toBe(100n);
        }));

        test('inspect-borrowed: reads without consuming', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-resources@0.1.0']) as any;

            const acc = ns['[constructor]accumulator'](77n);
            // Borrow: should read but not consume
            const total = ns['inspect-borrowed'](acc);
            expect(total).toBe(77n);
            // Can still use the accumulator after borrow
            const total2 = ns['[method]accumulator.get-total'](acc);
            expect(total2).toBe(77n);
        }));

        test('merge-accumulators: combines two owned resources', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-resources@0.1.0']) as any;

            const a = ns['[constructor]accumulator'](30n);
            const b = ns['[constructor]accumulator'](12n);
            const merged = ns['merge-accumulators'](a, b);
            expect(ns['[method]accumulator.get-total'](merged)).toBe(42n);
        }));

        test('byte-buffer: constructor, read, remaining, is-empty lifecycle', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-resources@0.1.0']) as any;

            const data = new Uint8Array([10, 20, 30, 40, 50]);
            const buf = ns['[constructor]byte-buffer'](data);

            // Full buffer
            expect(ns['[method]byte-buffer.remaining'](buf)).toBe(5);
            expect(ns['[method]byte-buffer.is-empty'](buf)).toBe(false);

            // Read 3 bytes
            const chunk1 = ns['[method]byte-buffer.read'](buf, 3);
            expect(new Uint8Array(chunk1)).toEqual(new Uint8Array([10, 20, 30]));
            expect(ns['[method]byte-buffer.remaining'](buf)).toBe(2);

            // Read remaining
            const chunk2 = ns['[method]byte-buffer.read'](buf, 10);
            expect(new Uint8Array(chunk2)).toEqual(new Uint8Array([40, 50]));
            expect(ns['[method]byte-buffer.is-empty'](buf)).toBe(true);
            expect(ns['[method]byte-buffer.remaining'](buf)).toBe(0);
        }));

        test('echo-buffer: round-trips a buffer resource', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-resources@0.1.0']) as any;

            const data = new Uint8Array([1, 2, 3, 4]);
            const buf = ns['[constructor]byte-buffer'](data);
            const echoed = ns['echo-buffer'](buf);
            // Echoed buffer should have the same data
            expect(ns['[method]byte-buffer.remaining'](echoed)).toBe(4);
            const readAll = ns['[method]byte-buffer.read'](echoed, 100);
            expect(new Uint8Array(readAll)).toEqual(new Uint8Array([1, 2, 3, 4]));
        }));

        test('multiple resource types: accumulator and byte-buffer coexist', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-resources@0.1.0']) as any;

            // Create both resource types
            const acc = ns['[constructor]accumulator'](99n);
            const buf = ns['[constructor]byte-buffer'](new Uint8Array([7, 8, 9]));

            // Both work independently
            expect(ns['[method]accumulator.get-total'](acc)).toBe(99n);
            expect(ns['[method]byte-buffer.remaining'](buf)).toBe(3);

            // Operations on one don't affect the other
            ns['[method]byte-buffer.read'](buf, 1);
            expect(ns['[method]accumulator.get-total'](acc)).toBe(99n);
            expect(ns['[method]byte-buffer.remaining'](buf)).toBe(2);
        }));

        test('transform-owned chained: transform twice', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-resources@0.1.0']) as any;

            // Create → transform (×2) → transform (×2) = ×4 the original value
            const acc1 = ns['[constructor]accumulator'](25n);
            const acc2 = ns['transform-owned'](acc1);
            expect(ns['[method]accumulator.get-total'](acc2)).toBe(50n);
            const acc3 = ns['transform-owned'](acc2);
            expect(ns['[method]accumulator.get-total'](acc3)).toBe(100n);
        }));

        test('snapshot creates independent handle', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-resources@0.1.0']) as any;

            const acc = ns['[constructor]accumulator'](42n);
            const snap = ns['[method]accumulator.snapshot'](acc);
            // Snapshot is a separate resource — both should be independently readable
            expect(ns['[method]accumulator.get-total'](acc)).toBe(42n);
            expect(ns['[method]accumulator.get-total'](snap)).toBe(42n);
            // They are different handles
            expect(acc).not.toBe(snap);
        }));

        test('many resources: sequential create and use', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-resources@0.1.0']) as any;

            // Create many resources to exercise the resource table
            const handles: number[] = [];
            for (let i = 0; i < 10; i++) {
                handles.push(ns['[constructor]accumulator'](BigInt(i)));
            }
            // All should be independently accessible
            for (let i = 0; i < 10; i++) {
                expect(ns['[method]accumulator.get-total'](handles[i])).toBe(BigInt(i));
            }
        }));

        test('inspect-borrowed after merge', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-resources@0.1.0']) as any;

            const a = ns['[constructor]accumulator'](60n);
            const b = ns['[constructor]accumulator'](40n);
            const merged = ns['merge-accumulators'](a, b);
            // inspect-borrowed on merged resource
            expect(ns['inspect-borrowed'](merged)).toBe(100n);
        }));
    });

    describe('complex types', () => {
        test('echo-deeply-nested: team with nested person/address', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-complex@0.1.0']) as any;

            const team = {
                name: 'Engineering',
                lead: {
                    name: 'Alice',
                    age: 30,
                    email: 'alice@example.com',
                    address: { street: '123 Main St', city: 'Springfield', zip: '62701' },
                    tags: ['lead', 'senior'],
                },
                members: [
                    {
                        name: 'Bob',
                        age: 25,
                        email: undefined,
                        address: { street: '456 Oak Ave', city: 'Shelbyville', zip: '62702' },
                        tags: ['junior'],
                    },
                ],
                metadata: [['dept', 'eng'], ['floor', '3']],
            };
            const result = ns['echo-deeply-nested'](team);
            expect(result.name).toBe('Engineering');
            expect(result.lead.name).toBe('Alice');
            expect(result.lead.email).toBe('alice@example.com');
            expect(result.lead.address.city).toBe('Springfield');
            expect(result.lead.tags).toEqual(['lead', 'senior']);
            expect(result.members).toHaveLength(1);
            expect(result.members[0].name).toBe('Bob');
            expect(result.members[0].email).toBeNull();
            expect(result.metadata).toEqual([['dept', 'eng'], ['floor', '3']]);
        }));

        test('echo-list-of-records: list<person>', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-complex@0.1.0']) as any;

            const people = [
                { name: 'A', age: 20, email: 'a@x.com', address: { street: 's1', city: 'c1', zip: 'z1' }, tags: [] },
                { name: 'B', age: 30, email: undefined, address: { street: 's2', city: 'c2', zip: 'z2' }, tags: ['x', 'y'] },
            ];
            const result = ns['echo-list-of-records'](people);
            expect(result).toHaveLength(2);
            expect(result[0].name).toBe('A');
            expect(result[1].tags).toEqual(['x', 'y']);
        }));

        test('echo-tuple-of-records: tuple<person, address>', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-complex@0.1.0']) as any;

            const person = { name: 'Carol', age: 40, email: undefined, address: { street: 's', city: 'c', zip: 'z' }, tags: [] };
            const addr = { street: '789 Pine', city: 'Portland', zip: '97201' };
            const result = ns['echo-tuple-of-records']([person, addr]);
            expect(result[0].name).toBe('Carol');
            expect(result[1].city).toBe('Portland');
        }));

        test('echo-complex-variant: all geometry arms', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-complex@0.1.0']) as any;

            // point2d
            const p2d = ns['echo-complex-variant']({ tag: 'point2d', val: { x: 1.0, y: 2.0 } });
            expect(p2d).toEqual({ tag: 'point2d', val: { x: 1.0, y: 2.0 } });

            // point3d
            const p3d = ns['echo-complex-variant']({ tag: 'point3d', val: { x: 1.0, y: 2.0, z: 3.0 } });
            expect(p3d).toEqual({ tag: 'point3d', val: { x: 1.0, y: 2.0, z: 3.0 } });

            // line (tuple of two vec2)
            const line = ns['echo-complex-variant']({ tag: 'line', val: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
            expect(line.tag).toBe('line');
            expect(line.val[0].x).toBe(0);
            expect(line.val[1].y).toBe(1);

            // polygon (list<vec2>)
            const poly = ns['echo-complex-variant']({
                tag: 'polygon',
                val: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }],
            });
            expect(poly.tag).toBe('polygon');
            expect(poly.val).toHaveLength(3);

            // labeled (tuple<string, list<vec2>>)
            const labeled = ns['echo-complex-variant']({
                tag: 'labeled',
                val: ['triangle', [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }]],
            });
            expect(labeled.tag).toBe('labeled');
            expect(labeled.val[0]).toBe('triangle');
            expect(labeled.val[1]).toHaveLength(3);

            // empty (no payload — tests MaybeUninit/payload-less variant arm)
            const empty = ns['echo-complex-variant']({ tag: 'empty' });
            expect(empty).toEqual({ tag: 'empty' });
        }));

        test('echo-message: all message arms', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-complex@0.1.0']) as any;

            // text
            const text = ns['echo-message']({ tag: 'text', val: 'hello' });
            expect(text).toEqual({ tag: 'text', val: 'hello' });

            // binary
            const bin = ns['echo-message']({ tag: 'binary', val: new Uint8Array([1, 2, 3]) });
            expect(bin.tag).toBe('binary');
            expect(new Uint8Array(bin.val)).toEqual(new Uint8Array([1, 2, 3]));

            // structured (person inside variant)
            const structured = ns['echo-message']({
                tag: 'structured',
                val: {
                    name: 'Dave',
                    age: 35,
                    email: 'dave@x.com',
                    address: { street: 's', city: 'c', zip: 'z' },
                    tags: ['admin'],
                },
            });
            expect(structured.tag).toBe('structured');
            expect(structured.val.name).toBe('Dave');

            // error-result (result inside variant)
            const errResult = ns['echo-message']({ tag: 'error-result', val: { tag: 'ok', val: 'success' } });
            expect(errResult).toEqual({ tag: 'error-result', val: { tag: 'ok', val: 'success' } });

            const errResult2 = ns['echo-message']({ tag: 'error-result', val: { tag: 'err', val: 'fail' } });
            expect(errResult2).toEqual({ tag: 'error-result', val: { tag: 'err', val: 'fail' } });

            // tagged (tuple<string, option<list<u8>>>)
            const tagged = ns['echo-message']({
                tag: 'tagged',
                val: ['mytag', new Uint8Array([10, 20])],
            });
            expect(tagged.tag).toBe('tagged');
            expect(tagged.val[0]).toBe('mytag');
            expect(new Uint8Array(tagged.val[1])).toEqual(new Uint8Array([10, 20]));

            // tagged with none payload
            const taggedNone = ns['echo-message']({
                tag: 'tagged',
                val: ['notag', undefined],
            });
            expect(taggedNone.tag).toBe('tagged');
            expect(taggedNone.val[0]).toBe('notag');
            expect(taggedNone.val[1]).toBeNull();

            // empty (payload-less arm)
            const empty = ns['echo-message']({ tag: 'empty' });
            expect(empty).toEqual({ tag: 'empty' });
        }));

        test('echo-kitchen-sink: record with all compound fields', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-complex@0.1.0']) as any;

            const ks = {
                name: 'sink',
                values: [1, 2, 3],
                nested: [['a', 'b'], ['c']],
                pairs: [['key1', 10], ['key2', 20]],
                maybe: new Uint8Array([42]),
                resultField: { tag: 'ok', val: ['alpha', 'beta'] },
            };
            const result = ns['echo-kitchen-sink'](ks);
            expect(result.name).toBe('sink');
            expect(result.values).toEqual([1, 2, 3]);
            expect(result.nested).toEqual([['a', 'b'], ['c']]);
            expect(result.pairs).toEqual([['key1', 10], ['key2', 20]]);
            expect(new Uint8Array(result.maybe)).toEqual(new Uint8Array([42]));
            expect(result.resultField).toEqual({ tag: 'ok', val: ['alpha', 'beta'] });
        }));

        test('echo-kitchen-sink: none and err variants', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-complex@0.1.0']) as any;

            const ks = {
                name: 'empty-sink',
                values: [],
                nested: [],
                pairs: [],
                maybe: undefined,
                resultField: { tag: 'err', val: 'something failed' },
            };
            const result = ns['echo-kitchen-sink'](ks);
            expect(result.name).toBe('empty-sink');
            expect(result.values).toEqual([]);
            expect(result.nested).toEqual([]);
            expect(result.maybe).toBeNull();
            expect(result.resultField).toEqual({ tag: 'err', val: 'something failed' });
        }));

        test('echo-nested-lists: list<list<u32>>', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-complex@0.1.0']) as any;

            const input = [[1, 2], [3], [4, 5, 6], []];
            const result = ns['echo-nested-lists'](input);
            expect(result).toEqual([[1, 2], [3], [4, 5, 6], []]);
        }));

        test('echo-option-record: some and none', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-complex@0.1.0']) as any;

            const person = { name: 'Eve', age: 28, email: undefined, address: { street: 's', city: 'c', zip: 'z' }, tags: [] };
            const some = ns['echo-option-record'](person);
            expect(some.name).toBe('Eve');
            const none = ns['echo-option-record'](undefined);
            expect(none).toBeNull();
        }));

        test('echo-result-record: ok and err', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-complex@0.1.0']) as any;

            const person = { name: 'Frank', age: 50, email: 'f@x.com', address: { street: 's', city: 'c', zip: 'z' }, tags: ['admin'] };
            const ok = ns['echo-result-record']({ tag: 'ok', val: person });
            expect(ok.tag).toBe('ok');
            expect(ok.val.name).toBe('Frank');
            expect(ok.val.tags).toEqual(['admin']);

            const err = ns['echo-result-record']({ tag: 'err', val: 'not found' });
            expect(err).toEqual({ tag: 'err', val: 'not found' });
        }));

        test('echo-list-of-variants: list<geometry>', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-complex@0.1.0']) as any;

            const variants = [
                { tag: 'point2d', val: { x: 1, y: 2 } },
                { tag: 'empty' },
                { tag: 'polygon', val: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
            ];
            const result = ns['echo-list-of-variants'](variants);
            expect(result).toHaveLength(3);
            expect(result[0].tag).toBe('point2d');
            expect(result[1]).toEqual({ tag: 'empty' });
            expect(result[2].tag).toBe('polygon');
            expect(result[2].val).toHaveLength(2);
        }));
    });

    describe('post-return and memory lifecycle', () => {
        test('repeated string-returning exports deallocate correctly', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const prim = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;
            const comp = (instance.exports['jsco:test/echo-compound@0.1.0']) as any;

            // Call many string/list-returning exports in sequence
            // If post-return deallocation fails, wasm memory would leak/corrupt
            for (let i = 0; i < 20; i++) {
                expect(prim['echo-string'](`iteration-${i}`)).toBe(`iteration-${i}`);
                expect(comp['echo-list-string'](['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
            }
        }));

        test('mixed type exports in sequence', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const prim = (instance.exports['jsco:test/echo-primitives@0.1.0']) as any;
            const comp = (instance.exports['jsco:test/echo-compound@0.1.0']) as any;
            const edge = (instance.exports['jsco:test/echo-edge-cases@0.1.0']) as any;
            const complex = (instance.exports['jsco:test/echo-complex@0.1.0']) as any;

            // Exercise different return shapes in sequence (each has different post_return)
            prim['echo-string']('hello');
            comp['echo-list-u8'](new Uint8Array([1, 2, 3]));
            comp['echo-list-string'](['a', 'b']);
            comp['echo-list-record']([{ x: 1, y: 2 }]);
            edge['echo-tuple5']([1, 2, 3, 4n, 'five']);
            edge['echo-list-option'](['x', undefined, 'y']);
            edge['echo-list-result']([{ tag: 'ok', val: 1 }]);
            edge['echo-list-tuple']([['k', 1]]);
            complex['echo-nested-lists']([[1, 2], [3]]);
            complex['echo-kitchen-sink']({
                name: 'x', values: [1], nested: [['a']], pairs: [['k', 1]],
                maybe: new Uint8Array([1]), resultField: { tag: 'ok', val: ['v'] },
            });

            // If we get here without crash, all post_return deallocations worked
            expect(prim['echo-u32'](42)).toBe(42);
        }));

        test('deeply-nested post-return deallocation stress loop', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-complex@0.1.0']) as any;

            const team = {
                name: 'Team',
                lead: {
                    name: 'Lead',
                    age: 40,
                    email: 'lead@test.com',
                    address: { street: '1 St', city: 'City', zip: '00000' },
                    tags: ['a', 'b'],
                },
                members: [
                    {
                        name: 'M1',
                        age: 20,
                        email: undefined,
                        address: { street: '2 St', city: 'Town', zip: '11111' },
                        tags: ['c'],
                    },
                    {
                        name: 'M2',
                        age: 25,
                        email: 'm2@test.com',
                        address: { street: '3 St', city: 'Village', zip: '22222' },
                        tags: ['d', 'e', 'f'],
                    },
                ],
                metadata: [['k1', 'v1'], ['k2', 'v2']],
            };

            // Repeated calls exercise post_return deallocation of deeply nested
            // Team → Person → Address → tags chains. If any inner dealloc loop
            // has wrong offsets, memory will corrupt or leak-then-OOM.
            for (let i = 0; i < 50; i++) {
                const result = ns['echo-deeply-nested'](team);
                expect(result.name).toBe('Team');
                expect(result.members).toHaveLength(2);
                expect(result.members[1].tags).toEqual(['d', 'e', 'f']);
            }
        }));

        test('list-of-records post-return deallocation stress loop', () => runWithVerbose(verbose, async () => {
            const { imports } = createEchoImports();
            const component = await createComponent(echoWasm, echoOptions(verbose));
            const instance = await component.instantiate(imports);
            const ns = (instance.exports['jsco:test/echo-complex@0.1.0']) as any;

            const people = [
                {
                    name: 'Alice',
                    age: 30,
                    email: 'alice@test.com',
                    address: { street: '1 St', city: 'A', zip: '00000' },
                    tags: ['x', 'y'],
                },
                {
                    name: 'Bob',
                    age: 25,
                    email: undefined,
                    address: { street: '2 St', city: 'B', zip: '11111' },
                    tags: ['z'],
                },
            ];

            // Repeated calls exercise post_return deallocation of list<person>
            // where each person has nested strings and a list<string> tags field.
            for (let i = 0; i < 50; i++) {
                const result = ns['echo-list-of-records'](people);
                expect(result).toHaveLength(2);
                expect(result[0].name).toBe('Alice');
                expect(result[1].tags).toEqual(['z']);
            }
        }));
    });
});
