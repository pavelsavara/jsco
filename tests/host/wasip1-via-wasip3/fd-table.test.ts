// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { FdTable, FdKind, ALL_RIGHTS } from '../../../src/host/wasip1-via-wasip3/fd-table';
import { Filetype, Fdflags, Rights } from '../../../src/host/wasip1-via-wasip3/types/wasi-snapshot-preview1';

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
            const entry = { kind: FdKind.File, filetype: Filetype.RegularFile, flags: 0 as Fdflags, rightsBase: Rights.FdRead, rightsInheriting: 0 as Rights, position: 42n };
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
            table.allocate({ kind: FdKind.PreopenDir, filetype: Filetype.Directory, flags: 0 as Fdflags, rightsBase: ALL_RIGHTS, rightsInheriting: ALL_RIGHTS, preopenPath: '/', position: 0n });

            const preopens = table.preopens();
            expect(preopens.length).toBe(1);
            expect(preopens[0]![0]).toBe(3); // fd 3
            expect(preopens[0]![1].kind).toBe(FdKind.PreopenDir);
            expect(preopens[0]![1].preopenPath).toBe('/');
        });
    });


});
