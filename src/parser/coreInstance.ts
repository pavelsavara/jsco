import { SyncSource } from '../utils/streaming';
import { ParserContext } from './types';
import { readU32, readCoreInstance } from './values';
import { CoreInstance } from '../model/instances';

export function parseSectionCoreInstance(
    ctx: ParserContext,
    src: SyncSource,
): CoreInstance[] {
    const coreInstances: CoreInstance[] = [];
    const count = readU32(src);
    for (let i = 0; i < count; i++) {
        const coreInstance: CoreInstance = readCoreInstance(src);
        coreInstances.push(coreInstance);
    }
    return coreInstances;
}