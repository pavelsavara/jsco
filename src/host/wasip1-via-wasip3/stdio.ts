// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import type { WasiP3Imports } from '../wasip3';
import type { FdTable } from './fd-table';
import { FdKind } from './fd-table';
import { Filetype, Fdflags, Rights } from './types/wasi-snapshot-preview1';
import { createStreamPair } from '../wasip3/streams';

/**
 * Initialize stdio FDs (0, 1, 2) from P3 cli/stdin, cli/stdout, cli/stderr.
 *
 * - stdin:  call readViaStream(), store async iterator in fd 0
 * - stdout: create stream pair, feed readable to writeViaStream(), store pair in fd 1
 * - stderr: same as stdout
 */
export function initStdio(p3: WasiP3Imports, fdTable: FdTable): void {
    // fd 0 = stdin
    const [stdinStream] = p3['wasi:cli/stdin'].readViaStream();
    const stdinIterator = stdinStream[Symbol.asyncIterator]();
    fdTable.allocate({
        kind: FdKind.Stdin,
        filetype: Filetype.CharacterDevice,
        flags: 0 as Fdflags,
        rightsBase: Rights.FdRead | Rights.PollFdReadwrite,
        rightsInheriting: 0 as Rights,
        position: 0n,
        stdinIterator,
        stdinBuf: null,
    });

    // fd 1 = stdout
    const stdoutPair = createStreamPair<Uint8Array>();
    p3['wasi:cli/stdout'].writeViaStream(stdoutPair.readable);
    fdTable.allocate({
        kind: FdKind.Stdout,
        filetype: Filetype.CharacterDevice,
        flags: Fdflags.Append,
        rightsBase: Rights.FdWrite | Rights.PollFdReadwrite,
        rightsInheriting: 0 as Rights,
        position: 0n,
        writer: stdoutPair,
    });

    // fd 2 = stderr
    const stderrPair = createStreamPair<Uint8Array>();
    p3['wasi:cli/stderr'].writeViaStream(stderrPair.readable);
    fdTable.allocate({
        kind: FdKind.Stderr,
        filetype: Filetype.CharacterDevice,
        flags: Fdflags.Append,
        rightsBase: Rights.FdWrite | Rights.PollFdReadwrite,
        rightsInheriting: 0 as Rights,
        position: 0n,
        writer: stderrPair,
    });
}

/**
 * Initialize preopen FDs from P3 filesystem/preopens.
 */
export function initPreopens(p3: WasiP3Imports, fdTable: FdTable): void {
    const preopens = p3['wasi:filesystem/preopens'].getDirectories();
    for (const [descriptor, path] of preopens) {
        fdTable.allocate({
            kind: FdKind.PreopenDir,
            filetype: Filetype.Directory,
            flags: 0 as Fdflags,
            rightsBase: Rights.FdDatasync | Rights.FdRead | Rights.FdSeek | Rights.FdFdstatSetFlags
                | Rights.FdSync | Rights.FdTell | Rights.FdWrite | Rights.FdAdvise | Rights.FdAllocate
                | Rights.PathCreateDirectory | Rights.PathCreateFile | Rights.PathLinkSource
                | Rights.PathLinkTarget | Rights.PathOpen | Rights.FdReaddir | Rights.PathReadlink
                | Rights.PathRenameSource | Rights.PathRenameTarget | Rights.PathFilestatGet
                | Rights.PathFilestatSetSize | Rights.PathFilestatSetTimes | Rights.FdFilestatGet
                | Rights.FdFilestatSetSize | Rights.FdFilestatSetTimes | Rights.PathSymlink
                | Rights.PathRemoveDirectory | Rights.PathUnlinkFile | Rights.PollFdReadwrite
                | Rights.SockShutdown | Rights.SockAccept,
            rightsInheriting: Rights.FdDatasync | Rights.FdRead | Rights.FdSeek | Rights.FdFdstatSetFlags
                | Rights.FdSync | Rights.FdTell | Rights.FdWrite | Rights.FdAdvise | Rights.FdAllocate
                | Rights.PathCreateDirectory | Rights.PathCreateFile | Rights.PathLinkSource
                | Rights.PathLinkTarget | Rights.PathOpen | Rights.FdReaddir | Rights.PathReadlink
                | Rights.PathRenameSource | Rights.PathRenameTarget | Rights.PathFilestatGet
                | Rights.PathFilestatSetSize | Rights.PathFilestatSetTimes | Rights.FdFilestatGet
                | Rights.FdFilestatSetSize | Rights.FdFilestatSetTimes | Rights.PathSymlink
                | Rights.PathRemoveDirectory | Rights.PathUnlinkFile | Rights.PollFdReadwrite
                | Rights.SockShutdown | Rights.SockAccept,
            preopenPath: path,
            desc: descriptor,
            position: 0n,
        });
    }
}
