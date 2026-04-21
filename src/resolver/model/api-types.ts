// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { EXPORTS, IMPORTS, INSTANTIATE } from '../../utils/constants';

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
    [INSTANTIATE]: WasmComponentFactory<TJSExports>
    [EXPORTS]: () => string[]
    [IMPORTS]: () => string[]
}
export type WasmComponentFactory<TJSExports> = (imports?: JsImports) => Promise<WasmComponentInstance<TJSExports>>
