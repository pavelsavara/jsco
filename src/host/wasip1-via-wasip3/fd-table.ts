// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { Filetype, Fdflags, Rights } from './types/wasi-snapshot-preview1';

export const enum FdKind {
    Stdin = 0,
    Stdout = 1,
    Stderr = 2,
    PreopenDir = 3,
    File = 4,
    Directory = 5,
}

export type FdEntry = {
    kind: FdKind
    filetype: Filetype
    flags: Fdflags
    rightsBase: Rights
    rightsInheriting: Rights
    /** For preopened directories: the guest-visible path */
    preopenPath?: string
    /** VFS path components for file/directory FDs */
    vfsPath?: string[]
    /** Current file position for seekable FDs */
    position: bigint
}

export class FdTable {
    private entries: Map<number, FdEntry> = new Map();
    private nextFd = 0;

    allocate(entry: FdEntry): number {
        const fd = this.nextFd++;
        this.entries.set(fd, entry);
        return fd;
    }

    get(fd: number): FdEntry | undefined {
        return this.entries.get(fd);
    }

    close(fd: number): boolean {
        return this.entries.delete(fd);
    }

    renumber(from: number, to: number): boolean {
        const entry = this.entries.get(from);
        if (!entry) return false;
        this.entries.delete(from);
        this.entries.set(to, entry);
        return true;
    }

    /** Iterate over all preopened directory FDs (for fd_prestat_get enumeration) */
    preopens(): [number, FdEntry][] {
        const result: [number, FdEntry][] = [];
        for (const [fd, entry] of this.entries) {
            if (entry.kind === FdKind.PreopenDir) {
                result.push([fd, entry]);
            }
        }
        return result;
    }
}

export const ALL_RIGHTS = Rights.FdDatasync | Rights.FdRead | Rights.FdSeek | Rights.FdFdstatSetFlags
    | Rights.FdSync | Rights.FdTell | Rights.FdWrite | Rights.FdAdvise | Rights.FdAllocate
    | Rights.PathCreateDirectory | Rights.PathCreateFile | Rights.PathLinkSource
    | Rights.PathLinkTarget | Rights.PathOpen | Rights.FdReaddir | Rights.PathReadlink
    | Rights.PathRenameSource | Rights.PathRenameTarget | Rights.PathFilestatGet
    | Rights.PathFilestatSetSize | Rights.PathFilestatSetTimes | Rights.FdFilestatGet
    | Rights.FdFilestatSetSize | Rights.FdFilestatSetTimes | Rights.PathSymlink
    | Rights.PathRemoveDirectory | Rights.PathUnlinkFile | Rights.PollFdReadwrite
    | Rights.SockShutdown | Rights.SockAccept;

/**
 * Create a pre-populated FD table with stdin(0), stdout(1), stderr(2), and root preopen(3).
 */
export function createDefaultFdTable(): FdTable {
    const table = new FdTable();

    // fd 0 = stdin
    table.allocate({
        kind: FdKind.Stdin,
        filetype: Filetype.CharacterDevice,
        flags: 0 as Fdflags,
        rightsBase: Rights.FdRead | Rights.PollFdReadwrite,
        rightsInheriting: 0 as Rights,
        position: 0n,
    });

    // fd 1 = stdout
    table.allocate({
        kind: FdKind.Stdout,
        filetype: Filetype.CharacterDevice,
        flags: Fdflags.Append,
        rightsBase: Rights.FdWrite | Rights.PollFdReadwrite,
        rightsInheriting: 0 as Rights,
        position: 0n,
    });

    // fd 2 = stderr
    table.allocate({
        kind: FdKind.Stderr,
        filetype: Filetype.CharacterDevice,
        flags: Fdflags.Append,
        rightsBase: Rights.FdWrite | Rights.PollFdReadwrite,
        rightsInheriting: 0 as Rights,
        position: 0n,
    });

    // fd 3 = preopened root directory '/'
    table.allocate({
        kind: FdKind.PreopenDir,
        filetype: Filetype.Directory,
        flags: 0 as Fdflags,
        rightsBase: ALL_RIGHTS,
        rightsInheriting: ALL_RIGHTS,
        preopenPath: '/',
        vfsPath: [],
        position: 0n,
    });

    return table;
}
