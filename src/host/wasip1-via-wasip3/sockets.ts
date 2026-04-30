// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { Errno } from './types/wasi-snapshot-preview1';

export function sock_accept(_fd: number, _flags: number, _retptr0: number): number {
    return Errno.Notsup;
}

export function sock_recv(_fd: number, _ri_data: number, _ri_data_len: number, _ri_flags: number, _retptr0: number, _retptr1: number): number {
    return Errno.Notsup;
}

export function sock_send(_fd: number, _si_data: number, _si_data_len: number, _si_flags: number, _retptr0: number): number {
    return Errno.Notsup;
}

export function sock_shutdown(_fd: number, _how: number): number {
    return Errno.Notsup;
}
