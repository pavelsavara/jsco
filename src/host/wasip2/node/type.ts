// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

export interface ServeInstance {
    exports: Record<string, Record<string, Function> | undefined>;
}
