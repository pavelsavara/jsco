// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

/**
 * Tests for WASIp3 Node.js real-filesystem backend (NodeFsBackend).
 *
 * Uses real temp directories — these are integration tests.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { NodeFsBackend, addNodeMounts } from '../../../../src/host/wasip3/node/filesystem-node';
import { VfsError } from '../../../../src/host/wasip3/vfs';
import { initFilesystem, createPreopens } from '../../../../src/host/wasip3/filesystem';
import { collectBytes } from '../../../../src/host/wasip3/streams';
import type { WasiStreamReadable } from '../../../../src/host/wasip3/streams';

// ──────────────────── Helpers ────────────────────

const enc = new TextEncoder();
const dec = new TextDecoder();

function createTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'jsco-p3-fsnode-'));
}

function cleanupTempDir(dir: string): void {
    fs.rmSync(dir, { recursive: true, force: true });
}

function readableFrom(data: Uint8Array): WasiStreamReadable<Uint8Array> {
    return {
        async *[Symbol.asyncIterator]() {
            yield data;
        },
    };
}

// ──────────────────── NodeFsBackend unit tests ────────────────────

describe('NodeFsBackend', () => {
    let tempDir: string;
    let backend: NodeFsBackend;

    beforeEach(() => {
        tempDir = createTempDir();
        backend = new NodeFsBackend(tempDir, false);
    });

    afterEach(() => {
        cleanupTempDir(tempDir);
    });

    // ─── stat ───

    describe('stat', () => {
        test('stat root directory', () => {
            const s = backend.stat([]);
            expect(s.type).toBe(1); // VfsNodeType.Directory
            expect(s.linkCount).toBeGreaterThan(0n);
        });

        test('stat file', () => {
            fs.writeFileSync(path.join(tempDir, 'hello.txt'), 'hello');
            const s = backend.stat(['hello.txt']);
            expect(s.type).toBe(0); // VfsNodeType.File = 0
            expect(s.size).toBe(5n);
        });

        test('stat non-existent throws no-entry', () => {
            expect(() => backend.stat(['nope'])).toThrow(VfsError);
            try { backend.stat(['nope']); } catch (e) {
                expect((e as VfsError).code).toBe('no-entry');
            }
        });

        test('stat subdirectory', () => {
            fs.mkdirSync(path.join(tempDir, 'sub'));
            const s = backend.stat(['sub']);
            expect(s.type).toBe(1); // VfsNodeType.Directory = 1
        });
    });

    // ─── read ───

    describe('read', () => {
        test('read file contents', () => {
            fs.writeFileSync(path.join(tempDir, 'data.bin'), Buffer.from([1, 2, 3, 4, 5]));
            const data = backend.read(['data.bin'], 0n, 10);
            expect(data).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
        });

        test('read with offset', () => {
            fs.writeFileSync(path.join(tempDir, 'data.bin'), Buffer.from([10, 20, 30, 40, 50]));
            const data = backend.read(['data.bin'], 2n, 10);
            expect(data).toEqual(new Uint8Array([30, 40, 50]));
        });

        test('read past end returns fewer bytes', () => {
            fs.writeFileSync(path.join(tempDir, 'small.txt'), 'ab');
            const data = backend.read(['small.txt'], 0n, 1000);
            expect(data.length).toBe(2);
        });

        test('read empty file', () => {
            fs.writeFileSync(path.join(tempDir, 'empty.txt'), '');
            const data = backend.read(['empty.txt'], 0n, 100);
            expect(data.length).toBe(0);
        });

        test('read non-existent throws no-entry', () => {
            expect(() => backend.read(['nope.txt'], 0n, 10)).toThrow(VfsError);
        });
    });

    // ─── write ───

    describe('write', () => {
        test('write to existing file', () => {
            fs.writeFileSync(path.join(tempDir, 'out.txt'), 'old');
            backend.write(['out.txt'], enc.encode('new'), 0n);
            expect(fs.readFileSync(path.join(tempDir, 'out.txt'), 'utf-8')).toBe('new');
        });

        test('write at offset', () => {
            fs.writeFileSync(path.join(tempDir, 'off.txt'), 'aaa');
            backend.write(['off.txt'], enc.encode('X'), 1n);
            expect(fs.readFileSync(path.join(tempDir, 'off.txt'), 'utf-8')).toBe('aXa');
        });

        test('write to read-only backend throws', () => {
            const roBackend = new NodeFsBackend(tempDir, true);
            fs.writeFileSync(path.join(tempDir, 'ro.txt'), 'data');
            expect(() => roBackend.write(['ro.txt'], enc.encode('x'), 0n)).toThrow(VfsError);
            try { roBackend.write(['ro.txt'], enc.encode('x'), 0n); } catch (e) {
                expect((e as VfsError).code).toBe('read-only');
            }
        });
    });

    // ─── append ───

    describe('append', () => {
        test('append to file', () => {
            fs.writeFileSync(path.join(tempDir, 'log.txt'), 'first');
            backend.append(['log.txt'], enc.encode('-second'));
            expect(fs.readFileSync(path.join(tempDir, 'log.txt'), 'utf-8')).toBe('first-second');
        });
    });

    // ─── setSize ───

    describe('setSize', () => {
        test('truncate file', () => {
            fs.writeFileSync(path.join(tempDir, 'trunc.txt'), 'hello world');
            backend.setSize(['trunc.txt'], 5n);
            expect(fs.readFileSync(path.join(tempDir, 'trunc.txt'), 'utf-8')).toBe('hello');
        });

        test('extend file with zeros', () => {
            fs.writeFileSync(path.join(tempDir, 'ext.txt'), 'hi');
            backend.setSize(['ext.txt'], 5n);
            const content = fs.readFileSync(path.join(tempDir, 'ext.txt'));
            expect(content.length).toBe(5);
            expect(content[0]).toBe(104); // 'h'
            expect(content[2]).toBe(0); // zero-extended
        });
    });

    // ─── setTimes ───

    describe('setTimes', () => {
        test('set access and modify times', () => {
            fs.writeFileSync(path.join(tempDir, 'times.txt'), 'x');
            const ts = 1_700_000_000_000_000_000n; // ~2023-11-14
            backend.setTimes(['times.txt'], ts, ts);
            const stats = fs.statSync(path.join(tempDir, 'times.txt'));
            // Within 1 second tolerance
            expect(Math.abs(stats.atimeMs - 1_700_000_000_000)).toBeLessThan(1000);
        });
    });

    // ─── openAt ───

    describe('openAt', () => {
        test('create new file', () => {
            const result = backend.openAt([], 'new.txt', { create: true }, { read: true, write: true }, false);
            expect(result.path).toEqual(['new.txt']);
            expect(fs.existsSync(path.join(tempDir, 'new.txt'))).toBe(true);
        });

        test('create new directory', () => {
            backend.openAt([], 'newdir', { create: true, directory: true }, { read: true }, false);
            expect(fs.statSync(path.join(tempDir, 'newdir')).isDirectory()).toBe(true);
        });

        test('open existing file', () => {
            fs.writeFileSync(path.join(tempDir, 'exist.txt'), 'data');
            const result = backend.openAt([], 'exist.txt', {}, { read: true }, false);
            expect(result.path).toEqual(['exist.txt']);
        });

        test('exclusive fails on existing', () => {
            fs.writeFileSync(path.join(tempDir, 'dup.txt'), 'data');
            expect(() => backend.openAt([], 'dup.txt', { create: true, exclusive: true }, { read: true }, false))
                .toThrow(VfsError);
        });

        test('open non-existent without create fails', () => {
            try {
                backend.openAt([], 'nofile.txt', {}, { read: true }, false);
                fail('expected error');
            } catch (e) {
                expect((e as VfsError).code).toBe('no-entry');
            }
        });

        test('truncate on open', () => {
            fs.writeFileSync(path.join(tempDir, 'big.txt'), 'long content');
            backend.openAt([], 'big.txt', { truncate: true }, { write: true }, false);
            expect(fs.readFileSync(path.join(tempDir, 'big.txt'), 'utf-8')).toBe('');
        });

        test('open in subdirectory', () => {
            fs.mkdirSync(path.join(tempDir, 'sub'));
            fs.writeFileSync(path.join(tempDir, 'sub', 'file.txt'), 'nested');
            const result = backend.openAt(['sub'], 'file.txt', {}, { read: true }, false);
            expect(result.path).toEqual(['sub', 'file.txt']);
        });
    });

    // ─── readDirectory ───

    describe('readDirectory', () => {
        test('list directory contents', () => {
            fs.writeFileSync(path.join(tempDir, 'a.txt'), 'a');
            fs.writeFileSync(path.join(tempDir, 'b.txt'), 'b');
            fs.mkdirSync(path.join(tempDir, 'sub'));
            const entries = backend.readDirectory([]);
            const names = entries.map(e => e.name).sort();
            expect(names).toEqual(['a.txt', 'b.txt', 'sub']);
            const subEntry = entries.find(e => e.name === 'sub')!;
            expect(subEntry.type).toBe(1); // Directory
        });

        test('empty directory', () => {
            fs.mkdirSync(path.join(tempDir, 'empty'));
            const entries = backend.readDirectory(['empty']);
            expect(entries).toEqual([]);
        });

        test('readDirectory on non-existent throws', () => {
            expect(() => backend.readDirectory(['nope'])).toThrow(VfsError);
        });
    });

    // ─── createDirectory ───

    describe('createDirectory', () => {
        test('create subdirectory', () => {
            backend.createDirectory([], 'newdir');
            expect(fs.statSync(path.join(tempDir, 'newdir')).isDirectory()).toBe(true);
        });

        test('create duplicate throws exist', () => {
            fs.mkdirSync(path.join(tempDir, 'dup'));
            try {
                backend.createDirectory([], 'dup');
                fail('expected error');
            } catch (e) {
                expect((e as VfsError).code).toBe('exist');
            }
        });
    });

    // ─── removeDirectory ───

    describe('removeDirectory', () => {
        test('remove empty directory', () => {
            fs.mkdirSync(path.join(tempDir, 'rmdir'));
            backend.removeDirectory([], 'rmdir');
            expect(fs.existsSync(path.join(tempDir, 'rmdir'))).toBe(false);
        });

        test('remove non-empty directory throws', () => {
            fs.mkdirSync(path.join(tempDir, 'notempty'));
            fs.writeFileSync(path.join(tempDir, 'notempty', 'file.txt'), 'x');
            expect(() => backend.removeDirectory([], 'notempty')).toThrow(VfsError);
        });
    });

    // ─── unlinkFile ───

    describe('unlinkFile', () => {
        test('unlink file', () => {
            fs.writeFileSync(path.join(tempDir, 'del.txt'), 'gone');
            backend.unlinkFile([], 'del.txt');
            expect(fs.existsSync(path.join(tempDir, 'del.txt'))).toBe(false);
        });

        test('unlink directory throws is-directory', () => {
            fs.mkdirSync(path.join(tempDir, 'dir'));
            try {
                backend.unlinkFile([], 'dir');
                fail('expected error');
            } catch (e) {
                expect((e as VfsError).code).toBe('is-directory');
            }
        });
    });

    // ─── rename ───

    describe('rename', () => {
        test('rename file', () => {
            fs.writeFileSync(path.join(tempDir, 'old.txt'), 'content');
            backend.rename([], 'old.txt', [], 'new.txt');
            expect(fs.existsSync(path.join(tempDir, 'old.txt'))).toBe(false);
            expect(fs.readFileSync(path.join(tempDir, 'new.txt'), 'utf-8')).toBe('content');
        });

        test('rename into subdirectory', () => {
            fs.writeFileSync(path.join(tempDir, 'mv.txt'), 'data');
            fs.mkdirSync(path.join(tempDir, 'dest'));
            backend.rename([], 'mv.txt', ['dest'], 'moved.txt');
            expect(fs.existsSync(path.join(tempDir, 'dest', 'moved.txt'))).toBe(true);
        });
    });

    // ─── linkAt ───

    describe('linkAt', () => {
        test('hard link file', () => {
            fs.writeFileSync(path.join(tempDir, 'orig.txt'), 'linked');
            backend.linkAt(['orig.txt'], [], 'link.txt');
            expect(fs.readFileSync(path.join(tempDir, 'link.txt'), 'utf-8')).toBe('linked');
            // Same inode
            const s1 = fs.statSync(path.join(tempDir, 'orig.txt'));
            const s2 = fs.statSync(path.join(tempDir, 'link.txt'));
            expect(s1.ino).toBe(s2.ino);
        });
    });

    // ─── symlinkAt / readlinkAt ───

    describe('symlinks', () => {
        // Symlinks require elevated privileges on Windows and may not work in all CI environments
        const symlinkSupported = (() => {
            try {
                const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'symprobe-'));
                const probeTarget = path.join(probeDir, 'target');
                const probeLink = path.join(probeDir, 'link');
                fs.writeFileSync(probeTarget, '');
                fs.symlinkSync('target', probeLink);
                fs.readlinkSync(probeLink);
                fs.rmSync(probeDir, { recursive: true });
                return true;
            } catch { return false; }
        })();
        const itIfSymlinks = symlinkSupported ? test : test.skip;

        itIfSymlinks('create and read symlink', () => {
            fs.writeFileSync(path.join(tempDir, 'target.txt'), 'data');
            backend.symlinkAt([], 'target.txt', 'link.txt');
            const target = backend.readlinkAt([], 'link.txt');
            expect(target).toBe('target.txt');
        });

        test('absolute symlink rejected', () => {
            expect(() => backend.symlinkAt([], '/etc/passwd', 'evil')).toThrow(VfsError);
        });
    });

    // ─── isSameNode ───

    describe('isSameNode', () => {
        test('same file', () => {
            fs.writeFileSync(path.join(tempDir, 'same.txt'), 'x');
            expect(backend.isSameNode(['same.txt'], ['same.txt'])).toBe(true);
        });

        test('different files', () => {
            fs.writeFileSync(path.join(tempDir, 'a.txt'), 'a');
            fs.writeFileSync(path.join(tempDir, 'b.txt'), 'b');
            expect(backend.isSameNode(['a.txt'], ['b.txt'])).toBe(false);
        });

        test('hard-linked files are same', () => {
            fs.writeFileSync(path.join(tempDir, 'orig.txt'), 'x');
            fs.linkSync(path.join(tempDir, 'orig.txt'), path.join(tempDir, 'hl.txt'));
            expect(backend.isSameNode(['orig.txt'], ['hl.txt'])).toBe(true);
        });
    });

    // ─── metadataHash ───

    describe('metadataHash', () => {
        test('hash returns consistent values', () => {
            fs.writeFileSync(path.join(tempDir, 'hash.txt'), 'x');
            const h1 = backend.metadataHash(['hash.txt']);
            const h2 = backend.metadataHash(['hash.txt']);
            expect(h1.lower).toBe(h2.lower);
            expect(h1.upper).toBe(h2.upper);
        });

        test('different files have different hashes', () => {
            fs.writeFileSync(path.join(tempDir, 'h1.txt'), 'a');
            fs.writeFileSync(path.join(tempDir, 'h2.txt'), 'b');
            const h1 = backend.metadataHash(['h1.txt']);
            const h2 = backend.metadataHash(['h2.txt']);
            // At least one field should differ (inode)
            expect(h1.upper !== h2.upper || h1.lower !== h2.lower).toBe(true);
        });
    });

    // ─── Path security ───

    describe('path escape prevention', () => {
        test('.. escape rejected by resolvePathComponents', () => {
            // resolvePathComponents is called before safeResolve
            expect(() => backend.stat(['..'])).toThrow();
        });

        test('path with null byte rejected', () => {
            expect(() => backend.openAt([], 'evil\0.txt', { create: true }, { read: true }, false))
                .toThrow(VfsError);
        });
    });

    // ─── read-only backend ───

    describe('read-only', () => {
        let roBackend: NodeFsBackend;

        beforeEach(() => {
            roBackend = new NodeFsBackend(tempDir, true);
        });

        test('write throws read-only', () => {
            fs.writeFileSync(path.join(tempDir, 'ro.txt'), 'data');
            try { roBackend.write(['ro.txt'], enc.encode('x'), 0n); } catch (e) {
                expect((e as VfsError).code).toBe('read-only');
            }
        });

        test('createDirectory throws read-only', () => {
            try { roBackend.createDirectory([], 'newdir'); } catch (e) {
                expect((e as VfsError).code).toBe('read-only');
            }
        });

        test('unlinkFile throws read-only', () => {
            fs.writeFileSync(path.join(tempDir, 'del.txt'), 'x');
            try { roBackend.unlinkFile([], 'del.txt'); } catch (e) {
                expect((e as VfsError).code).toBe('read-only');
            }
        });

        test('read still works', () => {
            fs.writeFileSync(path.join(tempDir, 'readable.txt'), 'content');
            const data = roBackend.read(['readable.txt'], 0n, 100);
            expect(dec.decode(data)).toBe('content');
        });

        test('stat still works', () => {
            fs.writeFileSync(path.join(tempDir, 'readable.txt'), 'content');
            const s = roBackend.stat(['readable.txt']);
            expect(s.size).toBe(7n);
        });
    });
});

// ──────────────────── addNodeMounts integration tests ────────────────────

describe('addNodeMounts', () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = createTempDir();
    });

    afterEach(() => {
        cleanupTempDir(tempDir);
    });

    test('adds mount preopens to filesystem state', () => {
        const state = initFilesystem();
        const initialCount = state.preopens.length;
        addNodeMounts(state, [{ hostPath: tempDir, guestPath: '/mnt' }]);
        expect(state.preopens.length).toBe(initialCount + 1);
        expect(state.preopens[state.preopens.length - 1]![1]).toBe('/mnt');
    });

    test('multiple mounts', () => {
        const sub1 = path.join(tempDir, 'a');
        const sub2 = path.join(tempDir, 'b');
        fs.mkdirSync(sub1);
        fs.mkdirSync(sub2);
        const state = initFilesystem();
        addNodeMounts(state, [
            { hostPath: sub1, guestPath: '/a' },
            { hostPath: sub2, guestPath: '/b' },
        ]);
        const paths = state.preopens.map(p => p[1]);
        expect(paths).toContain('/a');
        expect(paths).toContain('/b');
    });

    test('non-existent host path throws', () => {
        const state = initFilesystem();
        expect(() => addNodeMounts(state, [
            { hostPath: path.join(tempDir, 'nope'), guestPath: '/mnt' },
        ])).toThrow('does not exist');
    });

    test('file as host path throws', () => {
        fs.writeFileSync(path.join(tempDir, 'file.txt'), 'x');
        const state = initFilesystem();
        expect(() => addNodeMounts(state, [
            { hostPath: path.join(tempDir, 'file.txt'), guestPath: '/mnt' },
        ])).toThrow('not a directory');
    });

    test('read-only mount', () => {
        const state = initFilesystem();
        addNodeMounts(state, [{ hostPath: tempDir, guestPath: '/ro', readOnly: true }]);
        const desc = state.preopens[state.preopens.length - 1]![0] as any;
        expect(desc.flags.write).toBe(false);
        expect(desc.flags.mutateDirectory).toBe(false);
    });

    test('preopens visible through createPreopens', () => {
        const state = initFilesystem();
        addNodeMounts(state, [{ hostPath: tempDir, guestPath: '/data' }]);
        const preopens = createPreopens(state);
        const dirs = preopens.getDirectories();
        const paths = dirs.map((d: any) => d[1]);
        expect(paths).toContain('/data');
    });
});

// ──────────────────── FsDescriptor + NodeFsBackend integration ────────────────────

describe('FsDescriptor with NodeFsBackend', () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = createTempDir();
    });

    afterEach(() => {
        cleanupTempDir(tempDir);
    });

    function getMountRoot(readOnly = false): any {
        const state = initFilesystem();
        addNodeMounts(state, [{ hostPath: tempDir, guestPath: '/', readOnly }]);
        // Return the node-backed descriptor (last preopen)
        return state.preopens[state.preopens.length - 1]![0];
    }

    test('stat root via descriptor', async () => {
        const root = getMountRoot();
        const s = await root.stat();
        expect(s.type.tag).toBe('directory');
    });

    test('openAt + write + read round-trip via descriptor streams', async () => {
        fs.writeFileSync(path.join(tempDir, 'test.txt'), '');
        const root = getMountRoot();
        const file = await root.openAt(
            { symlinkFollow: false }, 'test.txt',
            {}, { read: true, write: true, mutateDirectory: true },
        );

        // Write
        const writeData = enc.encode('hello from node fs');
        await file.writeViaStream(readableFrom(writeData), 0n);

        // Read back
        const [readable, future] = file.readViaStream(0n);
        const bytes = await collectBytes(readable);
        await future;
        expect(dec.decode(bytes)).toBe('hello from node fs');
    });

    test('create file via openAt, write, read back', async () => {
        const root = getMountRoot();
        const file = await root.openAt(
            { symlinkFollow: false }, 'created.txt',
            { create: true }, { read: true, write: true, mutateDirectory: true },
        );

        await file.writeViaStream(readableFrom(enc.encode('created!')), 0n);

        // Verify on host filesystem
        expect(fs.readFileSync(path.join(tempDir, 'created.txt'), 'utf-8')).toBe('created!');
    });

    test('readDirectory via descriptor', async () => {
        fs.writeFileSync(path.join(tempDir, 'a.txt'), 'a');
        fs.writeFileSync(path.join(tempDir, 'b.txt'), 'b');
        fs.mkdirSync(path.join(tempDir, 'sub'));

        const root = getMountRoot();
        const [stream, future] = root.readDirectory();
        const entries: Array<{ name: string; type: { tag: string } }> = [];
        for await (const entry of stream) {
            entries.push(entry);
        }
        await future;

        const names = entries.map(e => e.name).sort();
        expect(names).toEqual(['a.txt', 'b.txt', 'sub']);
    });

    test('createDirectoryAt + removeDirectoryAt', async () => {
        const root = getMountRoot();
        await root.createDirectoryAt('mydir');
        expect(fs.statSync(path.join(tempDir, 'mydir')).isDirectory()).toBe(true);

        await root.removeDirectoryAt('mydir');
        expect(fs.existsSync(path.join(tempDir, 'mydir'))).toBe(false);
    });

    test('unlinkFileAt', async () => {
        fs.writeFileSync(path.join(tempDir, 'bye.txt'), 'gone');
        const root = getMountRoot();
        await root.unlinkFileAt('bye.txt');
        expect(fs.existsSync(path.join(tempDir, 'bye.txt'))).toBe(false);
    });

    test('renameAt', async () => {
        fs.writeFileSync(path.join(tempDir, 'old.txt'), 'data');
        const root = getMountRoot();
        await root.renameAt('old.txt', root, 'new.txt');
        expect(fs.existsSync(path.join(tempDir, 'old.txt'))).toBe(false);
        expect(fs.readFileSync(path.join(tempDir, 'new.txt'), 'utf-8')).toBe('data');
    });

    test('statAt', async () => {
        fs.writeFileSync(path.join(tempDir, 'info.txt'), 'hello');
        const root = getMountRoot();
        const s = await root.statAt({ symlinkFollow: true }, 'info.txt');
        expect(s.type.tag).toBe('regular-file');
        expect(s.size).toBe(5n);
    });

    test('appendViaStream', async () => {
        fs.writeFileSync(path.join(tempDir, 'append.txt'), 'start');
        const root = getMountRoot();
        const file = await root.openAt(
            { symlinkFollow: false }, 'append.txt',
            {}, { read: true, write: true },
        );

        await file.appendViaStream(readableFrom(enc.encode('-end')));

        expect(fs.readFileSync(path.join(tempDir, 'append.txt'), 'utf-8')).toBe('start-end');
    });

    test('setSize via descriptor', async () => {
        fs.writeFileSync(path.join(tempDir, 'resize.txt'), 'hello world');
        const root = getMountRoot();
        const file = await root.openAt(
            { symlinkFollow: false }, 'resize.txt',
            {}, { read: true, write: true },
        );
        await file.setSize(5n);
        expect(fs.readFileSync(path.join(tempDir, 'resize.txt'), 'utf-8')).toBe('hello');
    });

    test('getType via descriptor', async () => {
        fs.writeFileSync(path.join(tempDir, 'typed.txt'), 'x');
        const root = getMountRoot();
        const file = await root.openAt(
            { symlinkFollow: false }, 'typed.txt',
            {}, { read: true },
        );
        const t = await file.getType();
        expect(t.tag).toBe('regular-file');
    });

    test('metadataHash via descriptor', async () => {
        fs.writeFileSync(path.join(tempDir, 'hashme.txt'), 'x');
        const root = getMountRoot();
        const h = await root.metadataHashAt({ symlinkFollow: true }, 'hashme.txt');
        expect(typeof h.lower).toBe('bigint');
        expect(typeof h.upper).toBe('bigint');
    });

    test('read-only mount rejects writes', async () => {
        fs.writeFileSync(path.join(tempDir, 'protected.txt'), 'data');
        const root = getMountRoot(true);
        await expect(async () => {
            const file = await root.openAt(
                { symlinkFollow: false }, 'protected.txt',
                {}, { read: true, write: true, mutateDirectory: true },
            );
            await file.writeViaStream(readableFrom(enc.encode('hack')), 0n);
        }).rejects.toMatchObject({ tag: 'read-only' });
    });

    test('write from host, read from guest', async () => {
        // Host writes a file
        fs.writeFileSync(path.join(tempDir, 'host-written.txt'), 'from host');

        // Guest reads it
        const root = getMountRoot();
        const file = await root.openAt(
            { symlinkFollow: false }, 'host-written.txt',
            {}, { read: true },
        );
        const [readable, future] = file.readViaStream(0n);
        const bytes = await collectBytes(readable);
        await future;
        expect(dec.decode(bytes)).toBe('from host');
    });

    test('write from guest, read from host', async () => {
        const root = getMountRoot();
        const file = await root.openAt(
            { symlinkFollow: false }, 'guest-written.txt',
            { create: true }, { read: true, write: true, mutateDirectory: true },
        );
        await file.writeViaStream(readableFrom(enc.encode('from guest')), 0n);

        // Host reads it
        expect(fs.readFileSync(path.join(tempDir, 'guest-written.txt'), 'utf-8')).toBe('from guest');
    });

    test('nested directory operations', async () => {
        const root = getMountRoot();

        // Create nested structure
        await root.createDirectoryAt('level1');
        const dir1 = await root.openAt(
            { symlinkFollow: false }, 'level1',
            {}, { read: true, write: true, mutateDirectory: true },
        );
        await dir1.createDirectoryAt('level2');
        const dir2 = await dir1.openAt(
            { symlinkFollow: false }, 'level2',
            {}, { read: true, write: true, mutateDirectory: true },
        );

        // Create file in nested dir
        const file = await dir2.openAt(
            { symlinkFollow: false }, 'deep.txt',
            { create: true }, { read: true, write: true, mutateDirectory: true },
        );
        await file.writeViaStream(readableFrom(enc.encode('deep content')), 0n);

        // Verify on host
        expect(fs.readFileSync(path.join(tempDir, 'level1', 'level2', 'deep.txt'), 'utf-8'))
            .toBe('deep content');
    });
});

// ──────────────────── vfsLimits quota enforcement ────────────────────

const QUOTA_FILE = '.jsco-quota.json';

function readQuota(dir: string): number {
    const raw = fs.readFileSync(path.join(dir, QUOTA_FILE), 'utf-8');
    return (JSON.parse(raw) as { totalSize: number }).totalSize;
}

describe('NodeFsBackend — maxFileSize enforcement', () => {
    let tempDir: string;
    let backend: NodeFsBackend;

    beforeEach(() => {
        tempDir = createTempDir();
        backend = new NodeFsBackend(tempDir, false, undefined, { maxFileSize: 10 });
        fs.writeFileSync(path.join(tempDir, 'f.txt'), '');
    });

    afterEach(() => cleanupTempDir(tempDir));

    test('write within the cap succeeds', () => {
        backend.write(['f.txt'], enc.encode('0123456789'), 0n);
        expect(fs.statSync(path.join(tempDir, 'f.txt')).size).toBe(10);
    });

    test('write exceeding the cap throws insufficient-space and does not write', () => {
        try {
            backend.write(['f.txt'], enc.encode('01234567890'), 0n);
            throw new Error('expected throw');
        } catch (e) {
            expect((e as VfsError).code).toBe('insufficient-space');
        }
        expect(fs.statSync(path.join(tempDir, 'f.txt')).size).toBe(0);
    });

    test('write at an offset beyond the cap throws', () => {
        expect(() => backend.write(['f.txt'], enc.encode('ab'), 9n))
            .toThrow(VfsError);
    });

    test('append exceeding the cap throws', () => {
        backend.append(['f.txt'], enc.encode('12345'));
        expect(() => backend.append(['f.txt'], enc.encode('678901')))
            .toThrow(VfsError);
        expect(fs.statSync(path.join(tempDir, 'f.txt')).size).toBe(5);
    });

    test('setSize exceeding the cap throws', () => {
        expect(() => backend.setSize(['f.txt'], 11n)).toThrow(VfsError);
        backend.setSize(['f.txt'], 10n);
        expect(fs.statSync(path.join(tempDir, 'f.txt')).size).toBe(10);
    });
});

describe('NodeFsBackend — maxTotalSize quota', () => {
    let tempDir: string;

    beforeEach(() => { tempDir = createTempDir(); });
    afterEach(() => cleanupTempDir(tempDir));

    test('a quota file is created at the mount root on construction', () => {
        new NodeFsBackend(tempDir, false, undefined, { maxTotalSize: 100 });
        expect(fs.existsSync(path.join(tempDir, QUOTA_FILE))).toBe(true);
        expect(readQuota(tempDir)).toBe(0);
    });

    test('the aggregate total is enforced across multiple files', () => {
        const backend = new NodeFsBackend(tempDir, false, undefined, { maxTotalSize: 20 });
        fs.writeFileSync(path.join(tempDir, 'a.txt'), '');
        fs.writeFileSync(path.join(tempDir, 'b.txt'), '');
        backend.write(['a.txt'], enc.encode('0123456789'), 0n); // 10
        backend.write(['b.txt'], enc.encode('0123456789'), 0n); // 20 total
        expect(readQuota(tempDir)).toBe(20);
        expect(() => backend.append(['b.txt'], enc.encode('x'))).toThrow(VfsError);
    });

    test('the total decreases when a file is truncated', () => {
        const backend = new NodeFsBackend(tempDir, false, undefined, { maxTotalSize: 100 });
        fs.writeFileSync(path.join(tempDir, 'a.txt'), '');
        backend.write(['a.txt'], enc.encode('0123456789'), 0n);
        expect(readQuota(tempDir)).toBe(10);
        backend.setSize(['a.txt'], 4n);
        expect(readQuota(tempDir)).toBe(4);
    });

    test('the total decreases when a file is deleted', () => {
        const backend = new NodeFsBackend(tempDir, false, undefined, { maxTotalSize: 100 });
        fs.writeFileSync(path.join(tempDir, 'a.txt'), '');
        backend.write(['a.txt'], enc.encode('0123456789'), 0n);
        expect(readQuota(tempDir)).toBe(10);
        backend.unlinkFile([], 'a.txt');
        expect(readQuota(tempDir)).toBe(0);
    });

    test('a truncate-on-open frees the previous file bytes', () => {
        const backend = new NodeFsBackend(tempDir, false, undefined, { maxTotalSize: 100 });
        fs.writeFileSync(path.join(tempDir, 'a.txt'), '');
        backend.write(['a.txt'], enc.encode('0123456789'), 0n);
        backend.openAt([], 'a.txt', { truncate: true }, { read: true, write: true }, false);
        expect(readQuota(tempDir)).toBe(0);
    });

    test('the persisted total is reloaded without rescanning', () => {
        const first = new NodeFsBackend(tempDir, false, undefined, { maxTotalSize: 100 });
        fs.writeFileSync(path.join(tempDir, 'a.txt'), '');
        first.write(['a.txt'], enc.encode('01234'), 0n); // 5
        // Add a file on the host AFTER the quota was persisted; a reload that
        // trusts the quota file must NOT re-count it.
        fs.writeFileSync(path.join(tempDir, 'sneaky.txt'), 'this is 17 bytes!');
        const second = new NodeFsBackend(tempDir, false, undefined, { maxTotalSize: 100 });
        // Reserve enough headroom so only the trusted (5-byte) total fits.
        second.write(['a.txt'], enc.encode('x'.repeat(95)), 0n);
        expect(fs.statSync(path.join(tempDir, 'a.txt')).size).toBe(95);
    });

    test('an existing tree is counted when no quota file is present', () => {
        fs.writeFileSync(path.join(tempDir, 'a.txt'), '12345'); // 5
        fs.mkdirSync(path.join(tempDir, 'sub'));
        fs.writeFileSync(path.join(tempDir, 'sub', 'b.txt'), '123'); // 3
        new NodeFsBackend(tempDir, false, undefined, { maxTotalSize: 100 });
        expect(readQuota(tempDir)).toBe(8);
    });

    test('a corrupt quota file is rebuilt from a directory scan', () => {
        fs.writeFileSync(path.join(tempDir, 'a.txt'), '12345');
        fs.writeFileSync(path.join(tempDir, QUOTA_FILE), 'not json {');
        new NodeFsBackend(tempDir, false, undefined, { maxTotalSize: 100 });
        expect(readQuota(tempDir)).toBe(5);
    });
});

describe('NodeFsBackend — quota file is protected', () => {
    let tempDir: string;
    let backend: NodeFsBackend;

    beforeEach(() => {
        tempDir = createTempDir();
        backend = new NodeFsBackend(tempDir, false, undefined, { maxTotalSize: 100 });
    });

    afterEach(() => cleanupTempDir(tempDir));

    /** Assert `fn` rejects the quota file with a graceful `access` error code (no trap). */
    function expectAccess(fn: () => unknown): void {
        try {
            fn();
            throw new Error('expected an access VfsError');
        } catch (e) {
            expect(e).toBeInstanceOf(VfsError);
            expect((e as VfsError).code).toBe('access');
        }
    }

    test('the quota file is hidden from readDirectory at the root', () => {
        fs.writeFileSync(path.join(tempDir, 'visible.txt'), 'x');
        const names = backend.readDirectory([]).map(e => e.name);
        expect(names).toContain('visible.txt');
        expect(names).not.toContain(QUOTA_FILE);
    });

    test('the guest cannot stat the quota file', () => {
        expectAccess(() => backend.stat([QUOTA_FILE]));
    });

    test('the guest cannot read the quota file', () => {
        expectAccess(() => backend.read([QUOTA_FILE], 0n, 64));
    });

    test('the guest cannot open the quota file', () => {
        expectAccess(() => backend.openAt([], QUOTA_FILE, {}, { read: true }, false));
    });

    test('the guest cannot create (open with create) the quota file', () => {
        expectAccess(() => backend.openAt([], QUOTA_FILE, { create: true }, { read: true, write: true }, false));
    });

    test('the guest cannot write the quota file', () => {
        expectAccess(() => backend.write([QUOTA_FILE], enc.encode('hack'), 0n));
    });

    test('the guest cannot append to the quota file', () => {
        expectAccess(() => backend.append([QUOTA_FILE], enc.encode('hack')));
    });

    test('the guest cannot truncate (setSize) the quota file', () => {
        expectAccess(() => backend.setSize([QUOTA_FILE], 0n));
    });

    test('the guest cannot setTimes on the quota file', () => {
        expectAccess(() => backend.setTimes([QUOTA_FILE], 0n, 0n));
    });

    test('the guest cannot unlink the quota file', () => {
        expectAccess(() => backend.unlinkFile([], QUOTA_FILE));
        expect(fs.existsSync(path.join(tempDir, QUOTA_FILE))).toBe(true);
    });

    test('the guest cannot rename the quota file away', () => {
        expectAccess(() => backend.rename([], QUOTA_FILE, [], 'stolen.json'));
        expect(fs.existsSync(path.join(tempDir, QUOTA_FILE))).toBe(true);
    });

    test('the guest cannot rename another file onto the quota file', () => {
        fs.writeFileSync(path.join(tempDir, 'src.txt'), 'x');
        expectAccess(() => backend.rename([], 'src.txt', [], QUOTA_FILE));
    });

    test('the guest cannot hard-link onto the quota file name', () => {
        fs.writeFileSync(path.join(tempDir, 'src.txt'), 'x');
        expectAccess(() => backend.linkAt(['src.txt'], [], QUOTA_FILE));
    });

    test('the guest cannot create a directory named like the quota file', () => {
        expectAccess(() => backend.createDirectory([], QUOTA_FILE));
    });

    test('the guest cannot metadataHash the quota file (no path-hash leak)', () => {
        expectAccess(() => backend.metadataHash([QUOTA_FILE]));
    });

    test('isSameNode never matches the quota file', () => {
        fs.writeFileSync(path.join(tempDir, 'other.txt'), 'x');
        expect(backend.isSameNode([QUOTA_FILE], [QUOTA_FILE])).toBe(false);
        expect(backend.isSameNode([QUOTA_FILE], ['other.txt'])).toBe(false);
    });
});

// ──────────────────── vfsLimits via addNodeMounts + descriptor ────────────────────

describe('vfsLimits via addNodeMounts (descriptor integration)', () => {
    let tempDir: string;

    beforeEach(() => { tempDir = createTempDir(); });
    afterEach(() => cleanupTempDir(tempDir));

    function getMountRoot(vfsLimits: { maxTotalSize?: number; maxFileSize?: number }): any {
        const state = initFilesystem();
        addNodeMounts(state, [{ hostPath: tempDir, guestPath: '/' }], undefined, vfsLimits);
        return state.preopens[state.preopens.length - 1]![0];
    }

    test('maxFileSize is enforced through the descriptor write path', async () => {
        const root = getMountRoot({ maxFileSize: 8 });
        const file = await root.openAt(
            { symlinkFollow: false }, 'big.txt',
            { create: true }, { read: true, write: true, mutateDirectory: true },
        );
        await expect(file.writeViaStream(readableFrom(enc.encode('123456789')), 0n))
            .rejects.toMatchObject({ tag: 'insufficient-space' });
    });

    test('maxTotalSize is enforced through the descriptor and persisted', async () => {
        const root = getMountRoot({ maxTotalSize: 12 });
        const a = await root.openAt(
            { symlinkFollow: false }, 'a.txt',
            { create: true }, { read: true, write: true, mutateDirectory: true },
        );
        await a.writeViaStream(readableFrom(enc.encode('0123456789')), 0n); // 10
        expect(readQuota(tempDir)).toBe(10);

        const b = await root.openAt(
            { symlinkFollow: false }, 'b.txt',
            { create: true }, { read: true, write: true, mutateDirectory: true },
        );
        await expect(b.writeViaStream(readableFrom(enc.encode('xyz')), 0n))
            .rejects.toMatchObject({ tag: 'insufficient-space' });
    });

    test('the quota file is not listed through the descriptor readDirectory', async () => {
        fs.writeFileSync(path.join(tempDir, 'keep.txt'), 'x');
        const root = getMountRoot({ maxTotalSize: 100 });
        const [stream, future] = root.readDirectory();
        const names: string[] = [];
        for await (const entry of stream) names.push(entry.name);
        await future;
        expect(names).toContain('keep.txt');
        expect(names).not.toContain(QUOTA_FILE);
    });

    test('statAt on the quota file returns a graceful access error code', async () => {
        const root = getMountRoot({ maxTotalSize: 100 });
        await expect(root.statAt({ symlinkFollow: true }, QUOTA_FILE))
            .rejects.toMatchObject({ tag: 'access' });
    });

    test('openAt on the quota file returns a graceful access error code', async () => {
        const root = getMountRoot({ maxTotalSize: 100 });
        await expect(root.openAt(
            { symlinkFollow: false }, QUOTA_FILE,
            {}, { read: true },
        )).rejects.toMatchObject({ tag: 'access' });
    });

    test('creating the quota file via openAt returns a graceful access error code', async () => {
        const root = getMountRoot({ maxTotalSize: 100 });
        await expect(root.openAt(
            { symlinkFollow: false }, QUOTA_FILE,
            { create: true }, { read: true, write: true, mutateDirectory: true },
        )).rejects.toMatchObject({ tag: 'access' });
    });

    test('unlinkFileAt on the quota file returns a graceful access error code', async () => {
        const root = getMountRoot({ maxTotalSize: 100 });
        await expect(root.unlinkFileAt(QUOTA_FILE))
            .rejects.toMatchObject({ tag: 'access' });
        expect(fs.existsSync(path.join(tempDir, QUOTA_FILE))).toBe(true);
    });

    test('metadataHashAt on the quota file returns a graceful access error code', async () => {
        const root = getMountRoot({ maxTotalSize: 100 });
        await expect(root.metadataHashAt({ symlinkFollow: true }, QUOTA_FILE))
            .rejects.toMatchObject({ tag: 'access' });
    });
});
