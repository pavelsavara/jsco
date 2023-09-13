import { SyncSource } from '../utils/streaming';
import { ComponentAlias, ComponentAliasInstanceExport, ComponentAliasCoreInstanceExport, ComponentAliasOuter } from '../model/aliases';
import { ParserContext } from './types';
import { readU32, parseAsExternalKind, parseAsComponentExternalKind, parseAsComponentOuterAliasKind, readName } from './values';
import { ModelTag } from '../model/tags';

// see also https://github.com/bytecodealliance/wasm-tools/blob/e2af293273db65712b6f31da85f7aa5eb31abfde/crates/wasmparser/src/readers/component/exports.rs#L86
// https://github.com/WebAssembly/component-model/blob/main/design/mvp/Binary.md#alias-definitions
export function parseSectionAlias(
    ctx: ParserContext,
    src: SyncSource,
): ComponentAlias[] {
    const count = readU32(src);
    const aliases: ComponentAlias[] = [];
    for (let i = 0; i < count; i++) {
        const alias = parseAlias(src);
        aliases.push(alias);
    }
    return aliases;
}

export function parseAlias(
    src: SyncSource,
): ComponentAlias {
    // We don't know what type of alias it is yet, so just read the sort bytes
    const b1 = readU32(src);
    const b2 = (b1 === 0) ? readU32(src) : undefined;
    return parseAliasTarget(src, b1, b2);
}

function parseAliasTarget(src: SyncSource, b1: number, b2?: number) {
    const k1 = readU32(src);
    switch (k1) {
        case 0x00:
            return {
                tag: ModelTag.ComponentAliasInstanceExport,
                kind: parseAsComponentExternalKind(b1, b2),
                instance_index: readU32(src),
                name: readName(src)
            } as ComponentAliasInstanceExport;
        case 0x01:
            return {
                tag: ModelTag.ComponentAliasCoreInstanceExport,
                kind: parseAsExternalKind(b2!),
                instance_index: readU32(src),
                name: readName(src)
            } as ComponentAliasCoreInstanceExport;
        case 0x02:
            return {
                tag: ModelTag.ComponentAliasOuter,
                kind: parseAsComponentOuterAliasKind(b1, b2),
                count: readU32(src),
                index: readU32(src)
            } as ComponentAliasOuter;
        default:
            throw new Error(`unknown target type. ${k1}`);
    }
}
