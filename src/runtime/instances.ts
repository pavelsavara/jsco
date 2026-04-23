// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { InstanceTable } from './model/types';

export function createInstanceTable(): InstanceTable {
    return {
        coreInstances: [],
        componentInstances: [],
    };
}
