import { SyncSource } from '../utils/streaming';
import { ComponentExport, ComponentExternalKind } from '../model/exports';
import { ComponentExternName, ComponentExternNameInterface, ComponentExternNameKebab } from '../model/imports';
import { ParserContext } from './types';
import { readName, readU32 } from './values';

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
                tag: 'ComponentExternNameKebab',
                name: readName(src),
            } as ComponentExternNameKebab;
            case 0x01:
                return (() => {
                    const b2 = readU32(src);
                    switch (b2) {
                        case 0x01:
                            return {
                                tag: 'ComponentExternNameInterface',
                                name: readName(src),
                            } as ComponentExternNameInterface;
                        default: throw new Error(`unknown export name type.${b2}`);
                    }
                })();
            default: throw new Error(`unknown export name type.${b1}`);
        }
    })();
    const index = readU32(src);
    const kind = parseComponentExternalKind(src);
    const ty = readU32(src);// TODO: what is this?

    const section: ComponentExport = {
        tag: 'ComponentExport',
        name,
        index,
        kind,
        ty: undefined, //TODO
    };
    return section;
}

function parseComponentExternalKind(src: SyncSource): ComponentExternalKind {
    const k1 = readU32(src);
    let k2;
    const kind: ComponentExternalKind = (() => {
        switch (k1) {
            case 0x00:
                k2 = readU32(src);
                switch (k2) {
                    case 0x11: return 'module';
                    default:
                        throw new Error(`unknown export 2 type. ${k2}`);
                }
            case 0x01: return 'func';
            case 0x02: return 'value';
            case 0x03: return 'type';
            case 0x04: return 'component';
            case 0x05: return 'instance';
            default:
                throw new Error(`unknown export type. ${k1}`);
        }
    })();
    return kind;
}
