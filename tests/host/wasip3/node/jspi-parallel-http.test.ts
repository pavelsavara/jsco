// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * P8 — `futures::join!(client.send_a, client.send_b)` does not deadlock.
 *
 * Verifies the open question from `proposals.md` / `revised-plan.md` §3:
 * a SINGLE WASIp3 guest task issuing TWO concurrent `wasi:http/client.send`
 * calls via `futures::join!` completes cleanly under JSPI, with both
 * requests overlapping in time on the host event loop.
 *
 * Background:
 *  - The streams `futures::join!` deadlock (E1) occurs when read and write
 *    arms share a pipe — the read suspends via JSPI on `waitable-set.wait`,
 *    freezing the wasm thread, so the write arm cannot run to produce data.
 *  - Two independent `client.send` calls have NO inter-arm dependency.
 *    Each is a separate async-canon-lower → host Promise → subtask.
 *    `waitable-set.wait` legitimately wakes on either subtask; the host's
 *    Node.js event loop continues to drive both `http.request` callbacks
 *    while wasm is suspended.
 *
 * Test design:
 *  - Spin up a Node `http.createServer` on 127.0.0.1:0.
 *  - The server delays its response until BOTH connections have arrived
 *    (synchronization barrier via Deferred). If the guest serializes the
 *    sends, the second never arrives because the first is still pending,
 *    so the test would deadlock and hit the timeout.
 *  - The guest fixture (integration-tests/join-http-p3/) calls
 *    `client.send` twice in `futures::join!` with paths /a and /b.
 *  - Assert: both sends succeed, both arrive at the server, total
 *    wall-clock is well under the timeout.
 */

import * as http from 'node:http';

import { createComponent } from '../../../../src/resolver';
import { createWasiP2ViaP3Adapter } from '../../../../src/host/wasip2-via-wasip3/index';
import { createWasiP3Host as createP3Host } from '../../../../src/host/wasip3/index';
import { initializeAsserts } from '../../../../src/utils/assert';
import {
    useVerboseOnFailure,
    verboseOptions,
    runWithVerbose,
} from '../../../test-utils/verbose-logger';

initializeAsserts();

const JOIN_HTTP_WASM = './integration-tests/join-http-p3/join_http_p3.wasm';
const RUNNER_INTERFACE = 'jsco:join-http-p3/runner';

/** Merged P2+P3 hosts mirroring tests/host/wasip3/node/http-reactor-concurrent.test.ts. */
function createMergedHosts(
    config?: Parameters<typeof createP3Host>[0],
): Record<string, unknown> {
    const p3 = createP3Host(config);
    const p2 = createWasiP2ViaP3Adapter(p3);
    return { ...p2, ...p3 };
}

interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason?: unknown) => void;
}
function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

/**
 * Start a barrier server: each incoming request increments a counter
 * and parks until the expected number have arrived. Then ALL responses
 * are sent simultaneously. If the guest serializes the sends, the second
 * never arrives and the test times out.
 */
async function startBarrierServer(expected: number): Promise<{
    port: number;
    paths: string[];
    arrivalTimes: number[];
    close: () => Promise<void>;
}> {
    const arrived: string[] = [];
    const arrivalTimes: number[] = [];
    const allArrived = deferred<void>();

    const server = http.createServer((req, res) => {
        arrived.push(req.url ?? '');
        arrivalTimes.push(Date.now());
        if (arrived.length === expected) allArrived.resolve();
        // Park until the barrier opens, then respond.
        allArrived.promise.then(() => {
            res.statusCode = 200;
            res.setHeader('content-type', 'text/plain');
            res.end(`hello-from-${req.url}`);
        });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('failed to bind');

    return {
        port: addr.port,
        paths: arrived,
        arrivalTimes,
        close: () => new Promise<void>((resolve, reject) =>
            server.close((err) => (err ? reject(err) : resolve()))),
    };
}

describe('P8 — futures::join!(client.send, client.send) on a single guest task', () => {
    const verbose = useVerboseOnFailure();

    test('P8: two concurrent client.send calls overlap and both complete', () =>
        runWithVerbose(verbose, async () => {
            const server = await startBarrierServer(2);
            const imports = createMergedHosts();
            const component = await createComponent(JOIN_HTTP_WASM, verboseOptions(verbose));
            const instance = await component.instantiate(imports);

            try {
                const runner = instance.exports[RUNNER_INTERFACE] as
                    | Record<string, (...args: unknown[]) => Promise<{ tag: 'ok' | 'err', val: unknown }>>
                    | undefined;
                expect(runner).toBeDefined();
                const send = runner!['join-two-sends'];
                expect(typeof send).toBe('function');

                const authority = `127.0.0.1:${server.port}`;
                const startMs = Date.now();
                const result = await send!(authority) as { tag: 'ok' | 'err', val: unknown };
                const elapsedMs = Date.now() - startMs;

                // Result is a WIT result<list<u16>, string>. With the jsco
                // marshalling convention this surfaces as { tag, val }.
                expect(result).toBeDefined();
                if (result.tag !== 'ok') {
                    throw new Error(`guest reported error: ${JSON.stringify(result.val)}`);
                }
                const statuses = result.val as number[];
                expect(statuses).toHaveLength(2);
                expect(statuses[0]).toBe(200);
                expect(statuses[1]).toBe(200);

                // Server saw both requests.
                expect(server.paths).toHaveLength(2);
                expect(server.paths.sort()).toEqual(['/a', '/b']);

                // Concurrency proof: both arrived before either was answered.
                // The barrier server only releases responses after the second
                // arrival, so if the guest had serialized the sends, the test
                // would have hit the Jest timeout instead. Cross-check the
                // arrival-time spread is small (well under 1s) — they should
                // queue back-to-back on the same JS event-loop iteration.
                const spread = Math.max(...server.arrivalTimes) - Math.min(...server.arrivalTimes);
                expect(spread).toBeLessThan(1000);

                // Total wall-clock is bounded; serialized sends would deadlock.
                expect(elapsedMs).toBeLessThan(5000);
            } finally {
                instance.dispose();
                await server.close();
            }
        }), 10000);
});
