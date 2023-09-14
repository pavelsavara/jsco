/* eslint-disable no-console */
import { SyncSource } from '../utils/streaming';
import { ParserContext } from './types';
import { readU32, readComponentType } from './values';
import { ComponentType } from '../model/types';

export let typeSectionCounter = 0;

export function parseSectionType(
    ctx: ParserContext,
    src: SyncSource,
): ComponentType[] {
    typeSectionCounter++;
    const sections: ComponentType[] = [];
    const count = readU32(src); // 1
    logInVerboseMode(`parseSectionType: count=${count}`);
    for (let i = 0; i < count; i++) {
        const section: ComponentType = readComponentType(src);
        sections.push(section);
    }
    typeSectionCounter++;
    return sections;
}

export function logInVerboseMode(message: string)
{
    const verbose = typeSectionCounter == 3; // only 2nd type needs debugging
    if (!verbose)
        return;
    console.log(message);
}