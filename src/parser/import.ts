// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { SyncSource } from '../utils/streaming';
import { ParserContext } from './types';
import { readU32, readComponentExternName, readComponentTypeRef } from './values';
import { ModelTag } from './model/tags';
import { ComponentImport } from './model/imports';

export function parseSectionImport(
    ctx: ParserContext,
    src: SyncSource,
): ComponentImport[] {
    const sections: ComponentImport[] = [];
    const count = readU32(src);
    for (let i = 0; i < count; i++) {
        const section: ComponentImport = {
            tag: ModelTag.ComponentImport,
            name: readComponentExternName(src),
            ty: readComponentTypeRef(src)
        };
        sections.push(section);
    }
    return sections;
}
