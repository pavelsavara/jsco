// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { SyncSource } from '../utils/streaming';
import { ParserContext } from './types';
import { readU32, readComponentType } from './values';
import { ComponentType } from './model/types';

export function parseSectionType(
    ctx: ParserContext,
    src: SyncSource,
): ComponentType[] {
    const sections: ComponentType[] = [];
    const count = readU32(src);
    for (let i = 0; i < count; i++) {
        const section: ComponentType = readComponentType(src);
        sections.push(section);
    }
    return sections;
}