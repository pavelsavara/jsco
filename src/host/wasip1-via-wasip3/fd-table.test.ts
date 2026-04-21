// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { FdTable, FdKind, createDefaultFdTable, ALL_RIGHTS } from './fd-table';
import { Filetype, Fdflags, Rights } from './types/wasi-snapshot-preview1';

describe('WASI P1 FD table', () => {

    describe('FdTable', () => {
        test('allocate returns sequential FDs', () => {
            const table = new FdTable();
            const fd0 = table.allocate({ kind: FdKind.Stdin, filetype: Filetype.CharacterDevice, flags: 0 as Fdflags, rightsBase: 0 as Rights, rightsInheriting: 0 as Rights, position: 0n });
            const fd1 = table.allocate({ kind: FdKind.Stdout, filetype: Filetype.CharacterDevice, flags: 0 as Fdflags, rightsBase: 0 as Rights, rightsInheriting: 0 as Rights, position: 0n });
            const fd2 = table.allocate({ kind: FdKind.Stderr, filetype: Filetype.CharacterDevice, flags: 0 as Fdflags, rightsBase: 0 as Rights, rightsInheriting: 0 as Rights, position: 0n });
            expect(fd0).toBe(0);
            expect(fd1).toBe(1);
            expect(fd2).toBe(2);
        });

        test('get returns entry for valid FD', () => {
            const table = new FdTable();
            const entry = { kind: FdKind.File, filetype: Filetype.RegularFile, flags: 0 as Fdflags, rightsBase: Rights.FdRead, rightsInheriting: 0 as Rights, position: 42n, vfsPath: ['test.txt'] };
            const fd = table.allocate(entry);
            const got = table.get(fd);
            expect(got).toBe(entry);
            expect(got!.kind).toBe(FdKind.File);
            expect(got!.position).toBe(42n);
        });

        test('get returns undefined for invalid FD', () => {
            const table = new FdTable();
            expect(table.get(999)).toBeUndefined();
        });

        test('close removes FD and returns true', () => {
            const table = new FdTable();
            const fd = table.allocate({ kind: FdKind.File, filetype: Filetype.RegularFile, flags: 0 as Fdflags, rightsBase: 0 as Rights, rightsInheriting: 0 as Rights, position: 0n });
            expect(table.close(fd)).toBe(true);
            expect(table.get(fd)).toBeUndefined();
        });

        test('close returns false for invalid FD', () => {
            const table = new FdTable();
            expect(table.close(999)).toBe(false);
        });

        test('renumber moves entry from one FD to another', () => {
            const table = new FdTable();
            const entry = { kind: FdKind.File, filetype: Filetype.RegularFile, flags: 0 as Fdflags, rightsBase: 0 as Rights, rightsInheriting: 0 as Rights, position: 0n };
            const fd = table.allocate(entry);
            expect(table.renumber(fd, 10)).toBe(true);
            expect(table.get(fd)).toBeUndefined();
            expect(table.get(10)).toBe(entry);
        });

        test('renumber returns false for invalid source FD', () => {
            const table = new FdTable();
            expect(table.renumber(999, 10)).toBe(false);
        });

        test('renumber overwrites existing target FD', () => {
            const table = new FdTable();
            const entry1 = { kind: FdKind.File, filetype: Filetype.RegularFile, flags: 0 as Fdflags, rightsBase: 0 as Rights, rightsInheriting: 0 as Rights, position: 0n };
            const entry2 = { kind: FdKind.File, filetype: Filetype.RegularFile, flags: 0 as Fdflags, rightsBase: 0 as Rights, rightsInheriting: 0 as Rights, position: 100n };
            const fd1 = table.allocate(entry1);
            const fd2 = table.allocate(entry2);
            expect(table.renumber(fd2, fd1)).toBe(true);
            expect(table.get(fd1)).toBe(entry2);
            expect(table.get(fd2)).toBeUndefined();
        });

        test('preopens returns only PreopenDir entries', () => {
            const table = new FdTable();
            table.allocate({ kind: FdKind.Stdin, filetype: Filetype.CharacterDevice, flags: 0 as Fdflags, rightsBase: 0 as Rights, rightsInheriting: 0 as Rights, position: 0n });
            table.allocate({ kind: FdKind.Stdout, filetype: Filetype.CharacterDevice, flags: 0 as Fdflags, rightsBase: 0 as Rights, rightsInheriting: 0 as Rights, position: 0n });
            table.allocate({ kind: FdKind.Stderr, filetype: Filetype.CharacterDevice, flags: 0 as Fdflags, rightsBase: 0 as Rights, rightsInheriting: 0 as Rights, position: 0n });
            table.allocate({ kind: FdKind.PreopenDir, filetype: Filetype.Directory, flags: 0 as Fdflags, rightsBase: ALL_RIGHTS, rightsInheriting: ALL_RIGHTS, preopenPath: '/', vfsPath: [], position: 0n });

            const preopens = table.preopens();
            expect(preopens.length).toBe(1);
            expect(preopens[0]![0]).toBe(3); // fd 3
            expect(preopens[0]![1].kind).toBe(FdKind.PreopenDir);
            expect(preopens[0]![1].preopenPath).toBe('/');
        });
    });

    describe('createDefaultFdTable', () => {
        test('creates table with stdin(0), stdout(1), stderr(2), preopen(3)', () => {
            const table = createDefaultFdTable();
            const stdin = table.get(0);
            expect(stdin).toBeDefined();
            expect(stdin!.kind).toBe(FdKind.Stdin);
            expect(stdin!.filetype).toBe(Filetype.CharacterDevice);

            const stdout = table.get(1);
            expect(stdout).toBeDefined();
            expect(stdout!.kind).toBe(FdKind.Stdout);
            expect(stdout!.flags).toBe(Fdflags.Append);

            const stderr = table.get(2);
            expect(stderr).toBeDefined();
            expect(stderr!.kind).toBe(FdKind.Stderr);
            expect(stderr!.flags).toBe(Fdflags.Append);

            const preopen = table.get(3);
            expect(preopen).toBeDefined();
            expect(preopen!.kind).toBe(FdKind.PreopenDir);
            expect(preopen!.filetype).toBe(Filetype.Directory);
            expect(preopen!.preopenPath).toBe('/');
            expect(preopen!.rightsBase).toBe(ALL_RIGHTS);
        });

        test('stdin has read + poll rights', () => {
            const table = createDefaultFdTable();
            const stdin = table.get(0)!;
            expect(stdin.rightsBase & Rights.FdRead).toBeTruthy();
            expect(stdin.rightsBase & Rights.PollFdReadwrite).toBeTruthy();
            expect(stdin.rightsBase & Rights.FdWrite).toBeFalsy();
        });

        test('stdout has write + poll rights', () => {
            const table = createDefaultFdTable();
            const stdout = table.get(1)!;
            expect(stdout.rightsBase & Rights.FdWrite).toBeTruthy();
            expect(stdout.rightsBase & Rights.PollFdReadwrite).toBeTruthy();
            expect(stdout.rightsBase & Rights.FdRead).toBeFalsy();
        });

        test('no entry at fd 4', () => {
            const table = createDefaultFdTable();
            expect(table.get(4)).toBeUndefined();
        });
    });
});
