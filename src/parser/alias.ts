import { SyncSource } from '../utils/streaming';
import { ParserContext, WITSectionAlias } from './types';
import { readU32 } from './values';

// see also https://github.com/bytecodealliance/wasm-tools/blob/e2af293273db65712b6f31da85f7aa5eb31abfde/crates/wasmparser/src/readers/component/exports.rs#L86
// https://github.com/WebAssembly/component-model/blob/main/design/mvp/Binary.md#import-and-export-definitions
export function parseSectionAlias(
    ctx: ParserContext,
    src: SyncSource,
): WITSectionAlias {
    const sort = readU32(src);
    const target = parseAliasTarget(src);

    const section: WITSectionAlias = {
        tag: 'section-alias',
    };
    return section;
}

function parseAliasTarget(src: SyncSource) {
    const k1 = readU32(src);
    return (() => {
        switch (k1) {
            case 0x00: throw 'TODO: export i n';
            case 0x01: throw 'TODO: core export i n';
            case 0x02: throw 'TODO: outer ct idx';
            default:
                throw new Error(`unknown target type. ${k1}`);
        }
    })();
}
