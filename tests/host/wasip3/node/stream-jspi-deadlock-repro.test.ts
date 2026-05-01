// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

/**
 * Empirical reproducer for the JSPI / `futures::join!` in-wasm-pipe
 * deadlock claim documented in `stream-jspi-deadlock.md`.
 *
 * Pattern under test (from `integration-tests/hello-p3-world/src/lib.rs`):
 *
 *     let (mut tx, rx) = wit_stream::new();
 *     futures::join!(
 *         async { wasi::cli::stdout::write_via_stream(rx).await.unwrap(); },
 *         async { tx.write(b"hello from jsco\n".to_vec()).await; drop(tx); },
 *     );
 *
 * Both arms run on a SINGLE wasm task. The "writer" arm (`tx.write`) and the
 * "consumer" arm (`stdout::write_via_stream(rx)`) are joined by an in-wasm
 * stream<u8>. The host's `write_via_stream` is a Promise-returning import:
 * if its first poll suspends the wasm task via JSPI's `Suspending` wrapper
 * before the writer arm has had a chance to push data, the join!-internal
 * stream is permanently empty and the wasm task can never be resumed.
 *
 * Watchdog: `limits.maxBlockingTimeMs` causes `withBlockingTimeout()` to
 * abort the instance with a `WebAssembly.RuntimeError("JSPI suspension
 * stalled >Nms ...")` when a single suspension exceeds the cap. This turns
 * a silent hang into an actionable, jest-detectable failure.
 *
 * Two test cases:
 *   1. WAT control — hand-written hello-p3-world (no real Rust executor);
 *      verifies the test harness, host wiring, and stdout capture path.
 *   2. Rust candidate — wit-bindgen generated, exercising the exact
 *      futures::join! pattern from the report. The OUTCOME of this test
 *      is the answer to "does jsco reproduce the deadlock?":
 *        - PASS  → jsco's WASIp3 callback-form async lift sidesteps the
 *                  pattern (the report needs a host-implementation caveat).
 *        - FAIL with "JSPI suspension stalled" → reproducer confirmed.
 */

import { instantiateWasiComponent } from '../../../../src/index';
import { initializeAsserts, LogLevel } from '../../../../src/utils/assert';
import {
    useVerboseOnFailure,
    verboseOptions,
    runWithVerbose,
} from '../../../test-utils/verbose-logger';

initializeAsserts();

const HELLO_P3_RUST_WASM = './integration-tests/hello-p3-world/hello_p3_world.wasm';
const HELLO_P3_WAT_WASM = './integration-tests/hello-p3-world-wat/hello-p3.wasm';

// Watchdog cap: well under the jest test timeout so deadlocks surface as
// a clean, attributable WebAssembly.RuntimeError instead of a jest hang.
const WATCHDOG_MS = 3000;

interface RunReport {
    runReturn?: unknown;
    threw?: { message: string; ctor: string };
    elapsedMs: number;
    stdout: string;
}

/**
 * Run the wasi:cli/run.run() entry of `wasm`, capturing stdout and timing,
 * with a watchdog cap on JSPI suspensions. Never re-throws — always returns
 * a structured report so both success and failure cases can be asserted on.
 */
async function runHelloP3(
    wasm: string,
    verboseCapture: ReturnType<typeof useVerboseOnFailure>,
    logLevels: Parameters<typeof verboseOptions>[1],
): Promise<RunReport> {
    const chunks: Uint8Array[] = [];
    const stdout = new WritableStream<Uint8Array>({
        write(chunk) { chunks.push(new Uint8Array(chunk)); },
    });

    const t0 = Date.now();
    const instance = await instantiateWasiComponent(wasm, {
        stdout,
        limits: { maxBlockingTimeMs: WATCHDOG_MS },
    }, verboseOptions(verboseCapture, logLevels));

    const report: RunReport = { elapsedMs: 0, stdout: '' };
    try {
        const runNs = instance.exports['wasi:cli/run@0.3.0-rc-2026-03-15'] as
            | Record<string, () => Promise<unknown>>
            | undefined;
        if (!runNs?.run) {
            throw new Error(
                `component does not export wasi:cli/run@0.3.0-rc-2026-03-15.run; saw: ${Object.keys(instance.exports).join(', ')}`,
            );
        }
        try {
            report.runReturn = await runNs.run();
        } catch (e) {
            const err = e as Error;
            report.threw = {
                message: err?.message ?? String(e),
                ctor: err?.constructor?.name ?? 'unknown',
            };
        }
    } finally {
        report.elapsedMs = Date.now() - t0;
        report.stdout = new TextDecoder().decode(
            new Uint8Array(chunks.reduce<number[]>((acc, c) => [...acc, ...c], [])),
        );
        instance.dispose();
    }
    return report;
}

describe('E1 reproducer — futures::join!(writer, host-consumer) on in-wasm pipe', () => {
    const verbose = useVerboseOnFailure();

    test('control: WAT hello-p3-world prints "hello from jsco" within watchdog', () =>
        runWithVerbose(verbose, async () => {
            const report = await runHelloP3(HELLO_P3_WAT_WASM, verbose, {
                resolver: LogLevel.Summary,
                executor: LogLevel.Summary,
            });

            verbose.logger('control', 1, `elapsed=${report.elapsedMs}ms stdout=${JSON.stringify(report.stdout)} threw=${JSON.stringify(report.threw)}`);

            expect(report.threw).toBeUndefined();
            expect(report.stdout).toContain('hello from jsco');
            expect(report.elapsedMs).toBeLessThan(WATCHDOG_MS);
        }), WATCHDOG_MS + 2000);

    test('candidate: Rust hello-p3-world (wit_stream + futures::join!)', () =>
        runWithVerbose(verbose, async () => {
            const report = await runHelloP3(HELLO_P3_RUST_WASM, verbose, {
                resolver: LogLevel.Summary,
                binder: LogLevel.Summary,
                executor: LogLevel.Detailed,
            });

            verbose.logger('candidate', 1, `elapsed=${report.elapsedMs}ms stdout=${JSON.stringify(report.stdout)} threw=${JSON.stringify(report.threw)}`);

            // Decision matrix — log the outcome explicitly so the test output
            // is self-documenting whether attached to an issue or read locally.
            if (report.threw) {
                const m = report.threw.message;
                if (/JSPI suspension stalled|possible deadlock/.test(m)) {
                    verbose.logger('candidate', 1,
                        'OUTCOME = DEADLOCK REPRODUCED. ' +
                        'The watchdog observed a JSPI suspension exceeding ' +
                        `${WATCHDOG_MS}ms. This is the failure mode described ` +
                        'in stream-jspi-deadlock.md §Reproducer.',
                    );
                } else {
                    verbose.logger('candidate', 1,
                        `OUTCOME = OTHER FAILURE (${report.threw.ctor}). ` +
                        'Not a JSPI deadlock; investigate before filing.',
                    );
                }
                // Re-raise so jest reports the failure with the verbose dump.
                throw new Error(`run() threw ${report.threw.ctor}: ${report.threw.message}`);
            }

            // No throw → guest completed.
            verbose.logger('candidate', 1,
                'OUTCOME = NO DEADLOCK. ' +
                'The wit_stream + futures::join! pattern completed cleanly. ' +
                'Either jsco\'s callback-form async lift sidesteps the structural ' +
                'JSPI deadlock, or the writer-arm canon.write returns synchronously ' +
                'before the consumer-arm suspends. Update stream-jspi-deadlock.md ' +
                'with this empirical finding before filing the upstream issue.',
            );
            expect(report.stdout).toContain('hello from jsco');
            expect(report.elapsedMs).toBeLessThan(WATCHDOG_MS);
        }), WATCHDOG_MS + 2000);
});
