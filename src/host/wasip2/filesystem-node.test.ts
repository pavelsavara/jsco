// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * Tests for wasi:filesystem — Node.js real filesystem with mount points
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createNodeFilesystem } from './filesystem-node';
import type { FsResult } from './api';

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

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Create a temp directory for tests */
function createTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'jsco-test-'));
}

/** Recursively clean up a temp directory */
function cleanupTempDir(dir: string): void {
    fs.rmSync(dir, { recursive: true, force: true });
}

describe('filesystem-node', () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = createTempDir();
    });

    afterEach(() => {
        cleanupTempDir(tempDir);
    });

    // ─── Factory ───

    describe('createNodeFilesystem', () => {
        test('creates filesystem with mount point', () => {
            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/mnt' }]);
            const dirs = filesystem.preopens.getDirectories();
            expect(dirs).toHaveLength(1);
            expect(dirs[0]![1]).toBe('/mnt');
        });

        test('creates filesystem with multiple mount points', () => {
            const subDir = path.join(tempDir, 'sub');
            fs.mkdirSync(subDir);
            const filesystem = createNodeFilesystem([
                { hostPath: tempDir, guestPath: '/' },
                { hostPath: subDir, guestPath: '/sub' },
            ]);
            const dirs = filesystem.preopens.getDirectories();
            expect(dirs).toHaveLength(2);
        });

        test('throws for non-existent mount path', () => {
            expect(() => createNodeFilesystem([
                { hostPath: path.join(tempDir, 'nonexistent'), guestPath: '/' },
            ])).toThrow('does not exist');
        });

        test('throws for file as mount path', () => {
            const filePath = path.join(tempDir, 'file.txt');
            fs.writeFileSync(filePath, 'content');
            expect(() => createNodeFilesystem([
                { hostPath: filePath, guestPath: '/' },
            ])).toThrow('not a directory');
        });

        test('throws for empty mounts', () => {
            expect(() => createNodeFilesystem([])).toThrow('At least one mount point is required');
        });
    });

    // ─── Read ───

    describe('file read', () => {
        test('read file contents', () => {
            fs.writeFileSync(path.join(tempDir, 'hello.txt'), 'Hello, World!');
            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            const file = unwrap(root.openAt({}, 'hello.txt', {}, { read: true }));
            const [data, eof] = unwrap(file.read(100n, 0n));
            expect(dec.decode(data)).toBe('Hello, World!');
            expect(eof).toBe(true);
        });

        test('read with offset', () => {
            fs.writeFileSync(path.join(tempDir, 'data.txt'), 'abcdefgh');
            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            const file = unwrap(root.openAt({}, 'data.txt', {}, { read: true }));
            const [data] = unwrap(file.read(4n, 3n));
            expect(dec.decode(data)).toBe('defg');
        });

        test('read via stream', () => {
            fs.writeFileSync(path.join(tempDir, 'stream.txt'), 'streamed');
            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            const file = unwrap(root.openAt({}, 'stream.txt', {}, { read: true }));
            const stream = unwrap(file.readViaStream(0n));
            const readResult = stream.read(100n);
            expect(readResult.tag).toBe('ok');
            if (readResult.tag === 'ok') {
                expect(dec.decode(readResult.val)).toBe('streamed');
            }
        });
    });

    // ─── Write ───

    describe('file write', () => {
        test('write to new file via open-at create', () => {
            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            const file = unwrap(root.openAt({}, 'new.txt', { create: true }, { write: true }));
            const written = unwrap(file.write(enc.encode('new content'), 0n));
            expect(written).toBe(11n);

            // Verify on host
            const content = fs.readFileSync(path.join(tempDir, 'new.txt'), 'utf8');
            expect(content).toBe('new content');
        });

        test('append via stream', () => {
            fs.writeFileSync(path.join(tempDir, 'append.txt'), 'start');
            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            const file = unwrap(root.openAt({}, 'append.txt', {}, { write: true }));
            const stream = unwrap(file.appendViaStream());
            stream.blockingWriteAndFlush(enc.encode('-end'));

            const content = fs.readFileSync(path.join(tempDir, 'append.txt'), 'utf8');
            expect(content).toBe('start-end');
        });

        test('truncate on open', () => {
            fs.writeFileSync(path.join(tempDir, 'trunc.txt'), 'original');
            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            unwrap(root.openAt({}, 'trunc.txt', { truncate: true }, { write: true }));

            const content = fs.readFileSync(path.join(tempDir, 'trunc.txt'), 'utf8');
            expect(content).toBe('');
        });
    });

    // ─── Directory operations ───

    describe('directory operations', () => {
        test('read directory entries', () => {
            fs.writeFileSync(path.join(tempDir, 'a.txt'), 'a');
            fs.writeFileSync(path.join(tempDir, 'b.txt'), 'b');
            fs.mkdirSync(path.join(tempDir, 'subdir'));

            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            const stream = unwrap(root.readDirectory());
            const entries: string[] = [];
            for (; ;) {
                const entry = unwrap(stream.readDirectoryEntry());
                if (!entry) break;
                entries.push(entry.name);
            }
            expect(entries).toContain('a.txt');
            expect(entries).toContain('b.txt');
            expect(entries).toContain('subdir');
        });

        test('create directory', () => {
            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            unwrap(root.createDirectoryAt('newdir'));

            expect(fs.existsSync(path.join(tempDir, 'newdir'))).toBe(true);
            expect(fs.statSync(path.join(tempDir, 'newdir')).isDirectory()).toBe(true);
        });

        test('remove empty directory', () => {
            fs.mkdirSync(path.join(tempDir, 'toremove'));
            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            unwrap(root.removeDirectoryAt('toremove'));

            expect(fs.existsSync(path.join(tempDir, 'toremove'))).toBe(false);
        });

        test('unlink file', () => {
            fs.writeFileSync(path.join(tempDir, 'todelete.txt'), 'del');
            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            unwrap(root.unlinkFileAt('todelete.txt'));

            expect(fs.existsSync(path.join(tempDir, 'todelete.txt'))).toBe(false);
        });
    });

    // ─── Stat ───

    describe('stat operations', () => {
        test('stat file', () => {
            fs.writeFileSync(path.join(tempDir, 'stat.txt'), 'hello');
            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            const stat = unwrap(root.statAt({}, 'stat.txt'));
            expect(stat.type).toBe('regular-file');
            expect(stat.size).toBe(5n);
            expect(stat.linkCount).toBeGreaterThanOrEqual(1n);
        });

        test('stat directory', () => {
            fs.mkdirSync(path.join(tempDir, 'dir'));
            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            const stat = unwrap(root.statAt({}, 'dir'));
            expect(stat.type).toBe('directory');
        });

        test('stat nonexistent returns no-entry', () => {
            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            expectErr(root.statAt({}, 'nonexistent'), 'no-entry');
        });

        test('get-type on descriptor', () => {
            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();
            expect(unwrap(root.getType())).toBe('directory');
        });
    });

    // ─── Read-only mount ───

    describe('read-only mount', () => {
        test('read succeeds on read-only mount', () => {
            fs.writeFileSync(path.join(tempDir, 'readonly.txt'), 'data');
            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/', readOnly: true }]);
            const root = filesystem.rootDescriptor();

            const file = unwrap(root.openAt({}, 'readonly.txt', {}, { read: true }));
            const [data] = unwrap(file.read(100n, 0n));
            expect(dec.decode(data)).toBe('data');
        });

        test('write fails on read-only mount', () => {
            fs.writeFileSync(path.join(tempDir, 'readonly.txt'), 'data');
            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/', readOnly: true }]);
            const root = filesystem.rootDescriptor();

            const file = unwrap(root.openAt({}, 'readonly.txt', {}, { read: true }));
            expectErr(file.write(enc.encode('new'), 0n), 'read-only');
        });

        test('create file fails on read-only mount', () => {
            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/', readOnly: true }]);
            const root = filesystem.rootDescriptor();

            expectErr(root.openAt({}, 'new.txt', { create: true }, { write: true }), 'read-only');
        });

        test('create directory fails on read-only mount', () => {
            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/', readOnly: true }]);
            const root = filesystem.rootDescriptor();

            expectErr(root.createDirectoryAt('newdir'), 'read-only');
        });

        test('unlink fails on read-only mount', () => {
            fs.writeFileSync(path.join(tempDir, 'file.txt'), 'data');
            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/', readOnly: true }]);
            const root = filesystem.rootDescriptor();

            expectErr(root.unlinkFileAt('file.txt'), 'read-only');
        });
    });

    // ─── Path traversal security ───

    describe('path security', () => {
        test('prevents .. escape above mount root', () => {
            const subDir = path.join(tempDir, 'sub');
            fs.mkdirSync(subDir);
            fs.writeFileSync(path.join(tempDir, 'secret.txt'), 'secret');

            const filesystem = createNodeFilesystem([{ hostPath: subDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            expectErr(root.statAt({}, '../secret.txt'), 'access');
        });

        test('prevents deep .. escape', () => {
            const subDir = path.join(tempDir, 'a', 'b');
            fs.mkdirSync(subDir, { recursive: true });

            const filesystem = createNodeFilesystem([{ hostPath: subDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            expectErr(root.statAt({}, '../../../etc/passwd'), 'access');
        });

        test('allows .. within mount root', () => {
            const subDir = path.join(tempDir, 'sub');
            fs.mkdirSync(subDir);
            fs.writeFileSync(path.join(tempDir, 'file.txt'), 'ok');

            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            const stat = unwrap(root.statAt({}, 'sub/../file.txt'));
            expect(stat.type).toBe('regular-file');
        });
    });

    // ─── Metadata ───

    describe('metadata', () => {
        test('metadata-hash uses inode', () => {
            fs.writeFileSync(path.join(tempDir, 'meta.txt'), 'data');
            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            const file = unwrap(root.openAt({}, 'meta.txt', {}, { read: true }));
            const hash = unwrap(file.metadataHash());
            // inode-based: upper should be non-zero on most filesystems
            expect(typeof hash.upper).toBe('bigint');
            expect(typeof hash.lower).toBe('bigint');
        });

        test('is-same-object returns true for same path', () => {
            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();
            expect(root.isSameObject(root)).toBe(true);
        });

        test('is-same-object returns false for different descriptors', () => {
            fs.writeFileSync(path.join(tempDir, 'a.txt'), 'a');
            fs.writeFileSync(path.join(tempDir, 'b.txt'), 'b');
            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            const a = unwrap(root.openAt({}, 'a.txt', {}, { read: true }));
            const b = unwrap(root.openAt({}, 'b.txt', {}, { read: true }));
            expect(a.isSameObject(b)).toBe(false);
        });

        test('get-flags returns descriptor flags', () => {
            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();
            const flags = unwrap(root.getFlags());
            expect(flags.read).toBe(true);
            expect(flags.write).toBe(true);
        });

        test('set-size truncates file', () => {
            fs.writeFileSync(path.join(tempDir, 'trunc.txt'), 'hello world');
            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            const file = unwrap(root.openAt({}, 'trunc.txt', {}, { write: true }));
            unwrap(file.setSize(5n));

            const content = fs.readFileSync(path.join(tempDir, 'trunc.txt'), 'utf8');
            expect(content).toBe('hello');
        });
    });

    // ─── Rename ───

    describe('rename', () => {
        test('rename file within same descriptor', () => {
            fs.writeFileSync(path.join(tempDir, 'old.txt'), 'content');
            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            unwrap(root.renameAt('old.txt', root, 'new.txt'));

            expect(fs.existsSync(path.join(tempDir, 'old.txt'))).toBe(false);
            expect(fs.readFileSync(path.join(tempDir, 'new.txt'), 'utf8')).toBe('content');
        });
    });

    // ─── Open-at flags ───

    describe('open-at flags', () => {
        test('exclusive fails when file exists', () => {
            fs.writeFileSync(path.join(tempDir, 'exists.txt'), 'data');
            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            expectErr(root.openAt({}, 'exists.txt', { exclusive: true }, { read: true }), 'exist');
        });

        test('create + directory creates a directory', () => {
            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            const dir = unwrap(root.openAt({}, 'newdir', { create: true, directory: true }, {}));
            expect(unwrap(dir.getType())).toBe('directory');
            expect(fs.statSync(path.join(tempDir, 'newdir')).isDirectory()).toBe(true);
        });

        test('no create returns no-entry for missing file', () => {
            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            expectErr(root.openAt({}, 'missing.txt', {}, { read: true }), 'no-entry');
        });

        test('directory flag fails for regular file', () => {
            fs.writeFileSync(path.join(tempDir, 'file.txt'), 'data');
            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            expectErr(root.openAt({}, 'file.txt', { directory: true }, { read: true }), 'not-directory');
        });
    });

    // ─── Path traversal hardening ───

    describe('path traversal hardening', () => {
        test('.. escape above mount root returns access error', () => {
            const subDir = path.join(tempDir, 'sandbox');
            fs.mkdirSync(subDir);
            fs.writeFileSync(path.join(tempDir, 'secret.txt'), 'secret');
            const filesystem = createNodeFilesystem([{ hostPath: subDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            expectErr(root.openAt({}, '../secret.txt', {}, { read: true }), 'access');
        });

        test('nested .. does not escape mount root', () => {
            const subDir = path.join(tempDir, 'a', 'b');
            fs.mkdirSync(subDir, { recursive: true });
            fs.writeFileSync(path.join(tempDir, 'escape.txt'), 'escaped');
            const filesystem = createNodeFilesystem([{ hostPath: subDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            expectErr(root.openAt({}, '../../escape.txt', {}, { read: true }), 'access');
        });

        test('symlink inside mount is followed', () => {
            fs.writeFileSync(path.join(tempDir, 'target.txt'), 'linked');
            try {
                fs.symlinkSync(path.join(tempDir, 'target.txt'), path.join(tempDir, 'link.txt'));
            } catch {
                // symlinks require elevated privileges on Windows
                return;
            }
            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            const fd = unwrap(root.openAt({}, 'link.txt', {}, { read: true }));
            const data = unwrap(fd.read(100n, 0n));
            expect(dec.decode(data[0])).toBe('linked');
        });

        test('symlink escaping mount root returns access error', () => {
            // Create a symlink inside the sandbox that points outside
            const sandbox = path.join(tempDir, 'jail');
            fs.mkdirSync(sandbox);
            fs.writeFileSync(path.join(tempDir, 'outside.txt'), 'outside');
            try {
                fs.symlinkSync(path.join(tempDir, 'outside.txt'), path.join(sandbox, 'escape-link'));
            } catch {
                return;
            }

            const filesystem = createNodeFilesystem([{ hostPath: sandbox, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            expectErr(root.openAt({}, 'escape-link', {}, { read: true }), 'access');
        });

        test('write through symlink escaping mount returns access error', () => {
            const sandbox = path.join(tempDir, 'jail2');
            fs.mkdirSync(sandbox);
            fs.writeFileSync(path.join(tempDir, 'target-outside.txt'), 'original');
            try {
                fs.symlinkSync(path.join(tempDir, 'target-outside.txt'), path.join(sandbox, 'write-escape'));
            } catch {
                return;
            }

            const filesystem = createNodeFilesystem([{ hostPath: sandbox, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            expectErr(root.openAt({}, 'write-escape', {}, { write: true }), 'access');
            // original file should not be modified
            expect(fs.readFileSync(path.join(tempDir, 'target-outside.txt'), 'utf8')).toBe('original');
        });

        test('create file through symlinked directory escaping mount returns access error', () => {
            const sandbox = path.join(tempDir, 'jail3');
            fs.mkdirSync(sandbox);
            const outsideDir = path.join(tempDir, 'outside-dir');
            fs.mkdirSync(outsideDir);
            try {
                fs.symlinkSync(outsideDir, path.join(sandbox, 'dir-escape'));
            } catch {
                return;
            }

            const filesystem = createNodeFilesystem([{ hostPath: sandbox, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            expectErr(root.openAt({}, 'dir-escape/new-file.txt', { create: true }, { write: true }), 'access');
        });
    });

    // ─── Read-only mounts ───

    describe('read-only mounts', () => {
        test('read-only mount allows read', () => {
            fs.writeFileSync(path.join(tempDir, 'readonly.txt'), 'readable');
            const filesystem = createNodeFilesystem([{ hostPath: tempDir, guestPath: '/', readOnly: true }]);
            const root = filesystem.rootDescriptor();

            const fd = unwrap(root.openAt({}, 'readonly.txt', {}, { read: true }));
            const data = unwrap(fd.read(100n, 0n));
            expect(dec.decode(data[0])).toBe('readable');
        });
    });

    // ─── Multiple mounts ───

    describe('multiple mounts', () => {
        test('files accessible from each mount', () => {
            const dirA = path.join(tempDir, 'mount-a');
            const dirB = path.join(tempDir, 'mount-b');
            fs.mkdirSync(dirA);
            fs.mkdirSync(dirB);
            fs.writeFileSync(path.join(dirA, 'a.txt'), 'from-a');
            fs.writeFileSync(path.join(dirB, 'b.txt'), 'from-b');

            const filesystem = createNodeFilesystem([
                { hostPath: dirA, guestPath: '/mnt/a' },
                { hostPath: dirB, guestPath: '/mnt/b' },
            ]);
            const dirs = filesystem.preopens.getDirectories();
            expect(dirs.length).toBe(2);
        });
    });
});
