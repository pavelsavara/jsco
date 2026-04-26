// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import {
    MemoryVfsBackend,
    VfsError,
    VfsNodeType,
    resolvePathComponents,
} from '../../../src/host/wasip3/vfs';

describe('resolvePathComponents', () => {
    test('resolves simple relative path', () => {
        expect(resolvePathComponents([], 'a/b/c')).toEqual(['a', 'b', 'c']);
    });

    test('resolves with base path', () => {
        expect(resolvePathComponents(['root', 'dir'], 'file.txt')).toEqual(['root', 'dir', 'file.txt']);
    });

    test('normalizes . segments', () => {
        expect(resolvePathComponents([], './a/./b/.')).toEqual(['a', 'b']);
    });

    test('resolves .. within bounds', () => {
        expect(resolvePathComponents(['a', 'b'], '../c')).toEqual(['a', 'c']);
    });

    test('throws on .. escape above root', () => {
        expect(() => resolvePathComponents([], '..')).toThrow(VfsError);
        expect(() => resolvePathComponents([], '../escape')).toThrow(VfsError);
    });

    test('throws on deep .. escape', () => {
        expect(() => resolvePathComponents(['a'], '../../escape')).toThrow(VfsError);
    });

    test('handles empty segments from double slashes', () => {
        expect(resolvePathComponents([], 'a//b')).toEqual(['a', 'b']);
    });
});

describe('MemoryVfsBackend', () => {
    let vfs: MemoryVfsBackend;

    beforeEach(() => {
        vfs = new MemoryVfsBackend();
    });

    describe('populateFromMap', () => {
        test('creates files and intermediate directories', () => {
            vfs.populateFromMap(new Map([
                ['/a/b/file.txt', 'hello'],
                ['/a/other.txt', new Uint8Array([1, 2, 3])],
            ]));

            const root = vfs.stat([]);
            expect(root.type).toBe(VfsNodeType.Directory);

            const file = vfs.stat(['a', 'b', 'file.txt']);
            expect(file.type).toBe(VfsNodeType.File);
            expect(file.size).toBe(5n);

            const other = vfs.stat(['a', 'other.txt']);
            expect(other.type).toBe(VfsNodeType.File);
            expect(other.size).toBe(3n);
        });

        test('handles string content as UTF-8', () => {
            vfs.populateFromMap(new Map([
                ['test.txt', 'hello world'],
            ]));
            const data = vfs.read(['test.txt'], 0n, 1000);
            expect(new TextDecoder().decode(data)).toBe('hello world');
        });
    });

    describe('stat', () => {
        test('root directory', () => {
            const s = vfs.stat([]);
            expect(s.type).toBe(VfsNodeType.Directory);
            expect(s.linkCount).toBe(1n);
        });

        test('file has correct size', () => {
            vfs.populateFromMap(new Map([['f.txt', 'abc']]));
            const s = vfs.stat(['f.txt']);
            expect(s.type).toBe(VfsNodeType.File);
            expect(s.size).toBe(3n);
        });

        test('throws no-entry for missing path', () => {
            expect(() => vfs.stat(['missing'])).toThrow(VfsError);
            try { vfs.stat(['missing']); } catch (e) { expect((e as VfsError).code).toBe('no-entry'); }
        });

        test('throws not-directory for path through file', () => {
            vfs.populateFromMap(new Map([['f.txt', 'data']]));
            expect(() => vfs.stat(['f.txt', 'child'])).toThrow(VfsError);
            try { vfs.stat(['f.txt', 'child']); } catch (e) { expect((e as VfsError).code).toBe('not-directory'); }
        });
    });

    describe('read', () => {
        test('reads full file content', () => {
            vfs.populateFromMap(new Map([['f.txt', 'hello']]));
            const data = vfs.read(['f.txt'], 0n, 100);
            expect(new TextDecoder().decode(data)).toBe('hello');
        });

        test('reads with offset', () => {
            vfs.populateFromMap(new Map([['f.txt', 'hello world']]));
            const data = vfs.read(['f.txt'], 6n, 100);
            expect(new TextDecoder().decode(data)).toBe('world');
        });

        test('returns empty for offset beyond file size', () => {
            vfs.populateFromMap(new Map([['f.txt', 'hi']]));
            const data = vfs.read(['f.txt'], 100n, 100);
            expect(data.length).toBe(0);
        });

        test('throws is-directory for directory', () => {
            vfs.populateFromMap(new Map([['dir/f.txt', 'x']]));
            expect(() => vfs.read(['dir'], 0n, 100)).toThrow(VfsError);
        });
    });

    describe('write', () => {
        test('writes to existing file', () => {
            vfs.populateFromMap(new Map([['f.txt', 'old']]));
            const data = new TextEncoder().encode('new data');
            vfs.write(['f.txt'], data, 0n);
            const read = vfs.read(['f.txt'], 0n, 100);
            expect(new TextDecoder().decode(read)).toBe('new data');
        });

        test('extends file when writing past end', () => {
            vfs.populateFromMap(new Map([['f.txt', 'ab']]));
            const data = new TextEncoder().encode('cd');
            vfs.write(['f.txt'], data, 4n);
            const read = vfs.read(['f.txt'], 0n, 100);
            expect(read.length).toBe(6);
            expect(read[2]).toBe(0); // zero-filled gap
            expect(read[3]).toBe(0);
            expect(new TextDecoder().decode(read.slice(4))).toBe('cd');
        });

        test('updates modify timestamp', () => {
            vfs.populateFromMap(new Map([['f.txt', 'old']]));
            const before = vfs.stat(['f.txt']).modifyTime;
            vfs.write(['f.txt'], new Uint8Array([1]), 0n);
            const after = vfs.stat(['f.txt']).modifyTime;
            expect(after).toBeGreaterThanOrEqual(before);
        });

        test('rejects write exceeding allocation limit', () => {
            const smallVfs = new MemoryVfsBackend({ limits: { maxAllocationSize: 10 } });
            smallVfs.populateFromMap(new Map([['f.txt', '']]));
            expect(() => smallVfs.write(['f.txt'], new Uint8Array(20), 0n)).toThrow(VfsError);
        });
    });

    describe('append', () => {
        test('appends to file', () => {
            vfs.populateFromMap(new Map([['f.txt', 'hello']]));
            vfs.append(['f.txt'], new TextEncoder().encode(' world'));
            const data = vfs.read(['f.txt'], 0n, 100);
            expect(new TextDecoder().decode(data)).toBe('hello world');
        });
    });

    describe('setSize', () => {
        test('truncates file', () => {
            vfs.populateFromMap(new Map([['f.txt', 'hello world']]));
            vfs.setSize(['f.txt'], 5n);
            const data = vfs.read(['f.txt'], 0n, 100);
            expect(new TextDecoder().decode(data)).toBe('hello');
        });

        test('extends file with zeros', () => {
            vfs.populateFromMap(new Map([['f.txt', 'ab']]));
            vfs.setSize(['f.txt'], 5n);
            const data = vfs.read(['f.txt'], 0n, 100);
            expect(data.length).toBe(5);
            expect(data[2]).toBe(0);
        });

        test('setSize to 0 empties file', () => {
            vfs.populateFromMap(new Map([['f.txt', 'data']]));
            vfs.setSize(['f.txt'], 0n);
            expect(vfs.stat(['f.txt']).size).toBe(0n);
        });
    });

    describe('setTimes', () => {
        test('sets access and modify timestamps', () => {
            vfs.populateFromMap(new Map([['f.txt', 'data']]));
            const atime = 1000000000000n;
            const mtime = 2000000000000n;
            vfs.setTimes(['f.txt'], atime, mtime);
            const s = vfs.stat(['f.txt']);
            expect(s.accessTime).toBe(atime);
            expect(s.modifyTime).toBe(mtime);
        });

        test('null means no change for that field', () => {
            vfs.populateFromMap(new Map([['f.txt', 'data']]));
            const before = vfs.stat(['f.txt']);
            vfs.setTimes(['f.txt'], null, 9999n);
            const after = vfs.stat(['f.txt']);
            expect(after.accessTime).toBe(before.accessTime);
            expect(after.modifyTime).toBe(9999n);
        });
    });

    describe('directory operations', () => {
        test('createDirectory creates a new directory', () => {
            vfs.createDirectory([], 'subdir');
            const s = vfs.stat(['subdir']);
            expect(s.type).toBe(VfsNodeType.Directory);
        });

        test('createDirectory throws exist for duplicate', () => {
            vfs.createDirectory([], 'subdir');
            try {
                vfs.createDirectory([], 'subdir');
                fail('should have thrown');
            } catch (e) {
                expect((e as VfsError).code).toBe('exist');
            }
        });

        test('removeDirectory removes empty directory', () => {
            vfs.createDirectory([], 'subdir');
            vfs.removeDirectory([], 'subdir');
            expect(() => vfs.stat(['subdir'])).toThrow(VfsError);
        });

        test('removeDirectory throws not-empty for non-empty directory', () => {
            vfs.createDirectory([], 'subdir');
            vfs.populateFromMap(new Map([['subdir/f.txt', 'data']]));
            try {
                vfs.removeDirectory([], 'subdir');
                fail('should have thrown');
            } catch (e) {
                expect((e as VfsError).code).toBe('not-empty');
            }
        });

        test('removeDirectory throws no-entry for missing', () => {
            try {
                vfs.removeDirectory([], 'nope');
                fail('should have thrown');
            } catch (e) {
                expect((e as VfsError).code).toBe('no-entry');
            }
        });

        test('readDirectory lists entries', () => {
            vfs.populateFromMap(new Map([
                ['a.txt', 'data'],
                ['b.txt', 'data'],
                ['dir/c.txt', 'data'],
            ]));
            const entries = vfs.readDirectory([]);
            const names = entries.map(e => e.name).sort();
            expect(names).toEqual(['a.txt', 'b.txt', 'dir']);
        });

        test('readDirectory on empty directory returns empty', () => {
            vfs.createDirectory([], 'empty');
            const entries = vfs.readDirectory(['empty']);
            expect(entries).toEqual([]);
        });

        test('readDirectory throws not-directory on file', () => {
            vfs.populateFromMap(new Map([['f.txt', 'data']]));
            try {
                vfs.readDirectory(['f.txt']);
                fail('should have thrown');
            } catch (e) {
                expect((e as VfsError).code).toBe('not-directory');
            }
        });
    });

    describe('file operations', () => {
        test('unlinkFile removes file', () => {
            vfs.populateFromMap(new Map([['f.txt', 'data']]));
            vfs.unlinkFile([], 'f.txt');
            expect(() => vfs.stat(['f.txt'])).toThrow(VfsError);
        });

        test('unlinkFile throws no-entry for missing', () => {
            try { vfs.unlinkFile([], 'missing'); fail(); } catch (e) { expect((e as VfsError).code).toBe('no-entry'); }
        });

        test('unlinkFile throws is-directory for directory', () => {
            vfs.createDirectory([], 'dir');
            try { vfs.unlinkFile([], 'dir'); fail(); } catch (e) { expect((e as VfsError).code).toBe('is-directory'); }
        });

        test('rename moves file', () => {
            vfs.populateFromMap(new Map([['old.txt', 'data']]));
            vfs.rename([], 'old.txt', [], 'new.txt');
            expect(() => vfs.stat(['old.txt'])).toThrow(VfsError);
            const s = vfs.stat(['new.txt']);
            expect(s.type).toBe(VfsNodeType.File);
        });

        test('rename replaces existing file', () => {
            vfs.populateFromMap(new Map([
                ['src.txt', 'new data'],
                ['dst.txt', 'old data'],
            ]));
            vfs.rename([], 'src.txt', [], 'dst.txt');
            const data = vfs.read(['dst.txt'], 0n, 100);
            expect(new TextDecoder().decode(data)).toBe('new data');
        });

        test('rename throws no-entry for missing source', () => {
            try { vfs.rename([], 'missing', [], 'dst'); fail(); } catch (e) { expect((e as VfsError).code).toBe('no-entry'); }
        });
    });

    describe('openAt', () => {
        test('opens existing file', () => {
            vfs.populateFromMap(new Map([['f.txt', 'data']]));
            const result = vfs.openAt([], 'f.txt', {}, { read: true }, false);
            expect(result.path).toEqual(['f.txt']);
        });

        test('creates new file with create flag', () => {
            const result = vfs.openAt([], 'new.txt', { create: true }, { read: true, write: true }, false);
            expect(result.path).toEqual(['new.txt']);
            const s = vfs.stat(['new.txt']);
            expect(s.type).toBe(VfsNodeType.File);
        });

        test('throws no-entry without create flag', () => {
            try { vfs.openAt([], 'missing.txt', {}, { read: true }, false); fail(); }
            catch (e) { expect((e as VfsError).code).toBe('no-entry'); }
        });

        test('exclusive throws exist for existing file', () => {
            vfs.populateFromMap(new Map([['f.txt', 'data']]));
            try { vfs.openAt([], 'f.txt', { exclusive: true, create: true }, { write: true }, false); fail(); }
            catch (e) { expect((e as VfsError).code).toBe('exist'); }
        });

        test('truncate empties existing file', () => {
            vfs.populateFromMap(new Map([['f.txt', 'data']]));
            vfs.openAt([], 'f.txt', { truncate: true }, { write: true }, false);
            expect(vfs.stat(['f.txt']).size).toBe(0n);
        });

        test('directory flag with file throws not-directory', () => {
            vfs.populateFromMap(new Map([['f.txt', 'data']]));
            try { vfs.openAt([], 'f.txt', { directory: true }, { read: true }, false); fail(); }
            catch (e) { expect((e as VfsError).code).toBe('not-directory'); }
        });

        test('creates directory with create+directory flags', () => {
            const result = vfs.openAt([], 'newdir', { create: true, directory: true }, { read: true }, false);
            expect(result.path).toEqual(['newdir']);
            expect(vfs.stat(['newdir']).type).toBe(VfsNodeType.Directory);
        });
    });

    describe('symlinks', () => {
        test('create and read symlink', () => {
            vfs.populateFromMap(new Map([['target.txt', 'data']]));
            vfs.symlinkAt([], 'target.txt', 'link');
            const target = vfs.readlinkAt([], 'link');
            expect(target).toBe('target.txt');
        });

        test('resolve symlink to file', () => {
            vfs.populateFromMap(new Map([['target.txt', 'hello']]));
            vfs.symlinkAt([], 'target.txt', 'link');
            const data = vfs.read(['link'], 0n, 100);
            expect(new TextDecoder().decode(data)).toBe('hello');
        });

        test('rejects absolute symlink target', () => {
            try { vfs.symlinkAt([], '/etc/passwd', 'evil'); fail(); }
            catch (e) { expect((e as VfsError).code).toBe('not-permitted'); }
        });

        test('readlinkAt throws for non-symlink', () => {
            vfs.populateFromMap(new Map([['f.txt', 'data']]));
            try { vfs.readlinkAt([], 'f.txt'); fail(); }
            catch (e) { expect((e as VfsError).code).toBe('invalid'); }
        });
    });

    describe('hard links', () => {
        test('linkAt creates hard link', () => {
            vfs.populateFromMap(new Map([['original.txt', 'data']]));
            vfs.linkAt(['original.txt'], [], 'linked.txt');
            const data = vfs.read(['linked.txt'], 0n, 100);
            expect(new TextDecoder().decode(data)).toBe('data');
        });

        test('hard-linked files share identity', () => {
            vfs.populateFromMap(new Map([['original.txt', 'data']]));
            vfs.linkAt(['original.txt'], [], 'linked.txt');
            expect(vfs.isSameNode(['original.txt'], ['linked.txt'])).toBe(true);
        });

        test('linkAt rejects directory hard link', () => {
            vfs.createDirectory([], 'dir');
            try { vfs.linkAt(['dir'], [], 'link'); fail(); }
            catch (e) { expect((e as VfsError).code).toBe('not-permitted'); }
        });

        test('linkAt throws exist for existing target', () => {
            vfs.populateFromMap(new Map([
                ['a.txt', 'a'],
                ['b.txt', 'b'],
            ]));
            try { vfs.linkAt(['a.txt'], [], 'b.txt'); fail(); }
            catch (e) { expect((e as VfsError).code).toBe('exist'); }
        });
    });

    describe('identity', () => {
        test('isSameNode for same path returns true', () => {
            vfs.populateFromMap(new Map([['f.txt', 'data']]));
            expect(vfs.isSameNode(['f.txt'], ['f.txt'])).toBe(true);
        });

        test('isSameNode for different files returns false', () => {
            vfs.populateFromMap(new Map([
                ['a.txt', 'a'],
                ['b.txt', 'b'],
            ]));
            expect(vfs.isSameNode(['a.txt'], ['b.txt'])).toBe(false);
        });

        test('metadataHash returns consistent values', () => {
            vfs.populateFromMap(new Map([['f.txt', 'data']]));
            const h1 = vfs.metadataHash(['f.txt']);
            const h2 = vfs.metadataHash(['f.txt']);
            expect(h1.lower).toBe(h2.lower);
            expect(h1.upper).toBe(h2.upper);
        });

        test('metadataHash differs for different files', () => {
            vfs.populateFromMap(new Map([
                ['a.txt', 'aaa'],
                ['b.txt', 'bbb'],
            ]));
            const ha = vfs.metadataHash(['a.txt']);
            const hb = vfs.metadataHash(['b.txt']);
            expect(ha.lower !== hb.lower || ha.upper !== hb.upper).toBe(true);
        });
    });

    describe('path traversal security', () => {
        test('rejects null bytes in path component', () => {
            try { vfs.createDirectory([], 'bad\0name'); fail(); }
            catch (e) { expect((e as VfsError).code).toBe('invalid'); }
        });

        test('rejects path with slash in component', () => {
            try { vfs.createDirectory([], 'bad/name'); fail(); }
            catch (e) { expect((e as VfsError).code).toBe('invalid'); }
        });

        test('resolvePathComponents rejects .. escape', () => {
            expect(() => resolvePathComponents([], '../escape')).toThrow(VfsError);
        });

        test('openAt rejects .. escape via relative path', () => {
            vfs.createDirectory([], 'sandbox');
            try { vfs.openAt(['sandbox'], '../../etc/passwd', {}, { read: true }, false); fail(); }
            catch (e) { expect((e as VfsError).code).toBe('not-permitted'); }
        });

        test('rejects very long path component', () => {
            const longName = 'a'.repeat(5000);
            try { vfs.createDirectory([], longName); fail(); }
            catch (e) { expect((e as VfsError).code).toBe('name-too-long'); }
        });
    });

    describe('size limits', () => {
        test('rejects file exceeding allocation limit', () => {
            const smallVfs = new MemoryVfsBackend({ limits: { maxAllocationSize: 100 } });
            smallVfs.populateFromMap(new Map([['f.txt', '']]));
            try { smallVfs.write(['f.txt'], new Uint8Array(200), 0n); fail(); }
            catch (e) { expect((e as VfsError).code).toBe('insufficient-space'); }
        });

        test('rejects setSize exceeding allocation limit', () => {
            const smallVfs = new MemoryVfsBackend({ limits: { maxAllocationSize: 50 } });
            smallVfs.populateFromMap(new Map([['f.txt', '']]));
            try { smallVfs.setSize(['f.txt'], 100n); fail(); }
            catch (e) { expect((e as VfsError).code).toBe('insufficient-space'); }
        });

        test('rejects total VFS size exceeded', () => {
            const tinyVfs = new MemoryVfsBackend({ maxTotalSize: 50 });
            tinyVfs.populateFromMap(new Map([['f.txt', '']]));
            try { tinyVfs.write(['f.txt'], new Uint8Array(100), 0n); fail(); }
            catch (e) { expect((e as VfsError).code).toBe('insufficient-space'); }
        });
    });
});
