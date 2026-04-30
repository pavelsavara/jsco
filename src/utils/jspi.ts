// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

/** Detect JSPI availability at runtime (cached after first check) */
let _jspiCached: boolean | undefined;
export function hasJspi(): boolean {
    if (_jspiCached !== undefined) return _jspiCached;
    try {
        _jspiCached = typeof WebAssembly !== 'undefined'
            && typeof (WebAssembly as any).Suspending === 'function';
    } catch {
        _jspiCached = false;
    }
    return _jspiCached;
}
