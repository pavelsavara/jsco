// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * JS implementation of echo interfaces.
 *
 * All echo values are round-tripped through JSON.parse(JSON.stringify())
 * with custom replacer/reviver to handle BigInt and Uint8Array.
 * This exercises the component model's type marshalling more thoroughly
 * than simple identity pass-through.
 */

// --- JSON round-trip helpers ---

function replacer(_key: string, value: unknown): unknown {
    if (typeof value === 'bigint') {
        return { __bigint: value.toString() };
    }
    if (value instanceof Uint8Array) {
        return { __uint8array: Array.from(value) };
    }
    return value;
}

function reviver(_key: string, value: unknown): unknown {
    if (value && typeof value === 'object' && '__bigint' in value) {
        return BigInt((value as Record<string, string>).__bigint!);
    }
    if (value && typeof value === 'object' && '__uint8array' in value) {
        return new Uint8Array((value as Record<string, number[]>).__uint8array!);
    }
    return value;
}

function jsonEcho<T>(v: T): T {
    return JSON.parse(JSON.stringify(v, replacer), reviver) as T;
}

// --- Echo interface implementations ---

export type ImportsMap = Record<string, Record<string, Function>>;

export function createEchoImports(): ImportsMap {
    const echoPrimitivesImport = {
        'echo-bool': (v: boolean) => jsonEcho(v),
        'echo-u8': (v: number) => jsonEcho(v),
        'echo-u16': (v: number) => jsonEcho(v),
        'echo-u32': (v: number) => jsonEcho(v),
        'echo-u64': (v: bigint) => jsonEcho(v),
        'echo-s8': (v: number) => jsonEcho(v),
        'echo-s16': (v: number) => jsonEcho(v),
        'echo-s32': (v: number) => jsonEcho(v),
        'echo-s64': (v: bigint) => jsonEcho(v),
        'echo-f32': (v: number) => jsonEcho(v),
        'echo-f64': (v: number) => jsonEcho(v),
        'echo-char': (v: string) => jsonEcho(v),
        'echo-string': (v: string) => jsonEcho(v),
    };

    const echoCompoundImport = {
        'echo-tuple2': (v: [number, string]) => jsonEcho(v),
        'echo-tuple3': (v: [number, number, number]) => jsonEcho(v),
        'echo-record': (v: { x: number; y: number }) => jsonEcho(v),
        'echo-nested-record': (v: unknown) => jsonEcho(v),
        'echo-list-u8': (v: Uint8Array) => jsonEcho(v),
        'echo-list-string': (v: string[]) => jsonEcho(v),
        'echo-list-record': (v: unknown[]) => jsonEcho(v),
        'echo-option-u32': (v: unknown) => jsonEcho(v),
        'echo-option-string': (v: unknown) => jsonEcho(v),
        'echo-result-ok': (v: unknown) => jsonEcho(v),
    };

    const echoAlgebraicImport = {
        'echo-enum': (v: unknown) => jsonEcho(v),
        'echo-flags': (v: unknown) => jsonEcho(v),
        'echo-variant': (v: unknown) => jsonEcho(v),
    };

    const echoEdgeCasesImport = {
        'echo-result-ok-only': (v: unknown) => jsonEcho(v),
        'echo-result-err-only': (v: unknown) => jsonEcho(v),
        'echo-result-empty': (v: unknown) => jsonEcho(v),
        'echo-nested-option': (v: unknown) => jsonEcho(v),
        'echo-tuple5': (v: unknown) => jsonEcho(v),
        'echo-list-option': (v: unknown) => jsonEcho(v),
        'echo-list-result': (v: unknown) => jsonEcho(v),
        'echo-option-list': (v: unknown) => jsonEcho(v),
        'echo-list-tuple': (v: unknown) => jsonEcho(v),
        'echo-big-flags': (v: unknown) => jsonEcho(v),
        'echo-empty-list': (v: unknown) => jsonEcho(v),
        'echo-empty-string': (v: unknown) => jsonEcho(v),
        'echo-result-complex': (v: unknown) => jsonEcho(v),
    };

    const echoComplexImport = {
        'echo-deeply-nested': (v: unknown) => jsonEcho(v),
        'echo-list-of-records': (v: unknown) => jsonEcho(v),
        'echo-tuple-of-records': (v: unknown) => jsonEcho(v),
        'echo-complex-variant': (v: unknown) => jsonEcho(v),
        'echo-message': (v: unknown) => jsonEcho(v),
        'echo-kitchen-sink': (v: unknown) => jsonEcho(v),
        'echo-nested-lists': (v: unknown) => jsonEcho(v),
        'echo-option-record': (v: unknown) => jsonEcho(v),
        'echo-result-record': (v: unknown) => jsonEcho(v),
        'echo-list-of-variants': (v: unknown) => jsonEcho(v),
    };

    // Resource: accumulator — stores mutable state keyed by handle ID
    interface AccState { total: number }
    const accumulators = new Map<number, AccState>();
    let nextAccId = 1;

    // Resource: byte-buffer — stores data + read position
    interface BufState { data: Uint8Array; pos: number }
    const byteBuffers = new Map<number, BufState>();
    let nextBufId = 1;

    const echoResourcesImport = {
        '[constructor]accumulator': (initial: bigint): number => {
            const id = nextAccId++;
            accumulators.set(id, { total: Number(initial) });
            return id;
        },
        '[method]accumulator.add': (self: number, value: bigint) => {
            const acc = accumulators.get(self);
            if (acc) acc.total += Number(value);
        },
        '[method]accumulator.get-total': (self: number): bigint => {
            const acc = accumulators.get(self);
            return BigInt(acc?.total ?? 0);
        },
        '[method]accumulator.snapshot': (self: number): number => {
            const acc = accumulators.get(self);
            const id = nextAccId++;
            accumulators.set(id, { total: acc?.total ?? 0 });
            return id;
        },
        '[resource-drop]accumulator': (self: number) => {
            accumulators.delete(self);
        },
        'transform-owned': (accHandle: number): number => {
            const acc = accumulators.get(accHandle);
            const doubled = (acc?.total ?? 0) * 2;
            accumulators.delete(accHandle);
            const id = nextAccId++;
            accumulators.set(id, { total: doubled });
            return id;
        },
        'inspect-borrowed': (accHandle: number): bigint => {
            const acc = accumulators.get(accHandle);
            return BigInt(acc?.total ?? 0);
        },
        'merge-accumulators': (aHandle: number, bHandle: number): number => {
            const a = accumulators.get(aHandle);
            const b = accumulators.get(bHandle);
            const merged = (a?.total ?? 0) + (b?.total ?? 0);
            accumulators.delete(aHandle);
            accumulators.delete(bHandle);
            const id = nextAccId++;
            accumulators.set(id, { total: merged });
            return id;
        },
        '[constructor]byte-buffer': (data: Uint8Array): number => {
            const id = nextBufId++;
            byteBuffers.set(id, { data: new Uint8Array(data), pos: 0 });
            return id;
        },
        '[method]byte-buffer.read': (self: number, n: number): Uint8Array => {
            const buf = byteBuffers.get(self);
            if (!buf) return new Uint8Array(0);
            const end = Math.min(buf.pos + n, buf.data.length);
            const result = buf.data.slice(buf.pos, end);
            buf.pos = end;
            return result;
        },
        '[method]byte-buffer.remaining': (self: number): number => {
            const buf = byteBuffers.get(self);
            return buf ? buf.data.length - buf.pos : 0;
        },
        '[method]byte-buffer.is-empty': (self: number): boolean => {
            const buf = byteBuffers.get(self);
            return buf ? buf.pos >= buf.data.length : true;
        },
        '[resource-drop]byte-buffer': (self: number) => {
            byteBuffers.delete(self);
        },
        'echo-buffer': (bufHandle: number): number => {
            const buf = byteBuffers.get(bufHandle);
            const remaining = buf ? buf.data.slice(buf.pos) : new Uint8Array(0);
            byteBuffers.delete(bufHandle);
            const id = nextBufId++;
            byteBuffers.set(id, { data: remaining, pos: 0 });
            return id;
        },
    };

    return {
        'jsco:test/echo-primitives@0.1.0': echoPrimitivesImport,
        'jsco:test/echo-compound@0.1.0': echoCompoundImport,
        'jsco:test/echo-algebraic@0.1.0': echoAlgebraicImport,
        'jsco:test/echo-edge-cases@0.1.0': echoEdgeCasesImport,
        'jsco:test/echo-complex@0.1.0': echoComplexImport,
        'jsco:test/echo-resources@0.1.0': echoResourcesImport,
    };
}
