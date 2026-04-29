// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * Test utility: captures verbose log messages per test case.
 * When a test fails, accumulated messages are printed to aid debugging.
 *
 * Usage:
 *   import { useVerboseOnFailure, verboseOptions } from '../test-utils/verbose-logger';
 *
 *   describe('my suite', () => {
 *       const verbose = useVerboseOnFailure();
 *
 *       test('my test', async () => {
 *           const component = await createComponent(wasm, verboseOptions(verbose));
 *           // ... assertions
 *       });
 *   });
 */

import type { Verbosity, LogFn } from '../../src/utils/assert';
import { LogLevel } from '../../src/utils/assert';

/**
 * Maximum number of messages retained in a VerboseCapture buffer.
 * When exceeded, the oldest messages are dropped (ring-buffer behavior)
 * and `droppedCount` is incremented. The cap protects long-running
 * tests in debug mode (e.g. `executor: LogLevel.Detailed` over a 50k+
 * iteration spin) from accumulating hundreds of MB of diagnostic data
 * in process memory. The most recent N messages are preserved \u2014 these
 * are the most relevant for diagnosing the failure.
 *
 * If a real failure produces a trace longer than this, raise the cap
 * locally; the dump prefix reports the dropped count.
 */
export const MAX_BUFFERED_MESSAGES = 5000;

export type VerboseCapture = {
    messages: string[];
    /** Number of messages dropped due to MAX_BUFFERED_MESSAGES cap. */
    droppedCount: number;
    logger: LogFn;
    clear: () => void;
};

/**
 * Create a VerboseCapture that stores log messages in a bounded ring buffer.
 */
export function createVerboseCapture(): VerboseCapture {
    const capture: VerboseCapture = {
        messages: [],
        droppedCount: 0,
        logger: undefined as unknown as LogFn, // assigned below
        clear: () => {
            capture.messages.length = 0;
            capture.droppedCount = 0;
        },
    };
    capture.logger = (phase, _level, ...args) => {
        const text = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
        if (capture.messages.length >= MAX_BUFFERED_MESSAGES) {
            capture.messages.shift();
            capture.droppedCount++;
        }
        capture.messages.push(`[${phase}] ${text}`);
    };
    return capture;
}

/**
 * Build ComponentFactoryOptions fields for verbose logging.
 * Pass the result into createComponent() or instantiateWasiComponent() options.
 */
export function verboseOptions(capture: VerboseCapture, levels?: Partial<Verbosity>) {
    return {
        verbose: {
            parser: levels?.parser ?? LogLevel.Off,
            resolver: levels?.resolver ?? LogLevel.Off,
            binder: levels?.binder ?? LogLevel.Off,
            executor: levels?.executor ?? LogLevel.Off,
        } as Verbosity,
        logger: capture.logger,
    } as any;
}

/**
 * Jest lifecycle hook: call within a describe() block.
 * Creates a per-test VerboseCapture, clears it before each test,
 * and prints captured messages when a test fails.
 *
 * Returns the VerboseCapture instance for use in test bodies.
 */
export function useVerboseOnFailure(levels?: Partial<Verbosity>): VerboseCapture {
    const capture = createVerboseCapture();

    beforeEach(() => {
        capture.clear();
    });

    // We cannot reliably detect failure in afterEach via expect.getState().
    // Instead, each test should call dumpVerboseOnError() in a catch block,
    // or use runWithVerbose() wrapper.
    // However, we provide tryDumpOnFailure() as a best-effort afterEach hook.
    afterEach(() => {
        // Jest's expect.getState() tracks assertion counts.
        // If suppressedErrors exist (from expect inside try/catch), dump.
        const state = expect.getState() as any;
        const hasSuppressed = state.suppressedErrors?.length > 0;
        if (hasSuppressed && capture.messages.length > 0) {
            dumpMessages(state.currentTestName, capture);
        }
    });

    (capture as any)._levels = levels;
    return capture;
}

/**
 * Print captured verbose messages to console (for debugging test failures).
 * Call this explicitly when you catch an error in a test to see the trace.
 */
export function dumpMessages(label: string | undefined, capture: VerboseCapture): void {
    if (capture.messages.length === 0 && capture.droppedCount === 0) return;
    const dropSuffix = capture.droppedCount > 0
        ? ` (+${capture.droppedCount} earlier dropped, cap=${MAX_BUFFERED_MESSAGES})`
        : '';
    // eslint-disable-next-line no-console
    console.log(`\n--- Verbose log for "${label ?? 'unknown'}" (${capture.messages.length} messages${dropSuffix}) ---`);
    for (const msg of capture.messages) {
        // eslint-disable-next-line no-console
        console.log(msg);
    }
    // eslint-disable-next-line no-console
    console.log('--- End verbose log ---\n');
}

/**
 * Run an async test body, dumping verbose messages on failure.
 * Re‐throws the original error after dumping.
 *
 * Usage:
 *   test('my test', () => runWithVerbose(verbose, async () => {
 *       const component = await createComponent(wasm, verboseOptions(verbose));
 *       // ... assertions
 *   }));
 */
export async function runWithVerbose(capture: VerboseCapture, fn: () => Promise<void>): Promise<void> {
    try {
        await fn();
    } catch (e) {
        const state = expect.getState() as any;
        dumpMessages(state?.currentTestName, capture);
        throw e;
    }
}
