// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import type { RuntimeConfig } from '../../runtime/model/types';

export type JsInterface = Record<string, Function>;
export type JsInterfaceCollection = Record<string, JsInterface>;

export type WasmComponentInstance<TJSExports> = {
    exports: JsExports<TJSExports>
    abort: () => void
    dispose: () => void
}
export type JsExports<TJSExports> = TJSExports & JsInterfaceCollection
export type JsImports = JsInterfaceCollection

export type ResolutionStats = {
    resolveComponentSection: number
    resolveComponentInstanceInstantiate: number
    createScopedResolverContext: number
    componentSectionCacheHits: number
    componentInstanceCacheHits: number
    coreInstanceCacheHits: number
    coreFunctionCacheHits: number
    componentFunctionCacheHits: number
}

export type WasmComponent<TJSExports> = {
    instantiate: WasmComponentFactory<TJSExports>
    exports: () => string[]
    imports: () => string[]
}
export type WasmComponentFactory<TJSExports> = (imports?: JsImports, config?: RuntimeConfig) => Promise<WasmComponentInstance<TJSExports>>
