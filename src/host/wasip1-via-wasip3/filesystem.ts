// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import type { AdapterContext } from './adapter-context';
import {
    Errno, Whence, Filetype, Fdflags, Lookupflags, Oflags, Fstflags,
    FdstatLayout, FilestatLayout, DirentLayout,
} from './types/wasi-snapshot-preview1';
import { getView, gatherBytes, readString, scatterBytes } from './memory';
import { FdKind, ALL_RIGHTS } from './fd-table';
import { errorCodeToErrno } from './errors';

// ── P3 Descriptor type aliases (duck-typed) ────────────────────────

type P3DescriptorStat = {
    type: { tag: string };
    linkCount: bigint;
    size: bigint;
    dataAccessTimestamp?: { seconds: bigint; nanoseconds: number };
    dataModificationTimestamp?: { seconds: bigint; nanoseconds: number };
    statusChangeTimestamp?: { seconds: bigint; nanoseconds: number };
};

type P3Descriptor = {
    readViaStream(offset: bigint): [AsyncIterable<Uint8Array>, Promise<unknown>];
    writeViaStream(data: AsyncIterable<Uint8Array>, offset: bigint): Promise<void>;
    appendViaStream(data: AsyncIterable<Uint8Array>): Promise<void>;
    stat(): Promise<P3DescriptorStat>;
    statAt(pathFlags: { symlinkFollow?: boolean }, path: string): Promise<P3DescriptorStat>;
    openAt(pathFlags: { symlinkFollow?: boolean }, path: string, openFlags: { create?: boolean; directory?: boolean; exclusive?: boolean; truncate?: boolean }, flags: { read?: boolean; write?: boolean; mutateDirectory?: boolean }): Promise<P3Descriptor>;
    createDirectoryAt(path: string): Promise<void>;
    removeDirectoryAt(path: string): Promise<void>;
    renameAt(oldPath: string, newDescriptor: P3Descriptor, newPath: string): Promise<void>;
    symlinkAt(oldPath: string, newPath: string): Promise<void>;
    unlinkFileAt(path: string): Promise<void>;
    linkAt(oldPathFlags: { symlinkFollow?: boolean }, oldPath: string, newDescriptor: P3Descriptor, newPath: string): Promise<void>;
    readlinkAt(path: string): Promise<string>;
    setSize(size: bigint): Promise<void>;
    setTimes(access: { tag: string; val?: unknown }, modify: { tag: string; val?: unknown }): Promise<void>;
    setTimesAt(pathFlags: { symlinkFollow?: boolean }, path: string, access: { tag: string; val?: unknown }, modify: { tag: string; val?: unknown }): Promise<void>;
    readDirectory(): [AsyncIterable<{ type: { tag: string }; name: string }>, Promise<unknown>];
    getType(): Promise<{ tag: string }>;
    getFlags(): Promise<{ read?: boolean; write?: boolean }>;
};

// ── Helpers ────────────────────────────────────────────────────────

function p3DescriptorTypeToFiletype(tag: string): Filetype {
    switch (tag) {
        case 'regular-file': return Filetype.RegularFile;
        case 'directory': return Filetype.Directory;
        case 'symbolic-link': return Filetype.SymbolicLink;
        case 'character-device': return Filetype.CharacterDevice;
        case 'block-device': return Filetype.BlockDevice;
        case 'socket': return Filetype.SocketDgram;
        case 'fifo': return Filetype.Unknown;
        default: return Filetype.Unknown;
    }
}

function instantToNs(instant: { seconds: bigint; nanoseconds: number }): bigint {
    return instant.seconds * 1_000_000_000n + BigInt(instant.nanoseconds);
}

function writeP3Filestat(view: DataView, ptr: number, stat: P3DescriptorStat): void {
    for (let i = 0; i < FilestatLayout._size; i++) {
        view.setUint8(ptr + i, 0);
    }
    view.setBigUint64(ptr + FilestatLayout.dev.offset, 0n, true);
    view.setBigUint64(ptr + FilestatLayout.ino.offset, 0n, true);
    view.setUint8(ptr + FilestatLayout.filetype.offset, p3DescriptorTypeToFiletype(stat.type.tag));
    view.setBigUint64(ptr + FilestatLayout.nlink.offset, stat.linkCount, true);
    view.setBigUint64(ptr + FilestatLayout.size.offset, stat.size, true);
    if (stat.dataAccessTimestamp) {
        view.setBigUint64(ptr + FilestatLayout.atim.offset, instantToNs(stat.dataAccessTimestamp), true);
    }
    if (stat.dataModificationTimestamp) {
        view.setBigUint64(ptr + FilestatLayout.mtim.offset, instantToNs(stat.dataModificationTimestamp), true);
    }
    if (stat.statusChangeTimestamp) {
        view.setBigUint64(ptr + FilestatLayout.ctim.offset, instantToNs(stat.statusChangeTimestamp), true);
    }
}

function readableFromBytes(data: Uint8Array): AsyncIterable<Uint8Array> {
    return {
        async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
            yield data;
        },
    };
}

// ── File Descriptor Operations ─────────────────────────────────────

export function fd_advise(_ctx: AdapterContext, _fd: number, _offset: bigint, _len: bigint, _advice: number): number {
    return Errno.Success;
}

export function fd_allocate(_ctx: AdapterContext, _fd: number, _offset: bigint, _len: bigint): number {
    return Errno.Notsup;
}

export function fd_close(ctx: AdapterContext, fd: number): number {
    if (!ctx.fdTable.close(fd)) return Errno.Badf;
    return Errno.Success;
}

export function fd_datasync(_ctx: AdapterContext, _fd: number): number {
    return Errno.Success;
}

export function fd_fdstat_get(ctx: AdapterContext, fd: number, retptr0: number): number {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    const view = getView(ctx.getMemory());
    for (let i = 0; i < FdstatLayout._size; i++) {
        view.setUint8(retptr0 + i, 0);
    }
    view.setUint8(retptr0 + FdstatLayout.fs_filetype.offset, entry.filetype);
    view.setUint16(retptr0 + FdstatLayout.fs_flags.offset, entry.flags, true);
    view.setBigUint64(retptr0 + FdstatLayout.fs_rights_base.offset, BigInt(entry.rightsBase), true);
    view.setBigUint64(retptr0 + FdstatLayout.fs_rights_inheriting.offset, BigInt(entry.rightsInheriting), true);
    return Errno.Success;
}

export function fd_fdstat_set_flags(_ctx: AdapterContext, _fd: number, _flags: number): number {
    return Errno.Success;
}

export function fd_fdstat_set_rights(_ctx: AdapterContext, _fd: number, _fs_rights_base: bigint, _fs_rights_inheriting: bigint): number {
    return Errno.Success;
}

export async function fd_filestat_get(ctx: AdapterContext, fd: number, retptr0: number): Promise<number> {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    const view = getView(ctx.getMemory());
    if (entry.desc) {
        try {
            const stat = await (entry.desc as P3Descriptor).stat();
            writeP3Filestat(view, retptr0, stat);
            return Errno.Success;
        } catch (e) {
            return errorCodeToErrno(e);
        }
    }
    // stdio FDs — return minimal stat
    for (let i = 0; i < FilestatLayout._size; i++) {
        view.setUint8(retptr0 + i, 0);
    }
    view.setUint8(retptr0 + FilestatLayout.filetype.offset, entry.filetype);
    view.setBigUint64(retptr0 + FilestatLayout.nlink.offset, 1n, true);
    return Errno.Success;
}

export async function fd_filestat_set_size(ctx: AdapterContext, fd: number, size: bigint): Promise<number> {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    if (!entry.desc) return Errno.Notsup;
    try {
        await (entry.desc as P3Descriptor).setSize(size);
        return Errno.Success;
    } catch (e) {
        return errorCodeToErrno(e);
    }
}

export async function fd_filestat_set_times(ctx: AdapterContext, fd: number, atim: bigint, mtim: bigint, fst_flags: number): Promise<number> {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    if (!entry.desc) return Errno.Notsup;
    try {
        const aNow = (fst_flags & Fstflags.AtimNow) ? { tag: 'now' as const }
            : (fst_flags & Fstflags.Atim) ? { tag: 'timestamp' as const, val: { seconds: atim / 1_000_000_000n, nanoseconds: Number(atim % 1_000_000_000n) } }
                : { tag: 'no-change' as const };
        const mNow = (fst_flags & Fstflags.MtimNow) ? { tag: 'now' as const }
            : (fst_flags & Fstflags.Mtim) ? { tag: 'timestamp' as const, val: { seconds: mtim / 1_000_000_000n, nanoseconds: Number(mtim % 1_000_000_000n) } }
                : { tag: 'no-change' as const };
        await (entry.desc as P3Descriptor).setTimes(aNow, mNow);
        return Errno.Success;
    } catch (e) {
        return errorCodeToErrno(e);
    }
}

export async function fd_pread(ctx: AdapterContext, fd: number, iovs: number, iovs_len: number, offset: bigint, retptr0: number): Promise<number> {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    if (!entry.desc) return Errno.Notsup;
    const mem = ctx.getMemory();
    try {
        const [stream] = (entry.desc as P3Descriptor).readViaStream(offset);
        const iterator = stream[Symbol.asyncIterator]();
        try {
            const { done, value } = await iterator.next();
            if (done || !value) {
                getView(mem).setUint32(retptr0, 0, true);
                return Errno.Success;
            }
            const bytesWritten = scatterBytes(mem, iovs, iovs_len, value);
            getView(mem).setUint32(retptr0, bytesWritten, true);
            return Errno.Success;
        } finally {
            if (typeof iterator.return === 'function') iterator.return(undefined);
        }
    } catch (e) {
        return errorCodeToErrno(e);
    }
}

export async function fd_pwrite(ctx: AdapterContext, fd: number, iovs: number, iovs_len: number, offset: bigint, retptr0: number): Promise<number> {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    if (!entry.desc) return Errno.Notsup;
    const mem = ctx.getMemory();
    const { data, totalLen } = gatherBytes(mem, iovs, iovs_len);
    try {
        await (entry.desc as P3Descriptor).writeViaStream(readableFromBytes(data), offset);
        getView(mem).setUint32(retptr0, totalLen, true);
        return Errno.Success;
    } catch (e) {
        return errorCodeToErrno(e);
    }
}

export async function fd_read(ctx: AdapterContext, fd: number, iovs: number, iovs_len: number, retptr0: number): Promise<number> {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    const mem = ctx.getMemory();
    const view = getView(mem);

    if (entry.kind === FdKind.Stdin) {
        // Read from P3 stdin async iterator
        if (!entry.stdinIterator) {
            view.setUint32(retptr0, 0, true);
            return Errno.Success;
        }

        // Check for buffered partial chunk from previous read
        if (entry.stdinBuf && entry.stdinBuf.length > 0) {
            const bytesWritten = scatterBytes(mem, iovs, iovs_len, entry.stdinBuf);
            if (bytesWritten >= entry.stdinBuf.length) {
                entry.stdinBuf = null;
            } else {
                entry.stdinBuf = entry.stdinBuf.subarray(bytesWritten);
            }
            getView(mem).setUint32(retptr0, bytesWritten, true);
            return Errno.Success;
        }

        const { done, value } = await entry.stdinIterator.next();
        if (done || !value) {
            view.setUint32(retptr0, 0, true);
            return Errno.Success;
        }
        const bytesWritten = scatterBytes(mem, iovs, iovs_len, value);
        if (bytesWritten < value.length) {
            entry.stdinBuf = value.subarray(bytesWritten);
        }
        getView(mem).setUint32(retptr0, bytesWritten, true);
        return Errno.Success;
    }

    if (entry.kind === FdKind.File && entry.desc) {
        try {
            const [stream] = (entry.desc as P3Descriptor).readViaStream(entry.position);
            const iterator = stream[Symbol.asyncIterator]();
            try {
                const { done, value } = await iterator.next();
                if (done || !value) {
                    view.setUint32(retptr0, 0, true);
                    return Errno.Success;
                }
                const bytesWritten = scatterBytes(mem, iovs, iovs_len, value);
                entry.position += BigInt(bytesWritten);
                getView(mem).setUint32(retptr0, bytesWritten, true);
                return Errno.Success;
            } finally {
                if (typeof iterator.return === 'function') iterator.return(undefined);
            }
        } catch (e) {
            return errorCodeToErrno(e);
        }
    }

    view.setUint32(retptr0, 0, true);
    return Errno.Notsup;
}

export async function fd_readdir(ctx: AdapterContext, fd: number, buf: number, buf_len: number, cookie: bigint, retptr0: number): Promise<number> {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    if (!entry.desc && entry.kind !== FdKind.PreopenDir) return Errno.Notdir;
    if (!entry.desc) return Errno.Badf;

    const mem = ctx.getMemory();
    const view = getView(mem);
    try {
        const [dirStream] = (entry.desc as P3Descriptor).readDirectory();
        const dirEntries: { type: { tag: string }; name: string }[] = [];
        for await (const dirEntry of dirStream) {
            dirEntries.push(dirEntry);
        }

        let bufUsed = 0;
        const skip = Number(cookie);
        for (let i = skip; i < dirEntries.length; i++) {
            const dirEntry = dirEntries[i]!;
            const nameBytes = ctx.encoder.encode(dirEntry.name);
            const direntSize = DirentLayout._size;
            if (bufUsed + direntSize <= buf_len) {
                const base = buf + bufUsed;
                view.setBigUint64(base + DirentLayout.d_next.offset, BigInt(i + 1), true);
                view.setBigUint64(base + DirentLayout.d_ino.offset, 0n, true);
                view.setUint32(base + DirentLayout.d_namlen.offset, nameBytes.length, true);
                view.setUint8(base + DirentLayout.d_type.offset, p3DescriptorTypeToFiletype(dirEntry.type.tag));
                bufUsed += direntSize;
            } else {
                bufUsed += direntSize + nameBytes.length;
                continue;
            }
            const nameWriteLen = Math.min(nameBytes.length, buf_len - bufUsed);
            if (nameWriteLen > 0) {
                new Uint8Array(mem.buffer, buf + bufUsed, nameWriteLen).set(nameBytes.subarray(0, nameWriteLen));
            }
            bufUsed += nameBytes.length;
        }
        view.setUint32(retptr0, bufUsed, true);
        return Errno.Success;
    } catch (e) {
        return errorCodeToErrno(e);
    }
}

export function fd_renumber(ctx: AdapterContext, fd: number, to: number): number {
    if (!ctx.fdTable.renumber(fd, to)) return Errno.Badf;
    return Errno.Success;
}

export function fd_seek(ctx: AdapterContext, fd: number, offset: bigint, whence: number, retptr0: number): number {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    if (!entry.desc) return Errno.Spipe;
    const view = getView(ctx.getMemory());
    switch (whence) {
        case Whence.Set:
            entry.position = offset;
            break;
        case Whence.Cur:
            entry.position += offset;
            break;
        case Whence.End:
            // For seek-to-end, we need file size. Since stat() is async,
            // we handle this case by making fd_seek async only when needed.
            // For now, use cached position if possible.
            return Errno.Notsup;
        default:
            return Errno.Inval;
    }
    if (entry.position < 0n) entry.position = 0n;
    view.setBigUint64(retptr0, entry.position, true);
    return Errno.Success;
}

export async function fd_seek_async(ctx: AdapterContext, fd: number, offset: bigint, whence: number, retptr0: number): Promise<number> {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    if (!entry.desc) return Errno.Spipe;
    const view = getView(ctx.getMemory());
    switch (whence) {
        case Whence.Set:
            entry.position = offset;
            break;
        case Whence.Cur:
            entry.position += offset;
            break;
        case Whence.End: {
            try {
                const stat = await (entry.desc as P3Descriptor).stat();
                entry.position = stat.size + offset;
            } catch {
                return Errno.Io;
            }
            break;
        }
        default:
            return Errno.Inval;
    }
    if (entry.position < 0n) entry.position = 0n;
    view.setBigUint64(retptr0, entry.position, true);
    return Errno.Success;
}

export function fd_sync(_ctx: AdapterContext, _fd: number): number {
    return Errno.Success;
}

export function fd_tell(ctx: AdapterContext, fd: number, retptr0: number): number {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    const view = getView(ctx.getMemory());
    view.setBigUint64(retptr0, entry.position, true);
    return Errno.Success;
}

export async function fd_write(ctx: AdapterContext, fd: number, iovs: number, iovs_len: number, retptr0: number): Promise<number> {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    const mem = ctx.getMemory();
    const { data, totalLen } = gatherBytes(mem, iovs, iovs_len);

    if (entry.kind === FdKind.Stdout || entry.kind === FdKind.Stderr) {
        if (entry.writer) {
            await entry.writer.write(data);
        }
        const view = getView(mem);
        view.setUint32(retptr0, totalLen, true);
        return Errno.Success;
    }

    if (entry.kind === FdKind.File && entry.desc) {
        try {
            if (entry.flags & Fdflags.Append) {
                await (entry.desc as P3Descriptor).appendViaStream(readableFromBytes(data));
            } else {
                await (entry.desc as P3Descriptor).writeViaStream(readableFromBytes(data), entry.position);
                entry.position += BigInt(totalLen);
            }
        } catch (e) {
            return errorCodeToErrno(e);
        }
        const view = getView(mem);
        view.setUint32(retptr0, totalLen, true);
        return Errno.Success;
    }

    return Errno.Notsup;
}

// ── Path Operations ────────────────────────────────────────────────

export async function path_create_directory(ctx: AdapterContext, fd: number, path: number, path_len: number): Promise<number> {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    if (!entry.desc) return Errno.Badf;
    const pathStr = readString(ctx.getMemory(), path, path_len);
    try {
        await (entry.desc as P3Descriptor).createDirectoryAt(pathStr);
        return Errno.Success;
    } catch (e) {
        return errorCodeToErrno(e);
    }
}

export async function path_filestat_get(ctx: AdapterContext, fd: number, flags: number, path: number, path_len: number, retptr0: number): Promise<number> {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    if (!entry.desc) return Errno.Badf;
    const pathStr = readString(ctx.getMemory(), path, path_len);
    try {
        const stat = await (entry.desc as P3Descriptor).statAt(
            { symlinkFollow: !!(flags & Lookupflags.SymlinkFollow) },
            pathStr,
        );
        const view = getView(ctx.getMemory());
        writeP3Filestat(view, retptr0, stat);
        return Errno.Success;
    } catch (e) {
        return errorCodeToErrno(e);
    }
}

export async function path_filestat_set_times(ctx: AdapterContext, fd: number, flags: number, path: number, path_len: number, atim: bigint, mtim: bigint, fst_flags: number): Promise<number> {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    if (!entry.desc) return Errno.Badf;
    const pathStr = readString(ctx.getMemory(), path, path_len);
    try {
        const aNow = (fst_flags & Fstflags.AtimNow) ? { tag: 'now' as const }
            : (fst_flags & Fstflags.Atim) ? { tag: 'timestamp' as const, val: { seconds: atim / 1_000_000_000n, nanoseconds: Number(atim % 1_000_000_000n) } }
                : { tag: 'no-change' as const };
        const mNow = (fst_flags & Fstflags.MtimNow) ? { tag: 'now' as const }
            : (fst_flags & Fstflags.Mtim) ? { tag: 'timestamp' as const, val: { seconds: mtim / 1_000_000_000n, nanoseconds: Number(mtim % 1_000_000_000n) } }
                : { tag: 'no-change' as const };
        await (entry.desc as P3Descriptor).setTimesAt(
            { symlinkFollow: !!(flags & Lookupflags.SymlinkFollow) },
            pathStr, aNow, mNow,
        );
        return Errno.Success;
    } catch (e) {
        return errorCodeToErrno(e);
    }
}

export async function path_link(ctx: AdapterContext, old_fd: number, old_flags: number, old_path: number, old_path_len: number, new_fd: number, new_path: number, new_path_len: number): Promise<number> {
    const oldEntry = ctx.fdTable.get(old_fd);
    if (!oldEntry) return Errno.Badf;
    if (!oldEntry.desc) return Errno.Badf;
    const newEntry = ctx.fdTable.get(new_fd);
    if (!newEntry) return Errno.Badf;
    if (!newEntry.desc) return Errno.Badf;
    const mem = ctx.getMemory();
    const oldPathStr = readString(mem, old_path, old_path_len);
    const newPathStr = readString(mem, new_path, new_path_len);
    try {
        await (oldEntry.desc as P3Descriptor).linkAt(
            { symlinkFollow: !!(old_flags & Lookupflags.SymlinkFollow) },
            oldPathStr,
            newEntry.desc as P3Descriptor,
            newPathStr,
        );
        return Errno.Success;
    } catch (e) {
        return errorCodeToErrno(e);
    }
}

export async function path_open(ctx: AdapterContext, fd: number, dirflags: number, path: number, path_len: number, oflags: number, _fs_rights_base: bigint, _fs_rights_inheriting: bigint, fdflags: number, retptr0: number): Promise<number> {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    if (!entry.desc) return Errno.Badf;
    const pathStr = readString(ctx.getMemory(), path, path_len);
    try {
        const newDesc = await (entry.desc as P3Descriptor).openAt(
            { symlinkFollow: !!(dirflags & Lookupflags.SymlinkFollow) },
            pathStr,
            {
                create: !!(oflags & Oflags.Creat),
                exclusive: !!(oflags & Oflags.Excl),
                truncate: !!(oflags & Oflags.Trunc),
                directory: !!(oflags & Oflags.Directory),
            },
            { read: true, write: true, mutateDirectory: true },
        );

        const descType = await newDesc.getType();
        const isDir = descType.tag === 'directory';
        const newFd = ctx.fdTable.allocate({
            kind: isDir ? FdKind.Directory : FdKind.File,
            filetype: isDir ? Filetype.Directory : Filetype.RegularFile,
            flags: fdflags as Fdflags,
            rightsBase: ALL_RIGHTS,
            rightsInheriting: ALL_RIGHTS,
            desc: newDesc,
            position: 0n,
        });

        const view = getView(ctx.getMemory());
        view.setUint32(retptr0, newFd, true);
        return Errno.Success;
    } catch (e) {
        return errorCodeToErrno(e);
    }
}

export async function path_readlink(ctx: AdapterContext, fd: number, path: number, path_len: number, buf: number, buf_len: number, retptr0: number): Promise<number> {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    if (!entry.desc) return Errno.Badf;
    const mem = ctx.getMemory();
    const pathStr = readString(mem, path, path_len);
    try {
        const target = await (entry.desc as P3Descriptor).readlinkAt(pathStr);
        const targetBytes = ctx.encoder.encode(target);
        const writeLen = Math.min(targetBytes.length, buf_len);
        new Uint8Array(mem.buffer, buf, writeLen).set(targetBytes.subarray(0, writeLen));
        const view = getView(mem);
        view.setUint32(retptr0, writeLen, true);
        return Errno.Success;
    } catch (e) {
        return errorCodeToErrno(e);
    }
}

export async function path_remove_directory(ctx: AdapterContext, fd: number, path: number, path_len: number): Promise<number> {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    if (!entry.desc) return Errno.Badf;
    const pathStr = readString(ctx.getMemory(), path, path_len);
    try {
        await (entry.desc as P3Descriptor).removeDirectoryAt(pathStr);
        return Errno.Success;
    } catch (e) {
        return errorCodeToErrno(e);
    }
}

export async function path_rename(ctx: AdapterContext, fd: number, old_path: number, old_path_len: number, new_fd: number, new_path: number, new_path_len: number): Promise<number> {
    const oldEntry = ctx.fdTable.get(fd);
    if (!oldEntry) return Errno.Badf;
    if (!oldEntry.desc) return Errno.Badf;
    const newEntry = ctx.fdTable.get(new_fd);
    if (!newEntry) return Errno.Badf;
    if (!newEntry.desc) return Errno.Badf;
    const mem = ctx.getMemory();
    const oldPathStr = readString(mem, old_path, old_path_len);
    const newPathStr = readString(mem, new_path, new_path_len);
    try {
        await (oldEntry.desc as P3Descriptor).renameAt(oldPathStr, newEntry.desc as P3Descriptor, newPathStr);
        return Errno.Success;
    } catch (e) {
        return errorCodeToErrno(e);
    }
}

export async function path_symlink(ctx: AdapterContext, old_path: number, old_path_len: number, fd: number, new_path: number, new_path_len: number): Promise<number> {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    if (!entry.desc) return Errno.Badf;
    const mem = ctx.getMemory();
    const oldPathStr = readString(mem, old_path, old_path_len);
    const newPathStr = readString(mem, new_path, new_path_len);
    try {
        await (entry.desc as P3Descriptor).symlinkAt(oldPathStr, newPathStr);
        return Errno.Success;
    } catch (e) {
        return errorCodeToErrno(e);
    }
}

export async function path_unlink_file(ctx: AdapterContext, fd: number, path: number, path_len: number): Promise<number> {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    if (!entry.desc) return Errno.Badf;
    const pathStr = readString(ctx.getMemory(), path, path_len);
    try {
        await (entry.desc as P3Descriptor).unlinkFileAt(pathStr);
        return Errno.Success;
    } catch (e) {
        return errorCodeToErrno(e);
    }
}
