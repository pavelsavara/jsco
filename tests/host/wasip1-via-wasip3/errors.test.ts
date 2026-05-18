// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { errorCodeToErrno } from '../../../src/host/wasip1-via-wasip3/errors';
import { Errno } from '../../../src/host/wasip1-via-wasip3/types/wasi-snapshot-preview1';

describe('errorCodeToErrno', () => {
    const cases: [string, Errno][] = [
        ['access', Errno.Acces],
        ['already', Errno.Already],
        ['bad-descriptor', Errno.Badf],
        ['busy', Errno.Busy],
        ['deadlock', Errno.Deadlk],
        ['quota', Errno.Dquot],
        ['exist', Errno.Exist],
        ['file-too-large', Errno.Fbig],
        ['illegal-byte-sequence', Errno.Ilseq],
        ['in-progress', Errno.Inprogress],
        ['interrupted', Errno.Intr],
        ['invalid', Errno.Inval],
        ['io', Errno.Io],
        ['is-directory', Errno.Isdir],
        ['loop', Errno.Loop],
        ['too-many-links', Errno.Mlink],
        ['message-size', Errno.Msgsize],
        ['name-too-long', Errno.Nametoolong],
        ['no-device', Errno.Nodev],
        ['no-entry', Errno.Noent],
        ['no-lock', Errno.Nolck],
        ['insufficient-memory', Errno.Nomem],
        ['insufficient-space', Errno.Nospc],
        ['not-directory', Errno.Notdir],
        ['not-empty', Errno.Notempty],
        ['not-recoverable', Errno.Notrecoverable],
        ['unsupported', Errno.Notsup],
        ['no-tty', Errno.Notty],
        ['no-such-device', Errno.Nxio],
        ['overflow', Errno.Overflow],
        ['not-permitted', Errno.Perm],
        ['pipe', Errno.Pipe],
        ['read-only', Errno.Rofs],
        ['invalid-seek', Errno.Spipe],
        ['text-file-busy', Errno.Txtbsy],
        ['cross-device', Errno.Xdev],
    ];

    test.each(cases)('maps { tag: "%s" } → Errno %i', (tag, expected) => {
        expect(errorCodeToErrno({ tag })).toBe(expected);
    });

    test('unknown tag falls back to Errno.Io', () => {
        expect(errorCodeToErrno({ tag: 'some-future-code' })).toBe(Errno.Io);
    });

    test('non-object input falls back to Errno.Io', () => {
        expect(errorCodeToErrno(null)).toBe(Errno.Io);
        expect(errorCodeToErrno(undefined)).toBe(Errno.Io);
        expect(errorCodeToErrno('string')).toBe(Errno.Io);
        expect(errorCodeToErrno(42)).toBe(Errno.Io);
    });

    test('object without tag falls back to Errno.Io', () => {
        expect(errorCodeToErrno({ code: 'no-entry' })).toBe(Errno.Io);
        expect(errorCodeToErrno({})).toBe(Errno.Io);
    });

    test('Error instance without tag falls back to Errno.Io', () => {
        expect(errorCodeToErrno(new Error('something'))).toBe(Errno.Io);
    });
});
