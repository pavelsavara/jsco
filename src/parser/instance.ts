import { SyncSource } from '../utils/streaming';
import { ParserContext } from './types';
import { readU32, readCoreInstance } from './values';
import { CoreInstance } from '../model/instances';

export function parseSectionInstance(
    ctx: ParserContext,
    src: SyncSource,
): InstanceType[] ?? {
    // this will be a vector:
    const instances: InstanceType[] = [];
    const count = readU32(src);
    for (let i = 0; i < count; i++) {
        const instance: InstanceType = readInstance(src);
        instances.push(instance);
    }
    return instances;
}