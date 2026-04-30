// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import type { AdapterContext } from './adapter-context';
import {
    Errno, Whence, Filetype, Fdflags, Lookupflags, Oflags, Fstflags,
    FdstatLayout, FilestatLayout, DirentLayout,
} from './types/wasi-snapshot-preview1';
import { getView, gatherBytes, readString } from './memory';
import { FdKind, ALL_RIGHTS } from './fd-table';
import { VfsNodeType, resolvePathComponents } from '../wasip3/vfs';
import { vfsErrorToErrno, vfsNodeTypeToFiletype, writeFilestat, vfsReadScatter, vfsReadScatterAt, vfsWriteGatherAt } from './vfs-helpers';

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

export function fd_filestat_get(ctx: AdapterContext, fd: number, retptr0: number): number {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    const view = getView(ctx.getMemory());
    if (entry.vfsPath) {
        try {
            const stat = ctx.vfs.stat(entry.vfsPath);
            writeFilestat(view, retptr0, stat);
            return Errno.Success;
        } catch (e) {
            return vfsErrorToErrno(e);
        }
    }
    for (let i = 0; i < FilestatLayout._size; i++) {
        view.setUint8(retptr0 + i, 0);
    }
    view.setUint8(retptr0 + FilestatLayout.filetype.offset, entry.filetype);
    view.setBigUint64(retptr0 + FilestatLayout.nlink.offset, 1n, true);
    return Errno.Success;
}

export function fd_filestat_set_size(ctx: AdapterContext, fd: number, size: bigint): number {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    if (!entry.vfsPath) return Errno.Notsup;
    try {
        ctx.vfs.setSize(entry.vfsPath, size);
        return Errno.Success;
    } catch (e) {
        return vfsErrorToErrno(e);
    }
}

export function fd_filestat_set_times(ctx: AdapterContext, fd: number, atim: bigint, mtim: bigint, fst_flags: number): number {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    if (!entry.vfsPath) return Errno.Notsup;
    try {
        const aNow = (fst_flags & Fstflags.AtimNow) ? BigInt(Date.now()) * 1_000_000n :
            (fst_flags & Fstflags.Atim) ? atim : null;
        const mNow = (fst_flags & Fstflags.MtimNow) ? BigInt(Date.now()) * 1_000_000n :
            (fst_flags & Fstflags.Mtim) ? mtim : null;
        ctx.vfs.setTimes(entry.vfsPath, aNow, mNow);
        return Errno.Success;
    } catch (e) {
        return vfsErrorToErrno(e);
    }
}

export function fd_pread(ctx: AdapterContext, fd: number, iovs: number, iovs_len: number, offset: bigint, retptr0: number): number {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    const mem = ctx.getMemory();
    if (entry.kind === FdKind.File && entry.vfsPath) {
        return vfsReadScatterAt(ctx, entry.vfsPath, offset, mem, iovs, iovs_len, retptr0);
    }
    const view = getView(mem);
    view.setUint32(retptr0, 0, true);
    return Errno.Notsup;
}

export function fd_pwrite(ctx: AdapterContext, fd: number, iovs: number, iovs_len: number, offset: bigint, retptr0: number): number {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    const mem = ctx.getMemory();
    if (entry.kind === FdKind.File && entry.vfsPath) {
        return vfsWriteGatherAt(ctx, entry.vfsPath, offset, mem, iovs, iovs_len, retptr0);
    }
    const view = getView(mem);
    view.setUint32(retptr0, 0, true);
    return Errno.Notsup;
}

export function fd_read(ctx: AdapterContext, fd: number, iovs: number, iovs_len: number, retptr0: number): number {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    const mem = ctx.getMemory();
    const view = getView(mem);
    if (entry.kind === FdKind.Stdin) {
        view.setUint32(retptr0, 0, true);
        return Errno.Success;
    }
    if (entry.kind === FdKind.File && entry.vfsPath) {
        return vfsReadScatter(ctx, entry, mem, iovs, iovs_len, retptr0);
    }
    view.setUint32(retptr0, 0, true);
    return Errno.Notsup;
}

export function fd_readdir(ctx: AdapterContext, fd: number, buf: number, buf_len: number, cookie: bigint, retptr0: number): number {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    if (!entry.vfsPath && entry.kind !== FdKind.PreopenDir) return Errno.Notdir;
    const dirPath = entry.vfsPath ?? [];
    const mem = ctx.getMemory();
    const view = getView(mem);
    try {
        const entries = ctx.vfs.readDirectory(dirPath);
        let bufUsed = 0;
        const skip = Number(cookie);
        for (let i = skip; i < entries.length; i++) {
            const dirEntry = entries[i]!;
            const nameBytes = ctx.encoder.encode(dirEntry.name);
            const direntSize = DirentLayout._size;
            if (bufUsed + direntSize <= buf_len) {
                const base = buf + bufUsed;
                view.setBigUint64(base + DirentLayout.d_next.offset, BigInt(i + 1), true);
                view.setBigUint64(base + DirentLayout.d_ino.offset, 0n, true);
                view.setUint32(base + DirentLayout.d_namlen.offset, nameBytes.length, true);
                view.setUint8(base + DirentLayout.d_type.offset, vfsNodeTypeToFiletype(dirEntry.type));
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
        return vfsErrorToErrno(e);
    }
}

export function fd_renumber(ctx: AdapterContext, fd: number, to: number): number {
    if (!ctx.fdTable.renumber(fd, to)) return Errno.Badf;
    return Errno.Success;
}

export function fd_seek(ctx: AdapterContext, fd: number, offset: bigint, whence: number, retptr0: number): number {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    const view = getView(ctx.getMemory());
    switch (whence) {
        case Whence.Set:
            entry.position = offset;
            break;
        case Whence.Cur:
            entry.position += offset;
            break;
        case Whence.End: {
            let fileSize = 0n;
            if (entry.vfsPath) {
                try {
                    const stat = ctx.vfs.stat(entry.vfsPath);
                    fileSize = stat.size;
                } catch {
                    return Errno.Io;
                }
            }
            entry.position = fileSize + offset;
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

export function fd_write(ctx: AdapterContext, fd: number, iovs: number, iovs_len: number, retptr0: number): number {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    const mem = ctx.getMemory();
    const { data, totalLen } = gatherBytes(mem, iovs, iovs_len);
    if (entry.kind === FdKind.Stdout) {
        ctx.stdoutChunks.push(data);
    } else if (entry.kind === FdKind.Stderr) {
        ctx.stderrChunks.push(data);
    } else if (entry.kind === FdKind.File && entry.vfsPath) {
        try {
            if (entry.flags & Fdflags.Append) {
                ctx.vfs.append(entry.vfsPath, data);
            } else {
                ctx.vfs.write(entry.vfsPath, data, entry.position);
                entry.position += BigInt(totalLen);
            }
        } catch (e) {
            return vfsErrorToErrno(e);
        }
    } else {
        return Errno.Notsup;
    }
    const view = getView(mem);
    view.setUint32(retptr0, totalLen, true);
    return Errno.Success;
}

// ── Path Operations ────────────────────────────────────────────────

export function path_create_directory(ctx: AdapterContext, fd: number, path: number, path_len: number): number {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    const dirPath = entry.vfsPath ?? [];
    const pathStr = readString(ctx.getMemory(), path, path_len);
    try {
        const resolved = resolvePathComponents(dirPath, pathStr);
        if (resolved.length === 0) return Errno.Exist;
        const parentPath = resolved.slice(0, -1);
        const name = resolved[resolved.length - 1]!;
        ctx.vfs.createDirectory(parentPath, name);
        return Errno.Success;
    } catch (e) {
        return vfsErrorToErrno(e);
    }
}

export function path_filestat_get(ctx: AdapterContext, fd: number, flags: number, path: number, path_len: number, retptr0: number): number {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    const dirPath = entry.vfsPath ?? [];
    const pathStr = readString(ctx.getMemory(), path, path_len);
    try {
        const resolved = resolvePathComponents(dirPath, pathStr);
        const followSymlinks = !!(flags & Lookupflags.SymlinkFollow);
        const node = resolved.length === 0
            ? ctx.vfs.stat([])
            : ctx.vfs.stat(followSymlinks ? resolved : resolved);
        const view = getView(ctx.getMemory());
        writeFilestat(view, retptr0, node);
        return Errno.Success;
    } catch (e) {
        return vfsErrorToErrno(e);
    }
}

export function path_filestat_set_times(ctx: AdapterContext, fd: number, _flags: number, path: number, path_len: number, atim: bigint, mtim: bigint, fst_flags: number): number {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    const dirPath = entry.vfsPath ?? [];
    const pathStr = readString(ctx.getMemory(), path, path_len);
    try {
        const resolved = resolvePathComponents(dirPath, pathStr);
        const aNow = (fst_flags & Fstflags.AtimNow) ? BigInt(Date.now()) * 1_000_000n :
            (fst_flags & Fstflags.Atim) ? atim : null;
        const mNow = (fst_flags & Fstflags.MtimNow) ? BigInt(Date.now()) * 1_000_000n :
            (fst_flags & Fstflags.Mtim) ? mtim : null;
        ctx.vfs.setTimes(resolved, aNow, mNow);
        return Errno.Success;
    } catch (e) {
        return vfsErrorToErrno(e);
    }
}

export function path_link(ctx: AdapterContext, old_fd: number, _old_flags: number, old_path: number, old_path_len: number, new_fd: number, new_path: number, new_path_len: number): number {
    const oldEntry = ctx.fdTable.get(old_fd);
    if (!oldEntry) return Errno.Badf;
    const newEntry = ctx.fdTable.get(new_fd);
    if (!newEntry) return Errno.Badf;
    const mem = ctx.getMemory();
    const oldPathStr = readString(mem, old_path, old_path_len);
    const newPathStr = readString(mem, new_path, new_path_len);
    try {
        const oldResolved = resolvePathComponents(oldEntry.vfsPath ?? [], oldPathStr);
        const newResolved = resolvePathComponents(newEntry.vfsPath ?? [], newPathStr);
        if (newResolved.length === 0) return Errno.Exist;
        const newParent = newResolved.slice(0, -1);
        const newName = newResolved[newResolved.length - 1]!;
        ctx.vfs.linkAt(oldResolved, newParent, newName);
        return Errno.Success;
    } catch (e) {
        return vfsErrorToErrno(e);
    }
}

export function path_open(ctx: AdapterContext, fd: number, dirflags: number, path: number, path_len: number, oflags: number, _fs_rights_base: bigint, _fs_rights_inheriting: bigint, fdflags: number, retptr0: number): number {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    const dirPath = entry.vfsPath ?? [];
    const pathStr = readString(ctx.getMemory(), path, path_len);
    try {
        const followSymlinks = !!(dirflags & Lookupflags.SymlinkFollow);
        const result = ctx.vfs.openAt(dirPath, pathStr, {
            create: !!(oflags & Oflags.Creat),
            exclusive: !!(oflags & Oflags.Excl),
            truncate: !!(oflags & Oflags.Trunc),
            directory: !!(oflags & Oflags.Directory),
        }, {
            read: true,
            write: true,
            mutateDirectory: true,
        }, followSymlinks);

        const isDir = result.node.type === VfsNodeType.Directory;
        const newFd = ctx.fdTable.allocate({
            kind: isDir ? FdKind.Directory : FdKind.File,
            filetype: isDir ? Filetype.Directory : Filetype.RegularFile,
            flags: fdflags as Fdflags,
            rightsBase: ALL_RIGHTS,
            rightsInheriting: ALL_RIGHTS,
            vfsPath: result.path,
            position: 0n,
        });

        const view = getView(ctx.getMemory());
        view.setUint32(retptr0, newFd, true);
        return Errno.Success;
    } catch (e) {
        return vfsErrorToErrno(e);
    }
}

export function path_readlink(ctx: AdapterContext, fd: number, path: number, path_len: number, buf: number, buf_len: number, retptr0: number): number {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    const dirPath = entry.vfsPath ?? [];
    const mem = ctx.getMemory();
    const pathStr = readString(mem, path, path_len);
    try {
        const resolved = resolvePathComponents(dirPath, pathStr);
        if (resolved.length === 0) return Errno.Inval;
        const parentPath = resolved.slice(0, -1);
        const name = resolved[resolved.length - 1]!;
        const target = ctx.vfs.readlinkAt(parentPath, name);
        const targetBytes = ctx.encoder.encode(target);
        const writeLen = Math.min(targetBytes.length, buf_len);
        new Uint8Array(mem.buffer, buf, writeLen).set(targetBytes.subarray(0, writeLen));
        const view = getView(mem);
        view.setUint32(retptr0, writeLen, true);
        return Errno.Success;
    } catch (e) {
        return vfsErrorToErrno(e);
    }
}

export function path_remove_directory(ctx: AdapterContext, fd: number, path: number, path_len: number): number {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    const dirPath = entry.vfsPath ?? [];
    const pathStr = readString(ctx.getMemory(), path, path_len);
    try {
        const resolved = resolvePathComponents(dirPath, pathStr);
        if (resolved.length === 0) return Errno.Perm;
        const parentPath = resolved.slice(0, -1);
        const name = resolved[resolved.length - 1]!;
        ctx.vfs.removeDirectory(parentPath, name);
        return Errno.Success;
    } catch (e) {
        return vfsErrorToErrno(e);
    }
}

export function path_rename(ctx: AdapterContext, fd: number, old_path: number, old_path_len: number, new_fd: number, new_path: number, new_path_len: number): number {
    const oldEntry = ctx.fdTable.get(fd);
    if (!oldEntry) return Errno.Badf;
    const newEntry = ctx.fdTable.get(new_fd);
    if (!newEntry) return Errno.Badf;
    const mem = ctx.getMemory();
    const oldPathStr = readString(mem, old_path, old_path_len);
    const newPathStr = readString(mem, new_path, new_path_len);
    try {
        const oldResolved = resolvePathComponents(oldEntry.vfsPath ?? [], oldPathStr);
        const newResolved = resolvePathComponents(newEntry.vfsPath ?? [], newPathStr);
        if (oldResolved.length === 0 || newResolved.length === 0) return Errno.Perm;
        const oldDir = oldResolved.slice(0, -1);
        const oldName = oldResolved[oldResolved.length - 1]!;
        const newDir = newResolved.slice(0, -1);
        const newName = newResolved[newResolved.length - 1]!;
        ctx.vfs.rename(oldDir, oldName, newDir, newName);
        return Errno.Success;
    } catch (e) {
        return vfsErrorToErrno(e);
    }
}

export function path_symlink(ctx: AdapterContext, old_path: number, old_path_len: number, fd: number, new_path: number, new_path_len: number): number {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    const dirPath = entry.vfsPath ?? [];
    const mem = ctx.getMemory();
    const oldPathStr = readString(mem, old_path, old_path_len);
    const newPathStr = readString(mem, new_path, new_path_len);
    try {
        const newResolved = resolvePathComponents(dirPath, newPathStr);
        if (newResolved.length === 0) return Errno.Inval;
        const parentPath = newResolved.slice(0, -1);
        const name = newResolved[newResolved.length - 1]!;
        ctx.vfs.symlinkAt(parentPath, oldPathStr, name);
        return Errno.Success;
    } catch (e) {
        return vfsErrorToErrno(e);
    }
}

export function path_unlink_file(ctx: AdapterContext, fd: number, path: number, path_len: number): number {
    const entry = ctx.fdTable.get(fd);
    if (!entry) return Errno.Badf;
    const dirPath = entry.vfsPath ?? [];
    const pathStr = readString(ctx.getMemory(), path, path_len);
    try {
        const resolved = resolvePathComponents(dirPath, pathStr);
        if (resolved.length === 0) return Errno.Perm;
        const parentPath = resolved.slice(0, -1);
        const name = resolved[resolved.length - 1]!;
        ctx.vfs.unlinkFile(parentPath, name);
        return Errno.Success;
    } catch (e) {
        return vfsErrorToErrno(e);
    }
}
