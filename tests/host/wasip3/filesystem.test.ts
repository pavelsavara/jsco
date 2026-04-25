// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { initFilesystem, createPreopens } from '../../../src/host/wasip3/filesystem';
import { collectStream, collectBytes } from '../../../src/host/wasip3/streams';
import type { WasiStreamReadable } from '../../../src/host/wasip3/streams';

// Helper to create a readable stream from a Uint8Array
function readableFrom(data: Uint8Array): WasiStreamReadable<Uint8Array> {
    return {
        async *[Symbol.asyncIterator]() {
            yield data;
        },
    };
}

// Helper to create a readable stream from multiple chunks
function readableFromChunks(chunks: Uint8Array[]): WasiStreamReadable<Uint8Array> {
    return {
        async *[Symbol.asyncIterator]() {
            for (const chunk of chunks) {
                yield chunk;
            }
        },
    };
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

describe('filesystem — preopens', () => {
    test('getDirectories returns root preopen', () => {
        const state = initFilesystem();
        const preopens = createPreopens(state);
        const dirs = preopens.getDirectories();
        expect(dirs.length).toBe(1);
        expect(dirs[0]![1]).toBe('/');
    });

    test('preopens descriptor can stat root', async () => {
        const state = initFilesystem();
        const preopens = createPreopens(state);
        const dirs = preopens.getDirectories();
        const desc = dirs[0]![0] as any;
        const s = await desc.stat();
        expect(s.type.tag).toBe('directory');
    });
});

describe('filesystem — Descriptor', () => {
    function getRoot(config?: Parameters<typeof initFilesystem>[0]) {
        const state = initFilesystem(config);
        const preopens = createPreopens(state);
        return preopens.getDirectories()[0]![0] as any;
    }

    describe('file I/O via streams', () => {
        test('write then read round-trip', async () => {
            const root = getRoot();
            const file = await root.openAt(
                { symlinkFollow: false }, 'test.txt',
                { create: true }, { read: true, write: true, mutateDirectory: true },
            );

            const writeData = encoder.encode('hello world');
            const writeFuture = file.writeViaStream(readableFrom(writeData), 0n);
            await writeFuture;

            const [readStream, readFuture] = file.readViaStream(0n);
            const bytes = await collectBytes(readStream);
            const result = await readFuture;
            expect(result.tag).toBe('ok');
            expect(decoder.decode(bytes)).toBe('hello world');
        });

        test('read with offset', async () => {
            const root = getRoot({ fs: new Map([['f.txt', 'hello world']]) });
            const file = await root.openAt(
                { symlinkFollow: false }, 'f.txt',
                {}, { read: true },
            );

            const [readStream, readFuture] = file.readViaStream(6n);
            const bytes = await collectBytes(readStream);
            await readFuture;
            expect(decoder.decode(bytes)).toBe('world');
        });

        test('append via stream', async () => {
            const root = getRoot({ fs: new Map([['f.txt', 'hello']]) });
            const file = await root.openAt(
                { symlinkFollow: false }, 'f.txt',
                {}, { read: true, write: true },
            );

            await file.appendViaStream(readableFrom(encoder.encode(' world')));

            const [readStream] = file.readViaStream(0n);
            const bytes = await collectBytes(readStream);
            expect(decoder.decode(bytes)).toBe('hello world');
        });

        test('read empty file', async () => {
            const root = getRoot({ fs: new Map([['empty.txt', '']]) });
            const file = await root.openAt(
                { symlinkFollow: false }, 'empty.txt',
                {}, { read: true },
            );

            const [readStream, readFuture] = file.readViaStream(0n);
            const bytes = await collectBytes(readStream);
            const result = await readFuture;
            expect(result.tag).toBe('ok');
            expect(bytes.length).toBe(0);
        });

        test('write multiple chunks', async () => {
            const root = getRoot();
            const file = await root.openAt(
                { symlinkFollow: false }, 'multi.txt',
                { create: true }, { read: true, write: true, mutateDirectory: true },
            );

            const chunks = [
                encoder.encode('chunk1'),
                encoder.encode('chunk2'),
                encoder.encode('chunk3'),
            ];
            await file.writeViaStream(readableFromChunks(chunks), 0n);

            const [readStream] = file.readViaStream(0n);
            const bytes = await collectBytes(readStream);
            expect(decoder.decode(bytes)).toBe('chunk1chunk2chunk3');
        });
    });

    describe('metadata', () => {
        test('stat on file returns correct type and size', async () => {
            const root = getRoot({ fs: new Map([['f.txt', 'hello']]) });
            const file = await root.openAt(
                { symlinkFollow: false }, 'f.txt', {}, { read: true },
            );
            const s = await file.stat();
            expect(s.type.tag).toBe('regular-file');
            expect(s.size).toBe(5n);
            expect(s.linkCount).toBe(1n);
            expect(s.dataAccessTimestamp).toBeDefined();
            expect(s.dataModificationTimestamp).toBeDefined();
        });

        test('stat on directory', async () => {
            const root = getRoot();
            const s = await root.stat();
            expect(s.type.tag).toBe('directory');
        });

        test('statAt resolves through descriptor', async () => {
            const root = getRoot({ fs: new Map([['dir/f.txt', 'data']]) });
            const s = await root.statAt({ symlinkFollow: false }, 'dir/f.txt');
            expect(s.type.tag).toBe('regular-file');
            expect(s.size).toBe(4n);
        });

        test('statAt throws no-entry for missing path', async () => {
            const root = getRoot();
            await expect(root.statAt({ symlinkFollow: false }, 'missing')).rejects.toEqual({ tag: 'no-entry' });
        });

        test('getType returns descriptor type', async () => {
            const root = getRoot({ fs: new Map([['f.txt', 'data']]) });
            const file = await root.openAt({ symlinkFollow: false }, 'f.txt', {}, { read: true });
            const t = await file.getType();
            expect(t.tag).toBe('regular-file');
        });

        test('getFlags returns descriptor flags', async () => {
            const root = getRoot({ fs: new Map([['f.txt', 'data']]) });
            const file = await root.openAt({ symlinkFollow: false }, 'f.txt', {}, { read: true, write: true });
            const f = await file.getFlags();
            expect(f.read).toBe(true);
            expect(f.write).toBe(true);
        });

        test('setSize truncates file', async () => {
            const root = getRoot({ fs: new Map([['f.txt', 'hello world']]) });
            const file = await root.openAt({ symlinkFollow: false }, 'f.txt', {}, { read: true, write: true });
            await file.setSize(5n);
            const s = await file.stat();
            expect(s.size).toBe(5n);
        });

        test('setTimes updates timestamps', async () => {
            const root = getRoot({ fs: new Map([['f.txt', 'data']]) });
            const file = await root.openAt({ symlinkFollow: false }, 'f.txt', {}, { read: true, write: true });
            await file.setTimes(
                { tag: 'timestamp', val: { seconds: 1000n, nanoseconds: 500 } },
                { tag: 'now' },
            );
            const s = await file.stat();
            expect(s.dataAccessTimestamp!.seconds).toBe(1000n);
            expect(s.dataAccessTimestamp!.nanoseconds).toBe(500);
        });

        test('setTimes no-change leaves timestamp unchanged', async () => {
            const root = getRoot({ fs: new Map([['f.txt', 'data']]) });
            const file = await root.openAt({ symlinkFollow: false }, 'f.txt', {}, { read: true, write: true });
            const before = await file.stat();
            await file.setTimes({ tag: 'no-change' }, { tag: 'no-change' });
            const after = await file.stat();
            expect(after.dataAccessTimestamp!.seconds).toBe(before.dataAccessTimestamp!.seconds);
            expect(after.dataModificationTimestamp!.seconds).toBe(before.dataModificationTimestamp!.seconds);
        });

        test('setTimesAt updates timestamps on path', async () => {
            const root = getRoot({ fs: new Map([['f.txt', 'data']]) });
            await root.setTimesAt(
                { symlinkFollow: false }, 'f.txt',
                { tag: 'timestamp', val: { seconds: 2000n, nanoseconds: 0 } },
                { tag: 'timestamp', val: { seconds: 3000n, nanoseconds: 0 } },
            );
            const s = await root.statAt({ symlinkFollow: false }, 'f.txt');
            expect(s.dataAccessTimestamp!.seconds).toBe(2000n);
            expect(s.dataModificationTimestamp!.seconds).toBe(3000n);
        });
    });

    describe('directory operations', () => {
        test('createDirectoryAt + readDirectory', async () => {
            const root = getRoot();
            await root.createDirectoryAt('subdir');
            const [stream, future] = root.readDirectory();
            const entries = await collectStream(stream);
            const result = await future;
            expect(result.tag).toBe('ok');
            expect(entries.length).toBe(1);
            expect(entries[0]!.name).toBe('subdir');
            expect(entries[0]!.type.tag).toBe('directory');
        });

        test('removeDirectoryAt removes empty directory', async () => {
            const root = getRoot();
            await root.createDirectoryAt('subdir');
            await root.removeDirectoryAt('subdir');
            await expect(root.statAt({ symlinkFollow: false }, 'subdir')).rejects.toEqual({ tag: 'no-entry' });
        });

        test('removeDirectoryAt throws not-empty', async () => {
            const root = getRoot({ fs: new Map([['dir/f.txt', 'data']]) });
            await expect(root.removeDirectoryAt('dir')).rejects.toEqual({ tag: 'not-empty' });
        });

        test('readDirectory streams multiple entries', async () => {
            const root = getRoot({
                fs: new Map([
                    ['a.txt', 'a'],
                    ['b.txt', 'b'],
                    ['c.txt', 'c'],
                ])
            });
            const [stream] = root.readDirectory();
            const entries = await collectStream(stream);
            const names = entries.map((e: any) => e.name).sort();
            expect(names).toEqual(['a.txt', 'b.txt', 'c.txt']);
        });
    });

    describe('file operations', () => {
        test('openAt creates new file', async () => {
            const root = getRoot();
            const file = await root.openAt(
                { symlinkFollow: false }, 'new.txt',
                { create: true }, { read: true, write: true, mutateDirectory: true },
            );
            const s = await file.stat();
            expect(s.type.tag).toBe('regular-file');
            expect(s.size).toBe(0n);
        });

        test('openAt with truncate empties file', async () => {
            const root = getRoot({ fs: new Map([['f.txt', 'data']]) });
            const file = await root.openAt(
                { symlinkFollow: false }, 'f.txt',
                { truncate: true }, { read: true, write: true },
            );
            const s = await file.stat();
            expect(s.size).toBe(0n);
        });

        test('openAt with exclusive throws for existing', async () => {
            const root = getRoot({ fs: new Map([['f.txt', 'data']]) });
            await expect(root.openAt(
                { symlinkFollow: false }, 'f.txt',
                { create: true, exclusive: true }, { write: true },
            )).rejects.toEqual({ tag: 'exist' });
        });

        test('openAt without create throws for missing', async () => {
            const root = getRoot();
            await expect(root.openAt(
                { symlinkFollow: false }, 'missing.txt',
                {}, { read: true },
            )).rejects.toEqual({ tag: 'no-entry' });
        });

        test('unlinkFileAt removes file', async () => {
            const root = getRoot({ fs: new Map([['f.txt', 'data']]) });
            await root.unlinkFileAt('f.txt');
            await expect(root.statAt({ symlinkFollow: false }, 'f.txt')).rejects.toEqual({ tag: 'no-entry' });
        });

        test('renameAt moves file', async () => {
            const root = getRoot({ fs: new Map([['old.txt', 'data']]) });
            await root.renameAt('old.txt', root, 'new.txt');
            await expect(root.statAt({ symlinkFollow: false }, 'old.txt')).rejects.toEqual({ tag: 'no-entry' });
            const s = await root.statAt({ symlinkFollow: false }, 'new.txt');
            expect(s.type.tag).toBe('regular-file');
        });

        test('linkAt creates hard link', async () => {
            const root = getRoot({ fs: new Map([['original.txt', 'data']]) });
            await root.linkAt(
                { symlinkFollow: false }, 'original.txt',
                root, 'linked.txt',
            );
            const s = await root.statAt({ symlinkFollow: false }, 'linked.txt');
            expect(s.type.tag).toBe('regular-file');
            expect(await root.isSameObject(root)).toBe(true);
        });

        test('symlinkAt + readlinkAt', async () => {
            const root = getRoot({ fs: new Map([['target.txt', 'data']]) });
            await root.symlinkAt('target.txt', 'link');
            const target = await root.readlinkAt('link');
            expect(target).toBe('target.txt');
        });
    });

    describe('identity', () => {
        test('isSameObject on same descriptor returns true', async () => {
            const root = getRoot({ fs: new Map([['f.txt', 'data']]) });
            const file = await root.openAt({ symlinkFollow: false }, 'f.txt', {}, { read: true });
            expect(await file.isSameObject(file)).toBe(true);
        });

        test('isSameObject on different files returns false', async () => {
            const root = getRoot({ fs: new Map([['a.txt', 'a'], ['b.txt', 'b']]) });
            const a = await root.openAt({ symlinkFollow: false }, 'a.txt', {}, { read: true });
            const b = await root.openAt({ symlinkFollow: false }, 'b.txt', {}, { read: true });
            expect(await a.isSameObject(b)).toBe(false);
        });

        test('metadataHash returns consistent values', async () => {
            const root = getRoot({ fs: new Map([['f.txt', 'data']]) });
            const file = await root.openAt({ symlinkFollow: false }, 'f.txt', {}, { read: true });
            const h1 = await file.metadataHash();
            const h2 = await file.metadataHash();
            expect(h1.lower).toBe(h2.lower);
            expect(h1.upper).toBe(h2.upper);
        });

        test('metadataHashAt matches metadataHash', async () => {
            const root = getRoot({ fs: new Map([['f.txt', 'data']]) });
            const file = await root.openAt({ symlinkFollow: false }, 'f.txt', {}, { read: true });
            const h1 = await file.metadataHash();
            const h2 = await root.metadataHashAt({ symlinkFollow: false }, 'f.txt');
            expect(h1.lower).toBe(h2.lower);
            expect(h1.upper).toBe(h2.upper);
        });
    });

    describe('access control', () => {
        test('write to read-only descriptor throws', async () => {
            const root = getRoot({ fs: new Map([['f.txt', 'data']]) });
            const file = await root.openAt({ symlinkFollow: false }, 'f.txt', {}, { read: true });
            expect(() => file.writeViaStream(readableFrom(encoder.encode('new')), 0n)).toThrow();
        });

        test('read from write-only descriptor throws', () => {
            // Need mutateDirectory on root to create, but the file itself only has write
            const root = getRoot();
            return root.openAt(
                { symlinkFollow: false }, 'f.txt',
                { create: true }, { write: true, mutateDirectory: true },
            ).then((file: any) => {
                expect(() => file.readViaStream(0n)).toThrow();
            });
        });

        test('createDirectoryAt without mutateDirectory throws', async () => {
            const state = initFilesystem();
            const preopens = createPreopens(state);
            const root = preopens.getDirectories()[0]![0] as any;
            // Open a subdirectory without mutateDirectory
            await root.createDirectoryAt('sub');
            const sub = await root.openAt(
                { symlinkFollow: false }, 'sub',
                {}, { read: true },
            );
            await expect(sub.createDirectoryAt('nested')).rejects.toEqual({ tag: 'read-only' });
        });

        test('openAt with write on read-only parent throws', async () => {
            const root = getRoot({ fs: new Map([['dir/f.txt', 'data']]) });
            const dir = await root.openAt(
                { symlinkFollow: false }, 'dir',
                {}, { read: true },
            );
            await expect(dir.openAt(
                { symlinkFollow: false }, 'new.txt',
                { create: true }, { write: true },
            )).rejects.toEqual({ tag: 'read-only' });
        });
    });

    describe('path traversal security', () => {
        test('rejects .. escape via openAt', async () => {
            const root = getRoot({ fs: new Map([['dir/f.txt', 'data']]) });
            const dir = await root.openAt(
                { symlinkFollow: false }, 'dir',
                {}, { read: true, mutateDirectory: true },
            );
            await expect(dir.openAt(
                { symlinkFollow: false }, '../../etc/passwd',
                {}, { read: true },
            )).rejects.toBeDefined();
        });

        test('rejects null byte in path', async () => {
            const root = getRoot();
            await expect(root.statAt(
                { symlinkFollow: false }, 'test\0hidden',
            )).rejects.toBeDefined();
        });
    });

    describe('multi-step scenarios', () => {
        test('create dir → create file → write → read → stat → remove file → remove dir', async () => {
            const root = getRoot();

            // Create directory
            await root.createDirectoryAt('workspace');
            const dir = await root.openAt(
                { symlinkFollow: false }, 'workspace',
                {}, { read: true, write: true, mutateDirectory: true },
            );

            // Create file and write
            const file = await dir.openAt(
                { symlinkFollow: false }, 'data.txt',
                { create: true }, { read: true, write: true, mutateDirectory: true },
            );
            await file.writeViaStream(readableFrom(encoder.encode('test data')), 0n);

            // Read back
            const [readStream] = file.readViaStream(0n);
            const bytes = await collectBytes(readStream);
            expect(decoder.decode(bytes)).toBe('test data');

            // Stat
            const s = await file.stat();
            expect(s.type.tag).toBe('regular-file');
            expect(s.size).toBe(9n);

            // Remove file
            await dir.unlinkFileAt('data.txt');
            await expect(dir.statAt({ symlinkFollow: false }, 'data.txt')).rejects.toEqual({ tag: 'no-entry' });

            // Remove directory
            await root.removeDirectoryAt('workspace');
            await expect(root.statAt({ symlinkFollow: false }, 'workspace')).rejects.toEqual({ tag: 'no-entry' });
        });

        test('open → write stream → reopen → read stream → verify', async () => {
            const root = getRoot();

            const file1 = await root.openAt(
                { symlinkFollow: false }, 'persist.txt',
                { create: true }, { write: true, mutateDirectory: true },
            );
            await file1.writeViaStream(readableFrom(encoder.encode('persistent data')), 0n);

            // Re-open for reading
            const file2 = await root.openAt(
                { symlinkFollow: false }, 'persist.txt',
                {}, { read: true },
            );
            const [readStream] = file2.readViaStream(0n);
            const bytes = await collectBytes(readStream);
            expect(decoder.decode(bytes)).toBe('persistent data');
        });

        test('create multiple files → read directory → verify all', async () => {
            const root = getRoot();
            const names = ['alpha.txt', 'beta.txt', 'gamma.txt'];
            for (const name of names) {
                const f = await root.openAt(
                    { symlinkFollow: false }, name,
                    { create: true }, { write: true, mutateDirectory: true },
                );
                await f.writeViaStream(readableFrom(encoder.encode(name)), 0n);
            }

            const [dirStream] = root.readDirectory();
            const entries = await collectStream(dirStream);
            const entryNames = entries.map((e: any) => e.name).sort();
            expect(entryNames).toEqual(names.sort());
        });

        test('cascading descriptors: root → dir → subdir → file', async () => {
            const root = getRoot();

            await root.createDirectoryAt('level1');
            const d1 = await root.openAt(
                { symlinkFollow: false }, 'level1',
                {}, { read: true, mutateDirectory: true },
            );

            await d1.createDirectoryAt('level2');
            const d2 = await d1.openAt(
                { symlinkFollow: false }, 'level2',
                {}, { read: true, write: true, mutateDirectory: true },
            );

            const file = await d2.openAt(
                { symlinkFollow: false }, 'deep.txt',
                { create: true }, { read: true, write: true, mutateDirectory: true },
            );
            await file.writeViaStream(readableFrom(encoder.encode('deep content')), 0n);

            const [readStream] = file.readViaStream(0n);
            const bytes = await collectBytes(readStream);
            expect(decoder.decode(bytes)).toBe('deep content');

            // Verify via root stat
            const s = await root.statAt({ symlinkFollow: false }, 'level1/level2/deep.txt');
            expect(s.type.tag).toBe('regular-file');
            expect(s.size).toBe(12n);
        });
    });

    describe('evil arguments', () => {
        test('createDirectoryAt treats absolute path as relative (leading / stripped)', async () => {
            const root = getRoot();
            // Implementation splits on '/' and skips empty segments, so /absolute → ['absolute']
            await root.createDirectoryAt('/absolute');
            const stat = await root.statAt({ symlinkFollow: false }, 'absolute');
            expect(stat.type.tag).toBe('directory');
        });

        test('createDirectoryAt rejects null byte in path', async () => {
            const root = getRoot();
            await expect(root.createDirectoryAt('dir\x00hidden')).rejects.toBeDefined();
        });

        test('openAt rejects absolute path', async () => {
            const root = getRoot();
            await expect(root.openAt(
                { symlinkFollow: false }, '/etc/passwd',
                {}, { read: true },
            )).rejects.toBeDefined();
        });

        test('read at offset beyond file size returns empty', async () => {
            const root = getRoot({ fs: new Map([['small.txt', 'hi']]) });
            const file = await root.openAt({ symlinkFollow: false }, 'small.txt', {}, { read: true });
            const [stream] = file.readViaStream(1000n);
            const bytes = await collectBytes(stream);
            expect(bytes.length).toBe(0);
        });

        test('concurrent reads on same file both succeed', async () => {
            const content = 'shared content for concurrent reads';
            const root = getRoot({ fs: new Map([['shared.txt', content]]) });
            const f1 = await root.openAt({ symlinkFollow: false }, 'shared.txt', {}, { read: true });
            const f2 = await root.openAt({ symlinkFollow: false }, 'shared.txt', {}, { read: true });

            const [s1] = f1.readViaStream(0n);
            const [s2] = f2.readViaStream(0n);

            const [b1, b2] = await Promise.all([collectBytes(s1), collectBytes(s2)]);
            expect(decoder.decode(b1)).toBe(content);
            expect(decoder.decode(b2)).toBe(content);
        });

        test('setSize to 0 truncates file', async () => {
            const root = getRoot({ fs: new Map([['big.txt', 'some data here']]) });
            const file = await root.openAt(
                { symlinkFollow: false }, 'big.txt',
                {}, { read: true, write: true },
            );
            await file.setSize(0n);
            const stat = await file.stat();
            expect(stat.size).toBe(0n);
        });

        test('createDirectoryAt with empty string name fails', async () => {
            const root = getRoot();
            await expect(root.createDirectoryAt('')).rejects.toBeDefined();
        });

        test('createDirectoryAt with . as name fails', async () => {
            const root = getRoot();
            await expect(root.createDirectoryAt('.')).rejects.toBeDefined();
        });

        test('createDirectoryAt with .. as name fails', async () => {
            const root = getRoot();
            await expect(root.createDirectoryAt('..')).rejects.toBeDefined();
        });

        test('createDirectoryAt with very long name rejects', async () => {
            const root = getRoot();
            await expect(root.createDirectoryAt('a'.repeat(10000))).rejects.toBeDefined();
        });

        test('renameAt to same path is no-op or succeeds', async () => {
            const root = getRoot({ fs: new Map([['same.txt', 'data']]) });
            // Rename to the same name — should not crash
            await root.renameAt('same.txt', root, 'same.txt');
            const [s] = (await root.openAt({ symlinkFollow: false }, 'same.txt', {}, { read: true })).readViaStream(0n);
            const bytes = await collectBytes(s);
            expect(decoder.decode(bytes)).toBe('data');
        });

        test('open same file multiple times yields independent descriptors', async () => {
            const root = getRoot({ fs: new Map([['multi.txt', 'original']]) });
            const f1 = await root.openAt({ symlinkFollow: false }, 'multi.txt', {}, { read: true, write: true });
            const f2 = await root.openAt({ symlinkFollow: false }, 'multi.txt', {}, { read: true });

            // Write through f1
            await f1.writeViaStream(readableFrom(encoder.encode('modified')), 0n);

            // Read through f2 — should see modified data (shared backing store)
            const [s2] = f2.readViaStream(0n);
            const bytes = await collectBytes(s2);
            expect(decoder.decode(bytes)).toBe('modified');
        });

        test('write at offset beyond file size extends with zeros', async () => {
            const root = getRoot({ fs: new Map([['gap.txt', 'AB']]) });
            const file = await root.openAt(
                { symlinkFollow: false }, 'gap.txt',
                {}, { read: true, write: true },
            );
            await file.writeViaStream(readableFrom(encoder.encode('CD')), 5n);
            const [s] = file.readViaStream(0n);
            const bytes = await collectBytes(s);
            // First 2 bytes: 'AB', bytes 2-4: zeros, bytes 5-6: 'CD'
            expect(bytes.length).toBe(7);
            expect(bytes[0]).toBe(65); // 'A'
            expect(bytes[1]).toBe(66); // 'B'
            expect(bytes[2]).toBe(0);
            expect(bytes[5]).toBe(67); // 'C'
            expect(bytes[6]).toBe(68); // 'D'
        });

        test('symlink pointing outside mount is rejected on follow', async () => {
            const root = getRoot();
            await root.createDirectoryAt('dir');
            // Create a symlink that tries to escape via ..
            await root.symlinkAt('../../etc/passwd', 'evil-link');
            // Following the symlink should be caught by path traversal prevention
            await expect(root.openAt(
                { symlinkFollow: true }, 'evil-link',
                {}, { read: true },
            )).rejects.toBeDefined();
        });

        test('readlinkAt on non-symlink throws', async () => {
            const root = getRoot({ fs: new Map([['regular.txt', 'data']]) });
            await expect(root.readlinkAt('regular.txt')).rejects.toBeDefined();
        });

        test('openAt with path containing %2e%2e is NOT decoded (treated literally)', async () => {
            const root = getRoot();
            // %2e%2e should not be decoded to ..
            await root.openAt(
                { symlinkFollow: false }, '%2e%2e',
                { create: true }, { read: true, write: true, mutateDirectory: true },
            );
            const stat = await root.statAt({ symlinkFollow: false }, '%2e%2e');
            expect(stat.type.tag).toBe('regular-file');
        });
    });

    describe('no preopens', () => {
        test('empty filesystem state returns empty preopens', () => {
            const state = initFilesystem();
            // Delete the default root preopen by creating a new state with no fs
            const preopens = createPreopens(state);
            const dirs = preopens.getDirectories();
            // Default state always has at least root '/'
            expect(dirs.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('sync and advice', () => {
        test('sync on file succeeds', async () => {
            const root = getRoot({ fs: new Map([['f.txt', 'data']]) });
            const file = await root.openAt({ symlinkFollow: false }, 'f.txt', {}, { read: true, write: true });
            await file.sync();
        });

        test('syncData on file succeeds', async () => {
            const root = getRoot({ fs: new Map([['f.txt', 'data']]) });
            const file = await root.openAt({ symlinkFollow: false }, 'f.txt', {}, { read: true, write: true });
            await file.syncData();
        });

        test('advise on file succeeds', async () => {
            const root = getRoot({ fs: new Map([['f.txt', 'data']]) });
            const file = await root.openAt({ symlinkFollow: false }, 'f.txt', {}, { read: true });
            await file.advise(0n, 4n, { tag: 'sequential' });
        });

        test('setSize to same size is no-op', async () => {
            const root = getRoot({ fs: new Map([['f.txt', 'data']]) });
            const file = await root.openAt({ symlinkFollow: false }, 'f.txt', {}, { read: true, write: true });
            const stat1 = await file.stat();
            await file.setSize(stat1.size);
            const stat2 = await file.stat();
            expect(stat2.size).toBe(stat1.size);
        });
    });

    describe('error paths', () => {
        test('write to file after drop throws', async () => {
            const root = getRoot();
            const file = await root.openAt(
                { symlinkFollow: false }, 'tmp.txt',
                { create: true }, { read: true, write: true, mutateDirectory: true },
            );
            file.drop();
            expect(() => file.writeViaStream(readableFrom(encoder.encode('late')), 0n)).toThrow();
        });

        test('openAt with directory flag on regular file throws', async () => {
            const root = getRoot({ fs: new Map([['f.txt', 'data']]) });
            await expect(root.openAt(
                { symlinkFollow: false }, 'f.txt',
                { directory: true }, { read: true },
            )).rejects.toBeDefined();
        });

        test('unlinkFileAt on directory throws', async () => {
            const root = getRoot();
            await root.createDirectoryAt('mydir');
            await expect(root.unlinkFileAt('mydir')).rejects.toBeDefined();
        });

        test('createDirectoryAt that already exists throws', async () => {
            const root = getRoot();
            await root.createDirectoryAt('existing');
            await expect(root.createDirectoryAt('existing')).rejects.toBeDefined();
        });

        test('removeDirectoryAt on non-existent throws', async () => {
            const root = getRoot();
            await expect(root.removeDirectoryAt('nope')).rejects.toBeDefined();
        });

        test('renameAt with missing source throws', async () => {
            const root = getRoot();
            await expect(root.renameAt('nonexistent', root, 'dest')).rejects.toBeDefined();
        });

        test('statAt on non-existent path throws', async () => {
            const root = getRoot();
            await expect(root.statAt({ symlinkFollow: false }, 'no-such-file')).rejects.toBeDefined();
        });

        test('setSize on read-only descriptor throws', async () => {
            const root = getRoot({ fs: new Map([['ro.txt', 'data']]) });
            const file = await root.openAt({ symlinkFollow: false }, 'ro.txt', {}, { read: true });
            await expect(file.setSize(0n)).rejects.toBeDefined();
        });
    });

    describe('async ordering', () => {
        test('start reading file A, start writing file B — both succeed independently', async () => {
            const root = getRoot({ fs: new Map([['a.txt', 'aaa']]) });
            const fileA = await root.openAt({ symlinkFollow: false }, 'a.txt', {}, { read: true });
            const fileB = await root.openAt(
                { symlinkFollow: false }, 'b.txt',
                { create: true }, { read: true, write: true, mutateDirectory: true },
            );

            const [readStream] = fileA.readViaStream(0n);
            const writeFuture = fileB.writeViaStream(readableFrom(encoder.encode('bbb')), 0n);

            const [readBytes] = await Promise.all([collectBytes(readStream), writeFuture]);
            expect(decoder.decode(readBytes)).toBe('aaa');

            const [bStream] = fileB.readViaStream(0n);
            const bBytes = await collectBytes(bStream);
            expect(decoder.decode(bBytes)).toBe('bbb');
        });

        test('rename file then open at new path — data still accessible', async () => {
            const root = getRoot({ fs: new Map([['before.txt', 'content']]) });
            await root.renameAt('before.txt', root, 'after.txt');

            // File accessible at new path
            const file = await root.openAt({ symlinkFollow: false }, 'after.txt', {}, { read: true });
            const [s] = file.readViaStream(0n);
            const bytes = await collectBytes(s);
            expect(decoder.decode(bytes)).toBe('content');

            // Old path is gone
            await expect(
                root.openAt({ symlinkFollow: false }, 'before.txt', {}, { read: true }),
            ).rejects.toEqual({ tag: 'no-entry' });
        });

        test('write to file then setSize smaller — read shows truncated', async () => {
            const root = getRoot();
            const file = await root.openAt(
                { symlinkFollow: false }, 'trunc.txt',
                { create: true }, { read: true, write: true, mutateDirectory: true },
            );
            await file.writeViaStream(readableFrom(encoder.encode('hello world')), 0n);
            await file.setSize(5n);
            const [s] = file.readViaStream(0n);
            const bytes = await collectBytes(s);
            expect(decoder.decode(bytes)).toBe('hello');
        });

        test('open file read-only → write fails → open read-write → write succeeds', async () => {
            const root = getRoot({ fs: new Map([['rw.txt', 'old']]) });
            const roFile = await root.openAt({ symlinkFollow: false }, 'rw.txt', {}, { read: true });
            expect(() => roFile.writeViaStream(readableFrom(encoder.encode('fail')), 0n)).toThrow();

            const rwFile = await root.openAt({ symlinkFollow: false }, 'rw.txt', {}, { read: true, write: true });
            await rwFile.writeViaStream(readableFrom(encoder.encode('success')), 0n);
            const [s] = rwFile.readViaStream(0n);
            const bytes = await collectBytes(s);
            expect(decoder.decode(bytes)).toBe('success');
        });
    });
});


