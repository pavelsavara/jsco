// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import isDebug from 'env:isDebug';
import { LogLevel } from '../utils/assert';
import type { MarshalingContext } from '../marshal/model/types';

/**
 * Race a JSPI-blocking Promise against `mctx.maxBlockingTimeMs`. If the cap
 * elapses first the instance is aborted and a `WebAssembly.RuntimeError` is
 * thrown (replaces silent hangs like `futures::join!` arm starvation — see
 * plan.md E1 — with an actionable error).
 *
 * No-op when the limit is unset/zero or `p` is not a Promise. The timer is
 * `unref()`-ed so it doesn't keep Node alive past natural exit.
 */
export function withBlockingTimeout<T>(
    mctx: MarshalingContext,
    p: T | Promise<T>,
    site: string,
): T | Promise<T> {
    const cap = mctx.maxBlockingTimeMs ?? 0;
    if (cap <= 0 || !(p instanceof Promise)) return p;
    if (isDebug && (mctx.verbose?.executor ?? 0) >= LogLevel.Detailed) {
        mctx.logger!('executor', LogLevel.Detailed, `[watchdog] arm cap=${cap}ms site=${site} (wasm task is now suspended via JSPI awaiting host Promise)`);
    }
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            const msg = `JSPI suspension stalled >${cap}ms at ${site} (possible deadlock; see plan.md E1)`;
            if (isDebug && (mctx.verbose?.executor ?? 0) >= LogLevel.Summary) {
                mctx.logger!('executor', LogLevel.Summary, `[watchdog] FIRE site=${site} cap=${cap}ms \u2014 instance aborted`);
            }
            mctx.abort(msg);
            reject(new WebAssembly.RuntimeError(msg));
        }, cap);
        // unref so this timer alone doesn't keep the Node loop alive.
        (timer as unknown as { unref?: () => void }).unref?.();
        p.then(
            (v) => {
                clearTimeout(timer);
                if (isDebug && (mctx.verbose?.executor ?? 0) >= LogLevel.Detailed) {
                    mctx.logger!('executor', LogLevel.Detailed, `[watchdog] resolved site=${site} (wasm task resumes)`);
                }
                resolve(v);
            },
            (e) => {
                clearTimeout(timer);
                if (isDebug && (mctx.verbose?.executor ?? 0) >= LogLevel.Detailed) {
                    mctx.logger!('executor', LogLevel.Detailed, `[watchdog] rejected site=${site}: ${(e as Error)?.message ?? e}`);
                }
                reject(e);
            },
        );
    });
}
