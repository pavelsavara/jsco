// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import type { AdapterContext } from './adapter-context';
import { Errno, Clockid } from './types/wasi-snapshot-preview1';
import { getView } from './memory';

export function clock_res_get(ctx: AdapterContext, id: number, retptr0: number): number {
    const view = getView(ctx.getMemory());
    switch (id) {
        case Clockid.Realtime:
            view.setBigUint64(retptr0, 1_000n, true);
            return Errno.Success;
        case Clockid.Monotonic:
            view.setBigUint64(retptr0, 1n, true);
            return Errno.Success;
        case Clockid.ProcessCputimeId:
        case Clockid.ThreadCputimeId:
            return Errno.Notsup;
        default:
            return Errno.Inval;
    }
}

export function clock_time_get(ctx: AdapterContext, id: number, _precision: bigint, retptr0: number): number {
    const view = getView(ctx.getMemory());
    switch (id) {
        case Clockid.Realtime: {
            const nowMs = Date.now();
            view.setBigUint64(retptr0, BigInt(nowMs) * 1_000_000n, true);
            return Errno.Success;
        }
        case Clockid.Monotonic: {
            const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
            view.setBigUint64(retptr0, BigInt(Math.round(nowMs * 1_000_000)), true);
            return Errno.Success;
        }
        case Clockid.ProcessCputimeId:
        case Clockid.ThreadCputimeId:
            return Errno.Notsup;
        default:
            return Errno.Inval;
    }
}
