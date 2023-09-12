import { ComponentAlias } from '../model/aliases';
import { CanonicalFunction } from '../model/canonicals';
import { ComponentExport } from '../model/exports';
import { ComponentImport } from '../model/imports';
import { Instance } from '../model/instances';
import { ModelTag } from '../model/tags';
import { ComponentType, InstanceTypeDeclaration } from '../model/types';

export type WITSection =
    | CustomSection
    | SkippedSection
    | ComponentModule
    | Instance
    | ComponentImport
    | ComponentExport
    | ComponentAlias
    | CanonicalFunction
    | ComponentType
    | InstanceTypeDeclaration

export type ComponentModule = {
    tag: ModelTag.ComponentModule
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
