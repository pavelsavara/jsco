
import { PlanOp } from './binding-plan';

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
    plan?: PlanOp[]
    stats?: ResolutionStats
}
export type WasmComponentFactory<TJSExports> = (imports?: JsImports) => Promise<WasmComponentInstance<TJSExports>>