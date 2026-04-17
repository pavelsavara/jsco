// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

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

import type { WasiP3Imports } from '../../../wit/wasip3/types/index';
import type { WasiInputStream, WasiOutputStream } from './io';
import { createInputStreamFromP3, createOutputStreamFromP3 } from './io';
import { createStreamPair } from '../wasip3/streams';

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
    return { tag: 'ok', val };
}

function fsErr<T>(code: ErrorCode): FsResult<T> {
    return { tag: 'err', val: code };
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
    if (e && typeof e === 'object' && 'tag' in e) {
        const tagged = e as { tag: string; val?: string };
        if (tagged.tag === 'other') return 'io';
        return tagged.tag;
    }
    return 'io';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type P3Descriptor = any;

/**
 * Wrap a P3 filesystem descriptor as a P2 WasiDescriptor.
 */
export function wrapP3Descriptor(p3desc: P3Descriptor): P2DescriptorAdapter {
    return new P2DescriptorAdapter(p3desc);
}

export class P2DescriptorAdapter {
    constructor(private readonly p3: P3Descriptor) { }

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
            return fsOk(createOutputStreamFromP3(pair));
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    appendViaStream(): FsResult<WasiOutputStream> {
        try {
            const pair = createStreamPair<Uint8Array>();
            this.p3.appendViaStream(pair.readable);
            return fsOk(createOutputStreamFromP3(pair));
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    getType(): FsResult<DescriptorType> {
        try {
            const result = this.p3.getType();
            if (result instanceof Promise) {
                // P3 is async — for P2 we need sync. This requires JSPI.
                throw new Error('P3 getType is async — requires JSPI bridge');
            }
            return fsOk(p3DescriptorTypeToP2(result));
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    stat(): FsResult<DescriptorStat> {
        try {
            const result = this.p3.stat();
            if (result instanceof Promise) {
                throw new Error('P3 stat is async — requires JSPI bridge');
            }
            return fsOk(p2DescriptorStatFromP3(result));
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    statAt(pathFlags: PathFlags, path: string): FsResult<DescriptorStat> {
        try {
            const result = this.p3.statAt(pathFlags, path);
            if (result instanceof Promise) {
                throw new Error('P3 statAt is async — requires JSPI bridge');
            }
            return fsOk(p2DescriptorStatFromP3(result));
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    openAt(pathFlags: PathFlags, path: string, openFlags: OpenFlags, descFlags: DescriptorFlags): FsResult<P2DescriptorAdapter> {
        try {
            const result = this.p3.openAt(pathFlags, path, openFlags, descFlags);
            if (result instanceof Promise) {
                throw new Error('P3 openAt is async — requires JSPI bridge');
            }
            return fsOk(wrapP3Descriptor(result));
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

    createDirectoryAt(path: string): FsResult<void> {
        try {
            const result = this.p3.createDirectoryAt(path);
            if (result instanceof Promise) {
                throw new Error('P3 createDirectoryAt is async — requires JSPI bridge');
            }
            return fsOk(undefined);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    removeDirectoryAt(path: string): FsResult<void> {
        try {
            const result = this.p3.removeDirectoryAt(path);
            if (result instanceof Promise) {
                throw new Error('P3 removeDirectoryAt is async — requires JSPI bridge');
            }
            return fsOk(undefined);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    unlinkFileAt(path: string): FsResult<void> {
        try {
            const result = this.p3.unlinkFileAt(path);
            if (result instanceof Promise) {
                throw new Error('P3 unlinkFileAt is async — requires JSPI bridge');
            }
            return fsOk(undefined);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    read(length: bigint, offset: bigint): FsResult<[Uint8Array, boolean]> {
        // P3 removed read() — synthesize from readViaStream
        try {
            const [stream] = this.p3.readViaStream(offset);
            const iterator = stream[Symbol.asyncIterator]();
            // Synchronous attempt — get first chunk
            const next = iterator.next();
            if (next instanceof Promise) {
                throw new Error('P3 read requires async — use readViaStream');
            }
            const { done, value } = next;
            if (done || !value) return fsOk([new Uint8Array(0), true]);
            const data = value.slice(0, Number(length));
            const eof = data.length < Number(length);
            return fsOk([data, eof]);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    write(buffer: Uint8Array, offset: bigint): FsResult<bigint> {
        // P3 removed write() — synthesize from writeViaStream
        try {
            const pair = createStreamPair<Uint8Array>();
            void this.p3.writeViaStream(pair.readable, offset);
            pair.write(buffer).then(() => pair.close());
            return fsOk(BigInt(buffer.length));
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    getFlags(): FsResult<DescriptorFlags> {
        try {
            const result = this.p3.getFlags();
            if (result instanceof Promise) {
                throw new Error('P3 getFlags is async — requires JSPI bridge');
            }
            return fsOk(result);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    setSize(size: bigint): FsResult<void> {
        try {
            const result = this.p3.setSize(size);
            if (result instanceof Promise) {
                throw new Error('P3 setSize is async — requires JSPI bridge');
            }
            return fsOk(undefined);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    sync(): FsResult<void> {
        try {
            const result = this.p3.sync();
            if (result instanceof Promise) {
                throw new Error('P3 sync is async — requires JSPI bridge');
            }
            return fsOk(undefined);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    syncData(): FsResult<void> {
        try {
            const result = this.p3.syncData();
            if (result instanceof Promise) {
                throw new Error('P3 syncData is async — requires JSPI bridge');
            }
            return fsOk(undefined);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    metadataHash(): FsResult<MetadataHashValue> {
        try {
            const result = this.p3.metadataHash();
            if (result instanceof Promise) {
                throw new Error('P3 metadataHash is async — requires JSPI bridge');
            }
            return fsOk(result);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    metadataHashAt(pathFlags: PathFlags, path: string): FsResult<MetadataHashValue> {
        try {
            const result = this.p3.metadataHashAt(pathFlags, path);
            if (result instanceof Promise) {
                throw new Error('P3 metadataHashAt is async — requires JSPI bridge');
            }
            return fsOk(result);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    renameAt(oldPath: string, newDesc: P2DescriptorAdapter, newPath: string): FsResult<void> {
        try {
            const result = this.p3.renameAt(oldPath, newDesc.p3, newPath);
            if (result instanceof Promise) {
                throw new Error('P3 renameAt is async — requires JSPI bridge');
            }
            return fsOk(undefined);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    linkAt(oldPathFlags: PathFlags, oldPath: string, newDesc: P2DescriptorAdapter, newPath: string): FsResult<void> {
        try {
            const result = this.p3.linkAt(oldPathFlags, oldPath, newDesc.p3, newPath);
            if (result instanceof Promise) {
                throw new Error('P3 linkAt is async — requires JSPI bridge');
            }
            return fsOk(undefined);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    readlinkAt(path: string): FsResult<string> {
        try {
            const result = this.p3.readlinkAt(path);
            if (result instanceof Promise) {
                throw new Error('P3 readlinkAt is async — requires JSPI bridge');
            }
            return fsOk(result);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    symlinkAt(oldPath: string, newPath: string): FsResult<void> {
        try {
            const result = this.p3.symlinkAt(oldPath, newPath);
            if (result instanceof Promise) {
                throw new Error('P3 symlinkAt is async — requires JSPI bridge');
            }
            return fsOk(undefined);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    setTimes(atime: NewTimestamp, mtime: NewTimestamp): FsResult<void> {
        try {
            const result = this.p3.setTimes(atime, mtime);
            if (result instanceof Promise) {
                throw new Error('P3 setTimes is async — requires JSPI bridge');
            }
            return fsOk(undefined);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    setTimesAt(pathFlags: PathFlags, path: string, atime: NewTimestamp, mtime: NewTimestamp): FsResult<void> {
        try {
            const result = this.p3.setTimesAt(pathFlags, path, atime, mtime);
            if (result instanceof Promise) {
                throw new Error('P3 setTimesAt is async — requires JSPI bridge');
            }
            return fsOk(undefined);
        } catch (e) {
            return fsErr(extractErrorCode(e));
        }
    }

    isSameObject(other: P2DescriptorAdapter): boolean {
        return this.p3 === other.p3;
    }

    advise(_offset: bigint, _length: bigint, _advice: Advice): FsResult<void> {
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
        this.nextPromise = (async () => {
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

export function adaptFilesystemTypes(p3: WasiP3Imports) {
    const p3fs = p3['wasi:filesystem/types'];
    return {
        p3fs,
        wrapDescriptor: wrapP3Descriptor,
    };
}

export function adaptPreopens(p3: WasiP3Imports) {
    const p3preopens = p3['wasi:filesystem/preopens'];
    return {
        getDirectories(): [P2DescriptorAdapter, string][] {
            const p3dirs = p3preopens.getDirectories();
            return p3dirs.map(([desc, path]: [unknown, string]) => [wrapP3Descriptor(desc), path]);
        },
    };
}
