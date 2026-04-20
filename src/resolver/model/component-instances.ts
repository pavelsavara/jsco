// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

export type ComponentInstanceData = {
    instanceIndex: number;
    imports: Record<string, unknown>;
    exports: Record<string, unknown>;
    types: Record<string, unknown>;
}
