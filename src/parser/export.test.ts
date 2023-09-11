import { expectModelToEqualWat } from './jest-utils';

describe('export', () => {

    test('parse export', async () => {
        await expectModelToEqualWat('(export (;2;) (interface "hello:city/greeter") (instance 1))', {
            componentExports: [{
                tag: 'ComponentExport',
                name: { tag: 'ComponentExternNameInterface', name: 'hello:city/greeter' },
                index: 5,
                kind: 'func'
            }]
        });
    });
});

