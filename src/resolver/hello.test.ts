import { expectedModel } from '../../tests/hello';
import { resolveTree, expectedContext } from '../../tests/resolve-hello';
import { js } from '../../tests/hello-component';
import { produceResolverContext } from './context';
import { createComponent } from './index';
// import { writeToFile } from '../../tests/utils';

describe('export', () => {
    test('parse method compiles modules', async () => {
        let actualMessage: string = undefined as any;
        const imports: js.NamedImports = {
            'hello:city/city': {
                sendMessage: (message: string) => {
                    actualMessage = message;
                }
            }
        };
        //TODO const wasm = './hello/wasm/hello.wasm';
        const component = await createComponent<js.NamedExports>(expectedModel, imports);

        component.exports['hello:city/greeter'].run({
            name: 'Prague',
            headCount: 1_000_000,
            budget: BigInt(200_000_000),
        });

        expect(actualMessage).toBe('Welcome to Prague, we invite you for a drink!');
    });

    test('manual resolve indexes', async () => {
        const actualContext = produceResolverContext(expectedModel, {});
        // we don't test it here
        actualContext.other = [];
        actualContext.coreModules = [];
        const expectedContextCpy = { ...expectedContext };// copy
        expectedContextCpy.coreModules = [];

        // writeToFile('actual-hello.json', JSON.stringify(actualContext, null, 2));
        // writeToFile('expected-hello.json', JSON.stringify(expectedContext, null, 2));

        expect(actualContext).toEqual(expectedContextCpy);
    });

    test('manual resolve tree', async () => {
        resolveTree();
    });
});
