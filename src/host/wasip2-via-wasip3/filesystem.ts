// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

/**
 * wasi:filesystem adapter — bridges P3 filesystem descriptor API to P2.
 *
 * The P3 filesystem descriptor uses async methods and CM built-in streams.
 * The P2 API uses synchronous methods returning result types and IO streams.
 *
 * Key differences:
 * - P3 `readViaStream()` returns `[stream<u8>, future<result>]` → P2 returns `input-stream`
 * - P3 `writeViaStream(data, offset)` takes a stream → P2 returns `output-stream`
 * - P3 methods are async → P2 methods return `FsResult<T>`
 * - P3 `read`/`write` convenience methods were removed → P2 still has them
 * - P3 `descriptor-type` is variant with `other(...)` → P2 is enum
 * - P3 timestamps use `instant` → P2 uses `datetime`
 */

import type { WasiP3Imports } from '../wasip3';
import type { WasiInputStream, WasiOutputStream } from './io';
import { createInputStreamFromP3, createOutputStreamFromP3 } from './io';
import { createStreamPair } from '../wasip3';
import { ok, err } from '../wasip3';

// ─── P2 local type aliases ───

type ErrorCode = string;
type DescriptorType = string;
type FsResult<T> = { tag: 'ok'; val: T } | { tag: 'err'; val: ErrorCode };
type WasiDatetime = { seconds: bigint; nanoseconds: number };
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
    dataAccessTimestamp?: WasiDatetime;
    dataModificationTimestamp?: WasiDatetime;
    statusChangeTimestamp?: WasiDatetime;
};
export type NewTimestamp =
    | { tag: 'no-change' }
    | { tag: 'now' }
    | { tag: 'timestamp'; val: WasiDatetime };
type DirectoryEntry = { type: DescriptorType; name: string };
type Advice = string;
type MetadataHashValue = { upper: bigint; lower: bigint };

function fsOk<T>(val: T): FsResult<T> {
    return ok(val);
}

function fsErr<T>(code: ErrorCode): FsResult<T> {
    return err(code);
}

// ─── P3 descriptor type → P2 descriptor type mapping ───

function p3DescriptorTypeToP2(t: { tag: string; val?: string | undefined }): DescriptorType {
    if (t.tag === 'other') return 'unknown';
    return t.tag;
}

function p2DescriptorStatFromP3(stat: {
    type: { tag: string; val?: string | undefined };
    linkCount: bigint;
    size: bigint;
    dataAccessTimestamp?: { seconds: bigint; nanoseconds: number };
    dataModificationTimestamp?: { seconds: bigint; nanoseconds: number };
    statusChangeTimestamp?: { seconds: bigint; nanoseconds: number };
}): DescriptorStat {
    return {
        type: p3DescriptorTypeToP2(stat.type),
        linkCount: stat.linkCount,
        size: stat.size,
        dataAccessTimestamp: stat.dataAccessTimestamp
            ? { seconds: stat.dataAccessTimestamp.seconds < 0n ? 0n : stat.dataAccessTimestamp.seconds, nanoseconds: stat.dataAccessTimestamp.nanoseconds }
            : undefined,
        dataModificationTimestamp: stat.dataModificationTimestamp
            ? { seconds: stat.dataModificationTimestamp.seconds < 0n ? 0n : stat.dataModificationTimestamp.seconds, nanoseconds: stat.dataModificationTimestamp.nanoseconds }
            : undefined,
        statusChangeTimestamp: stat.statusChangeTimestamp
            ? { seconds: stat.statusChangeTimestamp.seconds < 0n ? 0n : stat.statusChangeTimestamp.seconds, nanoseconds: stat.statusChangeTimestamp.nanoseconds }
            : undefined,
    };
}

function extractErrorCode(e: unknown): ErrorCode {
    if (e && typeof e === 'object') {
        if ('tag' in e) {
            const tagged = e as { tag: string; val?: string };
            if (tagged.tag === 'other') return 'io';
            return tagged.tag;
        }
        // VfsError from P3 VFS backend (has .code instead of .tag)
        if ('code' in e && typeof (e as { code: unknown }).code === 'string') {
            return (e as { code: string }).code;
        }
    }
    return 'io';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type P3Descriptor = any;

/**
 * Wrap a P3 filesystem descriptor as a P2 WasiDescriptor.
 */
function wrapP3Descriptor(p3desc: P3Descriptor, maxBufferSize?: number): P2DescriptorAdapter {
    return new P2DescriptorAdapter(p3desc, maxBufferSize);
}

export class P2DescriptorAdapter {
    constructor(
        private readonly p3: P3Descriptor,
        private readonly maxBufferSize?: number,
    ) { }

    readViaStream(offset: bigint): FsResult<WasiInputStream> {
        try {
            const [stream] = this.p3.readViaStream(offset);
            return fsOk(createInputStreamFromP3(stream));
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    writeViaStream(offset: bigint): FsResult<WasiOutputStream> {
        try {
            const pair = createStreamPair<Uint8Array>();
            this.p3.writeViaStream(pair.readable, offset);
            return fsOk(createOutputStreamFromP3(pair, this.maxBufferSize));
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    appendViaStream(): FsResult<WasiOutputStream> {
        try {
            const pair = createStreamPair<Uint8Array>();
            this.p3.appendViaStream(pair.readable);
            return fsOk(createOutputStreamFromP3(pair, this.maxBufferSize));
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    async getType(): Promise<FsResult<DescriptorType>> {
        try {
            const result = await this.p3.getType();
            return fsOk(p3DescriptorTypeToP2(result));
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    async stat(): Promise<FsResult<DescriptorStat>> {
        try {
            const result = await this.p3.stat();
            return fsOk(p2DescriptorStatFromP3(result));
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    async statAt(pathFlags: PathFlags, path: string): Promise<FsResult<DescriptorStat>> {
        try {
            const result = await this.p3.statAt(pathFlags, path);
            return fsOk(p2DescriptorStatFromP3(result));
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    async openAt(pathFlags: PathFlags, path: string, openFlags: OpenFlags, descFlags: DescriptorFlags): Promise<FsResult<P2DescriptorAdapter>> {
        try {
            const result = await this.p3.openAt(pathFlags, path, openFlags, descFlags);
            return fsOk(wrapP3Descriptor(result, this.maxBufferSize));
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    readDirectory(): FsResult<P2DirectoryEntryStreamAdapter> {
        try {
            const [stream] = this.p3.readDirectory();
            return fsOk(new P2DirectoryEntryStreamAdapter(stream));
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    async createDirectoryAt(path: string): Promise<FsResult<void>> {
        try {
            await this.p3.createDirectoryAt(path);
            return fsOk(undefined);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    async removeDirectoryAt(path: string): Promise<FsResult<void>> {
        try {
            await this.p3.removeDirectoryAt(path);
            return fsOk(undefined);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    async unlinkFileAt(path: string): Promise<FsResult<void>> {
        try {
            await this.p3.unlinkFileAt(path);
            return fsOk(undefined);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    async read(length: bigint, offset: bigint): Promise<FsResult<[Uint8Array, boolean]>> {
        // P3 removed read() — synthesize from readViaStream
        try {
            const [stream] = this.p3.readViaStream(offset);
            const iterator = stream[Symbol.asyncIterator]();
            const { done, value } = await iterator.next();
            if (done || !value) return fsOk([new Uint8Array(0), true]);
            const data = value.slice(0, Number(length));
            const eof = data.length < Number(length);
            return fsOk([data, eof]);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    async write(buffer: Uint8Array, offset: bigint): Promise<FsResult<bigint>> {
        // P3 removed write() — synthesize from writeViaStream
        try {
            const pair = createStreamPair<Uint8Array>();
            const writeFuture = this.p3.writeViaStream(pair.readable, offset);
            await pair.write(buffer);
            await pair.close();
            await writeFuture;
            return fsOk(BigInt(buffer.length));
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    async getFlags(): Promise<FsResult<DescriptorFlags>> {
        try {
            const result = await this.p3.getFlags();
            return fsOk(result);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    async setSize(size: bigint): Promise<FsResult<void>> {
        try {
            await this.p3.setSize(size);
            return fsOk(undefined);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    async sync(): Promise<FsResult<void>> {
        try {
            await this.p3.sync();
            return fsOk(undefined);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    async syncData(): Promise<FsResult<void>> {
        try {
            await this.p3.syncData();
            return fsOk(undefined);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    async metadataHash(): Promise<FsResult<MetadataHashValue>> {
        try {
            const result = await this.p3.metadataHash();
            return fsOk(result);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    async metadataHashAt(pathFlags: PathFlags, path: string): Promise<FsResult<MetadataHashValue>> {
        try {
            const result = await this.p3.metadataHashAt(pathFlags, path);
            return fsOk(result);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    async renameAt(oldPath: string, newDesc: P2DescriptorAdapter, newPath: string): Promise<FsResult<void>> {
        try {
            await this.p3.renameAt(oldPath, newDesc.p3, newPath);
            return fsOk(undefined);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    async linkAt(oldPathFlags: PathFlags, oldPath: string, newDesc: P2DescriptorAdapter, newPath: string): Promise<FsResult<void>> {
        try {
            await this.p3.linkAt(oldPathFlags, oldPath, newDesc.p3, newPath);
            return fsOk(undefined);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    async readlinkAt(path: string): Promise<FsResult<string>> {
        try {
            const result = await this.p3.readlinkAt(path);
            return fsOk(result);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    async symlinkAt(oldPath: string, newPath: string): Promise<FsResult<void>> {
        try {
            await this.p3.symlinkAt(oldPath, newPath);
            return fsOk(undefined);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    async setTimes(atime: NewTimestamp, mtime: NewTimestamp): Promise<FsResult<void>> {
        try {
            await this.p3.setTimes(atime, mtime);
            return fsOk(undefined);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    async setTimesAt(pathFlags: PathFlags, path: string, atime: NewTimestamp, mtime: NewTimestamp): Promise<FsResult<void>> {
        try {
            await this.p3.setTimesAt(pathFlags, path, atime, mtime);
            return fsOk(undefined);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    async isSameObject(other: P2DescriptorAdapter): Promise<boolean> {
        return await this.p3.isSameObject(other.p3);
    }

    async advise(_offset: bigint, _length: bigint, _advice: Advice): Promise<FsResult<void>> {
        return fsOk(undefined);
    }
}

class P2DirectoryEntryStreamAdapter {
    private readonly iterator: AsyncIterator<{ type: { tag: string; val?: string | undefined }; name: string }>;
    private buffer: DirectoryEntry | null = null;
    private done = false;
    private nextPromise: Promise<void> | null = null;

    constructor(p3stream: AsyncIterable<{ type: { tag: string; val?: string | undefined }; name: string }>) {
        this.iterator = p3stream[Symbol.asyncIterator]();
        this.pumpNext();
    }

    private pumpNext(): void {
        if (this.done || this.nextPromise) return;
        this.nextPromise = (async (): Promise<void> => {
            try {
                const { done, value } = await this.iterator.next();
                if (done) {
                    this.done = true;
                } else {
                    this.buffer = {
                        type: p3DescriptorTypeToP2(value.type),
                        name: value.name,
                    };
                }
            } catch {
                this.done = true;
            }
            this.nextPromise = null;
        })();
    }

    readDirectoryEntry(): FsResult<DirectoryEntry | undefined> {
        if (this.buffer) {
            const entry = this.buffer;
            this.buffer = null;
            this.pumpNext();
            return fsOk(entry);
        }
        if (this.done) {
            return fsOk(undefined);
        }
        return fsOk(undefined);
    }
}

export function adaptPreopens(p3: WasiP3Imports, maxBufferSize?: number): { getDirectories(): [P2DescriptorAdapter, string][] } {
    const p3preopens = p3['wasi:filesystem/preopens'];
    return {
        getDirectories(): [P2DescriptorAdapter, string][] {
            const p3dirs = p3preopens.getDirectories();
            return p3dirs.map(([desc, path]: [unknown, string]) => [wrapP3Descriptor(desc, maxBufferSize), path]);
        },
    };
}
