// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { Filetype, Fdflags, Rights } from './types/wasi-snapshot-preview1';
import type { StreamPair } from '../wasip3/streams';

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
    /** Current file position for seekable FDs */
    position: bigint
    /** P3 Descriptor for file/directory/preopen FDs */
    desc?: unknown
    /** For preopened directories: the guest-visible path */
    preopenPath?: string
    /** Stdout/Stderr: stream pair writer */
    writer?: StreamPair<Uint8Array>
    /** Stdin: async iterator from P3 stdin stream */
    stdinIterator?: AsyncIterableIterator<Uint8Array>
    /** Stdin: buffered partial chunk from previous read */
    stdinBuf?: Uint8Array | null
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
