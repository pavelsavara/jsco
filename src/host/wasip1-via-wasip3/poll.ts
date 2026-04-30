// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import type { AdapterContext } from './adapter-context';
import { Errno, Clockid, Eventtype, EventLayout, SubscriptionLayout } from './types/wasi-snapshot-preview1';
import { getView } from './memory';

export function poll_oneoff(ctx: AdapterContext, in_: number, out_: number, nsubscriptions: number, retptr0: number): number {
    const mem = ctx.getMemory();
    const view = getView(mem);
    let eventsWritten = 0;

    for (let i = 0; i < nsubscriptions; i++) {
        const subPtr = in_ + i * SubscriptionLayout._size;
        const userdata = view.getBigUint64(subPtr + SubscriptionLayout.userdata.offset, true);
        const tag = view.getUint8(subPtr + SubscriptionLayout.u.offset);

        const outPtr = out_ + eventsWritten * EventLayout._size;
        view.setBigUint64(outPtr + EventLayout.userdata.offset, userdata, true);

        if (tag === Eventtype.Clock) {
            const clockId = view.getUint32(subPtr + SubscriptionLayout.u.offset + 8, true);
            if (clockId === Clockid.Realtime || clockId === Clockid.Monotonic) {
                view.setUint16(outPtr + EventLayout.error.offset, Errno.Success, true);
            } else {
                view.setUint16(outPtr + EventLayout.error.offset, Errno.Notsup, true);
            }
            view.setUint8(outPtr + EventLayout.type.offset, Eventtype.Clock);
            eventsWritten++;
        } else if (tag === Eventtype.FdRead || tag === Eventtype.FdWrite) {
            view.setUint16(outPtr + EventLayout.error.offset, Errno.Success, true);
            view.setUint8(outPtr + EventLayout.type.offset, tag);
            eventsWritten++;
        }
    }

    view.setUint32(retptr0, eventsWritten, true);
    return Errno.Success;
}
