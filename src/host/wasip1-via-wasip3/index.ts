// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import type { WasiSnapshotPreview1 } from './types/wasi-snapshot-preview1';
import type { WasiP3Imports } from '../wasip3';
import type { AdapterContext } from './adapter-context';
import { FdTable } from './fd-table';
import { initStdio, initPreopens } from './stdio';
import { args_get, args_sizes_get, environ_get, environ_sizes_get, fd_prestat_get, fd_prestat_dir_name, proc_exit, sched_yield } from './cli';
import { clock_res_get, clock_time_get } from './clocks';
import {
    fd_advise, fd_allocate, fd_close, fd_datasync,
    fd_fdstat_get, fd_fdstat_set_flags, fd_fdstat_set_rights,
    fd_filestat_get, fd_filestat_set_size, fd_filestat_set_times,
    fd_pread, fd_pwrite, fd_read, fd_readdir, fd_renumber,
    fd_seek_async, fd_sync, fd_tell, fd_write,
    path_create_directory, path_filestat_get, path_filestat_set_times,
    path_link, path_open, path_readlink, path_remove_directory,
    path_rename, path_symlink, path_unlink_file,
} from './filesystem';
import { random_get } from './random';
import { poll_oneoff } from './poll';
import { sock_accept, sock_recv, sock_send, sock_shutdown } from './sockets';

export type WasiP1Adapter = {
    imports: { wasi_snapshot_preview1: WasiSnapshotPreview1 }
    bindMemory: (memory: WebAssembly.Memory) => void
}

export function createWasiP1ViaP3Adapter(p3: WasiP3Imports): WasiP1Adapter {
    let memory: WebAssembly.Memory | null = null;
    const fdTable = new FdTable();
    const encoder = new TextEncoder();

    // Initialize stdio (fds 0, 1, 2) from P3
    initStdio(p3, fdTable);

    // Initialize preopens (fd 3+) from P3
    initPreopens(p3, fdTable);

    // Cache args and env from P3
    const args = p3['wasi:cli/environment'].getArguments();
    const envPairs = p3['wasi:cli/environment'].getEnvironment();

    function getMemory(): WebAssembly.Memory {
        if (!memory) throw new Error('WASI P1 adapter: memory not bound yet');
        return memory;
    }

    const ctx: AdapterContext = {
        getMemory,
        fdTable,
        p3,
        args,
        envPairs,
        encoder,
    };

    const wasiImports: WasiSnapshotPreview1 = {
        args_get: (argv, argv_buf) => args_get(ctx, argv, argv_buf),
        args_sizes_get: (retptr0, retptr1) => args_sizes_get(ctx, retptr0, retptr1),
        environ_get: (environ, environ_buf) => environ_get(ctx, environ, environ_buf),
        environ_sizes_get: (retptr0, retptr1) => environ_sizes_get(ctx, retptr0, retptr1),
        clock_res_get: (id, retptr0) => clock_res_get(ctx, id, retptr0),
        clock_time_get: (id, precision, retptr0) => clock_time_get(ctx, id, precision, retptr0),
        fd_advise: (fd, offset, len, advice) => fd_advise(ctx, fd, offset, len, advice),
        fd_allocate: (fd, offset, len) => fd_allocate(ctx, fd, offset, len),
        fd_close: (fd) => fd_close(ctx, fd),
        fd_datasync: (fd) => fd_datasync(ctx, fd),
        fd_fdstat_get: (fd, retptr0) => fd_fdstat_get(ctx, fd, retptr0),
        fd_fdstat_set_flags: (fd, flags) => fd_fdstat_set_flags(ctx, fd, flags),
        fd_fdstat_set_rights: (fd, base, inheriting) => fd_fdstat_set_rights(ctx, fd, base, inheriting),
        fd_filestat_get: (fd, retptr0) => fd_filestat_get(ctx, fd, retptr0) as unknown as number,
        fd_filestat_set_size: (fd, size) => fd_filestat_set_size(ctx, fd, size) as unknown as number,
        fd_filestat_set_times: (fd, atim, mtim, flags) => fd_filestat_set_times(ctx, fd, atim, mtim, flags) as unknown as number,
        fd_pread: (fd, iovs, iovs_len, offset, retptr0) => fd_pread(ctx, fd, iovs, iovs_len, offset, retptr0) as unknown as number,
        fd_prestat_get: (fd, retptr0) => fd_prestat_get(ctx, fd, retptr0),
        fd_prestat_dir_name: (fd, path, path_len) => fd_prestat_dir_name(ctx, fd, path, path_len),
        fd_pwrite: (fd, iovs, iovs_len, offset, retptr0) => fd_pwrite(ctx, fd, iovs, iovs_len, offset, retptr0) as unknown as number,
        fd_read: (fd, iovs, iovs_len, retptr0) => fd_read(ctx, fd, iovs, iovs_len, retptr0) as unknown as number,
        fd_readdir: (fd, buf, buf_len, cookie, retptr0) => fd_readdir(ctx, fd, buf, buf_len, cookie, retptr0) as unknown as number,
        fd_renumber: (fd, to) => fd_renumber(ctx, fd, to),
        fd_seek: (fd, offset, whence, retptr0) => fd_seek_async(ctx, fd, offset, whence, retptr0) as unknown as number,
        fd_sync: (fd) => fd_sync(ctx, fd),
        fd_tell: (fd, retptr0) => fd_tell(ctx, fd, retptr0),
        fd_write: (fd, iovs, iovs_len, retptr0) => fd_write(ctx, fd, iovs, iovs_len, retptr0) as unknown as number,
        path_create_directory: (fd, path, path_len) => path_create_directory(ctx, fd, path, path_len) as unknown as number,
        path_filestat_get: (fd, flags, path, path_len, retptr0) => path_filestat_get(ctx, fd, flags, path, path_len, retptr0) as unknown as number,
        path_filestat_set_times: (fd, flags, path, path_len, atim, mtim, fst_flags) => path_filestat_set_times(ctx, fd, flags, path, path_len, atim, mtim, fst_flags) as unknown as number,
        path_link: (old_fd, old_flags, old_path, old_path_len, new_fd, new_path, new_path_len) => path_link(ctx, old_fd, old_flags, old_path, old_path_len, new_fd, new_path, new_path_len) as unknown as number,
        path_open: (fd, dirflags, path, path_len, oflags, base, inheriting, fdflags, retptr0) => path_open(ctx, fd, dirflags, path, path_len, oflags, base, inheriting, fdflags, retptr0) as unknown as number,
        path_readlink: (fd, path, path_len, buf, buf_len, retptr0) => path_readlink(ctx, fd, path, path_len, buf, buf_len, retptr0) as unknown as number,
        path_remove_directory: (fd, path, path_len) => path_remove_directory(ctx, fd, path, path_len) as unknown as number,
        path_rename: (fd, old_path, old_path_len, new_fd, new_path, new_path_len) => path_rename(ctx, fd, old_path, old_path_len, new_fd, new_path, new_path_len) as unknown as number,
        path_symlink: (old_path, old_path_len, fd, new_path, new_path_len) => path_symlink(ctx, old_path, old_path_len, fd, new_path, new_path_len) as unknown as number,
        path_unlink_file: (fd, path, path_len) => path_unlink_file(ctx, fd, path, path_len) as unknown as number,
        poll_oneoff: (in_, out_, nsubscriptions, retptr0) => poll_oneoff(ctx, in_, out_, nsubscriptions, retptr0) as unknown as number,
        proc_exit: (rval) => proc_exit(ctx, rval),
        sched_yield,
        random_get: (buf, buf_len) => random_get(ctx, buf, buf_len),
        sock_accept,
        sock_recv,
        sock_send,
        sock_shutdown,
    };

    return {
        imports: { wasi_snapshot_preview1: wasiImports },
        bindMemory(mem: WebAssembly.Memory): void {
            memory = mem;
        },
    };
}
