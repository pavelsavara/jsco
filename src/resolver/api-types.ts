// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.


export type JsInterface = Record<string, Function>;
export type JsInterfaceCollection = Record<string, JsInterface>;

export type WasmComponentInstance<TJSExports> = {
    exports: JsExports<TJSExports>
    abort: () => void
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
}
export type WasmComponentFactory<TJSExports> = (imports?: JsImports) => Promise<WasmComponentInstance<TJSExports>>