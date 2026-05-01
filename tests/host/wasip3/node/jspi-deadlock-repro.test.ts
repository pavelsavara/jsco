// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

/**
 * Independent reproducer for the WASIp3 / JSPI canon-lower deadlock when
 * a SINGLE wasm task runs `futures::join!` over an in-task stream pipe
 * AND the consumer arm calls a sync-form host import (plain return type,
 * not `future<T>`).
 *
 * Fixture: integration-tests/jspi-deadlock-repro/src/lib.rs
 *
 *     async fn run_repro() -> bool {
 *         let (mut tx, rx) = wit_stream::new();
 *         let (collected, ()) = futures::join!(
 *             async { host::slow_collect(rx) },           // sync-lower
 *             async { tx.write(b"hello".to_vec()).await; drop(tx); },
 *         );
 *         collected == b"hello"
 *     }
 *
 * `host::slow-collect` returns `list<u8>` (plain). The canonical ABI
 * lowers it as a sync host call, so jsco wraps the host's `Promise<Uint8Array>`
 * in `WebAssembly.Suspending`. When `futures::join!` first polls arm A,
 * it calls `slow_collect` synchronously; the JSPI Suspending wrapper
 * suspends the entire wasm task on the host promise. The host promise
 * is awaiting bytes off `rx`, but `tx.write(...)` (arm B) lives on the
 * SAME wasm task and cannot run while the task is suspended.
 *
 * Watchdog (`limits.maxBlockingTimeMs`) converts what would be a silent
 * hang into a `WebAssembly.RuntimeError("JSPI suspension stalled ...")`,
 * which is what this test asserts on.
 *
 * To verify the diagnosis (manual): change the WIT signature to
 *     slow-collect: func(data: stream<u8>) -> future<list<u8>>;
 * rebuild, and the deadlock goes away — proving it is the canon-lower
 * sync vs. async form, not anything else.
 */

import { createComponent } from '../../../../src/resolver';
import { collectBytes, type WasiStreamReadable } from '../../../../src/host/wasip3/streams';
import { createWasiP3Host } from '../../../../src/host/wasip3/index';
import { createWasiP2ViaP3Adapter } from '../../../../src/host/wasip2-via-wasip3/index';
import { initializeAsserts } from '../../../../src/utils/assert';
import {
    useVerboseOnFailure,
    verboseOptions,
    runWithVerbose,
} from '../../../test-utils/verbose-logger';

initializeAsserts();

const REPRO_WASM = './integration-tests/jspi-deadlock-repro/jspi_deadlock_repro.wasm';
const HOST_INTERFACE = 'example:jspi-repro/host';
const GUEST_INTERFACE = 'example:jspi-repro/guest';

// Watchdog cap. Must be well under the jest test timeout so a deadlock
// surfaces as an actionable WebAssembly.RuntimeError instead of a hang.
const WATCHDOG_MS = 2000;

const PAYLOAD = new TextEncoder().encode('hello');

interface HostStats {
    slowCollectCalls: number;
    slowCollectResolved: number;
    bytesSeen: number;
}

function makeHost(stats: HostStats): Record<string, unknown> {
    // The component, built via wit-bindgen + wasi_snapshot_preview1.reactor
    // adapter, has a few WASIp2 imports the Rust stdlib pulled in. They are
    // satisfied here by jsco's existing P2-via-P3 adapter; they have NOTHING
    // to do with the deadlock — only `example:jspi-repro/host.slow-collect`
    // is exercised by run_repro().
    const p3 = createWasiP3Host();
    const p2 = createWasiP2ViaP3Adapter(p3);

    const customHost = {
        // Returns Promise<Uint8Array>. Because the WIT signature is
        // sync (plain `list<u8>` return), jsco wraps THIS PROMISE in
        // `WebAssembly.Suspending`. The wasm caller suspends until
        // the Promise resolves.
        'slow-collect': async (
            data: WasiStreamReadable<Uint8Array>,
        ): Promise<Uint8Array> => {
            stats.slowCollectCalls++;
            const result = await collectBytes(data);
            stats.bytesSeen = result.length;
            stats.slowCollectResolved++;
            return result;
        },
    };

    return {
        ...p2,
        ...p3,
        [HOST_INTERFACE]: customHost,
    };
}

describe('JSPI canon-lower sync-form + futures::join! over in-task pipe', () => {
    const verbose = useVerboseOnFailure();

    test('deadlocks (watchdog fires) — sync-form canon.lower', () =>
        runWithVerbose(verbose, async () => {
            const stats: HostStats = {
                slowCollectCalls: 0,
                slowCollectResolved: 0,
                bytesSeen: 0,
            };
            const component = await createComponent(
                REPRO_WASM,
                verboseOptions(verbose),
            );
            const instance = await component.instantiate(
                makeHost(stats) as never,
                { limits: { maxBlockingTimeMs: WATCHDOG_MS } },
            );

            const guest = instance.exports[GUEST_INTERFACE] as
                | { 'run-repro'?: () => Promise<boolean>; runRepro?: () => Promise<boolean> }
                | undefined;
            expect(guest).toBeDefined();
            const runRepro = guest!['run-repro'] ?? guest!.runRepro;
            expect(typeof runRepro).toBe('function');

            const t0 = Date.now();
            let threw: { ctor: string; message: string } | undefined;
            let returned: boolean | undefined;
            try {
                returned = await runRepro!();
            } catch (e) {
                const err = e as Error;
                threw = {
                    ctor: err?.constructor?.name ?? 'unknown',
                    message: err?.message ?? String(e),
                };
            }
            const elapsedMs = Date.now() - t0;

            verbose.logger('repro', 1,
                `elapsedMs=${elapsedMs} threw=${JSON.stringify(threw)} returned=${returned} ` +
                `host.slow-collect calls=${stats.slowCollectCalls} resolved=${stats.slowCollectResolved} ` +
                `bytesSeen=${stats.bytesSeen}`,
            );

            try {
                instance.dispose();
            } catch {
                // dispose may throw on a poisoned instance; ignore.
            }

            // ----- Assertions describing the observed deadlock -----
            //
            // 1. The host import was entered exactly once (the writer arm
            //    of futures::join! never had a chance to run).
            expect(stats.slowCollectCalls).toBe(1);

            // 2. ZERO bytes were collected. This is the smoking gun: the
            //    writer arm `tx.write(b"hello".to_vec()); drop(tx);` lives
            //    on the same wasm task that suspended on slow-collect, so
            //    it cannot have run. (Note: slowCollectResolved may flip
            //    to 1 AFTER the watchdog aborts the instance — the abort
            //    signal closes the stream table, the host's for-await
            //    exits cleanly with 0 chunks. That post-abort cleanup is
            //    not the join completing successfully; bytesSeen===0 is
            //    the invariant that proves the deadlock.)
            expect(stats.bytesSeen).toBe(0);

            // 3. The guest function never returned successfully.
            expect(returned).toBeUndefined();

            // 4. The watchdog observed a stalled JSPI suspension and
            //    aborted the instance with the well-known message.
            expect(threw).toBeDefined();
            expect(threw!.message).toMatch(/JSPI suspension stalled/);

            // 5. Wall-clock time is roughly the watchdog cap, NOT the
            //    test timeout — proves we hit the watchdog, not a hang.
            expect(elapsedMs).toBeGreaterThanOrEqual(WATCHDOG_MS - 200);
            expect(elapsedMs).toBeLessThan(WATCHDOG_MS + 1500);
        }), WATCHDOG_MS + 5000);

    test('control: payload size sanity (writer arm produces 5 bytes)', () => {
        // No wasm — purely documents the expected payload so the failure
        // assertions above are self-explanatory in issue attachments.
        expect(PAYLOAD).toEqual(new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f]));
        expect(PAYLOAD.length).toBe(5);
    });
});
