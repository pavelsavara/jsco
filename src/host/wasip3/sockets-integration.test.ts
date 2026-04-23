// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * WASIp3 socket integration tests — real WASM components from wasmtime test suite.
 *
 * These tests exercise the Node.js TCP/UDP socket and DNS implementations
 * against the wasmtime conformance test binaries. Each component is
 * self-contained: it creates sockets, binds to localhost:0 (ephemeral port),
 * connects, sends/receives data, and asserts correctness internally.
 * Exit code 0 = pass.
 *
 * Requires Node.js (real sockets via node:net / node:dgram / node:dns).
 */

import { createComponent } from '../../resolver';
import { createWasiP2ViaP3Adapter } from '../wasip2-via-wasip3/index';
import { createWasiP3Host } from './node/wasip3';
import { initializeAsserts } from '../../utils/assert';
import { useVerboseOnFailure, verboseOptions, runWithVerbose } from '../../test-utils/verbose-logger';
import type { JsImports } from '../../resolver/api-types';

initializeAsserts();

const WASM_DIR = './integration-tests/wasmtime/';
const RUN_EXPORT = 'wasi:cli/run@0.3.0-rc-2026-03-15';

/**
 * Create merged P2+P3 hosts with real Node.js socket implementations.
 * Uses the Node.js P3 host (which overrides browser stubs with real TCP/UDP/DNS)
 * and wraps it through the P2-via-P3 adapter for P2 interface keys.
 * Sinks stdout/stderr to suppress noisy Rust println! output from test programs.
 */
function createMergedHosts(): Record<string, unknown> {
    const noop = () => new WritableStream<Uint8Array>({ write() { /* suppress */ } });
    const p3 = createWasiP3Host({ stdout: noop(), stderr: noop() });
    const p2 = createWasiP2ViaP3Adapter(p3 as unknown as JsImports);
    return { ...p2, ...p3 as unknown as Record<string, unknown> };
}

describe('WASIp3 socket integration tests (Node.js)', () => {
    const verbose = useVerboseOnFailure();

    describe('TCP', () => {
        test('p3_sockets_tcp_sample_application — full TCP client/server round-trip', () => runWithVerbose(verbose, async () => {
            const imports = createMergedHosts();
            const component = await createComponent(
                WASM_DIR + 'p3_sockets_tcp_sample_application.component.wasm',
                verboseOptions(verbose),
            );
            const instance = await component.instantiate(imports);
            const run = instance.exports[RUN_EXPORT] as any;
            expect(run).toBeDefined();
            await run.run();
        }));

        test('p3_sockets_tcp_bind — bind to ephemeral and specific ports', () => runWithVerbose(verbose, async () => {
            const imports = createMergedHosts();
            const component = await createComponent(
                WASM_DIR + 'p3_sockets_tcp_bind.component.wasm',
                verboseOptions(verbose),
            );
            const instance = await component.instantiate(imports);
            const run = instance.exports[RUN_EXPORT] as any;
            expect(run).toBeDefined();
            await run.run();
        }));

        test('p3_sockets_tcp_connect — connect validation and dual-stack', () => runWithVerbose(verbose, async () => {
            const imports = createMergedHosts();
            const component = await createComponent(
                WASM_DIR + 'p3_sockets_tcp_connect.component.wasm',
                verboseOptions(verbose),
            );
            const instance = await component.instantiate(imports);
            const run = instance.exports[RUN_EXPORT] as any;
            expect(run).toBeDefined();
            await run.run();
        }));

        test('p3_sockets_tcp_listen — listen and accept connections', () => runWithVerbose(verbose, async () => {
            const imports = createMergedHosts();
            const component = await createComponent(
                WASM_DIR + 'p3_sockets_tcp_listen.component.wasm',
                verboseOptions(verbose),
            );
            const instance = await component.instantiate(imports);
            const run = instance.exports[RUN_EXPORT] as any;
            expect(run).toBeDefined();
            await run.run();
        }));

        test.skip('p3_sockets_tcp_streams — send and receive data streams', () => runWithVerbose(verbose, async () => {
            const imports = createMergedHosts();
            const component = await createComponent(
                WASM_DIR + 'p3_sockets_tcp_streams.component.wasm',
                verboseOptions(verbose),
            );
            const instance = await component.instantiate(imports);
            const run = instance.exports[RUN_EXPORT] as any;
            expect(run).toBeDefined();
            await run.run();
        }));

        test('p3_sockets_tcp_states — socket state transitions', () => runWithVerbose(verbose, async () => {
            const imports = createMergedHosts();
            const component = await createComponent(
                WASM_DIR + 'p3_sockets_tcp_states.component.wasm',
                verboseOptions(verbose),
            );
            const instance = await component.instantiate(imports);
            const run = instance.exports[RUN_EXPORT] as any;
            expect(run).toBeDefined();
            await run.run();
        }));

        test('p3_sockets_tcp_sockopts — socket option get/set', () => runWithVerbose(verbose, async () => {
            const imports = createMergedHosts();
            const component = await createComponent(
                WASM_DIR + 'p3_sockets_tcp_sockopts.component.wasm',
                verboseOptions(verbose),
            );
            const instance = await component.instantiate(imports);
            const run = instance.exports[RUN_EXPORT] as any;
            expect(run).toBeDefined();
            await run.run();
        }));
    });

    describe('UDP', () => {
        test('p3_sockets_udp_sample_application — full UDP client/server round-trip', () => runWithVerbose(verbose, async () => {
            const imports = createMergedHosts();
            const component = await createComponent(
                WASM_DIR + 'p3_sockets_udp_sample_application.component.wasm',
                verboseOptions(verbose),
            );
            const instance = await component.instantiate(imports);
            const run = instance.exports[RUN_EXPORT] as any;
            expect(run).toBeDefined();
            await run.run();
        }));

        test('p3_sockets_udp_bind — bind to ephemeral and specific ports', () => runWithVerbose(verbose, async () => {
            const imports = createMergedHosts();
            const component = await createComponent(
                WASM_DIR + 'p3_sockets_udp_bind.component.wasm',
                verboseOptions(verbose),
            );
            const instance = await component.instantiate(imports);
            const run = instance.exports[RUN_EXPORT] as any;
            expect(run).toBeDefined();
            await run.run();
        }));

        test('p3_sockets_udp_connect — connect and disconnect', () => runWithVerbose(verbose, async () => {
            const imports = createMergedHosts();
            const component = await createComponent(
                WASM_DIR + 'p3_sockets_udp_connect.component.wasm',
                verboseOptions(verbose),
            );
            const instance = await component.instantiate(imports);
            const run = instance.exports[RUN_EXPORT] as any;
            expect(run).toBeDefined();
            await run.run();
        }));

        test('p3_sockets_udp_send — send datagrams', () => runWithVerbose(verbose, async () => {
            const imports = createMergedHosts();
            const component = await createComponent(
                WASM_DIR + 'p3_sockets_udp_send.component.wasm',
                verboseOptions(verbose),
            );
            const instance = await component.instantiate(imports);
            const run = instance.exports[RUN_EXPORT] as any;
            expect(run).toBeDefined();
            await run.run();
        }));

        test('p3_sockets_udp_receive — receive datagrams', () => runWithVerbose(verbose, async () => {
            const imports = createMergedHosts();
            const component = await createComponent(
                WASM_DIR + 'p3_sockets_udp_receive.component.wasm',
                verboseOptions(verbose),
            );
            const instance = await component.instantiate(imports);
            const run = instance.exports[RUN_EXPORT] as any;
            expect(run).toBeDefined();
            await run.run();
        }));

        test('p3_sockets_udp_states — socket state transitions', () => runWithVerbose(verbose, async () => {
            const imports = createMergedHosts();
            const component = await createComponent(
                WASM_DIR + 'p3_sockets_udp_states.component.wasm',
                verboseOptions(verbose),
            );
            const instance = await component.instantiate(imports);
            const run = instance.exports[RUN_EXPORT] as any;
            expect(run).toBeDefined();
            await run.run();
        }));

        test('p3_sockets_udp_sockopts — socket option get/set', () => runWithVerbose(verbose, async () => {
            const imports = createMergedHosts();
            const component = await createComponent(
                WASM_DIR + 'p3_sockets_udp_sockopts.component.wasm',
                verboseOptions(verbose),
            );
            const instance = await component.instantiate(imports);
            const run = instance.exports[RUN_EXPORT] as any;
            expect(run).toBeDefined();
            await run.run();
        }));
    });

    describe('DNS', () => {
        test('p3_sockets_ip_name_lookup — resolve localhost', () => runWithVerbose(verbose, async () => {
            const imports = createMergedHosts();
            const component = await createComponent(
                WASM_DIR + 'p3_sockets_ip_name_lookup.component.wasm',
                verboseOptions(verbose),
            );
            const instance = await component.instantiate(imports);
            const run = instance.exports[RUN_EXPORT] as any;
            expect(run).toBeDefined();
            await run.run();
        }));
    });
});
