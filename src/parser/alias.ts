import { SyncSource } from '../utils/streaming';
import { ComponentAlias, ComponentAliasInstanceExport, ComponentAliasCoreInstanceExport, ComponentAliasOuter } from '../model/aliases';
import { ParserContext } from './types';
import { readU32, parseAsExternalKind, parseAsComponentExternalKind, parseAsComponentOuterAliasKind, readName } from './values';

// see also https://github.com/bytecodealliance/wasm-tools/blob/e2af293273db65712b6f31da85f7aa5eb31abfde/crates/wasmparser/src/readers/component/exports.rs#L86
// https://github.com/WebAssembly/component-model/blob/main/design/mvp/Binary.md#alias-definitions
export function parseSectionAlias(
    ctx: ParserContext,
    src: SyncSource,
): ComponentAlias {
    // We don't know what type of alias it is yet, so just read the sort bytes
    const b1 = readU32(src);
    const b2 = (b1 === 0) ? readU32(src) : -1;
    const t = parseAliasTarget(b1, b2, src);
    console.log(`${b1}, ${b2}, ${JSON.stringify(t)}`);
    return t;
}

function parseAliasTarget(b1: number, b2: number, src: SyncSource) {
    const k1 = readU32(src);
    switch (k1) {
        case 0x00:
            return {
                tag: 'ComponentAliasInstanceExport',
                kind: parseAsComponentExternalKind(b1, b2),
                instance_index: readU32(src),
                name: readName(src)
            } as ComponentAliasInstanceExport;
        case 0x01:
            return {
                tag: 'ComponentAliasCoreInstanceExport',
                kind: parseAsExternalKind(b1, b2),
                instance_index: readU32(src),
                name: readName(src)
            } as ComponentAliasCoreInstanceExport;
        case 0x02:
            return {
                tag: 'ComponentAliasOuter',
                kind: parseAsComponentOuterAliasKind(b1, b2),
                count: readU32(src),
                index: readU32(src)
            } as ComponentAliasOuter;
        default:
            throw new Error(`unknown target type. ${k1}`);
    }
}
