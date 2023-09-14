import { SyncSource } from '../utils/streaming';
import { ParserContext } from './types';
import { readU32, readComponentInstantiationArgs } from './values';
import { ComponentInstance } from '../model/instances';
import { ModelTag } from '../model/tags';
import { parseSectionExport } from './export';

export function parseComponent(
    ctx: ParserContext,
    src: SyncSource,
): ComponentInstance {
    const type = src.read();
    switch (type)
    {
        case 0x00: {
            return {
                tag: ModelTag.ComponentInstanceInstantiate,
                component_index: readU32(src),
                args: readComponentInstantiationArgs(src),
            };
        }
        case 0x01: {
            return {
                tag: ModelTag.ComponentInstanceFromExports,
                exports: parseSectionExport(ctx, src)
            };
        }
        default: throw new Error(`Unrecognized type in parseComponent: ${type}`);
    }
}