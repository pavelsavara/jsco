// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { AdapterContext } from './adapter-context';
import { createDefaultFdTable } from './fd-table';
import { MemoryVfsBackend } from '../wasip3/vfs';
import {
    Errno, Clockid, Eventtype, Filetype, Fdflags, Rights, Whence,
    FdstatLayout, FilestatLayout, PrestatLayout, EventLayout, SubscriptionLayout,
    CiovecLayout,
} from './types/wasi-snapshot-preview1';
import { args_get, args_sizes_get, environ_get, environ_sizes_get, fd_prestat_get, fd_prestat_dir_name, proc_exit, sched_yield } from './cli';
import { clock_res_get, clock_time_get } from './clocks';
import { random_get } from './random';
import { poll_oneoff } from './poll';
import { sock_accept, sock_recv, sock_send, sock_shutdown } from './sockets';
import {
    fd_advise, fd_allocate, fd_close, fd_datasync,
    fd_fdstat_get, fd_fdstat_set_flags, fd_fdstat_set_rights,
    fd_filestat_get,
    fd_read, fd_write, fd_seek, fd_tell, fd_renumber, fd_sync,
    path_create_directory, path_filestat_get, path_open, path_unlink_file, path_remove_directory,
} from './filesystem';
import { getView } from './memory';

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
});
