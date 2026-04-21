// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

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
