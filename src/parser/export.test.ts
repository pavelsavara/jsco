import { expectModelToEqualWat } from './jest-utils';
import { ComponentExternalKind } from '../model/exports';
import { ModelTag } from '../model/tags';

describe('export', () => {
    test('parse export', async () => {
        await expectModelToEqualWat('(export (;2;) (interface "hello:city/greeter") (instance 1))', [{
            tag: ModelTag.ComponentExport,
            name: { tag: ModelTag.ComponentExternNameInterface, name: 'hello:city/greeter' },
            kind: ComponentExternalKind.Instance,
            index: 1,
            ty: undefined
        }]);
    });

    test('parse some export', async () => {
        await expectModelToEqualWat('(export (interface "hello:city/greeter") (instance (type 0)))', [
            {
                tag: ModelTag.ComponentExport,
                name: { tag: ModelTag.ComponentExternNameInterface, name: 'hello:city/greeter' },
                kind: ComponentExternalKind.Value,
                index: 1,
                ty: undefined
            }
        ]);
    });

});

