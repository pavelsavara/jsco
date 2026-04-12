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

import type { Verbosity, LogFn } from '../utils/assert';
import { LogLevel } from '../utils/assert';

export type VerboseCapture = {
    messages: string[];
    logger: LogFn;
    clear: () => void;
};

/**
 * Create a VerboseCapture that stores log messages in an array.
 */
export function createVerboseCapture(): VerboseCapture {
    const messages: string[] = [];
    const logger: LogFn = (phase, _level, ...args) => {
        const text = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
        messages.push(`[${phase}] ${text}`);
    };
    return {
        messages,
        logger,
        clear: () => { messages.length = 0; },
    };
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
    };
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
    if (capture.messages.length === 0) return;
    // eslint-disable-next-line no-console
    console.log(`\n--- Verbose log for "${label ?? 'unknown'}" (${capture.messages.length} messages) ---`);
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
