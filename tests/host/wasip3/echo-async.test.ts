// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

/**
 * Integration test for the first slice of `jsco:test/echo-async@0.1.0`
 * (declared in wit/jsco-echo.wit) as implemented by the WAT component
 * at integration-tests/echo-async-p3-wat/echo-async-p3.wat.
 *
 * Covers the three `error-context` canon built-ins implemented in
 * src/resolver/core-functions.ts and the per-instance handle table in
 * src/runtime/error-context.ts.
 *
 * Streams, futures, async-lifted exports, async-lowered imports and
 * subtask.cancel will be added in sibling WAT components per the
 * one-feature-per-WAT pattern used by dispose-async-p3-wat /
 * multi-async-p3-wat.
 */

import { initializeAsserts } from '../../../src/utils/assert';
initializeAsserts();

import { createComponent } from '../../../src/index';
import { useVerboseOnFailure, verboseOptions, runWithVerbose } from '../../test-utils/verbose-logger';

const echoAsyncWasm = './integration-tests/echo-async-p3-wat/echo-async-p3.wasm';

type EchoAsyncNs = {
    makeErrorContext: (message: string) => unknown;
    echoErrorContext: (e: unknown) => unknown;
    dropErrorContext: (e: unknown) => void;
};

const syncOptions = (verbose: ReturnType<typeof useVerboseOnFailure>) => ({ noJspi: true as const, ...verboseOptions(verbose) });

describe('echo-async-p3-wat (error-context slice)', () => {
    const verbose = useVerboseOnFailure();

    test('make-error-context returns a JS value carrying the debug message', () => runWithVerbose(verbose, async () => {
        const component = await createComponent(echoAsyncWasm, syncOptions(verbose));
        const instance = await component.instantiate();
        try {
            const ns = instance.exports['jsco:test/echo-async@0.1.0'] as EchoAsyncNs;

            const ec = ns.makeErrorContext('hello from jsco') as { debugMessage: string };
            expect(ec).toBeDefined();
            expect(typeof ec).toBe('object');
            expect(ec.debugMessage).toBe('hello from jsco');
        } finally {
            instance.dispose();
        }
    }));

    test('make-error-context handles empty and unicode messages', () => runWithVerbose(verbose, async () => {
        const component = await createComponent(echoAsyncWasm, syncOptions(verbose));
        const instance = await component.instantiate();
        try {
            const ns = instance.exports['jsco:test/echo-async@0.1.0'] as EchoAsyncNs;

            const empty = ns.makeErrorContext('') as { debugMessage: string };
            expect(empty.debugMessage).toBe('');

            const unicode = ns.makeErrorContext('💥 boom: 日本語') as { debugMessage: string };
            expect(unicode.debugMessage).toBe('💥 boom: 日本語');
        } finally {
            instance.dispose();
        }
    }));

    test('make-error-context produces distinct values for each call', () => runWithVerbose(verbose, async () => {
        const component = await createComponent(echoAsyncWasm, syncOptions(verbose));
        const instance = await component.instantiate();
        try {
            const ns = instance.exports['jsco:test/echo-async@0.1.0'] as EchoAsyncNs;

            const a = ns.makeErrorContext('first') as { debugMessage: string };
            const b = ns.makeErrorContext('second') as { debugMessage: string };
            expect(a).not.toBe(b);
            expect(a.debugMessage).toBe('first');
            expect(b.debugMessage).toBe('second');
        } finally {
            instance.dispose();
        }
    }));

    test('echo-error-context round-trips a JS-supplied error-context value', () => runWithVerbose(verbose, async () => {
        const component = await createComponent(echoAsyncWasm, syncOptions(verbose));
        const instance = await component.instantiate();
        try {
            const ns = instance.exports['jsco:test/echo-async@0.1.0'] as EchoAsyncNs;

            // The lift wrapper inserts the JS value into the table; the
            // guest returns the same handle; the lower wrapper extracts
            // the original JS value. End-to-end the host should see the
            // exact same reference back.
            const original = new Error('round-trip me');
            const echoed = ns.echoErrorContext(original);
            expect(echoed).toBe(original);

            const plain = { debugMessage: 'plain object' };
            expect(ns.echoErrorContext(plain)).toBe(plain);
        } finally {
            instance.dispose();
        }
    }));

    test('drop-error-context invokes error-context.drop without throwing', () => runWithVerbose(verbose, async () => {
        const component = await createComponent(echoAsyncWasm, syncOptions(verbose));
        const instance = await component.instantiate();
        try {
            const ns = instance.exports['jsco:test/echo-async@0.1.0'] as EchoAsyncNs;

            // The lift wrapper inserts the value; the guest immediately
            // calls error-context.drop on the resulting handle. After
            // this the table no longer holds the value.
            expect(() => ns.dropErrorContext(new Error('to be dropped'))).not.toThrow();
        } finally {
            instance.dispose();
        }
    }));

    test('round-tripping the result of make-error-context preserves identity', () => runWithVerbose(verbose, async () => {
        const component = await createComponent(echoAsyncWasm, syncOptions(verbose));
        const instance = await component.instantiate();
        try {
            const ns = instance.exports['jsco:test/echo-async@0.1.0'] as EchoAsyncNs;

            const ec = ns.makeErrorContext('chain me') as { debugMessage: string };
            const echoed = ns.echoErrorContext(ec);
            expect(echoed).toBe(ec);
            expect((echoed as { debugMessage: string }).debugMessage).toBe('chain me');
        } finally {
            instance.dispose();
        }
    }));
});
