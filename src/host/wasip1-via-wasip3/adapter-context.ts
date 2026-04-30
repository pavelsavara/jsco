// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import type { FdTable } from './fd-table';
import type { MemoryVfsBackend } from '../wasip3/vfs';

export type AdapterContext = {
    getMemory(): WebAssembly.Memory
    fdTable: FdTable
    vfs: MemoryVfsBackend
    stdoutChunks: Uint8Array[]
    stderrChunks: Uint8Array[]
    args: string[]
    envPairs: [string, string][]
    encoder: TextEncoder
}
