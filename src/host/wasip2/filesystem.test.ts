// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { WasiDescriptor, FsResult, DirectoryEntry, WasiDatetime } from './api';
import type { WasiFilesystem } from './types';
import { createWasiFilesystem } from './filesystem';

/** Helper: unwrap an ok result or throw */
function unwrap<T>(result: FsResult<T>): T {
    if (result.tag === 'err') throw new Error(`Unexpected error: ${result.val}`);
    return result.val;
}

/** Helper: expect an error result */
function expectErr<T>(result: FsResult<T>, code: string): void {
    expect(result.tag).toBe('err');
    if (result.tag === 'err') expect(result.val).toBe(code);
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function textFile(content: string): Uint8Array {
    return encoder.encode(content);
}

describe('wasi:filesystem', () => {

    // ─── Tree Construction ───

    describe('VFS tree construction', () => {
        it('creates empty filesystem', () => {
            const fs = createWasiFilesystem();
            const root = fs.rootDescriptor();
            expect(unwrap(root.getType())).toBe('directory');
        });

        it('creates filesystem from file map', () => {
            const fs = createWasiFilesystem(new Map([
                ['/hello.txt', textFile('hello')],
            ]));
            const root = fs.rootDescriptor();
            const stat = unwrap(root.statAt({}, 'hello.txt'));
            expect(stat.type).toBe('regular-file');
            expect(stat.size).toBe(5n);
        });

        it('creates intermediate directories', () => {
            const fs = createWasiFilesystem(new Map([
                ['/a/b/c/file.txt', textFile('deep')],
            ]));
            const root = fs.rootDescriptor();
            expect(unwrap(root.statAt({}, 'a')).type).toBe('directory');
            expect(unwrap(root.statAt({}, 'a/b')).type).toBe('directory');
            expect(unwrap(root.statAt({}, 'a/b/c')).type).toBe('directory');
            expect(unwrap(root.statAt({}, 'a/b/c/file.txt')).type).toBe('regular-file');
        });

        it('handles multiple files in same directory', () => {
            const fs = createWasiFilesystem(new Map([
                ['/dir/a.txt', textFile('aaa')],
                ['/dir/b.txt', textFile('bbb')],
            ]));
            const root = fs.rootDescriptor();
            expect(unwrap(root.statAt({}, 'dir/a.txt')).size).toBe(3n);
            expect(unwrap(root.statAt({}, 'dir/b.txt')).size).toBe(3n);
        });

        it('handles empty file', () => {
            const fs = createWasiFilesystem(new Map([
                ['/empty.txt', new Uint8Array(0)],
            ]));
            const root = fs.rootDescriptor();
            expect(unwrap(root.statAt({}, 'empty.txt')).size).toBe(0n);
        });

        it('makes defensive copy of input data', () => {
            const original = textFile('original');
            const fs = createWasiFilesystem(new Map([
                ['/file.txt', original],
            ]));
            // Mutate original
            original[0] = 0xFF;
            const root = fs.rootDescriptor();
            const file = unwrap(root.openAt({}, 'file.txt', {}, { read: true }));
            const [data] = unwrap(file.read(100n, 0n));
            // Should still have original content
            expect(decoder.decode(data)).toBe('original');
        });
    });

    // ─── Path Resolution ───

    describe('path resolution', () => {
        let fs: WasiFilesystem;
        let root: WasiDescriptor;

        beforeEach(() => {
            fs = createWasiFilesystem(new Map([
                ['/home/user/hello.txt', textFile('hello')],
                ['/tmp/data.bin', new Uint8Array([1, 2, 3])],
            ]));
            root = fs.rootDescriptor();
        });

        it('resolves simple path', () => {
            const stat = unwrap(root.statAt({}, 'home/user/hello.txt'));
            expect(stat.type).toBe('regular-file');
        });

        it('resolves with . component', () => {
            const stat = unwrap(root.statAt({}, 'home/./user/hello.txt'));
            expect(stat.type).toBe('regular-file');
        });

        it('resolves with .. component within bounds', () => {
            const stat = unwrap(root.statAt({}, 'home/user/../user/hello.txt'));
            expect(stat.type).toBe('regular-file');
        });

        it('prevents .. escape above root', () => {
            expectErr(root.statAt({}, '../etc/passwd'), 'no-entry');
        });

        it('prevents deep .. escape', () => {
            expectErr(root.statAt({}, 'home/../../..'), 'no-entry');
        });

        it('returns no-entry for nonexistent path', () => {
            expectErr(root.statAt({}, 'nonexistent'), 'no-entry');
        });

        it('returns no-entry for partially valid path', () => {
            expectErr(root.statAt({}, 'home/user/nonexistent.txt'), 'no-entry');
        });

        it('prevents traversal through file', () => {
            expectErr(root.statAt({}, 'home/user/hello.txt/foo'), 'no-entry');
        });
    });

    // ─── File Read ───

    describe('file read', () => {
        let root: WasiDescriptor;

        beforeEach(() => {
            const fs = createWasiFilesystem(new Map([
                ['/test.txt', textFile('Hello, World!')],
            ]));
            root = fs.rootDescriptor();
        });

        it('reads full file content', () => {
            const file = unwrap(root.openAt({}, 'test.txt', {}, { read: true }));
            const [data, eof] = unwrap(file.read(100n, 0n));
            expect(decoder.decode(data)).toBe('Hello, World!');
            expect(eof).toBe(true);
        });

        it('reads partial content with offset', () => {
            const file = unwrap(root.openAt({}, 'test.txt', {}, { read: true }));
            const [data, eof] = unwrap(file.read(5n, 7n));
            expect(decoder.decode(data)).toBe('World');
            expect(eof).toBe(false);
        });

        it('reads empty when offset past end', () => {
            const file = unwrap(root.openAt({}, 'test.txt', {}, { read: true }));
            const [data, eof] = unwrap(file.read(10n, 1000n));
            expect(data.length).toBe(0);
            expect(eof).toBe(true);
        });

        it('reads via stream', () => {
            const file = unwrap(root.openAt({}, 'test.txt', {}, { read: true }));
            const stream = unwrap(file.readViaStream(0n));
            const result = stream.read(5n);
            expect(result.tag).toBe('ok');
            if (result.tag === 'ok') {
                expect(decoder.decode(result.val)).toBe('Hello');
            }
        });

        it('reads via stream with offset', () => {
            const file = unwrap(root.openAt({}, 'test.txt', {}, { read: true }));
            const stream = unwrap(file.readViaStream(7n));
            const result = stream.read(5n);
            expect(result.tag).toBe('ok');
            if (result.tag === 'ok') {
                expect(decoder.decode(result.val)).toBe('World');
            }
        });

        it('read on directory returns bad-descriptor', () => {
            expectErr(root.read(10n, 0n), 'bad-descriptor');
        });
    });

    // ─── File Write ───

    describe('file write', () => {
        let root: WasiDescriptor;

        beforeEach(() => {
            const fs = createWasiFilesystem(new Map([
                ['/test.txt', textFile('Hello')],
            ]));
            root = fs.rootDescriptor();
        });

        it('overwrites at offset 0', () => {
            const file = unwrap(root.openAt({}, 'test.txt', {}, { write: true }));
            const written = unwrap(file.write(textFile('World'), 0n));
            expect(written).toBe(5n);
            const [data] = unwrap(file.read(100n, 0n));
            expect(decoder.decode(data)).toBe('World');
        });

        it('extends file when writing past end', () => {
            const file = unwrap(root.openAt({}, 'test.txt', {}, { write: true }));
            unwrap(file.write(textFile('!'), 5n));
            const [data] = unwrap(file.read(100n, 0n));
            expect(decoder.decode(data)).toBe('Hello!');
        });

        it('writes at offset within file', () => {
            const file = unwrap(root.openAt({}, 'test.txt', {}, { write: true }));
            unwrap(file.write(textFile('XX'), 2n));
            const [data] = unwrap(file.read(100n, 0n));
            expect(decoder.decode(data)).toBe('HeXXo');
        });

        it('creates file with create flag', () => {
            unwrap(root.openAt({}, 'new.txt', { create: true }, { write: true }));
            const stat = unwrap(root.statAt({}, 'new.txt'));
            expect(stat.type).toBe('regular-file');
            expect(stat.size).toBe(0n);
        });

        it('truncates on open with truncate flag', () => {
            unwrap(root.openAt({}, 'test.txt', { truncate: true }, { write: true }));
            const stat = unwrap(root.statAt({}, 'test.txt'));
            expect(stat.size).toBe(0n);
        });

        it('write on directory returns bad-descriptor', () => {
            expectErr(root.write(textFile('data'), 0n), 'bad-descriptor');
        });

        it('appends via stream', () => {
            const file = unwrap(root.openAt({}, 'test.txt', {}, { write: true }));
            const stream = unwrap(file.appendViaStream());
            const result = stream.write(textFile('!'));
            expect(result.tag).toBe('ok');
            stream.flush();
            const [data] = unwrap(file.read(100n, 0n));
            expect(decoder.decode(data)).toBe('Hello!');
        });

        it('setSize truncates file', () => {
            const file = unwrap(root.openAt({}, 'test.txt', {}, { write: true }));
            unwrap(file.setSize(3n));
            const [data] = unwrap(file.read(100n, 0n));
            expect(decoder.decode(data)).toBe('Hel');
        });

        it('setSize extends file with zeroes', () => {
            const file = unwrap(root.openAt({}, 'test.txt', {}, { write: true }));
            unwrap(file.setSize(8n));
            const [data] = unwrap(file.read(100n, 0n));
            expect(data.length).toBe(8);
            expect(decoder.decode(data.slice(0, 5))).toBe('Hello');
            expect(data[5]).toBe(0);
            expect(data[6]).toBe(0);
            expect(data[7]).toBe(0);
        });
    });

    // ─── Directory Operations ───

    describe('directory operations', () => {
        let root: WasiDescriptor;

        beforeEach(() => {
            const fs = createWasiFilesystem(new Map([
                ['/dir/a.txt', textFile('aaa')],
                ['/dir/b.txt', textFile('bbb')],
                ['/dir/sub/c.txt', textFile('ccc')],
            ]));
            root = fs.rootDescriptor();
        });

        it('reads directory entries', () => {
            const dir = unwrap(root.openAt({}, 'dir', { directory: true }, { read: true }));
            const stream = unwrap(dir.readDirectory());
            const entries: DirectoryEntry[] = [];
            for (; ;) {
                const entry = unwrap(stream.readDirectoryEntry());
                if (entry === undefined) break;
                entries.push(entry);
            }
            const names = entries.map(e => e.name).sort();
            expect(names).toEqual(['a.txt', 'b.txt', 'sub']);
            const sub = entries.find(e => e.name === 'sub');
            expect(sub?.type).toBe('directory');
            const file = entries.find(e => e.name === 'a.txt');
            expect(file?.type).toBe('regular-file');
        });

        it('readDirectory on file returns not-directory', () => {
            const file = unwrap(root.openAt({}, 'dir/a.txt', {}, { read: true }));
            expectErr(file.readDirectory(), 'not-directory');
        });

        it('creates a new directory', () => {
            const dir = unwrap(root.openAt({}, 'dir', { directory: true }, { read: true, mutateDirectory: true }));
            unwrap(dir.createDirectoryAt('newdir'));
            const stat = unwrap(dir.statAt({}, 'newdir'));
            expect(stat.type).toBe('directory');
        });

        it('createDirectoryAt returns exist if already exists', () => {
            const dir = unwrap(root.openAt({}, 'dir', { directory: true }, {}));
            expectErr(dir.createDirectoryAt('sub'), 'exist');
        });

        it('removes empty directory', () => {
            const dir = unwrap(root.openAt({}, 'dir', { directory: true }, { mutateDirectory: true }));
            // Create and then remove
            unwrap(dir.createDirectoryAt('empty'));
            unwrap(dir.removeDirectoryAt('empty'));
            expectErr(dir.statAt({}, 'empty'), 'no-entry');
        });

        it('removeDirectoryAt fails on non-empty dir', () => {
            const dir = unwrap(root.openAt({}, 'dir', { directory: true }, {}));
            expectErr(dir.removeDirectoryAt('sub'), 'not-empty');
        });

        it('removeDirectoryAt fails on file', () => {
            const dir = unwrap(root.openAt({}, 'dir', { directory: true }, {}));
            expectErr(dir.removeDirectoryAt('a.txt'), 'not-directory');
        });

        it('unlinks a file', () => {
            const dir = unwrap(root.openAt({}, 'dir', { directory: true }, { mutateDirectory: true }));
            unwrap(dir.unlinkFileAt('a.txt'));
            expectErr(dir.statAt({}, 'a.txt'), 'no-entry');
        });

        it('unlinkFileAt fails on directory', () => {
            const dir = unwrap(root.openAt({}, 'dir', { directory: true }, {}));
            expectErr(dir.unlinkFileAt('sub'), 'is-directory');
        });

        it('unlink nonexistent returns no-entry', () => {
            const dir = unwrap(root.openAt({}, 'dir', { directory: true }, {}));
            expectErr(dir.unlinkFileAt('nonexistent'), 'no-entry');
        });
    });

    // ─── Open Flags ───

    describe('open flags', () => {
        let root: WasiDescriptor;

        beforeEach(() => {
            const fs = createWasiFilesystem(new Map([
                ['/existing.txt', textFile('data')],
                ['/dir/file.txt', textFile('x')],
            ]));
            root = fs.rootDescriptor();
        });

        it('open existing file', () => {
            const file = unwrap(root.openAt({}, 'existing.txt', {}, { read: true }));
            expect(unwrap(file.getType())).toBe('regular-file');
        });

        it('open nonexistent without create returns no-entry', () => {
            expectErr(root.openAt({}, 'nonexistent.txt', {}, { read: true }), 'no-entry');
        });

        it('create new file', () => {
            unwrap(root.openAt({}, 'new.txt', { create: true }, { write: true }));
            expect(unwrap(root.statAt({}, 'new.txt')).type).toBe('regular-file');
        });

        it('exclusive fails if exists', () => {
            expectErr(
                root.openAt({}, 'existing.txt', { create: true, exclusive: true }, { write: true }),
                'exist'
            );
        });

        it('exclusive creates if not exists', () => {
            unwrap(root.openAt({}, 'unique.txt', { create: true, exclusive: true }, { write: true }));
            expect(unwrap(root.statAt({}, 'unique.txt')).type).toBe('regular-file');
        });

        it('directory flag fails on file', () => {
            expectErr(root.openAt({}, 'existing.txt', { directory: true }, { read: true }), 'not-directory');
        });

        it('directory flag succeeds on directory', () => {
            const dir = unwrap(root.openAt({}, 'dir', { directory: true }, { read: true }));
            expect(unwrap(dir.getType())).toBe('directory');
        });

        it('truncate empties existing file', () => {
            unwrap(root.openAt({}, 'existing.txt', { truncate: true }, { write: true }));
            expect(unwrap(root.statAt({}, 'existing.txt')).size).toBe(0n);
        });
    });

    // ─── Stat ───

    describe('stat', () => {
        it('file stat has correct type and size', () => {
            const fs = createWasiFilesystem(new Map([
                ['/file.txt', textFile('hello')],
            ]));
            const root = fs.rootDescriptor();
            const stat = unwrap(root.statAt({}, 'file.txt'));
            expect(stat.type).toBe('regular-file');
            expect(stat.size).toBe(5n);
            expect(stat.linkCount).toBe(1n);
        });

        it('directory stat has correct type', () => {
            const fs = createWasiFilesystem(new Map([
                ['/dir/file.txt', textFile('x')],
            ]));
            const root = fs.rootDescriptor();
            const stat = unwrap(root.statAt({}, 'dir'));
            expect(stat.type).toBe('directory');
            expect(stat.size).toBe(0n);
        });

        it('stat includes timestamps', () => {
            const fs = createWasiFilesystem(new Map([
                ['/file.txt', textFile('x')],
            ]));
            const root = fs.rootDescriptor();
            const stat = unwrap(root.statAt({}, 'file.txt'));
            expect(stat.dataAccessTimestamp).toBeDefined();
            expect(stat.dataModificationTimestamp).toBeDefined();
            expect(stat.statusChangeTimestamp).toBeDefined();
            expect(stat.dataAccessTimestamp!.seconds).toBeGreaterThan(0n);
        });

        it('descriptor stat works', () => {
            const fs = createWasiFilesystem(new Map([
                ['/file.txt', textFile('hello')],
            ]));
            const root = fs.rootDescriptor();
            const file = unwrap(root.openAt({}, 'file.txt', {}, { read: true }));
            const stat = unwrap(file.stat());
            expect(stat.type).toBe('regular-file');
            expect(stat.size).toBe(5n);
        });
    });

    // ─── Rename ───

    describe('rename', () => {
        let root: WasiDescriptor;

        beforeEach(() => {
            const fs = createWasiFilesystem(new Map([
                ['/dir/a.txt', textFile('content-a')],
                ['/dir/sub/b.txt', textFile('content-b')],
            ]));
            root = fs.rootDescriptor();
        });

        it('renames a file within same directory', () => {
            const dir = unwrap(root.openAt({}, 'dir', { directory: true }, { mutateDirectory: true }));
            unwrap(dir.renameAt('a.txt', dir, 'renamed.txt'));
            expectErr(dir.statAt({}, 'a.txt'), 'no-entry');
            expect(unwrap(dir.statAt({}, 'renamed.txt')).type).toBe('regular-file');
        });

        it('renames a file to different directory', () => {
            const dir = unwrap(root.openAt({}, 'dir', { directory: true }, { mutateDirectory: true }));
            const sub = unwrap(root.openAt({}, 'dir/sub', { directory: true }, { mutateDirectory: true }));
            unwrap(dir.renameAt('a.txt', sub, 'moved.txt'));
            expectErr(dir.statAt({}, 'a.txt'), 'no-entry');
            expect(unwrap(sub.statAt({}, 'moved.txt')).type).toBe('regular-file');
        });

        it('rename overwrites existing file', () => {
            const dir = unwrap(root.openAt({}, 'dir', { directory: true }, { mutateDirectory: true }));
            // Create target
            unwrap(dir.openAt({}, 'target.txt', { create: true }, { write: true }));
            unwrap(dir.renameAt('a.txt', dir, 'target.txt'));
            // Original gone
            expectErr(dir.statAt({}, 'a.txt'), 'no-entry');
            // Target now has content-a
            const file = unwrap(dir.openAt({}, 'target.txt', {}, { read: true }));
            const [data] = unwrap(file.read(100n, 0n));
            expect(decoder.decode(data)).toBe('content-a');
        });

        it('rename nonexistent returns no-entry', () => {
            const dir = unwrap(root.openAt({}, 'dir', { directory: true }, {}));
            expectErr(dir.renameAt('nonexistent', dir, 'target'), 'no-entry');
        });
    });

    // ─── Symlinks & Links (unsupported) ───

    describe('symlinks and links', () => {
        let root: WasiDescriptor;

        beforeEach(() => {
            const fs = createWasiFilesystem(new Map([
                ['/file.txt', textFile('hello')],
            ]));
            root = fs.rootDescriptor();
        });

        it('readlinkAt returns unsupported', () => {
            expectErr(root.readlinkAt('file.txt'), 'unsupported');
        });

        it('symlinkAt returns unsupported', () => {
            expectErr(root.symlinkAt('file.txt', 'link.txt'), 'unsupported');
        });

        it('linkAt returns unsupported', () => {
            expectErr(root.linkAt({}, 'file.txt', root, 'link.txt'), 'unsupported');
        });
    });

    // ─── Timestamps ───

    describe('timestamps', () => {
        it('setTimes updates timestamps', () => {
            const fs = createWasiFilesystem(new Map([
                ['/file.txt', textFile('x')],
            ]));
            const root = fs.rootDescriptor();
            const file = unwrap(root.openAt({}, 'file.txt', {}, { write: true }));
            const newTime: WasiDatetime = { seconds: 1234567890n, nanoseconds: 0 };
            unwrap(file.setTimes({ tag: 'timestamp', val: newTime }, { tag: 'timestamp', val: newTime }));
            const stat = unwrap(file.stat());
            expect(stat.dataAccessTimestamp?.seconds).toBe(1234567890n);
            expect(stat.dataModificationTimestamp?.seconds).toBe(1234567890n);
        });

        it('setTimesAt updates timestamps on path', () => {
            const fs = createWasiFilesystem(new Map([
                ['/dir/file.txt', textFile('x')],
            ]));
            const root = fs.rootDescriptor();
            const dir = unwrap(root.openAt({}, 'dir', { directory: true }, {}));
            const newTime: WasiDatetime = { seconds: 999n, nanoseconds: 500 };
            unwrap(dir.setTimesAt({}, 'file.txt', { tag: 'timestamp', val: newTime }, { tag: 'no-change' }));
            const stat = unwrap(dir.statAt({}, 'file.txt'));
            expect(stat.dataAccessTimestamp?.seconds).toBe(999n);
        });

        it('setTimes with now updates to current time', () => {
            const fs = createWasiFilesystem(new Map([
                ['/file.txt', textFile('x')],
            ]));
            const root = fs.rootDescriptor();
            const file = unwrap(root.openAt({}, 'file.txt', {}, { write: true }));
            unwrap(file.setTimes({ tag: 'now' }, { tag: 'now' }));
            const stat = unwrap(file.stat());
            // "now" should produce a timestamp close to the current time
            expect(stat.dataAccessTimestamp?.seconds).toBeGreaterThan(0n);
            expect(stat.dataModificationTimestamp?.seconds).toBeGreaterThan(0n);
        });

        it('setTimes with no-change preserves timestamps', () => {
            const fs = createWasiFilesystem(new Map([
                ['/file.txt', textFile('x')],
            ]));
            const root = fs.rootDescriptor();
            const file = unwrap(root.openAt({}, 'file.txt', {}, { write: true }));
            const statBefore = unwrap(file.stat());
            unwrap(file.setTimes({ tag: 'no-change' }, { tag: 'no-change' }));
            const statAfter = unwrap(file.stat());
            expect(statAfter.dataAccessTimestamp?.seconds).toBe(statBefore.dataAccessTimestamp?.seconds);
            expect(statAfter.dataModificationTimestamp?.seconds).toBe(statBefore.dataModificationTimestamp?.seconds);
        });

        it('setTimesAt with now and timestamp mixed', () => {
            const fs = createWasiFilesystem(new Map([
                ['/dir/file.txt', textFile('x')],
            ]));
            const root = fs.rootDescriptor();
            const dir = unwrap(root.openAt({}, 'dir', { directory: true }, {}));
            const specificTime: WasiDatetime = { seconds: 42n, nanoseconds: 0 };
            unwrap(dir.setTimesAt({}, 'file.txt', { tag: 'now' }, { tag: 'timestamp', val: specificTime }));
            const stat = unwrap(dir.statAt({}, 'file.txt'));
            expect(stat.dataAccessTimestamp?.seconds).toBeGreaterThan(0n);
            expect(stat.dataModificationTimestamp?.seconds).toBe(42n);
        });

        it('write updates mtime', () => {
            const fs = createWasiFilesystem(new Map([
                ['/file.txt', textFile('old')],
            ]));
            const root = fs.rootDescriptor();
            const file = unwrap(root.openAt({}, 'file.txt', {}, { write: true }));
            const statBefore = unwrap(file.stat());
            // Write something
            unwrap(file.write(textFile('new'), 0n));
            const statAfter = unwrap(file.stat());
            // mtime should be >= before (might be equal due to resolution)
            expect(statAfter.dataModificationTimestamp!.seconds)
                .toBeGreaterThanOrEqual(statBefore.dataModificationTimestamp!.seconds);
        });
    });

    // ─── Identity & Hash ───

    describe('identity and hashing', () => {
        it('isSameObject returns true for same node', () => {
            const fs = createWasiFilesystem(new Map([
                ['/file.txt', textFile('x')],
            ]));
            const root = fs.rootDescriptor();
            const a = unwrap(root.openAt({}, 'file.txt', {}, {}));
            const b = unwrap(root.openAt({}, 'file.txt', {}, {}));
            expect(a.isSameObject(b)).toBe(true);
        });

        it('isSameObject returns false for different nodes', () => {
            const fs = createWasiFilesystem(new Map([
                ['/a.txt', textFile('a')],
                ['/b.txt', textFile('b')],
            ]));
            const root = fs.rootDescriptor();
            const a = unwrap(root.openAt({}, 'a.txt', {}, {}));
            const b = unwrap(root.openAt({}, 'b.txt', {}, {}));
            expect(a.isSameObject(b)).toBe(false);
        });

        it('metadataHash returns a value', () => {
            const fs = createWasiFilesystem(new Map([
                ['/file.txt', textFile('x')],
            ]));
            const root = fs.rootDescriptor();
            const file = unwrap(root.openAt({}, 'file.txt', {}, {}));
            const hash = unwrap(file.metadataHash());
            expect(typeof hash.upper).toBe('bigint');
            expect(typeof hash.lower).toBe('bigint');
        });

        it('metadataHashAt returns value for path', () => {
            const fs = createWasiFilesystem(new Map([
                ['/file.txt', textFile('x')],
            ]));
            const root = fs.rootDescriptor();
            const hash = unwrap(root.metadataHashAt({}, 'file.txt'));
            expect(typeof hash.upper).toBe('bigint');
        });
    });

    // ─── Preopens ───

    describe('preopens', () => {
        it('returns top-level directories as preopens', () => {
            const fs = createWasiFilesystem(new Map([
                ['/home/user/file.txt', textFile('x')],
                ['/tmp/data.bin', new Uint8Array([1])],
            ]));
            const dirs = fs.preopens.getDirectories();
            const paths = dirs.map(([_, path]) => path).sort();
            expect(paths).toEqual(['/home', '/tmp']);
        });

        it('preopens are directory descriptors', () => {
            const fs = createWasiFilesystem(new Map([
                ['/data/file.txt', textFile('x')],
            ]));
            const dirs = fs.preopens.getDirectories();
            expect(dirs.length).toBe(1);
            const [desc, path] = dirs[0]!;
            expect(path).toBe('/data');
            expect(unwrap(desc.getType())).toBe('directory');
        });

        it('empty filesystem has root preopen', () => {
            const fs = createWasiFilesystem();
            const dirs = fs.preopens.getDirectories();
            expect(dirs.length).toBe(1);
            expect(dirs[0]![1]).toBe('/');
        });

        it('file-only root gives root preopen', () => {
            // Only files at root level, no directories
            const fs = createWasiFilesystem(new Map([
                ['/root-file.txt', textFile('x')],
            ]));
            // root-file.txt is in root dir, so no top-level child directories
            // but the root itself should still be accessible
            const dirs = fs.preopens.getDirectories();
            expect(dirs.length).toBeGreaterThanOrEqual(1);
        });
    });

    // ─── Descriptor Flags ───

    describe('descriptor flags', () => {
        it('returns the flags set at open time', () => {
            const fs = createWasiFilesystem(new Map([
                ['/file.txt', textFile('x')],
            ]));
            const root = fs.rootDescriptor();
            const file = unwrap(root.openAt({}, 'file.txt', {}, { read: true, write: true }));
            const flags = unwrap(file.getFlags());
            expect(flags.read).toBe(true);
            expect(flags.write).toBe(true);
        });
    });

    // ─── Sync (no-op) ───

    describe('sync operations', () => {
        it('syncData returns ok', () => {
            const fs = createWasiFilesystem(new Map([
                ['/file.txt', textFile('x')],
            ]));
            const root = fs.rootDescriptor();
            const file = unwrap(root.openAt({}, 'file.txt', {}, {}));
            expect(unwrap(file.syncData())).toBeUndefined();
        });

        it('sync returns ok', () => {
            const fs = createWasiFilesystem(new Map([
                ['/file.txt', textFile('x')],
            ]));
            const root = fs.rootDescriptor();
            const file = unwrap(root.openAt({}, 'file.txt', {}, {}));
            expect(unwrap(file.sync())).toBeUndefined();
        });
    });

    // ─── Advise (no-op) ───

    describe('advise', () => {
        it('returns ok for any advice', () => {
            const fs = createWasiFilesystem(new Map([
                ['/file.txt', textFile('x')],
            ]));
            const root = fs.rootDescriptor();
            const file = unwrap(root.openAt({}, 'file.txt', {}, {}));
            expect(unwrap(file.advise(0n, 100n, 'sequential'))).toBeUndefined();
        });

        it('accepts all Advice enum variants', () => {
            const fs = createWasiFilesystem(new Map([
                ['/file.txt', textFile('x')],
            ]));
            const root = fs.rootDescriptor();
            const file = unwrap(root.openAt({}, 'file.txt', {}, {}));
            const variants: string[] = ['normal', 'sequential', 'random', 'will-need', 'dont-need', 'no-reuse'];
            for (const advice of variants) {
                expect(unwrap(file.advise(0n, 100n, advice as any))).toBeUndefined();
            }
        });
    });

    // ─── Edge Cases ───

    describe('edge cases', () => {
        it('deeply nested path', () => {
            const fs = createWasiFilesystem(new Map([
                ['/a/b/c/d/e/f/g/h/file.txt', textFile('deep')],
            ]));
            const root = fs.rootDescriptor();
            const stat = unwrap(root.statAt({}, 'a/b/c/d/e/f/g/h/file.txt'));
            expect(stat.type).toBe('regular-file');
        });

        it('binary file data round-trips correctly', () => {
            const binaryData = new Uint8Array(256);
            for (let i = 0; i < 256; i++) binaryData[i] = i;
            const fs = createWasiFilesystem(new Map([
                ['/binary.bin', binaryData],
            ]));
            const root = fs.rootDescriptor();
            const file = unwrap(root.openAt({}, 'binary.bin', {}, { read: true }));
            const [data] = unwrap(file.read(256n, 0n));
            expect(data.length).toBe(256);
            for (let i = 0; i < 256; i++) {
                expect(data[i]).toBe(i);
            }
        });

        it('large file', () => {
            const largeData = new Uint8Array(1024 * 1024); // 1MB
            largeData.fill(0xAB);
            const fs = createWasiFilesystem(new Map([
                ['/large.bin', largeData],
            ]));
            const root = fs.rootDescriptor();
            const stat = unwrap(root.statAt({}, 'large.bin'));
            expect(stat.size).toBe(BigInt(1024 * 1024));
        });

        it('unicode filename', () => {
            const fs = createWasiFilesystem(new Map([
                ['/日本語/ファイル.txt', textFile('こんにちは')],
            ]));
            const root = fs.rootDescriptor();
            const stat = unwrap(root.statAt({}, '日本語/ファイル.txt'));
            expect(stat.type).toBe('regular-file');
        });

        it('concurrent reads from same file descriptor', () => {
            const fs = createWasiFilesystem(new Map([
                ['/file.txt', textFile('abcdef')],
            ]));
            const root = fs.rootDescriptor();
            const file = unwrap(root.openAt({}, 'file.txt', {}, { read: true }));
            const [a] = unwrap(file.read(3n, 0n));
            const [b] = unwrap(file.read(3n, 3n));
            expect(decoder.decode(a)).toBe('abc');
            expect(decoder.decode(b)).toBe('def');
        });

        it('write then read consistency', () => {
            const fs = createWasiFilesystem(new Map([
                ['/file.txt', textFile('')],
            ]));
            const root = fs.rootDescriptor();
            const file = unwrap(root.openAt({}, 'file.txt', {}, { read: true, write: true }));
            unwrap(file.write(textFile('written'), 0n));
            const [data] = unwrap(file.read(100n, 0n));
            expect(decoder.decode(data)).toBe('written');
        });

        it('multiple files with common prefix', () => {
            const fs = createWasiFilesystem(new Map([
                ['/prefix/a', textFile('a')],
                ['/prefix/ab', textFile('ab')],
                ['/prefix/abc', textFile('abc')],
            ]));
            const root = fs.rootDescriptor();
            const dir = unwrap(root.openAt({}, 'prefix', { directory: true }, { read: true }));
            const stream = unwrap(dir.readDirectory());
            const entries: DirectoryEntry[] = [];
            for (; ;) {
                const entry = unwrap(stream.readDirectoryEntry());
                if (entry === undefined) break;
                entries.push(entry);
            }
            expect(entries.length).toBe(3);
        });
    });
});
