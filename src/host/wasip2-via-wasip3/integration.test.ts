// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * Integration tests through the P2-via-P3 adapter — flat and WAC composition scenarios.
 * Mirrors wasip2/integration.test.ts but uses the adapter pipeline.
 *
 * Scenario A: consumer ← JS host (adapter)
 * Scenario B: consumer ← forwarder ← JS host (adapter)
 * Scenario C: consumer ← forwarder ← implementer
 * Scenario D: consumer ← fwd ← fwd ← implementer (flat)
 * Scenario E: consumer ← fwd ← fwd ← host (adapter, flat)
 * Scenario F: consumer ← fwd ← (fwd ← host) (inner wac-wrapped)
 * Scenario G: consumer ← (fwd ← fwd ← host) (wac-composed double forwarder)
 * Scenario H: consumer ← (fwd ← (fwd ← host)) (nested wac composition)
 * Scenario I: consumer ← (fwd ← implementer) (wac-composed)
 * Scenario J: consumer ← (fwd ← fwd ← implementer) (wac-composed)
 * Scenario K: consumer ← (fwd ← (fwd ← implementer)) (nested wac)
 * Scenario L: consumer ← echo-reactor-wat + JS host (adapter)
 */

import { initializeAsserts } from '../../utils/assert';
import { useVerboseOnFailure, runWithVerbose } from '../../test-utils/verbose-logger';
import {
    yieldToGC, fullWasiConfig, forwardedInterfaces, implementerInterfaces,
    forwarderWasm, implementerWasm,
    wrappedForwarderWasm, doubleForwarderWasm, nestedDoubleForwarderWasm,
    forwarderImplementerWasm, doubleForwarderImplementerWasm, nestedForwarderImplementerWasm,
    echoReactorWatWasm,
    runConsumerScenario, instantiateComponent, wireExportsToImports,
    createMinimalAdapterWasiExports,
} from './integration-helpers';
import type { ImportsMap } from './integration-helpers';

initializeAsserts();

describe('Integration tests via P3 adapter (flat)', () => {
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
                const impl = await instantiateComponent(implementerWasm, createMinimalAdapterWasiExports(), verbose);

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
                const impl = await instantiateComponent(implementerWasm, createMinimalAdapterWasiExports(), verbose);

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

describe('Integration tests via P3 adapter (WAC compositions)', () => {
    const verbose = useVerboseOnFailure();

    test('Scenario F: consumer ← fwd ← (fwd ← host) wac-wrapped', async () => runWithVerbose(verbose, async () => {
        await runConsumerScenario(
            verbose,
            async ({ wasiExports, extraImports }) => {
                const wrapped = await instantiateComponent(wrappedForwarderWasm, { ...wasiExports, ...extraImports }, verbose);

                const fwdImports: ImportsMap = { ...wasiExports, ...extraImports };
                wireExportsToImports(wrapped.exports, fwdImports, forwardedInterfaces);
                const fwd = await instantiateComponent(forwarderWasm, fwdImports, verbose);

                const consumerImports: ImportsMap = { ...wasiExports, ...extraImports };
                wireExportsToImports(fwd.exports, consumerImports, forwardedInterfaces);
                return consumerImports;
            },
            2,
            fullWasiConfig,
        );
    }));

    test('Scenario G: consumer ← (fwd ← fwd ← host) wac-composed', async () => runWithVerbose(verbose, async () => {
        await runConsumerScenario(
            verbose,
            async ({ wasiExports, extraImports }) => {
                const dbl = await instantiateComponent(doubleForwarderWasm, { ...wasiExports, ...extraImports }, verbose);
                const consumerImports: ImportsMap = { ...wasiExports, ...extraImports };
                wireExportsToImports(dbl.exports, consumerImports, forwardedInterfaces);
                return consumerImports;
            },
            2,
            fullWasiConfig,
        );
    }));

    test('Scenario H: consumer ← (fwd ← (fwd ← host)) nested wac', async () => runWithVerbose(verbose, async () => {
        await runConsumerScenario(
            verbose,
            async ({ wasiExports, extraImports }) => {
                const nested = await instantiateComponent(nestedDoubleForwarderWasm, { ...wasiExports, ...extraImports }, verbose);
                const consumerImports: ImportsMap = { ...wasiExports, ...extraImports };
                wireExportsToImports(nested.exports, consumerImports, forwardedInterfaces);
                return consumerImports;
            },
            2,
            fullWasiConfig,
        );
    }));

    test('Scenario I: consumer ← (fwd ← implementer) wac-composed', async () => runWithVerbose(verbose, async () => {
        await runConsumerScenario(
            verbose,
            async ({ wasiExports, extraImports }) => {
                const composed = await instantiateComponent(forwarderImplementerWasm, { ...wasiExports, ...extraImports }, verbose);
                const consumerImports: ImportsMap = { ...wasiExports, ...extraImports };
                wireExportsToImports(composed.exports, consumerImports, forwardedInterfaces);
                return consumerImports;
            },
            true,
        );
    }));

    test('Scenario J: consumer ← (fwd ← fwd ← implementer) wac-composed', async () => runWithVerbose(verbose, async () => {
        await runConsumerScenario(
            verbose,
            async ({ wasiExports, extraImports }) => {
                const composed = await instantiateComponent(doubleForwarderImplementerWasm, { ...wasiExports, ...extraImports }, verbose);
                const consumerImports: ImportsMap = { ...wasiExports, ...extraImports };
                wireExportsToImports(composed.exports, consumerImports, forwardedInterfaces);
                return consumerImports;
            },
            2,
        );
    }));

    test('Scenario K: consumer ← (fwd ← (fwd ← implementer)) nested wac', async () => runWithVerbose(verbose, async () => {
        await runConsumerScenario(
            verbose,
            async ({ wasiExports, extraImports }) => {
                const nested = await instantiateComponent(nestedForwarderImplementerWasm, { ...wasiExports, ...extraImports }, verbose);
                const consumerImports: ImportsMap = { ...wasiExports, ...extraImports };
                wireExportsToImports(nested.exports, consumerImports, forwardedInterfaces);
                return consumerImports;
            },
            2,
        );
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
