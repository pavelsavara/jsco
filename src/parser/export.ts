import { SyncSource } from '../utils/streaming';
import { ComponentExport } from '../model/exports';
import { ComponentExternName, ComponentExternNameInterface, ComponentExternNameKebab } from '../model/imports';
import { ParserContext } from './types';
import { readName, readU32, readComponentExternalKind } from './values';
import { ModelTag } from '../model/tags';

// see also https://github.com/bytecodealliance/wasm-tools/blob/e2af293273db65712b6f31da85f7aa5eb31abfde/crates/wasmparser/src/readers/component/exports.rs#L86
// https://github.com/WebAssembly/component-model/blob/main/design/mvp/Binary.md#import-and-export-definitions
export function parseSectionExport(
    ctx: ParserContext,
    src: SyncSource,
): ComponentExport {
    const name: ComponentExternName = (() => {
        const b1 = readU32(src);
        switch (b1) {
            case 0x00: return {
                tag: ModelTag.ComponentExternNameKebab,
                name: readName(src),
            } as ComponentExternNameKebab;
            case 0x01:
                return (() => {
                    const b2 = readU32(src);
                    switch (b2) {
                        case 0x01:
                            return {
                                tag: ModelTag.ComponentExternNameInterface,
                                name: readName(src),
                            } as ComponentExternNameInterface;
                        default: throw new Error(`unknown export name type.${b2}`);
                    }
                })();
            default: throw new Error(`unknown export name type.${b1}`);
        }
    })();

    const kind = readComponentExternalKind(src);
    const index = readU32(src);

    // Check for optional external type description
    const b3 = readU32(src);
    switch (b3) {
        case 0x00:
            break;
        case 0x01: throw new Error('extern type description not implemented');
        default: throw new Error(`unknown extern description ${b3}`);
    }

    const section: ComponentExport = {
        tag: ModelTag.ComponentExport,
        name,
        index,
        kind,
        ty: undefined //TODO
    };
    return section;
}
