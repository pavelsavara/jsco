// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * WASI Preview 1 (wasi_snapshot_preview1) raw WASM ABI type definitions.
 *
 * Auto-generated from wasi-libc wasip1.h by scripts/generate-wasip1-types.mjs
 * Source: https://github.com/WebAssembly/wasi-libc/blob/main/libc-bottom-half/headers/public/wasi/wasip1.h
 *
 * All pointer parameters are i32 (number), 64-bit integers are i64 (bigint).
 * Functions operate on the module's linear memory via DataView.
 */

// ── Primitive type aliases ─────────────────────────────────────────────────

/** __wasi_size_t - __SIZE_TYPE__ (32-bit) */
export type Size = number;

/** __wasi_filesize_t - uint64_t (64-bit) */
export type Filesize = bigint;

/** __wasi_timestamp_t - uint64_t (64-bit) */
export type Timestamp = bigint;

/** __wasi_fd_t - int (32-bit) */
export type Fd = number;

/** __wasi_filedelta_t - int64_t (64-bit) */
export type Filedelta = bigint;

/** __wasi_dircookie_t - uint64_t (64-bit) */
export type Dircookie = bigint;

/** __wasi_dirnamlen_t - uint32_t (32-bit) */
export type Dirnamlen = number;

/** __wasi_inode_t - uint64_t (64-bit) */
export type Inode = bigint;

/** __wasi_device_t - uint64_t (64-bit) */
export type Device = bigint;

/** __wasi_linkcount_t - uint64_t (64-bit) */
export type Linkcount = bigint;

/** __wasi_userdata_t - uint64_t (64-bit) */
export type Userdata = bigint;

/** __wasi_eventrwflags_t - uint16_t (16-bit) */
export type Eventrwflags = number;

/** __wasi_subclockflags_t - uint16_t (16-bit) */
export type Subclockflags = number;

/** __wasi_exitcode_t - uint32_t (32-bit) */
export type Exitcode = number;

/** __wasi_siflags_t - uint16_t (16-bit) */
export type Siflags = number;

// ── Constants ─────────────────────────────────────────────────────────────

/** CLOCKID enum values */
export const enum Clockid {
    Realtime = 0,
    Monotonic = 1,
    ProcessCputimeId = 2,
    ThreadCputimeId = 3,
}

/** ERRNO enum values */
export const enum Errno {
    Success = 0,
    E2big = 1,
    Acces = 2,
    Addrinuse = 3,
    Addrnotavail = 4,
    Afnosupport = 5,
    Again = 6,
    Already = 7,
    Badf = 8,
    Badmsg = 9,
    Busy = 10,
    Canceled = 11,
    Child = 12,
    Connaborted = 13,
    Connrefused = 14,
    Connreset = 15,
    Deadlk = 16,
    Destaddrreq = 17,
    Dom = 18,
    Dquot = 19,
    Exist = 20,
    Fault = 21,
    Fbig = 22,
    Hostunreach = 23,
    Idrm = 24,
    Ilseq = 25,
    Inprogress = 26,
    Intr = 27,
    Inval = 28,
    Io = 29,
    Isconn = 30,
    Isdir = 31,
    Loop = 32,
    Mfile = 33,
    Mlink = 34,
    Msgsize = 35,
    Multihop = 36,
    Nametoolong = 37,
    Netdown = 38,
    Netreset = 39,
    Netunreach = 40,
    Nfile = 41,
    Nobufs = 42,
    Nodev = 43,
    Noent = 44,
    Noexec = 45,
    Nolck = 46,
    Nolink = 47,
    Nomem = 48,
    Nomsg = 49,
    Noprotoopt = 50,
    Nospc = 51,
    Nosys = 52,
    Notconn = 53,
    Notdir = 54,
    Notempty = 55,
    Notrecoverable = 56,
    Notsock = 57,
    Notsup = 58,
    Notty = 59,
    Nxio = 60,
    Overflow = 61,
    Ownerdead = 62,
    Perm = 63,
    Pipe = 64,
    Proto = 65,
    Protonosupport = 66,
    Prototype = 67,
    Range = 68,
    Rofs = 69,
    Spipe = 70,
    Srch = 71,
    Stale = 72,
    Timedout = 73,
    Txtbsy = 74,
    Xdev = 75,
    Notcapable = 76,
}

/** RIGHTS flags */
export const enum Rights {
    FdDatasync = 1,
    FdRead = 2,
    FdSeek = 4,
    FdFdstatSetFlags = 8,
    FdSync = 16,
    FdTell = 32,
    FdWrite = 64,
    FdAdvise = 128,
    FdAllocate = 256,
    PathCreateDirectory = 512,
    PathCreateFile = 1024,
    PathLinkSource = 2048,
    PathLinkTarget = 4096,
    PathOpen = 8192,
    FdReaddir = 16384,
    PathReadlink = 32768,
    PathRenameSource = 65536,
    PathRenameTarget = 131072,
    PathFilestatGet = 262144,
    PathFilestatSetSize = 524288,
    PathFilestatSetTimes = 1048576,
    FdFilestatGet = 2097152,
    FdFilestatSetSize = 4194304,
    FdFilestatSetTimes = 8388608,
    PathSymlink = 16777216,
    PathRemoveDirectory = 33554432,
    PathUnlinkFile = 67108864,
    PollFdReadwrite = 134217728,
    SockShutdown = 268435456,
    SockAccept = 536870912,
}

/** WHENCE enum values */
export const enum Whence {
    Set = 0,
    Cur = 1,
    End = 2,
}

/** FILETYPE enum values */
export const enum Filetype {
    Unknown = 0,
    BlockDevice = 1,
    CharacterDevice = 2,
    Directory = 3,
    RegularFile = 4,
    SocketDgram = 5,
    SocketStream = 6,
    SymbolicLink = 7,
}

/** ADVICE enum values */
export const enum Advice {
    Normal = 0,
    Sequential = 1,
    Random = 2,
    Willneed = 3,
    Dontneed = 4,
    Noreuse = 5,
}

/** FDFLAGS flags */
export const enum Fdflags {
    Append = 1,
    Dsync = 2,
    Nonblock = 4,
    Rsync = 8,
    Sync = 16,
}

/** FSTFLAGS flags */
export const enum Fstflags {
    Atim = 1,
    AtimNow = 2,
    Mtim = 4,
    MtimNow = 8,
}

/** LOOKUPFLAGS flags */
export const enum Lookupflags {
    SymlinkFollow = 1,
}

/** OFLAGS flags */
export const enum Oflags {
    Creat = 1,
    Directory = 2,
    Excl = 4,
    Trunc = 8,
}

/** EVENTTYPE enum values */
export const enum Eventtype {
    Clock = 0,
    FdRead = 1,
    FdWrite = 2,
}

/** RIFLAGS flags */
export const enum Riflags {
    RecvPeek = 1,
    RecvWaitall = 2,
}

/** ROFLAGS flags */
export const enum Roflags {
    RecvDataTruncated = 1,
}

/** SDFLAGS flags */
export const enum Sdflags {
    Rd = 1,
    Wr = 2,
}

/** PREOPENTYPE enum values */
export const enum Preopentype {
    Dir = 0,
}

// ── Struct sizes and offsets (for DataView access) ─────────────────────────

/** __wasi_iovec_t layout */
export const IovecLayout = {
    buf: { offset: 0, size: 4 },
    buf_len: { offset: 4, size: 4 },
    _size: 8,
    _align: 4,
} as const;

/** __wasi_ciovec_t layout */
export const CiovecLayout = {
    buf: { offset: 0, size: 4 },
    buf_len: { offset: 4, size: 4 },
    _size: 8,
    _align: 4,
} as const;

/** __wasi_dirent_t layout */
export const DirentLayout = {
    d_next: { offset: 0, size: 8 },
    d_ino: { offset: 8, size: 8 },
    d_namlen: { offset: 16, size: 4 },
    d_type: { offset: 20, size: 1 },
    _size: 24,
    _align: 8,
} as const;

/** __wasi_fdstat_t layout */
export const FdstatLayout = {
    fs_filetype: { offset: 0, size: 1 },
    fs_flags: { offset: 2, size: 2 },
    fs_rights_base: { offset: 8, size: 8 },
    fs_rights_inheriting: { offset: 16, size: 8 },
    _size: 24,
    _align: 8,
} as const;

/** __wasi_filestat_t layout */
export const FilestatLayout = {
    dev: { offset: 0, size: 8 },
    ino: { offset: 8, size: 8 },
    filetype: { offset: 16, size: 1 },
    nlink: { offset: 24, size: 8 },
    size: { offset: 32, size: 8 },
    atim: { offset: 40, size: 8 },
    mtim: { offset: 48, size: 8 },
    ctim: { offset: 56, size: 8 },
    _size: 64,
    _align: 8,
} as const;

/** __wasi_event_fd_readwrite_t layout */
export const EventFdReadwriteLayout = {
    nbytes: { offset: 0, size: 8 },
    flags: { offset: 8, size: 2 },
    _size: 16,
    _align: 8,
} as const;

/** __wasi_event_t layout */
export const EventLayout = {
    userdata: { offset: 0, size: 8 },
    error: { offset: 8, size: 2 },
    type: { offset: 10, size: 1 },
    fd_readwrite: { offset: 16, size: 16 },
    _size: 32,
    _align: 8,
} as const;

/** __wasi_subscription_clock_t layout */
export const SubscriptionClockLayout = {
    id: { offset: 0, size: 4 },
    timeout: { offset: 8, size: 8 },
    precision: { offset: 16, size: 8 },
    flags: { offset: 24, size: 2 },
    _size: 32,
    _align: 8,
} as const;

/** __wasi_subscription_fd_readwrite_t layout */
export const SubscriptionFdReadwriteLayout = {
    file_descriptor: { offset: 0, size: 4 },
    _size: 4,
    _align: 4,
} as const;

/** __wasi_subscription_u_t layout */
export const SubscriptionULayout = {
    tag: { offset: 0, size: 1 },
    u: { offset: 8, size: 32 },
    _size: 40,
    _align: 8,
} as const;

/** __wasi_subscription_t layout */
export const SubscriptionLayout = {
    userdata: { offset: 0, size: 8 },
    u: { offset: 8, size: 40 },
    _size: 48,
    _align: 8,
} as const;

/** __wasi_prestat_dir_t layout */
export const PrestatDirLayout = {
    pr_name_len: { offset: 0, size: 4 },
    _size: 4,
    _align: 4,
} as const;

/** __wasi_prestat_t layout */
export const PrestatLayout = {
    tag: { offset: 0, size: 1 },
    u: { offset: 4, size: 4 },
    _size: 8,
    _align: 4,
} as const;

// ── WASI Preview 1 function signatures (raw WASM ABI) ─────────────────────

/**
 * Raw WASM ABI interface for wasi_snapshot_preview1.
 *
 * All parameters are passed as WASM i32 (number) or i64 (bigint).
 * Pointer parameters point into the module's linear memory.
 * Return value is errno (i32) unless the function is _Noreturn.
 */
export interface WasiSnapshotPreview1 {
    args_get(argv: number, argv_buf: number): number;
    args_sizes_get(retptr0: number, retptr1: number): number;
    environ_get(environ: number, environ_buf: number): number;
    environ_sizes_get(retptr0: number, retptr1: number): number;
    clock_res_get(id: number, retptr0: number): number;
    clock_time_get(id: number, precision: bigint, retptr0: number): number;
    fd_advise(fd: number, offset: bigint, len: bigint, advice: number): number;
    fd_allocate(fd: number, offset: bigint, len: bigint): number;
    fd_close(fd: number): number;
    fd_datasync(fd: number): number;
    fd_fdstat_get(fd: number, retptr0: number): number;
    fd_fdstat_set_flags(fd: number, flags: number): number;
    fd_fdstat_set_rights(fd: number, fs_rights_base: bigint, fs_rights_inheriting: bigint): number;
    fd_filestat_get(fd: number, retptr0: number): number;
    fd_filestat_set_size(fd: number, size: bigint): number;
    fd_filestat_set_times(fd: number, atim: bigint, mtim: bigint, fst_flags: number): number;
    fd_pread(fd: number, iovs: number, iovs_len: number, offset: bigint, retptr0: number): number;
    fd_prestat_get(fd: number, retptr0: number): number;
    fd_prestat_dir_name(fd: number, path: number, path_len: number): number;
    fd_pwrite(fd: number, iovs: number, iovs_len: number, offset: bigint, retptr0: number): number;
    fd_read(fd: number, iovs: number, iovs_len: number, retptr0: number): number;
    fd_readdir(fd: number, buf: number, buf_len: number, cookie: bigint, retptr0: number): number;
    fd_renumber(fd: number, to: number): number;
    fd_seek(fd: number, offset: bigint, whence: number, retptr0: number): number;
    fd_sync(fd: number): number;
    fd_tell(fd: number, retptr0: number): number;
    fd_write(fd: number, iovs: number, iovs_len: number, retptr0: number): number;
    path_create_directory(fd: number, path: number, path_len: number): number;
    path_filestat_get(fd: number, flags: number, path: number, path_len: number, retptr0: number): number;
    path_filestat_set_times(fd: number, flags: number, path: number, path_len: number, atim: bigint, mtim: bigint, fst_flags: number): number;
    path_link(old_fd: number, old_flags: number, old_path: number, old_path_len: number, new_fd: number, new_path: number, new_path_len: number): number;
    path_open(fd: number, dirflags: number, path: number, path_len: number, oflags: number, fs_rights_base: bigint, fs_rights_inheriting: bigint, fdflags: number, retptr0: number): number;
    path_readlink(fd: number, path: number, path_len: number, buf: number, buf_len: number, retptr0: number): number;
    path_remove_directory(fd: number, path: number, path_len: number): number;
    path_rename(fd: number, old_path: number, old_path_len: number, new_fd: number, new_path: number, new_path_len: number): number;
    path_symlink(old_path: number, old_path_len: number, fd: number, new_path: number, new_path_len: number): number;
    path_unlink_file(fd: number, path: number, path_len: number): number;
    poll_oneoff(in_: number, out_: number, nsubscriptions: number, retptr0: number): number;
    proc_exit(rval: number): void;
    sched_yield(): number;
    random_get(buf: number, buf_len: number): number;
    sock_accept(fd: number, flags: number, retptr0: number): number;
    sock_recv(fd: number, ri_data: number, ri_data_len: number, ri_flags: number, retptr0: number, retptr1: number): number;
    sock_send(fd: number, si_data: number, si_data_len: number, si_flags: number, retptr0: number): number;
    sock_shutdown(fd: number, how: number): number;
}

// ── Struct field access interfaces ────────────────────────────────────────

/** __wasi_iovec_t fields */
export interface Iovec {
    buf: number;
    buf_len: number;
}

/** __wasi_ciovec_t fields */
export interface Ciovec {
    buf: number;
    buf_len: number;
}

/** __wasi_dirent_t fields */
export interface Dirent {
    d_next: bigint;
    d_ino: bigint;
    d_namlen: number;
    d_type: number;
}

/** __wasi_fdstat_t fields */
export interface Fdstat {
    fs_filetype: number;
    fs_flags: number;
    fs_rights_base: bigint;
    fs_rights_inheriting: bigint;
}

/** __wasi_filestat_t fields */
export interface Filestat {
    dev: bigint;
    ino: bigint;
    filetype: number;
    nlink: bigint;
    size: bigint;
    atim: bigint;
    mtim: bigint;
    ctim: bigint;
}

/** __wasi_event_fd_readwrite_t fields */
export interface EventFdReadwrite {
    nbytes: bigint;
    flags: number;
}

/** __wasi_event_t fields */
export interface Event {
    userdata: bigint;
    error: number;
    type: number;
    fd_readwrite: EventFdReadwrite;
}

/** __wasi_subscription_clock_t fields */
export interface SubscriptionClock {
    id: number;
    timeout: bigint;
    precision: bigint;
    flags: number;
}

/** __wasi_subscription_fd_readwrite_t fields */
export interface SubscriptionFdReadwrite {
    file_descriptor: number;
}

/** __wasi_subscription_u_t fields */
export interface SubscriptionU {
    tag: number;
    u: SubscriptionClock | SubscriptionFdReadwrite;
}

/** __wasi_subscription_t fields */
export interface Subscription {
    userdata: bigint;
    u: SubscriptionU;
}

/** __wasi_prestat_dir_t fields */
export interface PrestatDir {
    pr_name_len: number;
}

/** __wasi_prestat_t fields */
export interface Prestat {
    tag: number;
    u: PrestatDir;
}
