import { ModelTag } from '../model/tags';
import { SyncSource } from '../utils/streaming';
import { ParserContext, CustomSection, SkippedSection } from './types';
import { readName } from './values';

export function parseSectionCustom(
    ctx: ParserContext,
    src: SyncSource,
    size: number,
): CustomSection[] {
    const start = src.pos;
    const name = readName(src);
    const nameSize = src.pos - start;
    const data = src.readExact(size - nameSize);
    let section: CustomSection = {
        tag: ModelTag.CustomSection,
        name,
        data: ctx.otherSectionData ? data : undefined,
    };
    if (ctx.processCustomSection) {
        section = ctx.processCustomSection(section);
    }
    return [section];
}

export function skipSection(
    ctx: ParserContext,
    src: SyncSource,
    type: number,
    size: number,
): SkippedSection[] {
    const data = src.readExact(size);
    const section: SkippedSection = {
        tag: ModelTag.SkippedSection,
        type,
        data: ctx.otherSectionData ? data : undefined,
    };
    return [section];
}