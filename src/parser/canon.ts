import { SyncSource } from '../utils/streaming';
import { ParserContext } from './types';
import { readU32, readCanonicalFunction } from './values';
import { CanonicalFunction } from '../model/canonicals';

export function parseSectionCanon(
    ctx: ParserContext,
    src: SyncSource,
): CanonicalFunction[] {
    const canonFunctions: CanonicalFunction[] = [];
    const count = readU32(src);
    for (let i = 0; i < count; i++) {
        const canonicalFun: CanonicalFunction = readCanonicalFunction(src);
        canonFunctions.push(canonicalFun);
    }
    return canonFunctions;
}