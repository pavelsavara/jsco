// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { initializeAsserts } from '../../src/utils/assert';
initializeAsserts();

import { createComponent } from '../../src/index';
import { useVerboseOnFailure, verboseOptions, runWithVerbose } from '../test-utils/verbose-logger';

const INNER_WASM = './integration-tests/own-roundtrip-p3-wat/inner.wasm';
const OUTER_WASM = './integration-tests/own-roundtrip-p3-wat/outer.wasm';

const IFACE = 'test:s6/iface@0.1.0';
const OUTER_IFACE = 'test:s6/outer@0.1.0';

const syncOptions = (verbose: ReturnType<typeof useVerboseOnFailure>) => ({ noJspi: true as const, ...verboseOptions(verbose) });

type IfaceNs = {
    ConstructorR: (rep: number) => unknown;
    MethodRGetRep: (self: unknown) => number;
    ResourceDropR: (self: unknown) => void;
    innerFn: (r: unknown) => unknown;
};

type OuterNs = {
    roundtrip: (h: unknown) => unknown;
    reconstitute: (h: unknown) => unknown;
};

describe('S6 — cross-instance own<R> ownership', () => {
    const verbose = useVerboseOnFailure();

    test('inner: constructor creates resource, get-rep reads back rep value', () => runWithVerbose(verbose, async () => {
        const innerComp = await createComponent(INNER_WASM, syncOptions(verbose));
        const inner = await innerComp.instantiate({});
        const iface = inner.exports[IFACE] as IfaceNs;

        const r = iface.ConstructorR(42);
        expect(iface.MethodRGetRep(r)).toBe(42);

        inner.dispose();
    }));

    test('inner: inner-fn passes resource through unchanged', () => runWithVerbose(verbose, async () => {
        const innerComp = await createComponent(INNER_WASM, syncOptions(verbose));
        const inner = await innerComp.instantiate({});
        const iface = inner.exports[IFACE] as IfaceNs;

        const r = iface.ConstructorR(77);
        const r2 = iface.innerFn(r);
        expect(iface.MethodRGetRep(r2)).toBe(77);

        inner.dispose();
    }));

    test('roundtrip: outer passes resource through inner-fn, correct value returns', () => runWithVerbose(verbose, async () => {
        const innerComp = await createComponent(INNER_WASM, syncOptions(verbose));
        const outerComp = await createComponent(OUTER_WASM, syncOptions(verbose));

        const inner = await innerComp.instantiate({});
        const outer = await outerComp.instantiate({
            [IFACE]: inner.exports[IFACE],
        });

        const iface = inner.exports[IFACE] as IfaceNs;
        const outerNs = outer.exports[OUTER_IFACE] as OuterNs;

        const r = iface.ConstructorR(42);
        const r2 = outerNs.roundtrip(r);
        expect(iface.MethodRGetRep(r2)).toBe(42);

        outer.dispose();
        inner.dispose();
    }));

    test('reconstitute: original dropped, fresh R with rep=999 returned', () => runWithVerbose(verbose, async () => {
        const innerComp = await createComponent(INNER_WASM, syncOptions(verbose));
        const outerComp = await createComponent(OUTER_WASM, syncOptions(verbose));

        const inner = await innerComp.instantiate({});
        const outer = await outerComp.instantiate({
            [IFACE]: inner.exports[IFACE],
        });

        const iface = inner.exports[IFACE] as IfaceNs;
        const outerNs = outer.exports[OUTER_IFACE] as OuterNs;

        const r = iface.ConstructorR(42);
        const r2 = outerNs.reconstitute(r);
        // The reconstitute function drops the input and creates a new R with rep=999
        expect(iface.MethodRGetRep(r2)).toBe(999);

        outer.dispose();
        inner.dispose();
    }));

    test('multiple roundtrips: repeated calls produce correct results', () => runWithVerbose(verbose, async () => {
        const innerComp = await createComponent(INNER_WASM, syncOptions(verbose));
        const outerComp = await createComponent(OUTER_WASM, syncOptions(verbose));

        const inner = await innerComp.instantiate({});
        const outer = await outerComp.instantiate({
            [IFACE]: inner.exports[IFACE],
        });

        const iface = inner.exports[IFACE] as IfaceNs;
        const outerNs = outer.exports[OUTER_IFACE] as OuterNs;

        for (const rep of [1, 100, 999, 0, 2147483647]) {
            const r = iface.ConstructorR(rep);
            const r2 = outerNs.roundtrip(r);
            expect(iface.MethodRGetRep(r2)).toBe(rep);
        }

        outer.dispose();
        inner.dispose();
    }));

    test('cascade dispose: outer then inner disposes without crash', () => runWithVerbose(verbose, async () => {
        const innerComp = await createComponent(INNER_WASM, syncOptions(verbose));
        const outerComp = await createComponent(OUTER_WASM, syncOptions(verbose));

        const inner = await innerComp.instantiate({});
        const outer = await outerComp.instantiate({
            [IFACE]: inner.exports[IFACE],
        });

        const iface = inner.exports[IFACE] as IfaceNs;
        const outerNs = outer.exports[OUTER_IFACE] as OuterNs;

        // Create and roundtrip a resource, don't explicitly drop it
        const r = iface.ConstructorR(7);
        const r2 = outerNs.roundtrip(r);
        expect(iface.MethodRGetRep(r2)).toBe(7);

        // Dispose both — must not crash or double-free
        expect(() => outer.dispose()).not.toThrow();
        expect(() => inner.dispose()).not.toThrow();

        // Double dispose is idempotent
        expect(() => outer.dispose()).not.toThrow();
        expect(() => inner.dispose()).not.toThrow();
    }));
});
