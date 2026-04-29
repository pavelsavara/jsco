// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { MarshalingContext } from '../marshal/model/types';

/**
 * Race a JSPI-blocking Promise against `mctx.maxBlockingTimeMs`. If the cap
 * elapses first the instance is aborted and a `WebAssembly.RuntimeError` is
 * thrown — replaces a silent hang on patterns like `futures::join!` arm
 * starvation (see plan.md E1) with an actionable error.
 *
 * No-op when the limit is unset or zero. Non-Promise inputs are returned
 * unchanged so callers can keep their fast-path sync return.
 *
 * The timer is `unref()`-ed where supported so it does not keep Node.js
 * alive past the application's natural exit. Whenever `p` resolves first
 * the timer is cleared so we do not accumulate one stale handle per wait.
 */
export function withBlockingTimeout<T>(
    mctx: MarshalingContext,
    p: T | Promise<T>,
    site: string,
): T | Promise<T> {
    const cap = mctx.maxBlockingTimeMs ?? 0;
    if (cap <= 0 || !(p instanceof Promise)) return p;
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            const msg = `JSPI suspension stalled >${cap}ms at ${site} (possible deadlock; see plan.md E1)`;
            mctx.abort(msg);
            reject(new WebAssembly.RuntimeError(msg));
        }, cap);
        // Avoid keeping the Node event loop alive solely on this timer
        // (the underlying suspended wasm continuation already pins the
        // loop while it is in-flight).
        (timer as unknown as { unref?: () => void }).unref?.();
        p.then(
            (v) => { clearTimeout(timer); resolve(v); },
            (e) => { clearTimeout(timer); reject(e); },
        );
    });
}
