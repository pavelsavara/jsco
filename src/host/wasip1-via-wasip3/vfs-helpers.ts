// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import type { AdapterContext } from './adapter-context';
import type { FdEntry } from './fd-table';
import type { VfsStat } from '../wasip3/vfs';
import { Errno, Filetype, FilestatLayout } from './types/wasi-snapshot-preview1';
import { getView, gatherBytes } from './memory';
import { VfsError, VfsNodeType } from '../wasip3/vfs';

export function vfsErrorToErrno(e: unknown): Errno {
    if (e instanceof VfsError) {
        switch (e.code) {
            case 'access': return Errno.Acces;
            case 'exist': return Errno.Exist;
            case 'invalid': return Errno.Inval;
            case 'io': return Errno.Io;
            case 'is-directory': return Errno.Isdir;
            case 'name-too-long': return Errno.Nametoolong;
            case 'no-entry': return Errno.Noent;
            case 'not-directory': return Errno.Notdir;
            case 'not-empty': return Errno.Notempty;
            case 'not-permitted': return Errno.Perm;
            case 'read-only': return Errno.Rofs;
            case 'cross-device': return Errno.Xdev;
            case 'insufficient-space': return Errno.Nospc;
            case 'overflow': return Errno.Overflow;
            case 'unsupported': return Errno.Notsup;
            case 'bad-descriptor': return Errno.Badf;
            case 'loop': return Errno.Loop;
            default: return Errno.Io;
        }
    }
    return Errno.Io;
}

export function vfsNodeTypeToFiletype(t: VfsNodeType): Filetype {
    switch (t) {
        case VfsNodeType.File: return Filetype.RegularFile;
        case VfsNodeType.Directory: return Filetype.Directory;
        case VfsNodeType.Symlink: return Filetype.SymbolicLink;
        default: return Filetype.Unknown;
    }
}

export function writeFilestat(view: DataView, ptr: number, stat: VfsStat): void {
    for (let i = 0; i < FilestatLayout._size; i++) {
        view.setUint8(ptr + i, 0);
    }
    view.setBigUint64(ptr + FilestatLayout.dev.offset, 0n, true);
    view.setBigUint64(ptr + FilestatLayout.ino.offset, BigInt(stat.nodeId), true);
    view.setUint8(ptr + FilestatLayout.filetype.offset, vfsNodeTypeToFiletype(stat.type));
    view.setBigUint64(ptr + FilestatLayout.nlink.offset, stat.linkCount, true);
    view.setBigUint64(ptr + FilestatLayout.size.offset, stat.size, true);
    view.setBigUint64(ptr + FilestatLayout.atim.offset, stat.accessTime, true);
    view.setBigUint64(ptr + FilestatLayout.mtim.offset, stat.modifyTime, true);
    view.setBigUint64(ptr + FilestatLayout.ctim.offset, stat.changeTime, true);
}

export function vfsReadScatter(ctx: AdapterContext, entry: FdEntry, mem: WebAssembly.Memory, iovs: number, iovs_len: number, retptr0: number): number {
    try {
        const view = getView(mem);
        let totalRead = 0;
        const iovsView = getView(mem);
        for (let i = 0; i < iovs_len; i++) {
            const base = iovs + i * 8;
            const bufPtr = iovsView.getUint32(base, true);
            const bufLen = iovsView.getUint32(base + 4, true);
            if (bufLen === 0) continue;
            const chunk = ctx.vfs.read(entry.vfsPath!, entry.position, bufLen);
            if (chunk.length === 0) break;
            new Uint8Array(mem.buffer, bufPtr, chunk.length).set(chunk);
            entry.position += BigInt(chunk.length);
            totalRead += chunk.length;
            if (chunk.length < bufLen) break;
        }
        view.setUint32(retptr0, totalRead, true);
        return Errno.Success;
    } catch (e) {
        return vfsErrorToErrno(e);
    }
}

export function vfsReadScatterAt(ctx: AdapterContext, vfsPath: string[], offset: bigint, mem: WebAssembly.Memory, iovs: number, iovs_len: number, retptr0: number): number {
    try {
        const view = getView(mem);
        let totalRead = 0;
        let currentOffset = offset;
        for (let i = 0; i < iovs_len; i++) {
            const base = iovs + i * 8;
            const bufPtr = view.getUint32(base, true);
            const bufLen = view.getUint32(base + 4, true);
            if (bufLen === 0) continue;
            const chunk = ctx.vfs.read(vfsPath, currentOffset, bufLen);
            if (chunk.length === 0) break;
            new Uint8Array(mem.buffer, bufPtr, chunk.length).set(chunk);
            currentOffset += BigInt(chunk.length);
            totalRead += chunk.length;
            if (chunk.length < bufLen) break;
        }
        view.setUint32(retptr0, totalRead, true);
        return Errno.Success;
    } catch (e) {
        return vfsErrorToErrno(e);
    }
}

export function vfsWriteGatherAt(ctx: AdapterContext, vfsPath: string[], offset: bigint, mem: WebAssembly.Memory, iovs: number, iovs_len: number, retptr0: number): number {
    try {
        const { data, totalLen } = gatherBytes(mem, iovs, iovs_len);
        ctx.vfs.write(vfsPath, data, offset);
        const view = getView(mem);
        view.setUint32(retptr0, totalLen, true);
        return Errno.Success;
    } catch (e) {
        return vfsErrorToErrno(e);
    }
}
