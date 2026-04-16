// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * WASIp3 Filesystem — Node.js real-filesystem backend.
 *
 * `NodeFsBackend` implements `IVfsBackend`, delegating all operations
 * to `node:fs` (synchronous). Each instance is rooted at a host directory.
 *
 * Security:
 * - All guest paths are resolved relative to the mount root.
 * - `..` traversal above the root is rejected lexically.
 * - Symlinks/junctions are resolved via `fs.realpathSync` and verified
 *   to remain within the mount boundary.
 *
 * Gaps vs wasmtime:
 * - No file locking (advisory-lock / unlock)
 * - No permissions model (all access determined by OS permissions)
 * - No preopened file descriptors (only directories)
 */

import * as fs from 'node:fs';
import * as nodePath from 'node:path';

import type {
    IVfsBackend,
    VfsStat,
    VfsDirectoryEntry,
    VfsOpenResult,
    VfsOpenFlags,
    VfsDescriptorFlags,
} from '../vfs';
import { VfsNodeType, VfsError, resolvePathComponents, createFileNode, createDirectoryNode } from '../vfs';
import type { AllocationLimits, MountConfig } from '../types';
import { ALLOCATION_DEFAULTS } from '../types';
import { _FsDescriptor as FsDescriptor } from '../filesystem';
import type { FilesystemState } from '../filesystem';

// ──────────────────── Error mapping ────────────────────

function mapNodeError(e: unknown): never {
    if (e instanceof VfsError) throw e;
    const err = e as NodeJS.ErrnoException;
    switch (err.code) {
        case 'ENOENT': throw new VfsError('no-entry');
        case 'EEXIST': throw new VfsError('exist');
        case 'EISDIR': throw new VfsError('is-directory');
        case 'ENOTDIR': throw new VfsError('not-directory');
        case 'ENOTEMPTY': throw new VfsError('not-empty');
        case 'EACCES': case 'EPERM': throw new VfsError('access');
        case 'ENOSPC': throw new VfsError('insufficient-space');
        case 'EBADF': throw new VfsError('bad-descriptor');
        case 'ELOOP': throw new VfsError('loop');
        case 'ENAMETOOLONG': throw new VfsError('name-too-long');
        case 'EROFS': throw new VfsError('read-only');
        case 'EXDEV': throw new VfsError('cross-device');
        case 'EINVAL': throw new VfsError('invalid');
        default: throw new VfsError('io', `${err.code}: ${err.message}`);
    }
}

// ──────────────────── Path security ────────────────────

/**
 * Safely resolve guest path components to an absolute host path within
 * the mount root. Prevents `..` escape and symlink/junction escape.
 *
 * @param hostRoot Absolute host path of the mount root.
 * @param parts Guest path components (already `.` / `..` resolved by the
 *              VFS resolvePathComponents helper).
 * @returns Absolute host path.
 * @throws VfsError('access') if the resolved path escapes the mount.
 */
function safeResolve(hostRoot: string, parts: string[]): string {
    const resolved = nodePath.resolve(hostRoot, ...parts);
    const normalizedRoot = nodePath.resolve(hostRoot);

    // Lexical containment check
    if (resolved !== normalizedRoot &&
        !resolved.startsWith(normalizedRoot + nodePath.sep)) {
        throw new VfsError('access', 'path escapes mount');
    }

    // Symlink/junction containment check
    try {
        const realPath = fs.realpathSync(resolved);
        const realRoot = fs.realpathSync(normalizedRoot);
        if (realPath !== realRoot &&
            !realPath.startsWith(realRoot + nodePath.sep)) {
            throw new VfsError('access', 'symlink escapes mount');
        }
        return realPath;
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
            // Path doesn't exist yet — verify parent is safe
            const parentDir = nodePath.dirname(resolved);
            try {
                const realParent = fs.realpathSync(parentDir);
                const realRoot = fs.realpathSync(normalizedRoot);
                if (realParent !== realRoot &&
                    !realParent.startsWith(realRoot + nodePath.sep)) {
                    throw new VfsError('access', 'parent escapes mount');
                }
                return nodePath.join(realParent, nodePath.basename(resolved));
            } catch (e2) {
                if (e2 instanceof VfsError) throw e2;
                throw new VfsError('no-entry');
            }
        }
        if (e instanceof VfsError) throw e;
        throw new VfsError('io', (e as Error).message);
    }
}

// ──────────────────── Stats conversion ────────────────────

function statsToVfsStat(stats: fs.Stats): VfsStat {
    let type: VfsNodeType;
    if (stats.isFile()) type = VfsNodeType.File;
    else if (stats.isDirectory()) type = VfsNodeType.Directory;
    else if (stats.isSymbolicLink()) type = VfsNodeType.Symlink;
    else type = VfsNodeType.File; // treat unknowns as files

    return {
        type,
        size: BigInt(stats.size),
        linkCount: BigInt(stats.nlink),
        accessTime: dateToNs(stats.atime),
        modifyTime: dateToNs(stats.mtime),
        changeTime: dateToNs(stats.ctime),
        nodeId: Number(stats.ino),
    };
}

function dateToNs(date: Date): bigint {
    return BigInt(date.getTime()) * 1_000_000n;
}

function direntType(entry: fs.Dirent): VfsNodeType {
    if (entry.isFile()) return VfsNodeType.File;
    if (entry.isDirectory()) return VfsNodeType.Directory;
    if (entry.isSymbolicLink()) return VfsNodeType.Symlink;
    return VfsNodeType.File;
}

// ──────────────────── NodeFsBackend ────────────────────

/**
 * Node.js real-filesystem backend implementing `IVfsBackend`.
 *
 * All path arrays are resolved to absolute host paths via `safeResolve`.
 * The backend is rooted at `hostRoot` — all operations are confined to it.
 */
export class NodeFsBackend implements IVfsBackend {
    readonly hostRoot: string;
    readonly readOnly: boolean;
    private readonly maxPathLength: number;
    private readonly maxAllocationSize: number;

    constructor(hostRoot: string, readOnly: boolean, limits?: AllocationLimits) {
        this.hostRoot = nodePath.resolve(hostRoot);
        this.readOnly = readOnly;
        this.maxPathLength = limits?.maxPathLength ?? ALLOCATION_DEFAULTS.maxPathLength;
        this.maxAllocationSize = limits?.maxAllocationSize ?? ALLOCATION_DEFAULTS.maxAllocationSize;
    }

    private resolve(parts: string[]): string {
        return safeResolve(this.hostRoot, parts);
    }

    private ensureWrite(): void {
        if (this.readOnly) throw new VfsError('read-only');
    }

    // ──── IVfsBackend ────

    stat(path: string[]): VfsStat {
        try {
            const hostPath = this.resolve(path);
            return statsToVfsStat(fs.statSync(hostPath));
        } catch (e) { mapNodeError(e); }
    }

    read(path: string[], offset: bigint, len: number): Uint8Array {
        try {
            const hostPath = this.resolve(path);
            const fd = fs.openSync(hostPath, 'r');
            try {
                const buf = Buffer.alloc(Math.min(len, this.maxAllocationSize));
                const bytesRead = fs.readSync(fd, buf, 0, buf.length, Number(offset));
                return new Uint8Array(buf.buffer, buf.byteOffset, bytesRead);
            } finally {
                fs.closeSync(fd);
            }
        } catch (e) { mapNodeError(e); }
    }

    write(path: string[], data: Uint8Array, offset: bigint): void {
        this.ensureWrite();
        try {
            const hostPath = this.resolve(path);
            const fd = fs.openSync(hostPath, 'r+');
            try {
                fs.writeSync(fd, data, 0, data.length, Number(offset));
            } finally {
                fs.closeSync(fd);
            }
        } catch (e) { mapNodeError(e); }
    }

    append(path: string[], data: Uint8Array): void {
        this.ensureWrite();
        try {
            const hostPath = this.resolve(path);
            fs.appendFileSync(hostPath, data);
        } catch (e) { mapNodeError(e); }
    }

    setSize(path: string[], size: bigint): void {
        this.ensureWrite();
        try {
            const hostPath = this.resolve(path);
            fs.truncateSync(hostPath, Number(size));
        } catch (e) { mapNodeError(e); }
    }

    setTimes(path: string[], accessTime: bigint | null, modifyTime: bigint | null): void {
        this.ensureWrite();
        try {
            const hostPath = this.resolve(path);
            const stats = fs.statSync(hostPath);
            const atime = accessTime !== null
                ? new Date(Number(accessTime / 1_000_000n))
                : stats.atime;
            const mtime = modifyTime !== null
                ? new Date(Number(modifyTime / 1_000_000n))
                : stats.mtime;
            fs.utimesSync(hostPath, atime, mtime);
        } catch (e) { mapNodeError(e); }
    }

    openAt(
        dirPath: string[],
        relativePath: string,
        openFlags: VfsOpenFlags,
        _descFlags: VfsDescriptorFlags,
        _followSymlinks: boolean,
    ): VfsOpenResult {
        if (relativePath.includes('\0')) throw new VfsError('invalid', 'null byte in path');
        if (relativePath.length > this.maxPathLength) throw new VfsError('name-too-long');

        const fullParts = resolvePathComponents(dirPath, relativePath);
        try {
            const hostPath = safeResolve(this.hostRoot, fullParts);

            let stats: fs.Stats | null = null;
            try {
                stats = fs.statSync(hostPath);
            } catch {
                // path doesn't exist
            }

            if (stats) {
                if (openFlags.exclusive) throw new VfsError('exist');
                if (openFlags.directory && !stats.isDirectory()) throw new VfsError('not-directory');
                if (openFlags.truncate && stats.isFile()) {
                    this.ensureWrite();
                    fs.truncateSync(hostPath, 0);
                }
            } else {
                if (!openFlags.create) throw new VfsError('no-entry');
                this.ensureWrite();
                if (openFlags.directory) {
                    fs.mkdirSync(hostPath);
                } else {
                    fs.writeFileSync(hostPath, new Uint8Array(0));
                }
            }

            // Return a stub VfsNode — the actual operations will go through the backend
            const node = stats?.isDirectory()
                ? createDirectoryNode()
                : createFileNode(new Uint8Array(0));
            return { node, path: fullParts };
        } catch (e) { mapNodeError(e); }
    }

    readDirectory(path: string[]): VfsDirectoryEntry[] {
        try {
            const hostPath = this.resolve(path);
            const entries = fs.readdirSync(hostPath, { withFileTypes: true });
            return entries.map(e => ({
                type: direntType(e),
                name: e.name,
            }));
        } catch (e) { mapNodeError(e); }
    }

    createDirectory(dirPath: string[], name: string): void {
        this.ensureWrite();
        try {
            const parentHost = this.resolve(dirPath);
            const targetPath = nodePath.join(parentHost, name);
            // Re-verify containment after join
            safeResolve(this.hostRoot, [...dirPath, name]);
            fs.mkdirSync(targetPath);
        } catch (e) { mapNodeError(e); }
    }

    removeDirectory(dirPath: string[], name: string): void {
        this.ensureWrite();
        try {
            const hostPath = this.resolve([...dirPath, name]);
            fs.rmdirSync(hostPath);
        } catch (e) { mapNodeError(e); }
    }

    unlinkFile(dirPath: string[], name: string): void {
        this.ensureWrite();
        try {
            const hostPath = this.resolve([...dirPath, name]);
            const stats = fs.statSync(hostPath);
            if (stats.isDirectory()) throw new VfsError('is-directory');
            fs.unlinkSync(hostPath);
        } catch (e) { mapNodeError(e); }
    }

    rename(oldDirPath: string[], oldName: string, newDirPath: string[], newName: string): void {
        this.ensureWrite();
        try {
            const oldPath = this.resolve([...oldDirPath, oldName]);
            const newPath = this.resolve([...newDirPath, newName]);
            fs.renameSync(oldPath, newPath);
        } catch (e) { mapNodeError(e); }
    }

    linkAt(oldPath: string[], newDirPath: string[], newName: string): void {
        this.ensureWrite();
        try {
            const srcPath = this.resolve(oldPath);
            const dstPath = this.resolve([...newDirPath, newName]);
            fs.linkSync(srcPath, dstPath);
        } catch (e) { mapNodeError(e); }
    }

    symlinkAt(dirPath: string[], target: string, linkName: string): void {
        this.ensureWrite();
        if (target.startsWith('/')) throw new VfsError('not-permitted', 'absolute symlink target');
        if (target.includes('\0')) throw new VfsError('invalid', 'null byte in symlink target');
        try {
            const hostDir = this.resolve(dirPath);
            const linkPath = nodePath.join(hostDir, linkName);
            // Verify the link path stays in bounds
            safeResolve(this.hostRoot, [...dirPath, linkName]);
            fs.symlinkSync(target, linkPath);
        } catch (e) { mapNodeError(e); }
    }

    readlinkAt(dirPath: string[], name: string): string {
        try {
            const hostPath = this.resolve([...dirPath, name]);
            return fs.readlinkSync(hostPath, 'utf8');
        } catch (e) { mapNodeError(e); }
    }

    isSameNode(pathA: string[], pathB: string[]): boolean {
        try {
            const hostA = this.resolve(pathA);
            const hostB = this.resolve(pathB);
            const statsA = fs.statSync(hostA);
            const statsB = fs.statSync(hostB);
            return statsA.ino === statsB.ino && statsA.dev === statsB.dev;
        } catch {
            return false;
        }
    }

    metadataHash(path: string[]): { lower: bigint; upper: bigint } {
        try {
            const hostPath = this.resolve(path);
            const stats = fs.statSync(hostPath);
            return {
                lower: BigInt(stats.dev),
                upper: BigInt(stats.ino),
            };
        } catch {
            // Fallback: hash the path string
            let h = 0n;
            const str = path.join('/');
            for (let i = 0; i < str.length; i++) {
                h = (h * 31n + BigInt(str.charCodeAt(i))) & 0xFFFFFFFFFFFFFFFFn;
            }
            return { lower: h, upper: 0n };
        }
    }
}

// ──────────────────── Mount wiring ────────────────────

/**
 * Add Node.js filesystem mount preopens to an existing FilesystemState.
 *
 * Each mount creates a `NodeFsBackend` rooted at the host path,
 * wraps it in a `FsDescriptor`, and adds it to `state.preopens`.
 *
 * @param state The filesystem state from `initFilesystem()`.
 * @param mounts Mount configurations.
 * @param limits Allocation limits.
 */
export function addNodeMounts(
    state: FilesystemState,
    mounts: MountConfig[],
    limits?: AllocationLimits,
): void {
    const maxPathLength = limits?.maxPathLength ?? ALLOCATION_DEFAULTS.maxPathLength;

    for (const mount of mounts) {
        const hostAbsolute = nodePath.resolve(mount.hostPath);
        if (!fs.existsSync(hostAbsolute)) {
            throw new Error(`Mount path does not exist: ${hostAbsolute}`);
        }
        const stats = fs.statSync(hostAbsolute);
        if (!stats.isDirectory()) {
            throw new Error(`Mount path is not a directory: ${hostAbsolute}`);
        }

        const readOnly = mount.readOnly ?? false;
        const backend = new NodeFsBackend(hostAbsolute, readOnly, limits);
        const guestPath = mount.guestPath.endsWith('/')
            ? mount.guestPath.slice(0, -1) || '/'
            : mount.guestPath;

        const desc = new FsDescriptor(backend, [], {
            read: true,
            write: !readOnly,
            mutateDirectory: !readOnly,
        }, maxPathLength);

        state.preopens.push([desc, guestPath]);
    }
}
