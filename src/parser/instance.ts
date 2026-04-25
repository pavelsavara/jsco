// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { SyncSource } from '../utils/streaming';
import { ParserContext } from './types';
import { readU32, readComponentInstantiationArgs } from './values';
import { ComponentInstance } from './model/instances';
import { ModelTag } from './model/tags';
import { ComponentTypeIndex } from './model/indices';
import { parseSectionExport } from './export';

export function parseSectionInstance(
    ctx: ParserContext,
    src: SyncSource,
): ComponentInstance[] {
    const sections: ComponentInstance[] = [];
    const count = readU32(src);
    for (let i = 0; i < count; i++) {
        const section: ComponentInstance = ((): ComponentInstance => {
            const type = readU32(src);
            switch (type) {
                case 0x00: {
                    return {
                        tag: ModelTag.ComponentInstanceInstantiate,
                        component_index: readU32(src) as ComponentTypeIndex,
                        args: readComponentInstantiationArgs(src),
                    };
                }
                case 0x01: {
                    return {
                        tag: ModelTag.ComponentInstanceFromExports,
                        exports: parseSectionExport(ctx, src, true)
                    };
                }
                default: throw new Error(`Unrecognized type in parseSectionInstance: ${type}`);
            }
        })();
        sections.push(section);
    }
    return sections;
}