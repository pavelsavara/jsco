import { ComponentAlias } from '../model/aliases';
import { ComponentExport } from '../model/exports';
import { ComponentImport } from '../model/imports';

export type WITSection =
    | CustomSection
    | SkippedSection
    | ComponentModule
    | ComponentImport
    | ComponentExport
    | ComponentAlias

export type ComponentModule = {
    tag: 'ComponentModule'
    data?: Uint8Array
    module?: Promise<WebAssembly.Module>
}

export type CustomSection = {
    tag: 'CustomSection'
    name: string
    data?: Uint8Array
}

export type SkippedSection = {
    tag: 'SkippedSection'
    type: number
    data?: Uint8Array
}

export type WITModel = {
    tag: 'model'
    componentExports: ComponentExport[]
    componentImports: ComponentImport[]
    modules: ComponentModule[]
    aliases: ComponentAlias[]
    other: WITSection[]
}

export type ParserContext = {
    otherSectionData: boolean
    compileStreaming: typeof WebAssembly.compileStreaming
    processCustomSection?: (section: CustomSection) => CustomSection
}

export type ParserOptions = {
    otherSectionData?: boolean
    compileStreaming?: typeof WebAssembly.compileStreaming
    processCustomSection?: (section: CustomSection) => CustomSection
}
