// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

/**
 * Spawn the wasmtime-style HTTP echo server fixture (echo-server-p3) in a
 * separate Node.js process via the jsco CLI's `serve` command, mirroring how
 * the upstream wasmtime test harness runs its hyper-based echo server.
 *
 * The fixture replicates the wire contract documented in
 * d:\jsco\http-echo-server.md:
 *   - status 200, header `x-wasmtime-test-method`, header `x-wasmtime-test-uri`,
 *     content-length passthrough, body echo.
 *
 * Use `startEchoServer()` from jest `beforeAll` to receive a `host:port` to
 * expose to a guest as `HTTP_SERVER`. Always pair with `await stop()` in
 * `afterAll`.
 */

import { spawn, ChildProcess } from 'node:child_process';
import * as path from 'node:path';

const JSCO_CLI = path.resolve(process.cwd(), 'dist/debug/cli.js');
const ECHO_SERVER_WASM = path.resolve(
    process.cwd(),
    'integration-tests/echo-server-p3/echo_server_p3.wasm',
);

export interface EchoServerHandle {
    /** Process handle for the spawned `node dist/debug/cli.js serve …` */
    proc: ChildProcess;
    /** Bound host (always `127.0.0.1`). */
    host: string;
    /** Kernel-chosen port. */
    port: number;
    /** `host:port` literal — exactly what guests want as `HTTP_SERVER`. */
    addr: string;
    /** Send SIGTERM and wait for exit. */
    stop(): Promise<void>;
}

/**
 * Spawn `jsco serve echo-server-p3.wasm --addr 127.0.0.1:0` and resolve once
 * the child reports its listening port on stdout.
 */
export async function startEchoServer(): Promise<EchoServerHandle> {
    const proc = spawn(
        process.execPath,
        [
            '--experimental-wasm-jspi',
            JSCO_CLI,
            'serve',
            ECHO_SERVER_WASM,
            '--addr', '127.0.0.1:0',
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let stdoutBuf = '';
    let stderrBuf = '';
    proc.stdout!.setEncoding('utf8');
    proc.stderr!.setEncoding('utf8');
    proc.stdout!.on('data', (chunk: string) => {
        stdoutBuf += chunk;
        if (process.env.JSCO_ECHO_VERBOSE) process.stdout.write(`[echo:out] ${chunk}`);
    });
    proc.stderr!.on('data', (chunk: string) => {
        stderrBuf += chunk;
        if (process.env.JSCO_ECHO_VERBOSE) process.stderr.write(`[echo:err] ${chunk}`);
    });

    const port: number = await new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(
                `echo server did not report listening within 15s\n--- stdout ---\n${stdoutBuf}\n--- stderr ---\n${stderrBuf}`,
            ));
        }, 15000);

        const onData = (): void => {
            const m = stdoutBuf.match(/listening on [^:]+:(\d+)/);
            if (m) {
                clearTimeout(timer);
                proc.stdout!.off('data', onData);
                resolve(Number.parseInt(m[1]!, 10));
            }
        };
        proc.stdout!.on('data', onData);
        // Poll once in case the line was already buffered.
        onData();

        proc.once('exit', (code) => {
            clearTimeout(timer);
            reject(new Error(
                `echo server exited early with code ${code}\n--- stdout ---\n${stdoutBuf}\n--- stderr ---\n${stderrBuf}`,
            ));
        });
        proc.once('error', (e) => { clearTimeout(timer); reject(e); });
    });

    const host = '127.0.0.1';
    return {
        proc,
        host,
        port,
        addr: `${host}:${port}`,
        stop: () => new Promise<void>((resolve) => {
            if (proc.exitCode != null || proc.signalCode != null) { resolve(); return; }
            proc.once('exit', () => resolve());
            proc.kill('SIGTERM');
            // Fallback: hard-kill if the child ignores SIGTERM.
            setTimeout(() => {
                if (proc.exitCode == null && proc.signalCode == null) {
                    try { proc.kill('SIGKILL'); } catch { /* ignore */ }
                }
            }, 3000).unref();
        }),
    };
}
