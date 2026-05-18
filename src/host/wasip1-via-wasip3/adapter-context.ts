// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import type { FdTable } from './fd-table';
import type { WasiP3Imports } from '../wasip3';

export type AdapterContext = {
    getMemory(): WebAssembly.Memory
    fdTable: FdTable
    p3: WasiP3Imports
    args: string[]
    envPairs: [string, string][]
    encoder: TextEncoder
}
