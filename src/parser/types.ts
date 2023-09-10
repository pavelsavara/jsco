import { AbiSize } from "../binding/types";

export type WITType =
    | WITTypeRecord
    | WITTypeString
    | WITTypeI32

export type WITBaseType = {
    tag: string
    totalSize: AbiSize
    alignment: AbiSize
}

export type WITTypeRecord = WITBaseType & {
    tag: "record"
    name: string
    members: { name: string, type: WITType }[]
}

export type WITTypeFunction = {
    tag: "function"
    name?: string
    parameters: { name: string, type: WITType }[]
    returnType: WITType
}

export type WITTypeString = WITBaseType & {
    tag: "string"
}

export type WITTypeI32 = WITBaseType & {
    tag: "i32"
}

export type WITTypeI64 = WITBaseType & {
    tag: "i64"
}

export type WITSection =
    | WITSectionCustom
    | WITSectionSkipped
    | WITSectionModule
    | WITSectionExport
    | WITSectionImport
    | WITSectionAlias

export type WITSectionModule = {
    tag: "section-module"
    data?: Uint8Array
    module?: Promise<WebAssembly.Module>
}

export type WITSectionCustom = {
    tag: "section-custom"
    name: string
    data?: Uint8Array
}

export type WITName =
    | WITNameName
    | WITNameRegId
    ;

export type WITNameName = {
    tag: "name-name"
    name: string
}

export type WITNameRegId = {
    tag: "name-regid"
    name: string
}

export type WITSectionExport = {
    tag: "section-export"
    name: WITName
    sortidx: number
    kind: ComponentExternalKind
}

export type WITSectionImport = {
    tag: "section-import"
}

export type WITSectionAlias = {
    tag: "section-alias"
}

export type WITSectionSkipped = {
    tag: "section-skipped"
    type: number
    data?: Uint8Array
}

export type WITModel = {
    tag: "model"
    typesByName: Map<string, WITType>
    componentExports: WITSectionExport[]
    componentImports: WITSectionImport[]
    modules: WITSectionModule[]
    aliases: WITSectionAlias[]
    other: WITSection[]
}

export type WebAssemblyCompileStreaming = (source: Response | PromiseLike<Response>) => Promise<WebAssembly.Module>;

export type ParserContext = {
    otherSectionData: boolean
    compileStreaming: WebAssemblyCompileStreaming
    processCustomSection?: (section: WITSectionCustom) => WITSectionCustom
}

export type ComponentExternalKind = "module" | "func" | "value" | "type" | "instance" | "component";
