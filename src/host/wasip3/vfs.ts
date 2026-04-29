// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * WASIp3 Virtual Filesystem — in-memory tree-based VFS backend.
 *
 * Provides `MemoryVfsBackend` implementing `IVfsBackend`, which all
 * Descriptor methods call through. The async interface boundary enables
 * future replacement with SharedArrayBuffer+Atomics or a component-based
 * backend without changing callers.
 */

import type { AllocationLimits } from './types';
import { LIMIT_DEFAULTS } from './types';

// ──────────────────── Error types ────────────────────

/** Filesystem error codes matching the WASIp3 ErrorCode variants. */
export type FsErrorCode =
    | 'access'
    | 'exist'
    | 'invalid'
    | 'io'
    | 'is-directory'
    | 'name-too-long'
    | 'no-entry'
    | 'not-directory'
    | 'not-empty'
    | 'not-permitted'
    | 'read-only'
    | 'cross-device'
    | 'insufficient-space'
    | 'overflow'
    | 'unsupported'
    | 'bad-descriptor'
    | 'loop';

/** Throwable filesystem error carrying an error code. */
export class VfsError extends Error {
    readonly code: FsErrorCode;
    constructor(code: FsErrorCode, message?: string) {
        super(message ?? `VfsError: ${code}`);
        this.name = 'VfsError';
        this.code = code;
    }
}

// ──────────────────── Node types ────────────────────

export const enum VfsNodeType {
    File = 0,
    Directory = 1,
    Symlink = 2,
}

export interface VfsTimestamps {
    /** Last data access (atime). */
    accessTime: bigint;
    /** Last data modification (mtime). */
    modifyTime: bigint;
    /** Last status change (ctime). */
    changeTime: bigint;
}

function nowNs(): bigint {
    return BigInt(Date.now()) * 1_000_000n;
}

function makeTimestamps(): VfsTimestamps {
    const n = nowNs();
    return { accessTime: n, modifyTime: n, changeTime: n };
}

/** In-memory VFS node. */
export interface VfsNode {
    type: VfsNodeType;
    timestamps: VfsTimestamps;
    /** File content (File only). */
    content?: Uint8Array;
    /** Children map (Directory only). Names never contain '/' or null bytes. */
    children?: Map<string, VfsNode>;
    /** Symlink target (Symlink only). */
    symlinkTarget?: string;
    /** Number of links. */
    linkCount: number;
    /** Unique id for identity comparisons. */
    readonly id: number;
}

let nextNodeId = 1;

export function createFileNode(content: Uint8Array): VfsNode {
    return {
        type: VfsNodeType.File,
        timestamps: makeTimestamps(),
        content,
        linkCount: 1,
        id: nextNodeId++,
    };
}

export function createDirectoryNode(): VfsNode {
    return {
        type: VfsNodeType.Directory,
        timestamps: makeTimestamps(),
        children: new Map(),
        linkCount: 1,
        id: nextNodeId++,
    };
}

function createSymlinkNode(target: string): VfsNode {
    return {
        type: VfsNodeType.Symlink,
        timestamps: makeTimestamps(),
        symlinkTarget: target,
        linkCount: 1,
        id: nextNodeId++,
    };
}

// ──────────────────── Path utilities ────────────────────

const MAX_SYMLINK_DEPTH = 40;

/**
 * Validate a path component: reject empty, null bytes, '/', '.', '..'.
 */
function validatePathComponent(name: string, maxPathLength: number): void {
    if (name.length === 0) throw new VfsError('invalid', 'empty path component');
    if (name.length > maxPathLength) throw new VfsError('name-too-long');
    if (name.includes('\0')) throw new VfsError('invalid', 'null byte in path');
    if (name.includes('/')) throw new VfsError('invalid', 'slash in path component');
}

/**
 * Validate a full path string: reject null bytes, excessive length.
 */
function validatePath(path: string, maxPathLength: number): void {
    if (path.length === 0) throw new VfsError('invalid', 'empty path');
    if (path.length > maxPathLength) throw new VfsError('name-too-long');
    if (path.includes('\0')) throw new VfsError('invalid', 'null byte in path');
}

/**
 * Split a relative path into non-empty components, normalizing '.' and
 * checking that '..' never escapes above the root of the given base.
 * Returns the resolved components (no '.' or '..').
 */
export function resolvePathComponents(baseParts: string[], relativePath: string): string[] {
    const parts = [...baseParts];
    for (const seg of relativePath.split('/')) {
        if (seg === '' || seg === '.') continue;
        if (seg === '..') {
            if (parts.length === 0) {
                throw new VfsError('not-permitted', 'path escape via ..');
            }
            parts.pop();
        } else {
            parts.push(seg);
        }
    }
    return parts;
}

// ──────────────────── Descriptor flags ────────────────────

export const enum DescFlags {
    Read = 1,
    Write = 2,
    MutateDirectory = 4,
}

// ──────────────────── IVfsBackend interface ────────────────────

export interface VfsStat {
    type: VfsNodeType;
    size: bigint;
    linkCount: bigint;
    accessTime: bigint;
    modifyTime: bigint;
    changeTime: bigint;
    nodeId: number;
}

export interface VfsDirectoryEntry {
    type: VfsNodeType;
    name: string;
}

export interface VfsOpenResult {
    node: VfsNode;
    path: string[];
}

export interface VfsOpenFlags {
    create?: boolean;
    exclusive?: boolean;
    truncate?: boolean;
    directory?: boolean;
}

export interface VfsDescriptorFlags {
    read?: boolean;
    write?: boolean;
    mutateDirectory?: boolean;
}

/**
 * Async VFS backend interface. All Descriptor methods dispatch here.
 * In-memory implementation is synchronous under the hood but exposed as async.
 */
export interface IVfsBackend {
    stat(path: string[]): VfsStat;
    read(path: string[], offset: bigint, len: number): Uint8Array;
    write(path: string[], data: Uint8Array, offset: bigint): void;
    append(path: string[], data: Uint8Array): void;
    setSize(path: string[], size: bigint): void;
    setTimes(path: string[], accessTime: bigint | null, modifyTime: bigint | null): void;
    openAt(dirPath: string[], relativePath: string, openFlags: VfsOpenFlags, descFlags: VfsDescriptorFlags, followSymlinks: boolean): VfsOpenResult;
    readDirectory(path: string[]): VfsDirectoryEntry[];
    createDirectory(dirPath: string[], name: string): void;
    removeDirectory(dirPath: string[], name: string): void;
    unlinkFile(dirPath: string[], name: string): void;
    rename(oldDirPath: string[], oldName: string, newDirPath: string[], newName: string): void;
    linkAt(oldPath: string[], newDirPath: string[], newName: string): void;
    symlinkAt(dirPath: string[], target: string, linkName: string): void;
    readlinkAt(dirPath: string[], name: string): string;
    isSameNode(pathA: string[], pathB: string[]): boolean;
    metadataHash(path: string[]): { lower: bigint; upper: bigint };
}

// ──────────────────── MemoryVfsBackend ────────────────────

export interface MemoryVfsConfig {
    limits?: AllocationLimits;
    /** Maximum total VFS size in bytes. Default: 256MB */
    maxTotalSize?: number;
}

const DEFAULT_MAX_TOTAL_SIZE = 268_435_456; // 256MB

/**
 * In-memory VFS backend. Directory tree with file content stored as Uint8Array.
 */
export class MemoryVfsBackend implements IVfsBackend {
    readonly root: VfsNode;
    private readonly maxPathLength: number;
    private readonly maxAllocationSize: number;
    private readonly maxTotalSize: number;
    private totalSize: number;

    constructor(config?: MemoryVfsConfig) {
        this.root = createDirectoryNode();
        this.maxPathLength = config?.limits?.maxPathLength ?? LIMIT_DEFAULTS.maxPathLength;
        this.maxAllocationSize = config?.limits?.maxAllocationSize ?? LIMIT_DEFAULTS.maxAllocationSize;
        this.maxTotalSize = config?.maxTotalSize ?? DEFAULT_MAX_TOTAL_SIZE;
        this.totalSize = 0;
    }

    /**
     * Resolve a path (array of components) starting from root.
     * Returns the final VfsNode. Follows symlinks up to MAX_SYMLINK_DEPTH.
     */
    resolveNode(path: string[], followFinalSymlink = true): VfsNode {
        let node = this.root;
        for (let i = 0; i < path.length; i++) {
            const component = path[i]!;
            if (node.type === VfsNodeType.Symlink) {
                throw new VfsError('not-directory');
            }
            if (node.type !== VfsNodeType.Directory) {
                throw new VfsError('not-directory');
            }
            const child = node.children!.get(component);
            if (!child) {
                throw new VfsError('no-entry');
            }
            if (child.type === VfsNodeType.Symlink && (followFinalSymlink || i < path.length - 1)) {
                // Resolve symlink
                const resolved = this.resolveSymlink(path.slice(0, i), child, 0);
                // Continue resolution with remaining components
                const remaining = path.slice(i + 1);
                if (remaining.length === 0) return resolved;
                return this.resolveNode([...this.getNodePath(resolved), ...remaining], followFinalSymlink);
            }
            node = child;
        }
        return node;
    }

    /**
     * Find the path components for a node by walking from root (needed for symlink resolution).
     * For simplicity, symlink resolution uses the pre-computed path.
     */
    private getNodePath(targetNode: VfsNode): string[] {
        // Walk the tree to find the path to this node
        const result: string[] = [];
        const found = this.findNodePath(this.root, targetNode, result);
        if (!found) throw new VfsError('io', 'internal: cannot find node path');
        return result;
    }

    private findNodePath(current: VfsNode, target: VfsNode, path: string[]): boolean {
        if (current.id === target.id) return true;
        if (current.type !== VfsNodeType.Directory || !current.children) return false;
        for (const [name, child] of current.children) {
            path.push(name);
            if (this.findNodePath(child, target, path)) return true;
            path.pop();
        }
        return false;
    }

    private resolveSymlink(basePath: string[], symlinkNode: VfsNode, depth: number): VfsNode {
        if (depth >= MAX_SYMLINK_DEPTH) throw new VfsError('loop');
        const target = symlinkNode.symlinkTarget!;
        if (target.startsWith('/')) throw new VfsError('not-permitted', 'absolute symlink target');
        const resolved = resolvePathComponents(basePath, target);
        const node = this.resolveNode(resolved, true);
        if (node.type === VfsNodeType.Symlink) {
            return this.resolveSymlink(resolved.slice(0, -1), node, depth + 1);
        }
        return node;
    }

    /**
     * Resolve a path to its parent directory and the final name component.
     */
    private resolveParent(path: string[]): { parent: VfsNode; name: string } {
        if (path.length === 0) throw new VfsError('invalid', 'empty path');
        const name = path[path.length - 1]!;
        const parentPath = path.slice(0, -1);
        const parent = this.resolveNode(parentPath, true);
        if (parent.type !== VfsNodeType.Directory) throw new VfsError('not-directory');
        return { parent, name };
    }

    /** Populate the VFS from a Map<string, Uint8Array|string>. */
    populateFromMap(files: Map<string, Uint8Array | string>): void {
        for (const [path, content] of files) {
            const data = typeof content === 'string' ? new TextEncoder().encode(content) : content;
            const parts = path.split('/').filter(p => p !== '' && p !== '.');
            if (parts.length === 0) continue;

            // Ensure parent directories exist
            let node = this.root;
            for (let i = 0; i < parts.length - 1; i++) {
                const component = parts[i]!;
                let child = node.children!.get(component);
                if (!child) {
                    child = createDirectoryNode();
                    node.children!.set(component, child);
                } else if (child.type !== VfsNodeType.Directory) {
                    throw new VfsError('not-directory', `${component} is not a directory`);
                }
                node = child;
            }

            const fileName = parts[parts.length - 1]!;
            this.totalSize += data.length;
            node.children!.set(fileName, createFileNode(data));
        }
    }

    // ──── IVfsBackend implementation ────

    stat(path: string[]): VfsStat {
        const node = path.length === 0 ? this.root : this.resolveNode(path);
        return this.statNode(node);
    }

    private statNode(node: VfsNode): VfsStat {
        const size = node.type === VfsNodeType.File
            ? BigInt(node.content?.length ?? 0)
            : node.type === VfsNodeType.Symlink
                ? BigInt(node.symlinkTarget?.length ?? 0)
                : 0n;
        return {
            type: node.type,
            size,
            linkCount: BigInt(node.linkCount),
            accessTime: node.timestamps.accessTime,
            modifyTime: node.timestamps.modifyTime,
            changeTime: node.timestamps.changeTime,
            nodeId: node.id,
        };
    }

    read(path: string[], offset: bigint, len: number): Uint8Array {
        const node = this.resolveNode(path);
        if (node.type === VfsNodeType.Directory) throw new VfsError('is-directory');
        if (node.type !== VfsNodeType.File) throw new VfsError('invalid');
        const content = node.content ?? new Uint8Array(0);
        const off = Number(offset);
        if (off >= content.length) return new Uint8Array(0);
        const end = Math.min(off + len, content.length);
        node.timestamps.accessTime = nowNs();
        return content.slice(off, end);
    }

    write(path: string[], data: Uint8Array, offset: bigint): void {
        const node = this.resolveNode(path);
        if (node.type === VfsNodeType.Directory) throw new VfsError('is-directory');
        if (node.type !== VfsNodeType.File) throw new VfsError('invalid');
        const off = Number(offset);
        const needed = off + data.length;
        if (needed > this.maxAllocationSize) throw new VfsError('insufficient-space', 'file size exceeds allocation limit');
        const oldLen = node.content?.length ?? 0;
        const newLen = Math.max(oldLen, needed);
        const sizeDelta = newLen - oldLen;
        if (this.totalSize + sizeDelta > this.maxTotalSize) throw new VfsError('insufficient-space', 'VFS total size exceeded');

        if (newLen !== oldLen || !node.content) {
            const newContent = new Uint8Array(newLen);
            if (node.content) newContent.set(node.content);
            node.content = newContent;
        }
        node.content.set(data, off);
        this.totalSize += sizeDelta;
        const n = nowNs();
        node.timestamps.modifyTime = n;
        node.timestamps.changeTime = n;
    }

    append(path: string[], data: Uint8Array): void {
        const node = this.resolveNode(path);
        if (node.type === VfsNodeType.Directory) throw new VfsError('is-directory');
        if (node.type !== VfsNodeType.File) throw new VfsError('invalid');
        const oldLen = node.content?.length ?? 0;
        const newLen = oldLen + data.length;
        if (newLen > this.maxAllocationSize) throw new VfsError('insufficient-space', 'file size exceeds allocation limit');
        if (this.totalSize + data.length > this.maxTotalSize) throw new VfsError('insufficient-space', 'VFS total size exceeded');

        const newContent = new Uint8Array(newLen);
        if (node.content) newContent.set(node.content);
        newContent.set(data, oldLen);
        node.content = newContent;
        this.totalSize += data.length;
        const n = nowNs();
        node.timestamps.modifyTime = n;
        node.timestamps.changeTime = n;
    }

    setSize(path: string[], size: bigint): void {
        const node = this.resolveNode(path);
        if (node.type === VfsNodeType.Directory) throw new VfsError('is-directory');
        if (node.type !== VfsNodeType.File) throw new VfsError('invalid');
        const newSize = Number(size);
        if (newSize > this.maxAllocationSize) throw new VfsError('insufficient-space');
        const oldLen = node.content?.length ?? 0;
        const sizeDelta = newSize - oldLen;
        if (sizeDelta > 0 && this.totalSize + sizeDelta > this.maxTotalSize) throw new VfsError('insufficient-space');

        const newContent = new Uint8Array(newSize);
        if (node.content) {
            newContent.set(node.content.slice(0, Math.min(oldLen, newSize)));
        }
        node.content = newContent;
        this.totalSize += sizeDelta;
        const n = nowNs();
        node.timestamps.modifyTime = n;
        node.timestamps.changeTime = n;
    }

    setTimes(path: string[], accessTime: bigint | null, modifyTime: bigint | null): void {
        const node = path.length === 0 ? this.root : this.resolveNode(path);
        if (accessTime !== null) node.timestamps.accessTime = accessTime;
        if (modifyTime !== null) node.timestamps.modifyTime = modifyTime;
        node.timestamps.changeTime = nowNs();
    }

    openAt(
        dirPath: string[],
        relativePath: string,
        openFlags: VfsOpenFlags,
        descFlags: VfsDescriptorFlags,
        followSymlinks: boolean,
    ): VfsOpenResult {
        validatePath(relativePath, this.maxPathLength);
        const fullPath = resolvePathComponents(dirPath, relativePath);
        if (fullPath.length === 0) {
            // Opening the root
            if (openFlags.exclusive) throw new VfsError('exist');
            return { node: this.root, path: [] };
        }

        const parentPath = fullPath.slice(0, -1);
        const name = fullPath[fullPath.length - 1]!;
        validatePathComponent(name, this.maxPathLength);
        const parent = parentPath.length === 0 ? this.root : this.resolveNode(parentPath, true);
        if (parent.type !== VfsNodeType.Directory) throw new VfsError('not-directory');

        let node = parent.children!.get(name);

        // Follow symlink if present
        if (node && node.type === VfsNodeType.Symlink && followSymlinks) {
            const resolved = this.resolveSymlink(parentPath, node, 0);
            node = resolved;
        }

        if (node) {
            if (openFlags.exclusive) throw new VfsError('exist');
            if (openFlags.directory && node.type !== VfsNodeType.Directory) throw new VfsError('not-directory');
            if (openFlags.truncate && node.type === VfsNodeType.File) {
                const oldLen = node.content?.length ?? 0;
                this.totalSize -= oldLen;
                node.content = new Uint8Array(0);
                const n = nowNs();
                node.timestamps.modifyTime = n;
                node.timestamps.changeTime = n;
            }
            return { node, path: fullPath };
        }

        // Node doesn't exist
        if (!openFlags.create) throw new VfsError('no-entry');

        // Check mutate-directory on parent descriptor is caller's responsibility
        if (openFlags.directory) {
            const dir = createDirectoryNode();
            parent.children!.set(name, dir);
            return { node: dir, path: fullPath };
        }
        const file = createFileNode(new Uint8Array(0));
        parent.children!.set(name, file);
        return { node: file, path: fullPath };
    }

    readDirectory(path: string[]): VfsDirectoryEntry[] {
        const node = path.length === 0 ? this.root : this.resolveNode(path);
        if (node.type !== VfsNodeType.Directory) throw new VfsError('not-directory');
        const entries: VfsDirectoryEntry[] = [];
        for (const [name, child] of node.children!) {
            entries.push({ type: child.type, name });
        }
        node.timestamps.accessTime = nowNs();
        return entries;
    }

    createDirectory(dirPath: string[], name: string): void {
        validatePathComponent(name, this.maxPathLength);
        const parent = dirPath.length === 0 ? this.root : this.resolveNode(dirPath);
        if (parent.type !== VfsNodeType.Directory) throw new VfsError('not-directory');
        if (parent.children!.has(name)) throw new VfsError('exist');
        parent.children!.set(name, createDirectoryNode());
        const n = nowNs();
        parent.timestamps.modifyTime = n;
        parent.timestamps.changeTime = n;
    }

    removeDirectory(dirPath: string[], name: string): void {
        validatePathComponent(name, this.maxPathLength);
        const parent = dirPath.length === 0 ? this.root : this.resolveNode(dirPath);
        if (parent.type !== VfsNodeType.Directory) throw new VfsError('not-directory');
        const child = parent.children!.get(name);
        if (!child) throw new VfsError('no-entry');
        if (child.type !== VfsNodeType.Directory) throw new VfsError('not-directory');
        if (child.children!.size > 0) throw new VfsError('not-empty');
        parent.children!.delete(name);
        const n = nowNs();
        parent.timestamps.modifyTime = n;
        parent.timestamps.changeTime = n;
    }

    unlinkFile(dirPath: string[], name: string): void {
        validatePathComponent(name, this.maxPathLength);
        const parent = dirPath.length === 0 ? this.root : this.resolveNode(dirPath);
        if (parent.type !== VfsNodeType.Directory) throw new VfsError('not-directory');
        const child = parent.children!.get(name);
        if (!child) throw new VfsError('no-entry');
        if (child.type === VfsNodeType.Directory) throw new VfsError('is-directory');
        if (child.type === VfsNodeType.File) {
            this.totalSize -= (child.content?.length ?? 0);
        }
        child.linkCount--;
        parent.children!.delete(name);
        const n = nowNs();
        parent.timestamps.modifyTime = n;
        parent.timestamps.changeTime = n;
    }

    rename(oldDirPath: string[], oldName: string, newDirPath: string[], newName: string): void {
        validatePathComponent(oldName, this.maxPathLength);
        validatePathComponent(newName, this.maxPathLength);
        const oldParent = oldDirPath.length === 0 ? this.root : this.resolveNode(oldDirPath);
        const newParent = newDirPath.length === 0 ? this.root : this.resolveNode(newDirPath);
        if (oldParent.type !== VfsNodeType.Directory) throw new VfsError('not-directory');
        if (newParent.type !== VfsNodeType.Directory) throw new VfsError('not-directory');
        const node = oldParent.children!.get(oldName);
        if (!node) throw new VfsError('no-entry');

        const existing = newParent.children!.get(newName);
        if (existing) {
            // If replacing a directory with a non-directory or vice versa, error
            if (existing.type === VfsNodeType.Directory && node.type !== VfsNodeType.Directory) throw new VfsError('is-directory');
            if (existing.type !== VfsNodeType.Directory && node.type === VfsNodeType.Directory) throw new VfsError('not-directory');
            if (existing.type === VfsNodeType.Directory && existing.children!.size > 0) throw new VfsError('not-empty');
            if (existing.type === VfsNodeType.File) {
                this.totalSize -= (existing.content?.length ?? 0);
            }
        }

        oldParent.children!.delete(oldName);
        newParent.children!.set(newName, node);
        const n = nowNs();
        oldParent.timestamps.modifyTime = n;
        oldParent.timestamps.changeTime = n;
        if (oldParent.id !== newParent.id) {
            newParent.timestamps.modifyTime = n;
            newParent.timestamps.changeTime = n;
        }
    }

    linkAt(oldPath: string[], newDirPath: string[], newName: string): void {
        validatePathComponent(newName, this.maxPathLength);
        const target = this.resolveNode(oldPath);
        if (target.type === VfsNodeType.Directory) throw new VfsError('not-permitted', 'cannot hard-link directories');
        const newParent = newDirPath.length === 0 ? this.root : this.resolveNode(newDirPath);
        if (newParent.type !== VfsNodeType.Directory) throw new VfsError('not-directory');
        if (newParent.children!.has(newName)) throw new VfsError('exist');
        target.linkCount++;
        newParent.children!.set(newName, target);
        const n = nowNs();
        newParent.timestamps.modifyTime = n;
        newParent.timestamps.changeTime = n;
        target.timestamps.changeTime = n;
    }

    symlinkAt(dirPath: string[], target: string, linkName: string): void {
        validatePathComponent(linkName, this.maxPathLength);
        if (target.startsWith('/')) throw new VfsError('not-permitted', 'absolute symlink target');
        if (target.includes('\0')) throw new VfsError('invalid', 'null byte in symlink target');
        const parent = dirPath.length === 0 ? this.root : this.resolveNode(dirPath);
        if (parent.type !== VfsNodeType.Directory) throw new VfsError('not-directory');
        if (parent.children!.has(linkName)) throw new VfsError('exist');
        parent.children!.set(linkName, createSymlinkNode(target));
        const n = nowNs();
        parent.timestamps.modifyTime = n;
        parent.timestamps.changeTime = n;
    }

    readlinkAt(dirPath: string[], name: string): string {
        validatePathComponent(name, this.maxPathLength);
        const parent = dirPath.length === 0 ? this.root : this.resolveNode(dirPath);
        if (parent.type !== VfsNodeType.Directory) throw new VfsError('not-directory');
        const child = parent.children!.get(name);
        if (!child) throw new VfsError('no-entry');
        if (child.type !== VfsNodeType.Symlink) throw new VfsError('invalid', 'not a symlink');
        return child.symlinkTarget!;
    }

    isSameNode(pathA: string[], pathB: string[]): boolean {
        const nodeA = pathA.length === 0 ? this.root : this.resolveNode(pathA);
        const nodeB = pathB.length === 0 ? this.root : this.resolveNode(pathB);
        return nodeA.id === nodeB.id;
    }

    metadataHash(path: string[]): { lower: bigint; upper: bigint } {
        const node = path.length === 0 ? this.root : this.resolveNode(path);
        return this.hashNode(node);
    }

    private hashNode(node: VfsNode): { lower: bigint; upper: bigint } {
        // Simple hash combining node id, modification time, and size
        const id = BigInt(node.id);
        const mtime = node.timestamps.modifyTime;
        const size = node.type === VfsNodeType.File ? BigInt(node.content?.length ?? 0) : 0n;
        const lower = (id * 2654435761n + mtime) & 0xFFFFFFFFFFFFFFFFn;
        const upper = (mtime * 2246822519n + size) & 0xFFFFFFFFFFFFFFFFn;
        return { lower, upper };
    }
}
