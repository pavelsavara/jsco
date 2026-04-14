// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * wasi:filesystem — Node.js real filesystem with mount point support
 *
 * Extends the existing VFS with real filesystem access via Node.js `fs` module.
 * Supports wasmtime-like --dir mount configuration:
 *
 *   - { hostPath: '/data', guestPath: '/mnt/data' }
 *   - { hostPath: '.', guestPath: '/' }
 *
 * Security: all paths are resolved relative to the mount point's host path,
 * with '..' escape prevention (paths are contained within the mount).
 *
 * Gaps vs wasmtime CLI:
 * - No symlink following across mount boundaries
 * - No file locking (advisory-lock / unlock)
 * - No permissions model (all access is determined by OS permissions)
 * - No dev/inode mapping (metadata-hash uses path-based hashing)
 * - No preopened file descriptors (only directories)
 * - No WASI rights/inheriting-rights model (deprecated in preview2)
 */

import type { Stats } from 'node:fs';
import {
    ErrorCode,
    DescriptorType,
    DescriptorFlags,
    PathFlags,
    OpenFlags,
    DescriptorStat,
    DirectoryEntry,
    MetadataHashValue,
    FsResult,
    WasiDirectoryEntryStream,
    WasiDescriptor,
    WasiFilesystem,
} from './filesystem';
import type { WasiDatetime } from './types';
import type { WasiInputStream, WasiOutputStream } from './streams';
import { createInputStream, createOutputStream } from './streams';

// ─── Node.js fs detection ───

let _nodeFs: typeof import('node:fs') | null | undefined;
function getNodeFs(): typeof import('node:fs') | null {
    if (_nodeFs === undefined) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
            _nodeFs = require('node:fs') as typeof import('node:fs');
        } catch {
            _nodeFs = null;
        }
    }
    return _nodeFs;
}

let _nodePath: typeof import('node:path') | null | undefined;
function getNodePath(): typeof import('node:path') | null {
    if (_nodePath === undefined) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
            _nodePath = require('node:path') as typeof import('node:path');
        } catch {
            _nodePath = null;
        }
    }
    return _nodePath;
}

// ─── Types ───

/** A mount point mapping host path to guest path */
export interface FsMount {
    /** Host filesystem path (absolute or relative to cwd) */
    hostPath: string;
    /** Guest path visible to the WASM component */
    guestPath: string;
    /** Read-only mount. Default: false (read-write) */
    readOnly?: boolean;
}

// ─── Helpers ───

function ok<T>(val: T): FsResult<T> { return { tag: 'ok', val }; }
function err<T>(code: ErrorCode): FsResult<T> { return { tag: 'err', val: code }; }

/** Map Node.js errno codes to WASI ErrorCode */
function mapFsError(e: NodeJS.ErrnoException): ErrorCode {
    switch (e.code) {
        case 'ENOENT': return 'no-entry';
        case 'EEXIST': return 'exist';
        case 'EISDIR': return 'is-directory';
        case 'ENOTDIR': return 'not-directory';
        case 'ENOTEMPTY': return 'not-empty';
        case 'EACCES': case 'EPERM': return 'access';
        case 'ENOSPC': return 'insufficient-space';
        case 'ENOMEM': return 'insufficient-memory';
        case 'EBADF': return 'bad-descriptor';
        case 'ELOOP': return 'loop';
        case 'ENAMETOOLONG': return 'name-too-long';
        case 'EBUSY': return 'busy';
        case 'EROFS': return 'read-only';
        case 'EXDEV': return 'cross-device';
        case 'EINVAL': return 'invalid';
        case 'EIO': return 'io';
        default: return 'io';
    }
}

/** Convert Node.js Stats to WASI DescriptorStat */
function statsToDescriptorStat(stats: Stats): DescriptorStat {
    let type: DescriptorType = 'unknown';
    if (stats.isFile()) type = 'regular-file';
    else if (stats.isDirectory()) type = 'directory';
    else if (stats.isSymbolicLink()) type = 'symbolic-link';
    else if (stats.isBlockDevice()) type = 'block-device';
    else if (stats.isCharacterDevice()) type = 'character-device';
    else if (stats.isFIFO()) type = 'fifo';
    else if (stats.isSocket()) type = 'socket';

    return {
        type,
        linkCount: BigInt(stats.nlink),
        size: BigInt(stats.size),
        dataAccessTimestamp: dateToDatetime(stats.atime),
        dataModificationTimestamp: dateToDatetime(stats.mtime),
        statusChangeTimestamp: dateToDatetime(stats.ctime),
    };
}

function dateToDatetime(date: Date): WasiDatetime {
    const ms = date.getTime();
    return { seconds: BigInt(Math.floor(ms / 1000)), nanoseconds: (ms % 1000) * 1_000_000 };
}

/** Simple hash of a path for metadata-hash */
function hashPath(path: string): MetadataHashValue {
    let h = 0n;
    for (let i = 0; i < path.length; i++) {
        h = (h * 31n + BigInt(path.charCodeAt(i))) & 0xFFFFFFFFFFFFFFFFn;
    }
    return { upper: h, lower: 0n };
}

/**
 * Safely resolve a guest-relative path within a host mount root.
 * Prevents '..' escape above the mount root AND symlink/junction escape.
 * Uses fs.realpathSync to resolve symlinks and then verifies containment.
 * For paths that don't exist yet (create), resolves the parent and checks containment.
 * Returns the absolute host path, or null if it would escape.
 */
function safeResolve(hostRoot: string, guestRelativePath: string): string | null {
    const nodePath = getNodePath();
    const fs = getNodeFs();
    if (!nodePath || !fs) return null;

    const resolved = nodePath.resolve(hostRoot, guestRelativePath);
    const normalizedRoot = nodePath.resolve(hostRoot);

    // Step 1: Lexical check against traversal
    if (!resolved.startsWith(normalizedRoot + nodePath.sep) && resolved !== normalizedRoot) {
        return null; // Would escape the mount
    }

    // Step 2: Resolve symlinks/junctions for real path containment check
    try {
        // If the path exists, resolve all symlinks and re-check containment
        const realPath = fs.realpathSync(resolved);
        const realRoot = fs.realpathSync(normalizedRoot);
        if (!realPath.startsWith(realRoot + nodePath.sep) && realPath !== realRoot) {
            return null; // Symlink/junction escapes the mount
        }
        return realPath;
    } catch {
        // Path doesn't exist yet (e.g. create operation) — resolve the parent
        const parentDir = nodePath.dirname(resolved);
        try {
            const realParent = fs.realpathSync(parentDir);
            const realRoot = fs.realpathSync(normalizedRoot);
            if (!realParent.startsWith(realRoot + nodePath.sep) && realParent !== realRoot) {
                return null; // Parent escapes the mount via symlink/junction
            }
            // Return the resolved path (parent is verified safe, leaf doesn't exist yet)
            return nodePath.join(realParent, nodePath.basename(resolved));
        } catch {
            return null; // Parent doesn't exist either
        }
    }
}

// ─── Node.js Descriptor ───

/** Create a WasiDescriptor backed by Node.js fs */
function createNodeDescriptor(hostPath: string, flags: DescriptorFlags, rootPath: string, readOnly: boolean): WasiDescriptor {
    const fs = getNodeFs()!;

    const descriptor: WasiDescriptor = {
        readViaStream(offset: bigint): FsResult<WasiInputStream> {
            try {
                const data = fs.readFileSync(hostPath);
                const off = Number(offset);
                const slice = off >= data.length ? new Uint8Array(0) : new Uint8Array(data.slice(off));
                return ok(createInputStream(slice));
            } catch (e) { return err(mapFsError(e as NodeJS.ErrnoException)); }
        },

        writeViaStream(offset: bigint): FsResult<WasiOutputStream> {
            if (readOnly) return err('read-only');
            const off = Number(offset);
            return ok(createOutputStream((bytes) => {
                try {
                    const fd = fs.openSync(hostPath, 'r+');
                    try {
                        fs.writeSync(fd, bytes, 0, bytes.length, off);
                    } finally { fs.closeSync(fd); }
                } catch (e) {
                    throw new Error(`write failed: ${(e as Error).message}`);
                }
            }));
        },

        appendViaStream(): FsResult<WasiOutputStream> {
            if (readOnly) return err('read-only');
            return ok(createOutputStream((bytes) => {
                try { fs.appendFileSync(hostPath, bytes); }
                catch (e) { throw new Error(`append failed: ${(e as Error).message}`); }
            }));
        },

        getFlags(): FsResult<DescriptorFlags> { return ok(flags); },

        getType(): FsResult<DescriptorType> {
            try {
                const stats = fs.statSync(hostPath);
                if (stats.isFile()) return ok('regular-file');
                if (stats.isDirectory()) return ok('directory');
                if (stats.isSymbolicLink()) return ok('symbolic-link');
                return ok('unknown');
            } catch (e) { return err(mapFsError(e as NodeJS.ErrnoException)); }
        },

        setSize(size: bigint): FsResult<void> {
            if (readOnly) return err('read-only');
            try { fs.truncateSync(hostPath, Number(size)); return ok(undefined); }
            catch (e) { return err(mapFsError(e as NodeJS.ErrnoException)); }
        },

        read(length: bigint, offset: bigint): FsResult<[Uint8Array, boolean]> {
            try {
                const fd = fs.openSync(hostPath, 'r');
                try {
                    const buf = Buffer.alloc(Number(length));
                    const bytesRead = fs.readSync(fd, buf, 0, buf.length, Number(offset));
                    const stats = fs.fstatSync(fd);
                    const eof = Number(offset) + bytesRead >= stats.size;
                    return ok([new Uint8Array(buf.slice(0, bytesRead)), eof]);
                } finally { fs.closeSync(fd); }
            } catch (e) { return err(mapFsError(e as NodeJS.ErrnoException)); }
        },

        write(buffer: Uint8Array, offset: bigint): FsResult<bigint> {
            if (readOnly) return err('read-only');
            try {
                const fd = fs.openSync(hostPath, 'r+');
                try {
                    const written = fs.writeSync(fd, buffer, 0, buffer.length, Number(offset));
                    return ok(BigInt(written));
                } finally { fs.closeSync(fd); }
            } catch (e) { return err(mapFsError(e as NodeJS.ErrnoException)); }
        },

        readDirectory(): FsResult<WasiDirectoryEntryStream> {
            try {
                const entries = fs.readdirSync(hostPath, { withFileTypes: true });
                let index = 0;
                return ok({
                    readDirectoryEntry(): FsResult<DirectoryEntry | undefined> {
                        if (index >= entries.length) return ok(undefined);
                        const entry = entries[index++]!;
                        let type: DescriptorType = 'unknown';
                        if (entry.isFile()) type = 'regular-file';
                        else if (entry.isDirectory()) type = 'directory';
                        else if (entry.isSymbolicLink()) type = 'symbolic-link';
                        return ok({ type, name: entry.name });
                    },
                });
            } catch (e) { return err(mapFsError(e as NodeJS.ErrnoException)); }
        },

        syncData(): FsResult<void> {
            try {
                const fd = fs.openSync(hostPath, 'r');
                try { fs.fdatasyncSync(fd); } finally { fs.closeSync(fd); }
                return ok(undefined);
            } catch { return ok(undefined); } // Best effort
        },

        sync(): FsResult<void> {
            try {
                const fd = fs.openSync(hostPath, 'r');
                try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
                return ok(undefined);
            } catch { return ok(undefined); } // Best effort
        },

        stat(): FsResult<DescriptorStat> {
            try { return ok(statsToDescriptorStat(fs.statSync(hostPath))); }
            catch (e) { return err(mapFsError(e as NodeJS.ErrnoException)); }
        },

        statAt(_pathFlags: PathFlags, path: string): FsResult<DescriptorStat> {
            const resolved = safeResolve(hostPath, path);
            if (!resolved) return err('access');
            try { return ok(statsToDescriptorStat(fs.statSync(resolved))); }
            catch (e) { return err(mapFsError(e as NodeJS.ErrnoException)); }
        },

        createDirectoryAt(path: string): FsResult<void> {
            if (readOnly) return err('read-only');
            const resolved = safeResolve(hostPath, path);
            if (!resolved) return err('access');
            try { fs.mkdirSync(resolved); return ok(undefined); }
            catch (e) { return err(mapFsError(e as NodeJS.ErrnoException)); }
        },

        openAt(_pathFlags: PathFlags, path: string, openFlags: OpenFlags, descriptorFlags: DescriptorFlags): FsResult<WasiDescriptor> {
            const resolved = safeResolve(hostPath, path);
            if (!resolved) return err('access');

            try {
                let stats: Stats | null = null;
                try { stats = fs.statSync(resolved); } catch { /* file doesn't exist */ }

                if (openFlags.exclusive && stats) return err('exist');

                if (!stats) {
                    if (!openFlags.create) return err('no-entry');
                    if (readOnly) return err('read-only');
                    if (openFlags.directory) {
                        fs.mkdirSync(resolved);
                    } else {
                        fs.writeFileSync(resolved, new Uint8Array(0));
                    }
                } else {
                    if (openFlags.directory && !stats.isDirectory()) return err('not-directory');
                    if (openFlags.truncate && stats.isFile()) {
                        if (readOnly) return err('read-only');
                        fs.truncateSync(resolved, 0);
                    }
                }

                return ok(createNodeDescriptor(resolved, descriptorFlags, rootPath, readOnly));
            } catch (e) { return err(mapFsError(e as NodeJS.ErrnoException)); }
        },

        removeDirectoryAt(path: string): FsResult<void> {
            if (readOnly) return err('read-only');
            const resolved = safeResolve(hostPath, path);
            if (!resolved) return err('access');
            try { fs.rmdirSync(resolved); return ok(undefined); }
            catch (e) { return err(mapFsError(e as NodeJS.ErrnoException)); }
        },

        unlinkFileAt(path: string): FsResult<void> {
            if (readOnly) return err('read-only');
            const resolved = safeResolve(hostPath, path);
            if (!resolved) return err('access');
            try { fs.unlinkSync(resolved); return ok(undefined); }
            catch (e) { return err(mapFsError(e as NodeJS.ErrnoException)); }
        },

        renameAt(oldPath: string, newDescriptor: WasiDescriptor, newPath: string): FsResult<void> {
            if (readOnly) return err('read-only');
            const resolvedOld = safeResolve(hostPath, oldPath);
            if (!resolvedOld) return err('access');
            // Get the host path from the new descriptor
            const newNode = (newDescriptor as any)._hostPath;
            const newRoot = newNode ?? hostPath;
            const resolvedNew = safeResolve(newRoot, newPath);
            if (!resolvedNew) return err('access');
            try { fs.renameSync(resolvedOld, resolvedNew); return ok(undefined); }
            catch (e) { return err(mapFsError(e as NodeJS.ErrnoException)); }
        },

        readlinkAt(path: string): FsResult<string> {
            const resolved = safeResolve(hostPath, path);
            if (!resolved) return err('access');
            try { return ok(fs.readlinkSync(resolved, 'utf8')); }
            catch (e) { return err(mapFsError(e as NodeJS.ErrnoException)); }
        },

        symlinkAt(target: string, linkPath: string): FsResult<void> {
            if (readOnly) return err('read-only');
            const resolved = safeResolve(hostPath, linkPath);
            if (!resolved) return err('access');
            try { fs.symlinkSync(target, resolved); return ok(undefined); }
            catch (e) { return err(mapFsError(e as NodeJS.ErrnoException)); }
        },

        linkAt(_oldPathFlags: PathFlags, oldPath: string, newDescriptor: WasiDescriptor, newPath: string): FsResult<void> {
            if (readOnly) return err('read-only');
            const resolvedOld = safeResolve(hostPath, oldPath);
            if (!resolvedOld) return err('access');
            const newNode = (newDescriptor as any)._hostPath;
            const newRoot = newNode ?? hostPath;
            const resolvedNew = safeResolve(newRoot, newPath);
            if (!resolvedNew) return err('access');
            try { fs.linkSync(resolvedOld, resolvedNew); return ok(undefined); }
            catch (e) { return err(mapFsError(e as NodeJS.ErrnoException)); }
        },

        setTimesAt(_pathFlags: PathFlags, path: string, atime: WasiDatetime | undefined, mtime: WasiDatetime | undefined): FsResult<void> {
            if (readOnly) return err('read-only');
            const resolved = safeResolve(hostPath, path);
            if (!resolved) return err('access');
            try {
                const now = new Date();
                const atimeDate = atime ? new Date(Number(atime.seconds) * 1000 + atime.nanoseconds / 1e6) : now;
                const mtimeDate = mtime ? new Date(Number(mtime.seconds) * 1000 + mtime.nanoseconds / 1e6) : now;
                fs.utimesSync(resolved, atimeDate, mtimeDate);
                return ok(undefined);
            } catch (e) { return err(mapFsError(e as NodeJS.ErrnoException)); }
        },

        isSameObject(other: WasiDescriptor): boolean {
            const otherHost = (other as any)._hostPath;
            return otherHost === hostPath;
        },

        metadataHash(): FsResult<MetadataHashValue> {
            try {
                const stats = fs.statSync(hostPath);
                return ok({ upper: BigInt(stats.ino), lower: BigInt(stats.dev) });
            } catch { return ok(hashPath(hostPath)); }
        },

        metadataHashAt(_pathFlags: PathFlags, path: string): FsResult<MetadataHashValue> {
            const resolved = safeResolve(hostPath, path);
            if (!resolved) return err('access');
            try {
                const stats = fs.statSync(resolved);
                return ok({ upper: BigInt(stats.ino), lower: BigInt(stats.dev) });
            } catch { return ok(hashPath(resolved || hostPath)); }
        },

        advise(): FsResult<void> { return ok(undefined); },

        setTimes(atime: WasiDatetime | undefined, mtime: WasiDatetime | undefined): FsResult<void> {
            if (readOnly) return err('read-only');
            try {
                const now = new Date();
                const atimeDate = atime ? new Date(Number(atime.seconds) * 1000 + atime.nanoseconds / 1e6) : now;
                const mtimeDate = mtime ? new Date(Number(mtime.seconds) * 1000 + mtime.nanoseconds / 1e6) : now;
                fs.utimesSync(hostPath, atimeDate, mtimeDate);
                return ok(undefined);
            } catch (e) { return err(mapFsError(e as NodeJS.ErrnoException)); }
        },

        _node() { return null as any; }, // Not applicable for real fs
        _hostPath: hostPath,
    } as WasiDescriptor & { _hostPath: string };

    return descriptor;
}

// ─── Factory ───

/**
 * Create a wasi:filesystem implementation backed by the real Node.js filesystem.
 *
 * @param mounts List of mount point configurations. Each maps a host directory
 *               to a guest path visible to the WASM component.
 *
 * @example
 * ```ts
 * // Mount current directory at '/' and /data at '/mnt/data'
 * const fs = createNodeFilesystem([
 *   { hostPath: '.', guestPath: '/' },
 *   { hostPath: '/data', guestPath: '/mnt/data', readOnly: true },
 * ]);
 * ```
 */
export function createNodeFilesystem(mounts: FsMount[]): WasiFilesystem {
    const fs = getNodeFs();
    const path = getNodePath();
    if (!fs || !path) throw new Error('Node.js filesystem requires Node.js');

    const preopen: [WasiDescriptor, string][] = [];

    for (const mount of mounts) {
        const hostAbsolute = path.resolve(mount.hostPath);
        if (!fs.existsSync(hostAbsolute)) throw new Error(`Mount path does not exist: ${hostAbsolute}`);
        const stats = fs.statSync(hostAbsolute);
        if (!stats.isDirectory()) throw new Error(`Mount path is not a directory: ${hostAbsolute}`);

        const guestPath = mount.guestPath.endsWith('/') ? mount.guestPath.slice(0, -1) : mount.guestPath;
        const readOnly = mount.readOnly ?? false;
        const flags: DescriptorFlags = { read: true, write: !readOnly, mutateDirectory: !readOnly };

        preopen.push([
            createNodeDescriptor(hostAbsolute, flags, hostAbsolute, readOnly),
            guestPath || '/',
        ]);
    }

    if (preopen.length === 0) {
        throw new Error('At least one mount point is required');
    }

    return {
        preopens: {
            getDirectories(): [WasiDescriptor, string][] {
                return preopen;
            },
        },
        rootDescriptor(): WasiDescriptor {
            return preopen[0]![0];
        },
    };
}
