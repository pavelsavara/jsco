// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import type { AdapterContext } from '../../../src/host/wasip1-via-wasip3/adapter-context';
import { createDefaultFdTable } from '../../../src/host/wasip1-via-wasip3/fd-table';
import type { FdEntry } from '../../../src/host/wasip1-via-wasip3/fd-table';
import { FdKind } from '../../../src/host/wasip1-via-wasip3/fd-table';
import { MemoryVfsBackend } from '../../../src/host/wasip3/vfs';
import {
    Errno, Clockid, Eventtype, Filetype, Fdflags, Rights, Whence,
    FdstatLayout, FilestatLayout, PrestatLayout, EventLayout, SubscriptionLayout,
    CiovecLayout,
} from '../../../src/host/wasip1-via-wasip3/types/wasi-snapshot-preview1';
import { args_get, args_sizes_get, environ_get, environ_sizes_get, fd_prestat_get, fd_prestat_dir_name, proc_exit, sched_yield } from '../../../src/host/wasip1-via-wasip3/cli';
import { clock_res_get, clock_time_get } from '../../../src/host/wasip1-via-wasip3/clocks';
import { random_get } from '../../../src/host/wasip1-via-wasip3/random';
import { poll_oneoff } from '../../../src/host/wasip1-via-wasip3/poll';
import { sock_accept, sock_recv, sock_send, sock_shutdown } from '../../../src/host/wasip1-via-wasip3/sockets';
import {
    fd_advise, fd_allocate, fd_close, fd_datasync,
    fd_fdstat_get, fd_fdstat_set_flags, fd_fdstat_set_rights,
    fd_filestat_get, fd_filestat_set_size, fd_filestat_set_times,
    fd_pread, fd_pwrite,
    fd_read, fd_write, fd_seek, fd_tell, fd_renumber, fd_sync, fd_readdir,
    path_create_directory, path_filestat_get, path_filestat_set_times,
    path_link, path_open, path_readlink, path_rename, path_symlink, path_unlink_file, path_remove_directory,
} from '../../../src/host/wasip1-via-wasip3/filesystem';
import { getView } from '../../../src/host/wasip1-via-wasip3/memory';
import { vfsErrorToErrno, vfsNodeTypeToFiletype, writeFilestat, vfsReadScatter, vfsReadScatterAt, vfsWriteGatherAt } from '../../../src/host/wasip1-via-wasip3/vfs-helpers';
import { VfsError, VfsNodeType } from '../../../src/host/wasip3/vfs';
import type { FsErrorCode } from '../../../src/host/wasip3/vfs';

function makeCtx(opts?: {
    args?: string[];
    env?: [string, string][];
    fs?: Map<string, Uint8Array | string>;
}): { ctx: AdapterContext; memory: WebAssembly.Memory } {
    const memory = new WebAssembly.Memory({ initial: 2 });
    const fdTable = createDefaultFdTable();
    const vfs = new MemoryVfsBackend();
    if (opts?.fs) {
        vfs.populateFromMap(opts.fs);
    }
    const ctx: AdapterContext = {
        getMemory: () => memory,
        fdTable,
        vfs,
        stdoutChunks: [],
        stderrChunks: [],
        args: opts?.args ?? [],
        envPairs: opts?.env ?? [],
        encoder: new TextEncoder(),
    };
    return { ctx, memory };
}

describe('WASI P1 cli functions', () => {
    describe('args_get / args_sizes_get', () => {
        test('writes args to memory', () => {
            const { ctx, memory } = makeCtx({ args: ['program', 'hello', 'world'] });
            const view = getView(memory);

            // args_sizes_get
            const rc1 = args_sizes_get(ctx, 1000, 1004);
            expect(rc1).toBe(Errno.Success);
            const argc = view.getUint32(1000, true);
            const argBufSize = view.getUint32(1004, true);
            expect(argc).toBe(3);
            // "program\0" + "hello\0" + "world\0"
            expect(argBufSize).toBe(8 + 6 + 6);

            // args_get: argv at 2000, argv_buf at 3000
            const rc2 = args_get(ctx, 2000, 3000);
            expect(rc2).toBe(Errno.Success);
            // Verify pointer array
            const ptr0 = view.getUint32(2000, true);
            const ptr1 = view.getUint32(2004, true);
            const ptr2 = view.getUint32(2008, true);
            expect(ptr0).toBe(3000);
            expect(ptr1).toBe(3008); // 3000 + 8
            expect(ptr2).toBe(3014); // 3008 + 6
            // Verify string data
            const dec = new TextDecoder();
            expect(dec.decode(new Uint8Array(memory.buffer, ptr0, 7))).toBe('program');
            expect(dec.decode(new Uint8Array(memory.buffer, ptr1, 5))).toBe('hello');
            expect(dec.decode(new Uint8Array(memory.buffer, ptr2, 5))).toBe('world');
        });

        test('handles empty args', () => {
            const { ctx, memory } = makeCtx({ args: [] });
            const view = getView(memory);
            const rc = args_sizes_get(ctx, 100, 104);
            expect(rc).toBe(Errno.Success);
            expect(view.getUint32(100, true)).toBe(0);
            expect(view.getUint32(104, true)).toBe(0);
        });
    });

    describe('environ_get / environ_sizes_get', () => {
        test('writes KEY=VALUE pairs to memory', () => {
            const { ctx, memory } = makeCtx({ env: [['FOO', 'bar'], ['BAZ', 'qux']] });
            const view = getView(memory);

            const rc1 = environ_sizes_get(ctx, 1000, 1004);
            expect(rc1).toBe(Errno.Success);
            expect(view.getUint32(1000, true)).toBe(2);
            // "FOO=bar\0" (8) + "BAZ=qux\0" (8)
            expect(view.getUint32(1004, true)).toBe(16);

            const rc2 = environ_get(ctx, 2000, 3000);
            expect(rc2).toBe(Errno.Success);
            const ptr0 = view.getUint32(2000, true);
            const ptr1 = view.getUint32(2004, true);
            const dec = new TextDecoder();
            expect(dec.decode(new Uint8Array(memory.buffer, ptr0, 7))).toBe('FOO=bar');
            expect(dec.decode(new Uint8Array(memory.buffer, ptr1, 7))).toBe('BAZ=qux');
        });

        test('handles empty env', () => {
            const { ctx, memory } = makeCtx();
            const view = getView(memory);
            const rc = environ_sizes_get(ctx, 100, 104);
            expect(rc).toBe(Errno.Success);
            expect(view.getUint32(100, true)).toBe(0);
            expect(view.getUint32(104, true)).toBe(0);
        });
    });

    describe('fd_prestat_get / fd_prestat_dir_name', () => {
        test('returns prestat for fd 3 (root preopen)', () => {
            const { ctx, memory } = makeCtx();
            const view = getView(memory);
            const rc = fd_prestat_get(ctx, 3, 500);
            expect(rc).toBe(Errno.Success);
            expect(view.getUint8(500 + PrestatLayout.tag.offset)).toBe(0); // Dir
            expect(view.getUint32(500 + PrestatLayout.u.offset, true)).toBe(1); // '/' length
        });

        test('fd_prestat_dir_name writes path', () => {
            const { ctx, memory } = makeCtx();
            const rc = fd_prestat_dir_name(ctx, 3, 600, 10);
            expect(rc).toBe(Errno.Success);
            const dec = new TextDecoder();
            expect(dec.decode(new Uint8Array(memory.buffer, 600, 1))).toBe('/');
        });

        test('returns Badf for non-preopen fd', () => {
            const { ctx } = makeCtx();
            expect(fd_prestat_get(ctx, 0, 500)).toBe(Errno.Badf);
            expect(fd_prestat_get(ctx, 99, 500)).toBe(Errno.Badf);
        });
    });

    describe('proc_exit', () => {
        test('throws WasiExit with code', () => {
            try {
                proc_exit(42);
                fail('should throw');
            } catch (e: unknown) {
                expect((e as Error).name).toBe('WasiExit');
                expect((e as { exitCode: number }).exitCode).toBe(42);
            }
        });

        test('throws WasiExit with code 0', () => {
            try {
                proc_exit(0);
                fail('should throw');
            } catch (e: unknown) {
                expect((e as Error).name).toBe('WasiExit');
                expect((e as { exitCode: number }).exitCode).toBe(0);
            }
        });
    });

    describe('sched_yield', () => {
        test('returns Success', () => {
            expect(sched_yield()).toBe(Errno.Success);
        });
    });
});

describe('WASI P1 clock functions', () => {
    test('clock_res_get Realtime returns 1000ns', () => {
        const { ctx, memory } = makeCtx();
        const view = getView(memory);
        const rc = clock_res_get(ctx, Clockid.Realtime, 800);
        expect(rc).toBe(Errno.Success);
        expect(view.getBigUint64(800, true)).toBe(1_000n);
    });

    test('clock_res_get Monotonic returns 1ns', () => {
        const { ctx, memory } = makeCtx();
        const view = getView(memory);
        const rc = clock_res_get(ctx, Clockid.Monotonic, 800);
        expect(rc).toBe(Errno.Success);
        expect(view.getBigUint64(800, true)).toBe(1n);
    });

    test('clock_res_get ProcessCputimeId returns Notsup', () => {
        const { ctx } = makeCtx();
        expect(clock_res_get(ctx, Clockid.ProcessCputimeId, 800)).toBe(Errno.Notsup);
    });

    test('clock_res_get ThreadCputimeId returns Notsup', () => {
        const { ctx } = makeCtx();
        expect(clock_res_get(ctx, Clockid.ThreadCputimeId, 800)).toBe(Errno.Notsup);
    });

    test('clock_res_get invalid id returns Inval', () => {
        const { ctx } = makeCtx();
        expect(clock_res_get(ctx, 99, 800)).toBe(Errno.Inval);
    });

    test('clock_time_get Realtime returns nonzero nanoseconds', () => {
        const { ctx, memory } = makeCtx();
        const view = getView(memory);
        const rc = clock_time_get(ctx, Clockid.Realtime, 0n, 800);
        expect(rc).toBe(Errno.Success);
        const ns = view.getBigUint64(800, true);
        expect(ns).toBeGreaterThan(0n);
        // Should be approximately Date.now() * 1_000_000
        const nowNs = BigInt(Date.now()) * 1_000_000n;
        // Within 10 seconds
        expect(ns).toBeGreaterThan(nowNs - 10_000_000_000n);
        expect(ns).toBeLessThan(nowNs + 10_000_000_000n);
    });

    test('clock_time_get Monotonic returns nonzero', () => {
        const { ctx, memory } = makeCtx();
        const view = getView(memory);
        const rc = clock_time_get(ctx, Clockid.Monotonic, 0n, 800);
        expect(rc).toBe(Errno.Success);
        const ns = view.getBigUint64(800, true);
        expect(ns).toBeGreaterThan(0n);
    });

    test('clock_time_get invalid returns Inval', () => {
        const { ctx } = makeCtx();
        expect(clock_time_get(ctx, 99, 0n, 800)).toBe(Errno.Inval);
    });
});

describe('WASI P1 random_get', () => {
    test('fills buffer with random bytes', () => {
        const { ctx, memory } = makeCtx();
        // Zero the target area first
        new Uint8Array(memory.buffer, 500, 32).fill(0);
        const rc = random_get(ctx, 500, 32);
        expect(rc).toBe(Errno.Success);
        const bytes = new Uint8Array(memory.buffer, 500, 32);
        // Very unlikely all 32 bytes are zero
        const hasNonZero = bytes.some(b => b !== 0);
        expect(hasNonZero).toBe(true);
    });

    test('zero-length succeeds', () => {
        const { ctx } = makeCtx();
        expect(random_get(ctx, 500, 0)).toBe(Errno.Success);
    });
});

describe('WASI P1 poll_oneoff', () => {
    test('handles clock subscription', () => {
        const { ctx, memory } = makeCtx();
        const view = getView(memory);
        const inPtr = 1000;
        const outPtr = 2000;
        const retPtr = 3000;

        // Write a clock subscription
        view.setBigUint64(inPtr + SubscriptionLayout.userdata.offset, 42n, true);
        view.setUint8(inPtr + SubscriptionLayout.u.offset, Eventtype.Clock);
        // Clock ID at u + 8
        view.setUint32(inPtr + SubscriptionLayout.u.offset + 8, Clockid.Monotonic, true);

        const rc = poll_oneoff(ctx, inPtr, outPtr, 1, retPtr);
        expect(rc).toBe(Errno.Success);
        expect(view.getUint32(retPtr, true)).toBe(1); // 1 event written
        expect(view.getBigUint64(outPtr + EventLayout.userdata.offset, true)).toBe(42n);
        expect(view.getUint16(outPtr + EventLayout.error.offset, true)).toBe(Errno.Success);
        expect(view.getUint8(outPtr + EventLayout.type.offset)).toBe(Eventtype.Clock);
    });

    test('handles FdRead subscription', () => {
        const { ctx, memory } = makeCtx();
        const view = getView(memory);
        const inPtr = 1000;
        const outPtr = 2000;
        const retPtr = 3000;

        view.setBigUint64(inPtr + SubscriptionLayout.userdata.offset, 99n, true);
        view.setUint8(inPtr + SubscriptionLayout.u.offset, Eventtype.FdRead);

        const rc = poll_oneoff(ctx, inPtr, outPtr, 1, retPtr);
        expect(rc).toBe(Errno.Success);
        expect(view.getUint32(retPtr, true)).toBe(1);
        expect(view.getUint8(outPtr + EventLayout.type.offset)).toBe(Eventtype.FdRead);
    });

    test('handles multiple subscriptions', () => {
        const { ctx, memory } = makeCtx();
        const view = getView(memory);
        const inPtr = 1000;
        const outPtr = 2000;
        const retPtr = 3000;

        // Sub 0: clock
        view.setBigUint64(inPtr, 1n, true);
        view.setUint8(inPtr + SubscriptionLayout.u.offset, Eventtype.Clock);
        view.setUint32(inPtr + SubscriptionLayout.u.offset + 8, Clockid.Realtime, true);
        // Sub 1: fd_write
        const sub1 = inPtr + SubscriptionLayout._size;
        view.setBigUint64(sub1, 2n, true);
        view.setUint8(sub1 + SubscriptionLayout.u.offset, Eventtype.FdWrite);

        const rc = poll_oneoff(ctx, inPtr, outPtr, 2, retPtr);
        expect(rc).toBe(Errno.Success);
        expect(view.getUint32(retPtr, true)).toBe(2);
    });

    test('unsupported clock returns Notsup in event error', () => {
        const { ctx, memory } = makeCtx();
        const view = getView(memory);
        const inPtr = 1000;
        const outPtr = 2000;
        const retPtr = 3000;

        view.setBigUint64(inPtr, 7n, true);
        view.setUint8(inPtr + SubscriptionLayout.u.offset, Eventtype.Clock);
        view.setUint32(inPtr + SubscriptionLayout.u.offset + 8, Clockid.ProcessCputimeId, true);

        const rc = poll_oneoff(ctx, inPtr, outPtr, 1, retPtr);
        expect(rc).toBe(Errno.Success);
        expect(view.getUint16(outPtr + EventLayout.error.offset, true)).toBe(Errno.Notsup);
    });
});

describe('WASI P1 socket stubs', () => {
    test('sock_accept returns Notsup', () => {
        expect(sock_accept(0, 0, 0)).toBe(Errno.Notsup);
    });
    test('sock_recv returns Notsup', () => {
        expect(sock_recv(0, 0, 0, 0, 0, 0)).toBe(Errno.Notsup);
    });
    test('sock_send returns Notsup', () => {
        expect(sock_send(0, 0, 0, 0, 0)).toBe(Errno.Notsup);
    });
    test('sock_shutdown returns Notsup', () => {
        expect(sock_shutdown(0, 0)).toBe(Errno.Notsup);
    });
});

describe('WASI P1 filesystem functions', () => {
    describe('fd_advise / fd_allocate / fd_datasync / fd_sync', () => {
        test('fd_advise returns Success', () => {
            const { ctx } = makeCtx();
            expect(fd_advise(ctx, 0, 0n, 0n, 0)).toBe(Errno.Success);
        });
        test('fd_allocate returns Notsup', () => {
            const { ctx } = makeCtx();
            expect(fd_allocate(ctx, 0, 0n, 0n)).toBe(Errno.Notsup);
        });
        test('fd_datasync returns Success', () => {
            const { ctx } = makeCtx();
            expect(fd_datasync(ctx, 0)).toBe(Errno.Success);
        });
        test('fd_sync returns Success', () => {
            const { ctx } = makeCtx();
            expect(fd_sync(ctx, 0)).toBe(Errno.Success);
        });
    });

    describe('fd_close', () => {
        test('closes valid fd', () => {
            const { ctx } = makeCtx();
            // fd 3 is the preopen
            expect(fd_close(ctx, 3)).toBe(Errno.Success);
            expect(ctx.fdTable.get(3)).toBeUndefined();
        });
        test('returns Badf for invalid fd', () => {
            const { ctx } = makeCtx();
            expect(fd_close(ctx, 99)).toBe(Errno.Badf);
        });
    });

    describe('fd_fdstat_get', () => {
        test('returns fdstat for stdout', () => {
            const { ctx, memory } = makeCtx();
            const view = getView(memory);
            const rc = fd_fdstat_get(ctx, 1, 500);
            expect(rc).toBe(Errno.Success);
            expect(view.getUint8(500 + FdstatLayout.fs_filetype.offset)).toBe(Filetype.CharacterDevice);
            expect(view.getUint16(500 + FdstatLayout.fs_flags.offset, true)).toBe(Fdflags.Append);
        });
        test('returns Badf for invalid fd', () => {
            const { ctx } = makeCtx();
            expect(fd_fdstat_get(ctx, 99, 500)).toBe(Errno.Badf);
        });
    });

    describe('fd_fdstat_set_flags / fd_fdstat_set_rights', () => {
        test('fd_fdstat_set_flags returns Success', () => {
            const { ctx } = makeCtx();
            expect(fd_fdstat_set_flags(ctx, 0, 0)).toBe(Errno.Success);
        });
        test('fd_fdstat_set_rights returns Success', () => {
            const { ctx } = makeCtx();
            expect(fd_fdstat_set_rights(ctx, 0, 0n, 0n)).toBe(Errno.Success);
        });
    });

    describe('fd_write to stdout', () => {
        test('writes data to stdout chunks', () => {
            const { ctx, memory } = makeCtx();
            const view = getView(memory);
            // Write "hello" at offset 200
            const data = new TextEncoder().encode('hello');
            new Uint8Array(memory.buffer, 200, data.length).set(data);
            // ciovec at 100: buf=200, len=5
            view.setUint32(100 + CiovecLayout.buf.offset, 200, true);
            view.setUint32(100 + CiovecLayout.buf_len.offset, 5, true);
            // nwritten at 300
            const rc = fd_write(ctx, 1, 100, 1, 300);
            expect(rc).toBe(Errno.Success);
            expect(view.getUint32(300, true)).toBe(5);
            expect(ctx.stdoutChunks.length).toBe(1);
            expect(new TextDecoder().decode(ctx.stdoutChunks[0])).toBe('hello');
        });
    });

    describe('fd_write to stderr', () => {
        test('writes data to stderr chunks', () => {
            const { ctx, memory } = makeCtx();
            const view = getView(memory);
            const data = new TextEncoder().encode('error!');
            new Uint8Array(memory.buffer, 200, data.length).set(data);
            view.setUint32(100, 200, true);
            view.setUint32(104, 6, true);
            const rc = fd_write(ctx, 2, 100, 1, 300);
            expect(rc).toBe(Errno.Success);
            expect(ctx.stderrChunks.length).toBe(1);
            expect(new TextDecoder().decode(ctx.stderrChunks[0])).toBe('error!');
        });
    });

    describe('fd_read from stdin', () => {
        test('returns 0 bytes read', () => {
            const { ctx, memory } = makeCtx();
            const view = getView(memory);
            // iovec at 100: buf=200, len=10
            view.setUint32(100, 200, true);
            view.setUint32(104, 10, true);
            const rc = fd_read(ctx, 0, 100, 1, 300);
            expect(rc).toBe(Errno.Success);
            expect(view.getUint32(300, true)).toBe(0);
        });
    });

    describe('fd_seek / fd_tell', () => {
        test('seek and tell on a file fd', () => {
            const { ctx, memory } = makeCtx({ fs: new Map([['test.txt', 'abcdef']]) });
            const view = getView(memory);

            // Open test.txt via path_open
            const pathStr = 'test.txt';
            const pathBytes = new TextEncoder().encode(pathStr);
            new Uint8Array(memory.buffer, 400, pathBytes.length).set(pathBytes);
            const rc = path_open(ctx, 3, 0, 400, pathBytes.length, 0, BigInt(Rights.FdRead | Rights.FdSeek | Rights.FdTell), 0n, 0, 500);
            expect(rc).toBe(Errno.Success);
            const fileFd = view.getUint32(500, true);

            // Seek to position 3
            const seekRc = fd_seek(ctx, fileFd, 3n, Whence.Set, 600);
            expect(seekRc).toBe(Errno.Success);
            expect(view.getBigUint64(600, true)).toBe(3n);

            // Tell should return 3
            const tellRc = fd_tell(ctx, fileFd, 700);
            expect(tellRc).toBe(Errno.Success);
            expect(view.getBigUint64(700, true)).toBe(3n);
        });

        test('seek returns Badf for invalid fd', () => {
            const { ctx } = makeCtx();
            expect(fd_seek(ctx, 99, 0n, Whence.Set, 500)).toBe(Errno.Badf);
        });

        test('tell returns Badf for invalid fd', () => {
            const { ctx } = makeCtx();
            expect(fd_tell(ctx, 99, 500)).toBe(Errno.Badf);
        });
    });

    describe('fd_renumber', () => {
        test('renumbers fd', () => {
            const { ctx } = makeCtx();
            expect(fd_renumber(ctx, 3, 10)).toBe(Errno.Success);
            expect(ctx.fdTable.get(3)).toBeUndefined();
            expect(ctx.fdTable.get(10)).toBeDefined();
        });
        test('returns Badf for invalid fd', () => {
            const { ctx } = makeCtx();
            expect(fd_renumber(ctx, 99, 10)).toBe(Errno.Badf);
        });
    });

    describe('fd_filestat_get', () => {
        test('returns filestat for stdout', () => {
            const { ctx, memory } = makeCtx();
            const view = getView(memory);
            const rc = fd_filestat_get(ctx, 1, 500);
            expect(rc).toBe(Errno.Success);
            expect(view.getUint8(500 + FilestatLayout.filetype.offset)).toBe(Filetype.CharacterDevice);
        });
        test('returns Badf for invalid fd', () => {
            const { ctx } = makeCtx();
            expect(fd_filestat_get(ctx, 99, 500)).toBe(Errno.Badf);
        });
    });

    describe('path_create_directory / path_remove_directory', () => {
        test('creates and removes directory', () => {
            const { ctx, memory } = makeCtx();
            const path = 'testdir';
            const pathBytes = new TextEncoder().encode(path);
            new Uint8Array(memory.buffer, 400, pathBytes.length).set(pathBytes);
            const createRc = path_create_directory(ctx, 3, 400, pathBytes.length);
            expect(createRc).toBe(Errno.Success);
            const removeRc = path_remove_directory(ctx, 3, 400, pathBytes.length);
            expect(removeRc).toBe(Errno.Success);
        });
    });

    describe('path_open / path_unlink_file', () => {
        test('opens a file and gets its stat', () => {
            const { ctx, memory } = makeCtx({ fs: new Map([['hello.txt', 'hello world']]) });
            const view = getView(memory);
            const path = 'hello.txt';
            const pathBytes = new TextEncoder().encode(path);
            new Uint8Array(memory.buffer, 400, pathBytes.length).set(pathBytes);

            const rc = path_open(ctx, 3, 0, 400, pathBytes.length, 0, BigInt(Rights.FdRead), 0n, 0, 500);
            expect(rc).toBe(Errno.Success);
            const fileFd = view.getUint32(500, true);
            expect(fileFd).toBeGreaterThanOrEqual(4);

            // Check filestat
            const statRc = fd_filestat_get(ctx, fileFd, 600);
            expect(statRc).toBe(Errno.Success);
            expect(view.getUint8(600 + FilestatLayout.filetype.offset)).toBe(Filetype.RegularFile);
            expect(view.getBigUint64(600 + FilestatLayout.size.offset, true)).toBe(11n);
        });

        test('path_open returns Noent for missing file', () => {
            const { ctx, memory } = makeCtx();
            const path = 'nonexistent.txt';
            const pathBytes = new TextEncoder().encode(path);
            new Uint8Array(memory.buffer, 400, pathBytes.length).set(pathBytes);
            const rc = path_open(ctx, 3, 0, 400, pathBytes.length, 0, BigInt(Rights.FdRead), 0n, 0, 500);
            expect(rc).toBe(Errno.Noent);
        });

        test('unlinks a file', () => {
            const { ctx, memory } = makeCtx({ fs: new Map([['todelete.txt', 'bye']]) });
            const path = 'todelete.txt';
            const pathBytes = new TextEncoder().encode(path);
            new Uint8Array(memory.buffer, 400, pathBytes.length).set(pathBytes);
            const rc = path_unlink_file(ctx, 3, 400, pathBytes.length);
            expect(rc).toBe(Errno.Success);
            // Opening should now fail
            const openRc = path_open(ctx, 3, 0, 400, pathBytes.length, 0, BigInt(Rights.FdRead), 0n, 0, 500);
            expect(openRc).toBe(Errno.Noent);
        });
    });

    describe('path_filestat_get', () => {
        test('gets stat for existing file', () => {
            const { ctx, memory } = makeCtx({ fs: new Map([['data.txt', 'test data']]) });
            const view = getView(memory);
            const path = 'data.txt';
            const pathBytes = new TextEncoder().encode(path);
            new Uint8Array(memory.buffer, 400, pathBytes.length).set(pathBytes);
            const rc = path_filestat_get(ctx, 3, 0, 400, pathBytes.length, 500);
            expect(rc).toBe(Errno.Success);
            expect(view.getUint8(500 + FilestatLayout.filetype.offset)).toBe(Filetype.RegularFile);
        });

        test('returns Noent for missing file', () => {
            const { ctx, memory } = makeCtx();
            const path = 'nope.txt';
            const pathBytes = new TextEncoder().encode(path);
            new Uint8Array(memory.buffer, 400, pathBytes.length).set(pathBytes);
            const rc = path_filestat_get(ctx, 3, 0, 400, pathBytes.length, 500);
            expect(rc).toBe(Errno.Noent);
        });
    });

    describe('fd_write to VFS file', () => {
        test('writes to a VFS file via fd', () => {
            const { ctx, memory } = makeCtx({ fs: new Map([['out.txt', '']]) });
            const view = getView(memory);
            const path = 'out.txt';
            const pathBytes = new TextEncoder().encode(path);
            new Uint8Array(memory.buffer, 400, pathBytes.length).set(pathBytes);

            // Open file for writing
            const openRc = path_open(ctx, 3, 0, 400, pathBytes.length, 0, BigInt(Rights.FdWrite), 0n, 0, 500);
            expect(openRc).toBe(Errno.Success);
            const fileFd = view.getUint32(500, true);

            // Write "test" to file
            const data = new TextEncoder().encode('test');
            new Uint8Array(memory.buffer, 700, data.length).set(data);
            view.setUint32(600, 700, true);
            view.setUint32(604, 4, true);
            const writeRc = fd_write(ctx, fileFd, 600, 1, 800);
            expect(writeRc).toBe(Errno.Success);
            expect(view.getUint32(800, true)).toBe(4);
        });
    });

    describe('fd_pread / fd_pwrite', () => {
        test('pwrite writes at offset without changing position', () => {
            const { ctx, memory } = makeCtx({ fs: new Map([['ptest.txt', 'abcdef']]) });
            const view = getView(memory);
            const path = 'ptest.txt';
            const pathBytes = new TextEncoder().encode(path);
            new Uint8Array(memory.buffer, 400, pathBytes.length).set(pathBytes);
            const rc = path_open(ctx, 3, 0, 400, pathBytes.length, 0,
                BigInt(Rights.FdRead | Rights.FdWrite | Rights.FdSeek | Rights.FdTell), 0n, 0, 500);
            expect(rc).toBe(Errno.Success);
            const fileFd = view.getUint32(500, true);

            // pwrite "XY" at offset 2
            const data = new TextEncoder().encode('XY');
            new Uint8Array(memory.buffer, 700, data.length).set(data);
            view.setUint32(600, 700, true);
            view.setUint32(604, 2, true);
            const writeRc = fd_pwrite(ctx, fileFd, 600, 1, 2n, 800);
            expect(writeRc).toBe(Errno.Success);
            expect(view.getUint32(800, true)).toBe(2);

            // position should still be 0
            const tellRc = fd_tell(ctx, fileFd, 900);
            expect(tellRc).toBe(Errno.Success);
            expect(view.getBigUint64(900, true)).toBe(0n);
        });

        test('pread reads at offset without changing position', () => {
            const { ctx, memory } = makeCtx({ fs: new Map([['pread.txt', 'hello world']]) });
            const view = getView(memory);
            const path = 'pread.txt';
            const pathBytes = new TextEncoder().encode(path);
            new Uint8Array(memory.buffer, 400, pathBytes.length).set(pathBytes);
            const rc = path_open(ctx, 3, 0, 400, pathBytes.length, 0,
                BigInt(Rights.FdRead | Rights.FdSeek | Rights.FdTell), 0n, 0, 500);
            expect(rc).toBe(Errno.Success);
            const fileFd = view.getUint32(500, true);

            // pread 5 bytes from offset 6 ("world")
            view.setUint32(600, 700, true); // buf at 700
            view.setUint32(604, 5, true); // len=5
            const readRc = fd_pread(ctx, fileFd, 600, 1, 6n, 800);
            expect(readRc).toBe(Errno.Success);
            expect(view.getUint32(800, true)).toBe(5);
            expect(new TextDecoder().decode(new Uint8Array(memory.buffer, 700, 5))).toBe('world');

            // position should still be 0
            const tellRc = fd_tell(ctx, fileFd, 900);
            expect(tellRc).toBe(Errno.Success);
            expect(view.getBigUint64(900, true)).toBe(0n);
        });

        test('pread returns Badf for invalid fd', () => {
            const { ctx } = makeCtx();
            expect(fd_pread(ctx, 99, 0, 0, 0n, 0)).toBe(Errno.Badf);
        });

        test('pwrite returns Badf for invalid fd', () => {
            const { ctx } = makeCtx();
            expect(fd_pwrite(ctx, 99, 0, 0, 0n, 0)).toBe(Errno.Badf);
        });
    });

    describe('fd_readdir', () => {
        test('reads directory entries', () => {
            const { ctx, memory } = makeCtx({
                fs: new Map([['sub/a.txt', 'a'], ['sub/b.txt', 'b']]),
            });
            const view = getView(memory);

            // Open "sub" directory
            const path = 'sub';
            const pathBytes = new TextEncoder().encode(path);
            new Uint8Array(memory.buffer, 400, pathBytes.length).set(pathBytes);
            const rc = path_open(ctx, 3, 0, 400, pathBytes.length, 2 /* Oflags.Directory */,
                BigInt(Rights.FdReaddir), 0n, 0, 500);
            expect(rc).toBe(Errno.Success);
            const dirFd = view.getUint32(500, true);

            // Read directory with large buffer
            const readdirRc = fd_readdir(ctx, dirFd, 1000, 4096, 0n, 5000);
            expect(readdirRc).toBe(Errno.Success);
            const bytesUsed = view.getUint32(5000, true);
            expect(bytesUsed).toBeGreaterThan(0);
        });

        test('returns Badf for invalid fd', () => {
            const { ctx } = makeCtx();
            expect(fd_readdir(ctx, 99, 0, 0, 0n, 0)).toBe(Errno.Badf);
        });
    });

    describe('fd_filestat_set_size', () => {
        test('truncates a file', () => {
            const { ctx, memory } = makeCtx({ fs: new Map([['trunc.txt', 'hello world']]) });
            const view = getView(memory);
            const path = 'trunc.txt';
            const pathBytes = new TextEncoder().encode(path);
            new Uint8Array(memory.buffer, 400, pathBytes.length).set(pathBytes);
            const rc = path_open(ctx, 3, 0, 400, pathBytes.length, 0,
                BigInt(Rights.FdWrite | Rights.FdFilestatGet), 0n, 0, 500);
            expect(rc).toBe(Errno.Success);
            const fileFd = view.getUint32(500, true);

            const setRc = fd_filestat_set_size(ctx, fileFd, 5n);
            expect(setRc).toBe(Errno.Success);
        });

        test('returns Badf for invalid fd', () => {
            const { ctx } = makeCtx();
            expect(fd_filestat_set_size(ctx, 99, 0n)).toBe(Errno.Badf);
        });
    });

    describe('fd_filestat_set_times', () => {
        test('sets times on a file', () => {
            const { ctx, memory } = makeCtx({ fs: new Map([['times.txt', 'data']]) });
            const view = getView(memory);
            const path = 'times.txt';
            const pathBytes = new TextEncoder().encode(path);
            new Uint8Array(memory.buffer, 400, pathBytes.length).set(pathBytes);
            const rc = path_open(ctx, 3, 0, 400, pathBytes.length, 0,
                BigInt(Rights.FdWrite | Rights.FdFilestatGet), 0n, 0, 500);
            expect(rc).toBe(Errno.Success);
            const fileFd = view.getUint32(500, true);

            // Set both atim and mtim to now
            const setRc = fd_filestat_set_times(ctx, fileFd, 0n, 0n, 2 | 8); // AtimNow | MtimNow
            expect(setRc).toBe(Errno.Success);
        });

        test('returns Badf for invalid fd', () => {
            const { ctx } = makeCtx();
            expect(fd_filestat_set_times(ctx, 99, 0n, 0n, 0)).toBe(Errno.Badf);
        });
    });

    describe('fd_read from VFS file', () => {
        test('reads data from a VFS file', () => {
            const { ctx, memory } = makeCtx({ fs: new Map([['read-me.txt', 'file content here']]) });
            const view = getView(memory);
            const path = 'read-me.txt';
            const pathBytes = new TextEncoder().encode(path);
            new Uint8Array(memory.buffer, 400, pathBytes.length).set(pathBytes);
            const rc = path_open(ctx, 3, 0, 400, pathBytes.length, 0,
                BigInt(Rights.FdRead | Rights.FdSeek), 0n, 0, 500);
            expect(rc).toBe(Errno.Success);
            const fileFd = view.getUint32(500, true);

            // iovec: buf=700, len=17
            view.setUint32(600, 700, true);
            view.setUint32(604, 17, true);
            const readRc = fd_read(ctx, fileFd, 600, 1, 800);
            expect(readRc).toBe(Errno.Success);
            expect(view.getUint32(800, true)).toBe(17);
            expect(new TextDecoder().decode(new Uint8Array(memory.buffer, 700, 17))).toBe('file content here');
        });
    });

    describe('fd_seek whence variants', () => {
        test('seek Cur from current position', () => {
            const { ctx, memory } = makeCtx({ fs: new Map([['seektest.txt', 'abcdefghij']]) });
            const view = getView(memory);
            const path = 'seektest.txt';
            const pathBytes = new TextEncoder().encode(path);
            new Uint8Array(memory.buffer, 400, pathBytes.length).set(pathBytes);
            const rc = path_open(ctx, 3, 0, 400, pathBytes.length, 0,
                BigInt(Rights.FdRead | Rights.FdSeek | Rights.FdTell), 0n, 0, 500);
            expect(rc).toBe(Errno.Success);
            const fileFd = view.getUint32(500, true);

            // First seek to 3
            fd_seek(ctx, fileFd, 3n, Whence.Set, 600);
            // Then seek +2 from Cur
            const seekRc = fd_seek(ctx, fileFd, 2n, Whence.Cur, 600);
            expect(seekRc).toBe(Errno.Success);
            expect(view.getBigUint64(600, true)).toBe(5n);
        });

        test('seek End from end of file', () => {
            const { ctx, memory } = makeCtx({ fs: new Map([['seekend.txt', 'abcdefghij']]) });
            const view = getView(memory);
            const path = 'seekend.txt';
            const pathBytes = new TextEncoder().encode(path);
            new Uint8Array(memory.buffer, 400, pathBytes.length).set(pathBytes);
            const rc = path_open(ctx, 3, 0, 400, pathBytes.length, 0,
                BigInt(Rights.FdRead | Rights.FdSeek | Rights.FdTell | Rights.FdFilestatGet), 0n, 0, 500);
            expect(rc).toBe(Errno.Success);
            const fileFd = view.getUint32(500, true);

            const seekRc = fd_seek(ctx, fileFd, 0n, Whence.End, 600);
            expect(seekRc).toBe(Errno.Success);
            expect(view.getBigUint64(600, true)).toBe(10n);
        });
    });

    describe('path_filestat_set_times', () => {
        test('sets times on a path', () => {
            const { ctx, memory } = makeCtx({ fs: new Map([['timed.txt', 'data']]) });
            const path = 'timed.txt';
            const pathBytes = new TextEncoder().encode(path);
            new Uint8Array(memory.buffer, 400, pathBytes.length).set(pathBytes);
            const setRc = path_filestat_set_times(ctx, 3, 0, 400, pathBytes.length, 0n, 0n, 2 | 8);
            expect(setRc).toBe(Errno.Success);
        });

        test('returns Noent for missing path', () => {
            const { ctx, memory } = makeCtx();
            const path = 'missing.txt';
            const pathBytes = new TextEncoder().encode(path);
            new Uint8Array(memory.buffer, 400, pathBytes.length).set(pathBytes);
            const setRc = path_filestat_set_times(ctx, 3, 0, 400, pathBytes.length, 0n, 0n, 0);
            expect(setRc).toBe(Errno.Noent);
        });
    });

    describe('path_link', () => {
        test('links a file', () => {
            const { ctx, memory } = makeCtx({ fs: new Map([['orig.txt', 'data']]) });
            const old = 'orig.txt';
            const oldBytes = new TextEncoder().encode(old);
            new Uint8Array(memory.buffer, 400, oldBytes.length).set(oldBytes);
            const newp = 'link.txt';
            const newBytes = new TextEncoder().encode(newp);
            new Uint8Array(memory.buffer, 500, newBytes.length).set(newBytes);
            const rc = path_link(ctx, 3, 0, 400, oldBytes.length, 3, 500, newBytes.length);
            expect(rc).toBe(Errno.Success);
        });
    });

    describe('path_rename', () => {
        test('renames a file', () => {
            const { ctx, memory } = makeCtx({ fs: new Map([['old.txt', 'data']]) });
            const old = 'old.txt';
            const oldBytes = new TextEncoder().encode(old);
            new Uint8Array(memory.buffer, 400, oldBytes.length).set(oldBytes);
            const newp = 'new.txt';
            const newBytes = new TextEncoder().encode(newp);
            new Uint8Array(memory.buffer, 500, newBytes.length).set(newBytes);
            const rc = path_rename(ctx, 3, 400, oldBytes.length, 3, 500, newBytes.length);
            expect(rc).toBe(Errno.Success);
        });
    });

    describe('path_symlink', () => {
        test('creates a symlink', () => {
            const { ctx, memory } = makeCtx({ fs: new Map([['target.txt', 'data']]) });
            const target = 'target.txt';
            const targetBytes = new TextEncoder().encode(target);
            new Uint8Array(memory.buffer, 400, targetBytes.length).set(targetBytes);
            const link = 'sym.txt';
            const linkBytes = new TextEncoder().encode(link);
            new Uint8Array(memory.buffer, 500, linkBytes.length).set(linkBytes);
            const rc = path_symlink(ctx, 400, targetBytes.length, 3, 500, linkBytes.length);
            expect(rc).toBe(Errno.Success);
        });
    });

    describe('path_readlink', () => {
        test('reads a symlink', () => {
            const { ctx, memory } = makeCtx({ fs: new Map([['target.txt', 'data']]) });
            const view = getView(memory);
            // Create symlink first
            const target = 'target.txt';
            const targetBytes = new TextEncoder().encode(target);
            new Uint8Array(memory.buffer, 400, targetBytes.length).set(targetBytes);
            const link = 'mylink';
            const linkBytes = new TextEncoder().encode(link);
            new Uint8Array(memory.buffer, 500, linkBytes.length).set(linkBytes);
            path_symlink(ctx, 400, targetBytes.length, 3, 500, linkBytes.length);

            // Read it back
            const rc = path_readlink(ctx, 3, 500, linkBytes.length, 700, 256, 800);
            expect(rc).toBe(Errno.Success);
            const len = view.getUint32(800, true);
            expect(len).toBe(target.length);
        });
    });
});

describe('vfs-helpers unit tests', () => {
    describe('vfsErrorToErrno', () => {
        test('maps known VfsError codes', () => {
            expect(vfsErrorToErrno(new VfsError('access'))).toBe(Errno.Acces);
            expect(vfsErrorToErrno(new VfsError('exist'))).toBe(Errno.Exist);
            expect(vfsErrorToErrno(new VfsError('invalid'))).toBe(Errno.Inval);
            expect(vfsErrorToErrno(new VfsError('io'))).toBe(Errno.Io);
            expect(vfsErrorToErrno(new VfsError('is-directory'))).toBe(Errno.Isdir);
            expect(vfsErrorToErrno(new VfsError('name-too-long'))).toBe(Errno.Nametoolong);
            expect(vfsErrorToErrno(new VfsError('no-entry'))).toBe(Errno.Noent);
            expect(vfsErrorToErrno(new VfsError('not-directory'))).toBe(Errno.Notdir);
            expect(vfsErrorToErrno(new VfsError('not-empty'))).toBe(Errno.Notempty);
            expect(vfsErrorToErrno(new VfsError('not-permitted'))).toBe(Errno.Perm);
            expect(vfsErrorToErrno(new VfsError('read-only'))).toBe(Errno.Rofs);
            expect(vfsErrorToErrno(new VfsError('cross-device'))).toBe(Errno.Xdev);
            expect(vfsErrorToErrno(new VfsError('insufficient-space'))).toBe(Errno.Nospc);
            expect(vfsErrorToErrno(new VfsError('overflow'))).toBe(Errno.Overflow);
            expect(vfsErrorToErrno(new VfsError('unsupported'))).toBe(Errno.Notsup);
            expect(vfsErrorToErrno(new VfsError('bad-descriptor'))).toBe(Errno.Badf);
            expect(vfsErrorToErrno(new VfsError('loop'))).toBe(Errno.Loop);
        });

        test('maps unknown VfsError code to Io', () => {
            expect(vfsErrorToErrno(new VfsError('unknown-code' as FsErrorCode))).toBe(Errno.Io);
        });

        test('maps non-VfsError to Io', () => {
            expect(vfsErrorToErrno(new Error('random error'))).toBe(Errno.Io);
            expect(vfsErrorToErrno('string error')).toBe(Errno.Io);
            expect(vfsErrorToErrno(null)).toBe(Errno.Io);
        });
    });

    describe('vfsNodeTypeToFiletype', () => {
        test('maps all node types', () => {
            expect(vfsNodeTypeToFiletype(VfsNodeType.File)).toBe(Filetype.RegularFile);
            expect(vfsNodeTypeToFiletype(VfsNodeType.Directory)).toBe(Filetype.Directory);
            expect(vfsNodeTypeToFiletype(VfsNodeType.Symlink)).toBe(Filetype.SymbolicLink);
            expect(vfsNodeTypeToFiletype(99 as VfsNodeType)).toBe(Filetype.Unknown);
        });
    });

    describe('writeFilestat', () => {
        test('writes filestat fields to DataView', () => {
            const buf = new ArrayBuffer(128);
            const view = new DataView(buf);
            const stat = {
                nodeId: 42,
                type: VfsNodeType.File,
                linkCount: 1n,
                size: 1024n,
                accessTime: 100n,
                modifyTime: 200n,
                changeTime: 300n,
            };
            writeFilestat(view, 0, stat);
            expect(view.getBigUint64(FilestatLayout.ino.offset, true)).toBe(42n);
            expect(view.getUint8(FilestatLayout.filetype.offset)).toBe(Filetype.RegularFile);
            expect(view.getBigUint64(FilestatLayout.nlink.offset, true)).toBe(1n);
            expect(view.getBigUint64(FilestatLayout.size.offset, true)).toBe(1024n);
            expect(view.getBigUint64(FilestatLayout.atim.offset, true)).toBe(100n);
            expect(view.getBigUint64(FilestatLayout.mtim.offset, true)).toBe(200n);
            expect(view.getBigUint64(FilestatLayout.ctim.offset, true)).toBe(300n);
        });
    });
});

describe('scatter-gather I/O', () => {
    function makeFileEntry(vfsPath: string[]): FdEntry {
        return {
            kind: FdKind.File,
            filetype: Filetype.RegularFile,
            flags: 0 as Fdflags,
            rightsBase: Rights.FdRead | Rights.FdWrite | Rights.FdSeek,
            rightsInheriting: 0 as Rights,
            vfsPath,
            position: 0n,
        };
    }

    describe('vfsReadScatter', () => {
        test('reads into multiple iovecs', () => {
            const { ctx, memory } = makeCtx({ fs: new Map([['multi.txt', 'abcdefghij']]) });
            const view = getView(memory);
            const entry = makeFileEntry(['multi.txt']);

            // iovec[0]: buf=1000, len=3
            view.setUint32(800, 1000, true);
            view.setUint32(804, 3, true);
            // iovec[1]: buf=1100, len=4
            view.setUint32(808, 1100, true);
            view.setUint32(812, 4, true);
            // iovec[2]: buf=1200, len=3
            view.setUint32(816, 1200, true);
            view.setUint32(820, 3, true);

            const rc = vfsReadScatter(ctx, entry, memory, 800, 3, 900);
            expect(rc).toBe(Errno.Success);
            expect(view.getUint32(900, true)).toBe(10);
            expect(new TextDecoder().decode(new Uint8Array(memory.buffer, 1000, 3))).toBe('abc');
            expect(new TextDecoder().decode(new Uint8Array(memory.buffer, 1100, 4))).toBe('defg');
            expect(new TextDecoder().decode(new Uint8Array(memory.buffer, 1200, 3))).toBe('hij');
        });

        test('handles partial EOF mid-read across iovecs', () => {
            const { ctx, memory } = makeCtx({ fs: new Map([['short.txt', 'abcde']]) });
            const view = getView(memory);
            const entry = makeFileEntry(['short.txt']);

            // iovec[0]: buf=1000, len=3
            view.setUint32(800, 1000, true);
            view.setUint32(804, 3, true);
            // iovec[1]: buf=1100, len=10 (more than remaining)
            view.setUint32(808, 1100, true);
            view.setUint32(812, 10, true);

            const rc = vfsReadScatter(ctx, entry, memory, 800, 2, 900);
            expect(rc).toBe(Errno.Success);
            // Only 5 bytes available: 3 in first iovec + 2 in second (short read)
            expect(view.getUint32(900, true)).toBe(5);
            expect(new TextDecoder().decode(new Uint8Array(memory.buffer, 1000, 3))).toBe('abc');
            expect(new TextDecoder().decode(new Uint8Array(memory.buffer, 1100, 2))).toBe('de');
        });

        test('skips zero-length iovecs', () => {
            const { ctx, memory } = makeCtx({ fs: new Map([['zero.txt', 'hello']]) });
            const view = getView(memory);
            const entry = makeFileEntry(['zero.txt']);

            // iovec[0]: buf=1000, len=0 (zero-length)
            view.setUint32(800, 1000, true);
            view.setUint32(804, 0, true);
            // iovec[1]: buf=1100, len=5
            view.setUint32(808, 1100, true);
            view.setUint32(812, 5, true);

            const rc = vfsReadScatter(ctx, entry, memory, 800, 2, 900);
            expect(rc).toBe(Errno.Success);
            expect(view.getUint32(900, true)).toBe(5);
            expect(new TextDecoder().decode(new Uint8Array(memory.buffer, 1100, 5))).toBe('hello');
        });

        test('reads zero bytes from empty file', () => {
            const { ctx, memory } = makeCtx({ fs: new Map([['empty.txt', '']]) });
            const view = getView(memory);
            const entry = makeFileEntry(['empty.txt']);

            // iovec[0]: buf=1000, len=10
            view.setUint32(800, 1000, true);
            view.setUint32(804, 10, true);

            const rc = vfsReadScatter(ctx, entry, memory, 800, 1, 900);
            expect(rc).toBe(Errno.Success);
            expect(view.getUint32(900, true)).toBe(0);
        });

        test('advances file position after scatter read', () => {
            const { ctx, memory } = makeCtx({ fs: new Map([['pos.txt', 'abcdefghij']]) });
            const view = getView(memory);
            const entry = makeFileEntry(['pos.txt']);

            view.setUint32(800, 1000, true);
            view.setUint32(804, 4, true);

            vfsReadScatter(ctx, entry, memory, 800, 1, 900);
            expect(entry.position).toBe(4n);

            // Second read should start from position 4
            vfsReadScatter(ctx, entry, memory, 800, 1, 900);
            expect(view.getUint32(900, true)).toBe(4);
            expect(new TextDecoder().decode(new Uint8Array(memory.buffer, 1000, 4))).toBe('efgh');
        });
    });

    describe('vfsReadScatterAt', () => {
        test('reads at offset without changing entry position', () => {
            const { ctx, memory } = makeCtx({ fs: new Map([['at.txt', 'hello world']]) });
            const view = getView(memory);

            // iovec[0]: buf=1000, len=5
            view.setUint32(800, 1000, true);
            view.setUint32(804, 5, true);

            const rc = vfsReadScatterAt(ctx, ['at.txt'], 6n, memory, 800, 1, 900);
            expect(rc).toBe(Errno.Success);
            expect(view.getUint32(900, true)).toBe(5);
            expect(new TextDecoder().decode(new Uint8Array(memory.buffer, 1000, 5))).toBe('world');
        });

        test('reads across multiple iovecs at offset with partial EOF', () => {
            const { ctx, memory } = makeCtx({ fs: new Map([['atp.txt', 'abcdefgh']]) });
            const view = getView(memory);

            // Read from offset 5: "fgh" (3 bytes)
            // iovec[0]: buf=1000, len=2
            view.setUint32(800, 1000, true);
            view.setUint32(804, 2, true);
            // iovec[1]: buf=1100, len=10 (more than remaining)
            view.setUint32(808, 1100, true);
            view.setUint32(812, 10, true);

            const rc = vfsReadScatterAt(ctx, ['atp.txt'], 5n, memory, 800, 2, 900);
            expect(rc).toBe(Errno.Success);
            expect(view.getUint32(900, true)).toBe(3);
            expect(new TextDecoder().decode(new Uint8Array(memory.buffer, 1000, 2))).toBe('fg');
            expect(new TextDecoder().decode(new Uint8Array(memory.buffer, 1100, 1))).toBe('h');
        });
    });

    describe('vfsWriteGatherAt', () => {
        test('writes gathered bytes from multiple iovecs at offset', () => {
            const { ctx, memory } = makeCtx({ fs: new Map([['wg.txt', 'xxxxxxxxxx']]) });
            const view = getView(memory);

            // First data buffer at 1000: "AB"
            new Uint8Array(memory.buffer, 1000, 2).set(new TextEncoder().encode('AB'));
            // Second data buffer at 1100: "CD"
            new Uint8Array(memory.buffer, 1100, 2).set(new TextEncoder().encode('CD'));

            // iovec[0]: buf=1000, len=2
            view.setUint32(800, 1000, true);
            view.setUint32(804, 2, true);
            // iovec[1]: buf=1100, len=2
            view.setUint32(808, 1100, true);
            view.setUint32(812, 2, true);

            const rc = vfsWriteGatherAt(ctx, ['wg.txt'], 3n, memory, 800, 2, 900);
            expect(rc).toBe(Errno.Success);
            expect(view.getUint32(900, true)).toBe(4);

            // Verify written data by reading back
            const readBuf = ctx.vfs.read(['wg.txt'], 3n, 4);
            expect(new TextDecoder().decode(readBuf)).toBe('ABCD');
        });

        test('writes with zero iovecs writes nothing', () => {
            const { ctx, memory } = makeCtx({ fs: new Map([['wg0.txt', 'original']]) });
            const view = getView(memory);

            const rc = vfsWriteGatherAt(ctx, ['wg0.txt'], 0n, memory, 800, 0, 900);
            expect(rc).toBe(Errno.Success);
            expect(view.getUint32(900, true)).toBe(0);
        });
    });

    describe('fd_read with multiple iovecs', () => {
        test('scatter-reads a VFS file across multiple iovecs', () => {
            const { ctx, memory } = makeCtx({ fs: new Map([['scatter.txt', 'hello world!']]) });
            const view = getView(memory);
            const path = 'scatter.txt';
            const pathBytes = new TextEncoder().encode(path);
            new Uint8Array(memory.buffer, 400, pathBytes.length).set(pathBytes);

            const rc = path_open(ctx, 3, 0, 400, pathBytes.length, 0,
                BigInt(Rights.FdRead | Rights.FdSeek), 0n, 0, 500);
            expect(rc).toBe(Errno.Success);
            const fileFd = view.getUint32(500, true);

            // iovec[0]: buf=1000, len=5
            view.setUint32(600, 1000, true);
            view.setUint32(604, 5, true);
            // iovec[1]: buf=1100, len=1
            view.setUint32(608, 1100, true);
            view.setUint32(612, 1, true);
            // iovec[2]: buf=1200, len=6
            view.setUint32(616, 1200, true);
            view.setUint32(620, 6, true);

            const readRc = fd_read(ctx, fileFd, 600, 3, 700);
            expect(readRc).toBe(Errno.Success);
            expect(view.getUint32(700, true)).toBe(12);
            expect(new TextDecoder().decode(new Uint8Array(memory.buffer, 1000, 5))).toBe('hello');
            expect(new TextDecoder().decode(new Uint8Array(memory.buffer, 1100, 1))).toBe(' ');
            expect(new TextDecoder().decode(new Uint8Array(memory.buffer, 1200, 6))).toBe('world!');
        });

        test('scatter-reads with partial EOF across iovecs', () => {
            const { ctx, memory } = makeCtx({ fs: new Map([['eof.txt', 'abc']]) });
            const view = getView(memory);
            const path = 'eof.txt';
            const pathBytes = new TextEncoder().encode(path);
            new Uint8Array(memory.buffer, 400, pathBytes.length).set(pathBytes);

            const rc = path_open(ctx, 3, 0, 400, pathBytes.length, 0,
                BigInt(Rights.FdRead | Rights.FdSeek), 0n, 0, 500);
            expect(rc).toBe(Errno.Success);
            const fileFd = view.getUint32(500, true);

            // iovec[0]: buf=1000, len=2
            view.setUint32(600, 1000, true);
            view.setUint32(604, 2, true);
            // iovec[1]: buf=1100, len=10 (more than remaining)
            view.setUint32(608, 1100, true);
            view.setUint32(612, 10, true);

            const readRc = fd_read(ctx, fileFd, 600, 2, 700);
            expect(readRc).toBe(Errno.Success);
            expect(view.getUint32(700, true)).toBe(3);
            expect(new TextDecoder().decode(new Uint8Array(memory.buffer, 1000, 2))).toBe('ab');
            expect(new TextDecoder().decode(new Uint8Array(memory.buffer, 1100, 1))).toBe('c');
        });
    });
});
