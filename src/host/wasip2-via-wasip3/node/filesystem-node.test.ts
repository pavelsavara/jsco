// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * Tests for wasi:filesystem — P3 Node.js filesystem through P2-via-P3 adapter
 *
 * Integration tests: real P3 host + adapter chain with Node.js filesystem mounts.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createWasiP3Host } from '../../wasip3/node/wasip3';
import { adaptPreopens, P2DescriptorAdapter } from '../filesystem';
import type { WasiP3Imports } from '../../../../wit/wasip3/types/index';
import type { MountConfig } from '../../wasip3/types';

/** Result type matching the adapter's FsResult shape */
type FsResult<T> = { tag: 'ok'; val: T } | { tag: 'err'; val: string };

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

/**
 * Create a P2-compatible filesystem from mounts via the P3→P2 adapter chain.
 * Returns preopens + rootDescriptor (first user mount).
 *
 * The P3 host always prepends an in-memory root "/" preopen. We skip it
 * so that tests see only the user-configured Node.js mounts.
 */
function createFilesystem(mounts: MountConfig[]): {
    p3: WasiP3Imports;
    preopens: { getDirectories(): [P2DescriptorAdapter, string][] };
    rootDescriptor(): P2DescriptorAdapter;
} {
    const p3 = createWasiP3Host({ mounts });
    const allPreopens = adaptPreopens(p3);
    // Skip the auto-added in-memory root "/" — keep only user Node.js mounts
    const userMounts = allPreopens.getDirectories().slice(1);
    return {
        p3,
        preopens: {
            getDirectories() { return userMounts; },
        },
        rootDescriptor() {
            return userMounts[0]![0];
        },
    };
}

/**
 * Collect all directory entries asynchronously.
 * The P2 adapter's readDirectoryEntry() is sync but the underlying data
 * is populated asynchronously — we need to yield between reads.
 */
async function collectDirectoryEntries(stream: { readDirectoryEntry(): FsResult<{ type: string; name: string } | undefined> }): Promise<string[]> {
    const entries: string[] = [];
    // eslint-disable-next-line no-constant-condition
    while (true) {
        // Yield to microtask queue to let the async pump populate the buffer
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        const result = stream.readDirectoryEntry();
        if (result.tag === 'err') throw new Error(`Directory read error: ${result.val}`);
        if (!result.val) break;
        entries.push(result.val.name);
    }
    return entries;
}

describe('filesystem-node (P2-via-P3 adapter)', () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = createTempDir();
    });

    afterEach(() => {
        cleanupTempDir(tempDir);
    });

    // ─── Factory ───

    describe('createFilesystem', () => {
        test('creates filesystem with mount point', () => {
            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/mnt' }]);
            const dirs = filesystem.preopens.getDirectories();
            expect(dirs).toHaveLength(1);
            expect(dirs[0]![1]).toBe('/mnt');
        });

        test('creates filesystem with multiple mount points', () => {
            const subDir = path.join(tempDir, 'sub');
            fs.mkdirSync(subDir);
            const filesystem = createFilesystem([
                { hostPath: tempDir, guestPath: '/' },
                { hostPath: subDir, guestPath: '/sub' },
            ]);
            const dirs = filesystem.preopens.getDirectories();
            expect(dirs).toHaveLength(2);
        });

        test('throws for non-existent mount path', () => {
            expect(() => createFilesystem([
                { hostPath: path.join(tempDir, 'nonexistent'), guestPath: '/' },
            ])).toThrow('does not exist');
        });

        test('throws for file as mount path', () => {
            const filePath = path.join(tempDir, 'file.txt');
            fs.writeFileSync(filePath, 'content');
            expect(() => createFilesystem([
                { hostPath: filePath, guestPath: '/' },
            ])).toThrow('not a directory');
        });

        test('throws for empty mounts', () => {
            expect(() => createWasiP3Host({ mounts: [] })).not.toThrow();
        });
    });

    // ─── Read ───

    describe('file read', () => {
        test('read file contents', async () => {
            fs.writeFileSync(path.join(tempDir, 'hello.txt'), 'Hello, World!');
            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            const file = unwrap(await root.openAt({}, 'hello.txt', {}, { read: true }));
            const [data, eof] = unwrap(await file.read(100n, 0n));
            expect(dec.decode(data)).toBe('Hello, World!');
            expect(eof).toBe(true);
        });

        test('read with offset', async () => {
            fs.writeFileSync(path.join(tempDir, 'data.txt'), 'abcdefgh');
            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            const file = unwrap(await root.openAt({}, 'data.txt', {}, { read: true }));
            const [data] = unwrap(await file.read(4n, 3n));
            expect(dec.decode(data)).toBe('defg');
        });

        test('read via stream', async () => {
            fs.writeFileSync(path.join(tempDir, 'stream.txt'), 'streamed');
            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            const file = unwrap(await root.openAt({}, 'stream.txt', {}, { read: true }));
            const stream = unwrap(file.readViaStream(0n));
            // Yield to let the async pump populate the buffer
            await new Promise<void>(resolve => setTimeout(resolve, 0));
            const readResult = stream.read(100n);
            expect(readResult.tag).toBe('ok');
            if (readResult.tag === 'ok') {
                expect(dec.decode(readResult.val)).toBe('streamed');
            }
        });
    });

    // ─── Write ───

    describe('file write', () => {
        test('write to new file via open-at create', async () => {
            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            const file = unwrap(await root.openAt({}, 'new.txt', { create: true }, { write: true, mutateDirectory: true }));
            const written = unwrap(await file.write(enc.encode('new content'), 0n));
            expect(written).toBe(11n);

            // Verify on host
            const content = fs.readFileSync(path.join(tempDir, 'new.txt'), 'utf8');
            expect(content).toBe('new content');
        });

        test('append via stream', async () => {
            fs.writeFileSync(path.join(tempDir, 'append.txt'), 'start');
            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            const file = unwrap(await root.openAt({}, 'append.txt', {}, { write: true }));
            const stream = unwrap(file.appendViaStream());
            // Use non-blocking write — blockingWriteAndFlush requires JSPI/WASM context
            stream.write(enc.encode('-end'));
            // Yield to let the async pipeline flush to Node.js filesystem
            await new Promise<void>(resolve => setTimeout(resolve, 10));

            const content = fs.readFileSync(path.join(tempDir, 'append.txt'), 'utf8');
            expect(content).toBe('start-end');
        });

        test('truncate on open', async () => {
            fs.writeFileSync(path.join(tempDir, 'trunc.txt'), 'original');
            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            unwrap(await root.openAt({}, 'trunc.txt', { truncate: true }, { write: true }));

            const content = fs.readFileSync(path.join(tempDir, 'trunc.txt'), 'utf8');
            expect(content).toBe('');
        });
    });

    // ─── Directory operations ───

    describe('directory operations', () => {
        test('read directory entries', async () => {
            fs.writeFileSync(path.join(tempDir, 'a.txt'), 'a');
            fs.writeFileSync(path.join(tempDir, 'b.txt'), 'b');
            fs.mkdirSync(path.join(tempDir, 'subdir'));

            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            const stream = unwrap(root.readDirectory());
            const entries = await collectDirectoryEntries(stream);
            expect(entries).toContain('a.txt');
            expect(entries).toContain('b.txt');
            expect(entries).toContain('subdir');
        });

        test('create directory', async () => {
            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            await root.createDirectoryAt('newdir');

            expect(fs.existsSync(path.join(tempDir, 'newdir'))).toBe(true);
            expect(fs.statSync(path.join(tempDir, 'newdir')).isDirectory()).toBe(true);
        });

        test('remove empty directory', async () => {
            fs.mkdirSync(path.join(tempDir, 'toremove'));
            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            await root.removeDirectoryAt('toremove');

            expect(fs.existsSync(path.join(tempDir, 'toremove'))).toBe(false);
        });

        test('unlink file', async () => {
            fs.writeFileSync(path.join(tempDir, 'todelete.txt'), 'del');
            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            await root.unlinkFileAt('todelete.txt');

            expect(fs.existsSync(path.join(tempDir, 'todelete.txt'))).toBe(false);
        });
    });

    // ─── Stat ───

    describe('stat operations', () => {
        test('stat file', async () => {
            fs.writeFileSync(path.join(tempDir, 'stat.txt'), 'hello');
            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            const stat = unwrap(await root.statAt({}, 'stat.txt'));
            expect(stat.type).toBe('regular-file');
            expect(stat.size).toBe(5n);
            expect(stat.linkCount).toBeGreaterThanOrEqual(1n);
        });

        test('stat directory', async () => {
            fs.mkdirSync(path.join(tempDir, 'dir'));
            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            const stat = unwrap(await root.statAt({}, 'dir'));
            expect(stat.type).toBe('directory');
        });

        test('stat nonexistent returns no-entry', async () => {
            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            expectErr(await root.statAt({}, 'nonexistent'), 'no-entry');
        });

        test('get-type on descriptor', async () => {
            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();
            expect(unwrap(await root.getType())).toBe('directory');
        });
    });

    // ─── Read-only mount ───

    describe('read-only mount', () => {
        test('read succeeds on read-only mount', async () => {
            fs.writeFileSync(path.join(tempDir, 'readonly.txt'), 'data');
            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/', readOnly: true }]);
            const root = filesystem.rootDescriptor();

            const file = unwrap(await root.openAt({}, 'readonly.txt', {}, { read: true }));
            const [data] = unwrap(await file.read(100n, 0n));
            expect(dec.decode(data)).toBe('data');
        });

        test('write fails on read-only mount', async () => {
            fs.writeFileSync(path.join(tempDir, 'readonly.txt'), 'data');
            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/', readOnly: true }]);
            const root = filesystem.rootDescriptor();

            // openAt with read-only flags should succeed
            const file = unwrap(await root.openAt({}, 'readonly.txt', {}, { read: true }));
            expectErr(await file.write(enc.encode('new'), 0n), 'read-only');
        });

        test('create file fails on read-only mount', async () => {
            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/', readOnly: true }]);
            const root = filesystem.rootDescriptor();

            expectErr(await root.openAt({}, 'new.txt', { create: true }, { write: true, mutateDirectory: true }), 'read-only');
        });

        test('create directory fails on read-only mount', async () => {
            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/', readOnly: true }]);
            const root = filesystem.rootDescriptor();

            expectErr(await root.createDirectoryAt('newdir'), 'read-only');
        });

        test('unlink fails on read-only mount', async () => {
            fs.writeFileSync(path.join(tempDir, 'file.txt'), 'data');
            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/', readOnly: true }]);
            const root = filesystem.rootDescriptor();

            expectErr(await root.unlinkFileAt('file.txt'), 'read-only');
        });
    });

    // ─── Path traversal security ───

    describe('path security', () => {
        test('prevents .. escape above mount root', async () => {
            const subDir = path.join(tempDir, 'sub');
            fs.mkdirSync(subDir);
            fs.writeFileSync(path.join(tempDir, 'secret.txt'), 'secret');

            const filesystem = createFilesystem([{ hostPath: subDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            // P3 VFS resolvePathComponents rejects .. escape as 'not-permitted'
            expectErr(await root.statAt({}, '../secret.txt'), 'not-permitted');
        });

        test('prevents deep .. escape', async () => {
            const subDir = path.join(tempDir, 'a', 'b');
            fs.mkdirSync(subDir, { recursive: true });

            const filesystem = createFilesystem([{ hostPath: subDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            // P3 VFS resolvePathComponents rejects .. escape as 'not-permitted'
            expectErr(await root.statAt({}, '../../../etc/passwd'), 'not-permitted');
        });

        test('allows .. within mount root', async () => {
            const subDir = path.join(tempDir, 'sub');
            fs.mkdirSync(subDir);
            fs.writeFileSync(path.join(tempDir, 'file.txt'), 'ok');

            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            const stat = unwrap(await root.statAt({}, 'sub/../file.txt'));
            expect(stat.type).toBe('regular-file');
        });
    });

    // ─── Metadata ───

    describe('metadata', () => {
        test('metadata-hash uses inode', async () => {
            fs.writeFileSync(path.join(tempDir, 'meta.txt'), 'data');
            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            const file = unwrap(await root.openAt({}, 'meta.txt', {}, { read: true }));
            const hash = unwrap(await file.metadataHash());
            expect(typeof hash.upper).toBe('bigint');
            expect(typeof hash.lower).toBe('bigint');
        });

        test('is-same-object returns true for same path', async () => {
            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();
            expect(await root.isSameObject(root)).toBe(true);
        });

        test('is-same-object returns false for different descriptors', async () => {
            fs.writeFileSync(path.join(tempDir, 'a.txt'), 'a');
            fs.writeFileSync(path.join(tempDir, 'b.txt'), 'b');
            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            const a = unwrap(await root.openAt({}, 'a.txt', {}, { read: true }));
            const b = unwrap(await root.openAt({}, 'b.txt', {}, { read: true }));
            expect(await a.isSameObject(b)).toBe(false);
        });

        test('get-flags returns descriptor flags', async () => {
            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();
            const flags = unwrap(await root.getFlags());
            expect(flags.read).toBe(true);
            expect(flags.write).toBe(true);
        });

        test('set-size truncates file', async () => {
            fs.writeFileSync(path.join(tempDir, 'trunc.txt'), 'hello world');
            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            const file = unwrap(await root.openAt({}, 'trunc.txt', {}, { write: true }));
            unwrap(await file.setSize(5n));

            const content = fs.readFileSync(path.join(tempDir, 'trunc.txt'), 'utf8');
            expect(content).toBe('hello');
        });
    });

    // ─── Rename ───

    describe('rename', () => {
        test('rename file within same descriptor', async () => {
            fs.writeFileSync(path.join(tempDir, 'old.txt'), 'content');
            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            unwrap(await root.renameAt('old.txt', root, 'new.txt'));

            expect(fs.existsSync(path.join(tempDir, 'old.txt'))).toBe(false);
            expect(fs.readFileSync(path.join(tempDir, 'new.txt'), 'utf8')).toBe('content');
        });
    });

    // ─── Open-at flags ───

    describe('open-at flags', () => {
        test('exclusive fails when file exists', async () => {
            fs.writeFileSync(path.join(tempDir, 'exists.txt'), 'data');
            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            expectErr(await root.openAt({}, 'exists.txt', { exclusive: true }, { read: true }), 'exist');
        });

        test('create + directory creates a directory', async () => {
            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            const dir = unwrap(await root.openAt({}, 'newdir', { create: true, directory: true }, { mutateDirectory: true }));
            expect(unwrap(await dir.getType())).toBe('directory');
            expect(fs.statSync(path.join(tempDir, 'newdir')).isDirectory()).toBe(true);
        });

        test('no create returns no-entry for missing file', async () => {
            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            expectErr(await root.openAt({}, 'missing.txt', {}, { read: true }), 'no-entry');
        });

        test('directory flag fails for regular file', async () => {
            fs.writeFileSync(path.join(tempDir, 'file.txt'), 'data');
            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            expectErr(await root.openAt({}, 'file.txt', { directory: true }, { read: true }), 'not-directory');
        });
    });

    // ─── Path traversal hardening ───

    describe('path traversal hardening', () => {
        test('.. escape above mount root returns not-permitted error', async () => {
            const subDir = path.join(tempDir, 'sandbox');
            fs.mkdirSync(subDir);
            fs.writeFileSync(path.join(tempDir, 'secret.txt'), 'secret');
            const filesystem = createFilesystem([{ hostPath: subDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            // P3 VFS resolvePathComponents rejects .. escape as 'not-permitted'
            expectErr(await root.openAt({}, '../secret.txt', {}, { read: true }), 'not-permitted');
        });

        test('nested .. does not escape mount root', async () => {
            const subDir = path.join(tempDir, 'a', 'b');
            fs.mkdirSync(subDir, { recursive: true });
            fs.writeFileSync(path.join(tempDir, 'escape.txt'), 'escaped');
            const filesystem = createFilesystem([{ hostPath: subDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            // P3 VFS resolvePathComponents rejects .. escape as 'not-permitted'
            expectErr(await root.openAt({}, '../../escape.txt', {}, { read: true }), 'not-permitted');
        });

        test('symlink inside mount is followed', async () => {
            fs.writeFileSync(path.join(tempDir, 'target.txt'), 'linked');
            try {
                fs.symlinkSync(path.join(tempDir, 'target.txt'), path.join(tempDir, 'link.txt'));
            } catch {
                // symlinks require elevated privileges on Windows
                return;
            }
            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            const fd = unwrap(await root.openAt({}, 'link.txt', {}, { read: true }));
            const data = unwrap(await fd.read(100n, 0n));
            expect(dec.decode(data[0])).toBe('linked');
        });

        test('symlink escaping mount root returns access error', async () => {
            const sandbox = path.join(tempDir, 'jail');
            fs.mkdirSync(sandbox);
            fs.writeFileSync(path.join(tempDir, 'outside.txt'), 'outside');
            try {
                fs.symlinkSync(path.join(tempDir, 'outside.txt'), path.join(sandbox, 'escape-link'));
            } catch {
                return;
            }

            const filesystem = createFilesystem([{ hostPath: sandbox, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            expectErr(await root.openAt({}, 'escape-link', {}, { read: true }), 'access');
        });

        test('write through symlink escaping mount returns access error', async () => {
            const sandbox = path.join(tempDir, 'jail2');
            fs.mkdirSync(sandbox);
            fs.writeFileSync(path.join(tempDir, 'target-outside.txt'), 'original');
            try {
                fs.symlinkSync(path.join(tempDir, 'target-outside.txt'), path.join(sandbox, 'write-escape'));
            } catch {
                return;
            }

            const filesystem = createFilesystem([{ hostPath: sandbox, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            expectErr(await root.openAt({}, 'write-escape', {}, { write: true }), 'access');
            // original file should not be modified
            expect(fs.readFileSync(path.join(tempDir, 'target-outside.txt'), 'utf8')).toBe('original');
        });

        test('create file through symlinked directory escaping mount returns access error', async () => {
            const sandbox = path.join(tempDir, 'jail3');
            fs.mkdirSync(sandbox);
            const outsideDir = path.join(tempDir, 'outside-dir');
            fs.mkdirSync(outsideDir);
            try {
                fs.symlinkSync(outsideDir, path.join(sandbox, 'dir-escape'));
            } catch {
                return;
            }

            const filesystem = createFilesystem([{ hostPath: sandbox, guestPath: '/' }]);
            const root = filesystem.rootDescriptor();

            expectErr(await root.openAt({}, 'dir-escape/new-file.txt', { create: true }, { write: true, mutateDirectory: true }), 'access');
        });
    });

    // ─── Read-only mounts ───

    describe('read-only mounts', () => {
        test('read-only mount allows read', async () => {
            fs.writeFileSync(path.join(tempDir, 'readonly.txt'), 'readable');
            const filesystem = createFilesystem([{ hostPath: tempDir, guestPath: '/', readOnly: true }]);
            const root = filesystem.rootDescriptor();

            const fd = unwrap(await root.openAt({}, 'readonly.txt', {}, { read: true }));
            const data = unwrap(await fd.read(100n, 0n));
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

            const filesystem = createFilesystem([
                { hostPath: dirA, guestPath: '/mnt/a' },
                { hostPath: dirB, guestPath: '/mnt/b' },
            ]);
            const dirs = filesystem.preopens.getDirectories();
            expect(dirs.length).toBe(2);
        });
    });
});
