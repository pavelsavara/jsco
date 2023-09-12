import { ComponentAlias } from '../model/aliases';
import { CanonicalFunctionLift } from '../model/canonicals';
import { ComponentExport } from '../model/exports';
import { ComponentImport } from '../model/imports';
import { Instance } from '../model/instances';
import { ComponentTypeComponent, ComponentTypeFunc } from '../model/types';

export type WITSection =
    | CustomSection
    | SkippedSection
    | ComponentModule
    | Instance
    | ComponentImport
    | ComponentExport
    | ComponentAlias
    | ComponentTypeComponent
    | CanonicalFunctionLift
    | ComponentTypeFunc

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
