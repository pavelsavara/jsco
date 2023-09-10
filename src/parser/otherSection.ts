import { SyncSource } from "../utils/streaming";
import { ParserContext, WITSectionCustom, WITSectionSkipped } from "./types";
import { readName } from "./values";

export function parseSectionCustom(
    ctx: ParserContext,
    src: SyncSource,
    size: number,
): WITSectionCustom {
    const start = src.pos;
    const name = readName(src);
    const nameSize = src.pos - start;
    const data = src.readExact(size - nameSize);
    const section: WITSectionCustom = {
        tag: "section-custom",
        name,
        data: ctx.otherSectionData ? data : undefined,
    };
    if (ctx.processCustomSection) {
        return ctx.processCustomSection(section);
    }
    return section;
}

export function skipSection(
    ctx: ParserContext,
    src: SyncSource,
    type: number,
    size: number,
): WITSectionSkipped {
    const data = src.readExact(size);
    const section: WITSectionSkipped = {
        tag: "section-skipped",
        type,
        data: ctx.otherSectionData ? data : undefined,
    };
    return section;
}