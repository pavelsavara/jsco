// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * wasi:filesystem/types + wasi:filesystem/preopens
 *
 * In-memory virtual filesystem for the browser. Pre-populated via
 * Map<string, Uint8Array> with full unix path keys.
 *
 * Features:
 * - VFS tree built from the map at construction time
 * - Descriptor resource with file/directory operations
 * - Directory entry stream resource
 * - Path resolution with '..' escape prevention
 * - Error code mapping (36 variants)
 * - No symbolic links (returns 'unsupported')
 * - No permissions model (all read/write)
 * - Preopens derived from the map's directory structure
 */

import { WasiDatetime } from './types';
import { WasiInputStream, WasiOutputStream, createInputStream, createOutputStream } from './streams';

// ─── Error Codes ───

/** wasi:filesystem/types error-code enum — 36 variants */
export type ErrorCode =
    | 'access'
    | 'bad-descriptor'
    | 'busy'
    | 'deadlock'
    | 'quota'
    | 'exist'
    | 'file-too-large'
    | 'illegal-byte-sequence'
    | 'in-progress'
    | 'interrupted'
    | 'invalid'
    | 'io'
    | 'is-directory'
    | 'loop'
    | 'too-many-links'
    | 'message-size'
    | 'name-too-long'
    | 'no-device'
    | 'no-entry'
    | 'no-lock'
    | 'insufficient-memory'
    | 'insufficient-space'
    | 'not-directory'
    | 'not-empty'
    | 'not-recoverable'
    | 'unsupported'
    | 'no-tty'
    | 'no-such-device'
    | 'overflow'
    | 'not-permitted'
    | 'pipe'
    | 'read-only'
    | 'invalid-seek'
    | 'text-file-busy'
    | 'cross-device'
    | 'other';

// ─── Descriptor Types & Flags ───

/** wasi:filesystem/types descriptor-type */
export type DescriptorType =
    | 'unknown'
    | 'block-device'
    | 'character-device'
    | 'directory'
    | 'fifo'
    | 'symbolic-link'
    | 'regular-file'
    | 'socket';

/** wasi:filesystem/types descriptor-flags */
export interface DescriptorFlags {
    read?: boolean;
    write?: boolean;
    fileIntegritySync?: boolean;
    dataIntegritySync?: boolean;
    mutateDirectory?: boolean;
}

/** wasi:filesystem/types path-flags */
export interface PathFlags {
    symlinkFollow?: boolean;
}

/** wasi:filesystem/types open-flags */
export interface OpenFlags {
    create?: boolean;
    directory?: boolean;
    exclusive?: boolean;
    truncate?: boolean;
}

/** wasi:filesystem/types descriptor-stat */
export interface DescriptorStat {
    type: DescriptorType;
    linkCount: bigint;
    size: bigint;
    dataAccessTimestamp?: WasiDatetime;
    dataModificationTimestamp?: WasiDatetime;
    statusChangeTimestamp?: WasiDatetime;
}

/** wasi:filesystem/types directory-entry */
export interface DirectoryEntry {
    type: DescriptorType;
    name: string;
}

/** wasi:filesystem/types metadata-hash-value */
export interface MetadataHashValue {
    upper: bigint;
    lower: bigint;
}

/** Result type for filesystem operations */
export type FsResult<T> = { tag: 'ok'; val: T } | { tag: 'err'; val: ErrorCode };

function ok<T>(val: T): FsResult<T> {
    return { tag: 'ok', val };
}

function err<T>(code: ErrorCode): FsResult<T> {
    return { tag: 'err', val: code };
}

// ─── Internal VFS Tree ───

/** Internal node in the VFS tree */
interface VfsNode {
    name: string;
    type: 'file' | 'directory';
    /** File content — only for files */
    data?: Uint8Array;
    /** Children — only for directories */
    children?: Map<string, VfsNode>;
    /** Timestamps */
    ctime: WasiDatetime;
    mtime: WasiDatetime;
    atime: WasiDatetime;
}

function nowDatetime(): WasiDatetime {
    const ms = Date.now();
    return {
        seconds: BigInt(Math.floor(ms / 1000)),
        nanoseconds: (ms % 1000) * 1_000_000,
    };
}

function createFileNode(name: string, data: Uint8Array): VfsNode {
    const now = nowDatetime();
    return { name, type: 'file', data, ctime: now, mtime: now, atime: now };
}

function createDirNode(name: string): VfsNode {
    const now = nowDatetime();
    return { name, type: 'directory', children: new Map(), ctime: now, mtime: now, atime: now };
}

/**
 * Build a VFS tree from a flat Map<string, Uint8Array>.
 * Keys are full unix paths like '/home/user/hello.txt'.
 */
function buildVfsTree(files: Map<string, Uint8Array>): VfsNode {
    const root = createDirNode('');

    for (const [path, data] of files) {
        const parts = normalizePath(path).split('/').filter(p => p.length > 0);
        if (parts.length === 0) continue;

        let current = root;
        // Ensure all parent directories exist
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!part) throw new Error(`buildVfsTree: unexpected empty path segment at index ${i}`);
            if (!current.children!.has(part)) {
                current.children!.set(part, createDirNode(part));
            }
            const child = current.children!.get(part);
            if (!child) throw new Error(`Failed to create directory: ${part}`);
            if (child.type !== 'directory') {
                throw new Error(`Path conflict: ${parts.slice(0, i + 1).join('/')} is a file, cannot create subdirectory`);
            }
            current = child;
        }

        // Create the file
        const fileName = parts[parts.length - 1];
        if (!fileName) throw new Error(`buildVfsTree: unexpected empty filename in path "${path}"`);
        current.children!.set(fileName, createFileNode(fileName, new Uint8Array(data)));
    }

    return root;
}

/** Normalize a path: remove trailing slashes, collapse double slashes */
function normalizePath(path: string): string {
    return path.replace(/\/+/g, '/').replace(/\/$/, '');
}

/** Path resolution with '..' support, preventing escape above base */
function resolvePathFull(base: VfsNode, path: string): VfsNode | null {
    if (base.type !== 'directory') return null;

    const parts = path.split('/').filter(p => p.length > 0);
    const resolved: string[] = [];

    for (const part of parts) {
        if (part === '.') continue;
        if (part === '..') {
            if (resolved.length === 0) return null; // Would escape base
            resolved.pop();
        } else {
            resolved.push(part);
        }
    }

    // Walk from base using resolved parts
    let current = base;
    for (const part of resolved) {
        if (current.type !== 'directory' || !current.children) return null;
        const child = current.children.get(part);
        if (!child) return null;
        current = child;
    }

    return current;
}

/** Resolve a path but return the parent directory and the final name component */
function resolveParent(base: VfsNode, path: string): { parent: VfsNode; name: string } | null {
    if (base.type !== 'directory') return null;

    const parts = path.split('/').filter(p => p.length > 0);
    if (parts.length === 0) return null;

    const resolved: string[] = [];
    for (const part of parts) {
        if (part === '.') continue;
        if (part === '..') {
            if (resolved.length === 0) return null; // Would escape base
            resolved.pop();
        } else {
            resolved.push(part);
        }
    }

    if (resolved.length === 0) return null;
    const name = resolved.pop();
    if (!name) return null;

    // Walk from base to parent
    let current = base;
    for (const part of resolved) {
        if (current.type !== 'directory' || !current.children) return null;
        const child = current.children.get(part);
        if (!child) return null;
        current = child;
    }

    if (current.type !== 'directory') return null;
    return { parent: current, name };
}

function nodeToStat(node: VfsNode): DescriptorStat {
    return {
        type: node.type === 'file' ? 'regular-file' : 'directory',
        linkCount: 1n,
        size: node.type === 'file' ? BigInt(node.data!.length) : 0n,
        dataAccessTimestamp: node.atime,
        dataModificationTimestamp: node.mtime,
        statusChangeTimestamp: node.ctime,
    };
}

/** Simple hash of a string path for metadata-hash */
function hashPath(path: string): MetadataHashValue {
    let h = 0n;
    for (let i = 0; i < path.length; i++) {
        h = (h * 31n + BigInt(path.charCodeAt(i))) & 0xFFFFFFFFFFFFFFFFn;
    }
    return { upper: h, lower: 0n };
}

// ─── Directory Entry Stream ───

/** wasi:filesystem/types directory-entry-stream resource */
export interface WasiDirectoryEntryStream {
    /** Read the next directory entry, or undefined if exhausted */
    readDirectoryEntry(): FsResult<DirectoryEntry | undefined>;
}

function createDirectoryEntryStream(dir: VfsNode): WasiDirectoryEntryStream {
    const entries = Array.from(dir.children!.entries());
    let index = 0;

    return {
        readDirectoryEntry(): FsResult<DirectoryEntry | undefined> {
            if (index >= entries.length) {
                return ok(undefined);
            }
            const entry = entries[index++];
            if (!entry) return ok(undefined);
            const [name, node] = entry;
            return ok({
                type: node.type === 'file' ? 'regular-file' as const : 'directory' as const,
                name,
            });
        },
    };
}

// ─── Descriptor ───

/** wasi:filesystem/types descriptor resource */
export interface WasiDescriptor {
    /** Read via stream at offset */
    readViaStream(offset: bigint): FsResult<WasiInputStream>;
    /** Write via stream at offset */
    writeViaStream(offset: bigint): FsResult<WasiOutputStream>;
    /** Append via stream */
    appendViaStream(): FsResult<WasiOutputStream>;
    /** Get descriptor flags */
    getFlags(): FsResult<DescriptorFlags>;
    /** Get descriptor type */
    getType(): FsResult<DescriptorType>;
    /** Set file size */
    setSize(size: bigint): FsResult<void>;
    /** Read from file at offset */
    read(length: bigint, offset: bigint): FsResult<[Uint8Array, boolean]>;
    /** Write to file at offset */
    write(buffer: Uint8Array, offset: bigint): FsResult<bigint>;
    /** Read directory entries */
    readDirectory(): FsResult<WasiDirectoryEntryStream>;
    /** Sync data to storage (no-op in memory VFS) */
    syncData(): FsResult<void>;
    /** Sync metadata + data (no-op) */
    sync(): FsResult<void>;
    /** Get stat */
    stat(): FsResult<DescriptorStat>;
    /** Stat a path relative to this descriptor */
    statAt(_pathFlags: PathFlags, path: string): FsResult<DescriptorStat>;
    /** Create a directory at path */
    createDirectoryAt(path: string): FsResult<void>;
    /** Open a file/directory at path */
    openAt(pathFlags: PathFlags, path: string, openFlags: OpenFlags, descriptorFlags: DescriptorFlags): FsResult<WasiDescriptor>;
    /** Remove a directory at path */
    removeDirectoryAt(path: string): FsResult<void>;
    /** Unlink a file at path */
    unlinkFileAt(path: string): FsResult<void>;
    /** Rename from old-path to new-path (within same descriptor) */
    renameAt(oldPath: string, newDescriptor: WasiDescriptor, newPath: string): FsResult<void>;
    /** Read a symlink (unsupported) */
    readlinkAt(path: string): FsResult<string>;
    /** Create a symlink (unsupported) */
    symlinkAt(oldPath: string, newPath: string): FsResult<void>;
    /** Link (unsupported) */
    linkAt(oldPathFlags: PathFlags, oldPath: string, newDescriptor: WasiDescriptor, newPath: string): FsResult<void>;
    /** Set times on a path */
    setTimesAt(pathFlags: PathFlags, path: string, atime: WasiDatetime | undefined, mtime: WasiDatetime | undefined): FsResult<void>;
    /** Check if two descriptors refer to the same node */
    isSameObject(other: WasiDescriptor): boolean;
    /** Metadata hash */
    metadataHash(): FsResult<MetadataHashValue>;
    /** Metadata hash at path */
    metadataHashAt(pathFlags: PathFlags, path: string): FsResult<MetadataHashValue>;
    /** Advise the implementation about access patterns (no-op) */
    advise(offset: bigint, length: bigint, advice: string): FsResult<void>;
    /** Set times on this descriptor */
    setTimes(atime: WasiDatetime | undefined, mtime: WasiDatetime | undefined): FsResult<void>;
    /** Get the underlying VFS node (internal) */
    _node(): VfsNode;
}

function createDescriptor(node: VfsNode, flags: DescriptorFlags, nodePath: string): WasiDescriptor {
    const descriptor: WasiDescriptor = {
        readViaStream(offset: bigint): FsResult<WasiInputStream> {
            if (node.type !== 'file') return err('bad-descriptor');
            const data = node.data!;
            const off = Number(offset);
            const slice = off >= data.length ? new Uint8Array(0) : data.slice(off);
            return ok(createInputStream(slice));
        },

        writeViaStream(offset: bigint): FsResult<WasiOutputStream> {
            if (node.type !== 'file') return err('bad-descriptor');
            const off = Number(offset);
            return ok(createOutputStream((bytes) => {
                // Expand file data if needed
                const needed = off + bytes.length;
                if (needed > node.data!.length) {
                    const newData = new Uint8Array(needed);
                    newData.set(node.data!);
                    node.data = newData;
                }
                node.data!.set(bytes, off);
                node.mtime = nowDatetime();
            }));
        },

        appendViaStream(): FsResult<WasiOutputStream> {
            if (node.type !== 'file') return err('bad-descriptor');
            return ok(createOutputStream((bytes) => {
                const oldData = node.data!;
                const newData = new Uint8Array(oldData.length + bytes.length);
                newData.set(oldData);
                newData.set(bytes, oldData.length);
                node.data = newData;
                node.mtime = nowDatetime();
            }));
        },

        getFlags(): FsResult<DescriptorFlags> {
            return ok(flags);
        },

        getType(): FsResult<DescriptorType> {
            return ok(node.type === 'file' ? 'regular-file' : 'directory');
        },

        setSize(size: bigint): FsResult<void> {
            if (node.type !== 'file') return err('bad-descriptor');
            const newSize = Number(size);
            const newData = new Uint8Array(newSize);
            newData.set(node.data!.slice(0, Math.min(node.data!.length, newSize)));
            node.data = newData;
            node.mtime = nowDatetime();
            return ok(undefined);
        },

        read(length: bigint, offset: bigint): FsResult<[Uint8Array, boolean]> {
            if (node.type !== 'file') return err('bad-descriptor');
            const data = node.data!;
            const off = Number(offset);
            const len = Number(length);
            if (off >= data.length) return ok([new Uint8Array(0), true]);
            const end = Math.min(off + len, data.length);
            const slice = data.slice(off, end);
            node.atime = nowDatetime();
            return ok([slice, end >= data.length]);
        },

        write(buffer: Uint8Array, offset: bigint): FsResult<bigint> {
            if (node.type !== 'file') return err('bad-descriptor');
            const off = Number(offset);
            const needed = off + buffer.length;
            if (needed > node.data!.length) {
                const newData = new Uint8Array(needed);
                newData.set(node.data!);
                node.data = newData;
            }
            node.data!.set(buffer, off);
            node.mtime = nowDatetime();
            return ok(BigInt(buffer.length));
        },

        readDirectory(): FsResult<WasiDirectoryEntryStream> {
            if (node.type !== 'directory') return err('not-directory');
            return ok(createDirectoryEntryStream(node));
        },

        syncData(): FsResult<void> {
            return ok(undefined); // No-op for in-memory VFS
        },

        sync(): FsResult<void> {
            return ok(undefined); // No-op
        },

        stat(): FsResult<DescriptorStat> {
            return ok(nodeToStat(node));
        },

        statAt(_pathFlags: PathFlags, path: string): FsResult<DescriptorStat> {
            if (node.type !== 'directory') return err('not-directory');
            const target = resolvePathFull(node, path);
            if (!target) return err('no-entry');
            return ok(nodeToStat(target));
        },

        createDirectoryAt(path: string): FsResult<void> {
            const resolved = resolveParent(node, path);
            if (!resolved) return err('no-entry');
            const { parent, name } = resolved;
            if (parent.children!.has(name)) return err('exist');
            parent.children!.set(name, createDirNode(name));
            parent.mtime = nowDatetime();
            return ok(undefined);
        },

        openAt(_pathFlags: PathFlags, path: string, openFlags: OpenFlags, descriptorFlags: DescriptorFlags): FsResult<WasiDescriptor> {
            if (node.type !== 'directory') return err('not-directory');

            const resolved = resolveParent(node, path);
            if (!resolved) return err('no-entry');
            const { parent, name } = resolved;

            let target = parent.children!.get(name);

            if (openFlags.exclusive && target) {
                return err('exist');
            }

            if (!target) {
                if (!openFlags.create) return err('no-entry');
                if (openFlags.directory) {
                    target = createDirNode(name);
                } else {
                    target = createFileNode(name, new Uint8Array(0));
                }
                parent.children!.set(name, target);
                parent.mtime = nowDatetime();
            }

            if (openFlags.directory && target.type !== 'directory') {
                return err('not-directory');
            }

            if (openFlags.truncate && target.type === 'file') {
                target.data = new Uint8Array(0);
                target.mtime = nowDatetime();
            }

            const childPath = nodePath + '/' + path;
            return ok(createDescriptor(target, descriptorFlags, childPath));
        },

        removeDirectoryAt(path: string): FsResult<void> {
            const resolved = resolveParent(node, path);
            if (!resolved) return err('no-entry');
            const { parent, name } = resolved;
            const target = parent.children!.get(name);
            if (!target) return err('no-entry');
            if (target.type !== 'directory') return err('not-directory');
            if (target.children!.size > 0) return err('not-empty');
            parent.children!.delete(name);
            parent.mtime = nowDatetime();
            return ok(undefined);
        },

        unlinkFileAt(path: string): FsResult<void> {
            const resolved = resolveParent(node, path);
            if (!resolved) return err('no-entry');
            const { parent, name } = resolved;
            const target = parent.children!.get(name);
            if (!target) return err('no-entry');
            if (target.type === 'directory') return err('is-directory');
            parent.children!.delete(name);
            parent.mtime = nowDatetime();
            return ok(undefined);
        },

        renameAt(oldPath: string, newDescriptor: WasiDescriptor, newPath: string): FsResult<void> {
            // Resolve old
            const oldResolved = resolveParent(node, oldPath);
            if (!oldResolved) return err('no-entry');
            const { parent: oldParent, name: oldName } = oldResolved;
            const target = oldParent.children!.get(oldName);
            if (!target) return err('no-entry');

            // Resolve new — newDescriptor must point to a directory
            const newNode = newDescriptor._node();
            const newResolved = resolveParent(newNode, newPath);
            if (!newResolved) return err('no-entry');
            const { parent: newParent, name: newName } = newResolved;

            // Check for directory/file conflicts
            const existing = newParent.children!.get(newName);
            if (existing) {
                if (target.type === 'directory' && existing.type !== 'directory') return err('not-directory');
                if (target.type !== 'directory' && existing.type === 'directory') return err('is-directory');
                if (existing.type === 'directory' && existing.children!.size > 0) return err('not-empty');
            }

            // Perform the rename
            oldParent.children!.delete(oldName);
            target.name = newName;
            newParent.children!.set(newName, target);
            oldParent.mtime = nowDatetime();
            newParent.mtime = nowDatetime();
            return ok(undefined);
        },

        readlinkAt(_path: string): FsResult<string> {
            return err('unsupported');
        },

        symlinkAt(_oldPath: string, _newPath: string): FsResult<void> {
            return err('unsupported');
        },

        linkAt(_oldPathFlags: PathFlags, _oldPath: string, _newDescriptor: WasiDescriptor, _newPath: string): FsResult<void> {
            return err('unsupported');
        },

        setTimesAt(_pathFlags: PathFlags, path: string, atime: WasiDatetime | undefined, mtime: WasiDatetime | undefined): FsResult<void> {
            if (node.type !== 'directory') return err('not-directory');
            const target = resolvePathFull(node, path);
            if (!target) return err('no-entry');
            if (atime) target.atime = atime;
            if (mtime) target.mtime = mtime;
            return ok(undefined);
        },

        isSameObject(other: WasiDescriptor): boolean {
            return node === other._node();
        },

        metadataHash(): FsResult<MetadataHashValue> {
            return ok(hashPath(nodePath));
        },

        metadataHashAt(_pathFlags: PathFlags, path: string): FsResult<MetadataHashValue> {
            if (node.type !== 'directory') return err('not-directory');
            const target = resolvePathFull(node, path);
            if (!target) return err('no-entry');
            return ok(hashPath(nodePath + '/' + path));
        },

        advise(_offset: bigint, _length: bigint, _advice: string): FsResult<void> {
            return ok(undefined); // No-op for in-memory VFS
        },

        setTimes(atime: WasiDatetime | undefined, mtime: WasiDatetime | undefined): FsResult<void> {
            if (atime) node.atime = atime;
            if (mtime) node.mtime = mtime;
            return ok(undefined);
        },

        _node(): VfsNode {
            return node;
        },
    };

    return descriptor;
}

// ─── Preopens ───

/** wasi:filesystem/preopens — returns list of (descriptor, path) pairs */
export interface WasiPreopens {
    getDirectories(): [WasiDescriptor, string][];
}

// ─── Factory ───

/** wasi:filesystem combined interface */
export interface WasiFilesystem {
    preopens: WasiPreopens;
    /** Open a root descriptor for the entire VFS */
    rootDescriptor(): WasiDescriptor;
}

/**
 * Create a wasi:filesystem implementation.
 *
 * @param files Map of absolute unix paths to file contents.
 *              Directories are created implicitly from paths.
 *
 * @example
 * ```ts
 * const fs = createWasiFilesystem(new Map([
 *   ['/home/user/hello.txt', new TextEncoder().encode('hello')],
 *   ['/tmp/data.bin', new Uint8Array([0x01, 0x02])],
 * ]));
 * ```
 */
export function createWasiFilesystem(files?: Map<string, Uint8Array>): WasiFilesystem {
    const root = buildVfsTree(files ?? new Map());
    const rootFlags: DescriptorFlags = { read: true, write: true, mutateDirectory: true };

    // Derive preopens from top-level directories
    const preopen: [WasiDescriptor, string][] = [];
    if (root.children!.size > 0) {
        // Each top-level directory is a preopen
        for (const [name, child] of root.children!) {
            if (child.type === 'directory') {
                preopen.push([
                    createDescriptor(child, rootFlags, '/' + name),
                    '/' + name,
                ]);
            }
        }
    }

    // If no top-level directories exist, use root as the sole preopen
    if (preopen.length === 0) {
        preopen.push([createDescriptor(root, rootFlags, '/'), '/']);
    }

    return {
        preopens: {
            getDirectories(): [WasiDescriptor, string][] {
                return preopen;
            },
        },
        rootDescriptor(): WasiDescriptor {
            return createDescriptor(root, rootFlags, '/');
        },
    };
}
