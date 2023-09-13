/* eslint-disable no-console */
import { SyncSource } from '../utils/streaming';
import { ParserContext } from './types';
import { readU32, readComponentType } from './values';
import { ComponentType } from '../model/types';

export function parseSectionType(
    ctx: ParserContext,
    src: SyncSource,
): ComponentType[] {
    const sections: ComponentType[] = [];
    const count = readU32(src); // 1
    console.log(`parseSectionType: ${count}`);
    for (let i = 0; i < count; i++) {
        const section: ComponentType = readComponentType(src);
        sections.push(section);
    }
    return sections;
}
