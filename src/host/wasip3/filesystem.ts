// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * WASIp3 Filesystem — Descriptor resource + preopens implementation.
 *
 * Maps WIT `wasi:filesystem/types` Descriptor class methods to the
 * IVfsBackend interface. Also implements `wasi:filesystem/preopens`.
 */

import type {
    WasiFilesystemTypes,
    WasiFilesystemPreopens,
} from '../../../wit/wasip3/types/index';
import type { WasiStreamReadable, WasiStreamWritable } from './streams';
import type { HostConfig } from './types';
import type {
    IVfsBackend,
    VfsOpenFlags,
    VfsDescriptorFlags,
    VfsStat,
} from './vfs';
import {
    MemoryVfsBackend,
    VfsNodeType,
    VfsError,
    resolvePathComponents,
} from './vfs';
import { createStreamPair } from './streams';
import { ALLOCATION_DEFAULTS } from './types';

// ──────────────────── Local type aliases ────────────────────
// (avoids inline import() — per project conventions)

type Instant = { seconds: bigint; nanoseconds: number };
type DescriptorType =
    | { tag: 'block-device' }
    | { tag: 'character-device' }
    | { tag: 'directory' }
    | { tag: 'fifo' }
    | { tag: 'symbolic-link' }
    | { tag: 'regular-file' }
    | { tag: 'socket' }
    | { tag: 'other'; val: string | undefined };
type DescriptorFlags = {
    read?: boolean;
    write?: boolean;
    fileIntegritySync?: boolean;
    dataIntegritySync?: boolean;
    requestedWriteSync?: boolean;
    mutateDirectory?: boolean;
};
type PathFlags = { symlinkFollow?: boolean };
type OpenFlags = { create?: boolean; directory?: boolean; exclusive?: boolean; truncate?: boolean };
type DescriptorStat = {
    type: DescriptorType;
    linkCount: bigint;
    size: bigint;
    dataAccessTimestamp?: Instant;
    dataModificationTimestamp?: Instant;
    statusChangeTimestamp?: Instant;
};
type NewTimestamp =
    | { tag: 'no-change' }
    | { tag: 'now' }
    | { tag: 'timestamp'; val: Instant };
type DirectoryEntry = { type: DescriptorType; name: string };
type ErrorCode = { tag: string; val?: string | undefined };
type Advice = 'normal' | 'sequential' | 'random' | 'will-need' | 'dont-need' | 'no-reuse';
type MetadataHashValue = { lower: bigint; upper: bigint };
type Result<T, E> = { tag: 'ok'; val: T } | { tag: 'err'; val: E };
type WasiFuture<T> = Promise<T>;

// ──────────────────── Descriptor flags helpers ────────────────────

const READ_CHUNK_SIZE = 65536;

function vfsTypeToDescriptorType(t: VfsNodeType): DescriptorType {
    switch (t) {
        case VfsNodeType.File: return { tag: 'regular-file' };
        case VfsNodeType.Directory: return { tag: 'directory' };
        case VfsNodeType.Symlink: return { tag: 'symbolic-link' };
        default: return { tag: 'other', val: undefined };
    }
}

function nsToInstant(ns: bigint): Instant {
    const seconds = ns / 1_000_000_000n;
    const nanoseconds = Number(ns % 1_000_000_000n);
    return { seconds, nanoseconds };
}

function instantToNs(instant: Instant): bigint {
    return instant.seconds * 1_000_000_000n + BigInt(instant.nanoseconds);
}

function vfsStatToDescriptorStat(s: VfsStat): DescriptorStat {
    return {
        type: vfsTypeToDescriptorType(s.type),
        linkCount: s.linkCount,
        size: s.size,
        dataAccessTimestamp: nsToInstant(s.accessTime),
        dataModificationTimestamp: nsToInstant(s.modifyTime),
        statusChangeTimestamp: nsToInstant(s.changeTime),
    };
}

function vfsErrorToErrorCode(e: VfsError): ErrorCode {
    return { tag: e.code };
}

function throwFsError(e: unknown): never {
    if (e instanceof VfsError) {
        throw vfsErrorToErrorCode(e);
    }
    throw { tag: 'io' };
}

// ──────────────────── FsDescriptor (implements Descriptor) ────────────────────

/**
 * Represents an open file or directory handle.
 * Dispatches all operations to the VFS backend.
 */
class FsDescriptor {
    private readonly backend: IVfsBackend;
    readonly path: string[];
    readonly flags: DescriptorFlags;
    private readonly maxPathLength: number;
    private dropped: boolean;

    constructor(
        backend: IVfsBackend,
        path: string[],
        flags: DescriptorFlags,
        maxPathLength: number,
    ) {
        this.backend = backend;
        this.path = path;
        this.flags = flags;
        this.maxPathLength = maxPathLength;
        this.dropped = false;
    }

    private ensureNotDropped(): void {
        if (this.dropped) throw { tag: 'bad-descriptor' };
    }

    private ensureWrite(): void {
        if (!this.flags.write) throw { tag: 'read-only' };
    }

    private ensureMutateDir(): void {
        if (!this.flags.mutateDirectory) throw { tag: 'read-only' };
    }

    private resolvePath(pathFlags: PathFlags, relPath: string): string[] {
        if (relPath.includes('\0')) throw { tag: 'invalid' };
        if (relPath.length > this.maxPathLength) throw { tag: 'name-too-long' };
        return resolvePathComponents(this.path, relPath);
    }

    drop(): void {
        this.dropped = true;
    }

    // ─── Stream I/O ───

    readViaStream(offset: bigint): [WasiStreamWritable<Uint8Array>, WasiFuture<Result<void, ErrorCode>>] {
        this.ensureNotDropped();
        if (!this.flags.read) throw { tag: 'access' };

        const pair = createStreamPair<Uint8Array>();
        const backend = this.backend;
        const path = this.path;

        const future: WasiFuture<Result<void, ErrorCode>> = (async () => {
            try {
                let currentOffset = offset;
                for (; ;) {
                    let chunk: Uint8Array;
                    try {
                        chunk = backend.read(path, currentOffset, READ_CHUNK_SIZE);
                    } catch (e) {
                        if (e instanceof VfsError) {
                            pair.error(e);
                            return { tag: 'err' as const, val: vfsErrorToErrorCode(e) };
                        }
                        pair.error(e);
                        return { tag: 'err' as const, val: { tag: 'io' } as ErrorCode };
                    }
                    if (chunk.length === 0) break;
                    await pair.write(chunk);
                    currentOffset += BigInt(chunk.length);
                    if (chunk.length < READ_CHUNK_SIZE) break;
                }
                pair.close();
                return { tag: 'ok' as const, val: undefined as void };
            } catch (e) {
                pair.error(e);
                return { tag: 'err' as const, val: { tag: 'io' } as ErrorCode };
            }
        })();

        return [pair.readable as WasiStreamWritable<Uint8Array>, future];
    }

    writeViaStream(data: WasiStreamReadable<Uint8Array>, offset: bigint): WasiFuture<void> {
        this.ensureNotDropped();
        this.ensureWrite();

        const backend = this.backend;
        const path = this.path;

        return (async () => {
            try {
                let currentOffset = offset;
                for await (const chunk of data) {
                    backend.write(path, chunk, currentOffset);
                    currentOffset += BigInt(chunk.length);
                }
            } catch (e) {
                throwFsError(e);
            }
        })();
    }

    appendViaStream(data: WasiStreamReadable<Uint8Array>): WasiFuture<void> {
        this.ensureNotDropped();
        this.ensureWrite();

        const backend = this.backend;
        const path = this.path;

        return (async () => {
            try {
                for await (const chunk of data) {
                    backend.append(path, chunk);
                }
            } catch (e) {
                throwFsError(e);
            }
        })();
    }

    // ─── Metadata ───

    async advise(_offset: bigint, _length: bigint, _advice: Advice): Promise<void> {
        this.ensureNotDropped();
        // Advisory hints are no-ops for in-memory VFS
    }

    async syncData(): Promise<void> {
        this.ensureNotDropped();
        // No-op for in-memory VFS
    }

    async sync(): Promise<void> {
        this.ensureNotDropped();
        // No-op for in-memory VFS
    }

    async getFlags(): Promise<DescriptorFlags> {
        this.ensureNotDropped();
        return { ...this.flags };
    }

    async getType(): Promise<DescriptorType> {
        this.ensureNotDropped();
        try {
            const s = this.backend.stat(this.path);
            return vfsTypeToDescriptorType(s.type);
        } catch (e) {
            throwFsError(e);
        }
    }

    async setSize(size: bigint): Promise<void> {
        this.ensureNotDropped();
        this.ensureWrite();
        try {
            this.backend.setSize(this.path, size);
        } catch (e) {
            throwFsError(e);
        }
    }

    async setTimes(dataAccessTimestamp: NewTimestamp, dataModificationTimestamp: NewTimestamp): Promise<void> {
        this.ensureNotDropped();
        // Setting times requires write or mutate-directory
        if (!this.flags.write && !this.flags.mutateDirectory) throw { tag: 'not-permitted' };
        try {
            const now = BigInt(Date.now()) * 1_000_000n;
            let atime: bigint | null = null;
            let mtime: bigint | null = null;
            if (dataAccessTimestamp.tag === 'now') atime = now;
            else if (dataAccessTimestamp.tag === 'timestamp') atime = instantToNs(dataAccessTimestamp.val);
            if (dataModificationTimestamp.tag === 'now') mtime = now;
            else if (dataModificationTimestamp.tag === 'timestamp') mtime = instantToNs(dataModificationTimestamp.val);
            this.backend.setTimes(this.path, atime, mtime);
        } catch (e) {
            throwFsError(e);
        }
    }

    async stat(): Promise<DescriptorStat> {
        this.ensureNotDropped();
        try {
            return vfsStatToDescriptorStat(this.backend.stat(this.path));
        } catch (e) {
            throwFsError(e);
        }
    }

    async statAt(pathFlags: PathFlags, path: string): Promise<DescriptorStat> {
        this.ensureNotDropped();
        try {
            const resolved = this.resolvePath(pathFlags, path);
            return vfsStatToDescriptorStat(this.backend.stat(resolved));
        } catch (e) {
            throwFsError(e);
        }
    }

    async setTimesAt(
        pathFlags: PathFlags,
        path: string,
        dataAccessTimestamp: NewTimestamp,
        dataModificationTimestamp: NewTimestamp,
    ): Promise<void> {
        this.ensureNotDropped();
        this.ensureMutateDir();
        try {
            const resolved = this.resolvePath(pathFlags, path);
            const now = BigInt(Date.now()) * 1_000_000n;
            let atime: bigint | null = null;
            let mtime: bigint | null = null;
            if (dataAccessTimestamp.tag === 'now') atime = now;
            else if (dataAccessTimestamp.tag === 'timestamp') atime = instantToNs(dataAccessTimestamp.val);
            if (dataModificationTimestamp.tag === 'now') mtime = now;
            else if (dataModificationTimestamp.tag === 'timestamp') mtime = instantToNs(dataModificationTimestamp.val);
            this.backend.setTimes(resolved, atime, mtime);
        } catch (e) {
            throwFsError(e);
        }
    }

    // ─── Directory operations ───

    readDirectory(): [WasiStreamWritable<DirectoryEntry>, WasiFuture<Result<void, ErrorCode>>] {
        this.ensureNotDropped();

        const pair = createStreamPair<DirectoryEntry>();
        const backend = this.backend;
        const path = this.path;

        const future: WasiFuture<Result<void, ErrorCode>> = (async () => {
            try {
                const entries = backend.readDirectory(path);
                for (const entry of entries) {
                    await pair.write({
                        type: vfsTypeToDescriptorType(entry.type),
                        name: entry.name,
                    });
                }
                pair.close();
                return { tag: 'ok' as const, val: undefined as void };
            } catch (e) {
                if (e instanceof VfsError) {
                    pair.error(e);
                    return { tag: 'err' as const, val: vfsErrorToErrorCode(e) };
                }
                pair.error(e);
                return { tag: 'err' as const, val: { tag: 'io' } as ErrorCode };
            }
        })();

        return [pair.readable as WasiStreamWritable<DirectoryEntry>, future];
    }

    async createDirectoryAt(path: string): Promise<void> {
        this.ensureNotDropped();
        this.ensureMutateDir();
        try {
            const resolved = resolvePathComponents(this.path, path);
            if (resolved.length === 0) throw new VfsError('exist');
            const parentPath = resolved.slice(0, -1);
            const name = resolved[resolved.length - 1]!;
            this.backend.createDirectory(parentPath, name);
        } catch (e) {
            throwFsError(e);
        }
    }

    async removeDirectoryAt(path: string): Promise<void> {
        this.ensureNotDropped();
        this.ensureMutateDir();
        try {
            const resolved = resolvePathComponents(this.path, path);
            if (resolved.length === 0) throw new VfsError('not-permitted', 'cannot remove root');
            const parentPath = resolved.slice(0, -1);
            const name = resolved[resolved.length - 1]!;
            this.backend.removeDirectory(parentPath, name);
        } catch (e) {
            throwFsError(e);
        }
    }

    async unlinkFileAt(path: string): Promise<void> {
        this.ensureNotDropped();
        this.ensureMutateDir();
        try {
            const resolved = resolvePathComponents(this.path, path);
            if (resolved.length === 0) throw new VfsError('not-permitted', 'cannot unlink root');
            const parentPath = resolved.slice(0, -1);
            const name = resolved[resolved.length - 1]!;
            this.backend.unlinkFile(parentPath, name);
        } catch (e) {
            throwFsError(e);
        }
    }

    // ─── File operations ───

    async openAt(pathFlags: PathFlags, path: string, openFlags: OpenFlags, flags: DescriptorFlags): Promise<FsDescriptor> {
        this.ensureNotDropped();
        // Write/create/truncate require mutate-directory
        if ((flags.write || flags.mutateDirectory || openFlags.create || openFlags.truncate) && !this.flags.mutateDirectory) {
            throw { tag: 'read-only' };
        }
        try {
            const vfsOpen: VfsOpenFlags = {
                create: openFlags.create,
                exclusive: openFlags.exclusive,
                truncate: openFlags.truncate,
                directory: openFlags.directory,
            };
            const vfsDesc: VfsDescriptorFlags = {
                read: flags.read,
                write: flags.write,
                mutateDirectory: flags.mutateDirectory,
            };
            const result = this.backend.openAt(
                this.path, path, vfsOpen, vfsDesc,
                pathFlags.symlinkFollow ?? false,
            );
            return new FsDescriptor(this.backend, result.path, flags, this.maxPathLength);
        } catch (e) {
            throwFsError(e);
        }
    }

    async linkAt(oldPathFlags: PathFlags, oldPath: string, newDescriptor: FsDescriptor, newPath: string): Promise<void> {
        this.ensureNotDropped();
        newDescriptor.ensureNotDropped();
        newDescriptor.ensureMutateDir();
        try {
            const resolvedOld = this.resolvePath(oldPathFlags, oldPath);
            const resolvedNew = resolvePathComponents(newDescriptor.path, newPath);
            if (resolvedNew.length === 0) throw new VfsError('exist');
            const newParentPath = resolvedNew.slice(0, -1);
            const newName = resolvedNew[resolvedNew.length - 1]!;
            this.backend.linkAt(resolvedOld, newParentPath, newName);
        } catch (e) {
            throwFsError(e);
        }
    }

    async symlinkAt(oldPath: string, newPath: string): Promise<void> {
        this.ensureNotDropped();
        this.ensureMutateDir();
        try {
            const resolved = resolvePathComponents(this.path, newPath);
            if (resolved.length === 0) throw new VfsError('invalid');
            const parentPath = resolved.slice(0, -1);
            const name = resolved[resolved.length - 1]!;
            this.backend.symlinkAt(parentPath, oldPath, name);
        } catch (e) {
            throwFsError(e);
        }
    }

    async readlinkAt(path: string): Promise<string> {
        this.ensureNotDropped();
        try {
            const resolved = resolvePathComponents(this.path, path);
            if (resolved.length === 0) throw new VfsError('invalid', 'cannot readlink root');
            const parentPath = resolved.slice(0, -1);
            const name = resolved[resolved.length - 1]!;
            return this.backend.readlinkAt(parentPath, name);
        } catch (e) {
            throwFsError(e);
        }
    }

    async renameAt(oldPath: string, newDescriptor: FsDescriptor, newPath: string): Promise<void> {
        this.ensureNotDropped();
        this.ensureMutateDir();
        newDescriptor.ensureNotDropped();
        newDescriptor.ensureMutateDir();
        try {
            const resolvedOld = resolvePathComponents(this.path, oldPath);
            const resolvedNew = resolvePathComponents(newDescriptor.path, newPath);
            if (resolvedOld.length === 0 || resolvedNew.length === 0) throw new VfsError('not-permitted');
            const oldDirPath = resolvedOld.slice(0, -1);
            const oldName = resolvedOld[resolvedOld.length - 1]!;
            const newDirPath = resolvedNew.slice(0, -1);
            const newName = resolvedNew[resolvedNew.length - 1]!;
            this.backend.rename(oldDirPath, oldName, newDirPath, newName);
        } catch (e) {
            throwFsError(e);
        }
    }

    // ─── Identity ───

    async isSameObject(other: FsDescriptor): Promise<boolean> {
        this.ensureNotDropped();
        other.ensureNotDropped();
        try {
            return this.backend.isSameNode(this.path, other.path);
        } catch (e) {
            throwFsError(e);
        }
    }

    async metadataHash(): Promise<MetadataHashValue> {
        this.ensureNotDropped();
        try {
            return this.backend.metadataHash(this.path);
        } catch (e) {
            throwFsError(e);
        }
    }

    async metadataHashAt(pathFlags: PathFlags, path: string): Promise<MetadataHashValue> {
        this.ensureNotDropped();
        try {
            const resolved = this.resolvePath(pathFlags, path);
            return this.backend.metadataHash(resolved);
        } catch (e) {
            throwFsError(e);
        }
    }
}

// ──────────────────── Factory functions ────────────────────

/** @internal Used by node/filesystem-node.ts */
export { FsDescriptor as _FsDescriptor };

export interface FilesystemState {
    backend: MemoryVfsBackend;
    preopens: Array<[FsDescriptor, string]>;
}

/**
 * Initialize the filesystem from config, returning shared state.
 */
export function initFilesystem(config?: HostConfig): FilesystemState {
    const backend = new MemoryVfsBackend({ limits: config?.limits });
    const maxPathLength = config?.limits?.maxPathLength ?? ALLOCATION_DEFAULTS.maxPathLength;

    // Populate from config.fs
    if (config?.fs) {
        backend.populateFromMap(config.fs);
    }

    // Create preopens — default: preopen root as '/'
    const preopens: Array<[FsDescriptor, string]> = [];
    const rootDesc = new FsDescriptor(backend, [], {
        read: true,
        write: true,
        mutateDirectory: true,
    }, maxPathLength);
    preopens.push([rootDesc, '/']);

    return { backend, preopens };
}

/**
 * Create the `wasi:filesystem/preopens` interface.
 */
export function createPreopens(state: FilesystemState): typeof WasiFilesystemPreopens {
    return {
        getDirectories(): Array<[WasiFilesystemTypes.Descriptor, string]> {
            // Cast FsDescriptor to the WIT Descriptor type
            return state.preopens as unknown as Array<[WasiFilesystemTypes.Descriptor, string]>;
        },
    };
}

/**
 * Create the `wasi:filesystem/types` interface.
 *
 * The WIT interface is essentially the Descriptor class with its static
 * type exports. We provide the Descriptor class constructor that creates
 * descriptors backed by the VFS.
 */
export function createFilesystemTypes(_state: FilesystemState): typeof WasiFilesystemTypes {
    // The WIT type expects `typeof WasiFilesystemTypes` which includes the Descriptor class
    // All the type-only exports (ErrorCode, DescriptorType, etc.) are compile-time only.
    // The runtime export is the Descriptor class.
    return {
        Descriptor: FsDescriptor as unknown as typeof WasiFilesystemTypes.Descriptor,
    } as typeof WasiFilesystemTypes;
}
