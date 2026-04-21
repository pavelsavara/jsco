// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { AdapterContext } from './adapter-context';
import { Errno } from './types/wasi-snapshot-preview1';

export function random_get(ctx: AdapterContext, buf: number, buf_len: number): number {
    const mem = ctx.getMemory();
    const buffer = new Uint8Array(mem.buffer, buf, buf_len);
    crypto.getRandomValues(buffer);
    return Errno.Success;
}
