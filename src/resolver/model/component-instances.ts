// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

export type ComponentInstanceData = {
    instanceIndex: number;
    imports: Record<string, unknown>;
    exports: Record<string, unknown>;
    types: Record<string, unknown>;
}
