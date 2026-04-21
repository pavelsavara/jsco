// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { WasiSnapshotPreview1 } from './types/wasi-snapshot-preview1';
import type { WasiP3Config } from '../wasip3/types';
import { Errno, Clockid, Preopentype, Whence, FdstatLayout, FilestatLayout, PrestatLayout, EventLayout, Eventtype, SubscriptionLayout } from './types/wasi-snapshot-preview1';
import { getView, gatherBytes, scatterBytes, readString } from './memory';
import { FdKind, createDefaultFdTable } from './fd-table';
import type { FdTable } from './fd-table';

export type WasiP1Adapter = {
    imports: { wasi_snapshot_preview1: WasiSnapshotPreview1 }
    bindMemory: (memory: WebAssembly.Memory) => void
}

class WasiExit extends Error {
    exitCode: number;
    constructor(code: number) {
        super(`WASI exit with code ${code}`);
        this.name = 'WasiExit';
        this.exitCode = code;
    }
}

export function createWasiP1ViaP3Adapter(config?: WasiP3Config): WasiP1Adapter {
    let memory: WebAssembly.Memory | null = null;
    const fdTable: FdTable = createDefaultFdTable();

    // Stdout/stderr buffering for synchronous fd_write
    const stdoutChunks: Uint8Array[] = [];
    const stderrChunks: Uint8Array[] = [];

    // Config values
    const envPairs: [string, string][] = config?.env ?? [];
    const args: string[] = config?.args ?? [];

    function getMemory(): WebAssembly.Memory {
        if (!memory) throw new Error('WASI P1 adapter: memory not bound yet');
        return memory;
    }

    const encoder = new TextEncoder();

    // ── Args & Environment ─────────────────────────────────────────────

    function args_get(argv: number, argv_buf: number): number {
        const mem = getMemory();
        const view = getView(mem);
        let bufOffset = argv_buf;
        for (let i = 0; i < args.length; i++) {
            view.setUint32(argv + i * 4, bufOffset, true);
            const encoded = encoder.encode(args[i] + '\0');
            new Uint8Array(mem.buffer, bufOffset, encoded.length).set(encoded);
            bufOffset += encoded.length;
        }
        return Errno.Success;
    }

    function args_sizes_get(retptr0: number, retptr1: number): number {
        const view = getView(getMemory());
        view.setUint32(retptr0, args.length, true);
        let totalSize = 0;
        for (const arg of args) {
            totalSize += encoder.encode(arg + '\0').length;
        }
        view.setUint32(retptr1, totalSize, true);
        return Errno.Success;
    }

    function environ_get(environ: number, environ_buf: number): number {
        const mem = getMemory();
        const view = getView(mem);
        let bufOffset = environ_buf;
        for (let i = 0; i < envPairs.length; i++) {
            view.setUint32(environ + i * 4, bufOffset, true);
            const pair = envPairs[i]!;
            const encoded = encoder.encode(pair[0] + '=' + pair[1] + '\0');
            new Uint8Array(mem.buffer, bufOffset, encoded.length).set(encoded);
            bufOffset += encoded.length;
        }
        return Errno.Success;
    }

    function environ_sizes_get(retptr0: number, retptr1: number): number {
        const view = getView(getMemory());
        view.setUint32(retptr0, envPairs.length, true);
        let totalSize = 0;
        for (const [k, v] of envPairs) {
            totalSize += encoder.encode(k + '=' + v + '\0').length;
        }
        view.setUint32(retptr1, totalSize, true);
        return Errno.Success;
    }

    // ── Clocks ─────────────────────────────────────────────────────────

    function clock_res_get(id: number, retptr0: number): number {
        const view = getView(getMemory());
        switch (id) {
            case Clockid.Realtime:
                // Wall clock resolution: 1 microsecond (1000 ns)
                view.setBigUint64(retptr0, 1_000n, true);
                return Errno.Success;
            case Clockid.Monotonic:
                // Monotonic clock resolution: 1 nanosecond (performance.now resolution)
                view.setBigUint64(retptr0, 1n, true);
                return Errno.Success;
            case Clockid.ProcessCputimeId:
            case Clockid.ThreadCputimeId:
                return Errno.Notsup;
            default:
                return Errno.Inval;
        }
    }

    function clock_time_get(id: number, _precision: bigint, retptr0: number): number {
        const view = getView(getMemory());
        switch (id) {
            case Clockid.Realtime: {
                // Wall clock: milliseconds since epoch → nanoseconds
                const nowMs = Date.now();
                view.setBigUint64(retptr0, BigInt(nowMs) * 1_000_000n, true);
                return Errno.Success;
            }
            case Clockid.Monotonic: {
                // Monotonic: performance.now() milliseconds → nanoseconds
                const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
                view.setBigUint64(retptr0, BigInt(Math.round(nowMs * 1_000_000)), true);
                return Errno.Success;
            }
            case Clockid.ProcessCputimeId:
            case Clockid.ThreadCputimeId:
                return Errno.Notsup;
            default:
                return Errno.Inval;
        }
    }

    // ── File Descriptor Operations ─────────────────────────────────────

    function fd_advise(_fd: number, _offset: bigint, _len: bigint, _advice: number): number {
        return Errno.Success;
    }

    function fd_allocate(_fd: number, _offset: bigint, _len: bigint): number {
        return Errno.Notsup;
    }

    function fd_close(fd: number): number {
        if (!fdTable.close(fd)) return Errno.Badf;
        return Errno.Success;
    }

    function fd_datasync(_fd: number): number {
        return Errno.Success;
    }

    function fd_fdstat_get(fd: number, retptr0: number): number {
        const entry = fdTable.get(fd);
        if (!entry) return Errno.Badf;
        const view = getView(getMemory());
        // Clear the struct area first
        for (let i = 0; i < FdstatLayout._size; i++) {
            view.setUint8(retptr0 + i, 0);
        }
        view.setUint8(retptr0 + FdstatLayout.fs_filetype.offset, entry.filetype);
        view.setUint16(retptr0 + FdstatLayout.fs_flags.offset, entry.flags, true);
        view.setBigUint64(retptr0 + FdstatLayout.fs_rights_base.offset, BigInt(entry.rightsBase), true);
        view.setBigUint64(retptr0 + FdstatLayout.fs_rights_inheriting.offset, BigInt(entry.rightsInheriting), true);
        return Errno.Success;
    }

    function fd_fdstat_set_flags(_fd: number, _flags: number): number {
        return Errno.Success;
    }

    function fd_fdstat_set_rights(_fd: number, _fs_rights_base: bigint, _fs_rights_inheriting: bigint): number {
        return Errno.Success;
    }

    function fd_filestat_get(fd: number, retptr0: number): number {
        const entry = fdTable.get(fd);
        if (!entry) return Errno.Badf;
        const view = getView(getMemory());
        // Clear the struct area
        for (let i = 0; i < FilestatLayout._size; i++) {
            view.setUint8(retptr0 + i, 0);
        }
        view.setUint8(retptr0 + FilestatLayout.filetype.offset, entry.filetype);
        return Errno.Success;
    }

    function fd_filestat_set_size(_fd: number, _size: bigint): number {
        return Errno.Notsup;
    }

    function fd_filestat_set_times(_fd: number, _atim: bigint, _mtim: bigint, _fst_flags: number): number {
        return Errno.Notsup;
    }

    function fd_pread(_fd: number, _iovs: number, _iovs_len: number, _offset: bigint, retptr0: number): number {
        const view = getView(getMemory());
        view.setUint32(retptr0, 0, true);
        return Errno.Notsup;
    }

    function fd_prestat_get(fd: number, retptr0: number): number {
        const entry = fdTable.get(fd);
        if (!entry || entry.kind !== FdKind.PreopenDir) return Errno.Badf;
        const view = getView(getMemory());
        view.setUint8(retptr0 + PrestatLayout.tag.offset, Preopentype.Dir);
        const pathBytes = encoder.encode(entry.preopenPath ?? '/');
        view.setUint32(retptr0 + PrestatLayout.u.offset, pathBytes.length, true);
        return Errno.Success;
    }

    function fd_prestat_dir_name(fd: number, path: number, path_len: number): number {
        const entry = fdTable.get(fd);
        if (!entry || entry.kind !== FdKind.PreopenDir) return Errno.Badf;
        const mem = getMemory();
        const pathBytes = encoder.encode(entry.preopenPath ?? '/');
        const writeLen = Math.min(pathBytes.length, path_len);
        new Uint8Array(mem.buffer, path, writeLen).set(pathBytes.subarray(0, writeLen));
        return Errno.Success;
    }

    function fd_pwrite(_fd: number, _iovs: number, _iovs_len: number, _offset: bigint, retptr0: number): number {
        const view = getView(getMemory());
        view.setUint32(retptr0, 0, true);
        return Errno.Notsup;
    }

    function fd_read(fd: number, iovs: number, iovs_len: number, retptr0: number): number {
        const entry = fdTable.get(fd);
        if (!entry) return Errno.Badf;
        const view = getView(getMemory());
        if (entry.kind === FdKind.Stdin) {
            // Stdin: return 0 bytes (EOF) for now
            view.setUint32(retptr0, 0, true);
            return Errno.Success;
        }
        // Other FDs not yet supported for reading
        void iovs; void iovs_len;
        view.setUint32(retptr0, 0, true);
        return Errno.Notsup;
    }

    function fd_readdir(_fd: number, _buf: number, _buf_len: number, _cookie: bigint, retptr0: number): number {
        const view = getView(getMemory());
        view.setUint32(retptr0, 0, true);
        return Errno.Notsup;
    }

    function fd_renumber(fd: number, to: number): number {
        if (!fdTable.renumber(fd, to)) return Errno.Badf;
        return Errno.Success;
    }

    function fd_seek(fd: number, offset: bigint, whence: number, retptr0: number): number {
        const entry = fdTable.get(fd);
        if (!entry) return Errno.Badf;
        const view = getView(getMemory());
        switch (whence) {
            case Whence.Set:
                entry.position = offset;
                break;
            case Whence.Cur:
                entry.position += offset;
                break;
            case Whence.End:
                // For character devices, end = current position
                entry.position += offset;
                break;
            default:
                return Errno.Inval;
        }
        view.setBigUint64(retptr0, BigInt(entry.position < 0n ? 0n : entry.position), true);
        return Errno.Success;
    }

    function fd_sync(_fd: number): number {
        return Errno.Success;
    }

    function fd_tell(fd: number, retptr0: number): number {
        const entry = fdTable.get(fd);
        if (!entry) return Errno.Badf;
        const view = getView(getMemory());
        view.setBigUint64(retptr0, entry.position, true);
        return Errno.Success;
    }

    function fd_write(fd: number, iovs: number, iovs_len: number, retptr0: number): number {
        const entry = fdTable.get(fd);
        if (!entry) return Errno.Badf;
        const mem = getMemory();
        const { data, totalLen } = gatherBytes(mem, iovs, iovs_len);
        if (entry.kind === FdKind.Stdout) {
            stdoutChunks.push(data);
        } else if (entry.kind === FdKind.Stderr) {
            stderrChunks.push(data);
        } else {
            return Errno.Notsup;
        }
        const view = getView(mem);
        view.setUint32(retptr0, totalLen, true);
        return Errno.Success;
    }

    // ── Path Operations ────────────────────────────────────────────────

    function path_create_directory(_fd: number, _path: number, _path_len: number): number {
        return Errno.Notsup;
    }

    function path_filestat_get(_fd: number, _flags: number, _path: number, _path_len: number, retptr0: number): number {
        void retptr0;
        return Errno.Notsup;
    }

    function path_filestat_set_times(_fd: number, _flags: number, _path: number, _path_len: number, _atim: bigint, _mtim: bigint, _fst_flags: number): number {
        return Errno.Notsup;
    }

    function path_link(_old_fd: number, _old_flags: number, _old_path: number, _old_path_len: number, _new_fd: number, _new_path: number, _new_path_len: number): number {
        return Errno.Notsup;
    }

    function path_open(_fd: number, _dirflags: number, _path: number, _path_len: number, _oflags: number, _fs_rights_base: bigint, _fs_rights_inheriting: bigint, _fdflags: number, _retptr0: number): number {
        return Errno.Notsup;
    }

    function path_readlink(_fd: number, _path: number, _path_len: number, _buf: number, _buf_len: number, retptr0: number): number {
        void retptr0;
        return Errno.Notsup;
    }

    function path_remove_directory(_fd: number, _path: number, _path_len: number): number {
        return Errno.Notsup;
    }

    function path_rename(_fd: number, _old_path: number, _old_path_len: number, _new_fd: number, _new_path: number, _new_path_len: number): number {
        return Errno.Notsup;
    }

    function path_symlink(_old_path: number, _old_path_len: number, _fd: number, _new_path: number, _new_path_len: number): number {
        return Errno.Notsup;
    }

    function path_unlink_file(_fd: number, _path: number, _path_len: number): number {
        return Errno.Notsup;
    }

    // ── Poll ───────────────────────────────────────────────────────────

    function poll_oneoff(in_: number, out_: number, nsubscriptions: number, retptr0: number): number {
        const mem = getMemory();
        const view = getView(mem);
        // Simple implementation: satisfy all subscriptions immediately
        let nevents = 0;
        for (let i = 0; i < nsubscriptions; i++) {
            const subBase = in_ + i * SubscriptionLayout._size;
            const userdata = view.getBigUint64(subBase + SubscriptionLayout.userdata.offset, true);
            const uBase = subBase + SubscriptionLayout.u.offset;
            const tag = view.getUint8(uBase);

            const evtBase = out_ + nevents * EventLayout._size;
            // Clear event struct
            for (let j = 0; j < EventLayout._size; j++) {
                view.setUint8(evtBase + j, 0);
            }
            view.setBigUint64(evtBase + EventLayout.userdata.offset, userdata, true);
            view.setUint16(evtBase + EventLayout.error.offset, Errno.Success, true);
            view.setUint8(evtBase + EventLayout.type.offset, tag);

            if (tag === Eventtype.Clock) {
                // Clock subscription: return immediately (timeout elapsed)
                nevents++;
            } else if (tag === Eventtype.FdRead || tag === Eventtype.FdWrite) {
                // FD readiness: report as ready
                nevents++;
            }
        }
        view.setUint32(retptr0, nevents, true);
        return Errno.Success;
    }

    // ── Process ────────────────────────────────────────────────────────

    function proc_exit(rval: number): void {
        throw new WasiExit(rval);
    }

    // ── Scheduler ──────────────────────────────────────────────────────

    function sched_yield(): number {
        return Errno.Success;
    }

    // ── Random ─────────────────────────────────────────────────────────

    function random_get(buf: number, buf_len: number): number {
        const mem = getMemory();
        const target = new Uint8Array(mem.buffer, buf, buf_len);
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            crypto.getRandomValues(target);
        } else {
            // Fallback: non-cryptographic random
            for (let i = 0; i < buf_len; i++) {
                target[i] = (Math.random() * 256) | 0;
            }
        }
        return Errno.Success;
    }

    // ── Sockets (stubs) ────────────────────────────────────────────────

    function sock_accept(_fd: number, _flags: number, _retptr0: number): number {
        return Errno.Notsup;
    }

    function sock_recv(_fd: number, _ri_data: number, _ri_data_len: number, _ri_flags: number, _retptr0: number, _retptr1: number): number {
        return Errno.Notsup;
    }

    function sock_send(_fd: number, _si_data: number, _si_data_len: number, _si_flags: number, _retptr0: number): number {
        return Errno.Notsup;
    }

    function sock_shutdown(_fd: number, _how: number): number {
        return Errno.Notsup;
    }

    // ── Suppress unused import warnings ────────────────────────────────
    void readString; void scatterBytes;

    // ── Public API ─────────────────────────────────────────────────────

    const wasiImports: WasiSnapshotPreview1 = {
        args_get,
        args_sizes_get,
        environ_get,
        environ_sizes_get,
        clock_res_get,
        clock_time_get,
        fd_advise,
        fd_allocate,
        fd_close,
        fd_datasync,
        fd_fdstat_get,
        fd_fdstat_set_flags,
        fd_fdstat_set_rights,
        fd_filestat_get,
        fd_filestat_set_size,
        fd_filestat_set_times,
        fd_pread,
        fd_prestat_get,
        fd_prestat_dir_name,
        fd_pwrite,
        fd_read,
        fd_readdir,
        fd_renumber,
        fd_seek,
        fd_sync,
        fd_tell,
        fd_write,
        path_create_directory,
        path_filestat_get,
        path_filestat_set_times,
        path_link,
        path_open,
        path_readlink,
        path_remove_directory,
        path_rename,
        path_symlink,
        path_unlink_file,
        poll_oneoff,
        proc_exit,
        sched_yield,
        random_get,
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
        get stdoutChunks(): Uint8Array[] { return stdoutChunks; },
        get stderrChunks(): Uint8Array[] { return stderrChunks; },
    } as WasiP1Adapter;
}
