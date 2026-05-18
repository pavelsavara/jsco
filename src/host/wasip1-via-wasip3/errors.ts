// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { Errno } from './types/wasi-snapshot-preview1';

/**
 * Map a P3 ErrorCode (thrown as `{ tag: string }`) to a P1 Errno integer.
 */
export function errorCodeToErrno(e: unknown): Errno {
    if (e && typeof e === 'object' && 'tag' in e) {
        switch ((e as { tag: string }).tag) {
            case 'access': return Errno.Acces;
            case 'already': return Errno.Already;
            case 'bad-descriptor': return Errno.Badf;
            case 'busy': return Errno.Busy;
            case 'deadlock': return Errno.Deadlk;
            case 'quota': return Errno.Dquot;
            case 'exist': return Errno.Exist;
            case 'file-too-large': return Errno.Fbig;
            case 'illegal-byte-sequence': return Errno.Ilseq;
            case 'in-progress': return Errno.Inprogress;
            case 'interrupted': return Errno.Intr;
            case 'invalid': return Errno.Inval;
            case 'io': return Errno.Io;
            case 'is-directory': return Errno.Isdir;
            case 'loop': return Errno.Loop;
            case 'too-many-links': return Errno.Mlink;
            case 'message-size': return Errno.Msgsize;
            case 'name-too-long': return Errno.Nametoolong;
            case 'no-device': return Errno.Nodev;
            case 'no-entry': return Errno.Noent;
            case 'no-lock': return Errno.Nolck;
            case 'insufficient-memory': return Errno.Nomem;
            case 'insufficient-space': return Errno.Nospc;
            case 'not-directory': return Errno.Notdir;
            case 'not-empty': return Errno.Notempty;
            case 'not-recoverable': return Errno.Notrecoverable;
            case 'unsupported': return Errno.Notsup;
            case 'no-tty': return Errno.Notty;
            case 'no-such-device': return Errno.Nxio;
            case 'overflow': return Errno.Overflow;
            case 'not-permitted': return Errno.Perm;
            case 'pipe': return Errno.Pipe;
            case 'read-only': return Errno.Rofs;
            case 'invalid-seek': return Errno.Spipe;
            case 'text-file-busy': return Errno.Txtbsy;
            case 'cross-device': return Errno.Xdev;
            default: return Errno.Io;
        }
    }
    return Errno.Io;
}
