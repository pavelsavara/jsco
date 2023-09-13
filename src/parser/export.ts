import { SyncSource } from '../utils/streaming';
import { ComponentExport } from '../model/exports';
import { ParserContext } from './types';
import { readU32, readComponentExternalKind, readComponentExternName, readComponentTypeRef } from './values';
import { ModelTag } from '../model/tags';

// see also https://github.com/bytecodealliance/wasm-tools/blob/e2af293273db65712b6f31da85f7aa5eb31abfde/crates/wasmparser/src/readers/component/exports.rs#L86
// https://github.com/WebAssembly/component-model/blob/main/design/mvp/Binary.md#import-and-export-definitions
export function parseSectionExport(
    ctx: ParserContext,
    src: SyncSource,
): ComponentExport[] {
    const sections: ComponentExport[] = [];
    const count = readU32(src);
    for (let i = 0; i < count; i++) {
        const section: ComponentExport = {
            tag: ModelTag.ComponentExport,
            name: readComponentExternName(src),
            kind: readComponentExternalKind(src),
            index: readU32(src),
            ty: readU32(src) === 0 ? undefined : readComponentTypeRef(src)
        };
        sections.push(section);
    }
    return sections;
}
