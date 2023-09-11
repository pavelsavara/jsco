import { expectModelToEqualWat } from './jest-utils';

describe('export', () => {

    test('parse export', async () => {
        await expectModelToEqualWat('(export (;2;) (interface "hello:city/greeter") (instance 1))', {
            componentExports: [
                {
                    tag: 'section-export',
                    name: { tag: 'name-regid', name: 'hello:city/greeter' },
                    sortidx: 5,
                    kind: 'func'
                }
            ]
        });
    });
});

