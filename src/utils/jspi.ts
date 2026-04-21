// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

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
