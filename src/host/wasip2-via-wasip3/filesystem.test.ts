// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * Tests for wasi:filesystem through the P2-via-P3 adapter — full stack.
 *
 * Uses createWasiP3Host({ fs: Map }) → createWasiP2ViaP3Adapter()
 * so we exercise the entire pipeline: P3 VFS → P3 host → adapter → P2 interface.
 *
 * P3 VFS descriptor methods are async, so all adapter methods that wrap them
 * return Promises. Tests await these calls throughout.
 */

import { createWasiP3Host } from '../wasip3/index';
import { createWasiP2ViaP3Adapter } from './index';
import type { P2DescriptorAdapter } from './filesystem';

// ─── Helpers ───

type FsResult<T> = { tag: 'ok'; val: T } | { tag: 'err'; val: string };
type DirectoryEntry = { type: string; name: string };
type WasiDatetime = { seconds: bigint; nanoseconds: number };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function textFile(content: string): Uint8Array {
    return encoder.encode(content);
}

function unwrap<T>(result: FsResult<T>): T {
    if (result.tag === 'err') throw new Error(`Unexpected error: ${result.val}`);
    return result.val;
}

function expectErr<T>(result: FsResult<T>, code: string): void {
    expect(result.tag).toBe('err');
    if (result.tag === 'err') expect(result.val).toBe(code);
}

/** Create the full stack: P3 host → P2 adapter, return root descriptor + adapter */
function createStack(files?: Map<string, Uint8Array | string>) {
    const fsMap = new Map<string, Uint8Array | string>();
    if (files) {
        for (const [k, v] of files) {
            fsMap.set(k, v);
        }
    }
    const p3 = createWasiP3Host({ fs: fsMap });
    const p2 = createWasiP2ViaP3Adapter(p3);

    // Get root descriptor from preopens
    const dirs = p2['wasi:filesystem/preopens']!['get-directories']!() as [P2DescriptorAdapter, string][];
    expect(dirs.length).toBeGreaterThanOrEqual(1);
    const [root] = dirs[0]!;
    return { p2, root };
}

describe('wasi:filesystem (full stack via P3 adapter)', () => {

    // ─── Tree Construction ───

    describe('VFS tree construction', () => {
        it('creates empty filesystem', async () => {
            const { root } = createStack();
            expect(unwrap(await root.getType())).toBe('directory');
        });

        it('creates filesystem from file map', async () => {
            const { root } = createStack(new Map([
                ['/hello.txt', textFile('hello')],
            ]));
            const stat = unwrap(await root.statAt({}, 'hello.txt'));
            expect(stat.type).toBe('regular-file');
            expect(stat.size).toBe(5n);
        });

        it('creates intermediate directories', async () => {
            const { root } = createStack(new Map([
                ['/a/b/c/file.txt', textFile('deep')],
            ]));
            expect(unwrap(await root.statAt({}, 'a')).type).toBe('directory');
            expect(unwrap(await root.statAt({}, 'a/b')).type).toBe('directory');
            expect(unwrap(await root.statAt({}, 'a/b/c')).type).toBe('directory');
            expect(unwrap(await root.statAt({}, 'a/b/c/file.txt')).type).toBe('regular-file');
        });

        it('handles multiple files in same directory', async () => {
            const { root } = createStack(new Map([
                ['/dir/a.txt', textFile('aaa')],
                ['/dir/b.txt', textFile('bbb')],
            ]));
            expect(unwrap(await root.statAt({}, 'dir/a.txt')).size).toBe(3n);
            expect(unwrap(await root.statAt({}, 'dir/b.txt')).size).toBe(3n);
        });

        it('handles empty file', async () => {
            const { root } = createStack(new Map([
                ['/empty.txt', new Uint8Array(0)],
            ]));
            expect(unwrap(await root.statAt({}, 'empty.txt')).size).toBe(0n);
        });
    });

    // ─── Path Resolution ───

    describe('path resolution', () => {
        let root: P2DescriptorAdapter;

        beforeEach(() => {
            ({ root } = createStack(new Map([
                ['/home/user/hello.txt', textFile('hello')],
                ['/tmp/data.bin', new Uint8Array([1, 2, 3])],
            ])));
        });

        it('resolves simple path', async () => {
            const stat = unwrap(await root.statAt({}, 'home/user/hello.txt'));
            expect(stat.type).toBe('regular-file');
        });

        it('resolves with . component', async () => {
            const stat = unwrap(await root.statAt({}, 'home/./user/hello.txt'));
            expect(stat.type).toBe('regular-file');
        });

        it('resolves with .. component within bounds', async () => {
            const stat = unwrap(await root.statAt({}, 'home/user/../user/hello.txt'));
            expect(stat.type).toBe('regular-file');
        });

        it('prevents .. escape above root', async () => {
            expectErr(await root.statAt({}, '../etc/passwd'), 'not-permitted');
        });

        it('returns no-entry for nonexistent path', async () => {
            expectErr(await root.statAt({}, 'nonexistent'), 'no-entry');
        });

        it('returns no-entry for partially valid path', async () => {
            expectErr(await root.statAt({}, 'home/user/nonexistent.txt'), 'no-entry');
        });
    });

    // ─── File Read ───

    describe('file read', () => {
        let root: P2DescriptorAdapter;

        beforeEach(() => {
            ({ root } = createStack(new Map([
                ['/test.txt', textFile('Hello, World!')],
            ])));
        });

        it('reads full file content', async () => {
            const file = unwrap(await root.openAt({}, 'test.txt', {}, { read: true }));
            const [data, eof] = unwrap(await file.read(100n, 0n));
            expect(decoder.decode(data)).toBe('Hello, World!');
            expect(eof).toBe(true);
        });

        it('reads partial content with offset', async () => {
            const file = unwrap(await root.openAt({}, 'test.txt', {}, { read: true }));
            const [data, eof] = unwrap(await file.read(5n, 7n));
            expect(decoder.decode(data)).toBe('World');
            expect(eof).toBe(false);
        });

        it('reads empty when offset past end', async () => {
            const file = unwrap(await root.openAt({}, 'test.txt', {}, { read: true }));
            const [data, eof] = unwrap(await file.read(10n, 1000n));
            expect(data.length).toBe(0);
            expect(eof).toBe(true);
        });

        it('reads via stream', async () => {
            const file = unwrap(await root.openAt({}, 'test.txt', {}, { read: true }));
            const stream = unwrap(file.readViaStream(0n));
            // Allow async pump to fill buffer from P3 stream
            await new Promise(resolve => setTimeout(resolve, 50));
            const result = stream.read(5n);
            expect(result.tag).toBe('ok');
            if (result.tag === 'ok') {
                expect(decoder.decode(result.val)).toBe('Hello');
            }
        });

        it('read on directory returns is-directory', async () => {
            expectErr(await root.read(10n, 0n), 'is-directory');
        });
    });

    // ─── File Write ───

    describe('file write', () => {
        let root: P2DescriptorAdapter;

        beforeEach(() => {
            ({ root } = createStack(new Map([
                ['/test.txt', textFile('Hello')],
            ])));
        });

        it('overwrites at offset 0', async () => {
            const file = unwrap(await root.openAt({}, 'test.txt', {}, { write: true, read: true }));
            unwrap(await file.write(textFile('World'), 0n));
            const [data] = unwrap(await file.read(100n, 0n));
            expect(decoder.decode(data)).toBe('World');
        });

        it('extends file when writing past end', async () => {
            const file = unwrap(await root.openAt({}, 'test.txt', {}, { write: true, read: true }));
            unwrap(await file.write(textFile('!'), 5n));
            const [data] = unwrap(await file.read(100n, 0n));
            expect(decoder.decode(data)).toBe('Hello!');
        });

        it('creates file with create flag', async () => {
            unwrap(await root.openAt({}, 'new.txt', { create: true }, { write: true }));
            const stat = unwrap(await root.statAt({}, 'new.txt'));
            expect(stat.type).toBe('regular-file');
            expect(stat.size).toBe(0n);
        });

        it('truncates on open with truncate flag', async () => {
            unwrap(await root.openAt({}, 'test.txt', { truncate: true }, { write: true }));
            const stat = unwrap(await root.statAt({}, 'test.txt'));
            expect(stat.size).toBe(0n);
        });

        it('write on directory returns is-directory', async () => {
            expectErr(await root.write(textFile('data'), 0n), 'is-directory');
        });

        it('setSize truncates file', async () => {
            const file = unwrap(await root.openAt({}, 'test.txt', {}, { write: true, read: true }));
            unwrap(await file.setSize(3n));
            const [data] = unwrap(await file.read(100n, 0n));
            expect(decoder.decode(data)).toBe('Hel');
        });

        it('setSize extends file with zeroes', async () => {
            const file = unwrap(await root.openAt({}, 'test.txt', {}, { write: true, read: true }));
            unwrap(await file.setSize(8n));
            const [data] = unwrap(await file.read(100n, 0n));
            expect(data.length).toBe(8);
            expect(decoder.decode(data.slice(0, 5))).toBe('Hello');
            expect(data[5]).toBe(0);
        });
    });

    // ─── Directory Operations ───

    describe('directory operations', () => {
        let root: P2DescriptorAdapter;

        beforeEach(() => {
            ({ root } = createStack(new Map([
                ['/dir/a.txt', textFile('aaa')],
                ['/dir/b.txt', textFile('bbb')],
                ['/dir/sub/c.txt', textFile('ccc')],
            ])));
        });

        it('reads directory entries', async () => {
            const dir = unwrap(await root.openAt({}, 'dir', { directory: true }, { read: true }));
            const stream = unwrap(dir.readDirectory());
            // Allow async pump to populate entries
            await new Promise(resolve => setTimeout(resolve, 100));
            const entries: DirectoryEntry[] = [];
            for (let i = 0; i < 20; i++) {
                const entry = unwrap(stream.readDirectoryEntry());
                if (entry === undefined) break;
                entries.push(entry);
                // Pump more entries
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            const names = entries.map(e => e.name).sort();
            expect(names).toEqual(['a.txt', 'b.txt', 'sub']);
        });

        it('readDirectory on file returns empty stream', async () => {
            const file = unwrap(await root.openAt({}, 'dir/a.txt', {}, { read: true }));
            // P3 readDirectory defers errors to async stream, adapter returns ok
            const result = file.readDirectory();
            expect(result.tag).toBe('ok');
        });

        it('creates a new directory', async () => {
            const dir = unwrap(await root.openAt({}, 'dir', { directory: true }, { read: true, mutateDirectory: true }));
            unwrap(await dir.createDirectoryAt('newdir'));
            const stat = unwrap(await dir.statAt({}, 'newdir'));
            expect(stat.type).toBe('directory');
        });

        it('createDirectoryAt returns exist if already exists', async () => {
            const dir = unwrap(await root.openAt({}, 'dir', { directory: true }, { mutateDirectory: true }));
            expectErr(await dir.createDirectoryAt('sub'), 'exist');
        });

        it('removes empty directory', async () => {
            const dir = unwrap(await root.openAt({}, 'dir', { directory: true }, { mutateDirectory: true }));
            unwrap(await dir.createDirectoryAt('empty'));
            unwrap(await dir.removeDirectoryAt('empty'));
            expectErr(await dir.statAt({}, 'empty'), 'no-entry');
        });

        it('removeDirectoryAt fails on non-empty dir', async () => {
            const dir = unwrap(await root.openAt({}, 'dir', { directory: true }, { mutateDirectory: true }));
            expectErr(await dir.removeDirectoryAt('sub'), 'not-empty');
        });

        it('unlinks a file', async () => {
            const dir = unwrap(await root.openAt({}, 'dir', { directory: true }, { mutateDirectory: true }));
            unwrap(await dir.unlinkFileAt('a.txt'));
            expectErr(await dir.statAt({}, 'a.txt'), 'no-entry');
        });

        it('unlinkFileAt fails on directory', async () => {
            const dir = unwrap(await root.openAt({}, 'dir', { directory: true }, { mutateDirectory: true }));
            expectErr(await dir.unlinkFileAt('sub'), 'is-directory');
        });
    });

    // ─── Open Flags ───

    describe('open flags', () => {
        let root: P2DescriptorAdapter;

        beforeEach(() => {
            ({ root } = createStack(new Map([
                ['/existing.txt', textFile('data')],
                ['/dir/file.txt', textFile('x')],
            ])));
        });

        it('open existing file', async () => {
            const file = unwrap(await root.openAt({}, 'existing.txt', {}, { read: true }));
            expect(unwrap(await file.getType())).toBe('regular-file');
        });

        it('open nonexistent without create returns no-entry', async () => {
            expectErr(await root.openAt({}, 'nonexistent.txt', {}, { read: true }), 'no-entry');
        });

        it('create new file', async () => {
            unwrap(await root.openAt({}, 'new.txt', { create: true }, { write: true }));
            expect(unwrap(await root.statAt({}, 'new.txt')).type).toBe('regular-file');
        });

        it('exclusive fails if exists', async () => {
            expectErr(
                await root.openAt({}, 'existing.txt', { create: true, exclusive: true }, { write: true }),
                'exist'
            );
        });

        it('exclusive creates if not exists', async () => {
            unwrap(await root.openAt({}, 'unique.txt', { create: true, exclusive: true }, { write: true }));
            expect(unwrap(await root.statAt({}, 'unique.txt')).type).toBe('regular-file');
        });

        it('directory flag fails on file', async () => {
            expectErr(await root.openAt({}, 'existing.txt', { directory: true }, { read: true }), 'not-directory');
        });

        it('directory flag succeeds on directory', async () => {
            const dir = unwrap(await root.openAt({}, 'dir', { directory: true }, { read: true }));
            expect(unwrap(await dir.getType())).toBe('directory');
        });

        it('truncate empties existing file', async () => {
            unwrap(await root.openAt({}, 'existing.txt', { truncate: true }, { write: true }));
            expect(unwrap(await root.statAt({}, 'existing.txt')).size).toBe(0n);
        });
    });

    // ─── Stat ───

    describe('stat', () => {
        it('file stat has correct type and size', async () => {
            const { root } = createStack(new Map([
                ['/file.txt', textFile('hello')],
            ]));
            const stat = unwrap(await root.statAt({}, 'file.txt'));
            expect(stat.type).toBe('regular-file');
            expect(stat.size).toBe(5n);
        });

        it('directory stat has correct type', async () => {
            const { root } = createStack(new Map([
                ['/dir/file.txt', textFile('x')],
            ]));
            const stat = unwrap(await root.statAt({}, 'dir'));
            expect(stat.type).toBe('directory');
            expect(stat.size).toBe(0n);
        });

        it('stat includes timestamps', async () => {
            const { root } = createStack(new Map([
                ['/file.txt', textFile('x')],
            ]));
            const stat = unwrap(await root.statAt({}, 'file.txt'));
            expect(stat.dataAccessTimestamp).toBeDefined();
            expect(stat.dataModificationTimestamp).toBeDefined();
            expect(stat.statusChangeTimestamp).toBeDefined();
            expect(stat.dataAccessTimestamp!.seconds).toBeGreaterThan(0n);
        });

        it('descriptor stat works', async () => {
            const { root } = createStack(new Map([
                ['/file.txt', textFile('hello')],
            ]));
            const file = unwrap(await root.openAt({}, 'file.txt', {}, { read: true }));
            const stat = unwrap(await file.stat());
            expect(stat.type).toBe('regular-file');
            expect(stat.size).toBe(5n);
        });
    });

    // ─── Rename ───

    describe('rename', () => {
        let root: P2DescriptorAdapter;

        beforeEach(() => {
            ({ root } = createStack(new Map([
                ['/dir/a.txt', textFile('content-a')],
                ['/dir/sub/b.txt', textFile('content-b')],
            ])));
        });

        it('renames a file within same directory', async () => {
            const dir = unwrap(await root.openAt({}, 'dir', { directory: true }, { mutateDirectory: true }));
            unwrap(await dir.renameAt('a.txt', dir, 'renamed.txt'));
            expectErr(await dir.statAt({}, 'a.txt'), 'no-entry');
            expect(unwrap(await dir.statAt({}, 'renamed.txt')).type).toBe('regular-file');
        });

        it('renames a file to different directory', async () => {
            const dir = unwrap(await root.openAt({}, 'dir', { directory: true }, { mutateDirectory: true }));
            const sub = unwrap(await root.openAt({}, 'dir/sub', { directory: true }, { mutateDirectory: true }));
            unwrap(await dir.renameAt('a.txt', sub, 'moved.txt'));
            expectErr(await dir.statAt({}, 'a.txt'), 'no-entry');
            expect(unwrap(await sub.statAt({}, 'moved.txt')).type).toBe('regular-file');
        });

        it('rename nonexistent returns no-entry', async () => {
            const dir = unwrap(await root.openAt({}, 'dir', { directory: true }, { mutateDirectory: true }));
            expectErr(await dir.renameAt('nonexistent', dir, 'target'), 'no-entry');
        });
    });

    // ─── Symlinks & Links (unsupported) ───

    describe('symlinks and links', () => {
        let root: P2DescriptorAdapter;

        beforeEach(() => {
            ({ root } = createStack(new Map([
                ['/file.txt', textFile('hello')],
            ])));
        });

        it('readlinkAt on non-symlink returns invalid', async () => {
            expectErr(await root.readlinkAt('file.txt'), 'invalid');
        });

        it('symlinkAt fails when name already exists', async () => {
            expectErr(await root.symlinkAt('target', 'file.txt'), 'exist');
        });

        it('linkAt to existing target returns exist', async () => {
            expectErr(await root.linkAt({}, 'file.txt', root, 'file.txt'), 'exist');
        });
    });

    // ─── Timestamps ───

    describe('timestamps', () => {
        it('setTimes updates timestamps', async () => {
            const { root } = createStack(new Map([
                ['/file.txt', textFile('x')],
            ]));
            const file = unwrap(await root.openAt({}, 'file.txt', {}, { write: true }));
            const newTime: WasiDatetime = { seconds: 1234567890n, nanoseconds: 0 };
            unwrap(await file.setTimes({ tag: 'timestamp', val: newTime }, { tag: 'timestamp', val: newTime }));
            const stat = unwrap(await file.stat());
            expect(stat.dataAccessTimestamp?.seconds).toBe(1234567890n);
            expect(stat.dataModificationTimestamp?.seconds).toBe(1234567890n);
        });

        it('setTimesAt updates timestamps on path', async () => {
            const { root } = createStack(new Map([
                ['/dir/file.txt', textFile('x')],
            ]));
            const dir = unwrap(await root.openAt({}, 'dir', { directory: true }, { mutateDirectory: true }));
            const newTime: WasiDatetime = { seconds: 999n, nanoseconds: 500 };
            unwrap(await dir.setTimesAt({}, 'file.txt', { tag: 'timestamp', val: newTime }, { tag: 'no-change' }));
            const stat = unwrap(await dir.statAt({}, 'file.txt'));
            expect(stat.dataAccessTimestamp?.seconds).toBe(999n);
        });

        it('setTimes with now updates to current time', async () => {
            const { root } = createStack(new Map([
                ['/file.txt', textFile('x')],
            ]));
            const file = unwrap(await root.openAt({}, 'file.txt', {}, { write: true }));
            unwrap(await file.setTimes({ tag: 'now' }, { tag: 'now' }));
            const stat = unwrap(await file.stat());
            expect(stat.dataAccessTimestamp?.seconds).toBeGreaterThan(0n);
            expect(stat.dataModificationTimestamp?.seconds).toBeGreaterThan(0n);
        });

        it('setTimes with no-change preserves timestamps', async () => {
            const { root } = createStack(new Map([
                ['/file.txt', textFile('x')],
            ]));
            const file = unwrap(await root.openAt({}, 'file.txt', {}, { write: true }));
            const statBefore = unwrap(await file.stat());
            unwrap(await file.setTimes({ tag: 'no-change' }, { tag: 'no-change' }));
            const statAfter = unwrap(await file.stat());
            expect(statAfter.dataAccessTimestamp?.seconds).toBe(statBefore.dataAccessTimestamp?.seconds);
            expect(statAfter.dataModificationTimestamp?.seconds).toBe(statBefore.dataModificationTimestamp?.seconds);
        });
    });

    // ─── Identity & Hash ───

    describe('identity and hashing', () => {
        it('isSameObject returns true for same node', async () => {
            const { root } = createStack(new Map([
                ['/file.txt', textFile('x')],
            ]));
            const a = unwrap(await root.openAt({}, 'file.txt', {}, {}));
            const b = unwrap(await root.openAt({}, 'file.txt', {}, {}));
            expect(await a.isSameObject(b)).toBe(true);
        });

        it('isSameObject returns false for different nodes', async () => {
            const { root } = createStack(new Map([
                ['/a.txt', textFile('a')],
                ['/b.txt', textFile('b')],
            ]));
            const a = unwrap(await root.openAt({}, 'a.txt', {}, {}));
            const b = unwrap(await root.openAt({}, 'b.txt', {}, {}));
            expect(await a.isSameObject(b)).toBe(false);
        });

        it('metadataHash returns a value', async () => {
            const { root } = createStack(new Map([
                ['/file.txt', textFile('x')],
            ]));
            const file = unwrap(await root.openAt({}, 'file.txt', {}, {}));
            const hash = unwrap(await file.metadataHash());
            expect(typeof hash.upper).toBe('bigint');
            expect(typeof hash.lower).toBe('bigint');
        });

        it('metadataHashAt returns value for path', async () => {
            const { root } = createStack(new Map([
                ['/file.txt', textFile('x')],
            ]));
            const hash = unwrap(await root.metadataHashAt({}, 'file.txt'));
            expect(typeof hash.upper).toBe('bigint');
        });
    });

    // ─── Preopens ───

    describe('preopens', () => {
        it('preopens returns root descriptor', async () => {
            const { p2 } = createStack(new Map([
                ['/data/file.txt', textFile('x')],
            ]));
            const dirs = p2['wasi:filesystem/preopens']!['get-directories']!() as [P2DescriptorAdapter, string][];
            expect(dirs.length).toBeGreaterThanOrEqual(1);
            const [desc, path] = dirs[0]!;
            expect(path).toBe('/');
            expect(unwrap(await desc.getType())).toBe('directory');
        });

        it('empty filesystem has preopens', () => {
            const { p2 } = createStack();
            const dirs = p2['wasi:filesystem/preopens']!['get-directories']!() as [P2DescriptorAdapter, string][];
            expect(dirs.length).toBeGreaterThanOrEqual(1);
        });
    });

    // ─── Descriptor Flags ───

    describe('descriptor flags', () => {
        it('returns the flags set at open time', async () => {
            const { root } = createStack(new Map([
                ['/file.txt', textFile('x')],
            ]));
            const file = unwrap(await root.openAt({}, 'file.txt', {}, { read: true, write: true }));
            const flags = unwrap(await file.getFlags());
            expect(flags.read).toBe(true);
            expect(flags.write).toBe(true);
        });
    });

    // ─── Sync (no-op) ───

    describe('sync operations', () => {
        it('syncData returns ok', async () => {
            const { root } = createStack(new Map([
                ['/file.txt', textFile('x')],
            ]));
            const file = unwrap(await root.openAt({}, 'file.txt', {}, {}));
            expect(unwrap(await file.syncData())).toBeUndefined();
        });

        it('sync returns ok', async () => {
            const { root } = createStack(new Map([
                ['/file.txt', textFile('x')],
            ]));
            const file = unwrap(await root.openAt({}, 'file.txt', {}, {}));
            expect(unwrap(await file.sync())).toBeUndefined();
        });
    });

    // ─── Advise (no-op) ───

    describe('advise', () => {
        it('returns ok for any advice', async () => {
            const { root } = createStack(new Map([
                ['/file.txt', textFile('x')],
            ]));
            const file = unwrap(await root.openAt({}, 'file.txt', {}, {}));
            expect(unwrap(await file.advise(0n, 100n, 'sequential'))).toBeUndefined();
        });
    });

    // ─── Edge Cases ───

    describe('edge cases', () => {
        it('deeply nested path', async () => {
            const { root } = createStack(new Map([
                ['/a/b/c/d/e/f/g/h/file.txt', textFile('deep')],
            ]));
            const stat = unwrap(await root.statAt({}, 'a/b/c/d/e/f/g/h/file.txt'));
            expect(stat.type).toBe('regular-file');
        });

        it('binary file data round-trips correctly', async () => {
            const binaryData = new Uint8Array(256);
            for (let i = 0; i < 256; i++) binaryData[i] = i;
            const { root } = createStack(new Map([
                ['/binary.bin', binaryData],
            ]));
            const file = unwrap(await root.openAt({}, 'binary.bin', {}, { read: true }));
            const [data] = unwrap(await file.read(256n, 0n));
            expect(data.length).toBe(256);
            for (let i = 0; i < 256; i++) {
                expect(data[i]).toBe(i);
            }
        });

        it('large file', async () => {
            const largeData = new Uint8Array(1024 * 1024); // 1MB
            largeData.fill(0xAB);
            const { root } = createStack(new Map([
                ['/large.bin', largeData],
            ]));
            const stat = unwrap(await root.statAt({}, 'large.bin'));
            expect(stat.size).toBe(BigInt(1024 * 1024));
        });

        it('unicode filename', async () => {
            const { root } = createStack(new Map([
                ['/日本語/ファイル.txt', textFile('こんにちは')],
            ]));
            const stat = unwrap(await root.statAt({}, '日本語/ファイル.txt'));
            expect(stat.type).toBe('regular-file');
        });

        it('concurrent reads from same file descriptor', async () => {
            const { root } = createStack(new Map([
                ['/file.txt', textFile('abcdef')],
            ]));
            const file = unwrap(await root.openAt({}, 'file.txt', {}, { read: true }));
            const [a] = unwrap(await file.read(3n, 0n));
            const [b] = unwrap(await file.read(3n, 3n));
            expect(decoder.decode(a)).toBe('abc');
            expect(decoder.decode(b)).toBe('def');
        });

        it('write then read consistency', async () => {
            const { root } = createStack(new Map([
                ['/file.txt', textFile('')],
            ]));
            const file = unwrap(await root.openAt({}, 'file.txt', {}, { read: true, write: true }));
            unwrap(await file.write(textFile('written'), 0n));
            const [data] = unwrap(await file.read(100n, 0n));
            expect(decoder.decode(data)).toBe('written');
        });
    });
});
