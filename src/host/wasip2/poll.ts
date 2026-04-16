// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * wasi:io/poll — Pollable resource and poll() function
 *
 * Pollable wraps a readiness check. poll() returns indices of ready pollables.
 * JSPI: block() awaits the internal promise when JSPI is available.
 */

import { hasJspi } from '../../utils/jspi';
import type { WasiPollable, PollResult } from './api';

/**
 * Create a pollable from a synchronous readiness check.
 * The readiness function is called on every ready() / poll() invocation.
 */
export function createSyncPollable(isReady: () => boolean): WasiPollable {
    return {
        ready: isReady,
        block() {
            if (isReady()) return;
            // Synchronous pollable that isn't ready — spin would deadlock.
            // This should only happen for timer-based pollables where
            // the caller should use JSPI block instead.
            throw new Error('Synchronous pollable is not ready and cannot block without JSPI');
        },
    };
}

/**
 * Create a pollable from an async promise.
 * ready() returns true once the promise has resolved.
 * block() uses JSPI (WebAssembly.Suspending) to await the promise.
 */
export function createAsyncPollable(promise: Promise<void>): WasiPollable {
    let resolved = false;
    promise.then(() => { resolved = true; });

    return {
        ready: () => resolved,
        block() {
            if (resolved) return;
            // JSPI integration point: the resolver wraps this with
            // WebAssembly.Suspending so the WASM stack is suspended
            // while the promise resolves. Without JSPI, this throws.
            if (!hasJspi()) {
                throw new Error(
                    'Blocking poll requires JSPI. Enable chrome://flags/#enable-experimental-webassembly-jspi'
                );
            }
            // When JSPI wraps this function, the runtime will handle
            // the suspension. The actual await happens at the WASM boundary.
            // For host-side usage, we expose the underlying promise.
            throw new JspiBlockSignal(promise);
        },
    };
}

/**
 * Poll a list of pollables. Returns indices of those that are ready.
 * Per spec: never returns an empty list. If none are ready, blocks
 * until at least one becomes ready (requires JSPI for async pollables).
 */
export function poll(pollables: WasiPollable[]): PollResult {
    if (pollables.length === 0) {
        throw new Error('poll() requires at least one pollable');
    }

    const ready: number[] = [];
    for (let i = 0; i < pollables.length; i++) {
        const p = pollables[i];
        if (!p) throw new Error(`poll: pollable ${i} is undefined`);
        if (p.ready()) {
            ready.push(i);
        }
    }

    if (ready.length > 0) {
        return new Uint32Array(ready);
    }

    // None ready — need to block. For synchronous-only pollables this
    // will throw. For async pollables with JSPI, the first async one
    // will suspend the WASM stack.
    const first = pollables[0];
    if (!first) throw new Error('poll: first pollable is undefined');
    first.block();

    // After block returns (via JSPI resume), re-check all
    const readyAfterBlock: number[] = [];
    for (let i = 0; i < pollables.length; i++) {
        const p = pollables[i];
        if (!p) throw new Error(`poll: pollable ${i} is undefined`);
        if (p.ready()) {
            readyAfterBlock.push(i);
        }
    }

    if (readyAfterBlock.length === 0) {
        // Shouldn't happen if block() worked correctly
        throw new Error('poll() blocked but no pollables became ready');
    }

    return new Uint32Array(readyAfterBlock);
}

/**
 * Signal thrown during JSPI-aware blocking.
 * The resolver's JSPI wrapper catches this and awaits the promise,
 * suspending the WASM stack.
 */
export class JspiBlockSignal {
    constructor(public readonly promise: Promise<void>) { }
}
