import { ComponentAlias } from '../model/aliases';
import { CanonicalFunction } from '../model/canonicals';
import { ComponentExport } from '../model/exports';
import { ComponentImport } from '../model/imports';
import { ComponentInstance, CoreInstance as CoreInstance } from '../model/instances';
import { ModelTag } from '../model/tags';
import { ComponentType } from '../model/types';

export type WITSection = { selfSortIndex?: number } & (
    | CustomSection
    | SkippedSection
    | ComponentSection
    | ComponentImport
    | ComponentExport
    | ComponentAlias
    | CanonicalFunction
    | ComponentType
    | ComponentInstance
    | CoreModule
    | CoreInstance
)

export type CoreModule = {
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

export type ComponentSection = {
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
