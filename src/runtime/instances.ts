// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import type { InstanceTable } from './model/types';

export function createInstanceTable(): InstanceTable {
    return {
        coreInstances: [],
        componentInstances: [],
    };
}
