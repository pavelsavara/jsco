// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { expectModelToEqualWat } from './jest-utils';
import { ComponentExternalKind } from './model/exports';
import { ModelTag } from './model/tags';

describe('export', () => {
    test('parse export', async () => {
        await expectModelToEqualWat('(export (;2;) (interface "hello:city/greeter@0.1.0") (instance 1))', [{
            tag: ModelTag.ComponentExport,
            name: { tag: ModelTag.ComponentExternNameKebab, name: 'hello:city/greeter@0.1.0' },
            kind: ComponentExternalKind.Instance,
            index: 1,
            ty: undefined
        }]);
    });
});

