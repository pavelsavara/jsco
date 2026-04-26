// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * WASIp3 integration tests — real WASM components from wasmtime test suite.
 *
 * These components are adapter components that import both P2 (@0.2.6) and
 * P3 (@0.3.0-rc-2026-03-15) WASI interfaces. We merge a P2 host (for the
 * adapter layer) with a P3 host (for the guest's actual P3 calls).
 */

import { createComponent } from '../../../src/resolver';
import { createWasiP2ViaP3Adapter } from '../../../src/host/wasip2-via-wasip3/index';
import { createWasiP3Host as createP3Host } from '../../../src/host/wasip3/index';
import { initializeAsserts } from '../../../src/utils/assert';
import { useVerboseOnFailure, verboseOptions, runWithVerbose } from '../../test-utils/verbose-logger';

initializeAsserts();

const WASM_DIR = './integration-tests/wasmtime/';
const RUN_EXPORT = 'wasi:cli/run@0.3.0-rc-2026-03-15';

/** Create merged P2+P3 hosts. Creates a P3 host with the given config,
 *  wraps it through the P2-via-P3 adapter for P2 keys, then merges both. */
function createMergedHosts(config?: Parameters<typeof createP3Host>[0]): Record<string, unknown> {
    const p3 = createP3Host(config);
    const p2 = createWasiP2ViaP3Adapter(p3);
    return { ...p2, ...p3 };
}

/** Create a WritableStream that collects chunks for later decoding. */
function captureStream(): { stream: WritableStream<Uint8Array>; text: () => string } {
    const chunks: Uint8Array[] = [];
    const stream = new WritableStream<Uint8Array>({
        write(chunk) { chunks.push(new Uint8Array(chunk)); },
    });
    return {
        stream,
        text: () => {
            const combined = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
            let offset = 0;
            for (const c of chunks) { combined.set(c, offset); offset += c.length; }
            return new TextDecoder().decode(combined);
        },
    };
}

describe('WASIp3 integration tests', () => {
    const verbose = useVerboseOnFailure();

    describe('random', () => {
        test('p3_big_random_buf — get 1024 random bytes', () => runWithVerbose(verbose, async () => {
            const imports = createMergedHosts();
            const component = await createComponent(
                WASM_DIR + 'p3_big_random_buf.component.wasm',
                verboseOptions(verbose),
            );
            const instance = await component.instantiate(imports);
            try {
                const run = instance.exports[RUN_EXPORT] as any;
                expect(run).toBeDefined();
                await run.run();
            } finally {
                instance.dispose();
            }
        }));

        test('p3_random_imports — all three random interfaces', () => runWithVerbose(verbose, async () => {
            const imports = createMergedHosts();
            const component = await createComponent(
                WASM_DIR + 'p3_random_imports.component.wasm',
                verboseOptions(verbose),
            );
            const instance = await component.instantiate(imports);
            try {
                const run = instance.exports[RUN_EXPORT] as any;
                expect(run).toBeDefined();
                await run.run();
            } finally {
                instance.dispose();
            }
        }));
    });

    describe('cli', () => {
        test('p3_cli_hello_stdout — writes "hello, world" to stdout', () => runWithVerbose(verbose, async () => {
            const capture = captureStream();
            const imports = createMergedHosts({ stdout: capture.stream });
            const component = await createComponent(
                WASM_DIR + 'p3_cli_hello_stdout.component.wasm',
                verboseOptions(verbose),
            );
            const instance = await component.instantiate(imports);
            try {
                const run = instance.exports[RUN_EXPORT] as any;
                expect(run).toBeDefined();
                await run.run();
                expect(capture.text()).toContain('hello, world');
            } finally {
                instance.dispose();
            }
        }));

        test('p3_cli — environment, args, terminals, stdio', () => runWithVerbose(verbose, async () => {
            // Capture stdout/stderr through the P3 WritableStream path:
            const stdoutChunks: Uint8Array[] = [];
            const stderrChunks: Uint8Array[] = [];
            const decode = (chunks: Uint8Array[]) => new TextDecoder().decode(
                chunks.reduce((acc, c) => { const r = new Uint8Array(acc.length + c.length); r.set(acc); r.set(c, acc.length); return r; }, new Uint8Array()),
            );
            const imports = createMergedHosts({
                args: ['p3_cli.component', '.'],
                env: [['TEST_KEY', 'TEST_VALUE']],
                stdout: new WritableStream<Uint8Array>({ write(chunk) { stdoutChunks.push(new Uint8Array(chunk)); } }),
                stderr: new WritableStream<Uint8Array>({ write(chunk) { stderrChunks.push(new Uint8Array(chunk)); } }),
            });
            const component = await createComponent(
                WASM_DIR + 'p3_cli.component.wasm',
                verboseOptions(verbose, { resolver: 1, executor: 1 }),
            );
            const instance = await component.instantiate(imports);
            try {
                const run = instance.exports[RUN_EXPORT] as any;
                expect(run).toBeDefined();
                await run.run();
                expect(decode(stdoutChunks)).toContain('hello stdout');
                expect(decode(stderrChunks)).toContain('hello stderr');
            } finally {
                instance.dispose();
            }
        }));
    });

    describe('clocks', () => {
        test('p3_clocks_sleep — monotonic clock sleep/wait', () => runWithVerbose(verbose, async () => {
            const imports = createMergedHosts();
            const component = await createComponent(
                WASM_DIR + 'p3_clocks_sleep.component.wasm',
                verboseOptions(verbose),
            );
            const instance = await component.instantiate(imports);
            try {
                const run = instance.exports[RUN_EXPORT] as any;
                expect(run).toBeDefined();
                await run.run();
            } finally {
                instance.dispose();
            }
        }));
    });

    describe('cli — extended', () => {
        test('p3_cli_much_stdout — repeated writes to stdout', () => runWithVerbose(verbose, async () => {
            const capture = captureStream();
            const imports = createMergedHosts({
                args: ['p3_cli_much_stdout.component', 'x', '1000'],
                stdout: capture.stream,
            });
            const component = await createComponent(
                WASM_DIR + 'p3_cli_much_stdout.component.wasm',
                verboseOptions(verbose),
            );
            const instance = await component.instantiate(imports);
            try {
                const run = instance.exports[RUN_EXPORT] as any;
                expect(run).toBeDefined();
                await run.run();
                // Guest writes "x" 1000 times
                expect(capture.text().length).toBe(1000);
                expect(capture.text()).toBe('x'.repeat(1000));
            } finally {
                instance.dispose();
            }
        }));

        test('p3_cli_read_stdin — reads "hello!" from stdin', () => runWithVerbose(verbose, async () => {
            const stdinData = new TextEncoder().encode('hello!');
            const stdinStream = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(stdinData);
                    controller.close();
                },
            });
            const imports = createMergedHosts({ stdin: stdinStream });
            const component = await createComponent(
                WASM_DIR + 'p3_cli_read_stdin.component.wasm',
                verboseOptions(verbose),
            );
            const instance = await component.instantiate(imports);
            try {
                const run = instance.exports[RUN_EXPORT] as any;
                expect(run).toBeDefined();
                await run.run();
            } finally {
                instance.dispose();
            }
        }));

        test('p3_cli_hello_stdout_post_return — writes after run returns', () => runWithVerbose(verbose, async () => {
            const capture = captureStream();
            const imports = createMergedHosts({ stdout: capture.stream });
            const component = await createComponent(
                WASM_DIR + 'p3_cli_hello_stdout_post_return.component.wasm',
                verboseOptions(verbose),
            );
            const instance = await component.instantiate(imports);
            try {
                const run = instance.exports[RUN_EXPORT] as any;
                expect(run).toBeDefined();
                await run.run();
                // At minimum, the first write should have completed before run() returns
                expect(capture.text()).toContain('hello, world');
            } finally {
                instance.dispose();
            }
        }));

        test('p3_cli_random_limits — random bytes with size arg', () => runWithVerbose(verbose, async () => {
            const imports = createMergedHosts({ args: ['p3_cli_random_limits.component', 'random', '128'] });
            const component = await createComponent(
                WASM_DIR + 'p3_cli_random_limits.component.wasm',
                verboseOptions(verbose),
            );
            const instance = await component.instantiate(imports);
            try {
                const run = instance.exports[RUN_EXPORT] as any;
                expect(run).toBeDefined();
                await run.run();
            } finally {
                instance.dispose();
            }
        }));
    });
});