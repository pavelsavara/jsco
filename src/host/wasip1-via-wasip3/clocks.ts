// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import type { AdapterContext } from './adapter-context';
import { Errno, Clockid } from './types/wasi-snapshot-preview1';
import { getView } from './memory';

export function clock_res_get(ctx: AdapterContext, id: number, retptr0: number): number {
    const view = getView(ctx.getMemory());
    switch (id) {
        case Clockid.Realtime: {
            const res = ctx.p3['wasi:clocks/system-clock'].getResolution();
            view.setBigUint64(retptr0, res, true);
            return Errno.Success;
        }
        case Clockid.Monotonic: {
            const res = ctx.p3['wasi:clocks/monotonic-clock'].getResolution();
            view.setBigUint64(retptr0, res, true);
            return Errno.Success;
        }
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
            const instant = ctx.p3['wasi:clocks/system-clock'].now();
            const ns = instant.seconds * 1_000_000_000n + BigInt(instant.nanoseconds);
            view.setBigUint64(retptr0, ns, true);
            return Errno.Success;
        }
        case Clockid.Monotonic: {
            const ns = ctx.p3['wasi:clocks/monotonic-clock'].now();
            view.setBigUint64(retptr0, ns, true);
            return Errno.Success;
        }
        case Clockid.ProcessCputimeId:
        case Clockid.ThreadCputimeId:
            return Errno.Notsup;
        default:
            return Errno.Inval;
    }
}
