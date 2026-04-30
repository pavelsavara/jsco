// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import type { AdapterContext } from './adapter-context';
import { Errno, Preopentype, PrestatLayout } from './types/wasi-snapshot-preview1';
import { getView } from './memory';
import { WasiExit } from '../wasip3/cli';

export function args_get(ctx: AdapterContext, argv: number, argv_buf: number): number {
    const mem = ctx.getMemory();
    const view = getView(mem);
    let bufOffset = argv_buf;
    for (let i = 0; i < ctx.args.length; i++) {
        view.setUint32(argv + i * 4, bufOffset, true);
        const encoded = ctx.encoder.encode(ctx.args[i] + '\0');
        new Uint8Array(mem.buffer, bufOffset, encoded.length).set(encoded);
        bufOffset += encoded.length;
    }
    return Errno.Success;
}

export function args_sizes_get(ctx: AdapterContext, retptr0: number, retptr1: number): number {
    const view = getView(ctx.getMemory());
    view.setUint32(retptr0, ctx.args.length, true);
    let totalSize = 0;
    for (const arg of ctx.args) {
        totalSize += ctx.encoder.encode(arg + '\0').length;
    }
    view.setUint32(retptr1, totalSize, true);
    return Errno.Success;
}

export function environ_get(ctx: AdapterContext, environ: number, environ_buf: number): number {
    const mem = ctx.getMemory();
    const view = getView(mem);
    let bufOffset = environ_buf;
    for (let i = 0; i < ctx.envPairs.length; i++) {
        view.setUint32(environ + i * 4, bufOffset, true);
        const pair = ctx.envPairs[i]!;
        const encoded = ctx.encoder.encode(pair[0] + '=' + pair[1] + '\0');
        new Uint8Array(mem.buffer, bufOffset, encoded.length).set(encoded);
        bufOffset += encoded.length;
    }
    return Errno.Success;
}

export function environ_sizes_get(ctx: AdapterContext, retptr0: number, retptr1: number): number {
    const view = getView(ctx.getMemory());
    view.setUint32(retptr0, ctx.envPairs.length, true);
    let totalSize = 0;
    for (const [k, v] of ctx.envPairs) {
        totalSize += ctx.encoder.encode(k + '=' + v + '\0').length;
    }
    view.setUint32(retptr1, totalSize, true);
    return Errno.Success;
}

export function fd_prestat_get(ctx: AdapterContext, fd: number, retptr0: number): number {
    const entry = ctx.fdTable.get(fd);
    if (!entry || entry.kind !== 3 /* FdKind.PreopenDir */) return Errno.Badf;
    const view = getView(ctx.getMemory());
    view.setUint8(retptr0 + PrestatLayout.tag.offset, Preopentype.Dir);
    const pathBytes = ctx.encoder.encode(entry.preopenPath ?? '/');
    view.setUint32(retptr0 + PrestatLayout.u.offset, pathBytes.length, true);
    return Errno.Success;
}

export function fd_prestat_dir_name(ctx: AdapterContext, fd: number, path: number, path_len: number): number {
    const entry = ctx.fdTable.get(fd);
    if (!entry || entry.kind !== 3 /* FdKind.PreopenDir */) return Errno.Badf;
    const mem = ctx.getMemory();
    const pathBytes = ctx.encoder.encode(entry.preopenPath ?? '/');
    const writeLen = Math.min(pathBytes.length, path_len);
    new Uint8Array(mem.buffer, path, writeLen).set(pathBytes.subarray(0, writeLen));
    return Errno.Success;
}

export function proc_exit(rval: number): void {
    throw new WasiExit(rval);
}

export function sched_yield(): number {
    return Errno.Success;
}
