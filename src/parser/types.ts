import { IndexedElement, ModelTag, WITSection } from '../model/tags';

export type CoreModule = IndexedElement & {
    tag: ModelTag.CoreModule
    data?: Uint8Array
    module?: Promise<WebAssembly.Module>
}

export type CustomSection = {
    tag: ModelTag.CustomSection
    name: string
    data?: Uint8Array
}

export type SkippedSection = {
    tag: ModelTag.SkippedSection
    type: number
    data?: Uint8Array
}

export type ComponentSection = IndexedElement & {
    tag: ModelTag.ComponentSection
    sections: WITSection[]
}

export type WITModel = WITSection[];

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
