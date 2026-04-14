// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * Integration tests — flat composition scenarios (A–E) and WAC composition scenarios (F–K)
 *
 * Scenario A: consumer ← JS host (direct)
 * Scenario B: consumer ← forwarder ← JS host (2-level composition)
 * Scenario C: consumer ← forwarder ← implementer (3-level, no JS WASI)
 * Scenario D: consumer ← forwarder ← forwarder ← implementer (flat, 4 components)
 * Scenario E: consumer ← forwarder ← forwarder ← host (flat, 3 components)
 * Scenario F: consumer ← forwarder ← (forwarder ← host) (inner wac-wrapped)
 * Scenario G: consumer ← (forwarder ← forwarder ← host) (wac-composed double forwarder)
 * Scenario H: consumer ← (forwarder ← (forwarder ← host)) (nested wac composition)
 * Scenario I: consumer ← (forwarder ← implementer) (wac-composed, implementer inside)
 * Scenario J: consumer ← (forwarder ← forwarder ← implementer) (wac-composed, implementer inside)
 * Scenario K: consumer ← (forwarder ← (forwarder ← implementer)) (nested wac, implementer inside)
 * Scenario L: consumer ← echo-reactor-wat + JS host (hand-written WAT with shifted indices)
 */

import { createWasiP2Host } from './index';
import { initializeAsserts } from '../../utils/assert';
import { useVerboseOnFailure, runWithVerbose } from '../../test-utils/verbose-logger';
import {
    yieldToGC, fullWasiConfig, forwardedInterfaces, implementerInterfaces,
    forwarderWasm, implementerWasm,
    wrappedForwarderWasm, doubleForwarderWasm, nestedDoubleForwarderWasm,
    forwarderImplementerWasm, doubleForwarderImplementerWasm, nestedForwarderImplementerWasm,
    echoReactorWatWasm,
    runConsumerScenario, instantiateComponent, wireExportsToImports,
} from './integration-helpers';
import type { ImportsMap } from './integration-helpers';
import isDebug from 'env:isDebug';

initializeAsserts();

describe('Integration tests (flat)', () => {
    const verbose = useVerboseOnFailure();

    afterEach(yieldToGC);

    test('Scenario A: consumer-direct', async () => runWithVerbose(verbose, async () => {
        await runConsumerScenario(
            verbose,
            async ({ wasiExports, extraImports }) => ({ ...wasiExports, ...extraImports }),
            false,
            fullWasiConfig,
        );
    }));

    test('Scenario B: consumer ← forwarder ← JS host', async () => runWithVerbose(verbose, async () => {
        await runConsumerScenario(
            verbose,
            async ({ wasiExports, extraImports }) => {
                const fwd = await instantiateComponent(forwarderWasm, { ...wasiExports, ...extraImports }, verbose);
                const consumerImports: ImportsMap = { ...wasiExports, ...extraImports };
                wireExportsToImports(fwd.exports, consumerImports, forwardedInterfaces);
                return consumerImports;
            },
            true,
            fullWasiConfig,
        );
    }));

    test('Scenario C: consumer ← forwarder ← implementer', async () => runWithVerbose(verbose, async () => {
        await runConsumerScenario(
            verbose,
            async ({ wasiExports, extraImports }) => {
                const impl = await instantiateComponent(implementerWasm, createWasiP2Host({}), verbose);

                const fwdImports: ImportsMap = { ...wasiExports, ...extraImports };
                wireExportsToImports(impl.exports, fwdImports, implementerInterfaces);
                const fwd = await instantiateComponent(forwarderWasm, fwdImports, verbose);

                const consumerImports: ImportsMap = { ...wasiExports, ...extraImports };
                wireExportsToImports(fwd.exports, consumerImports, forwardedInterfaces);
                return consumerImports;
            },
            true,
        );
    }));

    test('Scenario D: consumer ← fwd ← fwd ← implementer (flat)', async () => runWithVerbose(verbose, async () => {
        await runConsumerScenario(
            verbose,
            async ({ wasiExports, extraImports }) => {
                const impl = await instantiateComponent(implementerWasm, createWasiP2Host({}), verbose);

                const fwd2Imports: ImportsMap = { ...wasiExports, ...extraImports };
                wireExportsToImports(impl.exports, fwd2Imports, implementerInterfaces);
                const fwd2 = await instantiateComponent(forwarderWasm, fwd2Imports, verbose);

                const fwd1Imports: ImportsMap = { ...wasiExports, ...extraImports };
                wireExportsToImports(fwd2.exports, fwd1Imports, forwardedInterfaces);
                const fwd1 = await instantiateComponent(forwarderWasm, fwd1Imports, verbose);

                const consumerImports: ImportsMap = { ...wasiExports, ...extraImports };
                wireExportsToImports(fwd1.exports, consumerImports, forwardedInterfaces);
                return consumerImports;
            },
            2,
        );
    }));

    test('Scenario E: consumer ← fwd ← fwd ← host (flat)', async () => runWithVerbose(verbose, async () => {
        await runConsumerScenario(
            verbose,
            async ({ wasiExports, extraImports }) => {
                const fwd2 = await instantiateComponent(forwarderWasm, { ...wasiExports, ...extraImports }, verbose);

                const fwd1Imports: ImportsMap = { ...wasiExports, ...extraImports };
                wireExportsToImports(fwd2.exports, fwd1Imports, forwardedInterfaces);
                const fwd1 = await instantiateComponent(forwarderWasm, fwd1Imports, verbose);

                const consumerImports: ImportsMap = { ...wasiExports, ...extraImports };
                wireExportsToImports(fwd1.exports, consumerImports, forwardedInterfaces);
                return consumerImports;
            },
            2,
            fullWasiConfig,
        );
    }));
});

describe('Integration tests (WAC compositions)', () => {
    const verbose = useVerboseOnFailure();

    test('Scenario F: consumer ← fwd ← (fwd ← host) wac-wrapped', async () => runWithVerbose(verbose, async () => {
        let wrappedStats;
        let fwdStats;
        await runConsumerScenario(
            verbose,
            async ({ wasiExports, extraImports }) => {
                const wrapped = await instantiateComponent(wrappedForwarderWasm, { ...wasiExports, ...extraImports }, verbose);
                wrappedStats = wrapped.stats;

                const fwdImports: ImportsMap = { ...wasiExports, ...extraImports };
                wireExportsToImports(wrapped.exports, fwdImports, forwardedInterfaces);
                const fwd = await instantiateComponent(forwarderWasm, fwdImports, verbose);
                fwdStats = fwd.stats;

                const consumerImports: ImportsMap = { ...wasiExports, ...extraImports };
                wireExportsToImports(fwd.exports, consumerImports, forwardedInterfaces);
                return consumerImports;
            },
            2,
            fullWasiConfig,
        );
        // wrapped-forwarder: 14 scoped contexts, 63 instance cache hits, 123 core instance cache hits
        if (isDebug) {
            expect(wrappedStats!.createScopedResolverContext).toBe(14);
            expect(wrappedStats!.componentSectionCacheHits).toBe(0);
            expect(wrappedStats!.componentInstanceCacheHits).toBe(63);
            expect(wrappedStats!.coreInstanceCacheHits).toBe(154);
            // plain forwarder: 13 unique sub-components, 42 instance cache hits
            expect(fwdStats!.createScopedResolverContext).toBe(13);
            expect(fwdStats!.componentInstanceCacheHits).toBe(51);
        }
    }));

    test('Scenario G: consumer ← (fwd ← fwd ← host) wac-composed', async () => runWithVerbose(verbose, async () => {
        let dblStats;
        await runConsumerScenario(
            verbose,
            async ({ wasiExports, extraImports }) => {
                const dbl = await instantiateComponent(doubleForwarderWasm, { ...wasiExports, ...extraImports }, verbose);
                dblStats = dbl.stats;
                const consumerImports: ImportsMap = { ...wasiExports, ...extraImports };
                wireExportsToImports(dbl.exports, consumerImports, forwardedInterfaces);
                return consumerImports;
            },
            2,
            fullWasiConfig,
        );
        // double-forwarder: 14 scoped contexts, 1 section cache hit, 80 instance cache hits
        if (isDebug) {
            expect(dblStats!.createScopedResolverContext).toBe(14);
            expect(dblStats!.componentSectionCacheHits).toBe(1);
            expect(dblStats!.componentInstanceCacheHits).toBe(80);
            expect(dblStats!.coreInstanceCacheHits).toBe(154);
        }
    }));

    test('Scenario H: consumer ← (fwd ← (fwd ← host)) nested wac', async () => runWithVerbose(verbose, async () => {
        let nestedStats;
        await runConsumerScenario(
            verbose,
            async ({ wasiExports, extraImports }) => {
                const nested = await instantiateComponent(nestedDoubleForwarderWasm, { ...wasiExports, ...extraImports }, verbose);
                nestedStats = nested.stats;
                const consumerImports: ImportsMap = { ...wasiExports, ...extraImports };
                wireExportsToImports(nested.exports, consumerImports, forwardedInterfaces);
                return consumerImports;
            },
            2,
            fullWasiConfig,
        );
        // nested-double-forwarder: 29 scoped contexts, 143 instance cache hits
        if (isDebug) {
            expect(nestedStats!.createScopedResolverContext).toBe(29);
            expect(nestedStats!.componentSectionCacheHits).toBe(0);
            expect(nestedStats!.componentInstanceCacheHits).toBe(143);
            expect(nestedStats!.coreInstanceCacheHits).toBe(308);
        }
    }));

    test('Scenario I: consumer ← (fwd ← implementer) wac-composed', async () => runWithVerbose(verbose, async () => {
        let composedStats;
        await runConsumerScenario(
            verbose,
            async ({ wasiExports, extraImports }) => {
                const composed = await instantiateComponent(forwarderImplementerWasm, { ...wasiExports, ...extraImports }, verbose);
                composedStats = composed.stats;
                const consumerImports: ImportsMap = { ...wasiExports, ...extraImports };
                wireExportsToImports(composed.exports, consumerImports, forwardedInterfaces);
                return consumerImports;
            },
            true,
        );
        // forwarder-implementer: 27 scoped contexts, 73 instance cache hits
        if (isDebug) {
            expect(composedStats!.createScopedResolverContext).toBe(27);
            expect(composedStats!.componentSectionCacheHits).toBe(0);
            expect(composedStats!.componentInstanceCacheHits).toBe(73);
            expect(composedStats!.coreInstanceCacheHits).toBe(228);
        }
    }));

    test('Scenario J: consumer ← (fwd ← fwd ← implementer) wac-composed', async () => runWithVerbose(verbose, async () => {
        let composedStats;
        await runConsumerScenario(
            verbose,
            async ({ wasiExports, extraImports }) => {
                const composed = await instantiateComponent(doubleForwarderImplementerWasm, { ...wasiExports, ...extraImports }, verbose);
                composedStats = composed.stats;
                const consumerImports: ImportsMap = { ...wasiExports, ...extraImports };
                wireExportsToImports(composed.exports, consumerImports, forwardedInterfaces);
                return consumerImports;
            },
            2,
        );
        // double-forwarder-implementer: 27 scoped contexts, 1 section cache hit, 90 instance cache hits
        if (isDebug) {
            expect(composedStats!.createScopedResolverContext).toBe(27);
            expect(composedStats!.componentSectionCacheHits).toBe(1);
            expect(composedStats!.componentInstanceCacheHits).toBe(90);
            expect(composedStats!.coreInstanceCacheHits).toBe(228);
        }
    }));

    test('Scenario K: consumer ← (fwd ← (fwd ← implementer)) nested wac', async () => runWithVerbose(verbose, async () => {
        let nestedStats;
        await runConsumerScenario(
            verbose,
            async ({ wasiExports, extraImports }) => {
                const nested = await instantiateComponent(nestedForwarderImplementerWasm, { ...wasiExports, ...extraImports }, verbose);
                nestedStats = nested.stats;
                const consumerImports: ImportsMap = { ...wasiExports, ...extraImports };
                wireExportsToImports(nested.exports, consumerImports, forwardedInterfaces);
                return consumerImports;
            },
            2,
        );
        // nested-forwarder-implementer: 42 scoped contexts, 153 instance cache hits
        if (isDebug) {
            expect(nestedStats!.createScopedResolverContext).toBe(42);
            expect(nestedStats!.componentSectionCacheHits).toBe(0);
            expect(nestedStats!.componentInstanceCacheHits).toBe(153);
            expect(nestedStats!.coreInstanceCacheHits).toBe(382);
        }
    }));

    test('Scenario L: consumer ← echo-reactor-wat + JS host', async () => runWithVerbose(verbose, async () => {
        const echoInterfaces = [
            'jsco:test/echo-primitives', 'jsco:test/echo-compound', 'jsco:test/echo-algebraic',
        ];
        await runConsumerScenario(
            verbose,
            async ({ wasiExports, extraImports }) => {
                const echoWat = await instantiateComponent(echoReactorWatWasm, {}, verbose);
                const consumerImports: ImportsMap = { ...wasiExports, ...extraImports };
                wireExportsToImports(echoWat.exports, consumerImports, echoInterfaces);
                return consumerImports;
            },
            false,
            fullWasiConfig,
        );
    }));

});
